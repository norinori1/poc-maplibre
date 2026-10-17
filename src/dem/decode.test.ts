import { describe, expect, it } from 'vitest';
import { decodeGsiElevation, decodeTerrariumElevation } from './decode';

describe('Terrarium', () => {
  it('decodes zero, positive, negative and fractional elevations', () => {
    expect(decodeTerrariumElevation(128, 0, 0)).toBe(0);
    expect(decodeTerrariumElevation(128, 100, 128)).toBe(100.5);
    expect(decodeTerrariumElevation(127, 255, 192)).toBe(-0.25);
    expect(decodeTerrariumElevation(127, 156, 0)).toBe(-100);
  });
});

describe('decodeGsiElevation', () => {
  it('x = 2^16R + 2^8G + B を 0.01m 単位で換算する', () => {
    expect(decodeGsiElevation(0, 0, 0)).toBe(0);
    expect(decodeGsiElevation(0, 3, 232)).toBeCloseTo(10); // 1000 → 10.00 m
    expect(decodeGsiElevation(0, 1, 44)).toBeCloseTo(3); // 300 → 3.00 m
  });
  it('(128,0,0) は欠測で null。0 m にしない', () => expect(decodeGsiElevation(128, 0, 0)).toBeNull());
  it('2^23 を超える値は負の標高', () => {
    expect(decodeGsiElevation(255, 255, 255)).toBeCloseTo(-0.01);
    expect(decodeGsiElevation(255, 255, 156)).toBeCloseTo(-1); // x = 2^24 - 100
  });
});
