/**
 * tests/cics.test.js
 *
 * Phase 4 (online systems) stretch goal: EXEC CICS command classification
 * (`parser/cics-parser.js`) and service-endpoint skeleton generation
 * (`generator/cics-gen.js`).
 *
 * Four layers of coverage:
 *   1. `classifyCicsCommand` unit tests - one per command family named in
 *      the roadmap's Phase 4 scope, plus RESP/RESP2 handling and the
 *      UNKNOWN-command honesty guarantee.
 *   2. Corpus tests - `tests/corpus/cics/c01-inquiry.ccp` (RECEIVE MAP ->
 *      READ -> SEND MAP -> RETURN TRANSID) and `c02-update.ccp` (RECEIVE MAP
 *      -> READ UPDATE -> REWRITE -> LINK -> SEND MAP -> RETURN, plus an XCTL)
 *      compared against sibling `.expected.json` fixtures - the real parsed
 *      WORKING-STORAGE/PROCEDURE DIVISION of each program, run through
 *      `parser/index.js`'s `parseCobol`, not a hand-fed stand-in. These two
 *      programs use the `.ccp` ("CICS COBOL Program") extension rather than
 *      `.cbl` - a real-world naming convention this repo's own
 *      `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` file-type table already lists
 *      (".cbl .cob .ccp") - specifically *because* `tests/oracle/oracle.test.js`
 *      sweeps every `tests/corpus/**\/*.cbl` file through the plain-GnuCOBOL
 *      `cobc` oracle, which has no CICS translator and rejects `EXEC CICS`
 *      outright (`error: unknown statement 'EXEC'`, the same reason that
 *      suite already excludes `tests/corpus/sql/`). Giving these programs the
 *      distinct extension their content actually calls for keeps the cobc
 *      sweep honest (it never silently "passes" a program it can't truly
 *      compile) without touching that existing, other-agent-owned file.
 *   3. Skeleton generation - `generator/cics-gen.js#generateCicsSkeleton`
 *      against `c01-inquiry.expected-skeleton.scala` (whitespace-normalized),
 *      plus assertions about the no-BMS fallback path.
 *   4. Compile verification - the generated skeleton is compiled (not run -
 *      `???` bodies would throw if executed, and there's no `@main` entry
 *      point in scaffolding output) with `scala-cli`. Skips (doesn't fail)
 *      if `scala-cli` isn't on PATH, same convention `tests/sql.test.js` and
 *      `tests/roundtrip.test.js` use.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { parseCobol } from '../parser/index.js';
import { classifyCicsCommand, parseAllCicsCommands } from '../parser/cics-parser.js';
import { parseBms } from '../parser/bms-parser.js';
import { generateCicsSkeleton } from '../generator/cics-gen.js';
import { checkScalaCliAvailable } from './oracle/harness.js';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, 'corpus', 'cics');

function normalizeCode(code) {
  return code.replace(/\s+/g, ' ').trim();
}

function readCbl(baseName) {
  // .ccp, not .cbl - see file header for why (keeps these CICS programs out
  // of tests/oracle/oracle.test.js's plain-GnuCOBOL cobc sweep).
  const cobol = fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.ccp`), 'utf8');
  const expected = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.expected.json`), 'utf8'));
  return { cobol, expected };
}

function parseCorpusProgram(baseName) {
  const { cobol } = readCbl(baseName);
  return parseCobol(cobol, { format: 'fixed' });
}

function loadBmsMaps() {
  const bmsText = fs.readFileSync(path.join(CORPUS_DIR, 'custset.bms'), 'utf8');
  const model = parseBms(bmsText);
  const lookup = {};
  for (const mapset of model.mapsets) {
    for (const map of mapset.maps) {
      lookup[map.name.toUpperCase()] = map;
    }
  }
  return lookup;
}

// ============================================================================
// 1. classifyCicsCommand unit tests
// ============================================================================

describe('classifyCicsCommand: command families', () => {
  test('RECEIVE MAP: map/mapset/into captured, command normalized from bare RECEIVE + MAP(...) option', () => {
    const result = classifyCicsCommand('RECEIVE MAP ( CUSTMAP ) MAPSET ( CUSTSET ) INTO ( WS-AREA )');
    assert.equal(result.command, 'RECEIVE MAP');
    assert.deepEqual(result.options, { MAP: 'CUSTMAP', MAPSET: 'CUSTSET', INTO: 'WS-AREA' });
    assert.equal(result.respHandling, null);
  });

  test('SEND MAP: FROM + bare ERASE flag + CURSOR value', () => {
    const result = classifyCicsCommand('SEND MAP ( CUSTMAP ) MAPSET ( CUSTSET ) FROM ( WS-AREA ) ERASE CURSOR ( 5 )');
    assert.equal(result.command, 'SEND MAP');
    assert.deepEqual(result.options, { MAP: 'CUSTMAP', MAPSET: 'CUSTSET', FROM: 'WS-AREA', ERASE: true, CURSOR: '5' });
  });

  test('SEND/RECEIVE with no MAP(...) option stay as the bare verb (not misclassified as a screen op)', () => {
    assert.equal(classifyCicsCommand('SEND TEXT ( WS-TEXT ) ERASE').command, 'SEND');
    assert.equal(classifyCicsCommand('RECEIVE INTO ( WS-AREA )').command, 'RECEIVE');
  });

  test('READ: FILE, RIDFLD, INTO, bare UPDATE flag, RESP', () => {
    const result = classifyCicsCommand('READ FILE ( CUSTFILE ) INTO ( WS-REC ) RIDFLD ( WS-KEY ) UPDATE RESP ( WS-RESP )');
    assert.equal(result.command, 'READ');
    assert.deepEqual(result.options, {
      FILE: 'CUSTFILE', INTO: 'WS-REC', RIDFLD: 'WS-KEY', UPDATE: true, RESP: 'WS-RESP',
    });
    assert.deepEqual(result.respHandling, { resp: 'WS-RESP', resp2: null });
  });

  test('WRITE/REWRITE/DELETE: FILE/FROM/RIDFLD', () => {
    assert.equal(classifyCicsCommand('WRITE FILE ( CUSTFILE ) FROM ( WS-REC ) RIDFLD ( WS-KEY )').command, 'WRITE');
    assert.equal(classifyCicsCommand('REWRITE FILE ( CUSTFILE ) FROM ( WS-REC )').command, 'REWRITE');
    assert.equal(classifyCicsCommand('DELETE FILE ( CUSTFILE ) RIDFLD ( WS-KEY )').command, 'DELETE');
  });

  test('a bare DATASET(...) keyword (dialect variant of FILE) is still captured generically', () => {
    const result = classifyCicsCommand('READ DATASET ( CUSTFILE ) INTO ( WS-REC ) RIDFLD ( WS-KEY )');
    assert.equal(result.command, 'READ');
    assert.equal(result.options.DATASET, 'CUSTFILE');
  });

  test('READQ/WRITEQ/DELETEQ TS and TD: compound verb from the bare TS/TD keyword', () => {
    assert.equal(classifyCicsCommand('READQ TS QUEUE ( WS-Q ) INTO ( WS-DATA )').command, 'READQ TS');
    assert.equal(classifyCicsCommand('WRITEQ TS QUEUE ( WS-Q ) FROM ( WS-DATA )').command, 'WRITEQ TS');
    assert.equal(classifyCicsCommand('DELETEQ TS QUEUE ( WS-Q )').command, 'DELETEQ TS');
    assert.equal(classifyCicsCommand('READQ TD QUEUE ( WS-Q ) INTO ( WS-DATA )').command, 'READQ TD');
    assert.equal(classifyCicsCommand('WRITEQ TD QUEUE ( WS-Q ) FROM ( WS-DATA )').command, 'WRITEQ TD');
    assert.equal(classifyCicsCommand('DELETEQ TD QUEUE ( WS-Q )').command, 'DELETEQ TD');
  });

  test('LINK/XCTL: PROGRAM, COMMAREA, LENGTH', () => {
    const link = classifyCicsCommand('LINK PROGRAM ( SUBPROG ) COMMAREA ( WS-CA ) LENGTH ( 100 )');
    assert.equal(link.command, 'LINK');
    assert.deepEqual(link.options, { PROGRAM: 'SUBPROG', COMMAREA: 'WS-CA', LENGTH: '100' });
    const xctl = classifyCicsCommand('XCTL PROGRAM ( NEXTPROG ) COMMAREA ( WS-CA ) LENGTH ( 100 )');
    assert.equal(xctl.command, 'XCTL');
  });

  test('RETURN: with TRANSID + COMMAREA (pseudo-conversational) and bare (single-shot)', () => {
    const withTransid = classifyCicsCommand("RETURN TRANSID ( 'TXN1' ) COMMAREA ( WS-CA ) LENGTH ( 50 )");
    assert.equal(withTransid.command, 'RETURN');
    assert.equal(withTransid.options.TRANSID, "'TXN1'");
    assert.deepEqual(classifyCicsCommand('RETURN'), {
      command: 'RETURN', options: {}, respHandling: null, raw: 'RETURN',
    });
  });

  test('HANDLE CONDITION / HANDLE ABEND: compound verb, condition/label pairs as options', () => {
    const cond = classifyCicsCommand('HANDLE CONDITION ERROR ( ERR-PARA ) NOTFND ( NF-PARA )');
    assert.equal(cond.command, 'HANDLE CONDITION');
    assert.deepEqual(cond.options, { ERROR: 'ERR-PARA', NOTFND: 'NF-PARA' });

    const abend = classifyCicsCommand('HANDLE ABEND PROGRAM ( CLEANUP )');
    assert.equal(abend.command, 'HANDLE ABEND');
    assert.deepEqual(abend.options, { PROGRAM: 'CLEANUP' });

    const bareAbend = classifyCicsCommand('HANDLE ABEND CANCEL');
    assert.equal(bareAbend.command, 'HANDLE ABEND');
    assert.deepEqual(bareAbend.options, { CANCEL: true });
  });

  test('IGNORE CONDITION: bare condition names (no labels) become true-valued flags', () => {
    const result = classifyCicsCommand('IGNORE CONDITION NOTFND DUPREC');
    assert.equal(result.command, 'IGNORE CONDITION');
    assert.deepEqual(result.options, { NOTFND: true, DUPREC: true });
  });

  test('ASSIGN / ADDRESS', () => {
    assert.equal(classifyCicsCommand('ASSIGN APPLID ( WS-APPLID ) USERID ( WS-USERID )').command, 'ASSIGN');
    assert.equal(classifyCicsCommand('ADDRESS COMMAREA ( WS-PTR )').command, 'ADDRESS');
  });

  test('GETMAIN / FREEMAIN', () => {
    const getmain = classifyCicsCommand('GETMAIN SET ( WS-PTR ) LENGTH ( 100 )');
    assert.equal(getmain.command, 'GETMAIN');
    assert.deepEqual(getmain.options, { SET: 'WS-PTR', LENGTH: '100' });
    assert.equal(classifyCicsCommand('FREEMAIN DATA ( WS-PTR )').command, 'FREEMAIN');
  });

  test('START / RETRIEVE', () => {
    const start = classifyCicsCommand("START TRANSID ( 'TXN2' ) FROM ( WS-DATA ) LENGTH ( 50 )");
    assert.equal(start.command, 'START');
    const retrieve = classifyCicsCommand('RETRIEVE INTO ( WS-DATA ) LENGTH ( WS-LEN )');
    assert.equal(retrieve.command, 'RETRIEVE');
  });

  test('SYNCPOINT (bare, and with ROLLBACK) / ABEND', () => {
    assert.equal(classifyCicsCommand('SYNCPOINT').command, 'SYNCPOINT');
    const rollback = classifyCicsCommand('SYNCPOINT ROLLBACK');
    assert.equal(rollback.command, 'SYNCPOINT');
    assert.deepEqual(rollback.options, { ROLLBACK: true });
    const abend = classifyCicsCommand("ABEND ABCODE ( 'ABCD' )");
    assert.equal(abend.command, 'ABEND');
  });
});

describe('classifyCicsCommand: RESP/RESP2 and honesty guarantees', () => {
  test('respHandling is null when neither RESP nor RESP2 is present', () => {
    assert.equal(classifyCicsCommand('SYNCPOINT').respHandling, null);
  });

  test('respHandling normalizes RESP alone (resp2: null)', () => {
    const result = classifyCicsCommand('READ FILE ( F ) RESP ( WS-RESP )');
    assert.deepEqual(result.respHandling, { resp: 'WS-RESP', resp2: null });
  });

  test('respHandling captures both RESP and RESP2 together', () => {
    const result = classifyCicsCommand('READ FILE ( F ) RESP ( WS-RESP ) RESP2 ( WS-RESP2 )');
    assert.deepEqual(result.respHandling, { resp: 'WS-RESP', resp2: 'WS-RESP2' });
    // RESP/RESP2 are still present in options too - nothing hidden (see file header).
    assert.equal(result.options.RESP, 'WS-RESP');
    assert.equal(result.options.RESP2, 'WS-RESP2');
  });

  test('an unrecognized command still yields command: UNKNOWN with raw + best-effort options preserved (never dropped)', () => {
    const result = classifyCicsCommand('FOOBAR SOMETHING ( 1 ) OTHERFLAG');
    assert.equal(result.command, 'UNKNOWN');
    assert.deepEqual(result.options, { SOMETHING: '1', OTHERFLAG: true });
    assert.equal(result.raw, 'FOOBAR SOMETHING ( 1 ) OTHERFLAG');
  });

  test('empty/blank content never throws and classifies as UNKNOWN', () => {
    assert.deepEqual(classifyCicsCommand(''), { command: 'UNKNOWN', options: {}, respHandling: null, raw: '' });
    assert.deepEqual(classifyCicsCommand('   '), { command: 'UNKNOWN', options: {}, respHandling: null, raw: '' });
    assert.deepEqual(classifyCicsCommand(undefined), { command: 'UNKNOWN', options: {}, respHandling: null, raw: '' });
  });
});

// ============================================================================
// 2. Corpus: parseAllCicsCommands against real parsed programs
// ============================================================================

describe('parseAllCicsCommands: corpus', () => {
  test('c01-inquiry.ccp (RECEIVE MAP -> READ -> SEND MAP -> RETURN TRANSID) matches hand-derived model', () => {
    const { expected } = readCbl('c01-inquiry');
    const ast = parseCorpusProgram('c01-inquiry');
    assert.deepStrictEqual(parseAllCicsCommands(ast), expected);
  });

  test('c02-update.ccp (READ UPDATE -> REWRITE -> LINK -> XCTL) matches hand-derived model', () => {
    const { expected } = readCbl('c02-update');
    const ast = parseCorpusProgram('c02-update');
    assert.deepStrictEqual(parseAllCicsCommands(ast), expected);
  });

  test('c01-inquiry: SEND MAP nested inside IF/ELSE branches is still found (recursive statement walk)', () => {
    const ast = parseCorpusProgram('c01-inquiry');
    const commands = parseAllCicsCommands(ast);
    const sendMaps = commands.filter((c) => c.command === 'SEND MAP' && c.paragraph === 'MAIN-PARA');
    assert.equal(sendMaps.length, 2); // one in the IF branch, one in the ELSE branch
  });

  test('c01-inquiry: HANDLE CONDITION targets line up with the paragraphs that actually exist', () => {
    const ast = parseCorpusProgram('c01-inquiry');
    const commands = parseAllCicsCommands(ast);
    const handle = commands.find((c) => c.command === 'HANDLE CONDITION');
    const paragraphNames = ast.procedures.map((p) => p.name);
    assert.ok(paragraphNames.includes(handle.options.ERROR));
    assert.ok(paragraphNames.includes(handle.options.NOTFND));
  });

  test('c02-update: READ carries the bare UPDATE flag and REWRITE follows it, on the same FILE', () => {
    const ast = parseCorpusProgram('c02-update');
    const commands = parseAllCicsCommands(ast);
    const read = commands.find((c) => c.command === 'READ');
    const rewrite = commands.find((c) => c.command === 'REWRITE');
    assert.equal(read.options.UPDATE, true);
    assert.equal(read.options.FILE, rewrite.options.FILE);
  });

  test('c02-update: RETURN commands have no TRANSID (single-shot, not pseudo-conversational)', () => {
    const ast = parseCorpusProgram('c02-update');
    const commands = parseAllCicsCommands(ast);
    const returns = commands.filter((c) => c.command === 'RETURN');
    assert.ok(returns.length > 0);
    for (const r of returns) assert.equal(r.options.TRANSID, undefined);
  });
});

// ============================================================================
// 3. generator/cics-gen.js: skeleton generation
// ============================================================================

describe('generateCicsSkeleton: corpus (c01-inquiry, with BMS maps supplied)', () => {
  test('matches the hand-inspected expected skeleton (whitespace-normalized)', () => {
    const ast = parseCorpusProgram('c01-inquiry');
    const bmsMaps = loadBmsMaps();
    const expected = fs.readFileSync(path.join(CORPUS_DIR, 'c01-inquiry.expected-skeleton.scala'), 'utf8');
    const actual = generateCicsSkeleton(ast, { bmsMaps });
    assert.equal(normalizeCode(actual), normalizeCode(expected));
  });

  test('the CustmapMap DTO is derived from the BMS map, not the opaque fallback', () => {
    const ast = parseCorpusProgram('c01-inquiry');
    const bmsMaps = loadBmsMaps();
    const actual = generateCicsSkeleton(ast, { bmsMaps });
    assert.match(actual, /case class CustmapMap\(\s*custno: Int,\s*custnam: String,\s*errmsg: String\s*\)/);
    assert.match(actual, /DTO derived from BMS map 'CUSTMAP'/);
  });

  test('every SEND\\/RECEIVE\\/LINK\\/XCTL method body is exactly `???`, immediately preceded by the original EXEC CICS text', () => {
    const ast = parseCorpusProgram('c01-inquiry');
    const bmsMaps = loadBmsMaps();
    const actual = generateCicsSkeleton(ast, { bmsMaps });
    assert.match(actual, /\/\/ EXEC CICS RECEIVE MAP[^\n]*\n\s*\?\?\?/);
    assert.match(actual, /\/\/ EXEC CICS SEND MAP[^\n]*\n\s*\?\?\?/);
  });

  test('RETURN TRANSID produces a pseudo-conversational state-machine comment naming every RETURN point', () => {
    const ast = parseCorpusProgram('c01-inquiry');
    const actual = generateCicsSkeleton(ast, {});
    assert.match(actual, /pseudo-conversational/);
    assert.match(actual, /MAIN-PARA: EXEC CICS RETURN TRANSID/);
    assert.match(actual, /ERROR-PARA: EXEC CICS RETURN\b/);
  });

  test('HANDLE CONDITION (not modeled as a method) is still surfaced under "Other CICS commands observed"', () => {
    const ast = parseCorpusProgram('c01-inquiry');
    const actual = generateCicsSkeleton(ast, {});
    assert.match(actual, /Other CICS commands observed/);
    assert.match(actual, /\[HANDLE CONDITION\]: EXEC CICS HANDLE CONDITION/);
  });
});

describe('generateCicsSkeleton: no-BMS fallback and other command families', () => {
  test('without bmsMaps, the DTO falls back to a single opaque `raw: String` field (documented, not silent)', () => {
    const ast = parseCorpusProgram('c01-inquiry');
    const actual = generateCicsSkeleton(ast, {}); // no bmsMaps option at all
    assert.match(actual, /case class CustmapMap\(\s*raw: String\s*\)/);
    assert.match(actual, /no BMS source supplied for map 'CUSTMAP'/);
  });

  test('c02-update: LINK and XCTL each become their own method, XCTL returns Nothing', () => {
    const ast = parseCorpusProgram('c02-update');
    const actual = generateCicsSkeleton(ast, {});
    assert.match(actual, /def linkAuditlog\(commarea: Array\[Byte\]\): Array\[Byte\] =/);
    assert.match(actual, /def xctlCustlist\(commarea: Array\[Byte\]\): Nothing =/);
  });

  test('c02-update: repository trait only exposes the operations actually used (read + rewrite, not write/delete)', () => {
    const ast = parseCorpusProgram('c02-update');
    const actual = generateCicsSkeleton(ast, {});
    const repoBlock = actual.slice(actual.indexOf('trait CustfileRepository'), actual.indexOf('---- RETURN'));
    assert.match(repoBlock, /def read\(ridfld: String\): Array\[Byte\]/);
    assert.match(repoBlock, /def rewrite\(data: Array\[Byte\]\): Unit/);
    assert.doesNotMatch(repoBlock, /def write\(/);
    assert.doesNotMatch(repoBlock, /def delete\(/);
  });

  test('c02-update: single-shot RETURN (no TRANSID) gets the non-pseudo-conversational comment', () => {
    const ast = parseCorpusProgram('c02-update');
    const actual = generateCicsSkeleton(ast, {});
    assert.match(actual, /single-shot \(no TRANSID\)/);
    assert.doesNotMatch(actual, /pseudo-conversational continuation:/);
  });

  test('a program with no EXEC CICS commands at all still produces a compiling, empty-bodied trait', () => {
    const ast = { program: { programId: 'PLAINCOB' }, procedures: [{ name: 'MAIN', statements: [] }] };
    const actual = generateCicsSkeleton(ast, {});
    assert.match(actual, /trait PlaincobService:/);
    assert.match(actual, /end PlaincobService/);
  });
});

// ============================================================================
// 4. Compile verification (scala-cli)
// ============================================================================

async function compileWithScalaCli(scalaSource, { timeout = 240_000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cics-gen-compile-'));
  try {
    const file = path.join(dir, 'Generated.scala');
    fs.writeFileSync(file, scalaSource, 'utf8');
    try {
      const { stdout, stderr } = await execFileP('scala-cli', ['compile', 'Generated.scala'], {
        cwd: dir,
        timeout,
        maxBuffer: 16 * 1024 * 1024,
      });
      return { ok: true, stdout, stderr };
    } catch (err) {
      return { ok: false, stdout: err.stdout || '', stderr: err.stderr || String(err) };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('compile verification: generated CICS skeletons are real, compiling Scala 3', () => {
  test('c01-inquiry skeleton (with BMS-derived DTOs) compiles with scala-cli', { timeout: 250_000 }, async (t) => {
    const scalaCliAvailable = await checkScalaCliAvailable();
    if (!scalaCliAvailable) {
      t.skip('scala-cli not found on PATH; compile verification skipped (see docs/toolchain-status.md)');
      return;
    }

    const ast = parseCorpusProgram('c01-inquiry');
    const bmsMaps = loadBmsMaps();
    const scalaSource = generateCicsSkeleton(ast, { bmsMaps });

    const result = await compileWithScalaCli(scalaSource);
    assert.ok(result.ok, `scala-cli compile failed:\n${result.stderr}\n\n--- generated source ---\n${scalaSource}`);
  });

  test('c02-update skeleton (LINK/XCTL/repository stubs, no BMS supplied) compiles with scala-cli', { timeout: 250_000 }, async (t) => {
    const scalaCliAvailable = await checkScalaCliAvailable();
    if (!scalaCliAvailable) {
      t.skip('scala-cli not found on PATH; compile verification skipped (see docs/toolchain-status.md)');
      return;
    }

    const ast = parseCorpusProgram('c02-update');
    const scalaSource = generateCicsSkeleton(ast, {});

    const result = await compileWithScalaCli(scalaSource);
    assert.ok(result.ok, `scala-cli compile failed:\n${result.stderr}\n\n--- generated source ---\n${scalaSource}`);
  });
});
