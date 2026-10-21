# Changelog

## 0.3.0-preview.1 — 2026-10-21 typing responsiveness (local, unpublished)

- Measure the path a person waits on after typing (keyboard input, debounce,
  cooperative revision, commit, layout) with `scripts/benchmark-text-input.mjs`.
  The older layout benchmark calls the synchronous rebuild directly.
- For documents of 2,000 or more glyphs, layout marks the full-scene image
  preflight stale instead of evaluating it on every committed edit. It runs
  while its panel is on screen and idle, and always before PNG/SVG/Copy/Preview;
  a blocked result still stops those actions. The explicit export check reports
  instead of stopping.
- Check Marbling and Auxetic glyph strength before normalising per-glyph
  settings in their effect-pad and request passes (same result, no work for
  unaffected glyphs).
- Read the stage size in Blob Track only for an active glyph. Restoring resting
  glyphs during Undo no longer forces one reflow per character.
- Read a neutral glyph's inline deformation channels in one pass when building
  the glyph snapshot.
- Fix the text-layout e2e hook that still called the parameter search function
  after it moved into the panel controller.

## 0.3.0-preview.1 — 2026-10-20 structural follow-up (local, unpublished)

- Move the runtime entry out of the HTML and separate model defaults, viewport
  gestures, camera capture, font library, Look Memory and responsive controls
  into authored factories with explicit dependencies and owned state.
- Build one rendering engine from authored source modules and a checked
  manifest for all 100 Surface routes and eight Compose generators. The editor
  and Worker use the same implementation; the build no longer extracts code
  from HTML, and the Worker no longer supplies fake DOM globals.
- Include both source manifests and their modules in content identity, release
  closure and test/build source readers.
- Prepare long primary-text edits in cooperative batches, cancel superseded
  revisions, reuse surviving glyph nodes and checked paragraph measurements,
  and preserve Undo/source/export state. Skip Surface-envelope work for neutral
  glyphs while retaining active-effect bounds.
- Release camera streams that arrive after cancellation or fail during playback
  setup; refresh Fit controls even when the resulting view transform is unchanged.

## 0.3.0-preview.1 — 2026-10-19 structural repairs (local, unpublished)

- Move working copies to IndexedDB with separate tab branches, pinned restart
  originals and checkpoints before opening another Project. Expose recovery
  download/reopen without rotating these records away during ordinary saves.
- Reconcile exit journals into their original branch and pinned recovery in one
  transaction. Clear only a matching committed journal, reject stale queued
  saves and reuse exactly matching checkpoints when content hashing is available.
- Block editing and application shortcuts while startup restoration is pending;
  unlock them after success or storage failure without changing each control's
  independent disabled state.
- Introduce Project v93 validation, pure compatibility preparation, document
  IDs/revisions and logical source references. Keep v92 and earlier import
  adapters, report corrections, and restore the prior state after failed apply.
- Validate known per-letter Operator state, document revisions and exact source
  references before import. Preserve manual XY offsets for Data Mosh, Blob Track
  and legacy misregistration when restoring their state.
- Identify imported fonts by content hash, expose missing dependencies and
  explicit relinking, and keep font bytes outside Project/Share files.
- Separate logical text order and float layout snapshots from independent
  deformation targets; preserve whitespace kinds and delegate bidi/run layout
  to the browser with optional ligatures disabled. Cache immutable measurements
  by source, element identity, layout inputs and font epoch, with geometry reads
  grouped before target-position writes.
- Avoid export measurements of partially rebuilt text and reuse a full glyph
  snapshot for equivalent unfiltered output. Invalidate geometry before updating
  preflight so changes to size and deformation do not reuse stale bounds.
- Defer 84 operator panels and their 523 range/select controls until first use;
  keep unmounted controls searchable through template metadata. The other 32
  panels remain immediate. Total memory and startup speed are not established
  by this change.
- Keep an artwork region visible beside mobile controls and add keyboard entry,
  navigation, movement and cancellation for stage selection.
- Author Operator definitions directly in the immutable source registry and
  derive editor/catalog tables from it; retain explicit numeric contracts. Share the
  authored Plotter Trace, Webbing and Soft Blob renderers between editor and
  Worker. The remaining extraction at this stage is replaced by the
  2026-10-20 follow-up above.
- Default SVG to a raster-backed portable result and make editing metadata
  optional. Text SVG retains font dependencies and may retain clipped-out text.
- Capture immutable video input before asynchronous setup and render frames in
  an isolated document, preserving edits made during output. Check frame/order/
  size and resource estimates; release owned resources after success, cancellation
  or failure. Encoded video remains buffered in memory.
- Record a normalized source-content BuildInfo identity in Project and Share.
  Separate app version, file schema and renderer revision.
- Extend local release closure to documentation links and keep historical
  private research references out of the distribution. Add document lifecycle,
  font and layout regression scenarios; command execution and platform evidence
  are recorded separately from this change list.

See [current architecture](docs/current-architecture.md),
[known limitations](KNOWN_LIMITATIONS.md) and
[verification scope](docs/verification-scope.md). This entry does not claim a
deployment, a complete renderer/module migration or real-device acceptance.

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
