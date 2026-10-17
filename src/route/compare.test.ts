import { expect, it, vi } from 'vitest';
import { createDemTileLoader } from '../dem/loader';
import { GSI_PROVIDER, MAPTERHORN_PROVIDER } from '../dem/config';
import { measureProfiles } from './compare';

it('compares exactly the same coordinates and preserves a failed provider as missing', async () => {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('mapterhorn')
    ? new Response(null, { status: 404 }) : new Response(new Uint8Array([1])));
  const loader = createDemTileLoader({ fetch: fetcher,
    decode: async (_, level) => new Float32Array((level.tileSize ?? 256) ** 2).fill(10) });
  const result = await measureProfiles([[139.76, 35.68], [139.762, 35.68]], [GSI_PROVIDER, MAPTERHORN_PROVIDER],
    { spacingM: 5, smoothing: true, signal: new AbortController().signal }, loader);
  expect(result).toHaveLength(2);
  const [gsi, mapterhorn] = result!;
  expect(gsi!.summary.missingCount).toBe(0);
  expect(mapterhorn!.summary.missingRate).toBe(1);
  expect(mapterhorn!.summary.netGradePercent).toBeNull();
  expect(mapterhorn!.points.map(({ lng, lat, distance }) => [lng, lat, distance]))
    .toEqual(gsi!.points.map(({ lng, lat, distance }) => [lng, lat, distance]));
  expect(gsi!.smoothed!.points.map((p) => p.elevation)).toEqual(gsi!.points.map((p) => p.elevation));
  expect(mapterhorn!.metrics.requests).toBeGreaterThan(0);
});

it('honours cancellation before starting provider work', async () => {
  const controller = new AbortController(); controller.abort();
  const fetcher = vi.fn();
  const loader = createDemTileLoader({ fetch: fetcher });
  expect(await measureProfiles([[139, 35], [139.01, 35]], [GSI_PROVIDER, MAPTERHORN_PROVIDER],
    { spacingM: 20, smoothing: false, signal: controller.signal }, loader)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
