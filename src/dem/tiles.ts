
export interface TileCoord { z: number; x: number; y: number }

const MAX_LAT = 85.0511287798;

/** Webメルカトルの全域ピクセル座標(小数)。zoom でのタイル×TILE_SIZE の座標系。 */
export function lngLatToGlobalPixel(lng: number, lat: number, zoom: number, tileSize = 256): { x: number; y: number } {
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const scale = 2 ** zoom * tileSize;
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** 全域ピクセル(整数)が属するタイルとタイル内の画素位置。経度方向は折り返し、緯度範囲外は null。 */
export function globalPixelToTile(px: number, py: number, zoom: number, tileSize = 256): { tile: TileCoord; col: number; row: number } | null {
  const tiles = 2 ** zoom;
  const ty = Math.floor(py / tileSize);
  if (ty < 0 || ty >= tiles) return null;
  const tx = ((Math.floor(px / tileSize) % tiles) + tiles) % tiles;
  return {
    tile: { z: zoom, x: tx, y: ty },
    col: ((px % tileSize) + tileSize) % tileSize,
    row: py - ty * tileSize,
  };
}

export function tileUrl(template: string, tile: TileCoord): string {
  return template.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
}
