import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { DEM_PROVIDERS, GSI_PROVIDER, type DemProvider } from './dem/config';
import { demTileLoader, loadDemTile } from './dem/loader';
import { createElevationSampler, type ElevationResult } from './dem/sampler';
import { averageGradePercent, haversineMeters, MIN_GRADE_DISTANCE_M, type LngLat } from './geo/math';
import { measureProfiles } from './route/compare';
import { renderProfileChart } from './ui/chart';
import { renderComparison } from './ui/comparison';
import { formatCoordinate, formatDistance, formatElevation, formatGrade, formatSigned, UNAVAILABLE } from './ui/format';

type Mode = 'off' | 'point' | 'slope';
type Row = readonly [label: string, value: string];

const reasonOf = (result: Exclude<ElevationResult, { status: 'ok' }>): string => {
  switch (result.status) {
    case 'out-of-range': return '範囲外(標高データの提供範囲外です)';
    case 'nodata': return '欠測(この地点の標高データがありません)';
    case 'error': return result.kind === 'decode' ? '復号エラー(標高画像を読み取れませんでした)' : '通信エラー(標高タイルを取得できませんでした)';
  }
};

const elevationText = (result: ElevationResult): string =>
  result.status === 'ok' ? formatElevation(result.elevation) : `${UNAVAILABLE}: ${reasonOf(result)}`;

/** dl に行を描画する。値は textContent のみで入れ、HTMLとして解釈しない。 */
function renderRows(dl: HTMLElement, rows: readonly Row[]): void {
  dl.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    dl.append(dt, dd);
  }
}

/** クリック標高・2点勾配・ルートプロファイルの操作をまとめて設定する。 */
export function setupElevation(
  map: MapLibreMap,
  options: { getRoute: () => Feature<LineString>; onRouteChange: (id: string) => void },
): { enable: () => void } {
  const modeFieldset = document.querySelector<HTMLFieldSetElement>('#elevation-mode')!;
  const resultBox = document.querySelector<HTMLDivElement>('#elevation-result')!;
  const routeSelect = document.querySelector<HTMLSelectElement>('#route-select')!;
  const runButton = document.querySelector<HTMLButtonElement>('#profile-run')!;
  const profileStatus = document.querySelector<HTMLDivElement>('#profile-status')!;
  const chart = document.querySelector<SVGSVGElement>('#profile-chart')!;
  const stats = document.querySelector<HTMLElement>('#profile-stats')!;
  const providerSelect = document.querySelector<HTMLSelectElement>('#dem-provider')!;
  const spacingSelect = document.querySelector<HTMLSelectElement>('#profile-spacing')!;
  const smoothingSelect = document.querySelector<HTMLSelectElement>('#profile-smoothing')!;
  const compareButton = document.querySelector<HTMLButtonElement>('#profile-compare')!;
  const attribution = document.querySelector<HTMLElement>('#dem-attribution')!;
  let provider = GSI_PROVIDER;
  const getElevation = (lng: number, lat: number) => createElevationSampler(provider, loadDemTile)(lng, lat);
  let profileRequested = false;

  const showAttribution = (providers: readonly DemProvider[]) => {
    attribution.replaceChildren();
    for (const item of providers) {
      const link = document.createElement('a');
      link.href = item.attributionUrl;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = item.attribution;
      const note = document.createElement('p');
      note.textContent = `${item.source}。${item.noDataNote}`;
      attribution.append(link, note);
    }
  };
  showAttribution([provider]);

  let mode: Mode = 'off';
  let picks: LngLat[] = [];
  let pickGeneration = 0; // 新しいクリックや切替で、古い非同期結果を捨てる
  let profileController: AbortController | null = null;

  // 選択点と2点間の線。ベースマップやルートの表示切替とは独立したレイヤー。
  const emptyPicks: FeatureCollection<Point | LineString> = { type: 'FeatureCollection', features: [] };
  map.addSource('elevation-picks', { type: 'geojson', data: emptyPicks });
  map.addLayer({
    id: 'elevation-picks-line', type: 'line', source: 'elevation-picks', filter: ['==', '$type', 'LineString'],
    paint: { 'line-color': '#1f6f8b', 'line-width': 3, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'elevation-picks-points', type: 'circle', source: 'elevation-picks', filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': 7,
      'circle-color': ['match', ['get', 'role'], 'start', '#1f6f8b', '#7a3b8f'],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 3,
    },
  });

  const drawPicks = () => {
    const features: Feature<Point | LineString>[] = picks.map((p, i) => ({
      type: 'Feature', properties: { role: i === 0 ? 'start' : 'end' }, geometry: { type: 'Point', coordinates: [...p] },
    }));
    if (picks.length === 2) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: picks.map((p) => [...p]) } });
    }
    (map.getSource('elevation-picks') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
  };

  const showMessage = (message: string) => {
    delete resultBox.dataset.state;
    resultBox.replaceChildren(message);
  };
  const showRows = (rows: readonly Row[], note: string, error = false) => {
    const dl = document.createElement('dl');
    dl.className = 'stats';
    renderRows(dl, rows);
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = note;
    resultBox.replaceChildren(dl, p);
    if (error) resultBox.dataset.state = 'error'; else delete resultBox.dataset.state;
  };

  const describeMode = () => {
    if (mode === 'point') showMessage('地図をクリックすると、その地点の推定標高を表示します。');
    else if (mode === 'slope') showMessage('始点と終点を順にクリックしてください。');
    else showMessage('「標高を調べる」か「2点の勾配」を選ぶと、地図のクリックで計測できます。');
  };

  const clearPicks = () => {
    pickGeneration++;
    picks = [];
    drawPicks();
  };

  const onPoint = async (point: LngLat) => {
    const generation = ++pickGeneration;
    picks = [point];
    drawPicks();
    showMessage('標高を取得しています…');
    const result = await getElevation(point[0], point[1]);
    if (generation !== pickGeneration) return;
    showRows(
      [
        ['緯度, 経度', formatCoordinate(point[0], point[1])],
        ['推定標高', elevationText(result)],
        ['供給元', provider.name],
        ...(result.status === 'ok' ? [['データ', `${provider.attribution}(${result.levelLabel})`] as Row] : []),
      ],
      '地表面の推定値です。橋・トンネル上の路面高とは一致しないことがあります。',
      result.status !== 'ok',
    );
  };

  const onSlope = async (point: LngLat) => {
    const generation = ++pickGeneration;
    if (picks.length >= 2) picks = [];
    picks.push(point);
    drawPicks();
    if (picks.length === 1) {
      showMessage('始点を設定しました。終点をクリックしてください。');
      return;
    }
    const [a, b] = picks as [LngLat, LngLat];
    showMessage('標高を取得しています…');
    const [ea, eb] = await Promise.all([getElevation(a[0], a[1]), getElevation(b[0], b[1])]);
    if (generation !== pickGeneration) return;

    const distance = haversineMeters(a, b);
    const rows: Row[] = [
      ['供給元', provider.name],
      ['始点', formatCoordinate(a[0], a[1])],
      ['始点の標高', elevationText(ea)],
      ['終点', formatCoordinate(b[0], b[1])],
      ['終点の標高', elevationText(eb)],
      ['水平距離', formatDistance(distance)],
    ];
    if (ea.status !== 'ok' || eb.status !== 'ok') {
      showRows(rows, '標高を取得できないため、高低差と勾配は計算しません。', true);
      return;
    }
    const delta = eb.elevation - ea.elevation;
    rows.push(['高低差', formatSigned(delta, 'm')]);
    rows.push([
      '平均勾配',
      distance < MIN_GRADE_DISTANCE_M ? `距離が${MIN_GRADE_DISTANCE_M}m未満のため計算しません` : formatGrade(averageGradePercent(delta, distance)),
    ]);
    showRows(rows, '高低差と勾配は「終点 − 始点」で、+は上りです。DEMの推定値で、道路の瞬間勾配ではありません。');
  };

  map.on('click', (event: MapMouseEvent) => {
    if (mode === 'off') return;
    // マーカー(ポップアップ操作)やポップアップ上のクリックは計測に使わない。
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('.spot-marker, .maplibregl-popup')) return;
    const point: LngLat = [event.lngLat.lng, event.lngLat.lat];
    void (mode === 'point' ? onPoint(point) : onSlope(point));
  });

  modeFieldset.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== 'elevation-mode') return;
    mode = input.value as Mode;
    clearPicks();
    describeMode();
    map.getCanvas().style.cursor = mode === 'off' ? '' : 'crosshair';
  });

  // --- ルートの標高プロファイル ---
  const clearProfile = () => {
    profileController?.abort();
    profileController = null;
    profileStatus.replaceChildren();
    delete profileStatus.dataset.state;
    chart.toggleAttribute('hidden', true);
    chart.replaceChildren();
    stats.replaceChildren();
    runButton.disabled = false;
    compareButton.disabled = false;
  };
  const failProfile = (message: string) => {
    profileStatus.textContent = message;
    profileStatus.dataset.state = 'error';
  };

  routeSelect.addEventListener('change', () => {
    profileRequested = false;
    clearProfile();
    showAttribution([provider]);
    options.onRouteChange(routeSelect.value);
  });

  const runProfiles = async (compare: boolean) => {
    clearProfile();
    profileRequested = true;
    const controller = new AbortController();
    profileController = controller;
    runButton.disabled = true;
    compareButton.disabled = true;
    const selected = compare ? DEM_PROVIDERS : [provider];
    showAttribution(selected);
    profileStatus.textContent = '標高を取得しています… 0%';
    let profiles;
    try {
      profiles = await measureProfiles(options.getRoute().geometry?.coordinates, selected, {
        signal: controller.signal, spacingM: Number(spacingSelect.value), smoothing: smoothingSelect.value === '30',
        onProgress: (name, done, total) => {
          if (profileController === controller) profileStatus.textContent = `${name}: 標高を取得しています… ${Math.round((done / total) * 100)}%`;
        },
      });
    } catch (error) {
      if (profileController !== controller) return;
      profileController = null;
      runButton.disabled = compareButton.disabled = false;
      failProfile(error instanceof Error ? error.message : 'プロファイルの取得に失敗しました');
      return;
    }
    if (profileController !== controller) return; // 中断・ルート切替・再実行された
    profileController = null;
    runButton.disabled = false;
    compareButton.disabled = false;
    if (!profiles?.length) return;
    const missing = profiles.reduce((n, p) => n + p.summary.missingCount, 0);
    profileStatus.textContent = missing ? `作成しました（推定値）。取得不可は合計${missing}点。欠測区間では集計を分割します。` : '作成しました（推定値）。';
    if (profiles.every((p) => p.summary.validCount < 2)) profileStatus.dataset.state = 'error';
    chart.toggleAttribute('hidden', false);
    const extras = profiles.flatMap((p, i) => [
      ...(i > 0 ? [{ points: p.points, color: '#1f6f8b', dashed: false }] : []),
      ...(p.smoothed ? [{ points: p.smoothed.points, color: i === 0 ? '#b94a29' : '#1f6f8b', dashed: true }] : []),
    ]);
    renderProfileChart(chart, profiles[0]!.points, extras);
    renderComparison(stats, profiles);
    const memory = document.createElement('p');
    memory.textContent = `復号済みタイルキャッシュ: ${(demTileLoader.cacheInfo().bytes / 1024 / 1024).toFixed(2)} MiB / 上限32 MiB（画像・地図等のメモリは含みません）`;
    stats.append(memory);
  };
  runButton.addEventListener('click', () => { void runProfiles(false); });
  compareButton.addEventListener('click', () => { void runProfiles(true); });
  const refreshProfile = () => {
    if (profileRequested) void runProfiles(false);
    else { clearProfile(); showAttribution([provider]); }
  };
  spacingSelect.addEventListener('change', refreshProfile);
  smoothingSelect.addEventListener('change', refreshProfile);
  providerSelect.addEventListener('change', () => {
    provider = DEM_PROVIDERS.find((item) => item.id === providerSelect.value) ?? GSI_PROVIDER;
    pickGeneration++;
    const previous = [...picks];
    if (mode === 'point' && previous[0]) void onPoint(previous[0]);
    else if (mode === 'slope' && previous.length === 2) {
      picks = [previous[0]!];
      void onSlope(previous[1]!);
    } else describeMode();
    refreshProfile();
  });

  return {
    enable: () => {
      modeFieldset.disabled = false;
      routeSelect.disabled = false;
      runButton.disabled = false;
      compareButton.disabled = false;
      providerSelect.disabled = spacingSelect.disabled = smoothingSelect.disabled = false;
      describeMode();
    },
  };
}
