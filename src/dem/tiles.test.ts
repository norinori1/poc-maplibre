import { describe, expect, it } from 'vitest';
import { globalPixelToTile, lngLatToGlobalPixel, tileUrl } from './tiles';

describe('lngLatToGlobalPixel / globalPixelToTile', () => {
  it('512px doubles global pixels without changing the geographic tile', () => {
    const small = lngLatToGlobalPixel(139.7647, 35.6812, 14, 256);
    const large = lngLatToGlobalPixel(139.7647, 35.6812, 14, 512);
    expect(large.x).toBe(small.x * 2);
    expect(large.y).toBe(small.y * 2);
    expect(globalPixelToTile(Math.floor(large.x), Math.floor(large.y), 14, 512)!.tile)
      .toEqual(globalPixelToTile(Math.floor(small.x), Math.floor(small.y), 14, 256)!.tile);
    expect(globalPixelToTile(512, 512, 2, 512)).toMatchObject({ tile: { x: 1, y: 1 }, col: 0, row: 0 });
  });
  it('東京駅付近(z14)は GSI タイル 14/14552/6451 に入る', () => {
    const { x, y } = lngLatToGlobalPixel(139.7647, 35.6812, 14);
    const located = globalPixelToTile(Math.floor(x), Math.floor(y), 14)!;
    expect(located.tile).toEqual({ z: 14, x: 14552, y: 6451 });
    expect(located.col).toBeGreaterThanOrEqual(0);
    expect(located.col).toBeLessThan(256);
  });
  it('原点(経度-180, 北緯85.05)は画素(0,0)', () => {
    const { x, y } = lngLatToGlobalPixel(-180, 85.0511287798, 3);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0, 3);
  });
  it('経度方向は折り返し、緯度方向の範囲外は null', () => {
    expect(globalPixelToTile(-1, 10, 2)!.tile.x).toBe(3);
    expect(globalPixelToTile(1024, 10, 2)!.tile.x).toBe(0);
    expect(globalPixelToTile(10, -1, 2)).toBeNull();
    expect(globalPixelToTile(10, 1024, 2)).toBeNull();
  });
});

describe('tileUrl', () => {
  it('プレースホルダを置換する', () => {
    expect(tileUrl('https://example.test/{z}/{x}/{y}.png', { z: 14, x: 1, y: 2 })).toBe('https://example.test/14/1/2.png');
  });
});
