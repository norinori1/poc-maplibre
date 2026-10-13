import { decodeGsiElevation } from './decode';
import { TILE_SIZE, type DemLevel } from './config';
import type { TileLoader, TileResult } from './sampler';
import { tileUrl, type TileCoord } from './tiles';

// 取得済み(成功・提供範囲外)の結果と、取得中の Promise を共有する。通信エラーは次回再試行できるよう保持しない。
const settled = new Map<string, TileResult>();
const inflight = new Map<string, Promise<TileResult>>();

async function fetchTile(level: DemLevel, tile: TileCoord): Promise<TileResult> {
  try {
    const response = await fetch(tileUrl(level.urlTemplate, tile));
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) return { status: 'error', error: new Error(`HTTP ${response.status}`) };
    // 色空間変換とα乗算を無効化し、RGBの値をそのまま読む。
    const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas is not available');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data: rgba } = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
    const data = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let i = 0; i < data.length; i++) {
      data[i] = decodeGsiElevation(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!) ?? NaN;
    }
    return { status: 'ok', data };
  } catch (error) {
    return { status: 'error', error };
  }
}

export const loadDemTile: TileLoader = (level, tile) => {
  const key = `${level.zoom}/${tile.x}/${tile.y}/${level.urlTemplate}`;
  const cached = settled.get(key);
  if (cached) return Promise.resolve(cached);
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchTile(level, tile).then((result) => {
      if (result.status !== 'error') settled.set(key, result);
      inflight.delete(key);
      return result;
    });
    inflight.set(key, pending);
  }
  return pending;
};
