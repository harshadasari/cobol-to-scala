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
function runProcess(cmd, args, { cwd, timeout, env, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
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
    // Always close the child's stdin: with `input` it is fed (and then
    // EOF'd), without it the child sees an immediate EOF instead of blocking
    // forever on a never-closed pipe. A child that exits without reading its
    // stdin raises EPIPE on this stream; that is not a harness failure.
    if (child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(input !== undefined ? input : undefined);
    }
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
 * The ONE place the oracle's reference compiler version is pinned. The whole
 * corpus (and every `.oracle.txt`) was developed against this exact build;
 * a different cobc (e.g. 3.1.2 or 3.2) is a different oracle. Override with
 * env ORACLE_COBC_VERSION only when deliberately re-baselining.
 */
export const PINNED_COBC_VERSION = process.env.ORACLE_COBC_VERSION || '4.0-early-dev.0';

/** Optional pin for scala-cli (unset = any version, only presence is required). */
export const PINNED_SCALA_CLI_VERSION = process.env.ORACLE_SCALA_CLI_VERSION || null;

/** True when env ORACLE_ALLOW_SKIP=1: a missing/wrong toolchain skips instead of failing. */
export function allowSkip() {
  return process.env.ORACLE_ALLOW_SKIP === '1';
}

/**
 * Probe both tools and report exactly what was observed. Never throws.
 *
 * @returns {Promise<{cobc: {available: boolean, version: string|null, pinned: string,
 *   pinnedOk: boolean}, scalaCli: {available: boolean, version: string|null,
 *   pinned: string|null, pinnedOk: boolean}, ok: boolean, problems: string[],
 *   summary: string}>}
 */
export async function inspectToolchain() {
  const cobcRun = await runProcess('cobc', ['--version'], { timeout: 10_000 });
  const cobcAvailable = cobcRun.exitCode === 0;
  const cobcVersion = cobcAvailable
    ? (/\(GnuCOBOL\)\s+(\S+)/.exec(cobcRun.stdout)?.[1] ?? cobcRun.stdout.split('\n')[0].trim())
    : null;
  const cobcPinnedOk = cobcAvailable && cobcVersion === PINNED_COBC_VERSION;

  const scalaRun = await runProcess('scala-cli', ['version', '--offline'], { timeout: 30_000 });
  // scala-cli returns 0 for `version` even offline; a missing binary fails to
  // spawn (ENOENT) and exitCode stays null.
  const scalaAvailable = scalaRun.exitCode === 0;
  const scalaVersion = scalaAvailable
    ? (/Scala CLI version:\s*(\S+)/i.exec(scalaRun.stdout)?.[1] ?? scalaRun.stdout.split('\n')[0].trim())
    : null;
  const scalaPinnedOk =
    scalaAvailable && (PINNED_SCALA_CLI_VERSION === null || scalaVersion === PINNED_SCALA_CLI_VERSION);

  const problems = [];
  if (!cobcAvailable) problems.push('cobc is missing from PATH');
  else if (!cobcPinnedOk) problems.push(`cobc version is ${cobcVersion}, pinned oracle is ${PINNED_COBC_VERSION}`);
  if (!scalaAvailable) problems.push('scala-cli is missing from PATH');
  else if (!scalaPinnedOk) problems.push(`scala-cli version is ${scalaVersion}, pinned is ${PINNED_SCALA_CLI_VERSION}`);

  return {
    cobc: { available: cobcAvailable, version: cobcVersion, pinned: PINNED_COBC_VERSION, pinnedOk: cobcPinnedOk },
    scalaCli: { available: scalaAvailable, version: scalaVersion, pinned: PINNED_SCALA_CLI_VERSION, pinnedOk: scalaPinnedOk },
    ok: problems.length === 0,
    problems,
    summary: `cobc ${cobcVersion ?? 'MISSING'} (pinned ${PINNED_COBC_VERSION}), scala-cli ${scalaVersion ?? 'MISSING'}`,
  };
}

/** Back-compat: does cobc respond to --version at all (version NOT checked; see inspectToolchain). */
export async function checkCobcAvailable() {
  const result = await runProcess('cobc', ['--version'], { timeout: 10_000 });
  return result.exitCode === 0;
}

export async function checkScalaCliAvailable() {
  const result = await runProcess('scala-cli', ['version', '--offline'], { timeout: 15_000 });
  return result.exitCode === 0;
}

/**
 * Recursively read every regular file under `dir` into a Map of
 * POSIX-style relative path -> Buffer. `exclude` is a Set of top-level names
 * (harness artifacts) to skip. Used to capture the files a program created.
 */
export async function collectFiles(dir, exclude = new Set()) {
  const out = new Map();
  async function walk(abs, rel) {
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (rel === '' && exclude.has(e.name)) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(childAbs, childRel);
      else if (e.isFile()) out.set(childRel, await fs.readFile(childAbs));
    }
  }
  await walk(dir, '');
  return out;
}

/**
 * File names (ASSIGN TO "<literal>") the COBOL source declares as
 * ORGANIZATION IS RELATIVE. RELATIVE files are compared as logical record
 * images (see relativeRecordImage), not raw bytes, because cobc stores each
 * slot with an 8-byte header while the Scala runtime stores header-less
 * fixed-width records - a deliberate storage-model difference that carries no
 * semantic content. Only a literal ASSIGN target is recognised; anything else
 * is compared byte-for-byte.
 */
export function relativeFileNames(cobolSource) {
  const names = new Set();
  const entry = /\bSELECT\s+(?:OPTIONAL\s+)?[\w-]+\s+ASSIGN\s+(?:TO\s+)?(?:"([^"]+)"|'([^']+)')([\s\S]*?)\.(?=\s)/gi;
  for (const m of cobolSource.matchAll(entry)) {
    if (/ORGANI[SZ]ATION\s+(?:IS\s+)?RELATIVE\b/i.test(m[3])) names.add(m[1] ?? m[2]);
  }
  return names;
}

const COBC_REL_HEADER = 8;

/**
 * Logical record image of a RELATIVE file as written by each side:
 * Map(1-based slot number -> record bytes), live slots only.
 *  - cobc (4.0-early-dev): slots of 8 + R bytes; the first 4 bytes of the
 *    header are the little-endian record length (0 = empty/deleted slot).
 *    R is the largest length found in any header.
 *  - Scala runtime: header-less slots of exactly R bytes; an all-NUL slot is a
 *    gap/deleted placeholder.
 * Returns null when the buffer is not decodable under that model (the caller
 * then falls back to a byte comparison).
 */
export function relativeRecordImage(buf, side, recordLength) {
  const image = new Map();
  if (side === 'cobc') {
    let r = 0;
    // headers sit at multiples of (8 + R) - R is unknown, so try the
    // candidates that make the file length an exact multiple.
    if (buf.length === 0) return { image, recordLength: 0 };
    for (let cand = 1; cand <= buf.length - COBC_REL_HEADER; cand++) {
      const slot = COBC_REL_HEADER + cand;
      if (buf.length % slot !== 0) continue;
      let maxLen = 0;
      let ok = true;
      for (let off = 0; off < buf.length; off += slot) {
        const len = buf.readUInt32LE(off);
        if (len > cand) { ok = false; break; }
        if (len > maxLen) maxLen = len;
      }
      if (ok && maxLen === cand) { r = cand; break; }
    }
    if (r === 0) return null;
    const slot = COBC_REL_HEADER + r;
    for (let i = 0, off = 0; off < buf.length; i++, off += slot) {
      if (buf.readUInt32LE(off) > 0) image.set(i + 1, buf.subarray(off + COBC_REL_HEADER, off + slot));
    }
    return { image, recordLength: r };
  }
  if (!recordLength || buf.length % recordLength !== 0) return null;
  for (let i = 0, off = 0; off < buf.length; i++, off += recordLength) {
    const rec = buf.subarray(off, off + recordLength);
    if (rec.some((b) => b !== 0)) image.set(i + 1, rec);
  }
  return { image, recordLength };
}

function firstByteDiff(a, b) {
  let off = 0;
  const min = Math.min(a.length, b.length);
  while (off < min && a[off] === b[off]) off++;
  const win = (buf) => buf.subarray(Math.max(0, off - 4), off + 12).toString('hex');
  return `bytes differ - cobc ${a.length} bytes, scala ${b.length} bytes, first difference at offset ${off} (cobc ...${win(a)}  scala ...${win(b)})`;
}

/**
 * Compare two file sets (Map name -> Buffer): the NAME SET must be equal and
 * every file must be byte-identical - except files named in `relativeFiles`
 * (see relativeFileNames), which are compared as logical record images
 * (same live slot numbers, same record bytes).
 * @returns {{match: boolean, diff: string|null}}
 */
export function compareFileSets(cobolFiles, scalaFiles, relativeFiles = new Set()) {
  const problems = [];
  const names = [...new Set([...cobolFiles.keys(), ...scalaFiles.keys()])].sort();
  for (const name of names) {
    const a = cobolFiles.get(name);
    const b = scalaFiles.get(name);
    if (a === undefined) {
      problems.push(`  file ${JSON.stringify(name)}: created only by the Scala side (${b.length} bytes)`);
      continue;
    }
    if (b === undefined) {
      problems.push(`  file ${JSON.stringify(name)}: created only by cobc (${a.length} bytes)`);
      continue;
    }
    if (relativeFiles.has(name)) {
      const ca = relativeRecordImage(a, 'cobc');
      const cb = ca ? relativeRecordImage(b, 'scala', ca.recordLength) : null;
      if (ca && cb) {
        const slots = [...new Set([...ca.image.keys(), ...cb.image.keys()])].sort((x, y) => x - y);
        const bad = slots.filter((n) => {
          const x = ca.image.get(n);
          const y = cb.image.get(n);
          return !x || !y || !x.equals(y);
        });
        if (bad.length > 0) {
          const n = bad[0];
          const x = ca.image.get(n);
          const y = cb.image.get(n);
          problems.push(
            `  file ${JSON.stringify(name)} (RELATIVE, ${ca.recordLength}-byte records): ${bad.length} slot(s) differ, ` +
              `first is slot ${n}: cobc ${x ? x.toString('hex') : '<empty>'} scala ${y ? y.toString('hex') : '<empty>'} ` +
              `(live slots cobc [${[...ca.image.keys()].join(',')}] scala [${[...cb.image.keys()].join(',')}])`
          );
        }
        continue;
      }
      // not decodable under the expected storage models: fall through to bytes
    }
    if (!a.equals(b)) problems.push(`  file ${JSON.stringify(name)}: ${firstByteDiff(a, b)}`);
  }
  return problems.length === 0
    ? { match: true, diff: null }
    : { match: false, diff: `written-file mismatch:\n${problems.join('\n')}` };
}

/** Read the optional `<base>.stdin.txt` sidecar next to a corpus program (undefined when absent). */
export async function loadStdinSidecar(cobolPath) {
  const p = cobolPath.replace(/\.[^./\\]+$/, '') + '.stdin.txt';
  try {
    return await fs.readFile(p, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
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
 * @param {string} [opts.std] - dialect: passed as `cobc -std=<std>` (default: none = cobc's default dialect)
 *
 * @returns {Promise<{phase: 'compile'|'run', stdout: string, stderr: string,
 *   exitCode: number|null, timedOut: boolean, scratchDir: string,
 *   files?: Map<string, Buffer>}>}
 *   `files` (phase 'run' only): every file the program left in its isolated
 *   run directory, name -> bytes.
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
    // `foo.cbl.txt` (negative probes) -> `foo`; `foo.cbl` -> `foo`.
    const baseName = path.basename(absSource).replace(/\.txt$/i, '').replace(/\.[^.]+$/, '');
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
    const cobcArgs = [...(opts.std ? [`-std=${opts.std}`] : []), '-x', '-o', exePath, localSource];
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

    // The program runs in its OWN empty directory (not next to the source,
    // executable and copybooks), so the set of files it leaves behind is
    // exactly the set of files it created - see `files` in the result.
    const runDir = path.join(scratchDir, 'run');
    await fs.mkdir(runDir);
    const run = await runProcess(exePath, opts.args ?? [], {
      cwd: runDir,
      timeout,
      input: opts.stdin,
    });

    return {
      phase: 'run',
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      files: await collectFiles(runDir),
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
 * @param {string} [opts.stdin] - stdin fed to the program
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

    // The source (and scala-cli's `.scala-build`/`.bsp` workspace, which it
    // places next to the source) live in scratchDir; the program itself runs
    // with cwd = scratchDir/run, an initially-empty directory, so the files
    // it leaves behind are exactly the files it created.
    const runDir = path.join(scratchDir, 'run');
    await fs.mkdir(runDir);
    const result = await runProcess('scala-cli', ['run', path.join('..', fileName)], {
      cwd: runDir,
      timeout,
      input: opts.stdin,
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
      files: await collectFiles(runDir),
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
 * Compared: normalized stdout AND the set/bytes of files written (see
 * compareFileSets); `match` requires both. `stdoutMatch`/`fileMatch` and
 * `stdoutDiff`/`fileDiff` say which.
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
  //
  // A sibling `<base>.stdin.txt` is fed to BOTH sides (explicit
  // `cobolOpts.stdin` / `scalaOpts.stdin` still win).
  const stdin = (await loadStdinSidecar(cobolPath));
  const cobolOpts = {
    copybooks: opts.convertOptions?.copybooks,
    ...(stdin !== undefined ? { stdin } : {}),
    ...opts.cobolOpts,
  };
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

  const scalaResult = await runScala(scalaSource, {
    ...(stdin !== undefined ? { stdin } : {}),
    ...opts.scalaOpts,
  });

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
  const stdoutMatch = cobolOut === scalaOut;
  const stdoutDiff = stdoutMatch ? null : lineDiff(cobolOut, scalaOut).join('\n');

  // Written-file parity: the SET of files each side created (by name) and
  // their bytes, exactly. Catches the round-29 class (file-side corruption a
  // program never reads back and DISPLAYs).
  const fileCmp = compareFileSets(cobolResult.files ?? new Map(), scalaResult.files ?? new Map(), relativeFileNames(source));

  const match = stdoutMatch && fileCmp.match;
  const diffParts = [];
  if (!stdoutMatch) diffParts.push(stdoutDiff);
  if (!fileCmp.match) diffParts.push(fileCmp.diff);

  return {
    cobolResult,
    scalaResult,
    scalaSource,
    conversionError: null,
    match,
    stdoutMatch,
    stdoutDiff,
    fileMatch: fileCmp.match,
    fileDiff: fileCmp.diff,
    diff: match ? null : diffParts.join('\n'),
  };
}
