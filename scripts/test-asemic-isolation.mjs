// Portable contracts for the real editor loop: software-alpha group oracle
// and conservative bounds of the actual emitted path primitives. Not UI QA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const extract = name => {
  const match = html.match(new RegExp(`^      function ${name}\\([\\s\\S]*?^      \\}`, 'm'));
  assert.ok(match, name);
  return match[0];
};
const grammars = ['current', 'chamber', 'incised', 'polyphonic'];
const load = (context, names) => {
  vm.createContext(context);
  new vm.Script(names.map(extract).join('\n')).runInContext(context);
  return context;
};

// Rectangle-only alpha surface: geometry is intentionally stubbed in this
// suite so the real renderer's group order/clearing/opacity can be isolated.
class AlphaCanvas {
  constructor(width = 0, height = 0) { this._w = width; this._h = height; this.reset(); }
  reset() { this.pixels = new Float64Array(this._w * this._h); this.ctx = new AlphaContext(this); }
  get width() { return this._w; }
  set width(v) { this._w = v; this.reset(); }
  get height() { return this._h; }
  set height(v) { this._h = v; this.reset(); }
  getContext() { return this.ctx; }
}
class AlphaContext {
  constructor(canvas) {
    this.canvas = canvas; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over';
    this.stack = []; this.clears = []; this.copies = [];
  }
  setTransform() {}
  save() { this.stack.push([this.globalAlpha, this.globalCompositeOperation]); }
  restore() { [this.globalAlpha, this.globalCompositeOperation] = this.stack.pop(); }
  each(x, y, w, h, fn) {
    for (let j = Math.max(0, Math.ceil(y)); j < Math.min(this.canvas.height, y + h); j++)
      for (let i = Math.max(0, Math.ceil(x)); i < Math.min(this.canvas.width, x + w); i++)
        fn(j * this.canvas.width + i, i, j);
  }
  clearRect(x, y, w, h) {
    this.clears.push([x, y, w, h]); this.each(x, y, w, h, p => { this.canvas.pixels[p] = 0; });
  }
  ink(p, coverage) {
    const a = this.globalAlpha * coverage, d = this.canvas.pixels[p];
    this.canvas.pixels[p] = this.globalCompositeOperation === 'destination-out' ? d * (1 - a) : a + d * (1 - a);
  }
  fillRect(x, y, w, h) { this.each(x, y, w, h, p => this.ink(p, 1)); }
  drawImage(source, ...args) {
    this.copies.push(args);
    let sx, sy, sw, sh, dx, dy, dw, dh;
    if (args.length === 2) [sx, sy, sw, sh, dx, dy, dw, dh] = [0, 0, source.width, source.height, ...args, source.width, source.height];
    else { assert.equal(args.length, 8); [sx, sy, sw, sh, dx, dy, dw, dh] = args; }
    assert.equal(sw, dw); assert.equal(sh, dh); // exact integer crop, no resampling
    this.each(dx, dy, dw, dh, (p, x, y) => this.ink(p, source.pixels[(y - dy + sy) * source.width + x - dx + sx] || 0));
  }
  // Polyphonic bridges are outside the geometry scope of this alpha test.
  beginPath() {} moveTo() {} lineTo() {} stroke() {}
}
const W = 160, H = 96;
const meta = (index, x, strength = 1, ch = 'B') => ({ index, x, y: 30, halfW: 18, halfH: 18, strength, glyph: { ch } });
const body = (ctx, anchors) => {
  for (let i = 0; i < 3; i++) ctx.fillRect(anchors[0].x, anchors[0].y, 16, 12);
};
let allocations = 0;
const s = load({
  Math, Number, params: { seed: 41, asemicGrammar: 'current', asemicMemory: 1, asemicGestures: 4,
    asemicWeight: 1, asemicFlow: 0, asemicContrast: 0, asemicFlourish: 0, asemicCounter: 1 },
  compositionState: { enabled: true, phase: 0 }, BATCH_PARAM_OPTIONS: { asemicGrammar: grammars },
  document: { createElement: () => { allocations++; return new AlphaCanvas(); } }, surfaceFxScratchCanvases: {},
  surfaceChoice: () => s.params.asemicGrammar, buildSurfaceMask: () => ({ getContext: () => ({ getImageData: () => ({ data: [] }) }) }),
  compositeSurfaceSource: () => {}, surfaceBoundaryDistance: () => ({ bounds: true }), surfaceVoidTopology: () => ({}),
  surfaceGlyphAnatomyMetas: () => s.metas.filter(m => m.strength > 0.002), surfaceEffectColor: () => '#fff',
  paintSurfaceMask: (ctx, canvas) => ctx.drawImage(canvas, 0, 0), asemicCounterComponents: () => [],
  asemicBuildAnchors: (_f, _w, _h, _ms, m) => [{ x: m.x, y: m.y }, { x: m.x + 16, y: m.y + 12 }],
  asemicRenderPath: body, asemicRenderChamber: body, asemicOffsetPath: anchors => anchors,
  asemicCutCounters: (ctx, _c, m) => {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillRect(m.x + 2, m.y + 3, 4, 4); ctx.restore();
  }
}, ['surfaceScratch', 'asemicMetaParam', 'asemicMetaChoice', 'asemicBodyBounds', 'renderAsemicDuctus']);
function render(metas, grammar = 'current') {
  s.metas = metas; s.params.asemicGrammar = grammar;
  const target = new AlphaCanvas(W, H);
  s.renderAsemicDuctus(target.ctx, metas.map(m => m.glyph), W, H, 1, { s: 1 }, {}, false);
  return target.pixels;
}
function oracle(metas) {
  const result = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const m of metas) {
    if (!m.glyph.ch.trim() || m.strength <= 0.002) continue;
    const bodyPixel = x >= m.x && x < m.x + 16 && y >= m.y && y < m.y + 12;
    const hole = x >= m.x + 2 && x < m.x + 6 && y >= m.y + 3 && y < m.y + 7;
    const a = bodyPixel && !hole ? m.strength : 0, p = y * W + x;
    result[p] = a + result[p] * (1 - a);
  }
  return result;
}
let isolationCases = 0;
for (const grammar of grammars) for (const strengths of [[1, 1], [.45, .45], [.2, .8], [0, 1], [1, 0], [0, 0]]) {
  const ms = [meta(0, 30, strengths[0]), meta(1, 36, strengths[1])];
  const result = render(ms, grammar), expected = oracle(ms);
  for (let p = 0; p < result.length; p++) assert.ok(Math.abs(result[p] - expected[p]) < 1e-12, `${grammar} alpha pixel ${p}`);
  const reversed = render([...ms].reverse(), grammar);
  for (let p = 0; p < result.length; p++) assert.ok(Math.abs(result[p] - reversed[p]) < 1e-12, 'same ink order');
  render([], grammar); render([meta(0, 90, .4)], grammar);
  assert.deepEqual(render(ms, grammar), result, 'scratch from other positions does not leak');
  isolationCases++;
}
assert.deepEqual(render([meta(0, 30, 1, ' \t')]), new Float64Array(W * H), 'whitespace');
assert.deepEqual(render([meta(0, -8)]), oracle([meta(0, -8)]), 'viewport crop');
assert.deepEqual(render([meta(0, 1000)]), new Float64Array(W * H), 'offscreen');
assert.equal(allocations, 2, 'exactly two cached planes across all frames, not one per glyph');
const layer = s.surfaceFxScratchCanvases['asemic-ductus-v37-glyph'].ctx;
const output = s.surfaceFxScratchCanvases['asemic-ductus-v37-body'].ctx;
const oldClearCount = layer.clears.length, oldCopyCount = output.copies.length;
render([meta(0, 25), meta(1, 65), meta(2, 105)]);
const clears = layer.clears.slice(oldClearCount), copies = output.copies.slice(oldCopyCount);
assert.deepEqual(clears[0], [0, 0, W, H]);
assert.equal(clears.length, 4, 'one frame clear plus one bounded clear per glyph');
assert.ok(clears.slice(1).every(r => r[2] * r[3] < W * H / 4));
assert.equal(copies.length, 3);
assert.ok(copies.every(r => r.length === 8 && r[2] * r[3] < W * H / 4));

// Geometric recorder: actual paths' control hull + half-stroke support,
// transformed ellipse extrema and rotated incised joints must all fit.
class BoundsContext {
  constructor() {
    this.minX = this.minY = Infinity; this.maxX = this.maxY = -Infinity;
    this.matrix = [1, 0, 0, 1, 0, 0]; this.stack = []; this.lineWidth = 1;
  }
  transformPoint(x, y) { const [a, b, c, d, e, f] = this.matrix; return [a*x+c*y+e, b*x+d*y+f]; }
  save() { this.stack.push({ matrix: [...this.matrix], lineWidth: this.lineWidth }); }
  restore() { Object.assign(this, this.stack.pop()); }
  translate(x, y) { [this.matrix[4], this.matrix[5]] = this.transformPoint(x, y); }
  rotate(t) {
    const [a,b,c,d,e,f] = this.matrix, co = Math.cos(t), si = Math.sin(t);
    this.matrix = [a*co+c*si,b*co+d*si,c*co-a*si,d*co-b*si,e,f];
  }
  include(x, y, r = 0) {
    this.minX = Math.min(this.minX, x-r); this.maxX = Math.max(this.maxX, x+r);
    this.minY = Math.min(this.minY, y-r); this.maxY = Math.max(this.maxY, y+r);
  }
  beginPath() { this.path = []; }
  moveTo(x, y) { this.path.push(this.transformPoint(x,y)); }
  lineTo(x, y) { this.moveTo(x,y); }
  quadraticCurveTo(cx, cy, x, y) { this.moveTo(cx,cy); this.moveTo(x,y); }
  stroke() { for (const p of this.path) this.include(...p, this.lineWidth/2); }
  fill() { for (const p of this.path) this.include(...p); }
  ellipse(x, y, rx, ry, rot) {
    const [cx,cy] = this.transformPoint(x,y), [a,b,c,d] = this.matrix, co = Math.cos(rot), si = Math.sin(rot);
    const ex = Math.hypot((a*co+c*si)*rx, (c*co-a*si)*ry);
    const ey = Math.hypot((b*co+d*si)*rx, (d*co-b*si)*ry);
    this.path.push([cx-ex,cy-ey],[cx+ex,cy+ey]);
  }
  fillRect(x,y,w,h) { for (const p of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]) this.include(...this.transformPoint(...p)); }
}
const geo = load({ Math, Number, params: { vertical: false, seed: 41 } },
  ['hash','asemicBodyBounds','asemicOffsetPath','asemicRenderPath','asemicRenderChamber']);
let boundsCases = 0;
for (const grammar of grammars) for (const vertical of [false,true]) for (const weight of [.04,.4,12,64,256])
  for (const contrast of [0,6]) for (const flow of [-4,0,4]) for (const reach of [0,480]) for (const phase of [0,1.7,Math.PI*2]) {
    geo.params.vertical = vertical;
    const m = { x: 480, y: 390, halfW: 65, halfH: 82 };
    const anchors = [{x:410-reach,y:370}, {x:480,y:320}, {x:550,y:410}, {x:460,y:460+reach}];
    const counters = reach ? [] : [{x:465,y:385,minX:455,maxX:475,minY:370,maxY:400},
      {x:485,y:410,minX:480,maxX:500,minY:395,maxY:425}];
    const ctx = new BoundsContext(), seed = 1231;
    if (grammar === 'chamber') geo.asemicRenderChamber(ctx,anchors,counters,m,weight,contrast,flow,phase,seed);
    else if (grammar === 'polyphonic') {
      const gap = weight*(1.08+contrast*.055);
      for (const [offset,scale,delta] of [[-gap,.58,7],[0,.72,11],[gap,.58,13]])
        geo.asemicRenderPath(ctx,geo.asemicOffsetPath(anchors,offset),weight,contrast,flow,phase,seed+delta,grammar,false,scale);
      ctx.lineWidth = Math.max(.5,weight*.34);
      for (let bridge=1; bridge+1<anchors.length; bridge+=3) {
        const local=anchors.slice(bridge-1,bridge+2), a=geo.asemicOffsetPath(local,-gap)[1], b=geo.asemicOffsetPath(local,gap)[1];
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
    } else geo.asemicRenderPath(ctx,anchors,weight,contrast,flow,phase,seed,grammar,false,1);
    const bound = geo.asemicBodyBounds(anchors,counters,m,weight,contrast,flow,grammar,1000,800);
    assert.ok(bound, grammar);
    const label = JSON.stringify({grammar,vertical,weight,contrast,flow,reach,phase,bound,ink:[ctx.minX,ctx.minY,ctx.maxX,ctx.maxY]});
    assert.ok(bound.x <= Math.max(0,ctx.minX) && bound.y <= Math.max(0,ctx.minY), `${label} negative ink support`);
    assert.ok(bound.x+bound.width >= Math.min(1000,ctx.maxX) && bound.y+bound.height >= Math.min(800,ctx.maxY), `${label} positive ink support`);
    boundsCases++;
  }
assert.equal(geo.asemicBodyBounds([],[],{x:0,y:0},1,0,0,'current',100,100),null);
console.log(`Asemic isolation: ${isolationCases} alpha-oracle states; ${boundsCases} real-primitive bounds; cached bounded layer contracts passed.`);
