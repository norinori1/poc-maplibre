// 国土地理院 標高タイル(PNG)の設定。供給元を変える場合はこのファイルだけを編集する。
// 利用規約: https://maps.gsi.go.jp/development/ichiran.html
export interface DemLevel {
  /** 表示用の名称。UIとREADMEで使う。 */
  label: string;
  zoom: number;
  urlTemplate: string;
}

// 5m メッシュ(提供範囲が限られる)を優先し、404 のときは 10m にフォールバックする。
export const DEM_LEVELS: readonly DemLevel[] = [
  { label: '5mメッシュ', zoom: 15, urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png' },
  { label: '10mメッシュ', zoom: 14, urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png' },
];

export const TILE_SIZE = 256;
export const DEM_ATTRIBUTION = '標高: 国土地理院 標高タイル';
