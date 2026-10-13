import { TILE_SIZE } from './config';

export interface TileCoord { z: number; x: number; y: number }

const MAX_LAT = 85.0511287798;

/** Webメルカトルの全域ピクセル座標(小数)。zoom でのタイル×TILE_SIZE の座標系。 */
export function lngLatToGlobalPixel(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const scale = 2 ** zoom * TILE_SIZE;
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** 全域ピクセル(整数)が属するタイルとタイル内の画素位置。経度方向は折り返し、緯度範囲外は null。 */
export function globalPixelToTile(px: number, py: number, zoom: number): { tile: TileCoord; col: number; row: number } | null {
  const tiles = 2 ** zoom;
  const ty = Math.floor(py / TILE_SIZE);
  if (ty < 0 || ty >= tiles) return null;
  const tx = ((Math.floor(px / TILE_SIZE) % tiles) + tiles) % tiles;
  return {
    tile: { z: zoom, x: tx, y: ty },
    col: ((px % TILE_SIZE) + TILE_SIZE) % TILE_SIZE,
    row: py - ty * TILE_SIZE,
  };
}

export function tileUrl(template: string, tile: TileCoord): string {
  return template.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
}
