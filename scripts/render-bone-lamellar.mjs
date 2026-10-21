import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { canvas, authoredSource, boneMask, fixture } from './bone-lamellar-fixture.mjs';
const output = process.argv[2] || 'C:/Users/soran/AppData/Local/Temp/type-deformer-bone-v64-20260905';
fs.mkdirSync(output, { recursive: true });
const before = fs.readFileSync(path.join(output, 'before.html'), 'utf8');
canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Bone Yu Mincho');
const specs = [
  { id: 'body', text: 'B', size: 360, font: 'Arial Black' },
  { id: 'serif', text: 'B&O', size: 255, font: 'Times New Roman' },
  { id: 'japanese', text: '骨永', size: 260, font: 'Bone Yu Mincho' },
  { id: 'small', text: 'BONE, 永。', size: 48, font: 'Bone Yu Mincho' },
  { id: 'excess', text: 'OS', size: 300, font: 'Arial Black', settings: { boneMarrow: 5.2, boneCell: 28, boneBranching: 6, boneWeight: 8, boneJoint: 18, boneWarp: 2.3 } }
];
function panel(fx, title) {
  const c = canvas.createCanvas(650,460), ctx = c.getContext('2d');
  ctx.fillStyle='#f3f0e8'; ctx.fillRect(0,0,650,460); ctx.drawImage(fx,0,40);
  ctx.fillStyle='#242322'; ctx.font='15px Arial'; ctx.fillText(title,20,24); return c;
}
function pair(a,b,name) {
  const c=canvas.createCanvas(1300,460),ctx=c.getContext('2d');ctx.drawImage(a,0,0);ctx.drawImage(b,650,0);
  fs.writeFileSync(path.join(output,name+'.png'),c.toBuffer('image/png'));
}
const records=[];
for(const spec of specs) {
  const input=boneMask(spec.text,spec.size,spec.font), old=fixture(input,spec.settings,before), next=fixture(input,spec.settings);
  for(const mode of ['trabecular','adaptive','spine','ribcage','truss'])
    assert.deepEqual(next.render(mode).toBuffer('image/png'),old.render(mode).toBuffer('image/png'),spec.id+' '+mode+' preserved');
  const a=panel(old.render('trabecular'),'A · '+spec.id);
  fs.writeFileSync(path.join(output,spec.id+'-A.png'),a.toBuffer('image/png'));
  if(next.BATCH_PARAM_OPTIONS.boneArchitecture.includes('lamellar')) {
    const b=panel(next.render('lamellar'),'B · '+spec.id);
    fs.writeFileSync(path.join(output,spec.id+'-B.png'),b.toBuffer('image/png'));
    pair(a,b,spec.id+'-AB'); pair(b,a,spec.id+'-BA');
  }
  records.push(spec);
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({
  before:crypto.createHash('sha256').update(before).digest('hex'),after:crypto.createHash('sha256').update(authoredSource).digest('hex'),
  records,preservedModes:5,evidence:'Native Canvas, actual Bone renderers; synthetic glyph layout; not browser or iPhone'
},null,2));
console.log(output);
