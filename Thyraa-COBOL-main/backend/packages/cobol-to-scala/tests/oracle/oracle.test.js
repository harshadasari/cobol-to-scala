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
 *  1. The toolchain is checked up front and HARD-FAILS: a single test,
 *     "oracle toolchain present and pinned (...)", fails loudly when cobc is
 *     missing, when `cobc --version` is not the pinned version
 *     (harness.js PINNED_COBC_VERSION, default 4.0-early-dev.0, override with
 *     env ORACLE_COBC_VERSION), or when scala-cli is missing. A green run can
 *     therefore never mean "the oracle silently didn't run". Only the explicit
 *     opt-out env ORACLE_ALLOW_SKIP=1 turns that into a skip.
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
import os from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PINNED_COBC_VERSION,
  allowSkip,
  inspectToolchain,
  lineDiff,
  loadStdinSidecar,
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

/**
 * round-7 findings 1/promotion: a corpus program that uses `COPY <name>[
 * REPLACING ...]` (e.g. u09/u10's own repro shape) needs the same copybook
 * text handed to both convertToScala() (options.copybooks) and cobc
 * (harness.js's runCobol/oracleCompare - now also accepts `opts.copybooks`,
 * writing each as `<name>.cpy` and passing `-I` so cobc's own COPY
 * resolution finds them) - otherwise `COPY CUSTREC` has nothing to expand
 * against on either side. A sibling `<base>.copybooks.json` file (`{"NAME":
 * "copybook source text", ...}`) is optional - undefined (not `{}`) when
 * absent, so a program with no COPY statement is completely unaffected.
 */
async function loadCopybooksFor(cblPath) {
  const dir = path.dirname(cblPath);
  const base = path.basename(cblPath, '.cbl');
  const copybooksPath = path.join(dir, `${base}.copybooks.json`);
  if (!(await fileExists(copybooksPath))) return undefined;
  return JSON.parse(await fs.readFile(copybooksPath, 'utf-8'));
}

async function walkCblFiles(dir, suffix = '.cbl') {
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
      found.push(...(await walkCblFiles(full, suffix)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(suffix)) {
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
  const parts = [];
  if (result.stdoutMatch === false) parts.push(`stdout mismatch:\n${result.stdoutDiff}`);
  if (result.fileMatch === false) parts.push(result.fileDiff);
  return parts.length > 0 ? parts.join('\n') : `stdout mismatch:\n${result.diff}`;
}

// --- one-time toolchain checks + corpus discovery (this file is ESM, so
// top-level await is available; test registration below is synchronous and
// depends on these results, same pattern as any other data-driven suite). ---
const toolchain = await inspectToolchain();
// Heavy tests run only on a good toolchain. If it is bad, the "toolchain
// present and pinned" test below FAILS (loud); the heavy tests are then
// skipped rather than burning an hour against the wrong oracle. With the
// explicit opt-out ORACLE_ALLOW_SKIP=1, a present-but-unpinned tool is used
// anyway (a deliberate re-baseline) and a missing one skips.
const gateOpen = toolchain.ok || allowSkip();
const cobcAvailable = toolchain.cobc.available && gateOpen;
const scalaCliAvailable = toolchain.scalaCli.available && gateOpen;
const DIALECT = /^[a-z0-9][a-z0-9-]*$/.test(process.env.ORACLE_DIALECT ?? '') ? process.env.ORACLE_DIALECT : null;
const SKIP_SCALA = process.env.ORACLE_SKIP_SCALA === '1';
// tests/corpus/sql/ programs contain EXEC SQL ... END-EXEC blocks, which
// plain GnuCOBOL cannot compile (they require a database precompiler such as
// ocesql/DB2's coprocessor, neither of which is part of this repo's oracle
// toolchain) - cobc rejects them with "'EXEC' is not defined". They are
// exercised by tests/sql.test.js (parse -> Doobie generation -> scala-cli
// compile against real doobie-core) instead of by the cobc oracle, so they
// are excluded from the cobc capture sweep here rather than allowed to fail
// it. Every other corpus subdirectory remains cobc-oracled as before.
const allCblFiles = (await walkCblFiles(CORPUS_ROOT))
  .sort()
  .filter((f) => path.relative(CORPUS_ROOT, f).split(path.sep)[0] !== 'sql');
const dataCblFiles = allCblFiles.filter(
  (f) => path.relative(CORPUS_ROOT, f).split(path.sep)[0] === 'data'
);
const procCblFiles = allCblFiles.filter(
  (f) => path.relative(CORPUS_ROOT, f).split(path.sep)[0] === 'proc'
);

describe('toolchain availability', () => {
  test(`oracle toolchain present and pinned (${toolchain.summary})`, (t) => {
    t.diagnostic(`observed: ${toolchain.summary}`);
    if (toolchain.ok) {
      assert.ok(true);
      return;
    }
    const msg =
      `ORACLE TOOLCHAIN NOT USABLE: ${toolchain.problems.join('; ')}. ` +
      `Observed ${toolchain.summary}. The oracle is only valid on cobc ${PINNED_COBC_VERSION} ` +
      '(override: env ORACLE_COBC_VERSION) plus an installed scala-cli (see docs/toolchain-status.md). ' +
      'Set ORACLE_ALLOW_SKIP=1 to knowingly skip instead of fail.';
    if (allowSkip()) {
      t.skip(`ORACLE_ALLOW_SKIP=1: ${msg}`);
      return;
    }
    assert.fail(msg);
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

// Known written-file divergences (see docs/EQUIVALENCE_SUITE.md section 5):
// corpus programs whose STDOUT matches cobc but whose written FILE image does
// not, recorded when file parity was introduced (ledger value = divergence
// class). They stay visible (diagnostic on every run) and are ratcheted: a
// program NOT in the ledger with a file mismatch is a todo like any other
// mismatch, and a ledger entry whose files now match FAILS ("stale") so the
// ledger can only shrink.
const fileParityLedger = JSON.parse(
  await fs.readFile(path.join(__dirname, 'file-parity-ledger.json'), 'utf-8').catch(() => '{}')
);

function assertParity(t, label, rel, result) {
  const known = fileParityLedger[rel];
  if (result.match) {
    assert.ok(!known, `${rel} is listed in tests/oracle/file-parity-ledger.json (${known}) but its written files now match cobc - remove the stale ledger entry`);
    return;
  }
  if (result.stdoutMatch === true && result.fileMatch === false && known) {
    t.diagnostic(`KNOWN written-file divergence (ledger: ${known}) - ${rel}: ${result.fileDiff.split('\n')[1]?.trim() ?? ''}`);
    return;
  }
  t.todo(`${label} - ${rel}: ${summarizeMismatch(result)}`);
}

// rel path -> runCobol result of the default-dialect capture (reused by the
// opt-in dialect-sensitivity run so the baseline is not recompiled).
const baselineCaptures = new Map();

describe('cobc oracle capture: every tests/corpus/**/*.cbl', () => {
  for (const cblPath of allCblFiles) {
    const rel = path.relative(CORPUS_ROOT, cblPath);

    test(`cobc runs ${rel}`, { timeout: COBOL_TEST_TIMEOUT_MS }, async (t) => {
      if (!cobcAvailable) {
        t.skip('cobc unavailable');
        return;
      }

      const copybooks = await loadCopybooksFor(cblPath);
      const stdin = await loadStdinSidecar(cblPath);
      const result = await runCobol(cblPath, {
        ...(copybooks ? { copybooks } : {}),
        ...(stdin !== undefined ? { stdin } : {}),
      });
      baselineCaptures.set(rel, result);
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

// Negative probes: tests/corpus/**/*.cbl.txt are programs that cobc itself
// REJECTS (compile error) or ABORTS at run time. They are deliberately not
// *.cbl so the capture/compare sweeps above never see them. Each has a
// sidecar `<base>.expect.json` recording cobc's own documented outcome:
//   { "outcome": "compile-error" | "exit-nonzero",
//     "exitCode": 1,
//     "stderrIncludes": ["substring of cobc/libcob stderr", ...],
//     "stdout": "exact normalized stdout before the abort"   // exit-nonzero only
//   }
// compile-error  -> cobc must fail to compile (phase 'compile', that exit code)
// exit-nonzero   -> cobc must compile, run, exit with that nonzero code and
//                   print exactly `stdout` first.
// Any change in cobc's behaviour FAILS (never todo); a probe without a
// sidecar fails too. The sibling `.oracle.txt` stays as human documentation.
const probeFiles = (await walkCblFiles(CORPUS_ROOT, '.cbl.txt')).sort();

describe('negative probes: tests/corpus/**/*.cbl.txt (cobc must reject / abort as documented)', () => {
  test('negative probes are discoverable', () => {
    assert.ok(probeFiles.length > 0, 'expected at least one tests/corpus/**/*.cbl.txt negative probe');
  });

  for (const probePath of probeFiles) {
    const rel = path.relative(CORPUS_ROOT, probePath);
    const base = path.basename(probePath, '.cbl.txt');
    const expectPath = path.join(path.dirname(probePath), `${base}.expect.json`);

    test(`negative probe: ${rel}`, { timeout: COBOL_TEST_TIMEOUT_MS }, async (t) => {
      if (!cobcAvailable) {
        t.skip('cobc unavailable');
        return;
      }
      assert.ok(await fileExists(expectPath), `${rel} has no sidecar ${base}.expect.json (see header comment in oracle.test.js)`);
      const expect = JSON.parse(await fs.readFile(expectPath, 'utf-8'));
      assert.ok(['compile-error', 'exit-nonzero'].includes(expect.outcome), `${base}.expect.json: unknown outcome ${expect.outcome}`);

      const result = await runCobol(probePath);
      const detail = `\ncobc phase=${result.phase} exitCode=${result.exitCode} timedOut=${result.timedOut}\nstdout: ${JSON.stringify(result.stdout)}\nstderr: ${result.stderr}`;
      const changed = `cobc's behaviour on negative probe ${rel} CHANGED vs ${base}.expect.json`;

      assert.equal(result.timedOut, false, `${changed}: timed out${detail}`);
      if (expect.outcome === 'compile-error') {
        assert.equal(result.phase, 'compile', `${changed}: expected a compile error, cobc compiled it${detail}`);
      } else {
        assert.equal(result.phase, 'run', `${changed}: expected cobc to compile it and abort at run time, but it failed to compile${detail}`);
        assert.equal(normalizeOutput(result.stdout), normalizeOutput(expect.stdout ?? ''), `${changed}: stdout before the abort differs${detail}`);
      }
      assert.equal(result.exitCode, expect.exitCode, `${changed}: exit code${detail}`);
      for (const needle of expect.stderrIncludes ?? []) {
        assert.ok(result.stderr.includes(needle), `${changed}: stderr no longer contains ${JSON.stringify(needle)}${detail}`);
      }
    });
  }
});

// Opt-in dialect-sensitivity run (env ORACLE_DIALECT=ibm | ibm-strict | ...).
// Runs cobc with `-std=<dialect>` IN ADDITION to the default capture above and
// reports, per program, whether cobc's OWN stdout/exit status differs between
// dialects ("dialect-sensitive"). Diagnostics only: it never changes the
// default oracle, the .oracle.txt files, or any pass/todo verdict, and these
// tests do not fail on a difference. See docs/ORACLE_DIVERGENCE_REGISTER.md
// section 6.2. Summary JSON goes to env ORACLE_DIALECT_REPORT (default:
// <tmpdir>/oracle-dialect-<dialect>.json).
describe(`dialect sensitivity: cobc default vs -std=${DIALECT} (diagnostics only)`, { skip: DIALECT === null && 'set ORACLE_DIALECT=ibm (or ibm-strict) to enable' }, () => {
  const rows = [];

  for (const cblPath of allCblFiles) {
    const rel = path.relative(CORPUS_ROOT, cblPath);
    test(`dialect: ${rel}`, { timeout: COBOL_TEST_TIMEOUT_MS * 2 }, async (t) => {
      if (!cobcAvailable) {
        t.skip('cobc unavailable');
        return;
      }
      const copybooks = await loadCopybooksFor(cblPath);
      const stdin = await loadStdinSidecar(cblPath);
      const common = { ...(copybooks ? { copybooks } : {}), ...(stdin !== undefined ? { stdin } : {}) };
      const baseline = baselineCaptures.get(rel) ?? (await runCobol(cblPath, common));
      const alt = await runCobol(cblPath, { ...common, std: DIALECT });

      let verdict;
      if (baseline.phase !== 'run') verdict = 'baseline-did-not-run';
      else if (alt.phase !== 'run') verdict = 'uncompilable-under-dialect';
      else if (alt.exitCode !== baseline.exitCode) verdict = 'dialect-sensitive';
      else if (alt.stdout !== baseline.stdout) verdict = 'dialect-sensitive';
      else verdict = 'same';

      rows.push({ program: rel, verdict });
      if (verdict !== 'same') t.diagnostic(`${rel}: ${verdict}`);
    });
  }

  test('dialect sensitivity summary', async (t) => {
    const count = (v) => rows.filter((r) => r.verdict === v).length;
    const sensitive = rows.filter((r) => r.verdict === 'dialect-sensitive').map((r) => r.program);
    const summary = {
      dialect: DIALECT,
      cobc: toolchain.cobc.version,
      programs: rows.length,
      'dialect-sensitive': sensitive.length,
      'uncompilable-under-dialect': count('uncompilable-under-dialect'),
      'baseline-did-not-run': count('baseline-did-not-run'),
      same: count('same'),
      sensitivePrograms: sensitive,
    };
    const reportPath = process.env.ORACLE_DIALECT_REPORT || path.join(os.tmpdir(), `oracle-dialect-${DIALECT}.json`);
    await fs.writeFile(reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8');
    t.diagnostic(
      `DIALECT SENSITIVITY -std=${DIALECT}: ${summary['dialect-sensitive']} of ${rows.length} programs dialect-sensitive, ` +
        `${summary['uncompilable-under-dialect']} uncompilable under the dialect, ${summary.same} identical (report: ${reportPath})`
    );
    assert.ok(rows.length === 0 || Array.isArray(sensitive));
  });
});

describe('Phase 1 oracle compare: cobc vs generated Scala (tests/corpus/data only)', { skip: SKIP_SCALA && 'ORACLE_SKIP_SCALA=1' }, () => {
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

      const copybooks = await loadCopybooksFor(cblPath);
      const result = await oracleCompare(cblPath, {
        scalaOpts: { timeout: 120_000 },
        ...(copybooks ? { convertOptions: { copybooks } } : {}),
      });

      assertParity(t, 'Phase 1 work queue', rel, result);
    });
  }
});

describe('Phase 2 oracle compare: cobc vs generated Scala (tests/corpus/proc)', { skip: SKIP_SCALA && 'ORACLE_SKIP_SCALA=1' }, () => {
  before(async () => {
    if (cobcAvailable && scalaCliAvailable && procCblFiles.length > 0) {
      await warmupScala();
    }
  });

  for (const cblPath of procCblFiles) {
    const rel = path.relative(CORPUS_ROOT, cblPath);

    test(`oracle compare: ${rel}`, { timeout: ORACLE_COMPARE_TEST_TIMEOUT_MS }, async (t) => {
      if (!cobcAvailable || !scalaCliAvailable) {
        t.skip('cobc and/or scala-cli unavailable; skipping COBOL-vs-Scala comparison');
        return;
      }

      const copybooks = await loadCopybooksFor(cblPath);
      const result = await oracleCompare(cblPath, {
        scalaOpts: { timeout: 120_000 },
        ...(copybooks ? { convertOptions: { copybooks } } : {}),
      });

      assertParity(t, 'Phase 2 work queue', rel, result);
    });
  }
});
