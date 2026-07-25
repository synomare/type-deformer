# tools/

## build-confuse-dictionary.mjs

Rebuilds `../confuse-dictionary.js`, the data file `index.html` loads as
`window.TYPE_DEFORMER_CONFUSE_DICTIONARY` for the Confuse operator's
`unicode` / `deep` / `hanmax` dictionary profiles (the `core` profile is
embedded directly in `index.html` and needs no external data).

### Usage

```sh
node tools/build-confuse-dictionary.mjs [--out <path>]
```

- Requires Node.js 18+ (uses the built-in `fetch`, `zlib`, `fs`, and
  `child_process` modules only — no npm dependencies).
- `--out` defaults to `../confuse-dictionary.js` (i.e. the repo root).
- Downloaded upstream files are cached in `tools/.cache/` (gitignored) so
  repeat runs don't re-fetch unchanged data. Delete that directory to force
  a clean pull.
- If the environment's HTTPS egress goes through a proxy that Node's
  built-in `fetch` doesn't pick up automatically, re-run with
  `NODE_USE_ENV_PROXY=1` (Node >= 22.21):
  ```sh
  NODE_USE_ENV_PROXY=1 node tools/build-confuse-dictionary.mjs
  ```
- `Unihan.zip` is extracted with the `unzip` binary when it's on `PATH`;
  otherwise the script falls back to a small built-in ZIP reader that uses
  `zlib.inflateRawSync`. Both paths produce identical output.
- Output is deterministic: every object's keys and every array's elements
  are sorted before serialization, so running the script twice against the
  same upstream snapshot produces a byte-identical file.

### Data sources

| Output | Upstream source |
| --- | --- |
| `skeleton` | `Public/security/latest/confusables.txt` (UTS #39) |
| `hanVisual` / `hanVariant` / `hanSemantic` | `Unihan_Variants.txt` inside `Public/UCD/latest/ucd/Unihan.zip` (`kSpoofingVariant`, `kSimplifiedVariant`/`kTraditionalVariant`/`kZVariant`, `kSemanticVariant`/`kSpecializedSemanticVariant` respectively) |
| `hanRadicalStroke(Groups)` / `hanTotalStroke(Groups)` / Japanese-restricted variants | `Unihan_IRGSources.txt` (`kRSUnicode`, `kTotalStrokes`, `kIRG_JSource`) |
| `hanEquivalent` | `EquivalentUnifiedIdeograph.txt` |
| `hanStandardized` | `StandardizedVariants.txt` |
| `hanCompatibility` | `UnicodeData.txt` (canonical singleton decompositions of the CJK Compatibility Ideograph blocks) |
| `ivsJapanese` / `ivsOther` | `IVD_Sequences.txt` — the `Adobe-Japan1` / `Hanyo-Denshi` / `Moji_Joho` collections are treated as Japanese; every other collection lands in `ivsOther` |

All of the `han*` maps built from Unihan/UCD variant-style fields
(`hanVisual`, `hanVariant`, `hanSemantic`, `hanCompatibility`,
`hanEquivalent`) are stored as symmetric adjacency lists: if the source data
only records the relationship in one direction, both directions are added so
either character looks up the other.

### Verifying against the committed `confuse-dictionary.js`

The committed file's header records the exact Unicode/IVD snapshot it was
built from (e.g. `Unicode confusables 17.0, Unihan/UCD 17.0 ... IVD
2025-07-14`). Re-running this script against `latest` will only reproduce it
byte-for-byte if the upstream `latest` pointers still resolve to that same
snapshot — once Unicode ships a new version, the numbers will legitimately
differ. When checking a fresh run against the committed file, compare
`meta` statistics and spot-check a handful of characters rather than
diffing raw bytes, unless you know both were built from the same UCD/IVD
release.
