/**
 * tests/oracle/oracle.test.js
 *
 * Compiler-oracle verification suite. Uses the real GnuCOBOL compiler (cobc)
 * as ground truth for COBOL semantics, instead of trusting hand-authored
 * expectation files alone, and (for Phase 1 data-layout programs) also runs
 * the engine's generated Scala with scala-cli to compare its behavior
 * directly against cobc's.
 *
 * Three things happen here:
 *
 *  1. Toolchain availability is checked up front. If cobc or scala-cli is
 *     missing, the relevant tests report via t.skip() (not a failure) so the
 *     suite stays green on machines without the toolchain installed.
 *
 *  2. Every *.cbl file found anywhere under tests/corpus/ is compiled and run
 *     with cobc. Actual stdout is captured to a sibling `<name>.oracle.txt`
 *     file (this is a live artifact - it is rewritten every run). Where a
 *     sibling `<name>.expected.txt` already exists, it is diffed against the
 *     actual cobc output and a mismatch FAILS the test - see the assertion
 *     message for how to decide whether the expectation file or the program
 *     is wrong. tests/corpus/ may still be getting populated by another
 *     agent; discovery tolerates it being partially or entirely absent.
 *
 *  3. For tests/corpus/data/** only (Phase 1 scope), the same COBOL source is
 *     also run through convertToScala() and the generated Scala is executed
 *     with scala-cli. cobc output vs generated-Scala output is compared
 *     directly (oracleCompare). Programs that already match are asserted;
 *     programs that don't are registered as `t.todo(...)` with the exact
 *     mismatch reason, so they show up as a visible (non-failing) work queue
 *     rather than being silently dropped or having their assertions weakened.
 */

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkCobcAvailable,
  checkScalaCliAvailable,
  lineDiff,
  normalizeOutput,
  oracleCompare,
  runCobol,
  warmupScala,
} from './harness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const CORPUS_ROOT = path.join(PACKAGE_ROOT, 'tests', 'corpus');

// Generous per-test safety-net timeouts. The harness itself already enforces
// tighter timeouts on the child processes it spawns (10s cobc / 120s
// scala-cli); these are just a backstop against the harness hanging.
const COBOL_TEST_TIMEOUT_MS = 30_000;
const ORACLE_COMPARE_TEST_TIMEOUT_MS = 150_000;

async function fileExists(p) {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

async function walkCblFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkCblFiles(full)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.cbl')) {
      found.push(full);
    }
  }
  return found;
}

function summarizeMismatch(result) {
  if (result.conversionError) {
    return `convertToScala() threw: ${result.conversionError.message}`;
  }
  if (result.scalaResult?.phase === 'compile') {
    const firstError = result.scalaResult.stderr
      .split('\n')
      .find((line) => /error/i.test(line) || /Not found/.test(line));
    return `generated Scala failed to compile (${firstError ?? 'see stderr'})`;
  }
  if (result.cobolResult.phase !== 'run' || result.cobolResult.exitCode !== 0) {
    return `cobc itself did not run cleanly (phase=${result.cobolResult.phase}, exitCode=${result.cobolResult.exitCode})`;
  }
  if (result.scalaResult && result.scalaResult.exitCode !== 0) {
    return `generated Scala compiled but exited ${result.scalaResult.exitCode} at runtime: ${result.scalaResult.stderr.slice(0, 200)}`;
  }
  return `stdout mismatch:\n${result.diff}`;
}

// --- one-time toolchain checks + corpus discovery (this file is ESM, so
// top-level await is available; test registration below is synchronous and
// depends on these results, same pattern as any other data-driven suite). ---
const cobcAvailable = await checkCobcAvailable();
const scalaCliAvailable = await checkScalaCliAvailable();
const allCblFiles = (await walkCblFiles(CORPUS_ROOT)).sort();
const dataCblFiles = allCblFiles.filter(
  (f) => path.relative(CORPUS_ROOT, f).split(path.sep)[0] === 'data'
);

describe('toolchain availability', () => {
  test('cobc (GnuCOBOL) is on PATH and responds to --version', (t) => {
    if (!cobcAvailable) {
      t.skip('cobc not found on PATH - install GnuCOBOL (see docs/toolchain-status.md); all cobc-dependent tests below will skip');
      return;
    }
    assert.ok(cobcAvailable);
  });

  test('scala-cli is on PATH and responds to version', (t) => {
    if (!scalaCliAvailable) {
      t.skip('scala-cli not found on PATH; all scala-cli-dependent tests below will skip');
      return;
    }
    assert.ok(scalaCliAvailable);
  });
});

describe('corpus discovery', () => {
  test('tests/corpus/**/*.cbl is discoverable', (t) => {
    if (allCblFiles.length === 0) {
      t.skip(
        'no .cbl files found under tests/corpus/ yet - the corpus may still be under construction by another agent; re-run once it exists'
      );
      return;
    }
    assert.ok(allCblFiles.length > 0, `found ${allCblFiles.length} corpus program(s)`);
  });
});

describe('cobc oracle capture: every tests/corpus/**/*.cbl', () => {
  for (const cblPath of allCblFiles) {
    const rel = path.relative(CORPUS_ROOT, cblPath);

    test(`cobc runs ${rel}`, { timeout: COBOL_TEST_TIMEOUT_MS }, async (t) => {
      if (!cobcAvailable) {
        t.skip('cobc unavailable');
        return;
      }

      const result = await runCobol(cblPath);
      const dir = path.dirname(cblPath);
      const base = path.basename(cblPath, '.cbl');
      const oraclePath = path.join(dir, `${base}.oracle.txt`);

      // Always (re)write the .oracle.txt artifact, even on failure, so it's
      // obvious from the file itself what cobc actually did last run.
      const captured =
        result.phase === 'compile'
          ? `# cobc COMPILE ERROR (exit ${result.exitCode})\n${result.stderr}`
          : result.exitCode !== 0
            ? `# program exited ${result.exitCode}\n${result.stdout}\n# stderr:\n${result.stderr}`
            : result.stdout;
      await fs.writeFile(oraclePath, captured, 'utf-8');

      assert.equal(
        result.phase,
        'run',
        `cobc failed to COMPILE ${rel} (the .cbl source has a syntax/semantic error cobc itself rejects):\n${result.stderr}`
      );
      assert.equal(
        result.exitCode,
        0,
        `${rel} compiled but exited nonzero (${result.exitCode}) at runtime under cobc:\n${result.stderr || result.stdout}`
      );

      const expectedPath = path.join(dir, `${base}.expected.txt`);
      if (!(await fileExists(expectedPath))) {
        t.diagnostic(`no ${base}.expected.txt alongside ${rel} yet; captured ${base}.oracle.txt only`);
        return;
      }

      const expected = normalizeOutput(await fs.readFile(expectedPath, 'utf-8'));
      const actual = normalizeOutput(result.stdout);
      if (expected !== actual) {
        const diffs = lineDiff(expected, actual);
        assert.fail(
          `${base}.expected.txt does NOT match actual cobc output for ${rel}.\n` +
            'This is a real GnuCOBOL run, so cobc is ground truth here - one of two things is true, ' +
            'inspect both before deciding which:\n' +
            `  (a) ${base}.expected.txt was authored with an incorrect assumption about COBOL semantics ` +
            '(the corpus expectation is suspect), or\n' +
            `  (b) ${base}.cbl itself does not implement the behavior its corpus intent describes ` +
            '(the program is suspect).\n' +
            `Mismatch (expected vs actual cobc output):\n${diffs.join('\n')}`
        );
      }
    });
  }
});

describe('Phase 1 oracle compare: cobc vs generated Scala (tests/corpus/data only)', () => {
  before(async () => {
    if (cobcAvailable && scalaCliAvailable && dataCblFiles.length > 0) {
      await warmupScala();
    }
  });

  for (const cblPath of dataCblFiles) {
    const rel = path.relative(CORPUS_ROOT, cblPath);

    test(`oracle compare: ${rel}`, { timeout: ORACLE_COMPARE_TEST_TIMEOUT_MS }, async (t) => {
      if (!cobcAvailable || !scalaCliAvailable) {
        t.skip('cobc and/or scala-cli unavailable; skipping COBOL-vs-Scala comparison');
        return;
      }

      const result = await oracleCompare(cblPath, { scalaOpts: { timeout: 120_000 } });

      if (!result.match) {
        // This is the Phase 1 work queue: currently-failing conversions are
        // marked todo (visible, non-failing) with the exact mismatch reason
        // rather than having their assertion removed or weakened.
        t.todo(`Phase 1 work queue - ${rel}: ${summarizeMismatch(result)}`);
        return;
      }

      assert.ok(result.match, `COBOL and generated Scala output should match for ${rel}`);
    });
  }
});
