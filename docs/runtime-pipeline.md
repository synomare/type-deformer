# Editor and renderer boundaries

The editable document remains the source of truth. Project schema v93 records
document identity, logical source references and font dependencies. See
[current architecture](current-architecture.md) for storage and layout boundaries.
Seeded operator geometry and post-render alpha envelope checks remain separate
from the runtime optimizations described here.

## Shared rendering source

The editor and Surface/Compose Worker instantiate the same `render-engine.js`
factory. Its authored inputs are listed in `render-source/manifest.json`;
`build-surface-worker.mjs` reads and validates those modules without reading
the editor HTML or runtime entry. Function implementations have one owner.
The build rewrites declared external references to explicit environment ports,
and rejects unknown dependencies.

The editor supplies live scene access and UI scheduling callbacks. The Worker
adapter supplies captured frame values, OffscreenCanvas allocation, its font
set and native-preparation scheduling. It does not emulate DOM globals.
`renderedSourceText` is the committed source corresponding to the glyph
snapshot; a newer textarea draft must not change Batch classification in an
older render request. Mobile and reduced-motion preferences travel as separate
snapshot fields.

## Input and visual updates

`bindRange` writes the logical parameter and its numeric feedback immediately.
`edit-scheduler.js` collects visual callbacks by identity and runs each once per
animation frame. A `change` event and `snapshotGlyphs` flush pending callbacks
before a committed value is rendered or exported. Numeric drafts still commit
through the existing input/change/history path.

Long primary-text edits prepare in bounded JavaScript batches, preserving
surviving glyph nodes and cancelling superseded generations. The current
generation commits its structure and authored state together. Unchanged
paragraphs can retain local layout boxes under the checked shaping/width/font
contract. A changed constraint invokes full native measurement. Browser layout,
DOM commit and an explicit pending-edit flush remain synchronous boundaries;
multi-object text edits retain their existing full rebuild path.

Do not move parameter writes or history capture into the visual scheduler.
Consumers that read derived geometry must flush first. Bulk glyph updates pass
`deferInvalidation` and finish with one `flushOperatorVisuals()` call; individual
glyph edits invalidate immediately. Idle autosave waits for numeric gestures to
finish, while explicit save and page exit keep their existing recovery behavior.

## Immutable Surface snapshots

Each `snapshotGlyphs` call owns a fresh cache. `snapshotSurfaceState` keys profiles
by the resolved Batch/local profile object, actual effect strengths, and derived
misregistration offsets. `surface-state.js` interns and freezes identical Surface
objects within that snapshot. All existing renderer properties remain present,
including distinct strength and parameter names such as `cloisterFold` versus
`cloisterFoldAmount`.

Never mutate a source glyph's Surface object. A composition or proof variation
must copy it before overriding fields. Do not retain the interning cache across
source revisions: Batch profiles and global parameters are mutable. Ink bounds
measurements are also local to the snapshot, keyed by text, font, alignment,
baseline and variable-font coordinates.

Neutral glyphs with no effective Surface state skip per-operator envelope and
profile calculations. Manual strengths, including explicit zero, take
precedence over animated current values. This shortcut retains the original
minimum pad and does not reduce the envelope of an active effect.

## Worker transport

`surfaceWorkerSnapshot` packs repeated Surface objects into `frame.surfaces`.
Glyphs reference that table using `surfaceIndex`; clean glyphs retain a null
Surface. Only values that differ from the frame's parameter snapshot are stored
in the table. The worker unpacks the table before font preparation or rendering.
This transport format is internal and is not a new Project schema.

The editor keeps its complete frame identity locally. Actual Surface and Compose
Worker messages contain `id` and `payload`; duplicating the identity string across
the worker boundary is unnecessary. Shared profile references survive structured
clone. Composition paths that need enumerable own settings materialize them
before using the existing glyph copier.

## Queue lifecycle

`render-jobs.js` owns one active job, one waiting job and the last completed
result. Ordinary editing keeps the newest requested frame. Invalidated edit work
can be interrupted, and the edit deadline still bounds stuck workers. Proof and
export jobs are protected from background editing requests and invalidation.
When the explicit result publishes, the preview reads the latest editor state.

Worker errors, message deserialization failures and decoder failures terminate
the failed instance and either start the newest waiting job or expose a retryable
error. Results from old workers are discarded. Disposal closes each distinct
bitmap once, even if it is referenced by multiple result fields. Font buffers
remain caller-owned and are never transferred destructively.

Image preflight distinguishes pending asynchronous scene preparation from a
permanent blocker. When Compose finishes painting, a pending preflight is
evaluated again so output controls recover without an unrelated settings change.

## Explicit image output

PNG/SVG export allows 30 minutes across the isolated renderer request instead of
the comparison renderer's two-minute deadline. Its work budget is 2 GiB on
desktop and 1 GiB on mobile; editing stays at 256/128 MiB and proof at 768 MiB.
These are application allocation ceilings, not reserved RAM or an OS guarantee.

Export and high-quality proof Surface layers travel individually with a `layerAck` handshake. The queue
paints each incoming bitmap and closes it before acknowledging. The worker never
retains a full-size bitmap for every active effect. The destination is seeded
with its actual paper and scene bands, preserving blend operations and opacity.
Native-only effects are drawn between worker layers in the saved Surface order.
Progress reports completed render tiles in that order, including intervening
native effects in the displayed effect count. The export panel shows the current
effect, percent, elapsed time and cancellation. Preparation/PNG encoding use an
indeterminate bar rather than invented percentages. On narrow screens the panel
stays above preview controls so they cannot intercept the cancel button.
No partially composed image is published: an envelope expansion restarts the
assembly, and errors/cancellation discard the isolated output. Pending polls do
not repeatedly allocate full-size PNG destinations; failed destinations and SVG
raster canvases are explicitly released. Existing output dimensions, source
settings, solver accuracy and alpha envelope validation remain independent.

While an isolated output is running, the editor suspends its competing preview
jobs and accepts only one output request. The final PNG uses the completed
assembly canvas directly. Each native effect releases its temporary rasters
before the next effect; streamed layers restore the requested crop clip.
Font loading, solver preparation and bounds work also report their current stage.
Bounds requests use the explicit output budget, including the export solver deadline.
An exhausted edit renderer does not disable the independent output controls.

Lost/unavailable canvas contexts, worker/transport failures and PNG encoding
failures are reported as typed errors. A recoverable failure gets one fresh
isolated renderer with CPU canvas preference, using the same captured settings,
fonts, moment, dimensions, tile size and original deadline. CPU/GPU edge
antialiasing can differ slightly. A second failure stays visible with Retry and
Close controls; cancellation never retries. Cancel, timeout and disposal clear
all frame listeners and timers, including initialization races. Context loss is
checked before transferring/encoding images and again after asynchronous PNG
encoding, so a lost drawing surface is not accepted as a successful empty PNG.
The proof overlay opens after its image decodes; decode failures stay visible.

## Video capture and encoding

`captureVideoRequest` captures the document, frozen render clocks, viewport,
available imported font buffers and output settings synchronously before
encoder setup can yield. Canvas-sized output also records its camera. Font
buffers are copied; the request is deeply frozen. External CSS fonts are still
external dependencies, not immutable byte captures.

`videoFrameRequest` copies this request and derives Compose phase from the frame
index, initial phase, direction and loop count. One persistent isolated renderer
handles the sequence. Its child applies the captured state and produces a PNG;
the parent decodes that PNG into the encoder canvas and closes the intermediate
bitmap. Frame generation does not reread the live editor or alter its phase or
playback. Completion and cancellation redraw the editor's current state instead
of restoring the state from the start of export, preserving intervening edits.

The child currently reloads the captured Project, waits for font readiness and
remeasures layout for each frame. This adds per-frame work and is not a startup
or throughput improvement claim. The iframe is a state-isolation boundary,
not a guarantee of a separate CPU thread: long synchronous native rendering
sections remain nonpreemptible until control returns to the event loop.

The encoder and child renderer use one reservation group, while their estimated
bytes are added separately to the shared capacity. This coordinates concurrent
jobs; it does not measure DOM, driver or total JavaScript heap usage.
[video-encoder.js](../video-encoder.js) preflights frame dimensions and estimated
encoded size, then checks encoded packets and the final buffer against its
memory allowance. Mediabunny still uses `BufferTarget`, and MP4 uses in-memory
fast-start storage. The encoded buffer, muxer data and final Blob can coexist;
the copy factors are estimates rather than an exact browser peak-memory bound.

Cancellation invalidates the job and suppresses late frame/download results.
The muxer's finalization cannot be interrupted. If cancellation arrives during
finalization, the encoder keeps its reservation until that operation settles,
then releases resources without publishing the result. Neither iframe disposal
nor an abort signal promises immediate preemption of every native operation.

## Auto artwork framing and resolution

For Auto / whole artwork outside Compose, `exportTight` defaults to true and
`exportLongEdge` defaults to 8192 (2048/4096 presets, custom 256–16384, or 0 for
the existing scale). Fixed frames and page/spread crops keep their dimensions.
An isolated output first renders the captured scene at up to 2x, bounded by an
8192px side / 16MP measurement canvas. It scans every pixel in strips against
transparency or the selected paper, then keeps a configurable 0–10% gutter of
the measured long edge (default 1%, at least four measurement pixels). An empty measurement preserves
the original frame and the existing blank-output validation.

The measured layout is transient to that output request. PNG, proof and SVG's
embedded Surface image draw again at the requested destination density; they
do not upscale the measurement bitmap. The shared analysis grid, clock, text
positions and effect topology stay unchanged. A new destination is allocated
between measurement and final drawing, including same-size transitions.
The full-resolution tight PNG proof uses the export resource budget/deadline too;
otherwise an 8192px image can fail proof's older 64MP intermediate limit even
when the PNG export is supported. Other proof-sheet budgets remain unchanged.
Before encoding, a native-density scan checks the composed image again. Ink at
an edge expands that side of the output camera by 20% and redraws; a safe frame
can tighten to its measured ink, with at most three tightening steps and eight
total corrections. Unstable bounds fail explicitly instead of saving clipped
ink. SVG's raster effect layers use the same validated camera. This additional
pass preserves thin/density-dependent extensions absent from the first probe;
extreme local intermediates still obey the export allocation limits.

Tight output sets `nativeLocalDensity` on its render context. Glyph-local Field
Material canvases use destination pixels per world unit, the largest singular
value of the glyph transform, and their own analysis density. They must not
inherit the global canonical-grid multiplier: that can allocate a much larger
intermediate than the final image. Local contexts retain the parent's software
preference, remaining work budget and canvas limits; cache keys separate these
densities. This changes raster precision, not the material's analysis pixels.
The normal allocation limits and explicit failure handling still apply; 8192px
is a requested size, not a guarantee for every combination of effects or device.

Before the ink pass, preflight checks the requested long side without treating
the unmeasured safety envelope as the final aspect ratio. Final allocation
still validates both sides, pixel area and memory. PNG `pHYs` stores equal X/Y
pixels per metre for 72/150/300/600 dpi (default 300); the metadata rewrite leaves
IDAT, alpha and colour chunks unchanged. DPI controls print dimensions, not
raster detail. The chosen filename stem is sanitized and timestamped inside the
captured output state. After a successful download, the parent retains only the
latest encoded Blob for exact repeat saving, along with its actual dimensions,
file size and PNG print size. Project files retain output settings; the last
Blob exists only in the current tab and does not enter Project/autosave data.

## Regression checks

- `npm run test:shared-rendering`: scheduler, profile sharing/transport, worker
  lifecycle, resource scopes, tiling and output precision.
- `npm run test:parameters`, `npm run test:autosave`, `npm run test:text-edit`:
  numeric gestures, source/Undo ordering, recovery and persistence.
- `npm run test:e2e`: actual browser gestures, output, fonts, restart safety and
  clipping regressions, five-effect proof/PNG content comparison, injected worker
  and blank-canvas failures, recovery and repeated clicks during output.
- `npm test`, `npm run test:preview`, `npm run check:release:local`: complete local
  regression and runtime dependency closure.

The remaining legacy worker kernels are generated from the editor. Plotter Trace,
Webbing and Soft Blob use the authored `shared-surface-renderers.js` module in
both contexts; see [Operator contracts](operator-contracts.md). After changing a
legacy kernel or its dependency graph, run `node scripts/build-surface-worker.mjs`,
then its `--check` mode. Do not edit `surface-worker-kernels.js` directly or equate
a smaller payload with lower total browser RAM; rendering buffers and retained
caches have their own budgets.
