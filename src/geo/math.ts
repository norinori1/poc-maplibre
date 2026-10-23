const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export type LngLat = readonly [number, number];

/** 緯度経度から求める大円距離(m)。ピクセル距離ではない。 */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 折れ線に沿った長さ(m)。 */
export function pathLengthMeters(line: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversineMeters(line[i - 1]!, line[i]!);
  return total;
}

/** これ未満の水平距離では勾配を計算しない(DEM解像度に対して意味を持たないため)。 */
export const MIN_GRADE_DISTANCE_M = 5;

/** 平均勾配(%) = 高低差 / 水平距離 × 100。極短距離・不正値は null。 */
export function averageGradePercent(deltaElevationM: number, distanceM: number): number | null {
  if (!Number.isFinite(deltaElevationM) || !Number.isFinite(distanceM) || distanceM < MIN_GRADE_DISTANCE_M) return null;
  return (deltaElevationM / distanceM) * 100;
}

/** a→b を t(0〜1)で線形補間した座標。数十m程度の区間では十分な近似。 */
export function interpolate(a: LngLat, b: LngLat, t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
