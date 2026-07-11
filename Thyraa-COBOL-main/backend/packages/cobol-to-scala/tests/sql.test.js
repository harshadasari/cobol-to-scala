/**
 * tests/sql.test.js
 *
 * Phase 3 MVP: EXEC SQL -> typed Doobie generation.
 *
 * Three layers of coverage:
 *   1. Parser unit tests - `parser/sql-parser.js`'s enriched statement model
 *      (`analyzeSqlStatement`/`parseAllSqlStatements`): kind normalization,
 *      host-variable role classification (input/output/indicator), INTO
 *      clause isolation, cursor/INCLUDE/WHENEVER extraction.
 *   2. Corpus tests - `tests/corpus/sql/*.cbl` (SELECT INTO, INSERT, UPDATE
 *      with an indicator variable, a full DECLARE/OPEN/FETCH/CLOSE cursor
 *      loop, WHENEVER NOT FOUND) each compared against a sibling
 *      `.expected.scala` fragment, whitespace-normalized. The field-registry
 *      typing for each program comes from actually parsing that program's
 *      own WORKING-STORAGE section (`parser/index.js`'s `parseCobol`), not a
 *      hand-fed stand-in - this is the same DataItem shape
 *      `case-class-gen.js` types record fields from.
 *   3. Compile verification - a combined program exercising every corpus
 *      statement kind together is compiled (not run - no real database is
 *      available) with `scala-cli` against the real
 *      `org.tpolecat::doobie-core:1.0.0-RC5` dependency resolved from Maven
 *      Central, proving the generated Doobie/Scala 3 syntax is real and not
 *      just plausible-looking text. Skips (doesn't fail) if `scala-cli`
 *      isn't on PATH, same convention `tests/roundtrip.test.js` uses.
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
import { tokenize } from '../parser/lexer.js';
import {
  analyzeSqlStatement,
  parseAllSqlStatements,
  extractIntoSection,
  stripIntoClause,
  scanHostVariables,
} from '../parser/sql-parser.js';
import {
  generateSqlProgram,
  generateStatement,
  resolveHostVarType,
  heuristicTypeFromName,
  buildIndicatorMap,
  generateDoobieImports,
  generateTransactorSetup,
  generateSqlRuntimeSnippet,
} from '../generator/sql-gen.js';
import { toCamelCase } from '../generator/case-class-gen.js';
import { checkScalaCliAvailable } from './oracle/harness.js';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, 'corpus', 'sql');

function normalizeCode(code) {
  return code.replace(/\s+/g, ' ').trim();
}

function buildFieldRegistry(dataItems) {
  const registry = {};
  for (const item of dataItems) {
    if (item.name) registry[item.name.toUpperCase()] = item;
  }
  return registry;
}

function readCorpus(baseName) {
  const cobol = fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.cbl`), 'utf8');
  const expected = fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.expected.scala`), 'utf8');
  return { cobol, expected };
}

function analyzeCorpus(baseName) {
  const { cobol, expected } = readCorpus(baseName);
  const ast = parseCobol(cobol, { format: 'fixed' });
  const fieldRegistry = buildFieldRegistry(ast.dataItems);
  const statements = parseAllSqlStatements(ast.tokens);
  const result = generateSqlProgram({ sqlStatements: statements }, { fieldRegistry });
  return { statements, fieldRegistry, result, expected };
}

// ============================================================================
// 1. Parser unit tests
// ============================================================================

describe('parser/sql-parser.js: analyzeSqlStatement kind normalization', () => {
  test('OPEN_CURSOR/CLOSE_CURSOR are renamed to OPEN/CLOSE; other kinds pass through uppercased', () => {
    assert.equal(analyzeSqlStatement('OPEN CUR1').kind, 'OPEN');
    assert.equal(analyzeSqlStatement('CLOSE CUR1').kind, 'CLOSE');
    assert.equal(analyzeSqlStatement('SELECT 1 FROM DUAL').kind, 'SELECT');
    assert.equal(analyzeSqlStatement('CALL SOMEPROC()').kind, 'CALL');
    assert.equal(analyzeSqlStatement('garbage not sql').kind, 'UNKNOWN');
  });
});

describe('parser/sql-parser.js: host-variable role classification', () => {
  test('SELECT INTO vars are output, WHERE vars are input', () => {
    const stmt = analyzeSqlStatement('SELECT A, B INTO :WS-A, :WS-B FROM T WHERE C = :WS-C');
    assert.deepEqual(stmt.hostVariables, [
      { name: 'WS-A', role: 'output' },
      { name: 'WS-B', role: 'output' },
      { name: 'WS-C', role: 'input' },
    ]);
  });

  test('FETCH INTO vars are output (no FROM boundary needed)', () => {
    const stmt = analyzeSqlStatement('FETCH MYCUR INTO :WS-X, :WS-Y');
    assert.equal(stmt.kind, 'FETCH');
    assert.deepEqual(stmt.hostVariables, [
      { name: 'WS-X', role: 'output' },
      { name: 'WS-Y', role: 'output' },
    ]);
  });

  test('INSERT INTO tablename is not mistaken for a host-variable INTO list', () => {
    const stmt = analyzeSqlStatement('INSERT INTO CUSTOMER (ID) VALUES (:WS-ID)');
    assert.equal(stmt.kind, 'INSERT');
    assert.deepEqual(stmt.hostVariables, [{ name: 'WS-ID', role: 'input' }]);
  });

  test(':HOST-VAR:INDICATOR pairs are split into a primary + indicator entry, with or without a space', () => {
    const noSpace = scanHostVariables('SET X = :WS-VAL:WS-VAL-IND', 'UPDATE');
    assert.deepEqual(noSpace, [
      { name: 'WS-VAL', role: 'input' },
      { name: 'WS-VAL-IND', role: 'indicator', indicatorFor: 'WS-VAL' },
    ]);

    const withSpace = scanHostVariables('SET X = :WS-VAL :WS-VAL-IND', 'UPDATE');
    assert.deepEqual(withSpace, noSpace);
  });

  test('an indicator on an output (INTO) variable is still role "indicator", not "output"', () => {
    const stmt = analyzeSqlStatement('FETCH C1 INTO :WS-X:WS-X-IND');
    assert.deepEqual(stmt.hostVariables, [
      { name: 'WS-X', role: 'output' },
      { name: 'WS-X-IND', role: 'indicator', indicatorFor: 'WS-X' },
    ]);
  });

  test('a host variable reused twice in one statement is reported once (dedup by name+role)', () => {
    const stmt = analyzeSqlStatement('SELECT 1 FROM T WHERE A = :WS-X OR B = :WS-X');
    assert.deepEqual(stmt.hostVariables, [{ name: 'WS-X', role: 'input' }]);
  });

  test('buildIndicatorMap maps primary-var-name (upper) -> indicator-var-name', () => {
    const map = buildIndicatorMap([
      { name: 'WS-VAL', role: 'input' },
      { name: 'WS-VAL-IND', role: 'indicator', indicatorFor: 'WS-VAL' },
    ]);
    assert.deepEqual(map, { 'WS-VAL': 'WS-VAL-IND' });
  });
});

describe('parser/sql-parser.js: extractIntoSection / stripIntoClause', () => {
  test('returns null for kinds with no INTO host-variable list (INSERT, UPDATE, DELETE, DECLARE_CURSOR)', () => {
    assert.equal(extractIntoSection('INSERT INTO T VALUES (1)', 'INSERT'), null);
    assert.equal(extractIntoSection('UPDATE T SET A = 1', 'UPDATE'), null);
  });

  test('SELECT INTO section stops at FROM; FETCH INTO section runs to end of string', () => {
    const select = extractIntoSection('SELECT A INTO :X FROM T', 'SELECT');
    assert.equal(select.text.trim(), ':X');
    const fetch = extractIntoSection('FETCH C1 INTO :X, :Y', 'FETCH');
    assert.equal(fetch.text.trim(), ':X, :Y');
  });

  test('stripIntoClause removes the INTO clause and normalizes whitespace', () => {
    const stripped = stripIntoClause('SELECT A , B INTO :X , :Y FROM T WHERE C = :Z', 'SELECT');
    assert.equal(stripped, 'SELECT A , B FROM T WHERE C = :Z');
  });
});

describe('parser/sql-parser.js: cursor / INCLUDE / WHENEVER extraction', () => {
  test('DECLARE CURSOR: cursorName captured, sql is the SELECT after CURSOR FOR', () => {
    const stmt = analyzeSqlStatement('DECLARE EMP-CUR CURSOR FOR SELECT A FROM T WHERE B = 1');
    assert.equal(stmt.kind, 'DECLARE_CURSOR');
    assert.equal(stmt.cursorName, 'EMP-CUR');
    assert.equal(stmt.sql, 'SELECT A FROM T WHERE B = 1');
  });

  test('OPEN/FETCH/CLOSE all capture cursorName and have sql: null', () => {
    for (const [text, kind] of [['OPEN EMP-CUR', 'OPEN'], ['FETCH EMP-CUR INTO :X', 'FETCH'], ['CLOSE EMP-CUR', 'CLOSE']]) {
      const stmt = analyzeSqlStatement(text);
      assert.equal(stmt.kind, kind);
      assert.equal(stmt.cursorName, 'EMP-CUR');
      assert.equal(stmt.sql, null);
    }
  });

  test('EXEC SQL INCLUDE captures includeTarget (ties to a DCLGEN/copybook member)', () => {
    const stmt = analyzeSqlStatement('INCLUDE EMPREC');
    assert.equal(stmt.kind, 'INCLUDE');
    assert.equal(stmt.includeTarget, 'EMPREC');
  });

  test('WHENEVER NOT FOUND / SQLERROR / SQLWARNING x CONTINUE/STOP/GOTO all parse', () => {
    assert.deepEqual(analyzeSqlStatement('WHENEVER NOT FOUND CONTINUE').whenever, { condition: 'NOT_FOUND', action: 'CONTINUE' });
    assert.deepEqual(analyzeSqlStatement('WHENEVER SQLERROR STOP').whenever, { condition: 'SQLERROR', action: 'STOP' });
    assert.deepEqual(analyzeSqlStatement('WHENEVER SQLWARNING GO TO WARN-PARA').whenever, {
      condition: 'SQLWARNING', action: 'GOTO', target: 'WARN-PARA',
    });
    assert.deepEqual(analyzeSqlStatement('WHENEVER NOT FOUND GOTO 9999-DONE').whenever, {
      condition: 'NOT_FOUND', action: 'GOTO', target: '9999-DONE',
    });
  });

  test('parseAllSqlStatements walks a full token stream in source order', () => {
    const src = `
       PROCEDURE DIVISION.
           EXEC SQL SELECT A INTO :WS-A FROM T END-EXEC.
           EXEC SQL INSERT INTO T VALUES (:WS-A) END-EXEC.
    `;
    const statements = parseAllSqlStatements(tokenize(src, { format: 'fixed' }));
    assert.deepEqual(statements.map((s) => s.kind), ['SELECT', 'INSERT']);
  });
});

// ============================================================================
// 2. Host-variable type resolution
// ============================================================================

describe('generator/sql-gen.js: resolveHostVarType', () => {
  test('resolves via fieldRegistry using the same PIC->Scala mapping as layout.js', () => {
    const fieldRegistry = { 'WS-BALANCE': { picture: 'S9(7)V99', usage: 'COMP-3' } };
    const { type, inferred } = resolveHostVarType('WS-BALANCE', { fieldRegistry });
    assert.equal(type, 'BigDecimal');
    assert.equal(inferred, false);
  });

  test('falls back to dclgenModels[].hostVariables when fieldRegistry has no entry', () => {
    const dclgenModels = [{ hostVariables: [{ cobolName: 'EMP-NAME', picture: 'X(30)', usage: 'DISPLAY' }] }];
    const { type, inferred } = resolveHostVarType('EMP-NAME', { dclgenModels });
    assert.equal(type, 'String');
    assert.equal(inferred, false);
  });

  test('falls back to a documented name heuristic, flagged as inferred, when neither source has an entry', () => {
    const { type, inferred } = resolveHostVarType('WS-TOTAL-AMOUNT', {});
    assert.equal(type, 'BigDecimal');
    assert.equal(inferred, true);
    assert.equal(heuristicTypeFromName('WS-ORDER-DATE'), 'java.time.LocalDate');
  });
});

// ============================================================================
// 3. Corpus: generateSqlProgram against real parsed WORKING-STORAGE
// ============================================================================

describe('sql corpus: generated Doobie code matches expected fragment (whitespace-normalized)', () => {
  const names = [
    's01-select-into',
    's02-insert',
    's03-update-indicator',
    's04-cursor-loop',
    's05-whenever-notfound',
  ];

  for (const name of names) {
    test(name, () => {
      const { result, expected } = analyzeCorpus(name);
      assert.equal(normalizeCode(result.code), normalizeCode(expected));
    });
  }
});

describe('sql corpus: statement-kind-specific assertions', () => {
  test('s01 SELECT INTO: single-row multi-column tuple query, typed from WORKING-STORAGE PIC clauses', () => {
    const { statements, fieldRegistry } = analyzeCorpus('s01-select-into');
    assert.equal(statements[0].kind, 'SELECT');
    const { type } = resolveHostVarType('WS-CUST-BALANCE', { fieldRegistry });
    assert.equal(type, 'BigDecimal'); // PIC S9(7)V99 COMP-3
  });

  test('s02 INSERT: all host vars are input, generates .update.run', () => {
    const { result } = analyzeCorpus('s02-insert');
    assert.match(result.code, /\.update\.run/);
    assert.match(result.code, /SqlRuntime\.runUpdate/);
  });

  test('s03 UPDATE with indicator: SET value becomes an Option-guarded parameter', () => {
    const { result } = analyzeCorpus('s03-update-indicator');
    assert.match(result.code, /if wsSalaryInd < 0 then None else Some\(wsSalary\)/);
  });

  test('s04 cursor loop: DECLARE emits a Query0 def, OPEN materializes a List+Iterator, FETCH pops one element, CLOSE clears it', () => {
    const { result } = analyzeCorpus('s04-cursor-loop');
    assert.match(result.code, /def deptCursorQuery: doobie\.Query0\[\(String, Int\)\]/);
    assert.match(result.code, /SqlRuntime\.runList\(deptCursorQuery\.to\[List\], xa\)/);
    assert.match(result.code, /deptCursorIter\.nextOption\(\)/);
    assert.match(result.code, /deptCursorIter = Iterator\.empty/);
  });

  test('s05 WHENEVER NOT FOUND GOTO: a sqlCode==100 check with a backtick-quoted call follows the SELECT', () => {
    const { result } = analyzeCorpus('s05-whenever-notfound');
    assert.match(result.code, /if sqlCode == 100 then return `9999NotFound`\(\)/);
  });
});

describe('generator/sql-gen.js: SQLCODE runtime and unrecognized-kind honesty', () => {
  test('generateSqlRuntimeSnippet maps +100/negative DB2 SQLCODEs via SqlRuntime.describe', () => {
    const runtime = generateSqlRuntimeSnippet();
    for (const marker of ['100', '-803', '-811', '-904', '-911', '-913', 'describe']) {
      assert.ok(runtime.includes(marker), `runtime snippet missing ${marker}`);
    }
  });

  test('an unrecognized statement kind gets an honest TODO comment carrying the raw SQL, not silent dropping', () => {
    const stmt = analyzeSqlStatement('PREPARE STMT1 FROM :WS-SQL-TEXT');
    const ctx = {
      options: {}, xa: 'xa', indent: 0, declaredVars: new Set(), cursors: new Map(),
      cursorRowInfo: new Map(), wheneverHandlers: {},
    };
    const lines = generateStatement(stmt, ctx).join('\n');
    assert.match(lines, /TODO\(sql-gen\)/);
    assert.match(lines, /PREPARE STMT1/);
  });
});

// ============================================================================
// 4. Compile verification (scala-cli + real doobie-core from Maven Central)
// ============================================================================

function defaultLiteralForTest(scalaType) {
  switch (scalaType) {
    case 'String': return '""';
    case 'Int': return '0';
    case 'BigDecimal': return 'BigDecimal(0)';
    default: return `null.asInstanceOf[${scalaType}]`;
  }
}

/** Declare a plain `val` for every INPUT/INDICATOR host variable across a set
 * of statements - standing in for the WORKING-STORAGE declarations
 * case-class-gen.js would supply once this module is wired into the main
 * generator (see sql-gen.js's "Wire-in TODO"). Output vars are declared by
 * generateSqlProgram itself and must not be redeclared here. */
function declareInputStubs(statements, fieldRegistry) {
  const declared = new Set();
  const lines = [];
  for (const stmt of statements) {
    for (const v of stmt.hostVariables || []) {
      if (v.role === 'output') continue;
      const key = v.name.toUpperCase();
      if (declared.has(key)) continue;
      declared.add(key);
      const { type } = resolveHostVarType(v.name, { fieldRegistry });
      lines.push(`  val ${toCamelCase(v.name)}: ${type} = ${defaultLiteralForTest(type)}`);
    }
  }
  return lines;
}

async function compileWithScalaCli(scalaSource, { timeout = 240_000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-gen-compile-'));
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

describe('compile verification: real doobie-core via scala-cli', () => {
  test(
    'a combined program exercising every corpus statement kind compiles against org.tpolecat::doobie-core:1.0.0-RC5',
    { timeout: 250_000 },
    async (t) => {
      const scalaCliAvailable = await checkScalaCliAvailable();
      if (!scalaCliAvailable) {
        t.skip('scala-cli not found on PATH; compile verification skipped (see docs/toolchain-status.md)');
        return;
      }

      const names = ['s01-select-into', 's02-insert', 's03-update-indicator', 's04-cursor-loop', 's05-whenever-notfound'];
      let allStatements = [];
      let fieldRegistry = {};
      for (const name of names) {
        const { cobol } = readCorpus(name);
        const ast = parseCobol(cobol, { format: 'fixed' });
        fieldRegistry = { ...fieldRegistry, ...buildFieldRegistry(ast.dataItems) };
        allStatements = allStatements.concat(parseAllSqlStatements(ast.tokens));
      }

      const result = generateSqlProgram({ sqlStatements: allStatements }, { fieldRegistry, indent: 1 });
      const inputStubs = declareInputStubs(allStatements, fieldRegistry);

      const scalaSource = `//> using scala "3.3.1"
//> using dep "org.tpolecat::doobie-core:1.0.0-RC5"

${result.imports}

${result.runtime}

@main def run(): Unit =
${generateTransactorSetup({}, 1)}
  def \`9999NotFound\`(): Unit = ()

${inputStubs.join('\n')}

${result.code}

  ()
`;

      const compileResult = await compileWithScalaCli(scalaSource);
      assert.ok(
        compileResult.ok,
        `scala-cli compile failed:\n${compileResult.stderr}\n\n--- generated source ---\n${scalaSource}`
      );
    }
  );
});
