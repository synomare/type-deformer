# Operator computation and cache boundaries

This change optimizes the existing operator definitions. It preserves the source
resolution, numerical iteration counts, seeds, preview/export geometry and the
post-pixel render envelope. It does not add an operator or change project v92.

## Shared numerical kernels

`numerical-kernels.js` owns rectangular radix-2 FFT plans, exact 2D nearest-site
search and byte-bounded caches for source-dependent numerical solutions. The
editor and Surface Worker load the same implementation.

Chromatic Swarm rebuilds a balanced kd-tree on each Lloyd iteration when there
are at least 24 sites. Queries visit the near branch first and retain the far
branch when its distance bound equals the best distance. Equal-distance sites
select the lowest original index. Samples and weighted sums stay in their
original order; empty cells retain their old positions. Small populations use
the direct loop. This reduces search work without approximate neighbors.

Vortex Bath and Diffractive Glyph share planned FFT permutations and twiddles.
Twiddles use the original recurrence, and butterfly operations retain their
order. Plans own at most 512 KiB of numeric buffers. Vortex also reuses projection
scratch arrays and viscosity factors, shares the velocity backtrace, memoizes
spatial driving forces and reuses interpolation scratch during shading.

## Separate a physical solution from its appearance

- Vortex stores its dye and velocity fields independently of colour and relief.
- Diffraction stores its three intensity bands independently of colour and exposure.
- Repulsive Curves reuses its sampled glyph domain before the existing geometry cache.

The solution caches retain at most 8 MiB, 16 MiB and 4 MiB, respectively, with
16 entries per cache. Together with FFT plans their configured numeric storage
limit is 28.5 MiB per JavaScript realm. Wasserstein now registers its existing
64 MiB allowance in the same diagnostic registry, bringing the reported total
to 92.5 MiB (each Worker/editor owns separate caches).
The mask is part of each byte budget. Ordinary 8-bit glyph alpha
is stored compactly only when conversion reproduces every Float32 value exactly;
other fields retain their original precision. A fingerprint only finds a candidate:
an exact source comparison establishes a hit, including under a hash collision.

`TypeDeformerNumerics.cacheStats()` reports retained numeric storage by solver.
`clearCaches()` releases it. These figures do not include JS object overhead,
existing geometry/history caches, browser/driver allocations or total process RAM.
The existing 256/128 MiB edit and 768 MiB explicit-output working budgets remain.

## Avoid rasterizing a source to discover a cache hit

The Canvas text painter and material source identity share `surfaceGlyphTextSpec`.
Character, font, alignment, baseline, rotation and placement therefore have one
source of truth. The material fast path also checks source geometry, settings,
colour, seed, physical density and purpose. It retains a descriptor and a reference
to a currently owned output entry, never a live source scratch canvas.

Unknown hosts without a source identity use the pixel-verified path. That path
compares source alpha after its fingerprint and includes scale and local font
identity. Translation-independent masks can share outputs. Font installation
and FontFaceSet completion invalidate descriptors and advance their revision.
Evicted outputs cannot be revived by an old descriptor, and their alpha masks
are released even while a descriptor retains the entry object. The 32 MiB raster cache
now counts its retained alpha identity as well as its Canvas buffers.

## Dense Canvas paths

Chromatic Swarm explicitly requests `willReadFrequently` at canvas creation.
On the tested Windows Chrome backend, densely overlapping multiply-composited
paths intermittently produced an empty accelerated canvas and multi-second stalls.
The software raster path remained deterministic. Render Context now carries this
explicit preference to both the logical and physical canvas before the first
context call; a later `getContext` call cannot change an existing context. This
choice is local to Swarm and preserves its points, paths, alpha and plate order.
Software/hardware antialiasing can differ, so its dense parity control uses the
same software backend on both versions.

## Repulsive Curves

All tangent-point interactions remain in the energy. A conservative axis-aligned
bound skips exact segment distance only when that pair cannot lower the current
minimum clearance or enter the short-range barrier. It does not prune distant
repulsive forces. Endpoint distance powers are reused across adjacent edge pairs;
their temporary matrices are used only up to 512 vertices (at most 6 MiB).
Gradient accumulation order, Armijo tests and accepted positions are preserved.
An accepted state is reused only when the length target is identical.

The independent pre-optimization all-pairs evaluator/minimizer in
`scripts/repulsive-reference.mjs` checks energy, every gradient component, minimum
clearances, the complete optimization history and final coordinates. Existing
finite-difference, barrier, topology and determinism tests remain active.

Differential Type removes temporary contact candidate arrays and unnecessary
read-only generator yields. A trial with coarser Worker scheduling was dropped
because the browser measurements did not show a useful gain. Growth steps,
cooperative cancellation and history refinement keep their existing contract.

## Reproduce measurements

Start the repository's static server, then run:

```powershell
node scripts/measure-operators.mjs --url http://127.0.0.1:4188 --baseline C:/path/to/before --operators repulsiveCurves,vortexBath,diffractiveGlyph --repeats 3 --output C:/path/to/results.json
node scripts/measure-operators.mjs --url http://127.0.0.1:4188 --baseline C:/path/to/before --operators chromaticSwarm --font-size 180 --dense --repeats 3 --output C:/path/to/dense.json
node scripts/measure-operators.mjs --url http://127.0.0.1:4188 --baseline C:/path/to/before --sweep --output C:/path/to/pixels.json
```

The baseline directory contains pre-change runtime files at their original
relative paths. Missing baseline files fall back to the unchanged checkout;
use a complete baseline for unrelated future changes. Without `--baseline`, only
the current version is measured. The harness uses installed Chrome, Arial/system
CJK fallback, fixed seed 41 and an isolated Worker per operator. It records cold
render, three warm renders, actual operator colour changes and material-only
controls. Alternating version order and repeat medians reduce startup bias.
The harness applies the actual editor styles and waits for font readiness.
`--scale 2 --purpose proof --sweep` checks output density. `--software-canvas`
is a diagnostic control; `--images C:/path/to/images` saves cold output PNGs.
Alpha pixel counts expose empty frames rather than treating a digest as proof
of successful drawing. Render-envelope retries are included. RGBA SHA-256 hashes describe final rendered
layers, not just serialized geometry. Timings are local fixtures, not device-wide
or all-parameter guarantees.

## Local measurement (2026-09-28)

Installed Chrome 153.0.8010.53 on Windows, `AB字形`, Arial with system CJK
fallback, 72 px, seed 41, randomness 0, three independent Workers per version.
The baseline includes the preceding runtime/snapshot changes. Median Worker
compute time includes envelope retries, but excludes editor layout, messaging,
PNG encoding and startup. Neither version runs with reduced solver iterations.

| Operation | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Repulsive Curves, cold | 8262.9 | 5049.0 |
| Vortex Bath, cold | 1871.6 | 1505.2 |
| Vortex Bath, ink | 1775.3 | 131.1 |
| Vortex Bath, relief | 1760.8 | 113.5 |
| Diffractive Glyph, cold | 1384.6 | 1420.5 |
| Diffractive Glyph, ink | 1368.3 | 180.2 |
| Diffractive Glyph, exposure | 1328.0 | 159.8 |

Diffraction trades roughly 3% in this cold case for substantially faster material
edits. This is not a claim that all operators or cold renders became faster.
Chromatic Swarm at 180 px, cell 5 and eight relaxation steps measures 403.4 to
364.9 ms cold, with **software canvas forced in both versions** for a stable
comparison. The accelerated baseline intermittently returned empty frames and
multi-second stalls; those failed renders are not a valid speedup denominator.

The 100-operator Worker sweep matches 99 default-fixture RGBA hashes. Fifteen
of these fixture layers are transparent and establish no nonempty visual coverage.
Swarm differs with the backend change; its dense software-controlled before/after
comparison matches exactly. A separate 2x proof-density software control matches
Repulsive, Vortex, Diffraction and Swarm. These checks do not cover all settings
or claim total browser RAM, real-phone performance or long-duration saturation.

## Primary references and applied decisions

- [Dave Mount, Answering Queries with kd-trees, pp. 6–9](https://www.cs.umd.edu/class/spring2021/cmsc420-0101/Lects/lect13-kd-query.pdf):
  lower bounds and near-first traversal inform the exact nearest-site search;
  the lowest-index tie rule preserves this application's prior behavior.
- [Adrian Secord, Weighted Voronoi Stippling](https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/secord.2002b.pdf):
  the weighted centroid rule is preserved; only finding the closest site changes.
- [FFTW, Using Plans](https://www.fftw.org/fftw3_doc/Using-Plans.html):
  reusable immutable transform preparation informs the plan lifetime. This
  implementation uses its own JavaScript FFT and does not incorporate FFTW code.
- [Yu, Schumacher and Crane, Repulsive Curves](https://www.cs.cmu.edu/~kmcrane/Projects/RepulsiveCurves/index.html):
  global tangent-point interactions remain. The operator still uses its own
  bounded L-BFGS adaptation, not the paper's Sobolev/multigrid solver.
- [MDN, Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas):
  reuse repeated drawing work; neither glyph coordinates nor output resolution
  were rounded down for performance.

- [MDN, Canvas getContext attributes](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext): `willReadFrequently` selects software 2D rendering; attributes must be set on first context creation.

## Wasserstein Letters: exact computation and stage ownership

The 38–144 analysis grid, weighted cell centroids, Float64 full coupling,
1800-iteration limit, 1e-7 stopping threshold and 10-iteration checks remain.
Normalization and transpose accumulation share each kernel row while it is hot;
column sums still accumulate in source order. Convergence products are reused
on the next iteration. The completed kernel becomes the plan in place, removing
the second dense allocation. Splat coordinates retain the original expression
order. Reflected filtering reuses two work buffers, and marching squares rejects
non-crossing cells before allocating their edge objects. Independent scalar
reference tests compare all plan values, diagnostics, densities and segments.

Four caches replace the former monolithic solve cache without raising its total:

| Stage | Limit | Identity / retained value |
| --- | ---: | --- |
| Logical analysis | 4 MiB | Verified source/target alpha, dimensions, scale, whole-text mode; distribution |
| Target glyph | 8 MiB | Text, effective font, angles, font revision, physical density; owned Canvas and distribution |
| Transport | 40 MiB | Source/target distribution identities, entropy, metric; full coupling |
| Reconstruction | 12 MiB | Transport identity, progress, resolution; density and/or contour loops |

Plans never own target canvases. Every render resolves a live target; retained
canvases are explicitly retained and released on LRU eviction or invalidation.
This fixes the previous target canvas being erased by render-scope cleanup and
then reused at Transfer=1. Endpoint rendering now bypasses the transport solve;
diagnostics mark unsolved cost and marginal errors as null, iterations as zero.
Target identities distinguish proof density. Explicit font additions invalidate
both material identities and target caches, even without a loadingdone event.
The target's logical mass identity is independent of its physical Canvas, so
even an oversized 4x export target that cannot enter the Canvas LRU can reuse
the same transport and reconstruction. Only its actual alpha establishes a hit.

Glyph and whole-text output descriptors skip source rasterization when all
inputs are unchanged. Group identities include transforms, opacity, effective
font, target orientation and material state. Unknown callers without the host's
complete source identity continue to use exact pixel verification. No output
entry is trusted after eviction, and no descriptor owns a temporary source.

Colour/Edge changes reuse densities; Tracks colour edits reuse all 11 contours.
The reconstructed field cache stores no transport references, so old progress
samples cannot pin evicted dense matrices. Byte counts include typed buffers,
physical Canvas storage and conservative point/path allowances; they are not a
measurement of all browser memory or all JS overhead.

Research reviewed 2026-09-28: [Cuturi 2013, §4/Algorithm 1](https://papers.nips.cc/paper/2013/file/af21d0c97db2e27e13572cbf59eb343d-Paper.pdf)
supports the matrix-scaling formulation. [Schmitzer 2019, §§3.1–3.3](https://arxiv.org/pdf/1610.06519)
distinguishes stabilization, epsilon scaling and kernel truncation. A local
20/40/80-step epsilon-scaling trial reduced some extreme solves but changed the
finite-iteration coupling (L1 differences up to about 1.6e-6); it was not adopted.
Loop unrolling and a second transposed kernel also showed no consistent benefit.
No kernel truncation, approximate correspondence, lowered resolution, higher
entropy or relaxed stopping tolerance is used by the shipped change.

The benchmark accepts `--params` as JSON or a JSON file, `--sequence` as a JSON
array of `{mode, changes}` steps, and `--profile` for cumulative inclusive stage
timings. Normal benchmarks run without instrumentation. `--images` captures all
steps. Compare endpoint output against a fresh same-state render as well as the
old version, since the old warm target endpoint can be completely transparent.
