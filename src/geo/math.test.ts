import { describe, expect, it } from 'vitest';
import { averageGradePercent, haversineMeters, interpolate, pathLengthMeters } from './math';

describe('pathLengthMeters', () => {
  it('点が2つ未満は0', () => {
    expect(pathLengthMeters([])).toBe(0);
    expect(pathLengthMeters([[139.76, 35.68]])).toBe(0);
  });
  it('寄り道すると直線より長く、各区間の和になる', () => {
    const a = [139.76, 35.68] as const;
    const via = [139.761, 35.68] as const;
    const b = [139.761, 35.681] as const;
    expect(pathLengthMeters([a, via, b])).toBeCloseTo(haversineMeters(a, via) + haversineMeters(via, b), 6);
    expect(pathLengthMeters([a, via, b])).toBeGreaterThan(haversineMeters(a, b));
  });
});

describe('haversineMeters', () => {
  it('同一点は0', () => expect(haversineMeters([139.76, 35.68], [139.76, 35.68])).toBe(0));
  it('緯度1度は約111.2km', () => expect(haversineMeters([139, 35], [139, 36])).toBeCloseTo(111195, -2));
  it('経度は緯度で縮む(北緯35.68°で0.001度≒90.5m)', () => {
    expect(haversineMeters([139.76, 35.68], [139.761, 35.68])).toBeCloseTo(90.5, 0);
  });
});

describe('averageGradePercent', () => {
  it('上りは正、下りは負', () => {
    expect(averageGradePercent(10, 200)).toBeCloseTo(5);
    expect(averageGradePercent(-10, 200)).toBeCloseTo(-5);
  });
  it('距離0・極短距離・不正値は計算しない', () => {
    expect(averageGradePercent(1, 0)).toBeNull();
    expect(averageGradePercent(1, 4.9)).toBeNull();
    expect(averageGradePercent(NaN, 100)).toBeNull();
    expect(averageGradePercent(1, Infinity)).toBeNull();
  });
  it('高低差0は0%(平地)', () => expect(averageGradePercent(0, 100)).toBe(0));
});

describe('interpolate', () => {
  it('中点', () => expect(interpolate([0, 0], [2, 4], 0.5)).toEqual([1, 2]));
});
