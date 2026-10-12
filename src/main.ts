import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Feature, LineString } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import routeJson from './data/route.geojson?raw';
import { spots } from './data/spots';

// MapLibre v6 の Worker を Vite で依存ファイルごとビルドし、生成URLを指定する。
maplibregl.setWorkerUrl(workerUrl);

// 同梱した GeoJSON を読み込む。外部の経路探索APIには依存しない。
const route = JSON.parse(routeJson) as Feature<LineString>;
const status = document.querySelector<HTMLParagraphElement>('#map-status')!;
const controls = document.querySelector<HTMLFieldSetElement>('#layer-controls')!;
const resetView = document.querySelector<HTMLButtonElement>('#reset-view')!;
const basemapToggle = document.querySelector<HTMLInputElement>('#basemap-toggle')!;
const routeToggle = document.querySelector<HTMLInputElement>('#route-toggle')!;
const markersToggle = document.querySelector<HTMLInputElement>('#markers-toggle')!;

// 1. APIキー不要の OSM ラスタータイル。帰属表示は常時表示する。
try {
  const osmAttribution = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
  const map = new maplibregl.Map({
    container: 'map',
    center: [139.7605, 35.6810],
    zoom: 15,
    maxZoom: 19,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: osmAttribution,
        },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#e9eee8' } },
        { id: 'basemap', type: 'raster', source: 'osm' },
      ],
    },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: osmAttribution }), 'bottom-right');

  // 2・3. フォーカス可能なDOM要素を使い、MapLibreのEnter / Space操作に任せる。
  const markers = spots.map((spot, index) => {
    const element = document.createElement('div');
    element.setAttribute('role', 'button');
    element.tabIndex = 0;
    element.className = 'spot-marker';
    element.textContent = String(index + 1).padStart(2, '0');
    element.setAttribute('aria-label', `${spot.name}の説明を開く`);

    // setDOMContent + textContent で、説明文を HTML として解釈させない。
    const content = document.createElement('div');
    const title = document.createElement('h3');
    const description = document.createElement('p');
    title.textContent = spot.name;
    description.textContent = spot.description;
    content.append(title, description);
    const popup = new maplibregl.Popup({ offset: 25, maxWidth: '260px' }).setDOMContent(content);
    const marker = new maplibregl.Marker({ element }).setLngLat(spot.coordinates).addTo(map).setPopup(popup);
    return marker;
  });

  // ルート座標から範囲を計算。初期表示とリセットで同じ範囲を使用する。
  const bounds = new maplibregl.LngLatBounds();
  for (const [longitude, latitude] of route.geometry.coordinates) bounds.extend([longitude, latitude]);
  const fitRoute = () => map.fitBounds(bounds, { padding: 65, maxZoom: 16, duration: 0 });

  // 4. スタイルの読み込み後に GeoJSON ソースと線レイヤーを追加する。
  map.on('load', () => {
    map.addSource('sample-route', { type: 'geojson', data: route });
    map.addLayer({
      id: 'route', type: 'line', source: 'sample-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#b94a29', 'line-width': 5, 'line-opacity': 0.85 },
    });
    fitRoute();
    controls.disabled = false;
    resetView.disabled = false;
    if (!status.dataset.error) status.textContent = '準備完了 · レイヤーを切り替えてみましょう';
  });

  // 5. スタイルレイヤーは visibility、DOMマーカーは addTo/remove で切り替える。
  basemapToggle.addEventListener('change', () => {
    map.setLayoutProperty('basemap', 'visibility', basemapToggle.checked ? 'visible' : 'none');
  });
  routeToggle.addEventListener('change', () => {
    map.setLayoutProperty('route', 'visibility', routeToggle.checked ? 'visible' : 'none');
  });
  markersToggle.addEventListener('change', () => {
    for (const marker of markers) {
      if (markersToggle.checked) {
        // remove()で外れたポップアップのキーボードイベントも再登録する。
        marker.addTo(map).setPopup(marker.getPopup());
      }
      else {
        marker.getPopup()?.remove();
        marker.remove();
      }
    }
  });
  resetView.addEventListener('click', fitRoute);

  // タイル通信などの失敗を画面にも通知する。成功したようには表示しない。
  map.on('error', (event) => {
    console.error('MapLibre:', event.error);
    status.dataset.error = 'true';
    status.textContent = '地図データの読み込みに失敗しました。通信環境とコンソールを確認し、再読み込みしてください。';
  });
} catch (error) {
  console.error('MapLibre initialization:', error);
  status.dataset.error = 'true';
  status.textContent = '地図を初期化できませんでした。WebGL対応ブラウザーと設定を確認してください。';
}
