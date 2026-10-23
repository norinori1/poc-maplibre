import { describe, expect, it } from 'vitest';
import { fetchRoadRoute, parseOsrmRoute, routeUrl } from './roads';

const ok = (coordinates: unknown) => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates } }] });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const A = [139.7671, 35.6812] as const;
const B = [139.7528, 35.6852] as const;

describe('routeUrl', () => {
  it('経度,緯度の順で、プロファイルごとのパスを使う', () => {
    expect(routeUrl(A, B, 'bike')).toContain('/routed-bike/route/v1/driving/139.7671,35.6812;139.7528,35.6852?');
    expect(routeUrl(A, B, 'foot')).toContain('/routed-foot/');
    expect(routeUrl(A, B, 'bike')).toContain('geometries=geojson');
  });
});

describe('parseOsrmRoute', () => {
  it('道路に沿った座標列と、その長さを返す', () => {
    const result = parseOsrmRoute(ok([[139.76, 35.68], [139.761, 35.68], [139.761, 35.681]]));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.route.coordinates).toHaveLength(3);
    expect(result.route.distance).toBeCloseTo(90.5 + 111.2, 0);
  });
  it('経路なしは no-route', () => {
    expect(parseOsrmRoute({ code: 'NoRoute' })).toEqual({ status: 'no-route' });
    expect(parseOsrmRoute({ code: 'NoSegment' })).toEqual({ status: 'no-route' });
  });
  it('想定外の形は invalid(座標の欠落・不正値・1点だけ)', () => {
    const invalid = { status: 'error', kind: 'invalid' };
    expect(parseOsrmRoute(null)).toEqual(invalid);
    expect(parseOsrmRoute({ code: 'InvalidQuery' })).toEqual(invalid);
    expect(parseOsrmRoute({ code: 'Ok', routes: [] })).toEqual(invalid);
    expect(parseOsrmRoute(ok([[139.76, 35.68]]))).toEqual(invalid);
    expect(parseOsrmRoute(ok([[139.76, 35.68], [NaN, 35.68]]))).toEqual(invalid);
    expect(parseOsrmRoute(ok([[139.76, 35.68], [139.76, 95]]))).toEqual(invalid);
  });
});

describe('fetchRoadRoute', () => {
  const line = [[139.7671, 35.6812], [139.76, 35.683], [139.7528, 35.6852]];

  it('成功時は経路を返し、URLにプロファイルと座標を使う', async () => {
    let url = '';
    const result = await fetchRoadRoute(A, B, 'bike', { fetch: async (input) => { url = String(input); return json(ok(line)); } });
    expect(result.status).toBe('ok');
    expect(url).toBe(routeUrl(A, B, 'bike'));
  });
  it('NoRouteは4xxで返ってきても no-route(通信エラーにしない)', async () => {
    const result = await fetchRoadRoute(A, B, 'foot', { fetch: async () => json({ code: 'NoRoute' }, 400) });
    expect(result).toEqual({ status: 'no-route' });
  });
  it('JSONでない5xxは http、通信失敗は network', async () => {
    expect(await fetchRoadRoute(A, B, 'bike', { fetch: async () => new Response('Bad Gateway', { status: 502 }) }))
      .toMatchObject({ status: 'error', kind: 'http' });
    expect(await fetchRoadRoute(A, B, 'bike', { fetch: async () => { throw new TypeError('Failed to fetch'); } }))
      .toMatchObject({ status: 'error', kind: 'network' });
  });
  it('JSONでも形が不正なら invalid', async () => {
    expect(await fetchRoadRoute(A, B, 'bike', { fetch: async () => json({ code: 'Ok', routes: [{}] }) }))
      .toMatchObject({ status: 'error', kind: 'invalid' });
  });
  it('呼び出し側の中断は cancelled、タイムアウトは timeout', async () => {
    const controller = new AbortController();
    const hang: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    const cancelled = fetchRoadRoute(A, B, 'bike', { fetch: hang, signal: controller.signal });
    controller.abort();
    expect(await cancelled).toEqual({ status: 'cancelled' });
    expect(await fetchRoadRoute(A, B, 'bike', { fetch: hang, timeoutMs: 5 })).toMatchObject({ status: 'error', kind: 'timeout' });
  });
});
