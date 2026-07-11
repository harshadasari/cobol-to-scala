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

`tests/corpus/proc/` programs (SEARCH/SEARCH ALL, table/file SORT, MOVE/ADD
CORRESPONDING, GO TO ... DEPENDING ON, intrinsic FUNCTIONs, PERFORM forms,
EVALUATE, STRING/UNSTRING/INSPECT, RELEASE/RETURN) go through the exact same
`oracleCompare()` data-driven pattern as Phase 1, in a separate "Phase 2
oracle compare" suite: match -> hard `assert.ok`, mismatch ->
`t.todo('Phase 2 work queue - ...')`. As of this writing every
`tests/corpus/proc/*.cbl` program matches end-to-end (0 todo); a todo only
reappears here if a new proc/ program is added ahead of the generator support
it needs.

The `p10`-`p18` programs are the original Phase 2 baseline corpus. The
`r01`-`r14` programs (including `*b`/`*c` isolation/bisection follow-ups) were
added by a Phase 2 adversarial refuter that found 14 root-cause silent-
divergence gaps against installed GnuCOBOL - see "Current inventory" below
for the finding -> program -> fix mapping. They were promoted into this
directory (not kept as a separate corpus) specifically so this same
data-driven suite picks them up automatically: no test-registration code
changes were needed to add them, only the generator/parser fixes each one's
mismatch pointed at.

## Current inventory (last recorded run: 2026-07-11)

Toolchain: cobc and scala-cli both available.

**cobc oracle capture / expected-vs-oracle check** - 48 corpus programs found (19
under `data/`, 29 under `proc/`; `tests/corpus/sql/`'s 5 EXEC-SQL programs are
excluded from this cobc sweep - plain GnuCOBOL can't compile embedded SQL without a
precompiler, see `tests/sql.test.js` instead), all 48 compiled and ran cleanly under
cobc (exit 0). 28 of the 48 (19 `data/` + 9 `proc/` baseline programs) already have a
hand-written `.expected.txt` that matches the captured `.oracle.txt` exactly - 0
mismatches. The 20 `r01`-`r14*` programs have no hand-written `.expected.txt` by
design (they're verified directly against cobc via `oracleCompare()` below, not a
separately hand-authored expectation) and show up here as a diagnostic-only capture
("no `<name>.expected.txt` alongside ... yet").

**Phase 1 (`data/`) COBOL-vs-generated-Scala oracle compare** - 19/19 programs match
end-to-end (0 todo).

**Phase 2 (`proc/`) COBOL-vs-generated-Scala oracle compare** - 29/29 programs match
end-to-end (0 todo), including all 20 `r01`-`r14*` adversarial-refutation programs
below.

### Phase 2 adversarial-refutation findings (r01-r14) and their fixes

The refuter found 14 root-cause gaps, all silent (no TODO markers, no crash at
generation time - each one produced plausible-looking but wrong, or non-compiling,
Scala). All 14 are now fixed; every program hard-passes `oracleCompare()`. Only 4
programs (`r03`, `r04`, `r05`, `r08`) already passed before this round of fixes.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `FUNCTION NUMVAL` crashed on COBOL-legal internal whitespace between the sign and digits (e.g. `'+  12.5'`) - a plain `.trim` only strips the outer edges, and `BigDecimal`'s parser rejects the remaining internal space outright | Added a `CobolFmt.numval` runtime helper that strips *every* space and normalizes the sign before parsing (`generator/expression-gen.js`) | r11, r11b, r11c |
| 2 | `SET condition-name TO TRUE` emitted `<conditionNameCamel> = true` - the condition name has no Scala var of its own (IF/EVALUATE TRUE WHEN condition-name were already fixed in commit `5a9605e`; this was the one remaining broken form) | Assign the condition's *parent* field the first declared VALUE instead (`level88FirstValueAssignment` in `generator/expression-gen.js`) | r14, r14b |
| 3 | `EVALUATE <arithmetic-expression>` silently dropped everything after the first operand (`WS-A + WS-B` -> just `WS-A`), and a full relational/class/sign condition as a WHEN object under `EVALUATE TRUE` collapsed to `(true) == (subject)` | Parser: `parseEvaluateValue`/`parseEvaluateObject` (`parser/procedure-parser.js`) parse a full arithmetic-expression subject and a full condition-1 WHEN object; codegen: `RELATION`/`CLASS`/`SIGN`/`NOT-RANGE` cases in `evaluateConditionExpr` (`generator/expression-gen.js`) | r10 |
| 4 | Recursive/nested `PERFORM` of the same paragraph (from inside an IF/EVALUATE/etc.) mangled a digit-leading paragraph name (`1000-RECURSE` -> `1000Recurse()`) inconsistently with the actual generated method name (`recurse()`) | `expression-gen.js`'s `generatePerform` (used for a PERFORM nested inside another statement) now uses the same `paragraphMethodName` numeric-prefix-stripping logic method-gen.js's `toMethodName` uses for top-level PERFORMs | r09 |
| 5 | `PERFORM WITH TEST AFTER` emitted a postfix `do <block> while <cond>` - Scala 3 removed do-while entirely, not just restyled it | Fold body(+increment)+test into the `while`-condition block, leave the loop's own `do` empty (or, for `VARYING`, move only the increment into `do` - the test uses the still-current value, verified against installed GnuCOBOL) - `method-gen.js` and `expression-gen.js` | r07 |
| 6 | Two different top-level records each declaring a same-named nested group (`05 DTL-GROUP`) collided: duplicate `case class`/`object` definitions, duplicate flat `var` declarations, and CORRESPONDING matching recursed into the wrong occurrence's children | `case-class-gen.js`'s `collectAmbiguousGroupClassNames`/`resolveClassName` qualify only genuinely-colliding names by parent path; `scala-generator.js`'s flat-var registry qualifies by full ancestor path; `GROUP_REGISTRY` is now keyed by full ancestor path (not bare name) with a `groupKeyRegistry` for bare-name entry-point lookups | r13, r13b |
| 7 | `FUNCTION LENGTH` of a GROUP item had no registry entry, falling back to a runtime `.length` call on a nonexistent flat var | New `groupByteLengthRegistry` (built from `layout.js`'s `itemByteLength`) gives `functionLength` a compile-time-constant answer for group arguments | r11 |
| 8 | `FUNCTION MAX`/`MIN` used `Math.max`/`Math.min`, which have no `BigDecimal` overload | `List(...).max`/`.min` (works for any Scala numeric type via its own `Ordering`); a MOVE of the result into a numeric-edited field routes through `CobolFmt.edited` | r11, r14, r14c |
| 9 | `SEARCH ... VARYING other-index` was completely ignored - the table's default index always drove the loop | The named `VARYING` identifier - not the table's default index - is now the sole loop-control variable, matching GnuCOBOL's actual (empirically verified) behavior: it is not resynced to anything and the default index is left untouched | r01 |
| 10 | `DISPLAY` of an index-name used the table's own OCCURS size for width/sign, not GnuCOBOL's actual runtime format | Index-name registry entries now always use `integerDigits: 9, signed: true` (GnuCOBOL's fixed internal index-name format) | r01, r02 |
| 11 | Multi-key `SORT` with mixed ASCENDING/DESCENDING keys was approximated by primary-key order only | `sortInPlaceWith` with a real per-key tie-breaking cascade honoring each key's own direction (stable, verified) | r06 |
| 12 | `RELEASE ... FROM identifier` matched fields *by name* (like MOVE CORRESPONDING) - silently copied nothing when the FROM source's field names legitimately differed from the SD record's own | New `positionalPairs` (position-matched, not name-matched - RELEASE has no CORRESPONDING keyword) | r06, r06b |
| 13 | `RETURN ... INTO identifier` had the same name-matching bug as RELEASE | Same `positionalPairs` fix, applied to the mirror-image direction | r06, r06b |
| 14 | `UNSTRING ... COUNT IN` never populated the per-field count receiver (always left at its default 0) | Assign each COUNT IN target the matched substring's actual length | r12 |

Re-run `npm test` after generator changes; the table above will drift as new gaps are
found and fixed - the "how to run" commands are the source of truth, this table is
only a snapshot. See also `tests/phase2-refutation-fixes.test.js` for focused,
toolchain-independent unit tests of each fix above.
