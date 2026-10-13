import { describe, expect, it } from 'vitest';
import { formatDistance, formatElevation, formatGrade, formatSigned } from './format';

describe('format', () => {
  it('標高は小数1桁', () => expect(formatElevation(12.34)).toBe('12.3 m'));
  it('0 m は 0 m と表示する(欠測と区別できる)', () => expect(formatElevation(0)).toBe('0.0 m'));
  it('距離は1km未満はm、以上はkm', () => {
    expect(formatDistance(345.4)).toBe('345 m');
    expect(formatDistance(1234)).toBe('1.23 km');
  });
  it('符号: 上り+、下り−、ゼロ±', () => {
    expect(formatSigned(3.14, 'm')).toBe('+3.1 m');
    expect(formatSigned(-3.14, 'm')).toBe('−3.1 m');
    expect(formatSigned(0.01, 'm')).toBe('±0.0 m');
  });
  it('勾配', () => {
    expect(formatGrade(4.64)).toBe('+4.6 %(上り)');
    expect(formatGrade(-2)).toBe('−2.0 %(下り)');
    expect(formatGrade(0)).toBe('±0.0 %(ほぼ平坦)');
    expect(formatGrade(null)).toBe('距離が短いため計算しません');
  });
});
