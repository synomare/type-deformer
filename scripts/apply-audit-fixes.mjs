#!/usr/bin/env node

import fs from 'node:fs';

const file = 'index.html';
const source = fs.readFileSync(file, 'utf8');
const before = 'aria-controls="sectionCreate"';
const after = 'aria-controls="sectionText"';
const occurrences = source.split(before).length - 1;

if (occurrences === 0) {
  console.log('ARIA target is already corrected; no source change required.');
  process.exit(0);
}
if (occurrences !== 1) {
  throw new Error(`Expected exactly one ${before} occurrence, found ${occurrences}.`);
}

fs.writeFileSync(file, source.replace(before, after));
console.log('Corrected the TEXT section aria-controls target.');
