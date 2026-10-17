import type { DemProvider } from '../dem/config';
import { createDemTileLoader, demTileLoader, type LoadMetrics } from '../dem/loader';
import { createElevationSampler } from '../dem/sampler';
import { buildRouteProfile, sampleRoutePoints, smoothProfile, summarizeProfile, type ProfilePoint, type ProfileSummary } from './profile';

export interface MeasuredProfile {
  providerId: string;
  providerName: string;
  points: ProfilePoint[];
  summary: ProfileSummary;
  smoothed: { points: ProfilePoint[]; summary: ProfileSummary } | null;
  elapsedMs: number;
  metrics: LoadMetrics;
  requestedSpacing: number;
  actualSpacing: number;
  levelLabels: string[];
  errorCount: number;
}

/** Generate coordinates once, then measure sequentially without another provider's fallback. */
export async function measureProfiles(
  coordinates: unknown,
  providers: readonly DemProvider[],
  options: { spacingM: number; smoothing: boolean; signal: AbortSignal;
    onProgress?: (provider: string, done: number, total: number) => void },
  loader: ReturnType<typeof createDemTileLoader> = demTileLoader,
): Promise<MeasuredProfile[] | null> {
  const samples = sampleRoutePoints(coordinates, options.spacingM);
  if (samples.length < 2) throw new Error('ルートの座標が不正または空です');
  const profiles: MeasuredProfile[] = [];
  for (const provider of providers) {
    if (options.signal.aborted) return null;
    const session = loader.session();
    const start = performance.now();
    const result = await buildRouteProfile(coordinates, createElevationSampler(provider, session.load), {
      samples, signal: options.signal,
      onProgress: (done, total) => options.onProgress?.(provider.name, done, total),
    });
    if (result.status === 'cancelled') return null;
    if (result.status !== 'ok') throw new Error('プロファイルを作成できません');
    const smoothedPoints = options.smoothing ? smoothProfile(result.points) : null;
    profiles.push({ providerId: provider.id, providerName: provider.name, points: result.points,
      summary: result.summary, smoothed: smoothedPoints ? { points: smoothedPoints, summary: summarizeProfile(smoothedPoints) } : null,
      elapsedMs: performance.now() - start, metrics: { ...session.metrics },
      requestedSpacing: options.spacingM, actualSpacing: samples[1]!.distance - samples[0]!.distance,
      levelLabels: result.levelLabels, errorCount: result.errorCount });
  }
  return profiles;
}
