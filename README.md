# MapLibre GL JS PoC

Vite + TypeScriptで、MapLibre GL JSの基本操作を学ぶための技術検証環境です。本番アプリや経路案内サービスではありません。APIキー、バックエンド、環境変数は不要です。地図タイルの取得にはインターネット接続が必要です。

## スクリーンショット

実際のOpenStreetMapタイルで撮影した画面です。撮影条件は [docs/screenshots/README.md](docs/screenshots/README.md) に記載しています。

### PC表示

![東京・丸の内の地図、3地点のマーカー、GeoJSONルートと表示切替パネル](docs/screenshots/desktop.png)

### マーカーのポップアップ

![東京駅のマーカーをクリックして地点説明を開いた画面](docs/screenshots/popup.png)

### スマホ幅の表示

ブラウザー幅390pxでの表示です（モバイル実機ではありません）。

<img src="docs/screenshots/mobile.png" alt="スマホ幅でルート全体と3地点のマーカー、操作パネルを表示した画面" width="260" />

## セットアップ・起動

Node.js **22.12以上（推奨: 24 LTS）** と npm を使用します。

```sh
npm ci
npm run dev
```

ターミナルに表示されるURL（通常 `http://127.0.0.1:5173`）を開いてください。WebGL対応ブラウザーが必要です。

```sh
npm run build    # TypeScriptの型チェック + dist/へのビルド
npm run preview  # ビルドした成果物を確認（通常 http://127.0.0.1:4173）
```

`preview` は検証用サーバーです。本番配信には使用しません。

## 使用技術・ファイル構成

- Vite: 開発サーバーと静的ファイルのビルド
- TypeScript: strict型チェック
- MapLibre GL JS: WebGLによる地図表示、マーカー、ポップアップ、描画レイヤー
- GeoJSON: `[経度, 緯度]` の座標列を持つ `LineString`
- OpenStreetMap: APIキー不要の標準ラスタータイル

```text
index.html             操作パネルと地図のHTML
src/main.ts            機能別コメント付きのMapLibre初期化・イベント処理
src/style.css          レイアウトとマーカーのスタイル
src/data/spots.ts      3地点の座標・説明文
src/data/route.geojson 描画確認用の概略ルート
```

## 実装機能・試し方

| 機能 | MapLibre API | 試し方 |
| --- | --- | --- |
| 地図表示 | `Map`、raster source/layer、`NavigationControl` | 東京駅周辺が表示される。ドラッグ、ホイール、＋ / − で移動・ズーム |
| マーカー配置 | `Marker` | 番号付きの3地点を表示。`spots.ts` の座標変更で位置を試せる |
| ポップアップ | `Popup.setDOMContent`、`Marker.setPopup` | マーカーをクリック、またはTabで選択してEnter / Space。閉じるボタンで終了 |
| GeoJSONルート | `addSource`、`addLayer(type: 'line')` | 茶色の折れ線を確認。`route.geojson` の座標を編集して再表示 |
| レイヤー切替 | `setLayoutProperty(..., 'visibility', ...)` | ベースマップとルートのチェックを外して非表示、戻して再表示 |
| マーカー切替 | `Marker.remove` / `addTo` | マーカーのチェックを切り替える。非表示時はポップアップも閉じる |
| 表示範囲リセット | `LngLatBounds`、`fitBounds` | 「ルート全体を表示」でルート全体が見える範囲に戻る |

DOMマーカーはスタイルレイヤーではないため、切替方法を分けています。ソースと線レイヤーは `load` 後に追加し、操作パネルもそこで有効化します。タイル読み込み失敗とWebGL初期化失敗は画面に通知します。

MapLibre v6はWorkerを別ファイルで配信します。`main.ts` で `?worker&url` と `setWorkerUrl` を使用し、Workerの依存ファイルもViteで同梱します（[公式導入ガイド](https://maplibre.org/maplibre-gl-js/docs/)）。`?url` だけにするとビルド後にWorkerの依存解決が失敗するため、開発サーバーだけでなく `build` + `preview` でも検証してください。

ルートは手書きの描画サンプルで、道路への追従・通行可否・距離の正確性を保証しません。経路探索APIや現在位置の取得は実装していません。

## 地図タイルの利用条件

[OSMF公式タイル利用ポリシー](https://operations.osmfoundation.org/policies/tiles/) と [OSM著作権・ライセンス](https://www.openstreetmap.org/copyright) を確認してください。

- 地図右下の `© OpenStreetMap contributors` を常時表示します。ベースマップを非表示にしても帰属表示は隠しません。
- `https://tile.openstreetmap.org/{z}/{x}/{y}.png` を使用し、OSMタイルの最大ズームを19に制限しています。
- ブラウザー標準のUser-Agent、Referer、HTTPキャッシュを使用します。Refererを削除したり、キャッシュを強制無効化したりしないでください。
- 大量ダウンロード、事前取得、オフライン用保存は禁止です。自動テストで大量のパン・ズームや連続再読み込みをしないでください。
- APIキー不要でも無制限・可用性保証付きのサービスではありません。公開・利用規模拡大前に利用条件を再確認し、用途に適した配信事業者または自前タイルへ切り替えてください。URLと帰属表示は `src/main.ts` の `osm` sourceにあります。
- タイル提供先へIPアドレスやRefererなどが送信されます。個人情報・機密情報を地図データに入れないでください。

## 今後検証すべきこと

- 実機のモバイルSafari / Chrome、タッチ操作、低性能GPU、WebGL無効時の表示
- 大量の地点でDOM MarkerとGeoJSON circle/symbolレイヤーを比較、クラスタリング
- GeoJSONの差し替え（`setData`）、大容量データ、座標・スキーマの検証
- ベクトルタイル、スタイル切替、地形・3D、配信事業者ごとの利用条件
- 通信断・タイル制限時の再試行方針、アクセシビリティ、CSPとWorker設定
- 本番配信先でのキャッシュ・Referer・帰属表示、依存ライブラリのライセンス確認

このPoCでは外部APIによる経路探索、認証、永続化、オフライン対応は対象外です。

## 実装時の検証結果（2026-10-13）

- Windows / Node.js 24.15.0: `npm ci`、`npm run build`（strict型チェック含む）
- Chromium / Playwright: ビルド成果物を `preview` で表示し、OSMタイルのHTTP 200と地図・ルート描画を確認
- ローカル代替タイルによる操作確認: 3マーカー、クリックとキーボードでのポップアップ、マーカー非表示時のポップアップ終了と再表示後のキーボード操作、ベースマップ・ルートの表示切替、帰属表示の維持、範囲リセット
- ルート表示切替前後の画像差分と目視確認、390px幅の横はみ出し確認、タイル通信失敗時の通知
- 開発サーバーでもスマホ幅の全マーカー表示、Enter / Spaceによる操作、ポップアップの閉じるボタンを確認。WebGL無効時のエラー通知と操作パネルの無効化も確認
- `npm audit`: 脆弱性報告0件（実行時点）

MapLibre本体を含むJSは約1.06 MB（gzip約288 KB）、Workerは約508 KBです。Viteの500 KB超チャンク警告は残しています。サイズ最適化は今後の検証対象です。上記ブラウザー確認はソフトウェアWebGLを使用しており、実機GPU・Safari・Firefox・本番配信先の確認は未実施です。
