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

## Regression checks

- `npm run test:shared-rendering`: scheduler, profile sharing/transport, worker
  lifecycle, resource scopes, tiling and output precision.
- `npm run test:parameters`, `npm run test:autosave`, `npm run test:text-edit`:
  numeric gestures, source/Undo ordering, recovery and persistence.
- `npm run test:e2e`: actual browser gestures, output, fonts, restart safety and
  clipping regressions.
- `npm test`, `npm run test:preview`, `npm run check:release:local`: complete local
  regression and runtime dependency closure.

The worker kernels are generated from the editor. After changing a shared kernel,
run `node scripts/build-surface-worker.mjs`, then its `--check` mode. Do not edit
`surface-worker-kernels.js` directly or equate a smaller payload with lower total
browser RAM; rendering buffers and retained caches have their own budgets.
