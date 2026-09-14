import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../structural-operators.js';

const structural = globalThis.TypeDeformerStructuralOperators;
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../operator-catalog.js', import.meta.url), 'utf8');

test('the v67 structural suite exposes nine independent deterministic operators', () => {
  assert.deepEqual(structural.ids, [
    'fiberBody', 'glyphMutation', 'suspendedSyntax', 'livingTextField',
    'innerEruption', 'recursiveGraft', 'structuralCollision', 'peelWeave',
    'voidPressure'
  ]);
  assert.equal(new Set(structural.ids).size, 9);
  for (const id of structural.ids) {
    const schema = structural.schemas[id];
    assert.ok(schema, id);
    for (const [key, value] of Object.entries(schema.defaults)) {
      if (schema.options[key]) assert.ok(schema.options[key].includes(value), `${id}.${key} option`);
      if (schema.limits[key]) assert.ok(value >= schema.limits[key][0] && value <= schema.limits[key][1], `${id}.${key} limit`);
    }
    assert.ok(structural.effectPad(id, schema.defaults, 52) >= 0, `${id} pad`);
  }
  assert.equal(structural.internals.hash(2, 5, 17), structural.internals.hash(2, 5, 17));
  assert.notEqual(structural.internals.hash(2, 5, 17), structural.internals.hash(2, 6, 17));
});

test('counter analysis separates enclosed voids from the outside field', () => {
  const width = 20, height = 20, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 3; y <= 16; y++) for (let x = 3; x <= 16; x++) {
    if (x >= 7 && x <= 12 && y >= 7 && y <= 12) continue;
    data[(y * width + x) * 4 + 3] = 255;
  }
  const holes = structural.internals.findInteriorVoids(data, width, height, 1);
  assert.equal(holes.length, 1);
  assert.ok(Math.abs(holes[0].x - 10) < 1 && Math.abs(holes[0].y - 10) < 1);
  assert.ok(holes[0].area >= 30 && holes[0].area <= 40);
});

test('recursive growth preserves generation bounds and changes by grammar', () => {
  const start = { x: 10, y: 10 };
  const dendrite = structural.internals.buildRecursiveBranches(start, 0, 60, 4, 28, 17, 'dendrite');
  const splice = structural.internals.buildRecursiveBranches(start, 0, 60, 4, 28, 17, 'splice');
  const coral = structural.internals.buildRecursiveBranches(start, 0, 60, 4, 28, 17, 'coral');
  assert.equal(dendrite.segments.length, 15);
  assert.equal(dendrite.endpoints.length, 8);
  assert.equal(splice.segments.length, 4);
  assert.ok(coral.segments.length > dendrite.segments.length);
  assert.deepEqual(dendrite, structural.internals.buildRecursiveBranches(start, 0, 60, 4, 28, 17, 'dendrite'));
});

test('Suspended Syntax cable satisfies every discrete point-load equilibrium jump', () => {
  const solve = structural.internals.solveSuspensionCable;
  const lowSag = solve([20, 50, 83], [1.4, 2.8, 0.9], 0, 100, 12, 24);
  const highSag = solve([20, 50, 83], [1.4, 2.8, 0.9], 0, 100, 12, 72);
  assert.equal(lowSag.points[0].y, 12);
  assert.ok(Math.abs(lowSag.points.at(-1).y - 12) < 1e-9);
  assert.ok(Math.abs(Math.max(...lowSag.points.map(point => point.y)) - 36) < 1e-9);
  assert.ok(Math.abs(Math.max(...highSag.points.map(point => point.y)) - 84) < 1e-9);
  for (let i = 0; i < lowSag.loads.length; i++) {
    assert.ok(Math.abs(lowSag.slopes[i + 1] - lowSag.slopes[i] + lowSag.loads[i]) < 1e-9, `load ${i} equilibrium`);
  }
  assert.deepEqual(lowSag, solve([20, 50, 83], [1.4, 2.8, 0.9], 0, 100, 12, 24));
});

test('Suspended Syntax gantry balances reactions and integrates a supported beam chord', () => {
  const beam = structural.internals.solveSuspensionBeam([25, 50, 75], [2, 5, 2], 0, 100, 18);
  assert.ok(Math.abs(beam.reactionLeft + beam.reactionRight - 9) < 1e-9);
  assert.ok(Math.abs(beam.reactionRight * 100 - (2 * 25 + 5 * 50 + 2 * 75)) < 1e-9);
  assert.ok(Math.abs(beam.points[0].y) < 1e-9 && Math.abs(beam.points.at(-1).y) < 1e-9);
  assert.ok(Math.abs(structural.internals.beamDeflectionAt(beam, 50) - 18) < 1e-9);
  assert.ok(Math.abs(structural.internals.beamDeflectionAt(beam, 25) - structural.internals.beamDeflectionAt(beam, 75)) < 1e-9);
});

test('Suspended Syntax mobile keeps source order and balances torque at every bar', () => {
  const leaves = [
    { x: 4, weight: 1.1, label: 'S' }, { x: 18, weight: 3.2, label: 'Y' },
    { x: 39, weight: 0.8, label: 'N' }, { x: 67, weight: 2.4, label: 'T' },
    { x: 91, weight: 1.7, label: 'A' }
  ];
  const root = structural.internals.buildSuspensionMobile(leaves);
  const order = [];
  function inspect(node) {
    if (node.leaf) { order.push(node.leaf.label); return; }
    const leftArm = node.x - node.left.x, rightArm = node.right.x - node.x;
    assert.ok(leftArm >= 0 && rightArm >= 0);
    assert.ok(Math.abs(node.left.weight * leftArm - node.right.weight * rightArm) < 1e-9);
    inspect(node.left); inspect(node.right);
  }
  inspect(root);
  assert.equal(order.join(''), 'SYNTA');
  assert.equal(structural.internals.suspensionMobileDepth(root), 3);
  assert.deepEqual(root, structural.internals.buildSuspensionMobile(leaves));
});

test('Suspended Syntax anchors match the host rotation for vertical Latin glyphs', () => {
  const glyph = {
    x: 0, y: 0, w: 10, h: 20, ox: 0, oy: 0, tx: 0, ty: 0,
    rot: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1, upright: false
  };
  const layout = { dx: 0, dy: 0, s: 1 };
  assert.deepEqual(structural.internals.suspensionPointOnGlyph(glyph, 0, 0, 1, layout, true), { x: 15, y: 5 });
  assert.deepEqual(structural.internals.suspensionPointOnGlyph(glyph, 1, 1, 1, layout, true), { x: -5, y: 15 });
  const bounds = structural.internals.suspensionGlyphBounds(glyph, 1, layout, true);
  assert.deepEqual({ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }, { x: -5, y: 5, w: 20, h: 10 });
  glyph.upright = true;
  assert.deepEqual(structural.internals.suspensionPointOnGlyph(glyph, 0, 0, 1, layout, true), { x: 0, y: 0 });
});

test('Suspended Syntax pad covers its widest legal supports and members', () => {
  const defaults = structural.schemas.suspendedSyntax.defaults;
  assert.ok(Math.abs(structural.effectPad('suspendedSyntax', defaults, 108) - 147.6) < 1e-9);
  assert.ok(Math.abs(structural.effectPad('suspendedSyntax', {
    suspensionDrop: 320, suspensionTypeSize: 24, suspensionCable: 16
  }, 220) - 417.2) < 1e-9);
});

test('every v67 structural operator remains wired through v68 persistence', () => {
  const defaults = Object.fromEntries(Object.entries(structural.schemas).flatMap(([id, schema]) =>
    Object.keys(schema.defaults).map(key => [key, id])));
  for (const id of structural.ids) {
    assert.ok(html.includes(`<option value="${id}">`), `${id} option`);
    assert.ok(html.includes(`data-operator-panel="${id}"`), `${id} panel`);
    assert.match(html, new RegExp(`${id}: \\{ id: '${id}', short:`), `${id} definition`);
    assert.ok(html.includes(`${id}: surfaceOperatorStrength(m, '${id}')`), `${id} glyph strength`);
    assert.ok(html.includes(`${id}: structuralSurfaceRenderer('${id}')`), `${id} renderer`);
    if (id === 'suspendedSyntax') {
      assert.ok(html.includes("surfaceOperatorStrength(metrics[i], 'suspendedSyntax') > 0.002 ? structuralPad('suspendedSyntax', profile) : 0"), `${id} full structural bounds while active`);
    } else {
      assert.ok(html.includes(`surfaceOperatorStrength(metrics[i], '${id}') * structuralPad('${id}', profile)`), `${id} bounds`);
    }
    assert.ok(catalog.includes(`'${id}'`), `${id} catalog`);
  }
  for (const [key, id] of Object.entries(defaults)) {
    assert.match(html, new RegExp(`\\b${key}:`), `${id}.${key} default`);
    assert.ok(html.includes(`'${key}'`), `${id}.${key} Batch key`);
    assert.ok(html.includes(`${key}: deform.${key}`), `${id}.${key} glyph payload`);
    if (structural.schemas[id].options[key]) {
      const control = 'p' + key[0].toUpperCase() + key.slice(1);
      assert.ok(html.includes(`bindProfileSelect('${control}', '${key}'`), `${id}.${key} select binding`);
      assert.ok(html.includes(`chooseParam('${key}', BATCH_PARAM_OPTIONS.${key})`), `${id}.${key} normalization`);
    } else {
      const control = 'p' + key[0].toUpperCase() + key.slice(1);
      assert.ok(html.includes(`bindRange('${control}'`), `${id}.${key} range binding`);
      assert.ok(html.includes(`clampParam('${key}'`), `${id}.${key} normalization`);
    }
  }
  assert.ok(/version:\s*92/.test(html));
  assert.ok(html.includes("a: 'td', v: 92"));
  assert.ok(html.includes('data.version > 92'));
});

test('Fiber Body keeps the complete normalized input phrase as its repeated unit', () => {
  assert.equal(structural.internals.cleanPhrase('  Fiber\n body   phrase  '), 'Fiber body phrase');
  assert.equal(structural.internals.cleanPhrase(''), 'TYPE DEFORMER');
  const source = fs.readFileSync(new URL('../structural-operators.js', import.meta.url), 'utf8');
  assert.match(source, /var phrase = cleanPhrase\(env\.sourceText\)/);
  assert.match(source, /fillText\(phrase, 0, 0\)/);
});
