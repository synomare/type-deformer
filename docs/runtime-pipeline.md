# Editor and renderer boundaries

The editable document remains the source of truth. Project schema v92, seeded
operator geometry, and post-render alpha envelope checks are independent of the
runtime optimizations described here.

## Input and visual updates

`bindRange` writes the logical parameter and its numeric feedback immediately.
`edit-scheduler.js` collects visual callbacks by identity and runs each once per
animation frame. A `change` event and `snapshotGlyphs` flush pending callbacks
before a committed value is rendered or exported. Numeric drafts still commit
through the existing input/change/history path.

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

The worker kernels are generated from the editor. After changing a shared kernel,
run `node scripts/build-surface-worker.mjs`, then its `--check` mode. Do not edit
`surface-worker-kernels.js` directly or equate a smaller payload with lower total
browser RAM; rendering buffers and retained caches have their own budgets.
