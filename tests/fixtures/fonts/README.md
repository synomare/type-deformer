# Font test fixtures

Original geometric test glyphs authored for Type Deformer regression tests, distributed under this repository's MIT license. They contain only a rectangle, a space, A and U+3042 mappings. No third-party font data is included.

Narrow has a 350-unit advance, Wide a 950-unit advance (1000 units per em). OTF uses equivalent CFF outlines; WOFF/WOFF2 encode Narrow; the TTC contains Narrow then Wide. These intentionally simple faces let browser tests detect real font loading versus fallback, without depending on operating-system fonts.
