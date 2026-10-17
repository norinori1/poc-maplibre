import { describe, expect, it, vi } from 'vitest';
import { createDemTileLoader, decodeTileImage } from './loader';
import type { DemLevel } from './config';

const level: DemLevel = { label: 'test', zoom: 1, urlTemplate: 'https://example.test/{z}/{x}/{y}' };
const tile = { z: 1, x: 0, y: 0 };
const decode = async () => new Float32Array(256 ** 2).fill(12);
const response = () => new Response(new Uint8Array([1, 2, 3]));

describe('bounded DEM loader', () => {
  it('checks image dimensions, alpha and encoding, and always closes the bitmap', async () => {
    const close = vi.fn();
    let width = 512;
    const bitmap = vi.fn(async () => ({ width, height: 512, close }));
    const rgba = new Uint8ClampedArray(512 * 512 * 4);
    rgba.set([128, 100, 128, 255, 128, 0, 0, 0, 128, 0, 0, 128]);
    vi.stubGlobal('createImageBitmap', bitmap);
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({
      drawImage: () => {}, getImageData: () => ({ data: rgba }),
    }) }) });
    try {
      const data = await decodeTileImage(new Blob(), { ...level, tileSize: 512, encoding: 'terrarium' });
      expect(data[0]).toBe(100.5);
      expect(data[1]).toBeNaN();
      expect(data[2]).toBeNaN();
      expect(bitmap).toHaveBeenCalledWith(expect.any(Blob), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      width = 256;
      await expect(decodeTileImage(new Blob(), { ...level, tileSize: 512 })).rejects.toThrow('Unexpected DEM image size');
      expect(close).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
  it('shares pending work, separates providers, and counts body bytes once', async () => {
    const fetcher = vi.fn(async () => response());
    const loader = createDemTileLoader({ fetch: fetcher, decode });
    const session = loader.session();
    const a = session.load(level, tile);
    expect(session.load(level, tile)).toBe(a);
    await a;
    await session.load(level, tile);
    await session.load({ ...level, providerId: 'municipal' }, tile);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(session.metrics).toEqual({ requests: 2, sharedRequests: 1, cacheHits: 1, bodyBytes: 6 });
  });
  it('evicts least recently used tiles by bytes and by count', async () => {
    for (const limits of [{ maxBytes: 256 ** 2 * 4 * 2 }, { maxEntries: 2 }]) {
      const fetcher = vi.fn(async () => response());
      const loader = createDemTileLoader({ ...limits, fetch: fetcher, decode });
      await loader.load(level, tile);
      await loader.load(level, { ...tile, x: 1 });
      await loader.load(level, tile); // refresh x0, evict x1
      await loader.load(level, { ...tile, x: 2 });
      await loader.load(level, tile);
      expect(fetcher).toHaveBeenCalledTimes(3);
      await loader.load(level, { ...tile, x: 1 });
      expect(fetcher).toHaveBeenCalledTimes(4);
      expect(loader.cacheInfo().entries).toBe(2);
    }
  });
  it('expires 404 but retries network, HTTP and decode failures immediately', async () => {
    let now = 0;
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    const loader = createDemTileLoader({ fetch: fetcher, decode, now: () => now, missingTtlMs: 10 });
    expect(await loader.load(level, tile)).toEqual({ status: 'missing' });
    await loader.load(level, tile);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 11;
    await loader.load(level, tile);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const kind of ['network', 'http', 'decode']) {
      const fetchFail = vi.fn(async () => {
        if (kind === 'network') throw new Error('offline');
        return kind === 'http' ? new Response(null, { status: 500 }) : response();
      });
      const other = createDemTileLoader({ fetch: fetchFail, decode: async () => { throw new Error('bad image'); } });
      expect(await other.load(level, tile)).toMatchObject({ status: 'error', kind });
      await other.load(level, tile);
      expect(fetchFail).toHaveBeenCalledTimes(2);
    }
  });
  it('limits concurrency while requests for different tiles are queued', async () => {
    const releases: (() => void)[] = [];
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => releases.push(() => resolve(response()))));
    const loader = createDemTileLoader({ fetch: fetcher, decode, concurrency: 1 });
    const first = loader.load(level, tile);
    const second = loader.load(level, { ...tile, x: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(() => loader.clear()).toThrow();
    releases.shift()!();
    await first;
    expect(fetcher).toHaveBeenCalledTimes(2);
    releases.shift()!();
    await second;
    expect(loader.cacheInfo().pending).toBe(0);
  });
});
