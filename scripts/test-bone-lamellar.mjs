import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { canvas, html, boneMask, fixture } from './bone-lamellar-fixture.mjs';
const bytes = image => image.getContext('2d').getImageData(0,0,image.width,image.height).data;
const png = image => createHash('sha256').update(image.toBuffer('image/png')).digest('hex');
const alphaSum = image => { const d=bytes(image); let sum=0; for(let i=3;i<d.length;i+=4)sum+=d[i];return sum; };
const input = () => boneMask('B',210,'Arial Black',320,260);

test('v64 adds a sixth Bone grammar without adding an operator or parameters', () => {
  const c=fixture(input());
  assert.equal(c.params.boneArchitecture,'lamellar');
  assert.deepEqual([...c.BATCH_PARAM_OPTIONS.boneArchitecture],['trabecular','adaptive','spine','ribcage','truss','lamellar']);
  assert.match(html,/<option value="lamellar" selected>Lamellar section \/ 層板断面<\/option>/);
  assert.match(html,/version: 92/);
  assert.match(html,/data.version > 92/);
  assert.match(html,/Number\(data.version \|\| 0\) < 64 && !Object.prototype.hasOwnProperty.call\(data.params, 'boneArchitecture'\)/);
});

test('same source and closed animation endpoints produce identical pixels', () => {
  const c=fixture(input());
  assert.deepEqual(png(c.render()),png(c.render()));
  assert.deepEqual(png(c.render('lamellar',1,0)),png(c.render('lamellar',1,1)));
  assert.notDeepEqual(png(c.render('lamellar',1,0)),png(c.render('lamellar',1,.25)));
});

test('vascular cavities are transparency, paper-independent, and constrained to source coverage', () => {
  const source=input(), c=fixture(source,{boneMarrow:6});
  const rendered=c.render(), a=bytes(rendered), mask=bytes(source.mask);
  let voids=0;
  for(let i=3;i<a.length;i+=4){
    if(mask[i]===0)assert.equal(a[i],0,'never paint outside original body or into source counters');
    if(mask[i]===255&&a[i]<10)voids++;
  }
  assert.ok(voids>20,'source body has new genuine internal holes');
  c.params.paper='#123456';assert.deepEqual(png(rendered),png(c.render()));
  c.params.boneMarrow=0;assert.ok(alphaSum(c.render())>alphaSum(rendered));
});

test('full geometry and weighted live mask are separate; strength fades without changing anatomy', () => {
  const c=fixture(input()), full=bytes(c.render('lamellar',1)), half=bytes(c.render('lamellar',.5));
  let checked=0;
  for(let i=3;i<full.length;i+=4){
    assert.ok(Math.abs(half[i]-full[i]*.5)<=1.5,'one strength multiplication');
    if(full[i]>240&&half[i]>100){for(let k=1;k<=3;k++)assert.ok(Math.abs(full[i-k]-half[i-k])<=2);checked++;}
  }
  assert.ok(checked>1000);assert.equal(alphaSum(c.render('lamellar',0)),0);
  assert.notEqual(c.surfaceFxScratchCanvases['bone-lamellar-full-mask'],c.surfaceFxScratchCanvases['bone-lamellar-body']);
});

test('every existing Bone axis changes the lamellar material and extreme combinations stay bounded', t => {
  const c=fixture(input()), baseline=png(c.render());
  const axes={boneMarrow:6,boneCell:42,boneBranching:8,boneWeight:16,boneJoint:64,boneWarp:6};
  for(const [key,value]of Object.entries(axes)){
    const old=c.params[key];c.params[key]=value;
    assert.notDeepEqual(png(c.render()),baseline,key+' must not be inert');c.params[key]=old;
  }
  Object.assign(c.params,{boneMarrow:6,boneCell:2,boneBranching:8,boneWeight:32,boneJoint:64,boneWarp:8});
  const started=performance.now(), output=c.render();
  assert.ok(alphaSum(output)>10000);
  const field=c.surfaceBoundaryDistance(bytes(input().mask),320,260);
  const seeds=c.boneLamellarSeeds(field,320,260,2,8,41);
  assert.ok(seeds.points.length<2200);
  assert.ok(seeds.points.every(p=>Number.isFinite(p.x+p.y+p.aspect+p.radius)));
  t.diagnostic(`${(performance.now()-started).toFixed(1)}ms isolated native 320x260 extreme render + seed check; not browser FPS`);
});

test('thin strokes and punctuation retain continuous source body when no osteon fits', () => {
  const mask=canvas.createCanvas(100,80),ctx=mask.getContext('2d');ctx.fillStyle='#fff';
  ctx.fillRect(10,10,1,55);ctx.fillRect(30,20,45,1);ctx.fillRect(80,60,2,2);
  const result=bytes(fixture(mask,{boneCell:96,boneMarrow:6}).render());
  for(let y=10;y<65;y++)assert.equal(result[(y*100+10)*4+3],255);
  for(let x=30;x<75;x++)assert.equal(result[(20*100+x)*4+3],255);
  assert.equal(result[(60*100+80)*4+3],255);
});

test('effect color changes chroma without changing void geometry', () => {
  const c=fixture(input(),{boneColor:'#e23022'}), red=bytes(c.render());
  c.params.boneColor='#225ee0';const blue=bytes(c.render());let changes=0;
  for(let i=0;i<red.length;i+=4){assert.equal(red[i+3],blue[i+3]);if(red[i]!==blue[i])changes++;}
  assert.ok(changes>1000);
});
