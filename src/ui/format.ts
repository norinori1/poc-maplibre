// 表示用の整形。標高が null(取得できない)のときは呼び出し側で別文言にする。
export const UNAVAILABLE = '取得できません';

export function formatElevation(m: number): string {
  return `${m.toFixed(1)} m`;
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/** 正=上り、負=下り を符号で明示する。 */
export function formatSigned(value: number, unit: string, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
  return `${sign}${Math.abs(rounded).toFixed(digits)} ${unit}`;
}

export function formatGrade(percent: number | null, tooShortMessage = '距離が短いため計算しません'): string {
  if (percent === null) return tooShortMessage;
  const text = formatSigned(percent, '%');
  return percent > 0.05 ? `${text}(上り)` : percent < -0.05 ? `${text}(下り)` : `${text}(ほぼ平坦)`;
}

export function formatCoordinate(lng: number, lat: number): string {
  return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
}
