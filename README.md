# TLC Rf Analyzer

展開したTLCプレートの写真から、スポットの重心と **Rf値** を求めるブラウザアプリです。
インストール不要・オフライン対応（PWA）で、画像は端末の外に送信されません。

**▶ アプリを開く: https://ebonyebonite.github.io/tlc-rf-analyzer/**

## 使い方

| 手順 | 内容 |
| --- | --- |
| 1. 読込 | 写真を選択（ドラッグ＆ドロップ、貼り付け、スマホのカメラ撮影も可） |
| 2. 面合わせ | プレートの四隅を合わせて台形補正。プレートは自動検出され、溶媒先端側が上になるよう90°回転できます。実寸を入れると縦横比と縮尺に使われます |
| 3. 縮尺（任意） | 長さの分かる線に合わせるか、プレート実寸から。Rf値だけなら不要 |
| 4. 原点・先端 | 原点の線と溶媒先端の線（自動検出＋手動調整、傾きにも対応） |
| 5. スポット | タップで追加、またはレーンごとに自動検出。背景との色の差からスポットの範囲を決め、重心を求めます |
| 6. 結果 | 表をCSV・注釈付き画像・クリップボードに出力。作業ファイル（.json）に保存して再開できます |

### Rf値の求め方

- 原点の線に**垂直な方向**に、原点 → スポット重心の距離 *d*<sub>spot</sub> と、同じ位置での原点 → 溶媒先端の距離 *d*<sub>front</sub> を測り、Rf = *d*<sub>spot</sub> / *d*<sub>front</sub> とします（線が傾いていても正しく測れます）。
- 「Rf範囲」はスポットの下端〜上端のRfです（テーリングの目安）。
- 「ものさし」ツールでは、ドラッグで引いた線の長さを基準線との比で比べることもできます。

### スポットの判定

背景（プレートの地の色）を場所ごとに推定し、各画素の「背景との違い」を次のどれかで計算します。

- **背景との色の差 (ΔE)** — 既定。UV下の消光スポットも発色スポットも検出できます
- **暗さ** — 明度が下がった部分だけを見る
- **参照色の色相方向** — スポットをタップして採取した色の方向だけを見る（色の異なるスポットや汚れを区別したいとき）

タップした位置付近のピークから、ピークの一定割合（しきい値）以上の範囲を広げてスポットとし、重心は濃さで重み付けした値（または形の中心）を使います。

## 操作

- 拡大・縮小: マウスホイール / ピンチ / 右上のボタン（F で全体表示）
- 移動: 空いた所をドラッグ / 右ドラッグ / スペース＋ドラッグ / 2本指
- 元に戻す: Ctrl+Z、選択したスポットの削除: Delete

## 開発

ビルド不要の静的サイトです（HTML / CSS / JavaScript モジュール）。任意の静的サーバーで配信してください。

```bash
npx http-server -c-1 .
```

`localhost` ではService Workerを登録しません（`?sw=1` で有効化）。

---

## English

A browser app that measures **Rf values** from photos of developed TLC plates. No install, works offline (PWA), and images never leave your device.

1. **Import** a photo → 2. **Align** the plate corners (perspective correction, auto-detected) → 3. optional **Scale** → 4. **Origin / solvent front** lines → 5. **Spots** (tap to add or auto-detect per lane; the region that differs in colour from the local background is grown and its centroid used) → 6. **Results** (CSV, annotated PNG, clipboard, saved work file).

Rf is measured perpendicular to the origin line, so tilted lines are handled. The UI is available in Japanese and English.

## License

MIT
