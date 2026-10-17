import { expect, it } from 'vitest';
import { waitForConsumer } from './async';
import { buildRouteProfile } from '../route/profile';
import type { ElevationResult } from './sampler';

it('cancels one consumer promptly without rejecting a shared request for another', async () => {
  let resolve!: (value: number) => void;
  const pending = new Promise<number>((done) => { resolve = done; });
  const controller = new AbortController();
  const first = waitForConsumer(pending, controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const second = waitForConsumer(pending);
  controller.abort();
  await rejected;
  resolve(42);
  expect(await second).toBe(42);
});

it('route cancellation returns while shared tile sampling is still pending; no new batches', async () => {
  const controller = new AbortController();
  let resolve!: (value: ElevationResult) => void;
  const pending = new Promise<ElevationResult>((done) => { resolve = done; });
  let calls = 0;
  const profile = buildRouteProfile([[139, 35], [139.01, 35]], () => { calls++; return pending; }, { signal: controller.signal });
  controller.abort();
  expect(await profile).toEqual({ status: 'cancelled' });
  expect(calls).toBe(8);
  resolve({ status: 'ok', elevation: 1, levelLabel: 'test' });
});
