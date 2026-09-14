import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const posix = value => value.split(path.sep).join('/').replace(/^\.\//, '');
const absolute = value => path.resolve(root, value);
const exists = value => fs.existsSync(absolute(value)) && fs.statSync(absolute(value)).isFile();
const manifest = JSON.parse(fs.readFileSync(absolute('release-manifest.json'), 'utf8'));
const required = new Set(['release-manifest.json', 'scripts/check-release.mjs', ...manifest.entrypoints, ...manifest.documents, ...(manifest.tests || []), ...manifest.vendor, ...(manifest.generatedSources || []), ...manifest.generatedAssets]);
const missing = [];
const warnings = [];
for (const file of required) if (!exists(file)) missing.push(`${file} (release manifest)`);

function add(value, from) {
  if (!value || /^(?:https?:|data:|blob:|node:|#|%23|mailto:|javascript:)/i.test(value)) return;
  const clean = posix(value.split(/[?#]/)[0]);
  if (!clean) return;
  if (fs.existsSync(absolute(clean)) && fs.statSync(absolute(clean)).isDirectory()) return;
  if (!exists(clean)) missing.push(`${clean} (from ${from})`);
  else required.add(clean);
}

function scanText(file) {
  if (!exists(file)) return;
  const source = fs.readFileSync(absolute(file), 'utf8');
  if (file.endsWith('.html')) {
    for (const match of source.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)) add(match[1], file);
  }
  if (file.endsWith('.css')) {
    for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1], file);
  } else if (file.endsWith('.html')) {
    for (const style of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      for (const match of style[1].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1], file);
    }
  }
  if (/\.(?:m?js|html)$/.test(file)) {
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s*)?["']([^"']+)["']/g)) {
      if (match[1].startsWith('.')) add(posix(path.join(path.dirname(file), match[1])), file);
    }
    for (const match of source.matchAll(/(?<!["'])(?:import\s*\(|new\s+Worker\s*\()\s*["']([^"']+)["']/g)) {
      const target = match[1].startsWith('.') ? posix(path.join(path.dirname(file), match[1])) : match[1];
      add(target, file);
    }
    for (const match of source.matchAll(/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) {
      add(posix(path.join(path.dirname(file), match[1])), file);
    }
  }
}

for (const file of [...required]) scanText(file);
for (let previous = -1; previous !== required.size;) {
  previous = required.size;
  for (const file of [...required]) scanText(file);
}

const packageJson = JSON.parse(fs.readFileSync(absolute('package.json'), 'utf8'));
if (packageJson.version !== manifest.version) missing.push(`package.json version ${packageJson.version} != ${manifest.version}`);
for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  for (const match of command.matchAll(/(?:^|\s)([.\w-]+(?:\/[.\w-]+)+\.(?:m?js|json))(?=\s|$)/g)) add(match[1], `package script ${name}`);
}

const loaderSource = fs.readFileSync(absolute('preset-loader.js'), 'utf8');
const presetSources = [...loaderSource.matchAll(/["']((?:assets\/presets\/[^"']+|preset-library)\.js)["']/g)].map(match => match[1]);
const atlasFiles = presetSources.filter(file => file.startsWith('assets/presets/'));
if (atlasFiles.length !== 13 || new Set(atlasFiles).size !== 13) missing.push(`preset-loader.js must list 13 unique atlases; found ${atlasFiles.length}`);
if (!presetSources.includes('preset-library.js')) missing.push('preset-loader.js must list preset-library.js');
presetSources.forEach(file => add(file, 'preset-loader.js'));

const recipes = [];
const presetContext = {};
presetContext.globalThis = presetContext;
for (const file of atlasFiles) {
  if (!exists(file)) continue;
  vm.runInNewContext(fs.readFileSync(absolute(file), 'utf8'), presetContext, { filename: file });
}
for (const recipe of presetContext.TypeDeformerPresetData?.recipes || []) if (recipe?.id) recipes.push(recipe.id);
if (recipes.length !== 436 || new Set(recipes).size !== 436) missing.push(`preset manifest must contain 436 unique recipes; found ${recipes.length}/${new Set(recipes).size}`);
recipes.forEach(id => add(`assets/presets/${id}.jpg`, 'preset manifest'));

const catalogContext = {};
catalogContext.globalThis = catalogContext;
vm.runInNewContext(fs.readFileSync(absolute('operator-catalog.js'), 'utf8'), catalogContext, { filename: 'operator-catalog.js' });
const catalog = catalogContext.TypeDeformerCatalog;
const catalogIds = catalog ? [...new Set(Object.values(catalog.groups || {}).flat())] : [];
const orderedCatalogIds = catalog ? catalog.order(catalogIds) : [];
if (!catalog || orderedCatalogIds.length !== 116 || Object.keys(catalog.metadata || {}).length !== 116) missing.push('operator catalog must expose 116 ordered metadata entries');
else orderedCatalogIds.forEach(id => add(`assets/operator-previews/${id}.png`, 'operator catalog'));

for (const spec of manifest.catalogAssets) {
  if (spec.manifest) add(spec.manifest, `${spec.directory} manifest`);
  const count = fs.readdirSync(absolute(spec.directory)).filter(name => name.endsWith(spec.extension)).length;
  if (count !== spec.expected) warnings.push(`${spec.directory} contains ${count} ${spec.extension} files; expected ${spec.expected}`);
}

if (manifest.generatedAssets.some(file => !exists(file))) warnings.push('Preview OGP card has not been generated yet.');

for (let previous = -1; previous !== required.size;) {
  previous = required.size;
  for (const file of [...required]) scanText(file);
}

if (process.argv.includes('--require-tracked')) {
  const tracked = new Set(childProcess.execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean).map(posix));
  for (const file of required) if (!tracked.has(file)) missing.push(`${file} is required but not Git-tracked`);
}

if (warnings.length) warnings.forEach(message => console.warn(`WARN ${message}`));
if (missing.length) {
  console.error(`RELEASE_CLOSURE_FAILED ${missing.length}`);
  missing.slice(0, 80).forEach(message => console.error(`- ${message}`));
  if (missing.length > 80) console.error(`- … ${missing.length - 80} more`);
  process.exit(1);
}
if (process.argv.includes('--list-files')) {
  process.stdout.write([...required].sort().join('\n') + '\n');
} else {
  console.log(`RELEASE_CLOSURE_OK ${required.size} reachable files · ${recipes.length} presets · ${orderedCatalogIds.length} operators`);
}
