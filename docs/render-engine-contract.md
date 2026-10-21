# Shared render source contract

`render-source/manifest.json` owns the renderer source graph. Its ordered modules
contain named JavaScript declarations, grouped by geometry, surface rendering,
native solvers, and composition. `declarationOrder` preserves initializer order
across module boundaries. Module declarations and the order must agree exactly;
duplicate names, missing entrypoints, and undeclared dependencies fail the build.

`scripts/build-surface-worker.mjs` reads this manifest and its modules, and produces
`render-engine.js`, `worker-dependencies.json`, and the small Worker bootstrap
`surface-worker-kernels.js`. HTML and editor implementation files are not build
inputs. A test forbids those reads while running the real build with `--check`.
The build also checks `surface-worker.js` against the manifest's explicit
`workerEntrypoint` dependency list, catching environment ports that were left
unconnected during migration.

Both editor and Worker instantiate `TypeDeformerRenderEngine.create(environment)`.
The factory contains the same 100 Worker renderer routes and eight composition
generators in both environments. The editor's composition wrapper retains its job
scheduling decision, then invokes the shared `evaluateCompositionScene` entrypoint
when evaluating locally. The Worker invokes that same entrypoint with its captured
source glyphs.

The environment contract distinguishes live state, function hooks, and platform
capabilities. Frame parameters, composition state, source text, clocks, input
samples, scratch canvases, and font metrics remain environment-owned. Accessors make replacement of
these values visible without copying a stale snapshot into the engine. The
engine owns its preparation pools, glyph caches, and
other internal mutable declarations. Exported state accessors let the editor
invalidate or advance that state without maintaining a second copy.

`surface-worker-adapter.js` supplies OffscreenCanvas allocation, captured fonts,
captured input values, and explicit solver status hooks. The Worker advances its
solvers itself; it does not schedule editor animation frames or mutate UI status.
Canvas allocation and media preferences use named `createRenderCanvas` and
`matchesRenderMedia` capabilities; no DOM-shaped object is supplied. Mobile layout
and reduced-motion preference are captured separately. Composition reads the
committed source text so an input draft cannot get ahead of its glyph snapshot.
The Worker creates no global `document` or `window` substitutes. Batch targets and
parameter options come from the same pure `TypeDeformerEditorModel` factory used
by the editor.

The dependency checker has an explicit global allowlist. A dependency is accepted
only when it is a manifest declaration, an environment port, or a listed global.
Named `globalThis` properties have a separate allowlist; the `TypeDeformer` name
prefix grants no exception.

Run `node --test scripts/test-render-source-contract.mjs` for manifest coverage,
unknown-dependency rejection, missing-port handling, actual Worker bounds jobs,
live frame replacement, and cache/pool ownership checks. Deterministic Canvas comparisons are separate from
browser rendering, GPU behavior, font loading, and device testing.
