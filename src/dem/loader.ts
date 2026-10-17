import { decodeGsiElevation, decodeTerrariumElevation } from './decode';
import type { DemLevel } from './config';
import type { TileLoader, TileResult } from './sampler';
import { tileUrl, type TileCoord } from './tiles';

export interface LoadMetrics {
  requests: number;
  cacheHits: number;
  sharedRequests: number;
  bodyBytes: number;
}
export const emptyMetrics = (): LoadMetrics => ({ requests: 0, cacheHits: 0, sharedRequests: 0, bodyBytes: 0 });

/** RGB is data: never scale or colour-convert it. */
export async function decodeTileImage(blob: Blob, level: DemLevel): Promise<Float32Array> {
  const size = level.tileSize ?? 256;
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    if (bitmap.width !== size || bitmap.height !== size) throw new Error(`Unexpected DEM image size: ${bitmap.width}×${bitmap.height}`);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    if (!context) throw new Error('2D canvas is not available');
    context.drawImage(bitmap, 0, 0);
    const rgba = context.getImageData(0, 0, size, size).data;
    const data = new Float32Array(size * size);
    const decode = level.encoding === 'terrarium' ? decodeTerrariumElevation : decodeGsiElevation;
    for (let i = 0; i < data.length; i++) {
      data[i] = rgba[i * 4 + 3] !== 255 ? NaN
        : decode(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!) ?? NaN;
    }
    return data;
  } finally { bitmap.close(); }
}

interface LoaderOptions {
  maxBytes?: number;
  maxEntries?: number;
  concurrency?: number;
  missingTtlMs?: number;
  now?: () => number;
  fetch?: typeof fetch;
  decode?: typeof decodeTileImage;
}

/** One bounded cache and queue shared across providers. No persistent/offline storage. */
export function createDemTileLoader(options: LoaderOptions = {}) {
  const { maxBytes = 32 * 1024 * 1024, maxEntries = 128, concurrency = 6,
    missingTtlMs = 60_000, now = Date.now, fetch: fetcher = globalThis.fetch,
    decode = decodeTileImage } = options;
  if (maxBytes < 0 || maxEntries < 0 || concurrency < 1) throw new Error('Invalid DEM loader limits');
  const settled = new Map<string, { result: TileResult; bytes: number; expires: number }>();
  const inflight = new Map<string, Promise<TileResult>>();
  const queue: (() => void)[] = [];
  let bytes = 0;
  let active = 0;

  const store = (key: string, result: TileResult) => {
    if (result.status === 'error') return;
    const cost = result.status === 'ok' ? result.data.byteLength : 0;
    if (cost > maxBytes || maxEntries === 0) return;
    settled.set(key, { result, bytes: cost, expires: result.status === 'missing' ? now() + missingTtlMs : Infinity });
    bytes += cost;
    while (bytes > maxBytes || settled.size > maxEntries) {
      const first = settled.keys().next().value!;
      bytes -= settled.get(first)!.bytes;
      settled.delete(first);
    }
  };

  const fetchTile = async (level: DemLevel, tile: TileCoord, metrics?: LoadMetrics): Promise<TileResult> => {
    let response: Response;
    if (metrics) metrics.requests++;
    try { response = await fetcher(tileUrl(level.urlTemplate, tile), { signal: AbortSignal.timeout(20_000) }); }
    catch (error) { return { status: 'error', kind: 'network', error }; }
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) return { status: 'error', kind: 'http', httpStatus: response.status, error: new Error(`HTTP ${response.status}`) };
    let blob: Blob;
    try { blob = await response.blob(); }
    catch (error) { return { status: 'error', kind: 'network', error }; }
    if (metrics) metrics.bodyBytes += blob.size;
    try {
      const data = await decode(blob, level);
      if (data.length !== (level.tileSize ?? 256) ** 2) throw new Error('Unexpected DEM data length');
      return { status: 'ok', data };
    } catch (error) { return { status: 'error', kind: 'decode', error }; }
  };

  const pump = () => { while (active < concurrency && queue.length) queue.shift()!(); };
  const load = (level: DemLevel, tile: TileCoord, metrics?: LoadMetrics): Promise<TileResult> => {
    const key = JSON.stringify([level.providerId ?? 'gsi', level.label, level.urlTemplate,
      level.tileSize ?? 256, level.encoding ?? 'gsi', tile.z, tile.x, tile.y]);
    const cached = settled.get(key);
    if (cached) {
      settled.delete(key);
      if (cached.expires > now()) {
        settled.set(key, cached);
        if (metrics) metrics.cacheHits++;
        return Promise.resolve(cached.result);
      }
      bytes -= cached.bytes;
    }
    const pending = inflight.get(key);
    if (pending) { if (metrics) metrics.sharedRequests++; return pending; }
    const promise = new Promise<TileResult>((resolve) => {
      queue.push(() => {
        active++;
        void fetchTile(level, tile, metrics).then((result) => {
          store(key, result);
          inflight.delete(key);
          active--;
          resolve(result);
          pump();
        });
      });
    });
    inflight.set(key, promise);
    pump();
    return promise;
  };
  return {
    load: load as TileLoader,
    session: () => {
      const metrics = emptyMetrics();
      const sessionLoad: TileLoader = (level, tile) => load(level, tile, metrics);
      return { load: sessionLoad, metrics };
    },
    cacheInfo: () => ({ bytes, entries: settled.size, active, pending: inflight.size }),
    clear: () => {
      if (inflight.size) throw new Error('Wait for DEM requests before clearing cache');
      settled.clear(); bytes = 0;
    },
  };
}

export const demTileLoader = createDemTileLoader();
export const loadDemTile = demTileLoader.load;
