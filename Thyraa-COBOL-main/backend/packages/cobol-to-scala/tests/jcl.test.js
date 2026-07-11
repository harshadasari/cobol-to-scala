/**
 * tests/jcl.test.js
 *
 * Asserts parser/jcl-parser.js against a hand-derived synthetic corpus
 * (tests/corpus/jcl/*.jcl + *.expected.json), plus dataset-lineage
 * assertions against sibling *.flow.expected.json fixtures, plus focused
 * robustness cases (continuation lines, missing optional fields, an
 * unresolved cataloged PROC, an entirely empty job) expressed inline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJcl, buildDatasetFlow } from '../parser/jcl-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, 'corpus', 'jcl');

function readCorpus(baseName) {
  const jcl = fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.jcl`), 'utf8');
  const expected = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.expected.json`), 'utf8'));
  return { jcl, expected };
}

function readFlowExpected(baseName) {
  return JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.flow.expected.json`), 'utf8'));
}

// ---------------------------------------------------------------------
// Corpus: parsed-model equality
// ---------------------------------------------------------------------

for (const baseName of ['j01-batch3step', 'j02-proc-overrides', 'j03-concat-inline']) {
  test(`parseJcl matches hand-derived model: ${baseName}`, () => {
    const { jcl, expected } = readCorpus(baseName);
    const model = parseJcl(jcl);
    assert.deepStrictEqual(model, expected);
  });

  test(`buildDatasetFlow matches hand-derived lineage: ${baseName}`, () => {
    const { jcl } = readCorpus(baseName);
    const model = parseJcl(jcl);
    const flow = buildDatasetFlow(model);
    assert.deepStrictEqual(flow, readFlowExpected(baseName));
  });
}

// ---------------------------------------------------------------------
// Corpus: targeted lineage assertions called out in the task
// ---------------------------------------------------------------------

test('j01: temp dataset &&WORK is written by STEP010 and read by STEP020', () => {
  const { jcl } = readCorpus('j01-batch3step');
  const flow = buildDatasetFlow(parseJcl(jcl));
  assert.deepEqual(flow.datasets['&&WORK'], { writtenBy: ['STEP010'], readBy: ['STEP020'] });
});

test('j01: referback DSN=*.STEP020.OUTFILE resolves lineage to PROD.CUSTOMER.STAGED read by STEP030', () => {
  const { jcl } = readCorpus('j01-batch3step');
  const flow = buildDatasetFlow(parseJcl(jcl));
  assert.deepEqual(flow.datasets['PROD.CUSTOMER.STAGED'], {
    writtenBy: ['STEP020'],
    readBy: ['STEP030'],
  });
});

test('j02: PROC expansion attributes lineage to the expanded step names', () => {
  const { jcl } = readCorpus('j02-proc-overrides');
  const flow = buildDatasetFlow(parseJcl(jcl));
  assert.deepEqual(flow.datasets['PROD.OUTPUT.FILE'], {
    writtenBy: ['RUN01.PSTEP1'],
    readBy: ['RUN01.PSTEP2'],
  });
});

test('j03: concatenated STEPLIB members are all recorded as read by STEP01', () => {
  const { jcl } = readCorpus('j03-concat-inline');
  const flow = buildDatasetFlow(parseJcl(jcl));
  assert.deepEqual(flow.datasets['PROD.LOADLIB'], { writtenBy: [], readBy: ['STEP01'] });
  assert.deepEqual(flow.datasets['PROD.VENDOR.LOADLIB'], { writtenBy: [], readBy: ['STEP01'] });
  assert.deepEqual(flow.datasets['SYS1.LINKLIB'], { writtenBy: [], readBy: ['STEP01'] });
});

test('j03: unsupported IF/ENDIF conditional-JCL is surfaced in unrecognized, never dropped', () => {
  const { jcl } = readCorpus('j03-concat-inline');
  const model = parseJcl(jcl);
  assert.equal(model.unrecognized.length, 2);
  assert.equal(model.unrecognized[0].operation, 'IF');
  assert.equal(model.unrecognized[1].operation, 'ENDIF');
});

test('j03: inline SYSIN data is captured verbatim between DD * and the /* delimiter', () => {
  const { jcl } = readCorpus('j03-concat-inline');
  const model = parseJcl(jcl);
  const sysin = model.steps[0].dds.find((dd) => dd.ddname === 'SYSIN');
  assert.deepEqual(sysin.inlineData, ['CARD ONE OF INPUT', 'CARD TWO OF INPUT']);
});

// ---------------------------------------------------------------------
// Robustness: continuation lines
// ---------------------------------------------------------------------

test('continuation: a DD statement split across three physical lines joins into one operand string', () => {
  const jcl = [
    '//J1       JOB CLASS=A',
    '//S1       EXEC PGM=P1',
    '//OUT      DD DSN=MY.DATA.SET,',
    '//            DISP=(NEW,CATLG,DELETE),',
    '//            UNIT=SYSDA,SPACE=(CYL,(1,1))',
  ].join('\n');
  const model = parseJcl(jcl);
  const dd = model.steps[0].dds[0];
  assert.equal(dd.dsn, 'MY.DATA.SET');
  assert.deepEqual(dd.disp, { status: 'NEW', normal: 'CATLG', abnormal: 'DELETE', defaulted: [] });
  assert.equal(dd.params.UNIT, 'SYSDA');
  assert.equal(dd.params.SPACE, '(CYL,(1,1))');
});

test('continuation: a trailing comment is only legal on the final (non-continuing) line', () => {
  const jcl = [
    '//J1       JOB CLASS=A',
    '//S1       EXEC PGM=P1',
    '//OUT      DD DSN=MY.DATA.SET,DISP=SHR THIS IS A COMMENT',
  ].join('\n');
  const model = parseJcl(jcl);
  // "THIS IS A COMMENT" is captured as comment text, not folded into DISP.
  const dd = model.steps[0].dds[0];
  assert.equal(dd.dsn, 'MY.DATA.SET');
  assert.equal(dd.disp.status, 'SHR');
});

test('continuation: name field empty + explicit DD keyword is concatenation, not continuation', () => {
  const jcl = [
    '//J1       JOB CLASS=A',
    '//S1       EXEC PGM=P1',
    '//IN       DD DSN=A.ONE,DISP=SHR',
    '//         DD DSN=A.TWO,DISP=SHR',
  ].join('\n');
  const model = parseJcl(jcl);
  const dd = model.steps[0].dds[0];
  assert.equal(model.steps[0].dds.length, 1, 'concatenation member must not become its own DD entry');
  assert.equal(dd.concatenation.length, 1);
  assert.equal(dd.concatenation[0].dsn, 'A.TWO');
});

// ---------------------------------------------------------------------
// Robustness: missing optional fields
// ---------------------------------------------------------------------

test('missing optional fields: EXEC with no PARM/COND and DD with no DISP still parse', () => {
  const jcl = ['//J1       JOB CLASS=A', '//S1       EXEC PGM=P1', '//OUT      DD DSN=SOME.FILE'].join('\n');
  const model = parseJcl(jcl);
  const step = model.steps[0];
  assert.equal(step.parm, null);
  assert.equal(step.cond, null);
  const dd = step.dds[0];
  assert.equal(dd.dsn, 'SOME.FILE');
  // DISP omitted entirely for a real dataset defaults to (NEW,DELETE,DELETE).
  assert.deepEqual(dd.disp, { status: 'NEW', normal: 'DELETE', abnormal: 'DELETE', defaulted: ['status', 'normal', 'abnormal'] });
});

test('missing optional fields: SYSOUT/DUMMY DDs never get a synthesized DISP', () => {
  const jcl = [
    '//J1       JOB CLASS=A',
    '//S1       EXEC PGM=P1',
    '//OUT      DD SYSOUT=*',
    '//NUL      DD DUMMY',
  ].join('\n');
  const model = parseJcl(jcl);
  assert.equal(model.steps[0].dds[0].disp, null);
  assert.equal(model.steps[0].dds[1].disp, null);
});

test('missing optional fields: JOB card with no accounting/programmer/msgclass', () => {
  const jcl = '//J1       JOB CLASS=A';
  const model = parseJcl(jcl);
  assert.equal(model.job.accounting, null);
  assert.equal(model.job.programmer, null);
  assert.equal(model.job.msgclass, null);
  assert.equal(model.job.msglevel, null);
});

// ---------------------------------------------------------------------
// Robustness: EXEC of a proc not defined in-stream (cataloged procedure)
// ---------------------------------------------------------------------

test('EXEC of an undefined (cataloged) PROC leaves expandedSteps absent instead of crashing', () => {
  const jcl = ['//J1       JOB CLASS=A', '//S1       EXEC CATPROC,PARM1=X'].join('\n');
  const model = parseJcl(jcl);
  const step = model.steps[0];
  assert.equal(step.proc, 'CATPROC');
  assert.equal(step.expandedSteps, undefined);
  // buildDatasetFlow must not throw when a step has no dds and no expansion.
  assert.deepEqual(buildDatasetFlow(model), { datasets: {} });
});

// ---------------------------------------------------------------------
// Robustness: comment lines and an empty job
// ---------------------------------------------------------------------

test('//* comment lines are collected verbatim and never treated as statements', () => {
  const jcl = ['//* THIS IS A COMMENT', '//J1       JOB CLASS=A', '//*', '//S1       EXEC PGM=P1'].join('\n');
  const model = parseJcl(jcl);
  assert.deepEqual(model.comments, ['THIS IS A COMMENT', '']);
  assert.equal(model.steps.length, 1);
});

test('an empty JCL source parses to an empty, non-throwing model', () => {
  const model = parseJcl('');
  assert.equal(model.job, null);
  assert.deepEqual(model.steps, []);
  assert.deepEqual(model.procs, {});
  assert.deepEqual(model.unrecognized, []);
  assert.deepEqual(buildDatasetFlow(model), { datasets: {} });
});
