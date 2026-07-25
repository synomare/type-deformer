#!/usr/bin/env node
// tools/build-confuse-dictionary.mjs
//
// Rebuilds confuse-dictionary.js, the data file loaded by index.html as
// window.TYPE_DEFORMER_CONFUSE_DICTIONARY. Node.js 18+ ESM, no dependencies
// (built-in fetch / zlib / fs / child_process only). The `unzip` binary is
// used to extract Unihan.zip if present on PATH; otherwise a minimal
// zlib-based ZIP reader is used as a fallback.
//
// Usage:
//   node tools/build-confuse-dictionary.mjs [--out <path>]
//
// Downloaded sources are cached under tools/.cache/ so repeat runs do not
// re-fetch unchanged data. Delete that directory to force a fresh pull.
//
// If this session runs behind an HTTPS proxy that Node's built-in fetch does
// not pick up automatically, re-run with NODE_USE_ENV_PROXY=1 (Node >= 22.21):
//   NODE_USE_ENV_PROXY=1 node tools/build-confuse-dictionary.mjs
//
// Output is fully deterministic: every object's keys and every array's
// elements are sorted before serialization, so re-running against the same
// upstream snapshot byte-for-byte reproduces the same file.

import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');

const SOURCES = {
  confusables: 'https://www.unicode.org/Public/security/latest/confusables.txt',
  unihanZip: 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip',
  equivalentUnifiedIdeograph: 'https://www.unicode.org/Public/UCD/latest/ucd/EquivalentUnifiedIdeograph.txt',
  standardizedVariants: 'https://www.unicode.org/Public/UCD/latest/ucd/StandardizedVariants.txt',
  unicodeData: 'https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt',
  ivdSequences: 'https://www.unicode.org/Public/UCD/latest/ucd/IVD/IVD_Sequences.txt'
};

// Collections in the IVD registry that are treated as "Japanese" for the
// purposes of this dictionary. Everything else (e.g. MOJIKYO_KOSEKI, KRName,
// or any future collection) is bucketed into ivsOther.
const JAPANESE_IVD_COLLECTIONS = new Set(['Adobe-Japan1', 'Hanyo-Denshi', 'Moji_Joho']);

// Unihan_Variants.txt fields, bucketed by the output map they feed.
const VARIANT_FIELD_BUCKET = {
  kSpoofingVariant: 'hanVisual',
  kSemanticVariant: 'hanSemantic',
  kSpecializedSemanticVariant: 'hanSemantic',
  kSimplifiedVariant: 'hanVariant',
  kTraditionalVariant: 'hanVariant',
  kZVariant: 'hanVariant'
};

// Approximate Han ideograph code point ranges (unified + extensions A-I,
// plus the compatibility ideograph blocks). Used only to decide whether a
// StandardizedVariants.txt entry or a UnicodeData.txt decomposition target
// belongs in the "han*" maps versus the generic Unicode-wide files.
const HAN_RANGES = [
  [0x2E80, 0x2EFF], // CJK Radicals Supplement
  [0x2F00, 0x2FDF], // Kangxi Radicals
  [0x3400, 0x4DBF], // Ext A
  [0x4E00, 0x9FFF], // Unified
  [0xF900, 0xFAFF], // Compatibility Ideographs
  [0x20000, 0x2A6DF], // Ext B
  [0x2A700, 0x2B73F], // Ext C
  [0x2B740, 0x2B81F], // Ext D
  [0x2B820, 0x2CEAF], // Ext E
  [0x2CEB0, 0x2EBEF], // Ext F
  [0x2EBF0, 0x2EE5F], // Ext I
  [0x2F800, 0x2FA1F], // Compatibility Supplement
  [0x30000, 0x3134F], // Ext G
  [0x31350, 0x323AF] // Ext H
];

function isHanCodePoint(cp) {
  for (const [lo, hi] of HAN_RANGES) if (cp >= lo && cp <= hi) return true;
  return false;
}

function log(...args) {
  console.log('[confuse-dict]', ...args);
}

// ---------------------------------------------------------------------------
// Fetch + cache
// ---------------------------------------------------------------------------

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function cachedFetchBuffer(url, cacheName) {
  const cachePath = path.join(CACHE_DIR, cacheName);
  if (existsSync(cachePath)) {
    log('cache hit', cacheName);
    return fs.readFile(cachePath);
  }
  log('downloading', url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed for ${url}: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(cachePath, buf);
  log('cached', cacheName, `(${buf.length} bytes)`);
  return buf;
}

async function cachedFetchText(url, cacheName) {
  const buf = await cachedFetchBuffer(url, cacheName);
  return buf.toString('utf8');
}

// ---------------------------------------------------------------------------
// Unihan.zip extraction
// ---------------------------------------------------------------------------

async function extractUnihanMembers(zipPath, members) {
  const destDir = path.join(CACHE_DIR, 'unihan');
  await fs.mkdir(destDir, { recursive: true });
  const missing = members.filter((m) => !existsSync(path.join(destDir, m)));
  if (missing.length === 0) {
    log('unihan members already extracted');
  } else if (hasUnzipBinary()) {
    log('extracting via unzip:', missing.join(', '));
    execFileSync('unzip', ['-o', '-j', zipPath, ...missing, '-d', destDir], { stdio: 'pipe' });
  } else {
    log('unzip binary not found; extracting via built-in zlib reader:', missing.join(', '));
    await extractWithZlib(zipPath, missing, destDir);
  }
  const out = {};
  for (const m of members) {
    out[m] = await fs.readFile(path.join(destDir, m), 'utf8');
  }
  return out;
}

function hasUnzipBinary() {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Minimal ZIP reader: locates the End Of Central Directory record, walks the
// central directory, and inflates the requested members. Only needed when
// `unzip` isn't on PATH. Supports store (method 0) and deflate (method 8),
// which is all Unihan.zip uses in practice.
async function extractWithZlib(zipPath, wantedNames, destDir) {
  const data = await fs.readFile(zipPath);
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (data.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) throw new Error('could not find ZIP end-of-central-directory record');
  const cdEntries = data.readUInt16LE(eocdOffset + 10);
  const cdOffset = data.readUInt32LE(eocdOffset + 16);

  const wanted = new Set(wantedNames);
  let offset = cdOffset;
  let found = 0;
  for (let i = 0; i < cdEntries && found < wanted.size; i++) {
    const sig = data.readUInt32LE(offset);
    if (sig !== 0x02014b50) throw new Error('malformed ZIP central directory entry');
    const method = data.readUInt16LE(offset + 10);
    const compSize = data.readUInt32LE(offset + 20);
    const nameLen = data.readUInt16LE(offset + 28);
    const extraLen = data.readUInt16LE(offset + 30);
    const commentLen = data.readUInt16LE(offset + 32);
    const localHeaderOffset = data.readUInt32LE(offset + 42);
    const name = data.toString('utf8', offset + 46, offset + 46 + nameLen);
    if (wanted.has(name)) {
      const lhNameLen = data.readUInt16LE(localHeaderOffset + 26);
      const lhExtraLen = data.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const compressed = data.subarray(dataStart, dataStart + compSize);
      const raw = method === 0 ? compressed : zlib.inflateRawSync(compressed);
      await fs.writeFile(path.join(destDir, name), raw);
      found++;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  if (found < wanted.size) throw new Error('not all requested ZIP members were found');
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function* lines(text) {
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line || line.startsWith('#')) continue;
    yield line;
  }
}

function stripUnihanTag(token) {
  // Unihan multi-value fields annotate entries as "U+4E00<kSourceTag,..." or
  // "U+4E00:kTag" — the tag never changes which code point is meant.
  const lt = token.indexOf('<');
  return lt >= 0 ? token.slice(0, lt) : token;
}

function parseUPlus(token) {
  const m = /^U\+([0-9A-Fa-f]+)$/.exec(token.trim());
  if (!m) return null;
  return parseInt(m[1], 16);
}

function cp(n) {
  return String.fromCodePoint(n);
}

function codePointCompare(a, b) {
  const ai = a.codePointAt(0);
  const bi = b.codePointAt(0);
  if (ai !== bi) return ai - bi;
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedUnique(arr) {
  return Array.from(new Set(arr)).sort(codePointCompare);
}

// Builds a symmetric adjacency map: for every (a, b) pair added, both
// map[a] gains b and map[b] gains a. Matches the bidirectional shape
// observed for hanVariant / hanSemantic / hanVisual / hanCompatibility /
// hanEquivalent (Unihan variant fields, and UCD equivalence tables, are
// typically recorded in one direction only; the dictionary needs both).
class SymmetricMap {
  constructor() {
    this.map = new Map();
  }
  add(a, b) {
    if (a === b) return;
    if (!this.map.has(a)) this.map.set(a, new Set());
    if (!this.map.has(b)) this.map.set(b, new Set());
    this.map.get(a).add(b);
    this.map.get(b).add(a);
  }
  toSortedObject() {
    const out = {};
    for (const key of Array.from(this.map.keys()).sort(codePointCompare)) {
      out[key] = sortedUnique(Array.from(this.map.get(key)));
    }
    return out;
  }
  get size() {
    return this.map.size;
  }
}

function sortObjectKeys(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort(codePointCompare)) out[key] = obj[key];
  return out;
}

// ---------------------------------------------------------------------------
// confusables.txt -> skeleton groups (UTS #39)
// ---------------------------------------------------------------------------

function parseConfusables(text) {
  let version = null;
  const table = new Map(); // single source char -> mapped string
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!version) {
      const m = /^#\s*Version:\s*(\S+)/.exec(line);
      if (m) version = m[1];
    }
    if (!line || line.startsWith('#')) continue;
    const semi = line.split('#')[0];
    const fields = semi.split(';');
    if (fields.length < 2) continue;
    const srcHex = fields[0].trim();
    const dstHex = fields[1].trim();
    if (!srcHex || !dstHex) continue;
    const srcCps = srcHex.split(/\s+/).map((h) => parseInt(h, 16));
    if (srcCps.length !== 1 || Number.isNaN(srcCps[0])) continue; // always single-cp source in this file
    const dstCps = dstHex.split(/\s+/).map((h) => parseInt(h, 16));
    if (dstCps.some(Number.isNaN)) continue;
    const mapped = dstCps.map(cp).join('');
    table.set(cp(srcCps[0]), mapped);
  }
  return { version, table };
}

function buildSkeletonGroups(table) {
  // The file's mappings are already transitively closed (per UTS #39), so a
  // single substitution per character yields its skeleton. confusables.txt
  // is structured many-to-one onto an anchor glyph (e.g. Cyrillic А, Greek
  // Α, and fullwidth Ａ all map to Latin A) and the anchor itself normally
  // never appears as a source line. If the computed skeleton is a single
  // code point, that code point is the anchor and belongs in its own group
  // too — otherwise it would silently be missing a skeleton entry.
  function skeletonOf(ch) {
    return table.has(ch) ? table.get(ch) : ch;
  }
  const bySkeleton = new Map(); // skeleton string -> Set of member chars
  for (const ch of table.keys()) {
    const sk = skeletonOf(ch);
    if (!bySkeleton.has(sk)) bySkeleton.set(sk, new Set());
    bySkeleton.get(sk).add(ch);
    if (Array.from(sk).length === 1) bySkeleton.get(sk).add(sk);
  }
  const skeleton = {};
  let groupCount = 0;
  for (const membersSet of bySkeleton.values()) {
    if (membersSet.size < 2) continue; // no confusable partner, nothing to record
    groupCount++;
    const sorted = sortedUnique(Array.from(membersSet));
    for (const ch of sorted) {
      skeleton[ch] = sorted.filter((m) => m !== ch);
    }
  }
  return { skeleton: sortObjectKeys(skeleton), groupCount, keyCount: Object.keys(skeleton).length };
}

// ---------------------------------------------------------------------------
// Unihan_Variants.txt -> hanVisual / hanVariant / hanSemantic
// ---------------------------------------------------------------------------

function parseUnihanVariants(text) {
  const buckets = { hanVisual: new SymmetricMap(), hanVariant: new SymmetricMap(), hanSemantic: new SymmetricMap() };
  for (const line of lines(text)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [srcTok, field, valueField] = parts;
    const bucketName = VARIANT_FIELD_BUCKET[field];
    if (!bucketName) continue;
    const srcCp = parseUPlus(srcTok);
    if (srcCp == null) continue;
    const srcChar = cp(srcCp);
    for (const rawToken of valueField.trim().split(/\s+/)) {
      const dstCp = parseUPlus(stripUnihanTag(rawToken));
      if (dstCp == null) continue;
      buckets[bucketName].add(srcChar, cp(dstCp));
    }
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Unihan_IRGSources.txt -> hanRadicalStroke / hanTotalStroke / Japanese set
// ---------------------------------------------------------------------------

const RS_KEY_RE = /^(\d{1,3}'?)\.(\d{1,2})$/;

function parseUnihanIRGSources(text) {
  const radicalStroke = new Map(); // char -> Set of "R.S" keys
  const totalStroke = new Map(); // char -> Set of total-stroke keys
  const japaneseHan = new Set();
  for (const line of lines(text)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [srcTok, field, valueField] = parts;
    const srcCp = parseUPlus(srcTok);
    if (srcCp == null) continue;
    const ch = cp(srcCp);
    if (field === 'kRSUnicode') {
      for (const token of valueField.trim().split(/\s+/)) {
        if (!RS_KEY_RE.test(token)) continue;
        if (!radicalStroke.has(ch)) radicalStroke.set(ch, new Set());
        radicalStroke.get(ch).add(token);
      }
    } else if (field === 'kTotalStrokes') {
      for (const token of valueField.trim().split(/\s+/)) {
        if (!/^\d+$/.test(token)) continue;
        if (!totalStroke.has(ch)) totalStroke.set(ch, new Set());
        totalStroke.get(ch).add(token);
      }
    } else if (field === 'kIRG_JSource') {
      if (valueField.trim()) japaneseHan.add(ch);
    }
  }
  return { radicalStroke, totalStroke, japaneseHan };
}

function buildStrokeGroups(perCharMap, japaneseHan) {
  const universal = new Map(); // key -> Set(char)
  for (const [ch, keys] of perCharMap) {
    for (const key of keys) {
      if (!universal.has(key)) universal.set(key, new Set());
      universal.get(key).add(ch);
    }
  }
  const universalObj = {};
  const japaneseObj = {};
  for (const key of Array.from(universal.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const members = sortedUnique(Array.from(universal.get(key)));
    universalObj[key] = members;
    const jpMembers = members.filter((m) => japaneseHan.has(m));
    if (jpMembers.length) japaneseObj[key] = jpMembers;
  }
  const perCharObj = {};
  for (const [ch, keys] of perCharMap) {
    perCharObj[ch] = Array.from(keys).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return {
    perChar: sortObjectKeys(perCharObj),
    groups: sortNumericLikeKeys(universalObj),
    japaneseGroups: sortNumericLikeKeys(japaneseObj)
  };
}

function sortNumericLikeKeys(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) out[key] = obj[key];
  return out;
}

// ---------------------------------------------------------------------------
// EquivalentUnifiedIdeograph.txt -> hanEquivalent
// ---------------------------------------------------------------------------

function parseEquivalentUnifiedIdeograph(text) {
  const map = new SymmetricMap();
  let mappings = 0;
  for (const line of lines(text)) {
    const semi = line.split('#')[0];
    const fields = semi.split(';');
    if (fields.length < 2) continue;
    const rangeTok = fields[0].trim();
    const targetCp = parseInt(fields[1].trim(), 16);
    if (Number.isNaN(targetCp)) continue;
    const [loHex, hiHex] = rangeTok.split('..');
    const lo = parseInt(loHex, 16);
    const hi = hiHex ? parseInt(hiHex, 16) : lo;
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    for (let c = lo; c <= hi; c++) {
      map.add(cp(c), cp(targetCp));
      mappings++;
    }
  }
  return { map, mappings };
}

// ---------------------------------------------------------------------------
// StandardizedVariants.txt -> hanStandardized
// ---------------------------------------------------------------------------

function parseStandardizedVariants(text) {
  const perChar = new Map(); // char -> Set(vs char)
  let sequences = 0;
  for (const line of lines(text)) {
    const semi = line.split('#')[0];
    const fields = semi.split(';');
    if (fields.length < 1) continue;
    const seqTok = fields[0].trim();
    const cps = seqTok.split(/\s+/).map((h) => parseInt(h, 16));
    if (cps.length !== 2 || cps.some(Number.isNaN)) continue;
    const [baseCp, vsCp] = cps;
    if (!isHanCodePoint(baseCp)) continue; // this file also covers non-Han scripts
    const ch = cp(baseCp);
    if (!perChar.has(ch)) perChar.set(ch, new Set());
    perChar.get(ch).add(cp(vsCp));
    sequences++;
  }
  const out = {};
  for (const [ch, set] of perChar) out[ch] = sortedUnique(Array.from(set));
  return { hanStandardized: sortObjectKeys(out), sequences, keyCount: perChar.size };
}

// ---------------------------------------------------------------------------
// UnicodeData.txt -> hanCompatibility (compat ideograph <-> unified ideograph)
// ---------------------------------------------------------------------------

function parseUnicodeDataCompatibility(text) {
  const map = new SymmetricMap();
  let mappings = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;
    const fields = line.split(';');
    if (fields.length < 6) continue;
    const srcCp = parseInt(fields[0], 16);
    if (Number.isNaN(srcCp)) continue;
    const decomposition = fields[5].trim();
    if (!decomposition || decomposition.startsWith('<')) continue; // tagged (compat) decompositions don't count
    const decompParts = decomposition.split(/\s+/);
    if (decompParts.length !== 1) continue; // singleton canonical decomposition only
    const targetCp = parseInt(decompParts[0], 16);
    if (Number.isNaN(targetCp) || targetCp === srcCp) continue;
    if (!isHanCodePoint(targetCp)) continue;
    map.add(cp(srcCp), cp(targetCp));
    mappings++;
  }
  return { map, mappings };
}

// ---------------------------------------------------------------------------
// IVD_Sequences.txt -> ivsJapanese / ivsOther
// ---------------------------------------------------------------------------

function parseIvdSequences(text) {
  const japanese = new Map(); // char -> Set(vs char)
  const other = new Map();
  let version = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!version) {
      const m = /^#\s*Date:\s*(\S+)/.exec(line);
      if (m) version = m[1];
    }
    if (!line || line.startsWith('#')) continue;
    const fields = line.split(';').map((f) => f.trim());
    if (fields.length < 2) continue;
    const [seqTok, collection] = fields;
    const us = seqTok.split('_');
    if (us.length !== 2) continue;
    const baseCp = parseUPlus(us[0]);
    const vsCp = parseUPlus(us[1]);
    if (baseCp == null || vsCp == null) continue;
    const ch = cp(baseCp);
    const target = JAPANESE_IVD_COLLECTIONS.has(collection) ? japanese : other;
    if (!target.has(ch)) target.set(ch, new Set());
    target.get(ch).add(cp(vsCp));
  }
  const toObj = (m) => {
    const out = {};
    for (const [ch, set] of m) out[ch] = sortedUnique(Array.from(set));
    return sortObjectKeys(out);
  };
  return { ivsJapanese: toObj(japanese), ivsOther: toObj(other), version };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let outPath = path.join(REPO_ROOT, 'confuse-dictionary.js');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outPath = path.resolve(process.cwd(), args[i + 1]);
      i++;
    }
  }

  await ensureCacheDir();

  log('fetching confusables.txt');
  const confusablesText = await cachedFetchText(SOURCES.confusables, 'confusables.txt');
  const { version: unicodeVersionFromConfusables, table: confusablesTable } = parseConfusables(confusablesText);
  log('building skeleton groups');
  const { skeleton, groupCount: skeletonGroups, keyCount: skeletonKeys } = buildSkeletonGroups(confusablesTable);

  log('fetching Unihan.zip');
  const unihanZipBuf = await cachedFetchBuffer(SOURCES.unihanZip, 'Unihan.zip');
  const unihanZipPath = path.join(CACHE_DIR, 'Unihan.zip');
  if (!existsSync(unihanZipPath)) await fs.writeFile(unihanZipPath, unihanZipBuf);
  const unihanFiles = await extractUnihanMembers(unihanZipPath, ['Unihan_Variants.txt', 'Unihan_IRGSources.txt']);

  log('parsing Unihan_Variants.txt');
  const variantBuckets = parseUnihanVariants(unihanFiles['Unihan_Variants.txt']);

  log('parsing Unihan_IRGSources.txt');
  const { radicalStroke, totalStroke, japaneseHan } = parseUnihanIRGSources(unihanFiles['Unihan_IRGSources.txt']);
  const radicalStrokeGroups = buildStrokeGroups(radicalStroke, japaneseHan);
  const totalStrokeGroups = buildStrokeGroups(totalStroke, japaneseHan);

  log('fetching EquivalentUnifiedIdeograph.txt');
  const equivText = await cachedFetchText(SOURCES.equivalentUnifiedIdeograph, 'EquivalentUnifiedIdeograph.txt');
  const { map: hanEquivalentMap, mappings: hanEquivalentMappings } = parseEquivalentUnifiedIdeograph(equivText);

  log('fetching StandardizedVariants.txt');
  const stdVarText = await cachedFetchText(SOURCES.standardizedVariants, 'StandardizedVariants.txt');
  const { hanStandardized, sequences: hanStandardizedSequences } = parseStandardizedVariants(stdVarText);

  log('fetching UnicodeData.txt');
  const unicodeDataText = await cachedFetchText(SOURCES.unicodeData, 'UnicodeData.txt');
  const { map: hanCompatibilityMap, mappings: hanCompatibilityMappings } = parseUnicodeDataCompatibility(unicodeDataText);

  log('fetching IVD_Sequences.txt');
  const ivdText = await cachedFetchText(SOURCES.ivdSequences, 'IVD_Sequences.txt');
  const { ivsJapanese, ivsOther, version: ivdVersion } = parseIvdSequences(ivdText);
  const ivsSequences =
    Object.values(ivsJapanese).reduce((n, a) => n + a.length, 0) +
    Object.values(ivsOther).reduce((n, a) => n + a.length, 0);

  // Try to pin down a UCD version string. UnicodeData.txt does not carry one
  // itself; confusables.txt's "# Version:" header is the most reliable
  // signal since it tracks the UCD release it was built from.
  const unicodeVersion = unicodeVersionFromConfusables || 'unknown';
  const ivd = ivdVersion || 'unknown';

  const hanUniverseKeys = new Set([...radicalStroke.keys(), ...totalStroke.keys()]).size;

  const dictionary = {
    hanCompatibility: hanCompatibilityMap.toSortedObject(),
    hanEquivalent: hanEquivalentMap.toSortedObject(),
    hanJapaneseRadicalStrokeGroups: radicalStrokeGroups.japaneseGroups,
    hanJapaneseTotalStrokeGroups: totalStrokeGroups.japaneseGroups,
    hanRadicalStroke: radicalStrokeGroups.perChar,
    hanRadicalStrokeGroups: radicalStrokeGroups.groups,
    hanSemantic: variantBuckets.hanSemantic.toSortedObject(),
    hanStandardized,
    hanTotalStroke: totalStrokeGroups.perChar,
    hanTotalStrokeGroups: totalStrokeGroups.groups,
    hanVariant: variantBuckets.hanVariant.toSortedObject(),
    hanVisual: variantBuckets.hanVisual.toSortedObject(),
    ivsJapanese,
    ivsOther,
    meta: {
      schema: 3,
      unicode: unicodeVersion,
      ivd,
      skeletonGroups,
      skeletonKeys,
      hanVisualKeys: variantBuckets.hanVisual.size,
      hanVariantKeys: variantBuckets.hanVariant.size,
      hanSemanticKeys: variantBuckets.hanSemantic.size,
      ivsSequences,
      hanCompatibilityMappings,
      hanStandardizedSequences,
      hanEquivalentMappings,
      japaneseHanKeys: japaneseHan.size,
      hanUniverseKeys,
      radicalStrokeKeys: radicalStroke.size,
      radicalStrokeGroups: Object.keys(radicalStrokeGroups.groups).length,
      japaneseRadicalStrokeGroups: Object.keys(radicalStrokeGroups.japaneseGroups).length,
      totalStrokeKeys: totalStroke.size,
      totalStrokeGroups: Object.keys(totalStrokeGroups.groups).length,
      sources: Object.values(SOURCES)
    },
    skeleton
  };

  const header =
    `/* Generated from Unicode confusables ${unicodeVersion}, Unihan/UCD ${unicodeVersion} ` +
    `(including Equivalent_Unified_Ideograph), and IVD ${ivd}.\n` +
    `   Unicode data terms: https://www.unicode.org/license.txt */\n`;
  const body = `window.TYPE_DEFORMER_CONFUSE_DICTIONARY=${JSON.stringify(dictionary)};\n`;

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, header + body, 'utf8');

  log('wrote', outPath);
  log('--- meta ---');
  for (const [k, v] of Object.entries(dictionary.meta)) {
    if (k === 'sources') continue;
    log(' ', k, '=', v);
  }
}

main().catch((err) => {
  console.error('[confuse-dict] FAILED:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
