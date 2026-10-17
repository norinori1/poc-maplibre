// 国土地理院 標高タイル(PNG)の設定。供給元を変える場合はこのファイルだけを編集する。
// 利用規約: https://maps.gsi.go.jp/development/ichiran.html
export interface DemLevel {
  /** 表示用の名称。UIとREADMEで使う。 */
  label: string;
  zoom: number;
  urlTemplate: string;
  providerId?: string;
  tileSize?: 256 | 512;
  encoding?: 'gsi' | 'terrarium';
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

// 5m メッシュ(提供範囲が限られる)を優先し、404・欠測のときは 10m にフォールバックする。
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

export const MAPTERHORN_PROVIDER: DemProvider = {
  id: 'mapterhorn', name: 'Mapterhorn（新規）', attribution: '© Mapterhorn · 日本の原資料: 国土地理院',
  attributionUrl: 'https://mapterhorn.com/attribution/',
  source: '各地域の公開DEM。日本はGSI由来の1m/5m/10m等を含む（地点別解像度は未確定）',
  termsUrl: 'https://mapterhorn.com/attribution/',
  bounds: [-180, -85.0511287, 180, 85.0511287],
  levels: [{ label: 'Terrarium z16 / 512px（原資料の解像度とは異なる）', zoom: 16,
    urlTemplate: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp', providerId: 'mapterhorn', tileSize: 512, encoding: 'terrarium' }],
  fallback: [],
  noDataNote: 'z16で取得。404時は取得不可。GSIや別ズームへ自動切替しません。配信前に補完・0m化された欠測は検出できません。',
};

export const DEM_PROVIDERS: readonly DemProvider[] = [GSI_PROVIDER, MAPTERHORN_PROVIDER];
