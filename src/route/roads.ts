import { pathLengthMeters, type LngLat } from '../geo/math';

/** 'straight' は経路探索をせず、2点の直線で測る(従来の動作)。 */
export type RoadProfile = 'straight' | 'bike' | 'foot';
export type RoutedProfile = Exclude<RoadProfile, 'straight'>;

export interface RoadRoute {
  /** 道路に沿った経路。両端はクリック点ではなく、最寄りの道路に寄せた点。 */
  coordinates: LngLat[];
  /** 経路に沿った距離(m)。 */
  distance: number;
}

export type RoadRouteResult =
  | { status: 'ok'; route: RoadRoute }
  | { status: 'no-route' }
  | { status: 'error'; kind: 'network' | 'timeout' | 'http' | 'invalid'; error?: unknown }
  | { status: 'cancelled' };

/**
 * FOSSGISが運営する公開OSRM(キー不要・CORS許可)。プロファイルごとにパスが分かれる。
 * 無保証の共有サービスなので、公開・利用規模拡大の前に利用条件を確認すること。
 */
export const ROUTING_BASE_URL = 'https://routing.openstreetmap.de';
const PATHS: Record<RoutedProfile, string> = { bike: 'routed-bike', foot: 'routed-foot' };
export const ROUTING_TIMEOUT_MS = 15_000;

export function routeUrl(a: LngLat, b: LngLat, profile: RoutedProfile): string {
  // OSRMの座標は 経度,緯度。パスのプロファイル名は実体に関係なく driving を使う。
  const coords = `${a[0]},${a[1]};${b[0]},${b[1]}`;
  return `${ROUTING_BASE_URL}/${PATHS[profile]}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
}

function isLngLat(value: unknown): value is LngLat {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

/** OSRMのレスポンスを検証して経路にする。形が想定と違えば invalid。 */
export function parseOsrmRoute(body: unknown): RoadRouteResult {
  const code = (body as { code?: unknown } | null)?.code;
  if (code === 'NoRoute' || code === 'NoSegment') return { status: 'no-route' };
  if (code !== 'Ok') return { status: 'error', kind: 'invalid' };
  const coordinates = (body as { routes?: { geometry?: { coordinates?: unknown } }[] }).routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(isLngLat)) {
    return { status: 'error', kind: 'invalid' };
  }
  const line = coordinates.map((c): LngLat => [c[0], c[1]]);
  return { status: 'ok', route: { coordinates: line, distance: pathLengthMeters(line) } };
}

export interface FetchRoadRouteOptions {
  signal?: AbortSignal;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** 2点間の道路経路を取得する。失敗しても直線へは自動で切り替えず、理由つきで返す。 */
export async function fetchRoadRoute(
  a: LngLat,
  b: LngLat,
  profile: RoutedProfile,
  { signal, fetch: fetcher = globalThis.fetch, timeoutMs = ROUTING_TIMEOUT_MS }: FetchRoadRouteOptions = {},
): Promise<RoadRouteResult> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try { response = await fetcher(routeUrl(a, b, profile), { signal: combined }); }
  catch (error) {
    if (signal?.aborted) return { status: 'cancelled' };
    return { status: 'error', kind: timeout.aborted ? 'timeout' : 'network', error };
  }
  let body: unknown;
  try { body = await response.json(); }
  catch (error) {
    if (signal?.aborted) return { status: 'cancelled' };
    // OSRMは NoRoute などを4xxとJSONで返す。JSONでなければ通信・サーバー側の問題。
    return response.ok ? { status: 'error', kind: 'invalid', error } : { status: 'error', kind: 'http', error };
  }
  const result = parseOsrmRoute(body);
  if (result.status === 'error' && !response.ok) return { status: 'error', kind: 'http' };
  return result;
}
