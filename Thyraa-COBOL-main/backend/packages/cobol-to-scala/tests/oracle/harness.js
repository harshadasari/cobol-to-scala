/**
 * tests/oracle/harness.js
 *
 * Compiler-oracle verification harness.
 *
 * Compiles and runs COBOL programs with the real GnuCOBOL compiler (cobc) and
 * generated Scala programs with scala-cli, so generated Scala output can be
 * checked against the behavior of an actual COBOL runtime rather than against
 * hand-written expectations alone.
 *
 * All compilation/execution happens in scratch directories under the OS temp
 * directory (os.tmpdir()) - never inside the repo - and scratch directories
 * are removed afterwards unless opts.keepTmp is set (useful for debugging a
 * harness failure by hand).
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { convertToScala } from '../../index.js';

const DEFAULT_COBOL_TIMEOUT_MS = 10_000;
const DEFAULT_SCALA_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 16 * 1024 * 1024;

// scala-cli / the JVM print this on every invocation because the sandbox
// injects JAVA_TOOL_OPTIONS globally (proxy/truststore config). It is not an
// error and not something the program under test produced, so it is filtered
// out of stderr before comparison/reporting.
const JAVA_TOOL_OPTIONS_LINE_RE = /^Picked up JAVA_TOOL_OPTIONS:.*$/gm;

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

/**
 * Run a child process to completion (or until timeout), never rejecting -
 * failures are reported in the returned object so callers can distinguish
 * "the harness itself broke" from "the program under test failed".
 *
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number|null, signal: string|null, timedOut: boolean}>}
 */
function runProcess(cmd, args, { cwd, timeout, env } = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, timeout, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, env: env ?? process.env },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0, signal: null, timedOut: false });
          return;
        }

        // Node sets `error.killed = true` when execFile kills the child
        // itself - either due to the `timeout` option firing, or maxBuffer
        // being exceeded. We only pass a timeout, so `killed` here means the
        // process ran longer than allowed.
        const timedOut = Boolean(error.killed && timeout);

        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: typeof error.code === 'number' ? error.code : null,
          signal: error.signal ?? null,
          timedOut,
        });
      }
    );
  });
}

function stripJavaToolOptionsNoise(stderr) {
  return stderr
    .replace(JAVA_TOOL_OPTIONS_LINE_RE, '')
    .replace(ANSI_ESCAPE_RE, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function makeScratchDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cleanupScratchDir(dir, opts) {
  if (opts?.keepTmp) return;
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Check whether a CLI tool responds to a version-style flag. Used by tests to
 * skip (not fail) when the toolchain isn't installed in a given environment.
 */
export async function checkCobcAvailable() {
  const result = await runProcess('cobc', ['--version'], { timeout: 10_000 });
  return result.exitCode === 0;
}

export async function checkScalaCliAvailable() {
  const result = await runProcess('scala-cli', ['version', '--offline'], { timeout: 15_000 });
  // scala-cli returns 0 for `version` even offline; if the binary is simply
  // missing, execFile fails to spawn (ENOENT) and exitCode stays null.
  return result.exitCode === 0;
}

/**
 * Compile and run a COBOL program with GnuCOBOL (cobc), entirely inside a
 * scratch directory (never in the repo tree, never in the caller's cwd).
 *
 * @param {string} cobolPath - absolute or repo-relative path to a .cbl/.cob source file
 * @param {object} [opts]
 * @param {number} [opts.timeout] - per-phase timeout in ms (default 10s)
 * @param {boolean} [opts.keepTmp] - keep the scratch dir around (debugging)
 * @param {string[]} [opts.args] - args passed to the compiled program
 * @param {string} [opts.stdin] - stdin fed to the compiled program
 *
 * @returns {Promise<{phase: 'compile'|'run', stdout: string, stderr: string,
 *   exitCode: number|null, timedOut: boolean, scratchDir: string}>}
 *   phase 'compile' means cobc itself failed (a compile error) - stdout/stderr
 *   are cobc's own output. phase 'run' means compilation succeeded and
 *   stdout/stderr/exitCode describe the *executed program's* behavior
 *   (a nonzero exitCode here is a runtime error, not a compile error).
 */
export async function runCobol(cobolPath, opts = {}) {
  const timeout = opts.timeout ?? DEFAULT_COBOL_TIMEOUT_MS;
  const scratchDir = await makeScratchDir('cobol-oracle-');

  try {
    const absSource = path.resolve(cobolPath);
    const baseName = path.basename(absSource).replace(/\.[^.]+$/, '');
    const localSource = path.join(scratchDir, `${baseName}.cob`);
    await fs.copyFile(absSource, localSource);

    // round-7: COPY-book resolution support (opts.copybooks: name -> text) -
    // write each one as `<scratchDir>/<NAME>.cpy` so cobc's own copybook
    // search path (`-I <dir>`) can resolve a `COPY <NAME>[ REPLACING ...]`
    // statement the same way this engine's own expandCopybooks()
    // (parser/copybook-resolver.js) already does on the Scala-generation
    // side - lets the oracle harness verify COPY-bearing corpus programs
    // against real cobc instead of only being able to skip them for lack of
    // copybook support (see u09/u10, round-7 refutation).
    const copybookNames = opts.copybooks ? Object.keys(opts.copybooks) : [];
    for (const name of copybookNames) {
      await fs.writeFile(path.join(scratchDir, `${name}.cpy`), opts.copybooks[name], 'utf-8');
    }

    const exePath = path.join(scratchDir, baseName);
    const cobcArgs = ['-x', '-o', exePath, localSource];
    if (copybookNames.length > 0) {
      cobcArgs.push('-I', scratchDir);
    }
    const compile = await runProcess('cobc', cobcArgs, {
      cwd: scratchDir,
      timeout,
    });

    if (compile.exitCode !== 0) {
      return {
        phase: 'compile',
        stdout: compile.stdout,
        stderr: compile.stderr,
        exitCode: compile.exitCode,
        timedOut: compile.timedOut,
        scratchDir,
      };
    }

    const run = await runProcess(exePath, opts.args ?? [], {
      cwd: scratchDir,
      timeout,
      ...(opts.stdin !== undefined ? { input: opts.stdin } : {}),
    });

    return {
      phase: 'run',
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      scratchDir,
    };
  } finally {
    await cleanupScratchDir(scratchDir, opts);
  }
}

let scalaWarmedUp = false;

/**
 * Write a Scala source string to a scratch dir and run it with `scala-cli
 * run`. The first invocation on a machine resolves and caches the Scala
 * compiler/stdlib from Maven Central, which can take significantly longer
 * than a normal run - call warmupScala() once before timing-sensitive runs
 * (the exported oracle.test.js suite does this in a `before` hook).
 *
 * @param {string} scalaSource
 * @param {object} [opts]
 * @param {number} [opts.timeout] - default 120s (first run may need to fetch deps)
 * @param {boolean} [opts.keepTmp]
 * @param {string} [opts.fileName] - defaults to Main.scala
 *
 * @returns {Promise<{phase: 'compile'|'run', stdout: string, stderr: string,
 *   exitCode: number|null, timedOut: boolean, scratchDir: string}>}
 *   Same contract as runCobol(): phase 'compile' means scala-cli itself
 *   reported a compilation failure; phase 'run' means it compiled and
 *   stdout/stderr/exitCode describe the executed program.
 */
export async function runScala(scalaSource, opts = {}) {
  const timeout = opts.timeout ?? DEFAULT_SCALA_TIMEOUT_MS;
  const scratchDir = await makeScratchDir('scala-oracle-');

  try {
    const fileName = opts.fileName ?? 'Main.scala';
    const scriptPath = path.join(scratchDir, fileName);
    await fs.writeFile(scriptPath, scalaSource, 'utf-8');

    const result = await runProcess('scala-cli', ['run', fileName], {
      cwd: scratchDir,
      timeout,
    });

    const cleanStderr = stripJavaToolOptionsNoise(result.stderr);

    // scala-cli doesn't cleanly separate "compile failed" from "ran and
    // exited nonzero" in its own exit code (both come back as exitCode 1),
    // so we detect a compile failure by scanning stderr for the diagnostic
    // markers scala-cli/scalac emit. This is a heuristic but a reliable one
    // in practice: successful compiles never print "Error compiling project".
    const looksLikeCompileError =
      result.exitCode !== 0 &&
      (/Error compiling/i.test(cleanStderr) ||
        /\[error\]/.test(cleanStderr) ||
        /error:/i.test(cleanStderr));

    return {
      phase: looksLikeCompileError ? 'compile' : 'run',
      stdout: result.stdout,
      stderr: cleanStderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      scratchDir,
    };
  } finally {
    await cleanupScratchDir(scratchDir, opts);
  }
}

/**
 * Force scala-cli's dependency/compiler cache to warm up once, with a
 * generous timeout, so subsequent runScala() calls in a test run are fast and
 * don't need an inflated per-test timeout. Safe to call multiple times -
 * only does real work the first time per process.
 */
export async function warmupScala(opts = {}) {
  if (scalaWarmedUp) return true;
  const result = await runScala('//> using scala 3.7.3\n@main def warmup(): Unit = println("warm")\n', {
    timeout: opts.timeout ?? 180_000,
  });
  scalaWarmedUp = result.phase === 'run' && result.exitCode === 0;
  return scalaWarmedUp;
}

/**
 * Normalize line endings and trailing whitespace so trivial formatting
 * differences (trailing newline, CRLF) don't register as mismatches.
 */
export function normalizeOutput(text) {
  return (text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

/**
 * Line-oriented diff, good enough for the mostly-line-per-DISPLAY output
 * these programs produce. Not a general LCS diff - just enough detail to
 * tell a human exactly which line(s) disagree.
 */
export function lineDiff(expected, actual) {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const max = Math.max(expLines.length, actLines.length);
  const diffs = [];
  for (let i = 0; i < max; i++) {
    const e = i < expLines.length ? expLines[i] : undefined;
    const a = i < actLines.length ? actLines[i] : undefined;
    if (e !== a) {
      diffs.push(
        `  line ${i + 1}: expected ${e === undefined ? '<no line>' : JSON.stringify(e)} ` +
          `actual ${a === undefined ? '<no line>' : JSON.stringify(a)}`
      );
    }
  }
  return diffs;
}

/**
 * Run a COBOL source file under cobc, convert the same source to Scala with
 * the engine's convertToScala(), run the generated Scala with scala-cli, and
 * compare their stdout. This is the "compiler oracle": cobc's actual behavior
 * is the ground truth the generated Scala is checked against, independent of
 * any hand-written .expected.txt.
 *
 * @param {string} cobolPath
 * @param {object} [opts]
 * @param {object} [opts.convertOptions] - passed through to convertToScala()
 * @param {object} [opts.cobolOpts] - passed through to runCobol()
 * @param {object} [opts.scalaOpts] - passed through to runScala()
 *
 * @returns {Promise<{
 *   cobolResult: object,
 *   scalaResult: object|null,
 *   scalaSource: string|null,
 *   conversionError: Error|null,
 *   match: boolean,
 *   diff: string|null,
 * }>}
 */
export async function oracleCompare(cobolPath, opts = {}) {
  const source = await fs.readFile(cobolPath, 'utf-8');

  // A caller's `convertOptions.copybooks` (the map convertToScala() expands
  // COPY statements against) doubles as cobc's own copybook search input
  // by default - the same copybook text must resolve identically on both
  // sides of the comparison. `opts.cobolOpts.copybooks`, if given
  // explicitly, still wins (spread order below).
  const cobolOpts = { copybooks: opts.convertOptions?.copybooks, ...opts.cobolOpts };
  const cobolResult = await runCobol(cobolPath, cobolOpts);

  let scalaSource = null;
  let conversionError = null;
  try {
    const converted = convertToScala(source, { generateMain: true, ...opts.convertOptions });
    scalaSource = converted.scala;
  } catch (err) {
    conversionError = err;
  }

  if (conversionError) {
    return {
      cobolResult,
      scalaResult: null,
      scalaSource: null,
      conversionError,
      match: false,
      diff: `convertToScala() threw while converting ${cobolPath}:\n${conversionError.stack || conversionError.message}`,
    };
  }

  const scalaResult = await runScala(scalaSource, opts.scalaOpts);

  const cobolOk = cobolResult.phase === 'run' && cobolResult.exitCode === 0 && !cobolResult.timedOut;
  const scalaOk = scalaResult.phase === 'run' && scalaResult.exitCode === 0 && !scalaResult.timedOut;

  if (!cobolOk || !scalaOk) {
    const parts = [];
    if (!cobolOk) {
      parts.push(
        `COBOL side did not run cleanly (phase=${cobolResult.phase}, exitCode=${cobolResult.exitCode}, timedOut=${cobolResult.timedOut}):\n${cobolResult.stderr || cobolResult.stdout}`
      );
    }
    if (!scalaOk) {
      parts.push(
        `Scala side did not run cleanly (phase=${scalaResult.phase}, exitCode=${scalaResult.exitCode}, timedOut=${scalaResult.timedOut}):\n${scalaResult.stderr}`
      );
    }
    return {
      cobolResult,
      scalaResult,
      scalaSource,
      conversionError: null,
      match: false,
      diff: parts.join('\n\n'),
    };
  }

  const cobolOut = normalizeOutput(cobolResult.stdout);
  const scalaOut = normalizeOutput(scalaResult.stdout);
  const match = cobolOut === scalaOut;

  return {
    cobolResult,
    scalaResult,
    scalaSource,
    conversionError: null,
    match,
    diff: match ? null : lineDiff(cobolOut, scalaOut).join('\n'),
  };
}
