# Changelog

## 0.2.0-preview.1 — 2026-09-28 Wasserstein execution

- Fuse Sinkhorn matrix traversals, reuse convergence products and convert the
  kernel to its transport plan in place, preserving every numerical operation.
- Split source analysis, target rasterization, transport and reconstruction into
  independently reusable stages within the existing combined 64 MiB allowance.
- Reuse densities and Tracks contours on colour/Edge changes; skip transport
  entirely at Ink/Density endpoints and skip unchanged glyph/group readbacks.
- Fix disappearing target endpoints after a render scope closes, including
  separate proof-density targets and explicit font invalidation.
- Add scalar-reference, ownership and cache-key regressions plus reproducible
  editing sequences and optional stage profiling to the operator benchmark.


## 0.2.0-preview.1 — 2026-09-28 operator computation

- Share exact nearest-site search, planned FFTs and byte-bounded numerical caches.
- Separate fluid/optical solutions from colour, relief and exposure; compact mask
  identities losslessly and verify candidates even under a hash collision.
- Reduce Repulsive Curves pair work without removing global forces or changing
  the accepted optimization trajectory.
- Reuse material outputs before source rasterization, share the glyph text spec
  with the painter and invalidate caches when fonts are installed.
- Keep dense Chromatic Swarm paths on a deterministic software canvas to avoid
  observed accelerated-canvas stalls and empty output on Windows Chrome.
- Add a reproducible Worker benchmark and numerical/cache regression tests.
  See [operator computation](docs/operator-performance.md) for limits and sources.

## 0.2.0-preview.1 — 2026-09-28 runtime improvements

- Share immutable Surface profiles within each glyph snapshot and transmit each
  profile once per Worker frame. Keep frame identity strings on the editor side.
- Coalesce range-control visual updates, flush them on commit/output, and wait
  until numeric gestures finish before idle autosave.
- Visit authored effects during Undo/Project serialization, cache repeated ink
  measurements, and avoid updating discarded glyphs during text reconstruction.
- Protect explicit proof/export jobs from background preview invalidation; recover
  from Worker message/decode failures and dispose aliased bitmaps once.
- Refresh image preflight after Compose finishes so temporary calculation waits
  do not leave PNG/SVG controls permanently disabled.
- Document runtime ownership and invalidation in [runtime pipeline](docs/runtime-pipeline.md).

## 0.2.0-preview.1 — 2026-09-21 restart safety

- 起動・更新時は自動保存の文字だけを復元し、エフェクト・Compose・大きな書式設定を持ち越さない。前回のエフェクト付き作品は描画せずProjectメニューからJSONで退避可能。
- 編集後の更新・移動にブラウザ標準の警告を追加。モバイルでの警告保証には依存せず、安全な起動を優先。
- 編集用の作業予算をPC 256 MiB／モバイル128 MiBへ分離。明示的な高品質確認・書き出しの768 MiBは維持。
- 編集Workerは8秒で停止し、手動の描画停止／再開も追加。停止時・効果解除時にWorkerと完成画像を解放する。
- Project JSONのUTF-8を明記し、WebKitの別タブ表示で日本語が文字化けする経路を修正。

## 0.2.0-preview.1 — 2026-09-21 font update

- 単一フォントはImport後すぐ適用。大量Libraryの検索と、読取／デコード失敗の理由表示・再試行を追加。
- FileReader互換経路、読み取りタイムアウト、失敗時の登録巻戻しを実装し、現在の書体と後から選んだ書体を保護。
- TTC／OTCの先頭書体を単体フォントとして読み込み、Installed fontsも選択した書体のbytesを描画・書き出しへ共有。Workerへは使用中の書体だけを渡す。
- OffscreenCanvasの2D描画に対応しない環境では互換描画へ切り替え、効果描画のWorker起動エラーを防止。
- Chrome／Edgeに加え、WebKitのモバイル相当設定でフォント回帰を追加。実iPhoneのファイルプロバイダーは別の確認範囲。

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
