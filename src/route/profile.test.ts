import { describe, expect, it } from 'vitest';
import type { ElevationResult } from '../dem/sampler';
import { haversineMeters } from '../geo/math';
import { buildRouteProfile, cumulativeAscentDescent, sampleRoutePoints, summarizeProfile, type ProfilePoint } from './profile';

const line = [[139.76, 35.68], [139.762, 35.68], [139.762, 35.682]];

describe('sampleRoutePoints', () => {
  it('頂点ではなく等間隔で取り、始点と終点を含む', () => {
    const points = sampleRoutePoints(line, 20);
    const total = haversineMeters([139.76, 35.68], [139.762, 35.68]) + haversineMeters([139.762, 35.68], [139.762, 35.682]);
    expect(points.length).toBeGreaterThan(line.length);
    expect(points[0]).toMatchObject({ distance: 0, lng: 139.76, lat: 35.68 });
    expect(points.at(-1)!.distance).toBeCloseTo(total, 3);
    expect(points.at(-1)).toMatchObject({ lng: 139.762, lat: 35.682 });
    for (let i = 1; i < points.length - 1; i++) expect(points[i]!.distance - points[i - 1]!.distance).toBeCloseTo(20, 3);
  });
  it('空・1点・不正座標・距離0は空配列', () => {
    expect(sampleRoutePoints([], 20)).toEqual([]);
    expect(sampleRoutePoints([[139, 35]], 20)).toEqual([]);
    expect(sampleRoutePoints([[139, 35], [139, 35]], 20)).toEqual([]);
    expect(sampleRoutePoints([[NaN, 35], [139, 35]], 20)).toEqual([]);
    expect(sampleRoutePoints(null, 20)).toEqual([]);
    expect(sampleRoutePoints('x', 20)).toEqual([]);
    expect(sampleRoutePoints(line, 0)).toEqual([]);
  });
  it('長いルートでも点数に上限がある', () => {
    expect(sampleRoutePoints([[130, 35], [140, 36]], 20).length).toBeLessThanOrEqual(400);
  });
});

describe('cumulativeAscentDescent', () => {
  it('登って下る', () => {
    expect(cumulativeAscentDescent([0, 5, 10, 6, 2])).toEqual({ ascent: 10, descent: 8 });
  });
  it('閾値未満の揺れは数えない', () => {
    expect(cumulativeAscentDescent([10, 10.4, 9.8, 10.3, 9.9, 10.2], 1)).toEqual({ ascent: 0, descent: 0 });
  });
  it('平地(定数)は0', () => expect(cumulativeAscentDescent([3, 3, 3, 3])).toEqual({ ascent: 0, descent: 0 }));
  it('空配列', () => expect(cumulativeAscentDescent([])).toEqual({ ascent: 0, descent: 0 }));
});

const pt = (distance: number, elevation: number | null): ProfilePoint => ({ distance, lng: 0, lat: 0, elevation });

describe('summarizeProfile', () => {
  it('一定の5%上り(200m)では平均・最大勾配とも5%付近', () => {
    const points = Array.from({ length: 11 }, (_, i) => pt(i * 20, i * 1));
    const s = summarizeProfile(points);
    expect(s.totalDistance).toBe(200);
    expect(s.ascent).toBeCloseTo(10);
    expect(s.descent).toBe(0);
    expect(s.netGradePercent).toBeCloseTo(5);
    expect(s.steepestUphillPercent).toBeCloseTo(5);
    expect(s.steepestDownhillPercent).toBeCloseTo(5);
    expect(s.minElevation).toBe(0);
    expect(s.maxElevation).toBe(10);
  });
  it('下りは負の勾配', () => {
    const s = summarizeProfile(Array.from({ length: 11 }, (_, i) => pt(i * 20, 10 - i)));
    expect(s.netGradePercent).toBeCloseTo(-5);
    expect(s.descent).toBeCloseTo(10);
  });
  it('欠測点は飛ばして集計し、件数を返す', () => {
    const s = summarizeProfile([pt(0, 0), pt(20, null), pt(40, 2), pt(60, null), pt(80, 4)]);
    expect(s.validCount).toBe(3);
    expect(s.missingCount).toBe(2);
    expect(s.ascent).toBeCloseTo(4);
    expect(s.netGradePercent).toBeCloseTo(5);
  });
  it('全点欠測・空は null を返し例外を出さない', () => {
    const s = summarizeProfile([pt(0, null), pt(20, null)]);
    expect(s).toMatchObject({ netGradePercent: null, minElevation: null, maxElevation: null, ascent: 0, validCount: 0 });
    expect(summarizeProfile([]).totalDistance).toBe(0);
  });
});

describe('buildRouteProfile', () => {
  const ok = (elevation: number): ElevationResult => ({ status: 'ok', elevation, levelLabel: '10m' });

  it('標高関数の結果から累積距離つきプロファイルを作る', async () => {
    const result = await buildRouteProfile(line, async (lng, lat) => ok((lat - 35.68) * 10000));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.points.at(-1)!.elevation).toBeCloseTo(20);
      expect(result.summary.ascent).toBeCloseTo(20, 0);
      expect(result.levelLabels).toEqual(['10m']);
    }
  });
  it('一部がエラー/範囲外でも集計できる', async () => {
    let n = 0;
    const result = await buildRouteProfile(line, async () => (n++ % 2 ? { status: 'error', error: 1 } : ok(5)));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.summary.missingCount).toBeGreaterThan(0);
    }
  });
  it('不正ルートは invalid', async () => {
    expect(await buildRouteProfile([], async () => ok(0))).toEqual({ status: 'invalid' });
  });
  it('中断されたら cancelled', async () => {
    const controller = new AbortController();
    const result = await buildRouteProfile(line, async () => { controller.abort(); return ok(0); }, { signal: controller.signal });
    expect(result).toEqual({ status: 'cancelled' });
  });
});
