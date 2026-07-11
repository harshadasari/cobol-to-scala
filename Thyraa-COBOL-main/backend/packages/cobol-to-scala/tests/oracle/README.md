# Compiler-oracle verification harness

This directory verifies the engine against **real compilers**, not just hand-written
expectations:

- [GnuCOBOL](https://gnucobol.sourceforge.io/) (`cobc`) compiles and runs the corpus
  `.cbl` programs, so their actual behavior (not a guess about COBOL semantics) is
  captured on disk.
- [scala-cli](https://scala-cli.virtuslab.org/) compiles and runs the Scala this
  engine's `convertToScala()` generates from that same source, so generated Scala can
  be checked directly against what the COBOL program actually does at runtime -
  "the compiler oracle" - instead of only against a separately hand-written
  `.expected.txt`.

See `docs/toolchain-status.md` (repo root `docs/`) for how both tools are installed in
this environment.

## Files

| File | Purpose |
|---|---|
| `harness.js` | Exported functions: `runCobol`, `runScala`, `oracleCompare`, plus `checkCobcAvailable`/`checkScalaCliAvailable`/`warmupScala`/`normalizeOutput`/`lineDiff` helpers. No test framework dependency - usable from a REPL/script too. |
| `oracle.test.js` | The `node:test` suite described below. Picked up automatically by `npm test` (`tests/**/*.test.js`). |
| `README.md` | This file. |

Nothing under `tests/corpus/` is written by hand here - the corpus is owned by
another workstream. This harness only reads `*.cbl`/`*.expected.txt` and writes
`*.oracle.txt` next to each program.

## How to run

```bash
# whole package suite, including this one:
npm test

# just the oracle suite:
node --test tests/oracle/oracle.test.js

# just the Phase 1 (COBOL-vs-Scala) comparisons, verbosely:
node --test --test-name-pattern="oracle compare" tests/oracle/oracle.test.js
```

Requires `cobc` and `scala-cli` on `PATH`. If either is missing, the relevant tests
report via `t.skip(...)` with an explanatory message - the suite does not fail, it
just can't verify anything until the tool is installed. The very first `scala-cli`
invocation on a fresh machine also resolves the Scala 3 compiler/stdlib from Maven
Central (can take well over a minute); `oracle.test.js` calls `warmupScala()` once in
a `before()` hook so the per-test 120s timeout isn't spent on that.

All compilation/execution happens in scratch directories under `os.tmpdir()`, never in
the repo tree, and each scratch directory is removed after use (`opts.keepTmp: true`
keeps it around for manual debugging of a harness failure).

## What the `.oracle.txt` files mean

For **every** `*.cbl` found anywhere under `tests/corpus/` (recursively, `data/` and
`proc/` alike), the suite compiles it with `cobc -x` and runs the executable. The
actual output is written to `<name>.oracle.txt` next to the source - this file is
**regenerated on every run**, it's a live snapshot of "what cobc actually did last
time this suite ran," not a hand-maintained fixture:

- On a clean run, it's exactly the program's stdout.
- On a compile failure, it's `# cobc COMPILE ERROR (exit N)` followed by cobc's
  stderr.
- On a nonzero runtime exit, it's `# program exited N` followed by stdout then
  stderr.

Where a hand-written `<name>.expected.txt` already exists alongside the source, the
suite diffs it against the freshly-captured cobc output and **fails the test on a
mismatch** (this is intentional - see below). Where no `.expected.txt` exists yet, the
test only records a diagnostic note ("captured `.oracle.txt` only") and passes, since
there's nothing to check it against yet.

### On an expected-vs-oracle mismatch

cobc is a real compiler running real COBOL semantics, so if `<name>.expected.txt`
disagrees with `<name>.oracle.txt`, exactly one of two things is true, and the
assertion failure message says so explicitly:

- **(a) the expectation is suspect** - `<name>.expected.txt` was authored with an
  incorrect assumption about COBOL semantics, or
- **(b) the program is suspect** - `<name>.cbl` doesn't actually implement the
  behavior its corpus comment/intent describes.

The harness cannot tell which on its own; it reports the line-by-line diff and both
possibilities so a human can inspect and fix the right file. **Do not "fix" a
mismatch by editing the harness or weakening the assertion** - either correct the
`.expected.txt` or the `.cbl`, whichever is actually wrong.

## Phase 1 scope: `tests/corpus/data/` only

For programs under `tests/corpus/data/` specifically, the suite also runs
`oracleCompare()`: convert the same COBOL source with this engine's
`convertToScala({ generateMain: true, ... })`, run the generated Scala with
`scala-cli`, and compare its stdout directly against cobc's stdout (independent of any
`.expected.txt`).

- If they match, the test passes normally.
- If they don't (compile error, runtime error, or output mismatch), the test calls
  `t.todo('Phase 1 work queue - <file>: <exact mismatch>')` and returns. This makes it
  visible in the test report (`# TODO ...`) without failing the suite - it is the
  **Phase 1 work queue**: real, currently-known-failing generator gaps, each with the
  precise compiler error/diff that reproduces it. **Do not delete or weaken these
  assertions to make them pass** - the point of a todo/red list is that it stays
  honest until the generator is actually fixed; only remove an entry once
  `oracleCompare()` genuinely matches.

## Phase 2 scope: `tests/corpus/proc/`

`tests/corpus/proc/` programs (SEARCH/SEARCH ALL, table/file SORT, MOVE
CORRESPONDING, GO TO ... DEPENDING ON, intrinsic FUNCTIONs, PERFORM forms,
EVALUATE, STRING/UNSTRING/INSPECT) go through the exact same `oracleCompare()`
data-driven pattern as Phase 1, in a separate "Phase 2 oracle compare" suite:
match -> hard `assert.ok`, mismatch -> `t.todo('Phase 2 work queue - ...')`.
As of this writing every `tests/corpus/proc/*.cbl` program matches end-to-end
(0 todo); a todo only reappears here if a new proc/ program is added ahead of
the generator support it needs.

## Current inventory (last recorded run: 2026-07-11)

Toolchain: cobc and scala-cli both available.

**cobc oracle capture / expected-vs-oracle check** - 16 corpus programs found (7 under
`data/`, 9 under `proc/`), all 16 compiled and ran cleanly under cobc (exit 0), and all
16 already have a `.expected.txt` that matches the captured `.oracle.txt` exactly - 0
mismatches. (If you add a corpus program without a `.expected.txt` yet, it will show up
as a diagnostic-only pass here until one is added.)

**Phase 1 (`data/`) COBOL-vs-generated-Scala oracle compare** - 7/7 programs currently
land in the `t.todo(...)` work queue; 0 currently match end-to-end. This is expected at
this stage of the generator (Phase 1 corpus is deliberately adversarial about data
layout) and is not something this harness fixes - it's owned by whoever works the
generator next. Exact mismatch per program:

| Program | Mismatch |
|---|---|
| `p01-comp3.cbl` | Scala compile error: `Not found: wsPosSmall` (and same for every other field) |
| `p02-binary.cbl` | Scala compile error: `Not found: wsBin2Pos` (ditto, every field) |
| `p03-zoned.cbl` | Scala compile error: `Not found: wsSmall` (ditto) |
| `p04-occurs.cbl` | Scala compile error: `wsI is already defined as variable wsI` (plus, separately, undeclared group-item fields and dropped-subscript / dropped-loop-body issues - see below) |
| `p05-odo.cbl` | Scala compile error: `Not found: wsCount` (ditto pattern) |
| `p06-redefines.cbl` | Scala compile error: `Not found: wsDateNumeric` (ditto pattern) |
| `p07-editing.cbl` | Scala compile error: `Not found: wsZsVal` (ditto pattern) |

### Top 5 categories behind these failures (generator gaps, not harness bugs)

1. **Undeclared top-level elementary `01`-level WORKING-STORAGE items.** `01` items
   with no children are meant to become case classes; items with no children fall
   through both `generateAllCaseClasses` (which requires `children.length > 0`) and
   `generateWorkingStorageFields` (which only handles level-`77` items) in
   `generator/scala-generator.js`. The generated method body then assigns/reads a Scala
   identifier (e.g. `wsPosSmall`) that was never declared anywhere -
   `Not found: <name>`. This alone accounts for all of p01, p02, p03, p05, p06, p07 and
   part of p04.
2. **Subscripted table-element references collapse to the bare group field name,
   silently losing the index.** In p04, `WS-QTY(1)`, `WS-QTY(2)`, ... all generate as
   the same bare `wsQty` reference/assignment - the subscript is dropped rather than
   indexing into the `Vector` the case class holds.
3. **`PERFORM VARYING` loop bodies are dropped.** In p04/p05 the generated `while`
   loop correctly increments the loop variable and tests the exit condition, but the
   statement(s) inside the loop (e.g. `ADD WS-QTY(WS-I) TO WS-QTY-TOTAL`) are rendered
   as an empty `()` - the loop runs to completion and does nothing.
4. **Repeated `PERFORM VARYING` with the same loop variable re-declares it.** Each
   `PERFORM VARYING WS-I ...` in the same paragraph/procedure emits its own
   `var wsI = 1`, so a second loop over `WS-I` in the same method fails to compile
   with `wsI is already defined as variable wsI` (p04).
5. **Multi-dimensional `OCCURS` subscripts aren't translated.** `WS-COL(WS-I, WS-J)`
   (a 2-D table access in p04) collapses to the bare `wsCol` name instead of two levels
   of `Vector` indexing.

Re-run `npm test` after generator changes; the numbers/table above will drift as gaps
close; the "how to run" commands are the source of truth, this table is only a
snapshot.
