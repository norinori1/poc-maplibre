# DEM供給元の切り替えによる地図ずれの調査・修正（Issue #11）

対象: [Issue #11](https://github.com/norinori1/poc-maplibre/issues/11)。調査基準は `a9b54f5dc053e097e28c841150725ed6b5a76f23`。

## 再現と原因

PC幅でGSI→Mapterhornと切り替えると、同じ地点が画面上で動くことを再現した。
1280×800px・初期状態では、地図領域の高さが **2000.84375px→2038.84375px**、canvasの高さが **2001px→2039px** となり、3地点のマーカーはいずれも縦に **19px** 動いた。GSIに戻すと元に戻った。

`.app` のCSS Gridでは地図と操作パネルが同じ行にあり、地図の `.map-area` が行全体に伸びていた。
供給元によって出典説明の高さが変わると地図の高さも変わり、MapLibreがcanvasをリサイズするため、中心座標を変えていなくても地物の画面位置が変わる。
地点結果、プロファイル、比較表の展開も同じレイアウト変化を起こす。

供給元は標高の計測用であり、ベースマップは常にOSM。`setTerrain` は使用していない。
今回再現した表示ずれはDEMの座標変換・タイルの位置ずれではなく、地図領域の高さの変化によるもの。

## 修正

`src/style.css` の地図領域に次を適用した。

- PC（幅761px以上）: `height: 100dvh` と `align-self: start` で、パネルの内容量から地図の高さを独立させる。
- `position: sticky; top: 0` で、長いパネルをスクロールしても地図を画面に保持する。
- 幅760px以下: 従来の縦並びと `height: 55dvh; min-height: 360px` を維持し、stickyを解除する。

地図の最小高さは360px。画面の高さ自体が変わった場合は地図もリサイズする。

## 検証

2026-10-23、Windows / Node.js **24.22.1** / Chrome **155** / ソフトウェアWebGL。
production buildを `http://127.0.0.1:4175/poc-maplibre/` で確認した。

- `npm ci`: 成功、auditの報告0件。
- `npm test`: **9ファイル・60テスト成功**。
- `npm run build`: 型チェック・ビルド成功。従来の500kB超チャンク警告は継続。
- 新規ブラウザー検証: **4サイズ×9項目=36項目成功**。1280/761/760/375×800px。
- 既存 `verify-dem-browser.mjs`: **9項目成功**。実DEMの地点・2点勾配・プロファイル、古い非同期結果の無視、模擬404/通信断での暗黙GSIフォールバック防止、375px幅、帰属・配信サブパスを確認。

新規の [`verify-dem-map-stability.mjs`](../scripts/verify-dem-map-stability.mjs) は、地図を手動移動してから、供給元の往復切り替え、地点結果、地点の供給元切り替え、プロファイル、プロファイルの供給元切り替え、両DEM比較、サンプル表の展開、画面幅の往復変更を行う。
各操作の前後で、地図・canvasの寸法と3マーカーの座標変換が完全に一致することを検査する。地点の緯度経度の保持、横はみ出しなし、PCの地図がスクロールで画面外に出ないことも確認する。
MapLibreのResizeObserverによるリサイズ完了を待って測定する。

このハーネスはCSS修正前のproduction buildでは最初の `1280px GSI to Mapterhorn` で失敗し、地図の高さ38px・各マーカーの縦位置19pxの変化を検出した。CSS修正後に同じ寸法・位置のアサーションを保持して成功した。

修正後、PCの地図は高さ800px、スマホ幅は440pxで一定。実際のGSI/Mapterhornタイルを使用し、新規検証では通信の差し替えなし。未捕捉のブラウザーエラー0件。

証跡:

- [表示安定性36項目・寸法・マーカー座標・bundle識別子](dem-evidence/map-stability-2026-10-23.json)
- [既存操作9項目・実DEM結果・模擬エラー](dem-evidence/interactions-2026-10-23.json)
- [PCの表示](screenshots/dem-map-stable-desktop.png)、[スマホ幅の表示](screenshots/dem-map-stable-mobile.png)

再実行は既存の検証と同様、PlaywrightのPageを渡す。

```js
import { verifyDemMapStability } from './scripts/verify-dem-map-stability.mjs';
const receipt = await verifyDemMapStability(page, 'http://127.0.0.1:4175/poc-maplibre/');
```

実行時の補足: 起動中のpreviewがWindowsで依存ファイルを保持し、`npm ci` が一度EPERMで失敗した。自身のpreviewを停止後、再インストール・ビルドは成功。
既存の操作ハーネスはHTTP 304も失敗扱いするため、最初の実行は末尾のassetチェックで失敗した。今回の9項目の成功証跡はCDPでHTTPキャッシュを無効にして取得したもの。新規の表示安定性検証ではHTTPキャッシュを無効化していない。

## 検証範囲

ローカルproduction previewの結果。GitHub Pagesへの反映、モバイル実機、Safari/Firefoxは未確認。
DEM原資料の水平位置・標高精度を比較した結果ではない。
