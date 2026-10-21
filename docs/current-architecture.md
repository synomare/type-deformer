# Current architecture and remaining boundaries

This describes the source tree as it is being repaired in October 2026. It is
an implementation map, not a release announcement or a test-pass report. The
historical feature notes are in [development history](development-history.md).

## Authored modules and runtime entry

[index.html](../index.html) contains page markup, styles and ordered script
references. [editor.js](../editor.js) connects the document, controls, history,
preview and output. It no longer contains the shared renderer implementations.
The [editor source manifest](../editor-source/manifest.json) names the authored
modules and their declaration owners for build and test tooling.

The UI factories own separate state and receive explicit data/callback ports:

- [editor-model.js](../editor-model.js) constructs independent parameter defaults,
  Batch classification/options, limits and source parameter definitions.
- [camera-view-controller.js](../camera-view-controller.js) owns viewport gestures,
  pan/zoom state and its listeners.
- [blob-camera-controller.js](../blob-camera-controller.js) owns camera capture,
  detection and overlay state, reporting changed frames to the editor.
- [font-library-controller.js](../font-library-controller.js) owns imported font
  sources, loading generations, relinking and library controls.
- [look-memory-controller.js](../look-memory-controller.js) owns slot controls,
  confirmation, thumbnails and comparison UI. The editor captures/applies the
  document through callbacks.
- [editor-panels-controller.js](../editor-panels-controller.js) owns responsive
  sections, focus, control hydration and parameter navigation.

These factories do not discover editor closure variables. Mutable parameter and
Look Memory objects passed to them retain their identity when a Project is
applied; changing their contents must not silently disconnect a controller.
Document application, operator interaction, output and their orchestration
remain substantial parts of the editor entry.

## Document capture and storage

[project-codec.js](../project-codec.js) owns the v93 file envelope, validation,
copying and document session identity. It checks known parameter/profile scalar
types and numeric domains, and uses the canonical Operator registry to validate
known per-letter toggles, intensities and manual numeric/pair values. Source
references must contain the exact text at their UTF-16 range; present document
IDs and revisions must have the declared types. Legacy omissions remain valid.
Unknown Operator records and extension fields remain in the validated copy and
original with warnings; that does not give them a rendering meaning in this version.

It also rejects invalid version types, future versions, non-finite numbers,
dangerous object keys, cycles, excessive nesting and excessive text/structure
size. This is not a complete semantic schema for Composition, Look Memory,
font manifests or every legacy payload: those still depend on their application
adapters after generic safety/size checks. Validation returns a separate object
and import warnings. [project-migrations.js](../project-migrations.js)
contains parameter/profile normalization and legacy conversions as pure
preparation functions. It receives defaults, numeric contracts and registries
explicitly; it returns prepared parameters/profiles and before/after corrections.
The editor applies the prepared document only after validation and preparation.
Application rollback restores the captured document without remigrating it.

A document ID identifies the editing document; its revision marks subsequent
edits. A workspace branch is a different concept: it identifies a tab's durable
working copy. Opening or restoring a Project forks a working document rather
than letting a different tab overwrite the same storage key.

Share v93 carries logical source references, the active font manifest and a
compact renderer descriptor alongside its sparse effect state. Decoded Share
content is limited to 8 MiB. Share remains a transport for editing state, not
a font package or a rendered geometry archive.

[workspace-store.js](../workspace-store.js) owns IndexedDB access and serializes
writes. Its `documents` records retain a current and previous Project; its
`recoveries` records retain pinned originals and optional Undo/Redo history.
Before switching documents, the editor commits a checkpoint. Before a safe
restart clears effects and formatting, it checkpoints the full previous Project,
including a document that only changed type size or layout. The Project menu
lists working copies and recovery records for reopening or JSON download.
Ordinary saves do not rotate away pinned recoveries.

Projects, history and retained raw data are copied before a checkpoint enters
the asynchronous queue. Where SHA-256 is available, the checkpoint key covers
its reason and all three captured payloads; the existing record is reused only
after exact content comparison. Different content is retained, including a
different history for the same Project. Replaying an identical current Project
does not replace the retained previous generation with a duplicate.

Each page has a distinct writer and branch. BroadcastChannel updates the recovery
list; it does not merge documents or make this a collaborative editor. Save
completion is compared against the current document ID and revision before
displaying the saved status. A synchronous localStorage exit journal covers
pending work. Startup pins the journal, reconciles its original working branch
and updates the active-branch pointer where necessary in one IndexedDB
transaction, then rereads the selected branch. Revision, writer sequence and
capture time prevent an older queued save from replacing newer recovered work.
The startup journal is removed only after commit and a check that its raw
contents are unchanged. An ordinary save clears a journal only when branch,
document ID, revision and Project content match both the captured save and the
committed record. Legacy localStorage autosaves remain an import path; primary
and backup records are tried independently.

While asynchronous startup restoration is pending, the body is inert and marked
busy, and a capture listener stops application keyboard shortcuts. Browser
default shortcuts are preserved. A finally step unlocks editing after success
or failure without rewriting individual controls' disabled state. A storage
failure still permits manual Project saving and editing.

Browser storage remains local to the origin/profile. Capacity, permissions,
interruption, private browsing and site-data deletion can prevent persistence.
Recovery records are retained rather than silently pruned; this can consume
space. They are not cloud backup, and reopening an older record does not prove
that all browser or operating-system failure modes have been covered.

## Source text and layout

[text-layout.js](../text-layout.js) separates logical source identity from visual
DOM order. A deformation target records its source ID, UTF-16 range, source text,
unit kind and grapheme ranges. Current tokens retain ordinary spaces, tabs,
nonbreaking spaces and direction controls. Joining-script text is kept in runs
to preserve browser shaping. A target can therefore be a grapheme or an entire
joining run; it is not necessarily one Unicode code point or one painted glyph.

Browser inline layout resolves kerning, direction and line wrapping before the
editor positions independent deformation targets. Optional ligatures are disabled
for this target model. The adapter measures floating-point boxes, captures input
styles and caches an immutable layout snapshot per text container. Reuse
requires the same target elements and a matching signature of source ranges,
text, layout mode, dimensions and relevant type/layout styles. A changed font
epoch invalidates reuse after font registration or selection. The measurement
phase groups geometry reads before per-target position writes; the editor then
uses those boxes for page layout and deformation frames. Legacy v92 visual
ordering is reproduced only by the migration adapter, then associated with
logical source ranges.

An engine capability probe compares continuous text with split inline nodes.
If splitting changes kerning, measurement temporarily combines equal-style,
equal-language text into contiguous runs while retaining paragraph, text-object
and joining-run boundaries. Range measurements exclude remote zero-width bidi
caret rectangles. The original target nodes are restored, including on a
measurement exception, so their listeners and source identities remain intact.
This fallback addresses a browser layout difference; it is not a speed claim
or evidence of real-device Safari coverage.

During a text rebuild, page-control updates do not trigger export measurements
of the intermediate glyph set. A completed layout invalidates the prior glyph
snapshot before updating preflight. Unfiltered output and forced full capture
can share the same snapshot at the same revision; deformed-only subsets remain
separate. Explicit preflight still resolves dirty layout before measuring it.

Ordinary source revisions of at least 2,000 characters/targets use cooperative
preparation. Tokenization and snapshot/node preparation yield between batches;
the scheduler aims for eight-millisecond JavaScript slices. A generation token
invalidates superseded work, and only the current job commits. Surviving source
IDs keep their DOM nodes and authored state. Undo/Redo and Project replacement
cancel pending jobs instead of allowing them to overwrite the later document.
The displayed source and the newer textarea draft remain distinct until commit.

Layout can reuse an unchanged paragraph's local boxes when its elements,
shaping inputs, available inline measure and font epoch agree. Changed
paragraphs undergo native measurement; a changed available inline width falls
back to full measurement. Text-object geometry, grid layout and unconstrained
widths retain the conservative full-measurement path where reuse cannot be
proved. Source references and paragraph offsets are rebuilt even when local
glyph boxes are reused.

The cooperative text revision path currently covers the primary text stream;
explicit multi-object text editing retains its existing synchronous rebuild.
Explicit capture/save flushes a pending revision to keep text, source references
and per-letter state coherent. DOM commit, browser style/layout, full
measurement and explicit flushes can still block. The slice budget is not a
maximum latency guarantee, especially for very large or complex documents.

This is a browser layout adapter, not a platform-independent shaping engine.
Browser version, CSS layout, available fonts, shaping and rasterization can still
change output. The grapheme fallback and script grouping are not a claim of full
Unicode segmentation, bidirectional-text or language conformance. A layout
snapshot is an execution boundary, not an archived outline/geometry file.

## Font dependencies

[font-registry.js](../font-registry.js) identifies imported bytes by SHA-256 and
collection face index. Renaming a file or changing its modification time does
not change this content identity. The extracted face has a separate buffer hash.
Concurrent loads of the same content share decoding and registration; failed
registration rolls back the installed face instead of leaving a ready record.

Project font manifests record dependencies and source metadata, not font bytes.
After restart, the same content must be imported again. A legacy reference needs
an explicit relink; replacement with a different content identity also requires
confirmation. Collection import currently selects face zero, not all faces.
Installed fonts use the same content path after Local Font Access supplies bytes.

Missing imported dependencies block capture/output paths that require the font.
External CSS families are a separate dependency class: availability information
does not give them a content hash or make downloaded Google Fonts immutable.
The browser's fallback and a byte-identical imported font are different states.

## Operators, parameters and rendering

[operator-registry.js](../operator-registry.js) is the immutable definition of
the 116 operators, authored directly rather than generated from the HTML.
Catalog metadata, evaluation order, surface routes and mixer keys are derived
views consumed by the editor and validated by the Worker generator.
[Operator contracts](operator-contracts.md) documents
the explicit numeric domains and work budgets; these retain prior policy and
do not establish physical accuracy of every model.

[operator-panels.js](../operator-panels.js) defers mounting 84 of the 116 operator
panels, containing 523 range/select controls, until their first selection. Their
markup is already present in inert HTML templates; mounting moves it into the
connected document and installs the queued listeners once. The other 32 panels
retain immediate initialization. Parameter navigation, search and parameter
ownership can inspect unmounted template metadata. This reduces initial
connected controls and listener installation; it is not a claim that all panel
markup or objects are absent from memory, or that initial render time improved.

[render-source/manifest.json](../render-source/manifest.json) declares the
authored renderer modules, 100 Surface routes, eight Compose generators,
entrypoints, internal state and environment ports. The modules group Surface
geometry, glyph geometry, native preparation, renderers and Compose. The
separate [shared-surface-renderers.js](../shared-surface-renderers.js) module
continues to own Plotter Trace, Webbing and Soft Blob.

[scripts/build-surface-worker.mjs](../scripts/build-surface-worker.mjs) validates
those sources and emits [render-engine.js](../render-engine.js). Both editor
and Worker instantiate this same engine factory. The build does not read
`index.html` or `editor.js`, infer dependencies from their closure, or replace
renderer function bodies for the Worker. Undeclared identifiers and undeclared
`globalThis` properties fail the source contract. The generated
[worker-dependencies.json](../worker-dependencies.json) records the source
signature, owners and dependency graph.

[surface-worker-adapter.js](../surface-worker-adapter.js) provides Worker
capabilities and immutable frame inputs. Canvas allocation, font access, media
preferences, committed source text and preparation scheduling are explicit
ports. The Worker does not supply fake `document`, `window` or textarea
objects. Engine caches and native preparation controllers belong to each
engine instance. The editor adapter can read live editor state; Worker inputs
come from the captured frame.

Surface and Compose Worker routing requires Worker, FontFace and a working
OffscreenCanvas 2D context. When that capability check fails, rendering uses the
available main-thread canvas path. The Worker deadline does not interrupt that
fallback's synchronous work.

The [runtime pipeline](runtime-pipeline.md) describes immutable Surface
snapshots, render queues, invalidation, isolated output, memory ceilings and
output bounds. Purely renaming modules or reducing transfer bytes does not
establish lower total memory, faster first render, visual quality or complete
isolation of the document model from UI state.

Video captures the document, available imported font buffers, viewport, output
settings and applicable Canvas camera before asynchronous encoder setup. Each
frame derives its Compose phase from that captured request and renders in the
same isolated child document. The parent decodes the returned PNG frame for the
encoder; it does not apply the frame to the editing document or restore an old
editor phase/playback state after completion or cancellation.

The child currently reapplies the captured document and measures layout for
each frame. Isolation does not establish fast generation or immediate
interruption of synchronous native rendering. The encoder also retains its
encoded output in memory. See the [video boundary](runtime-pipeline.md#video-capture-and-encoding)
for reservation, memory-estimate and cancellation limits. External CSS fonts
remain external dependencies rather than captured immutable font files.

## Verification and release files

[scripts/build-info.mjs](../scripts/build-info.mjs) hashes the root runtime
JavaScript/CSS, `index.html`, vendor modules, preset JavaScript, both source
manifests and every authored module declared by them. Text is read
as UTF-8 with CRLF/CR normalized to LF, so platform checkout line endings do not
change the content identity. The renderer revision combines those SHA-256 hashes
with app and schema versions. The generated [build-info.js](../build-info.js)
has no build timestamp and excludes itself from its input list.

Project and Share store the compact `appVersion`, `schemaVersion` and
`rendererRevision` descriptor. A different renderer revision produces an import
notice. `npm run build:runtime` regenerates Worker output before the manifest;
`node scripts/build-info.mjs --check` detects stale generated metadata. This
identifies the listed source content, not a Git commit, OS, browser, GPU or
external font response. Preserving this descriptor alone cannot replay a past
renderer or guarantee identical pixels.

[Verification scope](verification-scope.md) separates unit contracts, actual
browser journeys, performance measurements, real-device checks and visual
acceptance. A passing source scan is not a substitute for reopening work in a
browser after a storage, font or rendering failure.

`scripts/check-release.mjs` follows runtime references and local Markdown/image/
anchor targets from release documents. The local command checks existence;
`--require-tracked` also requires every reachable file to be tracked by Git.
Remote availability and heading fragments are outside this check. Historical
private source names are plain code text rather than broken public links; their
files are not silently added to the distribution.
