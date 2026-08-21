import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const applyPath = path.join(scriptsDir, 'apply-keyframe-timeline.mjs');
let source = fs.readFileSync(applyPath, 'utf8');

const label = "  'timeline UI script'\n);";
const labelIndex = source.indexOf(label);
if (labelIndex < 0) throw new Error('Timeline UI patch label was not found.');
const blockStart = source.lastIndexOf('html = replaceOnce(', labelIndex);
if (blockStart < 0) throw new Error('Timeline UI patch block start was not found.');
const blockEnd = labelIndex + label.length;

const robust = `const bodyEnd = html.lastIndexOf('\\n</body>');
if (bodyEnd < 0) throw new Error('Closing body tag was not found.');
html = html.slice(0, bodyEnd)
  + '\\n  <script src="text-animator-timeline-ui.js"></script>'
  + html.slice(bodyEnd);`;

source = source.slice(0, blockStart) + robust + source.slice(blockEnd);
fs.writeFileSync(applyPath, source);
await import('./apply-keyframe-timeline.mjs?fixed=' + Date.now());
