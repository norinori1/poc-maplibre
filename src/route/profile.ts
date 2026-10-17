import { averageGradePercent, haversineMeters, interpolate, type LngLat } from '../geo/math';
import type { ElevationResult } from '../dem/sampler';
import { waitForConsumer } from '../dem/async';

export interface RoutePoint { distance: number; lng: number; lat: number }
export interface ProfilePoint extends RoutePoint { elevation: number | null; status?: ElevationResult['status']; levelLabel?: string }

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
  missingRate: number;
  validDistance: number;
  windows: Record<50 | 100, GradeWindow[]>;
}

export interface GradeWindow { from: number; to: number; gradePercent: number }

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
  const segments = validSegments(points);
  let ascent = 0;
  let descent = 0;
  let validDistance = 0;
  for (const segment of segments) {
    const sum = cumulativeAscentDescent(segment.map((p) => p.elevation!));
    ascent += sum.ascent; descent += sum.descent;
    validDistance += segment.at(-1)!.distance - segment[0]!.distance;
  }
  const elevations = valid.map((p) => p.elevation);

  let netGradePercent: number | null = null;
  if (valid.length >= 2 && valid.length === points.length) {
    const first = valid[0]!;
    const last = valid[valid.length - 1]!;
    netGradePercent = averageGradePercent(last.elevation - first.elevation, last.distance - first.distance);
  }

  const windows = { 50: gradeWindows(points, 50), 100: gradeWindows(points, 100) };
  let steepestUphillPercent: number | null = null;
  let steepestDownhillPercent: number | null = null;
  for (const { gradePercent: grade } of windows[100]) {
    if (steepestUphillPercent === null || grade > steepestUphillPercent) steepestUphillPercent = grade;
    if (steepestDownhillPercent === null || grade < steepestDownhillPercent) steepestDownhillPercent = grade;
  }

  return {
    totalDistance, ascent, descent,
    minElevation: elevations.length ? Math.min(...elevations) : null,
    maxElevation: elevations.length ? Math.max(...elevations) : null,
    netGradePercent, steepestUphillPercent, steepestDownhillPercent,
    validCount: valid.length, missingCount: points.length - valid.length,
    missingRate: points.length ? (points.length - valid.length) / points.length : 0,
    validDistance, windows,
  };
}

/** Missing samples break every calculation; no interpolation across gaps. */
export function validSegments(points: readonly ProfilePoint[]): ProfilePoint[][] {
  const segments: ProfilePoint[][] = [];
  let current: ProfilePoint[] = [];
  for (const point of points) {
    if (point.elevation === null || !Number.isFinite(point.elevation)) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function gradeWindows(points: readonly ProfilePoint[], length: number): GradeWindow[] {
  if (!(length > 0)) return [];
  const windows: GradeWindow[] = [];
  for (const segment of validSegments(points)) {
    for (let i = 0; i < segment.length - 1; i++) {
      const from = segment[i]!;
      const target = from.distance + length;
      if (target > segment.at(-1)!.distance + 1e-6) break;
      let j = i + 1;
      while (j < segment.length - 1 && segment[j]!.distance < target) j++;
      const a = segment[j - 1]!;
      const b = segment[j]!;
      const t = Math.min(1, (target - a.distance) / (b.distance - a.distance));
      const elevation = a.elevation! + (b.elevation! - a.elevation!) * t;
      const gradePercent = averageGradePercent(elevation - from.elevation!, length);
      if (gradePercent !== null) windows.push({ from: from.distance, to: target, gradePercent });
    }
  }
  return windows;
}

/** Centred 30m moving mean, truncated at segment ends; original points remain intact. */
export function smoothProfile(points: readonly ProfilePoint[], width = 30): ProfilePoint[] {
  const values = new Map<ProfilePoint, number>();
  for (const segment of validSegments(points)) {
    for (const point of segment) {
      const neighbours = segment.filter((p) => Math.abs(p.distance - point.distance) <= width / 2 + 1e-6);
      values.set(point, neighbours.reduce((sum, p) => sum + p.elevation!, 0) / neighbours.length);
    }
  }
  return points.map((p) => ({ ...p, elevation: values.get(p) ?? null }));
}

export interface BuildProfileOptions {
  spacingM?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  samples?: readonly RoutePoint[];
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
  { spacingM = DEFAULT_SPACING_M, signal, onProgress, samples: fixedSamples }: BuildProfileOptions = {},
): Promise<BuildProfileResult> {
  const samples = fixedSamples ?? sampleRoutePoints(coordinates, spacingM);
  if (samples.length > MAX_POINTS) return { status: 'invalid' };
  if (samples.length < 2) return { status: 'invalid' };

  const points: ProfilePoint[] = [];
  const levels = new Set<string>();
  let errorCount = 0;
  for (let i = 0; i < samples.length; i += BATCH) {
    if (signal?.aborted) return { status: 'cancelled' };
    const batch = samples.slice(i, i + BATCH);
    let results: ElevationResult[];
    try { results = await waitForConsumer(Promise.all(batch.map((p) => getElevation(p.lng, p.lat))), signal); }
    catch (error) { if (signal?.aborted) return { status: 'cancelled' }; throw error; }
    if (signal?.aborted) return { status: 'cancelled' };
    batch.forEach((p, j) => {
      const r = results[j]!;
      if (r.status === 'ok') levels.add(r.levelLabel);
      if (r.status === 'error') errorCount++;
      points.push({ ...p, elevation: r.status === 'ok' ? r.elevation : null, status: r.status,
        ...(r.status === 'ok' ? { levelLabel: r.levelLabel } : {}) });
    });
    onProgress?.(points.length, samples.length);
  }
  return { status: 'ok', points, summary: summarizeProfile(points), errorCount, levelLabels: [...levels] };
}
