# スクリーンショット

| ファイル | 内容 | ブラウザーの表示サイズ |
| --- | --- | --- |
| [desktop.png](desktop.png) | OSMベースマップ、3地点のマーカー、GeoJSONルート、表示切替パネル | 1440 × 1100 |
| [popup.png](popup.png) | 東京駅のマーカーのポップアップ | 1440 × 1100 |
| [mobile.png](mobile.png) | スマホ幅でルート全体を表示 | 390 × 844（ページ全体を撮影） |

- 撮影日: 2026-10-13（JST）
- 対象実装: `cc494a195814d08ec08fe0b3bf29ea8c3c129a7e`
- `npm run build` の成果物を `npm run preview` で表示
- Windows / Chromium / Playwright / ソフトウェアWebGL、device scale factor 1
- 実際のOSM標準タイルを使用。ローカル代替タイルを使ったテスト画像ではありません
- PC表示、ポップアップ表示、スマホ幅に変更して「ルート全体を表示」を押した状態を撮影

地図は © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors。画像内の帰属表示も維持しています。ルートは描画検証用の概略線で、経路案内には使用できません。スマホ幅の画像はブラウザーのサイズ変更によるもので、モバイル実機の動作確認を示すものではありません。
