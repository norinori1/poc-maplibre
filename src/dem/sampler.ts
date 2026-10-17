import type { DemLevel, DemProvider } from './config';
import { globalPixelToTile, lngLatToGlobalPixel, type TileCoord } from './tiles';

/** タイル1枚分の標高(m)。欠測画素は NaN。 */
export type TileData = Float32Array;
export type TileResult =
  | { status: 'ok'; data: TileData }
  | { status: 'missing' } // 404: 提供範囲外
  | { status: 'error'; error: unknown; kind?: 'network' | 'http' | 'decode'; httpStatus?: number };

export type TileLoader = (level: DemLevel, tile: TileCoord) => Promise<TileResult>;

export type ElevationResult =
  | { status: 'ok'; elevation: number; levelLabel: string; providerId?: string }
  | { status: 'out-of-range' } // どの解像度のタイルも提供されていない(海上・国外など)
  | { status: 'nodata' } // タイルはあるがその地点が欠測
  | { status: 'error'; error: unknown; kind?: 'network' | 'http' | 'decode'; httpStatus?: number };

type PixelValue = { kind: 'value'; value: number } | { kind: 'nodata' } | { kind: 'missing' } | { kind: 'error'; error: unknown; result?: Extract<TileResult, { status: 'error' }> };

async function readPixel(load: TileLoader, level: DemLevel, gx: number, gy: number): Promise<PixelValue> {
  const tileSize = level.tileSize ?? 256;
  const located = globalPixelToTile(gx, gy, level.zoom, tileSize);
  if (!located) return { kind: 'missing' };
  const result = await load(level, located.tile);
  if (result.status === 'missing') return { kind: 'missing' };
  if (result.status === 'error') return { kind: 'error', error: result.error, result };
  const value = result.data[located.row * tileSize + located.col];
  return value === undefined || !Number.isFinite(value) ? { kind: 'nodata' } : { kind: 'value', value };
}

/** 画素中心を基準にした双線形補間。4画素が揃わない縁では中心画素の値にフォールバックする。 */
async function sampleLevel(load: TileLoader, level: DemLevel, lng: number, lat: number): Promise<PixelValue> {
  const { x, y } = lngLatToGlobalPixel(lng, lat, level.zoom, level.tileSize ?? 256);
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const corners = await Promise.all([
    readPixel(load, level, x0, y0), readPixel(load, level, x0 + 1, y0),
    readPixel(load, level, x0, y0 + 1), readPixel(load, level, x0 + 1, y0 + 1),
  ]);
  const failed = corners.find((c) => c.kind === 'error');
  if (failed) return failed;
  const [a, b, c, d] = corners;
  if (a?.kind === 'value' && b?.kind === 'value' && c?.kind === 'value' && d?.kind === 'value') {
    return { kind: 'value', value: (a.value * (1 - tx) + b.value * tx) * (1 - ty) + (c.value * (1 - tx) + d.value * tx) * ty };
  }
  return readPixel(load, level, Math.floor(x), Math.floor(y));
}

/** 解像度の高い順にレベルを試す。欠測・提供範囲外は次のレベルへ進む。 */
export function createElevationSampler(config: readonly DemLevel[] | DemProvider, load: TileLoader) {
  const provider = 'id' in config ? config : undefined;
  const levels = provider ? provider.levels.map((level) => ({ ...level, providerId: provider.id })) : config as readonly DemLevel[];
  return async function getElevation(lng: number, lat: number): Promise<ElevationResult> {
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 85.0511287798) return { status: 'out-of-range' };
    const wrappedLng = ((lng + 180) % 360 + 360) % 360 - 180;
    if (provider && (wrappedLng < provider.bounds[0] || wrappedLng > provider.bounds[2]
      || lat < provider.bounds[1] || lat > provider.bounds[3])) return { status: 'out-of-range' };
    let sawNoData = false;
    for (const level of levels) {
      const pixel = await sampleLevel(load, level, lng, lat);
      if (pixel.kind === 'value') return { status: 'ok', elevation: pixel.value, levelLabel: level.label, ...(provider ? { providerId: provider.id } : {}) };
      if (pixel.kind === 'error') return pixel.result ?? { status: 'error', error: pixel.error };
      if (pixel.kind === 'nodata') sawNoData = true;
      if (provider && !provider.fallback.includes(pixel.kind)) break;
    }
    return sawNoData ? { status: 'nodata' } : { status: 'out-of-range' };
  };
}
