# Verification scope

This page maps checks to their claims. It does not record a successful run.
For a change or release, retain the exact command, source revision/build ID,
environment, result and output artifact. Existing historical pass counts do not
certify the current working tree.

## Configured browser coverage

The current [Playwright configuration](../playwright.config.js) and
[CI workflow](../.github/workflows/validate.yml) define these execution targets:

| Target | Engine / OS | Device model | Scope |
| --- | --- | --- | --- |
| Local `chrome` | Chromium / host OS | Desktop, plus viewport changes in tests | All matching browser specs |
| Local `edge` | Chromium / host OS | Desktop, plus viewport changes in tests | All matching browser specs |
| CI `chromium` | Chromium / Ubuntu | Desktop, plus viewport changes in tests | All matching browser specs |
| `webkit-fonts` | Playwright WebKit / host or CI OS | 390 × 844, DPR 2, mobile and touch emulation | Font, restart, text-layout, long-text, workspace and delivery specs (the historical project name is retained) |
| Firefox | No configured project | Not established | Not covered by this configuration |
| iPhone / iPad Safari | Actual Apple hardware and OS | Real device | Not established by these commands |

Configuration is not execution evidence. Chrome and Edge use the same engine;
WebKit emulation does not exercise iPhone Files, iCloud providers, operating-system
memory termination, the software keyboard, safe areas or actual touch input.
Use the recorded engine/OS/device for a result rather than the word “mobile”.

## Regression layers

| Layer | Entry points | What it can establish |
| --- | --- | --- |
| Numeric and structural contracts | `npm test` | Mathematical properties, known fixtures, state transitions, shared engine generation and authored-function regressions |
| New module boundaries | `npm run test:contracts` | Project validation/preparation, font content identity, operator/source ownership, explicit engine/Worker dependencies and logical source/layout contracts |
| Preview support modules | `npm run test:preview` | Discovery, preflight, preset loading, envelopes and video support logic |
| User journeys | `npm run test:e2e` | Browser behavior of the actual scenarios executed, including downloads and persistence |
| Generated source | `node scripts/build-surface-worker.mjs --check` | Authored renderer modules, shared engine and Worker wiring are synchronized without reading the editor |
| Build provenance | `node scripts/build-info.mjs --check` | Generated source hashes/app/schema metadata match the current canonical source text |
| Local dependency closure | `npm run check:release:local` | Required local runtime and documentation targets exist |
| Tracked dependency closure | `npm run check:release` | The same targets also belong to the Git-tracked release set |
| Performance | `scripts/measure-preview.mjs`, `scripts/measure-operators.mjs`, `scripts/benchmark-text-layout.mjs` | Timings for their recorded input, font, cache state and browser environment |

Function presence, nonempty output and pixel equality are useful regression
claims; none of them alone establishes a successful import transaction, useful
interaction latency, a recoverable document or a well-composed image.

## Document-lifecycle scenarios

New or changed persistence/font paths need browser scenarios at their actual
failure boundary. Tests should preserve a uniquely marked original so a default
or earlier backup cannot accidentally satisfy the assertion.

- Restart formatting-only, effect and Compose documents; download the full
  original, then save repeatedly and confirm the pinned original remains.
- Open another Project with unsaved changes, recover the previous document and
  its Undo history, and reject malformed/future data before changing the scene.
- Save two tabs alternately and concurrently; recover both branches and verify
  each tab's saved/unsaved display against its own committed revision.
- Fail IndexedDB open, abort a transaction and inject capacity failure; confirm
  the prior record remains and that the UI offers manual Project saving.
- Hold actual startup storage completion and try physical text input and global
  keyboard shortcuts; confirm they cannot mutate the pending document, then
  verify editing and manual saving after both successful and failed startup.
- Import identical font bytes under changed names/timestamps, import different
  bytes with the same filename, restart, relink a legacy reference and verify
  that missing dependencies are reported before a final output is accepted.
- Compare Latin kerning, mixed RTL/Latin/numbers/brackets, direction isolates,
  tabs/nonbreaking spaces and joining scripts with a browser text reference;
  preserve source-target identity through selection, editing, Undo and reload.
- Interrupt pending long-text preparation with further input, Undo and Project
  replacement; compare saved source references, manual state and export geometry.
  Compare paragraph reuse with forced full native measurement, including width,
  direction and font changes.
- Pan/zoom/reset the viewport, hand control back from mobile panels and confirm
  saved artwork is unchanged. Release acquired camera streams on late permission
  completion, failed playback setup and page disposal.

These are claim boundaries, not an assertion that every case is already covered.
Failure injection tests the injected path; it does not simulate every form of
real browser eviction or power loss.

## Performance and visual acceptance

Record cold start, warm repeat and an actual edit separately. Include text length
and script, font origin and readiness, operator/settings, resolution, cache state,
browser/OS, wall time and peak memory measurement method when available. Benchmark
timings do not automatically describe end-to-end UI latency. Compare the same
input and output contract before claiming an optimization.

At 320/390px, test whether the artwork remains visible while a value is adjusted,
not just whether horizontal overflow is zero. Repeat with keyboard open and in
landscape on a real device before extending device support. Export verification
must inspect the downloaded artifact as well as the visible preview.

Keep technical regression images separate from visual evaluation. Judge intended
changes using real copy, the chosen reference level, unresolved critique, small
and final-size output, and the user's acceptance. Automated checks do not assign
visual approval or certify Illustrator/InDesign import, color proofing, CMYK,
bleed or physical print production.
