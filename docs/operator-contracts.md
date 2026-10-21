# Operator and numeric contracts

`operator-registry.js` owns the immutable OperatorSpec for all 116 operators.
Each specification records its label, evaluation layer and order, strength mode,
guide, discovery capabilities, rendering route, surface order, source behavior,
and mixer parameter keys. The editor's legacy tables and the discovery catalog
are derived views. Do not add a second surface ID list or mixer key map.

The registry contains 103 surface operators: 100 use Surface Worker and 3 retain
their native route. The generator validates the actual renderer map against
these declarations before writing anything. The 72 glyph body operators retain
their existing source-opacity defaults. `scripts/test-operator-contracts.mjs`
checks route coverage, unique short IDs, panels, guides, all six mixer key maps,
and nested immutability.

`parameter-definitions.js` contains explicit specifications for 841 static
controls. A specification has independent `slider`, `domain`, `budget`, and
`reason` fields. Changing a name or slider travel cannot alter the legal domain
or computation budget. Aliases retain their explicit unit conversions. The
complete migrated definitions and aliases match the previous numerical contract
exactly; the test records its SHA-256 baseline. This preserves existing policy,
including previously chosen constraints, rather than claiming a new physical
validation of every operator.

New controls must supply an explicit specification. Runtime font axes register
the domain declared by the font. Viewer ranges such as comparison wipe and
exploration position do not enter the document parameter model. Missing document
specifications fail visibly instead of inferring semantics from their labels.

`shared-surface-renderers.js` now owns the actual Plotter Trace, Webbing, and
Soft Blob implementations plus the catenary and spore-field helpers. Editor and
Worker both import this module. Their thin wrappers inject the current frame's
state and the remaining rendering helpers. Native Canvas comparisons against
the previous implementation produced identical nonempty rasters for all three;
the checked-in tests cover editor/Worker pixel equality, two phase states,
repeatability, and zero assignments. This is an initial module migration: the
other 97 Worker renderer implementations and additional helpers still use the
HTML dependency extractor. `worker-dependencies.json` identifies the migrated
renderers explicitly.

The extractor uses the declared public `acorn` dependency. After editing legacy
renderer dependencies, run `node scripts/build-surface-worker.mjs`, then
`node scripts/build-surface-worker.mjs --check`. Module bodies themselves are
authored source, not generated copies. Native Canvas tests do not establish
browser, real-device, or visual-design acceptance.
