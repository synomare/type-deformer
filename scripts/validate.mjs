#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const htmlPath = path.join(root, 'index.html');
const dictionaryPath = path.join(root, 'confuse-dictionary.js');

const failures = [];
const warnings = [];
const noteFailure = (message) => failures.push(message);
const noteWarning = (message) => warnings.push(message);

function readRequired(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    noteFailure(`Cannot read ${path.relative(root, filePath)}: ${error.message}`);
    return '';
  }
}

function countMatches(text, pattern) {
  return Array.from(text.matchAll(pattern)).length;
}

function localAssetPath(rawUrl) {
  const value = rawUrl.trim();
  if (!value || value.startsWith('#') || value.startsWith('//')) return null;
  if (/^(?:[a-z]+:|data:|blob:|javascript:)/i.test(value)) return null;
  const clean = value.split('#')[0].split('?')[0];
  return clean ? path.resolve(root, decodeURIComponent(clean)) : null;
}

const html = readRequired(htmlPath);
const dictionarySource = readRequired(dictionaryPath);

if (html) {
  if (!/^<!doctype html>/i.test(html.trimStart())) noteFailure('index.html is missing an HTML doctype.');
  if (!/<html\b[^>]*\blang=["']ja["']/i.test(html)) noteWarning('index.html does not declare lang="ja".');

  for (const marker of ['<<<<<<<', '=======', '>>>>>>>']) {
    if (html.includes(marker)) noteFailure(`index.html contains an unresolved merge marker: ${marker}`);
  }

  const markupOnly = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const ids = new Map();
  const idPattern = /\bid\s*=\s*(["'])([^"']+)\1/gi;
  for (const match of markupOnly.matchAll(idPattern)) {
    ids.set(match[2], (ids.get(match[2]) || 0) + 1);
  }
  const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1);
  for (const [id, count] of duplicateIds) noteFailure(`Duplicate HTML id "${id}" appears ${count} times.`);

  const referencedIds = new Map();
  const addReference = (id, source) => {
    if (!id) return;
    if (!referencedIds.has(id)) referencedIds.set(id, new Set());
    referencedIds.get(id).add(source);
  };

  const getByIdPattern = /\bgetElementById\(\s*(["'`])([^"'`]+)\1\s*\)/g;
  for (const match of html.matchAll(getByIdPattern)) {
    if (!match[2].includes('${')) addReference(match[2], 'getElementById');
  }
  const forPattern = /\bfor\s*=\s*(["'])([^"']+)\1/gi;
  for (const match of markupOnly.matchAll(forPattern)) addReference(match[2], 'label[for]');
  const ariaControlsPattern = /\baria-controls\s*=\s*(["'])([^"']+)\1/gi;
  for (const match of markupOnly.matchAll(ariaControlsPattern)) {
    for (const id of match[2].trim().split(/\s+/)) addReference(id, 'aria-controls');
  }

  for (const [id, sources] of referencedIds) {
    if (!ids.has(id)) noteFailure(`Missing HTML id "${id}" referenced by ${[...sources].join(', ')}.`);
  }

  const inlineScripts = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptIndex = 0;
  for (const match of html.matchAll(scriptPattern)) {
    scriptIndex += 1;
    const attrs = match[1];
    const body = match[2];
    const srcMatch = attrs.match(/\bsrc\s*=\s*(["'])([^"']+)\1/i);
    if (srcMatch) {
      const asset = localAssetPath(srcMatch[2]);
      if (asset && !fs.existsSync(asset)) {
        noteFailure(`Missing local script referenced by index.html: ${path.relative(root, asset)}`);
      }
      continue;
    }
    inlineScripts.push({ index: scriptIndex, body });
  }

  for (const script of inlineScripts) {
    try {
      new vm.Script(script.body, { filename: `index.html:inline-script-${script.index}` });
    } catch (error) {
      noteFailure(`JavaScript syntax error in inline script ${script.index}: ${error.message}`);
    }
  }

  const linkPattern = /<link\b([^>]*)>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const hrefMatch = match[1].match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
    if (!hrefMatch) continue;
    const asset = localAssetPath(hrefMatch[2]);
    if (asset && !fs.existsSync(asset)) {
      noteFailure(`Missing local link target referenced by index.html: ${path.relative(root, asset)}`);
    }
  }

  const eagerDictionaryTag = /<script\b[^>]*\bsrc\s*=\s*(["'])confuse-dictionary\.js\1[^>]*>/i;
  if (eagerDictionaryTag.test(html)) {
    noteFailure('confuse-dictionary.js is loaded eagerly; keep the generated dictionary on the Confuse operator lazy path.');
  }
  if (!/script\.src\s*=\s*(["'])confuse-dictionary\.js\1/.test(html)) {
    noteFailure('The lazy loader for confuse-dictionary.js is missing.');
  }
  if (!html.includes('TYPE_DEFORMER_CONFUSE_DICTIONARY')) {
    noteFailure('index.html does not consume the generated dictionary global.');
  }

  console.log(`HTML: ${ids.size} unique ids, ${referencedIds.size} literal id references, ${inlineScripts.length} inline script(s).`);
}

if (dictionarySource) {
  const bytes = fs.statSync(dictionaryPath).size;
  if (bytes < 1_000_000) noteWarning(`Dictionary is unexpectedly small (${bytes} bytes).`);
  if (!dictionarySource.includes('window.TYPE_DEFORMER_CONFUSE_DICTIONARY=')) {
    noteFailure('confuse-dictionary.js does not expose window.TYPE_DEFORMER_CONFUSE_DICTIONARY.');
  }
  for (const marker of ['<<<<<<<', '=======', '>>>>>>>']) {
    if (dictionarySource.includes(marker)) noteFailure(`confuse-dictionary.js contains an unresolved merge marker: ${marker}`);
  }

  try {
    const sandbox = { window: Object.create(null) };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    new vm.Script(dictionarySource, { filename: 'confuse-dictionary.js' })
      .runInContext(sandbox, { timeout: 30_000 });

    const data = sandbox.window.TYPE_DEFORMER_CONFUSE_DICTIONARY;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      noteFailure('Generated dictionary did not evaluate to an object.');
    } else {
      const meta = data.meta;
      if (!meta || typeof meta !== 'object') noteFailure('Generated dictionary is missing meta data.');
      else {
        if (meta.schema !== 3) noteFailure(`Unsupported dictionary schema: ${String(meta.schema)} (expected 3).`);
        if (typeof meta.unicode !== 'string' || !meta.unicode) noteFailure('Dictionary meta.unicode is missing.');
        if (!Array.isArray(meta.sources) || meta.sources.length < 3) noteFailure('Dictionary source provenance is incomplete.');
      }

      if (!data.skeleton || typeof data.skeleton !== 'object' || Array.isArray(data.skeleton)) {
        noteFailure('Generated dictionary is missing the skeleton map.');
      } else {
        const skeletonKeys = Object.keys(data.skeleton).length;
        if (skeletonKeys < 1_000) noteFailure(`Skeleton map is unexpectedly small (${skeletonKeys} keys).`);
        if (meta && Number.isFinite(meta.skeletonKeys) && skeletonKeys !== meta.skeletonKeys) {
          noteFailure(`Skeleton key count mismatch: meta=${meta.skeletonKeys}, actual=${skeletonKeys}.`);
        }
        console.log(`Dictionary: ${bytes} bytes, schema ${meta && meta.schema}, Unicode ${meta && meta.unicode}, ${skeletonKeys} skeleton keys.`);
      }
    }
  } catch (error) {
    noteFailure(`confuse-dictionary.js could not be evaluated: ${error.message}`);
  }
}

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  console.error(`Validation failed with ${failures.length} error(s) and ${warnings.length} warning(s).`);
  process.exitCode = 1;
} else {
  console.log(`Validation passed with ${warnings.length} warning(s).`);
}
