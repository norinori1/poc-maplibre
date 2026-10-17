# DEM検証記録（2026-10-17）

## 対象と実行条件

- 生産コード: `f35c49afd8021464d894564f5e48bf0371837052`。ドキュメント・計測スクリプトの追加はこの後のコミット。
- `npm ci` 成功（62 packages、auditで報告0件）、`npm test` **9ファイル60テスト成功**、`npm run build` 成功。
- Windows / Chrome 155。ローカルproduction build + previewの`http://127.0.0.1:4173/poc-maplibre/`。JSは`index-A4gqL0nl.js`、Worker・CSSは同じサブパスで取得。
- 比較日時: `2026-10-17T04:49:34.812Z`。各ルート・間隔ごとにページを開き直してアプリキャッシュを空にし、その後同条件で再実行。**HTTPキャッシュは維持**。ネットワーク完全コールドのベンチマークではない。
- GSI→Mapterhornの順で計測。5/10/20mと30m移動平均。最大400点は両ルートとも未到達。
- [比較の全サンプル・集計・性能（JSON）](dem-evidence/comparison-2026-10-17.json)、[操作検証（JSON）](dem-evidence/interactions-2026-10-17.json)、[RGB検証（JSON）](dem-evidence/rgb-2026-10-17.json)。

## 実測: 生データの集計

| ルート | 間隔 | 点数 | 獲得標高 GSI / Mapterhorn | 下降量 GSI / Mapterhorn | 全体平均勾配 GSI / Mapterhorn |
| --- | ---: | ---: | --- | --- | --- |
| 丸の内（964m） | 5m | 194 | 9.0 m / 6.6 m | 4.0 m / 5.2 m | +0.5 %(上り) / +0.2 %(上り) |
| 丸の内（964m） | 10m | 98 | 9.3 m / 7.2 m | 4.2 m / 5.9 m | +0.5 %(上り) / +0.2 %(上り) |
| 丸の内（964m） | 20m | 50 | 8.7 m / 7.3 m | 3.7 m / 5.3 m | +0.5 %(上り) / +0.2 %(上り) |
| 九段坂（387m） | 5m | 79 | 29.0 m / 26.5 m | 11.7 m / 14.0 m | +4.5 %(上り) / +3.0 %(上り) |
| 九段坂（387m） | 10m | 40 | 23.9 m / 25.5 m | 6.9 m / 13.8 m | +4.5 %(上り) / +3.0 %(上り) |
| 九段坂（387m） | 20m | 21 | 21.9 m / 25.5 m | 4.7 m / 13.8 m | +4.5 %(上り) / +3.0 %(上り) |

検出できた欠測は全条件で両DEMとも0点。Mapterhornの元の欠測が存在しないという意味ではない。
獲得標高・下降量は1m変化閾値。標高は補間後の値で、原測量点ではない。
九段坂5m間隔の30m移動平均後の獲得標高はGSI18.4m / Mapterhorn23.2m。窓幅・間隔で推定値は変わる。

## 実測: 処理時間と取得量

| ルート | 間隔 | 初回(ms) GSI / Mapterhorn | 再実行(ms) GSI / Mapterhorn | 新規取得 GSI / Mapterhorn | 本文(KiB) GSI / Mapterhorn |
| --- | ---: | --- | --- | --- | --- |
| 丸の内 | 5m | 35.9ms / 45.3ms | 1.7ms / 1.3ms | 3 / 4 | 160.6 KiB / 228.9 KiB |
| 丸の内 | 10m | 46.1ms / 34.5ms | 1.0ms / 0.8ms | 3 / 4 | 160.6 KiB / 228.9 KiB |
| 丸の内 | 20m | 21.0ms / 42.2ms | 0.3ms / 0.3ms | 3 / 4 | 160.6 KiB / 228.9 KiB |
| 九段坂 | 5m | 28.2ms / 19.8ms | 0.8ms / 0.5ms | 2 / 2 | 112.6 KiB / 142.4 KiB |
| 九段坂 | 10m | 25.6ms / 16.9ms | 0.5ms / 0.4ms | 2 / 2 | 112.6 KiB / 142.4 KiB |
| 九段坂 | 20m | 25.2ms / 16.7ms | 0.2ms / 0.2ms | 2 / 2 | 112.6 KiB / 142.4 KiB |

再実行は全条件で新規取得0・本文0。初回はアプリキャッシュのみ空で、HTTPキャッシュが効くため数十msの場合がある。
時間は取得・復号・補間・集計（任意の平滑化含む）までで、表とグラフのDOM描画は含まない。
本文サイズはfetchで受け取ったBlobの合計で、実ネットワーク転送量ではない。キャッシュ参照数は画素読み取り単位。
復号済みタイル配列容量はUIで表示。32MiB・128件LRU上限を単体テスト。ブラウザ全体のメモリ使用量は未計測。

## ブラウザで確認した挙動

- 実DEMの地点標高、同一地点を保持したProvider切替、2点勾配の両Providerでの取得。
- 例: 緯度35.68831°・経度139.75318°の表示標高はGSI9.5m、Mapterhorn4.5m（表示座標・標高は丸め値）。
- 2点勾配の実操作例はGSI+3.4% / Mapterhorn+4.9%。全座標と表示値は操作JSONを参照。
- Provider変更で既存プロファイルを再計算。
- GSI応答を意図的に遅延させ、Provider変更後に古い地点・プロファイルの応答を解放しても新しい表示を上書きしない。
- Mapterhornの404と通信断を模擬し、理由を分けて表示。GSIリクエスト0件を確認。
- 375px幅、各サンプル表展開時のページ横はみ出しなし、4系列（両DEM×生/平滑化）と帰属表示。
- 操作ハーネスは`scripts/verify-dem-browser.mjs`、比較計測は`scripts/measure-dem-browser.mjs`。PlaywrightのPageを渡して実行する。ランタイム依存は追加していない。
- 最終bundle`index-A4gqL0nl.js`で、上記9種類の操作検証と12条件比較を再実施し成功。
- 説明用HTMLは1280px・375px幅で確認し、ページの横はみ出しなし。印刷用CSSも同梱（物理印刷は未検証）。

## RGB・形式・CORS

- Mapterhorn公式TileJSONはHTTP 200、`Access-Control-Allow-Origin: *`、Terrarium、512px、XYZ URLを実応答で確認。min/maxzoomはTileJSONにない。
- 東京付近のz15・z16はHTTP 200、z17は404。同一地域全体での最大ズーム・実DEM解像度を保証しない。PoCはz16固定。
- 実タイル`16/58208/25804.webp`: 79,822 bytes、512×512、RGB、lossless VP8L。
- Python/Pillowで復号した全RGBのSHA-256と、ChromeのcreateImageBitmap→Canvasから読んだ全RGBのSHA-256が一致: `1edfdab53db6a175e35d96783242f562827bbd2f20b98ad9e4fd82b8d7307707`。
- 既知RGBの512px PNG/WebPを同じ`decodeTileImage`へ通し、100.5m / −0.25m / 0m / 透明欠測 / 半透明欠測を確認。fixtureは`scripts/dem-rgb-fixtures.json`。
- RGB検証は開発サーバー上の実ソースモジュールで実行。最終production bundleでは実タイルを使ったUI計測を別途確認。

## 未検証・注意点

- 公開GitHub Pagesへのデプロイ・公開URLでの新機能確認は未実施。ローカルで同一ベースパスを確認した結果と区別する。
- 実機モバイル、Safari / Firefox、長距離ルート性能、DEM原資料・実道路高との精度比較、実ネットワーク転送量は未検証。
- Mapterhornの公式生成コードには欠測補完・残存欠測の0m置換がある。配信前に失われたマスクは復元できない。
- 同じ原資料・再標本化・接合部・測量年・鉛直基準の違いがあり、近さや差だけでどちらが正確とは判定しない。
- Viteの500kB超チャンク警告は従来から残る。今回のJSは約1.08MB、gzip約297kB、Worker約508kB。
- 最終npm ciで起動中のViteによるWindows EPERMが一度発生。自分で起動したサーバーを停止し、再実行は成功。
