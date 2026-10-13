import type { DemLevel } from './config';
import { TILE_SIZE } from './config';
import { globalPixelToTile, lngLatToGlobalPixel, type TileCoord } from './tiles';

/** タイル1枚分の標高(m)。欠測画素は NaN。 */
export type TileData = Float32Array;
export type TileResult =
  | { status: 'ok'; data: TileData }
  | { status: 'missing' } // 404: 提供範囲外
  | { status: 'error'; error: unknown };

export type TileLoader = (level: DemLevel, tile: TileCoord) => Promise<TileResult>;

export type ElevationResult =
  | { status: 'ok'; elevation: number; levelLabel: string }
  | { status: 'out-of-range' } // どの解像度のタイルも提供されていない(海上・国外など)
  | { status: 'nodata' } // タイルはあるがその地点が欠測
  | { status: 'error'; error: unknown };

type PixelValue = { kind: 'value'; value: number } | { kind: 'nodata' } | { kind: 'missing' } | { kind: 'error'; error: unknown };

async function readPixel(load: TileLoader, level: DemLevel, gx: number, gy: number): Promise<PixelValue> {
  const located = globalPixelToTile(gx, gy, level.zoom);
  if (!located) return { kind: 'missing' };
  const result = await load(level, located.tile);
  if (result.status === 'missing') return { kind: 'missing' };
  if (result.status === 'error') return { kind: 'error', error: result.error };
  const value = result.data[located.row * TILE_SIZE + located.col];
  return Number.isNaN(value) ? { kind: 'nodata' } : { kind: 'value', value };
}

/** 画素中心を基準にした双線形補間。4画素が揃わない縁では中心画素の値にフォールバックする。 */
async function sampleLevel(load: TileLoader, level: DemLevel, lng: number, lat: number): Promise<PixelValue> {
  const { x, y } = lngLatToGlobalPixel(lng, lat, level.zoom);
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
export function createElevationSampler(levels: readonly DemLevel[], load: TileLoader) {
  return async function getElevation(lng: number, lat: number): Promise<ElevationResult> {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { status: 'out-of-range' };
    let sawNoData = false;
    for (const level of levels) {
      const pixel = await sampleLevel(load, level, lng, lat);
      if (pixel.kind === 'value') return { status: 'ok', elevation: pixel.value, levelLabel: level.label };
      if (pixel.kind === 'error') return { status: 'error', error: pixel.error };
      if (pixel.kind === 'nodata') sawNoData = true;
    }
    return sawNoData ? { status: 'nodata' } : { status: 'out-of-range' };
  };
}
