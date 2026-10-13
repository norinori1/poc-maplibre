import { averageGradePercent, haversineMeters, interpolate, type LngLat } from '../geo/math';
import type { ElevationResult } from '../dem/sampler';

export interface RoutePoint { distance: number; lng: number; lat: number }
export interface ProfilePoint extends RoutePoint { elevation: number | null }

export interface ProfileSummary {
  totalDistance: number;
  /** 上昇量・下降量(m)。最小上昇量の閾値でDEMの細かな揺れを除いた推定値。 */
  ascent: number;
  descent: number;
  minElevation: number | null;
  maxElevation: number | null;
  /** 始点→終点の平均勾配(%)。標高が欠けている・距離が短い場合は null。 */
  netGradePercent: number | null;
  /** 約100m区間の平均勾配で最大の上り(%)・最大の下り(%)。 */
  steepestUphillPercent: number | null;
  steepestDownhillPercent: number | null;
  validCount: number;
  missingCount: number;
}

export const DEFAULT_SPACING_M = 20;
export const MAX_POINTS = 400;
/** この高さ未満の上下動は上昇量・下降量に数えない。5〜10mメッシュの揺れを想定。 */
export const MIN_RISE_M = 1;
export const GRADE_WINDOW_M = 100;

function isLngLat(value: unknown): value is LngLat {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

/** 線に沿って等間隔(最大 MAX_POINTS 点)に点を取る。頂点だけを拾うのではなく、終点は必ず含める。 */
export function sampleRoutePoints(coordinates: unknown, spacingM = DEFAULT_SPACING_M): RoutePoint[] {
  if (!Array.isArray(coordinates)) return [];
  const line = (coordinates as unknown[]).filter(isLngLat);
  if (line.length < 2 || !(spacingM > 0)) return [];

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const length = haversineMeters(line[i - 1]!, line[i]!);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) return [];

  const step = Math.max(spacingM, total / (MAX_POINTS - 1));
  const points: RoutePoint[] = [{ distance: 0, lng: line[0]![0], lat: line[0]![1] }];
  let segmentStart = 0;
  let next = step;
  for (let i = 0; i < lengths.length; i++) {
    const segmentEnd = segmentStart + lengths[i]!;
    while (next < segmentEnd - 1e-6 && points.length < MAX_POINTS - 1) {
      const t = (next - segmentStart) / lengths[i]!;
      const [lng, lat] = interpolate(line[i]!, line[i + 1]!, t);
      points.push({ distance: next, lng, lat });
      next += step;
    }
    segmentStart = segmentEnd;
  }
  const last = line[line.length - 1]!;
  points.push({ distance: total, lng: last[0], lat: last[1] });
  return points;
}

/** 起点からの変化が threshold 以上になった分だけを上昇量・下降量に加える(ヒステリシス)。 */
export function cumulativeAscentDescent(elevations: readonly number[], threshold = MIN_RISE_M): { ascent: number; descent: number } {
  if (elevations.length === 0) return { ascent: 0, descent: 0 };
  let anchor = elevations[0]!;
  let ascent = 0;
  let descent = 0;
  for (const elevation of elevations) {
    if (elevation - anchor >= threshold) { ascent += elevation - anchor; anchor = elevation; }
    else if (anchor - elevation >= threshold) { descent += anchor - elevation; anchor = elevation; }
  }
  return { ascent, descent };
}

export function summarizeProfile(points: readonly ProfilePoint[]): ProfileSummary {
  const valid = points.filter((p): p is ProfilePoint & { elevation: number } => p.elevation !== null);
  const totalDistance = points.length > 0 ? points[points.length - 1]!.distance : 0;
  const { ascent, descent } = cumulativeAscentDescent(valid.map((p) => p.elevation));
  const elevations = valid.map((p) => p.elevation);

  let netGradePercent: number | null = null;
  if (valid.length >= 2) {
    const first = valid[0]!;
    const last = valid[valid.length - 1]!;
    netGradePercent = averageGradePercent(last.elevation - first.elevation, last.distance - first.distance);
  }

  // 約100m以上離れた有効点の組で勾配を比べる。点が2つ以上の有効区間が必要。
  let steepestUphillPercent: number | null = null;
  let steepestDownhillPercent: number | null = null;
  let start = 0;
  for (let end = 1; end < valid.length; end++) {
    while (start < end - 1 && valid[end]!.distance - valid[start + 1]!.distance >= GRADE_WINDOW_M) start++;
    const from = valid[start]!;
    const to = valid[end]!;
    if (to.distance - from.distance < GRADE_WINDOW_M) continue;
    const grade = averageGradePercent(to.elevation - from.elevation, to.distance - from.distance);
    if (grade === null) continue;
    if (steepestUphillPercent === null || grade > steepestUphillPercent) steepestUphillPercent = grade;
    if (steepestDownhillPercent === null || grade < steepestDownhillPercent) steepestDownhillPercent = grade;
  }

  return {
    totalDistance, ascent, descent,
    minElevation: elevations.length ? Math.min(...elevations) : null,
    maxElevation: elevations.length ? Math.max(...elevations) : null,
    netGradePercent, steepestUphillPercent, steepestDownhillPercent,
    validCount: valid.length, missingCount: points.length - valid.length,
  };
}

export interface BuildProfileOptions {
  spacingM?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}
export type BuildProfileResult =
  | { status: 'ok'; points: ProfilePoint[]; summary: ProfileSummary; errorCount: number; levelLabels: string[] }
  | { status: 'invalid' } // ルートが空・座標不正
  | { status: 'cancelled' };

const BATCH = 8;

/** ルート上の点の標高を取得してプロファイルを作る。signal で中断されたら 'cancelled'。 */
export async function buildRouteProfile(
  coordinates: unknown,
  getElevation: (lng: number, lat: number) => Promise<ElevationResult>,
  { spacingM = DEFAULT_SPACING_M, signal, onProgress }: BuildProfileOptions = {},
): Promise<BuildProfileResult> {
  const samples = sampleRoutePoints(coordinates, spacingM);
  if (samples.length < 2) return { status: 'invalid' };

  const points: ProfilePoint[] = [];
  const levels = new Set<string>();
  let errorCount = 0;
  for (let i = 0; i < samples.length; i += BATCH) {
    if (signal?.aborted) return { status: 'cancelled' };
    const batch = samples.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((p) => getElevation(p.lng, p.lat)));
    if (signal?.aborted) return { status: 'cancelled' };
    batch.forEach((p, j) => {
      const r = results[j]!;
      if (r.status === 'ok') levels.add(r.levelLabel);
      if (r.status === 'error') errorCount++;
      points.push({ ...p, elevation: r.status === 'ok' ? r.elevation : null });
    });
    onProgress?.(points.length, samples.length);
  }
  return { status: 'ok', points, summary: summarizeProfile(points), errorCount, levelLabels: [...levels] };
}
