// 国土地理院 標高タイル(PNG)の設定。供給元を変える場合はこのファイルだけを編集する。
// 利用規約: https://maps.gsi.go.jp/development/ichiran.html
export interface DemLevel {
  /** 表示用の名称。UIとREADMEで使う。 */
  label: string;
  zoom: number;
  urlTemplate: string;
  providerId?: string;
  tileSize?: 256 | 512;
  encoding?: 'gsi';
}

export interface DemProvider {
  id: string;
  name: string;
  attribution: string;
  attributionUrl: string;
  source: string;
  termsUrl: string;
  /** Web Mercator longitude/latitude bounds; tile availability may be narrower. */
  bounds: readonly [number, number, number, number];
  levels: readonly DemLevel[];
  fallback: readonly ('missing' | 'nodata')[];
  noDataNote: string;
}

// 5m メッシュ(提供範囲が限られる)を優先し、404 のときは 10m にフォールバックする。
export const DEM_LEVELS: readonly DemLevel[] = [
  { label: '5mメッシュ', zoom: 15, urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png' },
  { label: '10mメッシュ', zoom: 14, urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png' },
];

export const DEM_ATTRIBUTION = '標高: 国土地理院 標高タイル';

export const GSI_PROVIDER: DemProvider = {
  id: 'gsi', name: 'GSI（従来・比較基準）', attribution: DEM_ATTRIBUTION,
  attributionUrl: 'https://maps.gsi.go.jp/development/ichiran.html',
  source: '国土地理院 DEM5A / DEM10B',
  termsUrl: 'https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html',
  bounds: [122, 20, 154, 46],
  levels: DEM_LEVELS.map((level) => ({ ...level, providerId: 'gsi', tileSize: 256, encoding: 'gsi' })),
  fallback: ['missing', 'nodata'],
  noDataNote: '404・欠測のみ5mから10mへ切替。通信エラーでは切り替えません。',
};
