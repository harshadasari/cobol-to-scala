#!/usr/bin/env node
/**
 * tests/oracle/fuzz.js - bounded, seeded, grammar-based COBOL program
 * generator + differential runner. Opt-in: NOT part of `npm test` or the
 * default oracle suite.
 *
 *   npm run oracle:fuzz -- --seed 1 --count 200
 *   npm run oracle:fuzz -- --seed 1 --index 17 --print      # show program 17 of seed 1
 *
 * Options
 *   --seed S        PRNG seed (default 1). Program i is a pure function of (S, i).
 *   --count N       number of programs (default 50)
 *   --start I       first program index (default 0)
 *   --index I       run/print exactly program I (same as --start I --count 1)
 *   --jobs J        parallel oracleCompare runs (default 4)
 *   --usage         also use COMP-3 / COMP on numeric items (default: DISPLAY only)
 *   --reduce K      delta-debug up to K mismatching programs per mismatch signature (default 3, 0 = off)
 *   --out DIR       where to write programs/reports (default <os.tmpdir()>/oracle-fuzz-<seed>)
 *   --print         print the generated program(s) and exit (no cobc / scala-cli needed)
 *   --quirks        re-enable the two excluded cobc-quirk shapes (below); default OFF
 *
 * Generated subset (every program is well-formed fixed-format COBOL):
 *   WORKING-STORAGE items PIC 9(n) | S9(n) | 9(n)V9(m) | S9(n)V9(m) | X(n)
 *   MOVE, COMPUTE / ADD / SUBTRACT (with and without ROUNDED, sometimes with
 *   ON SIZE ERROR), IF (numeric and alphanumeric compares, optional ELSE),
 *   PERFORM VARYING ... UNTIL (always terminating: the index cannot wrap),
 *   DISPLAY. No LLM involved: the same seed always yields the same programs.
 *
 * Excluded shapes (GnuCOBOL 4.0-early-dev quirks that contradict ISO/IBM
 * semantics; the engine deliberately follows the standard, so reporting them
 * would only bury genuine divergences). `--quirks` turns the exclusions off so
 * they stay auditable. All other generator draws are unchanged, so programs
 * differ from earlier seeds only where a shape was rewritten.
 *   B  `IF <numeric item> <relop> <NEGATIVE literal>` whose literal has MORE
 *      integer digits than the item's PICTURE (`N2 PIC 9(2)` vs `-3470`,
 *      `S9(1)` vs `-86.19`): cobc's compile-time literal range check ignores
 *      the sign ("literal '-3470' has more digits than 'N2'" / "expression is
 *      always TRUE"), so the answer is as if the literal were +3470. Fix:
 *      the literal is cut to its LAST n integer digits (n = item integer
 *      digits). Positive literals are left alone (cobc handles them right).
 *      Ledger: tests/oracle/README.md "Post-campaign fixes (Oct 2026)" row 8.
 *   E  all-integer COMPUTE expressions whose exact magnitude could exceed
 *      2^31 (`N3 PIC S9(6) = 213044`, `COMPUTE N1 = N3 * 50000`): cobc
 *      evaluates all-integer expressions in 32-bit C ints and wraps. A
 *      conservative bound (picture maxima / literal values; + - add, * multiplies)
 *      is taken per expression; with no decimal operand and no '/' and a
 *      bound >= 2^31 the expression gets a trailing ` + 0.0` so cobc
 *      evaluates it exactly in decimal. Not a separate README ledger row: it
 *      is recorded in docs/ACTION_PLAN_2026-10.md Findings log, entry
 *      "2026-10-05 Fuzzer fix pass landed" (class E).
 *
 * Each program is run through oracleCompare() (cobc vs generated Scala). A
 * program cobc itself rejects is reported as INVALID (a generator defect, not
 * an engine finding). Every genuine mismatch is classified by signature and
 * a few per signature are statement-level delta-debugged to a minimal
 * reproducer. This tool never edits engine code.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { inspectToolchain, normalizeOutput, oracleCompare, warmupScala } from './harness.js';

// ---------------------------------------------------------------- PRNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
}

// ------------------------------------------------------------ generator
// Program model (plain JSON so the reducer can edit it):
//   { id, vars: [{name, kind:'num'|'alnum', n, m, signed, usage, len}], body: [stmt] }
//   stmt: {t:'move'|'compute'|'add'|'sub'|'if'|'perform'|'display', ...}

function picOf(v) {
  if (v.kind === 'alnum') return `X(${v.len})`;
  return `${v.signed ? 'S' : ''}9(${v.n})${v.m ? `V9(${v.m})` : ''}`;
}

function genVars(rng, opts) {
  const vars = [];
  const nNum = rng.int(3, 6);
  const nAl = rng.int(1, 3);
  for (let i = 1; i <= nNum; i++) {
    const m = rng.chance(0.5) ? rng.int(1, 3) : 0;
    const n = rng.int(1, m ? 5 : 7);
    const v = { name: `N${i}`, kind: 'num', n, m, signed: rng.chance(0.5), usage: '' };
    if (opts.usage && rng.chance(0.4)) v.usage = rng.pick(['COMP-3', 'COMP']);
    v.value = rng.chance(0.85) ? numLiteral(rng, v, true, true) : null;
    vars.push(v);
  }
  for (let i = 1; i <= nAl; i++) {
    const v = { name: `A${i}`, kind: 'alnum', len: rng.int(1, 10) };
    v.value = rng.chance(0.8) ? strLiteral(rng, rng.int(1, v.len)) : null;
    vars.push(v);
  }
  return vars;
}

function numLiteral(rng, v, allowNegative = true, fit = false) {
  const intDigits = rng.int(v ? 0 : 1, v ? v.n : 4);
  const decDigits = v && v.m ? rng.int(0, v.m + (!fit && rng.chance(0.3) ? 1 : 0)) : rng.chance(0.2) ? rng.int(1, 2) : 0;
  let s = '';
  for (let i = 0; i < intDigits; i++) s += rng.int(i === 0 && intDigits > 1 ? 1 : 0, 9);
  if (s === '') s = '0';
  if (decDigits > 0) {
    s += '.';
    for (let i = 0; i < decDigits; i++) s += rng.int(0, 9);
  }
  if (allowNegative && (!v || v.signed) && rng.chance(0.3)) s = '-' + s;
  return s;
}

const ALPHABET = 'ABCXYZ abc019';
function strLiteral(rng, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[rng.int(0, ALPHABET.length - 1)];
  return `"${s}"`;
}

function numVars(vars) { return vars.filter((v) => v.kind === 'num'); }
function alVars(vars) { return vars.filter((v) => v.kind === 'alnum'); }

function genExpr(rng, vars, depth) {
  if (depth <= 0 || rng.chance(0.35)) {
    return rng.chance(0.6) ? rng.pick(numVars(vars)).name : numLiteral(rng, null);
  }
  const op = rng.pick(['+', '-', '*', '/']);
  const left = genExpr(rng, vars, depth - 1);
  // divisors are always non-zero literals so no program divides by zero
  const right = op === '/' ? rng.pick(['2', '3', '4', '7', '1.5', '0.25', '9']) : genExpr(rng, vars, depth - 1);
  const e = `${left} ${op} ${right}`;
  return rng.chance(0.4) ? `(${e})` : e;
}

// Class E guard (see header). Conservative magnitude bound of an expression
// string, and whether it contains any decimal operand or a division.
const INT32 = 2 ** 31;
function exprBound(expr, vars) {
  const toks = [];
  for (const w of expr.split(/\s+/).filter(Boolean)) {
    const m = w.match(/^(\(*)(.*?)(\)*)$/);
    for (const c of m[1]) toks.push(c);
    if (m[2]) toks.push(m[2]);
    for (const c of m[3]) toks.push(c);
  }
  let pos = 0;
  const atom = () => {
    const t = toks[pos++];
    if (t === '(') { const r = sum(); pos++; return r; }
    const v = vars.find((x) => x.name === t);
    if (v) return { b: 10 ** v.n, dec: v.m > 0 };
    return { b: Math.abs(Number(t)), dec: t.includes('.') };
  };
  const prod = () => {
    let l = atom();
    while (toks[pos] === '*' || toks[pos] === '/') {
      const op = toks[pos++];
      const r = atom();
      l = op === '*' ? { b: l.b * r.b, dec: l.dec || r.dec } : { b: l.b * 4, dec: true };
    }
    return l;
  };
  const sum = () => {
    let l = prod();
    while (toks[pos] === '+' || toks[pos] === '-') {
      pos++;
      const r = prod();
      l = { b: l.b + r.b, dec: l.dec || r.dec };
    }
    return l;
  };
  return sum();
}
function guardInt32(expr, vars, opts) {
  if (opts.quirks) return expr;
  const { b, dec } = exprBound(expr, vars);
  return !dec && b >= INT32 ? `${expr} + 0.0` : expr;
}

function genSimple(rng, vars, ctx) {
  const k = rng.pick(['move', 'move', 'compute', 'compute', 'add', 'sub', 'display']);
  const targets = numVars(vars).filter((v) => !ctx.locked.has(v.name));
  switch (k) {
    case 'move': {
      if (rng.chance(0.65) && targets.length) {
        const t = rng.pick(targets);
        const src = rng.chance(0.5) ? rng.pick(numVars(vars)).name : numLiteral(rng, rng.chance(0.5) ? t : null);
        return { t: 'move', src, dst: t.name };
      }
      const t = rng.pick(alVars(vars));
      const src = rng.chance(0.6) ? strLiteral(rng, rng.int(0, 12)) : rng.pick(alVars(vars)).name;
      return { t: 'move', src, dst: t.name };
    }
    case 'compute': {
      if (!targets.length) return { t: 'display', items: [rng.pick(vars).name] };
      return { t: 'compute', dst: rng.pick(targets).name, expr: guardInt32(genExpr(rng, vars, 2), vars, ctx.opts), rounded: rng.chance(0.4), sizeError: rng.chance(0.15) };
    }
    case 'add':
    case 'sub': {
      if (!targets.length) return { t: 'display', items: [rng.pick(vars).name] };
      const srcs = [];
      for (let i = rng.int(1, 2); i > 0; i--) srcs.push(rng.chance(0.6) ? rng.pick(numVars(vars)).name : numLiteral(rng, null));
      return { t: k, srcs, dst: rng.pick(targets).name, rounded: rng.chance(0.4), sizeError: rng.chance(0.15) };
    }
    default: {
      const items = [];
      for (let i = rng.int(1, 3); i > 0; i--) items.push(rng.pick(vars).name);
      return { t: 'display', items };
    }
  }
}

function genCond(rng, vars, opts) {
  if (rng.chance(0.65)) {
    const av = rng.pick(numVars(vars));
    const a = av.name;
    let b = rng.chance(0.5) ? rng.pick(numVars(vars)).name : numLiteral(rng, null);
    if (!opts.quirks && b[0] === '-') {
      // class B (see header): keep a negative literal's integer digits <= the item's
      const [ip, fp] = b.slice(1).split('.');
      if (ip.length > av.n) b = `-${ip.slice(-av.n)}${fp === undefined ? '' : `.${fp}`}`;
    }
    return `${a} ${rng.pick(['>', '<', '=', '>=', '<=', 'NOT ='])} ${b}`;
  }
  const a = rng.pick(alVars(vars)).name;
  const b = rng.chance(0.6) ? strLiteral(rng, rng.int(0, 6)) : rng.pick(alVars(vars)).name;
  return `${a} ${rng.pick(['=', '>', '<', 'NOT ='])} ${b}`;
}

function genBlock(rng, vars, ctx, depth, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = rng.next();
    if (depth > 0 && r < 0.2) {
      out.push({
        t: 'if',
        cond: genCond(rng, vars, ctx.opts),
        then: genBlock(rng, vars, ctx, depth - 1, rng.int(1, 2)),
        else: rng.chance(0.5) ? genBlock(rng, vars, ctx, depth - 1, rng.int(1, 2)) : [],
      });
    } else if (depth > 0 && r < 0.35 && !ctx.inLoop) {
      const iv = `I${ctx.nextIdx++}`;
      const width = rng.int(1, 2);
      const max = 10 ** width - 1;
      const step = rng.int(1, 3);
      const to = rng.int(1, Math.min(max - step, 12));
      const from = rng.int(0, to);
      ctx.indexVars.push({ name: iv, kind: 'num', n: width, m: 0, signed: false, usage: '', value: null, isIndex: true });
      ctx.locked.add(iv);
      const body = genBlock(rng, vars, { ...ctx, inLoop: true }, depth - 1, rng.int(1, 3));
      out.push({ t: 'perform', idx: iv, from, step, to, body });
    } else {
      out.push(genSimple(rng, vars, ctx));
    }
  }
  return out;
}

export function generateProgram(seed, index, opts = {}) {
  const rng = new Rng((Math.imul(seed >>> 0, 1000003) + index * 7919 + 12345) >>> 0);
  const vars = genVars(rng, opts);
  const ctx = { locked: new Set(), nextIdx: 1, inLoop: false, indexVars: [], opts };
  const body = genBlock(rng, vars, ctx, 2, rng.int(4, 10));
  // final dump of every variable so end state is always compared
  body.push({ t: 'display', items: vars.map((v) => v.name), dump: true });
  const allVars = [...vars, ...ctx.indexVars];
  return { id: `FZ${seed}X${index}`.slice(0, 30), vars: allVars, body };
}

// ------------------------------------------------------------- rendering
function wrapStatement(text, indent) {
  // split on spaces outside quotes; keep lines <= 72 columns (area B, col 12+)
  const tokens = text.match(/"[^"]*"|\S+/g) ?? [];
  const lines = [];
  let cur = '';
  const first = ' '.repeat(indent);
  const cont = ' '.repeat(indent + 4);
  for (const tok of tokens) {
    const pre = cur === '' ? (lines.length === 0 ? first : cont) : cur + ' ';
    if (cur !== '' && (pre + tok).length > 70) {
      lines.push(cur);
      cur = cont + tok;
    } else {
      cur = cur === '' ? pre + tok : pre + tok;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function dispItem(prog, name) {
  const v = prog.vars.find((x) => x.name === name);
  if (!v) return `"${name}"`;
  return v.kind === 'alnum' ? `"${name}=[" ${name} "]"` : `"${name}=" ${name}`;
}

function renderStmts(prog, stmts, indent, out) {
  for (const s of stmts) {
    const ind = ' '.repeat(indent);
    switch (s.t) {
      case 'move': out.push(...wrapStatement(`MOVE ${s.src} TO ${s.dst}`, indent)); break;
      case 'compute': {
        const tail = s.sizeError ? ' ON SIZE ERROR DISPLAY "SIZE-ERR" END-COMPUTE' : '';
        out.push(...wrapStatement(`COMPUTE ${s.dst}${s.rounded ? ' ROUNDED' : ''} = ${s.expr}${tail}`, indent));
        break;
      }
      case 'add':
      case 'sub': {
        const verb = s.t === 'add' ? 'ADD' : 'SUBTRACT';
        const prep = s.t === 'add' ? 'TO' : 'FROM';
        const end = s.t === 'add' ? 'END-ADD' : 'END-SUBTRACT';
        const tail = s.sizeError ? ` ON SIZE ERROR DISPLAY "SIZE-ERR" ${end}` : '';
        out.push(...wrapStatement(`${verb} ${s.srcs.join(' ')} ${prep} ${s.dst}${s.rounded ? ' ROUNDED' : ''}${tail}`, indent));
        break;
      }
      case 'display': out.push(...wrapStatement(`DISPLAY ${s.items.map((n) => dispItem(prog, n)).join(' ')}`, indent)); break;
      case 'if':
        out.push(...wrapStatement(`IF ${s.cond}`, indent));
        renderStmts(prog, s.then, indent + 2, out);
        if (s.else.length) { out.push(`${ind}ELSE`); renderStmts(prog, s.else, indent + 2, out); }
        out.push(`${ind}END-IF`);
        break;
      case 'perform':
        out.push(...wrapStatement(`PERFORM VARYING ${s.idx} FROM ${s.from} BY ${s.step} UNTIL ${s.idx} > ${s.to}`, indent));
        renderStmts(prog, s.body, indent + 2, out);
        out.push(`${ind}END-PERFORM`);
        break;
      default: throw new Error(`unknown stmt ${s.t}`);
    }
  }
}

export function renderProgram(prog) {
  const L = [];
  L.push(`      * generated by tests/oracle/fuzz.js (${prog.id})`);
  L.push('       IDENTIFICATION DIVISION.');
  L.push(`       PROGRAM-ID. ${prog.id}.`);
  L.push('       DATA DIVISION.');
  L.push('       WORKING-STORAGE SECTION.');
  for (const v of prog.vars) {
    let line = `       01  ${v.name.padEnd(4)} PIC ${picOf(v)}`;
    if (v.usage) line += ` ${v.usage}`;
    if (v.value !== null && v.value !== undefined) line += ` VALUE ${v.value}`;
    L.push(line + '.');
  }
  L.push('       PROCEDURE DIVISION.');
  L.push('       MAIN-PARA.');
  renderStmts(prog, prog.body, 11, L);
  L.push('           STOP RUN.');
  return L.join('\n') + '\n';
}

// -------------------------------------------------------------- running
async function runOne(prog, dir) {
  const file = path.join(dir, `${prog.id}.cbl`);
  await fs.writeFile(file, renderProgram(prog), 'utf-8');
  const r = await oracleCompare(file, { scalaOpts: { timeout: 120_000 } });
  return { file, r };
}

function firstLine(s) { return String(s ?? '').split('\n').find((l) => l.trim()) ?? ''; }

/** Returns {kind: 'ok'|'invalid'|'mismatch', signature}. */
export function classify(r) {
  const c = r.cobolResult;
  if (c.phase !== 'run' || c.exitCode !== 0 || c.timedOut) {
    return { kind: 'invalid', signature: `cobc did not run it cleanly (${c.phase}, exit ${c.exitCode}): ${firstLine(c.stderr).replace(/\/\S*\//g, '')}` };
  }
  if (r.match) return { kind: 'ok', signature: 'ok' };
  if (r.conversionError) return { kind: 'mismatch', signature: `convert-throw: ${firstLine(r.conversionError.message)}` };
  const s = r.scalaResult;
  if (s.phase === 'compile') {
    const err = s.stderr.split('\n').find((l) => /error/i.test(l)) ?? firstLine(s.stderr);
    return { kind: 'mismatch', signature: `scala-compile: ${err.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\w./-]*Main\.scala:\d+:\d+/g, '').replace(/\d+/g, 'N').trim().slice(0, 100)}` };
  }
  if (s.exitCode !== 0 || s.timedOut) return { kind: 'mismatch', signature: `scala-runtime: exit ${s.exitCode}${s.timedOut ? ' (timeout)' : ''} ${firstLine(s.stderr).replace(/\d+/g, 'N').slice(0, 100)}` };
  return { kind: 'mismatch', signature: r.stdoutMatch === false ? 'stdout-mismatch' : 'file-mismatch' };
}

// -------------------------------------------------------------- reducer
function countStmts(stmts) {
  let n = 0;
  for (const s of stmts) {
    n++;
    if (s.t === 'if') n += countStmts(s.then) + countStmts(s.else);
    if (s.t === 'perform') n += countStmts(s.body);
  }
  return n;
}

/** All single-step reductions of a statement list (each yields a new list). */
function* reductions(stmts) {
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const rest = (repl) => [...stmts.slice(0, i), ...repl, ...stmts.slice(i + 1)];
    yield rest([]);
    if (s.t === 'if') {
      yield rest(s.then);
      if (s.else.length) { yield rest(s.else); yield rest([{ ...s, else: [] }]); }
      for (const t of reductions(s.then)) yield rest([{ ...s, then: t }]);
      for (const e of reductions(s.else)) yield rest([{ ...s, else: e }]);
    } else if (s.t === 'perform') {
      yield rest(s.body);
      for (const b of reductions(s.body)) yield rest([{ ...s, body: b }]);
    } else if (s.t === 'display' && s.items.length > 1) {
      for (let k = 0; k < s.items.length; k++) yield rest([{ ...s, items: s.items.filter((_, j) => j !== k) }]);
    } else if (s.t === 'compute' || s.t === 'add' || s.t === 'sub') {
      if (s.rounded) yield rest([{ ...s, rounded: false }]);
      if (s.sizeError) yield rest([{ ...s, sizeError: false }]);
    }
  }
}

function usedNames(prog) {
  const text = renderProgram({ ...prog, vars: [] }); // body only (var decls not rendered)
  return text;
}

function pruneVars(prog) {
  const body = usedNames(prog);
  return { ...prog, vars: prog.vars.filter((v) => new RegExp(`\\b${v.name}\\b`).test(body)) };
}

async function reduceProgram(prog, signature, dir, budget = 60) {
  let cur = prog;
  let trials = 0;
  const stillFails = async (cand) => {
    trials++;
    const { r } = await runOne(cand, dir);
    const c = classify(r);
    return c.kind === 'mismatch' && c.signature === signature;
  };
  let progress = true;
  while (progress && trials < budget) {
    progress = false;
    for (const cand of reductions(cur.body)) {
      if (trials >= budget) break;
      const next = pruneVars({ ...cur, body: cand });
      if (countStmts(next.body) >= countStmts(cur.body) && JSON.stringify(next.body) === JSON.stringify(cur.body)) continue;
      if (next.body.length === 0) continue;
      if (await stillFails(next)) { cur = next; progress = true; break; }
    }
  }
  return { prog: cur, trials };
}

function fingerprint(prog) {
  const kinds = new Set();
  const walk = (stmts) => {
    for (const s of stmts) {
      if (s.t === 'compute' || s.t === 'add' || s.t === 'sub') kinds.add(`${s.t.toUpperCase()}${s.rounded ? '+ROUNDED' : ''}${s.sizeError ? '+SIZE-ERROR' : ''}`);
      else if (s.t !== 'display') kinds.add(s.t.toUpperCase());
      if (s.t === 'if') { walk(s.then); walk(s.else); }
      if (s.t === 'perform') walk(s.body);
    }
  };
  walk(prog.body);
  return [...kinds].sort().join(' ');
}

// ----------------------------------------------------------------- main
function parseArgs(argv) {
  const o = { seed: 1, count: 50, start: 0, jobs: 4, usage: false, quirks: false, reduce: 3, out: null, print: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--seed') o.seed = Number(val());
    else if (a === '--count') o.count = Number(val());
    else if (a === '--start') o.start = Number(val());
    else if (a === '--index') { o.start = Number(val()); o.count = 1; }
    else if (a === '--jobs') o.jobs = Number(val());
    else if (a === '--reduce') o.reduce = Number(val());
    else if (a === '--out') o.out = val();
    else if (a === '--usage') o.usage = true;
    else if (a === '--print') o.print = true;
    else if (a === '--quirks') o.quirks = true;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const progs = [];
  for (let i = o.start; i < o.start + o.count; i++) progs.push(generateProgram(o.seed, i, { usage: o.usage, quirks: o.quirks }));

  if (o.print) {
    for (const p of progs) console.log(renderProgram(p));
    return;
  }

  const tc = await inspectToolchain();
  if (!tc.ok) {
    console.error(`oracle toolchain not usable: ${tc.problems.join('; ')} (${tc.summary})`);
    process.exit(2);
  }
  const dir = o.out ?? path.join(os.tmpdir(), `oracle-fuzz-${o.seed}`);
  await fs.mkdir(dir, { recursive: true });
  console.log(`fuzz: seed=${o.seed} programs=${o.start}..${o.start + o.count - 1} jobs=${o.jobs} usage=${o.usage} quirks=${o.quirks} out=${dir}\n${tc.summary}`);
  await warmupScala();

  const results = new Array(progs.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: o.jobs }, async () => {
      while (next < progs.length) {
        const i = next++;
        const { r } = await runOne(progs[i], dir);
        results[i] = { prog: progs[i], r, c: classify(r) };
        done++;
        if (done % 10 === 0) console.log(`  ${done}/${progs.length} run`);
      }
    })
  );

  const count = (k) => results.filter((x) => x.c.kind === k).length;
  console.log(`\nRESULT: ${progs.length} programs: ${count('ok')} match, ${count('mismatch')} MISMATCH, ${count('invalid')} invalid (cobc rejected/aborted - generator defect)`);

  const invalid = results.filter((x) => x.c.kind === 'invalid');
  for (const x of invalid.slice(0, 5)) console.log(`  INVALID ${x.prog.id}: ${x.c.signature}`);

  const groups = new Map();
  for (const x of results.filter((y) => y.c.kind === 'mismatch')) {
    if (!groups.has(x.c.signature)) groups.set(x.c.signature, []);
    groups.get(x.c.signature).push(x);
  }
  const report = { seed: o.seed, start: o.start, count: o.count, ok: count('ok'), mismatch: count('mismatch'), invalid: count('invalid'), classes: [] };

  for (const [sig, xs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n=== mismatch signature: ${sig}  (${xs.length} program(s): ${xs.map((x) => x.prog.id).join(', ')})`);
    xs.sort((a, b) => countStmts(a.prog.body) - countStmts(b.prog.body));
    const reduced = [];
    for (const x of xs.slice(0, o.reduce)) {
      const { prog: small, trials } = await reduceProgram(x.prog, sig, dir);
      const { r } = await runOne({ ...small, id: `${small.id}R` }, dir);
      const fp = fingerprint(small);
      reduced.push({ id: x.prog.id, fingerprint: fp, source: renderProgram(small), trials });
      console.log(`\n--- reduced reproducer of ${x.prog.id} (${trials} trials, constructs: ${fp})`);
      console.log(renderProgram(small));
      console.log(`cobc stdout : ${JSON.stringify(normalizeOutput(r.cobolResult.stdout))}`);
      console.log(`scala stdout: ${JSON.stringify(normalizeOutput(r.scalaResult?.stdout ?? ''))}`);
      if (!r.match && r.diff) console.log(r.diff.split('\n').slice(0, 8).join('\n'));
    }
    report.classes.push({ signature: sig, programs: xs.map((x) => x.prog.id), reduced });
  }

  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`\nreport: ${path.join(dir, 'report.json')}`);
  process.exit(count('mismatch') > 0 ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exit(3); });
}
