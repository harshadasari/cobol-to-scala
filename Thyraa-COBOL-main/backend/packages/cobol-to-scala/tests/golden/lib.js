/**
 * tests/golden/lib.js - shared by golden.test.js (the gate) and update.js
 * (the deliberate refresh). Generates, in memory, the Scala that
 * convertToScala() emits for every tests/corpus/**\/*.cbl program.
 *
 * Snapshot path: tests/golden/<corpus-relative-path with .cbl -> .scala>.
 * Conversion options mirror the oracle (generateMain: true, plus the
 * program's own `.copybooks.json` sidecar when present). A program for which
 * convertToScala() throws is snapshotted as a single `// convertToScala()
 * THREW: ...` line, so a newly-thrown (or newly-fixed) program is a diff too.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertToScala } from '../../index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(here, '..', '..');
export const CORPUS_ROOT = path.join(PACKAGE_ROOT, 'tests', 'corpus');
export const GOLDEN_ROOT = here;

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, ext, out);
    else if (e.isFile() && e.name.endsWith(ext)) out.push(full);
  }
  return out;
}

/** Corpus-relative POSIX paths of every .cbl program, sorted. */
export function listCorpusPrograms() {
  return walk(CORPUS_ROOT, '.cbl')
    .map((f) => path.relative(CORPUS_ROOT, f).split(path.sep).join('/'))
    .sort();
}

/** Golden-relative POSIX paths of every committed snapshot, sorted. */
export function listGoldenFiles() {
  return walk(GOLDEN_ROOT, '.scala')
    .map((f) => path.relative(GOLDEN_ROOT, f).split(path.sep).join('/'))
    .sort();
}

export function goldenPathFor(rel) {
  return path.join(GOLDEN_ROOT, rel.replace(/\.cbl$/, '.scala'));
}

/** Convert one corpus program (corpus-relative path) and return the snapshot text. */
export function generateSnapshot(rel) {
  const cbl = path.join(CORPUS_ROOT, rel);
  const source = fs.readFileSync(cbl, 'utf-8');
  const cpPath = cbl.replace(/\.cbl$/, '.copybooks.json');
  const copybooks = fs.existsSync(cpPath) ? JSON.parse(fs.readFileSync(cpPath, 'utf-8')) : undefined;
  try {
    const out = convertToScala(source, { generateMain: true, ...(copybooks ? { copybooks } : {}) });
    return out.scala.endsWith('\n') ? out.scala : out.scala + '\n';
  } catch (err) {
    return `// convertToScala() THREW: ${String(err?.message ?? err).split('\n')[0]}\n`;
  }
}
