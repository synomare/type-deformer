import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const applyPath = path.join(scriptsDir, 'apply-keyframe-timeline.mjs');
let source = fs.readFileSync(applyPath, 'utf8');

const fragile = String.raw`html = replaceOnce(
  html,
  \`\n</body>\n</html>\`,
  \`\n  <script src="text-animator-timeline-ui.js"></script>\n</body>\n</html>\`,
  'timeline UI script'
);`;

const robust = String.raw`const bodyEnd = html.lastIndexOf('\n</body>');
if (bodyEnd < 0) throw new Error('Closing body tag was not found.');
html = html.slice(0, bodyEnd)
  + '\n  <script src="text-animator-timeline-ui.js"></script>'
  + html.slice(bodyEnd);`;

if (!source.includes(fragile)) throw new Error('Timeline patch footer block was not found.');
source = source.replace(fragile, robust);
fs.writeFileSync(applyPath, source);
await import('./apply-keyframe-timeline.mjs?fixed=' + Date.now());
