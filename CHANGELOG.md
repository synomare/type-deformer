# Changelog

## 0.2.0-preview.1 — 2026-09-20 update

- 描画の共通作業メモリ予算を192→768 MiBへ拡張。完成レイヤー・Compose・動画の予算も引き上げ、一時Canvas／バッファは字形・タイルごとに解放。
- 編集操作で不要になった重いWorker処理を中断し、最新の入力へ切り替える。アニメーション、高品質確認、書き出しは中断対象外。
- 読み込み済みのローカルフォントのWorkerへの重複転送を削減。Worker再起動・読込失敗時は再送して復旧。
- パラメーター表示を変更項目単位で更新。数値の入力途中・通常スライダー範囲外の値、Undo／Redo、Project保存復元を維持。
- Project schema v92、Operatorの生成規則と描画後の欠け検出は変更なし。

## 0.2.0-preview.1 — Initial release

- 116 Operator／436 Presetを収録し、6つの制作目的、厳選、Favorite、Recentから探せるDiscoverを追加。
- Preset atlas／Library、数値control、モバイルstepperを必要時に初期化し、初期DOMと通信量を削減。
- CurrentとLook A–Dを作品状態を変更せず比較できるHeader Compareを追加。
- PNG／SVG／動画に、形式・実寸・範囲・背景・Raster内包・frame数・推定メモリを示すPreflightを追加。
- 動画を固定frame数のMediabunny＋WebCodecs経路へ移行。MediaRecorder経路は公開操作から除外。
- Preview表記、noindex、OGP、Privacy、権利範囲、第三者通知、release closure検査を追加。
- Project、Autosave、Share URL、Look Memory、User Presetの保存schemaはv92のまま維持。

初回Preview公開: 2026-09-14。上記の日付付き更新は同じPreview版への修正です。
