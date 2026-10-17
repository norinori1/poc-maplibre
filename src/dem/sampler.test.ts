import { describe, expect, it } from 'vitest';
import type { DemLevel } from './config';
import { createElevationSampler, type TileLoader, type TileResult } from './sampler';
import { lngLatToGlobalPixel } from './tiles';
import { GSI_PROVIDER, MAPTERHORN_PROVIDER } from './config';

const hi: DemLevel = { label: '5m', zoom: 15, urlTemplate: 'hi/{z}/{x}/{y}' };
const lo: DemLevel = { label: '10m', zoom: 14, urlTemplate: 'lo/{z}/{x}/{y}' };

// 画素の値 = 画素の列番号(0〜255)の平坦なタイルを作る。fill が NaN なら全面欠測。
const gradientTile = (fill?: number): TileResult => {
  const data = new Float32Array(256 * 256);
  for (let i = 0; i < data.length; i++) data[i] = fill ?? i % 256;
  return { status: 'ok', data };
};

const loaderOf = (handlers: Record<string, TileResult>): TileLoader => async (level) =>
  handlers[level.label] ?? { status: 'missing' };

describe('createElevationSampler', () => {
  it('Mapterhorn 404 never requests GSI or a different zoom', async () => {
    const calls: DemLevel[] = [];
    const get = createElevationSampler(MAPTERHORN_PROVIDER, async (level) => {
      calls.push(level); return { status: 'missing' };
    });
    expect(await get(139.76, 35.68)).toEqual({ status: 'out-of-range' });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((l) => l.providerId === 'mapterhorn' && l.zoom === 16)).toBe(true);
  });
  it('preserves provider identity and does not hide network errors behind fallback', async () => {
    const calls: string[] = [];
    const get = createElevationSampler(GSI_PROVIDER, async (level) => {
      calls.push(level.label);
      return { status: 'error', kind: 'http', httpStatus: 503, error: 'unavailable' };
    });
    expect(await get(139.76, 35.68)).toMatchObject({ status: 'error', kind: 'http', httpStatus: 503 });
    expect(new Set(calls)).toEqual(new Set([GSI_PROVIDER.levels[0]!.label]));
    const success = createElevationSampler(GSI_PROVIDER, async () => gradientTile(5));
    expect(await success(139.76, 35.68)).toMatchObject({ status: 'ok', providerId: 'gsi', elevation: 5 });
  });
  for (const tileSize of [256, 512] as const) {
    it(`interpolates across four ${tileSize}px tiles at their shared corner`, async () => {
      const get = createElevationSampler([{ ...lo, zoom: 1, tileSize }], async (_, tile) => ({
        status: 'ok', data: new Float32Array(tileSize ** 2).fill(tile.x * 10 + tile.y * 20),
      }));
      // (0°, 0°) lies on both tile boundaries; each corner has weight 1/4.
      expect(await get(0, 0)).toMatchObject({ status: 'ok', elevation: 15 });
    });
  }
  const lng = 139.7647;
  const lat = 35.6812;

  it('解像度の高いレベルを優先し、使ったレベルを返す', async () => {
    const get = createElevationSampler([hi, lo], loaderOf({ '5m': gradientTile(12), '10m': gradientTile(99) }));
    expect(await get(lng, lat)).toEqual({ status: 'ok', elevation: 12, levelLabel: '5m' });
  });

  it('高解像度が提供範囲外(404)なら低解像度へフォールバックする', async () => {
    const get = createElevationSampler([hi, lo], loaderOf({ '10m': gradientTile(7) }));
    expect(await get(lng, lat)).toEqual({ status: 'ok', elevation: 7, levelLabel: '10m' });
  });

  it('高解像度が欠測(NaN)でも低解像度の値を使う', async () => {
    const get = createElevationSampler([hi, lo], loaderOf({ '5m': gradientTile(NaN), '10m': gradientTile(7) }));
    expect(await get(lng, lat)).toMatchObject({ status: 'ok', elevation: 7 });
  });

  it('全レベルが404なら範囲外', async () => {
    const get = createElevationSampler([hi, lo], loaderOf({}));
    expect(await get(lng, lat)).toEqual({ status: 'out-of-range' });
  });

  it('タイルはあるが全面欠測なら nodata(0 mにしない)', async () => {
    const get = createElevationSampler([lo], loaderOf({ '10m': gradientTile(NaN) }));
    expect(await get(lng, lat)).toEqual({ status: 'nodata' });
  });

  it('通信エラーは error として返す', async () => {
    const boom = new Error('network');
    const get = createElevationSampler([lo], loaderOf({ '10m': { status: 'error', error: boom } }));
    expect(await get(lng, lat)).toEqual({ status: 'error', error: boom });
  });

  it('不正な座標は範囲外', async () => {
    const get = createElevationSampler([lo], loaderOf({ '10m': gradientTile(1) }));
    expect(await get(NaN, lat)).toEqual({ status: 'out-of-range' });
  });

  it('双線形補間: 列方向に1ずつ増えるタイルで画素中心間を線形に補間する', async () => {
    const get = createElevationSampler([lo], loaderOf({ '10m': gradientTile() }));
    const { x } = lngLatToGlobalPixel(lng, lat, lo.zoom);
    const result = await get(lng, lat);
    const col = ((x % 256) + 256) % 256; // タイル内の小数列。画素中心は +0.5
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.elevation).toBeCloseTo(col - 0.5, 3);
  });
});
