/**
 * npm run golden:update
 *
 * Deliberately refreshes tests/golden/**\/*.scala from the CURRENT engine.
 * Run this ONLY when you meant to change generated output, then review
 * `git diff tests/golden` and commit it with the engine change - the diff is
 * the reviewable record of exactly what the engine change did to every
 * program. Also deletes snapshots whose corpus program no longer exists.
 */
import fs from 'node:fs';
import path from 'node:path';

import { generateSnapshot, goldenPathFor, listCorpusPrograms, listGoldenFiles, GOLDEN_ROOT } from './lib.js';

let written = 0;
let changed = 0;
let created = 0;
const programs = listCorpusPrograms();
for (const rel of programs) {
  const target = goldenPathFor(rel);
  const text = generateSnapshot(rel);
  const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null;
  if (prev === text) continue;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, 'utf-8');
  written++;
  if (prev === null) created++;
  else changed++;
}

const expected = new Set(programs.map((p) => p.replace(/\.cbl$/, '.scala')));
let removed = 0;
for (const g of listGoldenFiles()) {
  if (!expected.has(g)) {
    fs.rmSync(path.join(GOLDEN_ROOT, g));
    removed++;
  }
}
console.log(`golden: ${programs.length} programs; ${created} created, ${changed} changed, ${removed} orphan(s) removed, ${programs.length - written} unchanged`);
