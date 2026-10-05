/**
 * Golden-snapshot gate (fast, no cobc / scala-cli needed).
 *
 * Regenerates, in memory, the Scala for every tests/corpus/**\/*.cbl program
 * and fails on ANY difference from the committed tests/golden/**\/*.scala.
 *
 * An engine change that alters generated output must update the golden ON
 * PURPOSE:   npm run golden:update   then review `git diff tests/golden`
 * and commit it together with the engine change. A red run here means
 * "generated output changed" - it is not by itself a statement that the
 * change is wrong, only that nobody has looked yet. Behavioural correctness
 * is still judged by the cobc oracle (tests/oracle), not by this gate.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { generateSnapshot, goldenPathFor, listCorpusPrograms, listGoldenFiles } from './lib.js';

const HOWTO = 'If this change is intended, run `npm run golden:update`, review `git diff tests/golden`, and commit it with the engine change.';

function firstDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `line ${i + 1}: golden ${JSON.stringify(x[i])} / now ${JSON.stringify(y[i])}`;
  }
  return 'identical';
}

describe('golden snapshots of convertToScala() over the corpus', () => {
  const programs = listCorpusPrograms();

  test('every corpus program has a snapshot, and every snapshot has a program', () => {
    const have = new Set(listGoldenFiles());
    const want = new Set(programs.map((p) => p.replace(/\.cbl$/, '.scala')));
    const missing = [...want].filter((g) => !have.has(g));
    const orphan = [...have].filter((g) => !want.has(g));
    assert.equal(missing.length + orphan.length, 0, `missing snapshots: ${missing.slice(0, 10).join(', ')} (${missing.length}); orphan snapshots: ${orphan.slice(0, 10).join(', ')} (${orphan.length}). Run \`npm run golden:update\`.`);
    assert.ok(programs.length > 0);
  });

  test('regenerated output equals every committed snapshot', () => {
    const diffs = [];
    for (const rel of programs) {
      const target = goldenPathFor(rel);
      if (!fs.existsSync(target)) continue; // reported by the test above
      const golden = fs.readFileSync(target, 'utf-8');
      const now = generateSnapshot(rel);
      if (golden !== now) diffs.push(`  ${rel} - ${firstDiff(golden, now)}`);
    }
    assert.equal(
      diffs.length,
      0,
      `${diffs.length} of ${programs.length} programs now generate different Scala than their golden snapshot:\n${diffs.slice(0, 25).join('\n')}${diffs.length > 25 ? `\n  ... and ${diffs.length - 25} more` : ''}\n${HOWTO}`
    );
  });

  test('generation is deterministic (two passes agree)', () => {
    for (const rel of programs.slice(0, 40)) {
      assert.equal(generateSnapshot(rel), generateSnapshot(rel), `${rel} generated different output on two passes`);
    }
  });
});
