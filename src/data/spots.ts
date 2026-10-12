import type { LngLatLike } from 'maplibre-gl';

// 座標の順序は GeoJSON と同じ [経度, 緯度]。
export const spots: { name: string; description: string; coordinates: LngLatLike }[] = [
  { name: '東京駅・丸の内駅舎', description: '赤レンガの駅舎前からスタート。マーカーとポップアップの動作を確認できます。', coordinates: [139.7647, 35.6812] },
  { name: '丸の内仲通り', description: '丸の内の街並みを通るサンプル地点。ルートの折れ線を拡大してみましょう。', coordinates: [139.7616, 35.6794] },
  { name: '皇居外苑', description: 'サンプルルートの終点。レイヤーを切り替えて、地図と描画の関係を確認できます。', coordinates: [139.7562, 35.6824] },
];
