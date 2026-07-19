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
`t.todo('Phase 2 work queue - ...')`. As of this writing 203 of 204
`tests/corpus/proc/*.cbl` programs match end-to-end; the one exception,
`d12`, is a *deliberate* todo (see the round-15 table and "Known gaps" below -
it intentionally exercises the pre-existing, out-of-scope reference-
modification gap to regression-test round-15 finding 8's crash fix, not a
generator gap awaiting support). A todo otherwise only reappears here if a
new proc/ program is added ahead of the generator support it needs.

The `p10`-`p18` programs are the original Phase 2 baseline corpus. The
`r01`-`r14` programs (including `*b`/`*c` isolation/bisection follow-ups) were
added by a Phase 2 adversarial refuter that found 14 root-cause silent-
divergence gaps against installed GnuCOBOL - see "Current inventory" below
for the finding -> program -> fix mapping. The `n01`-`n16` programs
(including `*b` isolation follow-ups) were added the same way by a **round-3**
adversarial refuter (12 findings, plus one more - "finding 13"/unrounded
truncation - found while docs were independently being fact-checked in
parallel) - see "Round-3 findings" below. The `q01`-`q12` programs (including
`*b`/`*c` isolation follow-ups) were added the same way by a **round-4**
adversarial refuter that found 13 more root-cause dishonest divergences -
SECTION handling (PERFORM of a section name, same-stripped-name paragraph
collisions across sections, and the program's true entry point), UNSTRING
(WITH POINTER, DELIMITED BY ALL, DELIMITER IN, multi-UNSTRING scoping), and
six further expression/statement gaps - see "Round-4 findings" below. The
`s01`-`s12` programs (including `*b` isolation follow-ups) were added the same
way by a **round-5** adversarial refuter that found 6 more root-cause dishonest
divergences concentrated in FILE I/O and INITIALIZE - see "Round-5 findings"
below. The `t01`-`t12` programs (`t09` deliberately excluded - see "Known
gaps") were added the same way by a **round-6** adversarial refuter that found
6 more root-cause dishonest divergences: `WRITE ... ADVANCING` (parsed but
completely ignored at codegen), a `convertLiteral` text-shape guess that
silently discarded a quoted string literal's own identity whenever its text
happened to look like digits, STRING `ON OVERFLOW`/`NOT ON OVERFLOW` (parsed
but dropped at codegen) plus an unguarded STRING copy loop
(`StringIndexOutOfBoundsException` on overflow), and UNSTRING `ON OVERFLOW`/
`NOT ON OVERFLOW` (not parsed at all - the unconsumed clause corrupted the
statement stream) - see "Round-6 findings" below. The `u01`-`u13` programs
(including `*b` isolation follow-ups) were added the same way by a
**round-7** adversarial refuter that found 8 more root-cause dishonest
divergences: a READ AT END truthiness bug that could silently swallow the
statement *after* a bare READ, a SECTION's own leading (pre-first-named-
paragraph) statement block silently discarded, CALL (comma-consuming parser
bug plus no same-file multi-program/external-CALL support at all),
COMP-1/COMP-2 (Float/Double) DISPLAY and arithmetic, a COMP-3 table subscript
missing a `.toInt` conversion, SPECIAL-NAMES `DECIMAL-POINT IS COMMA`, and
MOVE of a whole GROUP to an elementary receiver referencing an undeclared
bare identifier - see "Round-7 findings" below. All of these were promoted
into this directory (not kept as a separate corpus) specifically so this same
data-driven suite picks them up automatically: no test-registration code
changes were needed to add them, only the generator/parser fixes each one's
mismatch pointed at.

A COPY-bearing corpus program (`u09`/`u10`) additionally needs a sibling
`<base>.copybooks.json` file (`{"NAME": "copybook source text", ...}`) -
`oracle.test.js`'s `loadCopybooksFor` reads it and threads the same copybook
text into both `convertToScala()` (`options.copybooks`) and cobc
(`harness.js`'s `runCobol`/`oracleCompare`, which now also accept
`opts.copybooks` and write each one as `<scratchDir>/<NAME>.cpy` with `-I
<scratchDir>` passed to `cobc`, so its own COPY-book search resolves them
too) - this is what makes a COPY-bearing program verifiable against real
cobc at all; previously the harness had no copybook support whatsoever, so
`u09`/`u10` could only be spot-checked with a throwaway script, never run
through this data-driven suite.

## Current inventory (last recorded run: 2026-07-12)

Toolchain: cobc and scala-cli both available.

**cobc oracle capture / expected-vs-oracle check** - 223 corpus programs found
(19 under `data/`, 204 under `proc/`; `tests/corpus/sql/`'s 5 EXEC-SQL programs are
excluded from this cobc sweep - plain GnuCOBOL can't compile embedded SQL without a
precompiler, see `tests/sql.test.js` instead; two round-9 repros, `w09`/`w12`, are
deliberately excluded entirely - see the round-9 table below - since cobc itself
rejects them), all 223 compiled and ran cleanly under cobc (exit 0). 28 of the 223
(19 `data/` + 9 `proc/` baseline programs) already have a hand-written `.expected.txt`
that matches the captured `.oracle.txt` exactly - 0 mismatches. The 20 `r01`-`r14*`,
15 `n01`-`n16*`, 16 `q01`-`q12*`, 14 `s01`-`s12*`, 11 `t01`-`t12*` (`t09` excluded),
14 `u01`-`u13*`, 12 `v01`-`v12*`, 12 `w01`-`w14*` (`w09`/`w12` excluded), 12
`x01`-`x12`, 16 `y01`-`y17*` (see the round-11 table below for the exact subset),
15 `z01`-`z15*` (see the round-12 table below for the exact subset), 11
`aa01`-`aa10*` (see the round-13 table above for the exact subset), 11
`b1`-`b6`/`c1`/`c3`/`c4b`/`c5`/`c6` (see the round-14 table above for the exact
subset), and 14 `d01`-`d14` (see the round-15 table below for the exact subset)
programs have no hand-written `.expected.txt` by design (they're verified
directly against cobc via `oracleCompare()` below, not a separately hand-authored
expectation) and show up here as a diagnostic-only capture ("no `<name>.expected.txt`
alongside ... yet").

**Phase 1 (`data/`) COBOL-vs-generated-Scala oracle compare** - 19/19 programs match
end-to-end (0 todo).

**Phase 2 (`proc/`) COBOL-vs-generated-Scala oracle compare** - 203/204 programs
match end-to-end, 1 todo, including all 20 `r01`-`r14*`, all 15 `n01`-`n16*`, all 16
`q01`-`q12*`, all 14 `s01`-`s12*`, all 11 `t01`-`t12*` (`t09` excluded), all 14
`u01`-`u13*`, all 12 `v01`-`v12*`, all 12 `w01`-`w14*` (`w09`/`w12` excluded), all
12 `x01`-`x12`, all 16 `y01`-`y17*`, all 15 `z01`-`z15*`, all 11 `aa01`-`aa10*`, all
11 `b1`-`b6`/`c1`/`c3`/`c4b`/`c5`/`c6`, and 13 of the 14 `d01`-`d14`
adversarial-refutation programs below. The one todo (`d12`) is a deliberate,
documented exception - see the round-15 table below and "Known gaps" - it
exercises the pre-existing, deliberately out-of-scope reference-modification
gap (round-3 finding 3) on purpose, to regression-test round-15 finding 8's
fix (STRING no longer hard-crashes when combined with ref-mod) without
requiring ref-mod's own semantics to be implemented.

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

### Round-3 adversarial-refutation findings (n01-n16) and their fixes

A round-3 refuter found 12 more root-cause dishonest divergences (silently
wrong output, or in three cases - findings 1, 6, 7 - a hard generated-Scala
compile error), plus one more ("finding 13") found independently while
`docs/CAPABILITY_AUDIT_AND_ROADMAP.md` was being fact-checked in parallel.
All are now fixed except finding 3 (reference modification), which remains a
documented, honestly-degraded gap - see the "Known gaps" note below the
table. Every other program hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `EXIT PERFORM` compiled to a bare `return`, which unwound the *entire enclosing method* - skipping every statement after the loop's own `END-PERFORM` in the same paragraph, not just the loop | Every inline PERFORM form (TIMES/UNTIL/VARYING/bare-inline) wraps its body in `scala.util.boundary { ... }`; `EXIT PERFORM` compiles to `scala.util.boundary.break()`, which unwinds to exactly the nearest enclosing boundary (nested loops each get their own, so a nested EXIT PERFORM only exits the innermost) - `generator/expression-gen.js`'s `generatePerform`/`generateExit`, `generator/method-gen.js`'s `generatePerformFromAST`/`generateVaryingNest`/`generateMethodBody` | n01, n01b |
| 2 | `EXIT PARAGRAPH` compiled to a no-op comment - nothing after it in the same paragraph was ever actually skipped | Compiles to `return` (every paragraph is its own Scala method, so `return` skips only the rest of *that* paragraph - the same reasoning `GO TO` already relies on) | n02 |
| 3 | Reference modification (`identifier(start:length)`) was mis-parsed: the parser's subscript-list loop consumed `start` as a bogus lone subscript and left the cursor sitting on the un-recognized `:length)`, corrupting every token read for the rest of the statement; the (unreachable) intended refMod codegen path was never wired up at all | Parser fix: `parseVariableReference` now detects the `:` right after the first parenthesized expression and treats the whole group as reference modification (not a subscript), for both `identifier(start:length)` and a subscripted `identifier(sub)(start:length)` - this alone prevents the parse corruption. Full read/write *semantics* are a documented, out-of-scope gap (see "Known gaps" below): both paths degrade to a visible, compiling `???` marker instead | none - documented gap, not promoted (see below) |
| 4 | `parsePrimaryCondition` parsed a relational condition's subject/object via `parseOperand` (a single term) - `IF WS-A * WS-B > WS-C` silently truncated to just `WS-A` | Reuse `parseEvaluateValue` (leading operand + any following arithmetic continuation, already used by EVALUATE) for the class/sign/relation condition subject and the relation object | n04 |
| 5 | Relational conditions had zero type-coercion - a String-typed (numeric-edited, or a REDEFINES character-sliced numeric view) operand compared against a numeric operand emitted a bare `==`, a hard Scala 3 compile error ("Values of types Int and String cannot be compared") | `renderRelationalCondition`/`relationalOperandDescriptor` (`generator/expression-gen.js`) classify both operands and coerce: alphanumeric-vs-alphanumeric (numeric-edited counts as alphanumeric here - compiler-verified, see below) stays a string compare; a *plain-numeric-but-String-typed* REDEFINES view vs. numeric extracts via `CobolFmt.numval`; genuine numeric vs. alphanumeric/edited renders the numeric side as its own display-digit text (a literal's own bare digit text, unpadded; a field's own zero-padded-to-its-own-width text - never padded to the *other* side's width, an earlier, unverified draft of this fix that direct cobc probing (`probe1.cbl`) disproved) then space-pads the shorter to match | n05 |
| 6 | `REDEFINES` of a GROUP by another GROUP (different shape, or one side containing an `OCCURS`) declared *no* accessor for any of the redefining item's own children at all - a hard compile error the instant one was referenced, since `redefinesAccessorLines` only ever looked up the target in the elementary-field registry, which a GROUP is never entered into | `scala-generator.js`'s new `groupOverGroupRedefinesLines` builds a synthetic `<item>BaseFlat` getter/setter pair that concatenates/redistributes the target group's own (already-registered) children's display text, then reuses `characterSlicedGroupRedefinesLines` unchanged (Scala's setter-call sugar makes a getter/setter pair usable exactly like a real flat String var); a shape this can't represent (a FILLER gap, nested OCCURS, signed numeric, or unsupported Scala type) degrades to a visible, compiling `???` getter / no-op setter instead of leaving the fields undeclared | n06, n06b |
| 7 | A numeric `STRING` segment rendered as a bare Scala `Int`/`BigDecimal` value - the segment-copy loop's `.indices`/`.take` calls don't exist on those types, so this was a hard generated-Scala compile error for *any* `STRING` statement with a numeric operand | `stringSegmentValueExpr` (`generator/expression-gen.js`) coerces a numeric segment to its digit-display text first: `CobolFmt.digitsOf` for a registered numeric field (own zero-padded width, the MOVE-numeric-to-alphanumeric convention), the literal's own bare digit text for a numeric literal, `.toString` for a computed/intrinsic numeric expression | n07 |
| 8 | `COMPUTE`/`ADD`/`SUBTRACT`/`MULTIPLY`/`DIVIDE` `ROUNDED` rendered as a no-op trailing Scala *comment* - it never affected the stored value at all | New `storeNumericExpr`/`storeNumericByInfo` (`generator/expression-gen.js`) apply `CobolFmt.roundNumeric` (HALF_UP to the target's declared decimal digits, then high-order integer-digit truncation) at store time when `ROUNDED` is present, on every arithmetic statement | n08 |
| 9 | `ADD ... GIVING` with multiple targets assigned every target the exact same raw, uncoerced sum - no per-target truncation/rounding to each target's *own* declared digit widths, and no `BigDecimal -> Int` coercion for a 0-decimal target | Every GIVING target (ADD/SUBTRACT/MULTIPLY/DIVIDE alike) is now stored via `storeNumericExpr` individually, against its own `integerDigits`/`decimalDigits`/`scalaType` | n09 |
| 10 | `SUBTRACT CORRESPONDING` was completely unimplemented - `generateSubtract` never even checked `statement.corresponding`, so it fell through to the plain-operand path and tried to treat a GROUP reference as a single elementary operand | New `generateSubtractCorresponding` (`generator/expression-gen.js`), mirroring `generateAddCorresponding` exactly (subtracting instead of adding), wired into `generateSubtract`'s dispatch | n10 |
| 11 | `MOVE ALL 'literal'` behaved like a plain `MOVE 'literal'` (space-padded once) instead of tiling the literal across the whole receiving field | `renderLiteralForTarget` checks the parsed `.all` flag and calls new `repeatToWidthText` instead of `fitAlphanumericText` when set | n11 |
| 12 | Abbreviated combined relation conditions (`A = 1 OR 2`, `A > 1 AND < 5`) parsed the elided term as `null`, which `convertCondition`'s top-level `if (!condition) return 'true'` fallback silently rendered as literal `true` - catastrophically always-true/always-false compound conditions | Parser: `ctx.lastRelation` (set by `parsePrimaryCondition` after a genuine relation, cleared by every other condition kind) lets `parseNotCondition` detect an elided-subject continuation (a bare relational operator, or a literal/figurative/FUNCTION token, immediately after `AND`/`OR`) and rebuild the abbreviated term with the carried subject and (possibly new) operator - see `isAbbreviatedRelationContinuation` | n12, n12b |
| 13 (new - found independently while fact-checking docs) | Arithmetic **without** `ROUNDED` never truncated to the target's declared decimal digits at store time either - only `DISPLAY`-time formatting (`CobolFmt.num`, always `HALF_UP`) fixed the digit count, which *rounds* rather than truncates (`COMPUTE X = 2.345` into a 2-decimal target should store `2.34`, not display-format `2.35`) | Same `storeNumericExpr` fix as finding 8: absence of `ROUNDED` now routes through `CobolFmt.truncNumeric` (DOWN-toward-zero to the target's decimal digits, then the same high-order truncation) instead of leaving the exact, over-precise result unstored-but-unformatted | n16 |

Re-run `npm test` after generator changes; the table above will drift as new gaps are
found and fixed - the "how to run" commands are the source of truth, this table is
only a snapshot. See also `tests/phase2-refutation-fixes.test.js` and
`tests/round3-fixes.test.js` for focused, toolchain-independent unit tests of each
fix above.

### Round-4 adversarial-refutation findings (q01-q12) and their fixes

A round-4 refuter found 13 more root-cause dishonest divergences: three in
SECTION handling (a real-world-common organization none of the prior rounds'
corpus exercised at all), four in UNSTRING, and six further expression/
statement gaps. All 13 are now fixed; every program hard-passes
`oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 7 | `PERFORM` of a SECTION name (not a paragraph) generated a call to a method that was never generated at all - a section containing paragraphs was silently dropped from codegen entirely (only a *paragraphless* section, with statements directly under its header, ever became a callable method) | New `generateSectionMethod` (`generator/method-gen.js`) generates a wrapper method named after the section, nesting its own paragraphs as local `def`s with fall-through bounded to just that section (mirrors `generatePerformThruMethod`'s existing nested-def pattern, factored into a shared `renderNestedFallthroughDefs` helper) | q09, q09b |
| 8 | Same-named paragraphs in different sections (e.g. `1000-PARA-A` and `2000-PARA-A` - distinct COBOL names, but `toMethodName`'s leading-numeric-prefix strip collapses both to `paraA`) collided as duplicate top-level `def`s - a hard compile error | New `collectAmbiguousParagraphNames`/`resolveParagraphMethodName` (`generator/method-gen.js`) qualify only genuinely-colliding bare names by their enclosing section (mirrors `case-class-gen.js`'s `collectAmbiguousGroupClassNames`/`resolveClassName` pattern exactly) - a unique bare name is untouched | q09 |
| 9 | `findMainProcedure` only ever looked at top-level (section-less) paragraphs - a program whose first unit was a SECTION generated a `run()` that called a hallucinated, nonexistent `mainprocedure()`; separately, even once a real first paragraph was found, `run()` called *only* that one paragraph's fall-through-free standalone method - every paragraph after the first was unreachable unless some other paragraph happened to `PERFORM` it, section or no section | `findMainProcedure`/`generateMainMethod` (`generator/scala-generator.js`) now resolve the true first unit (paragraph or section) via a unified `splitProcedureDivision`/`flattenProcedureUnits`, and `run()`'s body chains *every* paragraph across the *whole* division via `generateProgramFlowLines`/`renderNestedFallthroughSteps` so natural fall-through actually spans section boundaries. **Mid-course correction, caught by the full regression sweep, not by the 16 repro programs**: the first implementation duplicated each paragraph's own statements as same-named nested `def`s (mirroring `generatePerformThruMethod`'s existing pattern) - this silently broke `tests/corpus/proc/p12-sort.cbl` (an already-passing, pre-round-4 program): its `SORT ... INPUT PROCEDURE`/`OUTPUT PROCEDURE` explicitly `PERFORM`s two paragraphs that also happen to be adjacent in the whole-program fall-through chain, and Scala's lexical scoping resolved that explicit PERFORM's call site to the fallthrough-rigged nested sibling instead of the real bounded flat method - silently re-running the OUTPUT PROCEDURE a paragraph early, before the SORT itself had run, corrupting the result with no compile error at all. Fixed by *not* duplicating bodies for finding 7/9's wrappers: `renderNestedFallthroughSteps` (`generator/method-gen.js`) instead calls each unit's own already-generated flat top-level method through positionally-named (`_step0`, `_step1`, ...) wrapper `def`s that can never collide with (or shadow) any COBOL-derived name - see its doc comment for the full trace, and the "Known gaps" note below for the (narrow, unexercised) trade-off this specific fix accepts. `generatePerformThruMethod` itself (PERFORM ... THRU, pre-existing, already relied upon by `r08`/`p14`) was deliberately left on the original body-duplicating `renderNestedFallthroughDefs`, unchanged | q09, q09b, q09c |
| 10 | `UNSTRING ... WITH POINTER` ignored the pointer's starting value entirely (always scanned from position 1) and never wrote the final position back | Rewrote `generateUnstring` to delegate to a new `CobolUnstring.unstring` runtime helper that takes an explicit 0-based start position and returns the final scan position, which is written back (`+1` for COBOL's 1-based `POINTER` field) - a single regex `.split()` (the prior implementation) has no notion of a start offset at all | q11 |
| 11 | `UNSTRING ... DELIMITED BY ALL` parsed and silently discarded the `ALL` keyword (`ctx.matchValue('ALL')` with no assignment) - consecutive delimiters were never collapsed, producing spurious empty fields | Parser: each delimiter is now `{ node, all }` (`parser/procedure-parser.js`'s `parseUnstringStatement`); codegen passes `(text, all)` pairs to `CobolUnstring.unstring`, which extends a match over every immediately-following repeat of that *same* delimiter text when `all` is set | q12, q12c |
| 12 | `UNSTRING ... DELIMITER IN` was parsed into the AST (`target.delimiter`) but never read by codegen - the receiving field was silently left at its default value | `generateUnstring` now assigns each `DELIMITER IN` target from `CobolUnstring.unstring`'s returned per-field matched-delimiter text | q12, q12b |
| 13 | Two `UNSTRING` statements in the same paragraph collided over `val _parts` ("_parts is already defined") - a hard compile error | `generateUnstring`'s whole statement is now wrapped in its own `{ ... }` block scope, mirroring `generateString`'s existing pattern exactly | q12 |
| 1 | Figurative constants (`HIGH-VALUES`/`LOW-VALUES`/`SPACES`/`ZEROES`) used directly in a comparison rendered as their own literal keyword text (e.g. `wsHv == "HIGH-VALUE"`) instead of the actual fill character(s) - and `IF HIGH-VALUES > LOW-VALUES` (a figurative-led condition with no identifier at all) failed to parse as a condition at all, silently dropping it (`return null`) and corrupting the rest of the statement into an orphaned `??? TODO: unsupported statement` plus a hardcoded `if true` | Parser: `parsePrimaryCondition` now also accepts a literal/figurative/FUNCTION-led subject for the relational form (`isLiteralOrFigurativeOrFunctionStart`); codegen: new `relationalOperandExpr`/`figurativeCompareText` (`generator/expression-gen.js`) render a figurative comparison operand expanded to the *other* operand's own width (a field's `picLength`, or a literal's own text length), falling back to a single character with no such anchor (compiler-verified: `HIGH-VALUES > LOW-VALUES` compares exactly one 0xFF byte against one 0x00 byte) | q02 |
| 2 | `MOVE ZEROES` into a numeric-EDITED field (`zeroLiteralFor`) rendered a bare run of `'0'` characters instead of the PICTURE-formatted result (e.g. `PIC ZZ,ZZ9.99` should store `"     0.00"`, not `"0000000000000"`) | `zeroLiteralFor` (`generator/expression-gen.js`) now checks `info.dataType === 'edited'` first and routes through `formatEditedPicture`, exactly like `renderLiteralForTarget`'s numeric-literal-zero branch already does | q02 |
| 3 | `INSPECT ... BEFORE INITIAL`/`AFTER INITIAL` was not parsed at all - the whole phrase was left completely unconsumed, so the INSPECT ran **unrestricted** over the entire target (double-dishonest: wrong counts/replacements *and* the leftover tokens were then mis-parsed as a bogus separate statement) | Parser: `parseInspectRegion` (`parser/procedure-parser.js`) attaches an optional `{ type: 'BEFORE'\|'AFTER', value }` to each TALLYING/REPLACING sub-clause and to CONVERTING; codegen: new `CobolInspect.beforeInitial`/`afterInitial` runtime helpers split the target around the first occurrence of the boundary, and `generateInspect`'s new `inspectTallyScanExpr`/`applyInspectRegion` (`generator/expression-gen.js`) restrict the operation to the right piece, reattaching the untouched complement for REPLACING/CONVERTING | q04 |
| 4 | `DIVIDE ... GIVING` into a numeric-EDITED receiver assigned the raw `Int`/`BigDecimal` division result directly to the String-typed target - a hard Scala 3 compile error ("Found: Int, Required: String") | `storeNumericByInfo` (`generator/expression-gen.js`) now checks for an edited target first: applies the same store-time ROUNDED-or-truncated digit coercion, then formats the result through the runtime `CobolFmt.edited` helper (`numericRawValueExpr` renders the intermediate `BigDecimal` as its expected signed-decimal-text form) - the same fix benefits ADD/SUBTRACT/MULTIPLY/COMPUTE GIVING into an edited receiver too, since they all share this function | q06 |
| 5 | `PERFORM VARYING ... AFTER ...` left the AFTER variable holding whatever value its own last inner pass reached once the whole nest exited, instead of its FROM-reset value - cobc's actual documented algorithm resets every level nested under a level that just incremented back to FROM *unconditionally*, including on the enclosing level's final, test-failing retest | `generateVaryingNest`/`generatePerformFromAST` (`generator/method-gen.js`, WITH TEST BEFORE only - WITH TEST AFTER was already verified correct and left untouched): every level's FROM is now set once, up front, for *all* levels at once; after each level's own increment, every *deeper* level (not just its immediate child) is reset to FROM again, matching cobc's documented step-by-step algorithm exactly | q07 |
| 6 | A qualified **and** subscripted read reference (`X OF A OF B (i)`) dropped the qualifier - `convertIdentifier`'s subscript check ran first and returned immediately with a bare, unqualified name, entirely skipping the qualifiers branch below it (the write path, `renderAssignment`/`targetCamelFor`, already resolved the qualifier correctly) | `convertIdentifier` (`generator/expression-gen.js`) now resolves the qualified base name *first* (reusing the same `lookupQualified` the write path already does), and only then appends the subscript index chain to *that* resolved name | q08 |

Re-run `npm test` after generator changes; the table above will drift as new gaps are
found and fixed - the "how to run" commands are the source of truth, this table is
only a snapshot. See also `tests/round4-fixes.test.js` for focused,
toolchain-independent unit tests of each fix above.

### Round-5 adversarial-refutation findings and their fixes

A round-5 refuter found 6 more root-cause dishonest divergences, concentrated in a
layer no prior round had exercised at all: FILE I/O (`convertToScala()`'s own entry
point never parsed the ENVIRONMENT DIVISION), INITIALIZE (100% non-functional -
`.copy()` on a plain `var` is a guaranteed compile error), and four narrower gaps
(PERFORM ... THRU spanning multiple SECTIONs, DISPLAY of a bare GROUP, ACCEPT FROM
DATE/TIME/DAY/DAY-OF-WEEK, and MOVE from a numeric-edited source into a numeric
target). All 6 are now fixed; every program hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | FILE I/O was end-to-end broken: (a) the package root `index.js`'s own `parseCobol()` (what `convertToScala()` actually calls) never invoked `parseEnvironmentDivision` at all, so FILE-CONTROL/SELECT...ASSIGN info never reached the generator regardless of what the DATA/PROCEDURE DIVISIONs declared; (b) `generateWriteStatement` named its writer after the WRITE statement's *record* name while `generateOpen` named it after the *file* name (the two routinely differ, e.g. `SELECT OUT-FILE` / `FD OUT-FILE. 01 OUT-REC`) - a WRITE referenced a writer variable that was never declared; (c) `OPEN OUTPUT` then a later `OPEN INPUT` of the same file re-declared its `java.io.File`/reader/writer as `val` a second time - "... is already defined as value ..." | (a) `index.js` now calls the (newly exported) `parser/index.js`'s `parseEnvironmentDivision` and carries `environmentDivision` on the AST; `scala-generator.js`'s `getFileControls`/`generateFileConstants`/`hasFileOperations` read it. (b) New `recordToFile`/`fileToRecord` registries (`scala-generator.js`'s `buildRecordFileRegistries`, installed via `expression-gen.js`'s `setRecordFileRegistry`) let `generateWriteStatement`/`generateReadStatement` resolve the FD's own file name from either the record or file name a statement mentions. (c) File handles (`File`/reader/writer/iterator/random-access) are now declared exactly once, as `var`s, at object scope (`file-io-gen.js`'s `generateFileHandleDeclarations`/`fileHandleVarNames`) - `generateOpen`/`generateClose` assign/null-check them instead of redeclaring. LINE SEQUENTIAL WRITE also now strips trailing spaces and READ pads the physical line back to the target's declared width, matching cobc's actual on-disk behavior | s01 |
| 2 | `generatePerformThruMethod` named each nested-def paragraph in a THRU range via plain `toMethodName` - a THRU range spanning multiple SECTIONs (`PERFORM 1000-PARA-A THRU 2000-PARA-B`, with `1000-PARA-A`/`2000-PARA-A` both stripping to the same bare `paraA`) produced two identically-named nested `def`s in the same wrapper method - "paraA is already defined as method paraA" | `generatePerformThruMethod` (`generator/method-gen.js`) now takes the whole program's flattened `units` (name/statements/sectionName) and `ambiguousNames` set and resolves each nested def's name via the same collision-aware `resolveParagraphMethodName` `generateAllMethods`/`generateSectionMethod`/`generateProgramFlowLines` already use; `renderNestedFallthroughDefs`'s doc comment (previously wrong - it claimed a single THRU range was "inherently collision-free") is corrected | s02, s02b |
| 3 | `DISPLAY` of a bare GROUP identifier referenced a flat var that was never declared (`println(wsGroup)` - a group never gets its own elementary `FIELD_REGISTRY` entry, only its children do) - a hard compile error on every such DISPLAY | New `groupDisplayValueExpr` (`generator/expression-gen.js`) concatenates every child's own fixed-width display form (`CobolFmt.fitLeft` for alphanumeric, `CobolFmt.digitsOf` for numeric, recursing into a nested group), matching cobc's raw concatenated-storage DISPLAY exactly; `renderDisplayOperand` falls back to it when a reference has no elementary registry entry. Also fixed along the way (uncovered by the same repro): a numeric-edited item's own VALUE clause is now PICTURE-formatted at declaration time (`scala-generator.js`'s `defaultElementaryValue`), and `DISPLAY ... WITH NO ADVANCING` now actually suppresses the trailing newline (`generateDisplay`) - both were silently ignored before | s06, s06b, s11 |
| 4 | `INITIALIZE` unconditionally emitted `<target> = <target>.copy() // INITIALIZE with defaults` - always a hard compile error, since every WORKING-STORAGE item this generator declares is a flat `var` (Int/String/BigDecimal/Vector), never a case class | New `initializeLeafValueExpr`/`initializeAssignmentLines` (`generator/expression-gen.js`) implement COBOL's real per-category default rules (ALPHABETIC/ALPHANUMERIC -> SPACES, NUMERIC/NUMERIC-EDITED -> ZERO, reusing the same `repeatedCharLiteralFor`/`zeroLiteralFor` helpers MOVE SPACES/MOVE ZERO already use) recursively over a GROUP target's children (via `GROUP_REGISTRY`, honoring OCCURS via a new `occursCounts` field on each flat var's registry info) or a single elementary target; FILLER is left untouched entirely (no addressable identity). `REPLACING <category> BY <value>` - verified against installed GnuCOBOL - only touches a leaf whose CATEGORY matches one of the REPLACING phrases; a leaf whose category ISN'T mentioned is left holding whatever value it already had, not reset to the category default (contrary to what "REPLACING" might suggest on its own) | s07, s07b |
| 5 | `ACCEPT ... FROM DATE/TIME/DAY/DAY-OF-WEEK` always declared a brand-new `val <target> = ...` - a local shadowing binding, never an assignment to the target's actual registered flat var; a numeric target was left holding raw untyped date/time text instead of an actual number | `generateAccept` (`generator/expression-gen.js`) now resolves and assigns through the same `renderAssignment`/field-registry path any other statement uses, with new `coerceAcceptValue` applying the same numeric (`CobolFmt.truncNumeric`)/edited (`CobolFmt.edited`)/alphanumeric (`CobolFmt.fitLeft`/`fitRight`) coercion an ordinary MOVE source would get | s08 |
| 6 | `MOVE` from a numeric-edited source into a numeric target wrapped the source's already-PICTURE-formatted text (e.g. `"  12.50"` for `PIC ZZ9.99`, with zero-suppression spaces) directly in `BigDecimal(...)` - a guaranteed `NumberFormatException` at runtime the moment zero-suppression left any leading space in the stored text | `renderVariableMoveSource` (`generator/expression-gen.js`) routes a numeric-edited source through the existing `CobolFmt.numval` runtime helper (already used for `FUNCTION NUMVAL`'s own space-tolerant parsing) instead of a bare `BigDecimal(...)` call, before applying the usual `CobolFmt.truncNumeric` store-time truncation | s12 |

Re-run `npm test` after generator changes; the table above will drift as new gaps are
found and fixed - the "how to run" commands are the source of truth, this table is
only a snapshot. See also `tests/round5-fixes.test.js` for focused,
toolchain-independent unit tests of each fix above.

### Round-6 adversarial-refutation findings (t01-t12) and their fixes

A round-6 refuter found 6 more root-cause dishonest divergences across 3
programs: `WRITE ... ADVANCING` (parsed but completely ignored by the live
codegen path - a correct-looking handler existed in `file-io-gen.js`'s
`generateWrite`, but that function is dead code, never called from the real
conversion path), a `convertLiteral` text-shape guess that silently discarded
a quoted string literal's own parser-known identity whenever its characters
happened to look like digits (breaking both `FILE STATUS = "10"`-style
comparisons and any runtime helper call expecting a String argument), STRING
`ON OVERFLOW`/`NOT ON OVERFLOW` (parsed but dropped at codegen) together with
an entirely unguarded STRING character-copy loop (a guaranteed
`StringIndexOutOfBoundsException` on overflow, with or without an ON OVERFLOW
clause present), and UNSTRING `ON OVERFLOW`/`NOT ON OVERFLOW` (not parsed at
all - the unconsumed clause corrupted the statement stream, its branch bodies
leaking out as unconditional top-level siblings after the UNSTRING). All 6 are
now fixed; every promoted program hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `WRITE ... AFTER/BEFORE ADVANCING n LINES/PAGE` on a file was silently ignored - the parser captured `statement.advancing` correctly, but the live `generateWriteStatement` (`generator/expression-gen.js`) never read it at all, always emitting a plain `println` regardless of any ADVANCING clause | Compiler-verified against installed GnuCOBOL (t01) that the real model is a deferred-terminator, carriage-control-style one - `AFTER ADVANCING n LINES` emits exactly n newlines THEN the record text (no trailing terminator of its own; the next WRITE's own leading separator, or CLOSE, terminates it), `ADVANCING 0 LINES` emits a bare `\r`, `BEFORE ADVANCING` self-terminates (text first, then its own separator immediately after). New `CobolFmt.advanceSep` runtime helper renders the separator; `ADVANCING_FILES` (built once by `scala-generator.js`'s `collectAdvancingFileNames`, fed to both `expression-gen.js` and `file-io-gen.js`) switches a *whole file's* WRITE/CLOSE codegen to this model only when at least one WRITE for that file uses ADVANCING anywhere (matches cobc's own observed mixed-usage behavior) - every other file's WRITE is the byte-for-byte pre-round-6 `println`, which is what keeps all 93 pre-existing corpus programs unchanged | t01 |
| 2 | `convertLiteral` (`generator/expression-gen.js`) inferred string-vs-numeric from the literal's own *text shape* (`/^-?\d+(\.\d+)?$/`) instead of the parser's own `Literal.literalType` tag - a quoted digit-shaped string literal (`FILE STATUS IS WS-STATUS` compared `= "10"`) rendered as a bare Scala `Int`, a hard type-mismatch against the String-typed field | `convertLiteral` now takes an explicit `literalType` parameter and honors `'string'`/`'numeric'` definitively when supplied, falling back to the old text-shape guess only for the few call sites with no AST node to carry the tag from; every call site that has a `Literal` node in scope (`convertIdentifier`, `safeNodeString`, both `convertArithmeticExpression` Literal branches, `renderLiteralForTarget`'s fallback) now passes it through. MOVE's own literal rendering (`renderLiteralForTarget`) already branched on `literalType` correctly before this fix - only the comparison/general-expression path was broken | t04, t11 |
| 3 | Same root cause as finding 2, different call site: `INSPECT ... REPLACING CHARACTERS BY "0"` passed its quoted replacement literal through the same broken `convertLiteral` path (via `convertArithmeticExpression`), rendering `CobolInspect.replaceCharacters(_reg, 0)` - an Int argument where the runtime helper expects a String | Same fix as finding 2 (single shared root cause) | t11 |
| 3 (companion, found while making t04 hard-pass) | `SELECT ... FILE STATUS IS ws-status` was parsed into `environmentDivision.fileControls[i].status` but never consumed by codegen at all - OPEN/READ/WRITE/CLOSE never assigned that field, so it silently kept its default (typically spaces) forever; worse than a wrong comparison result, a *bare* `READ file-name` with no AT END clause (t04's own idiom, and the single most common real-world reason a program declares FILE STATUS to begin with) has no other way to detect EOF, so the read loop never terminated - a silent, total hang | New `FILE_STATUS_REGISTRY` (file name -> its FILE STATUS field's camelCase var, built once in `scala-generator.js`, fed to both `expression-gen.js` and `file-io-gen.js`) assigns `"00"` after every successful OPEN/WRITE/CLOSE and a successful READ, and `"10"` when a READ's iterator is exhausted - including rewriting the bare-READ-with-no-AT-END branch to actually branch on `.hasNext` instead of silently no-op-ing past EOF. A file with no FILE STATUS clause is completely unaffected (pure addition) | t04 |
| 4 | `STRING ... ON OVERFLOW` / `NOT ON OVERFLOW` were parsed into `statement.onOverflow`/`notOnOverflow` but `generateString` never read either - the branches were silently dropped at codegen, with no compile error and no visible marker | `generateString` (`generator/expression-gen.js`) now tracks an `_overflow` boolean (set whenever a source character can't be stored because the target ran out of room) and emits an `if _overflow then ... else ...` using the statement's own ON OVERFLOW/NOT ON OVERFLOW bodies - only when the statement actually has one of these clauses (a STRING with neither generates the same shape as before, now overflow-safe, with no unused branch) | t12 |
| 5 | The STRING character-copy loop (`_sb.setCharAt(_ptr - 1 + _i, ...)`) had no bounds check against the target's declared width at all - a guaranteed `StringIndexOutOfBoundsException` the instant the combined source segments exceeded the target, regardless of whether an ON OVERFLOW clause was even present | The copy loop now bounds-checks each character position against the target's width before calling `setCharAt`, setting `_overflow = true` (and simply dropping the character, never storing it) instead of throwing - compiler-verified against installed GnuCOBOL (t12) that this matches cobc's own truncate-and-signal behavior exactly (`STRING "HELLO" "WORLD" INTO PIC X(6)` stores `"HELLOW"`, not a crash) | t12 |
| 6 | `UNSTRING ... ON OVERFLOW` / `NOT ON OVERFLOW` were not parsed AT ALL (`parseUnstringStatement` had no handling for either clause) - the unconsumed `ON OVERFLOW ... DISPLAY ... NOT ON OVERFLOW ... DISPLAY ... END-UNSTRING` tokens were left sitting in the stream, so the *next* parse step tried to parse them as fresh, unrelated statements, corrupting the statement stream (the overflow branch's own body leaked out as unconditional top-level siblings) | `parseUnstringStatement` (`parser/procedure-parser.js`) now parses both clauses, mirroring `parseStringStatement`'s identical pattern exactly. Codegen: `CobolUnstring.unstring`'s runtime helper now returns a 4th element, `overflow` (true exactly when the source held more delimited fields than there were INTO targets to receive them - compiler-verified against installed GnuCOBOL, t12, that an *exact* fit - the last field consuming the source right up to its end - is NOT overflow); `generateUnstring` destructures it and emits the same `if _overflow then ... else ...` pattern as STRING's finding 4, only when the statement has one of these clauses | t12 |

Re-run `npm test` after generator changes; the table above will drift as new gaps are
found and fixed - the "how to run" commands are the source of truth, this table is
only a snapshot. See also `tests/round6-fixes.test.js` for focused,
toolchain-independent unit tests of each fix above.

### Round-7 adversarial-refutation findings (u01-u13) and their fixes

A round-7 refuter found 8 more root-cause dishonest divergences, one of them
("MOST DANGEROUS") a truthiness bug capable of silently swallowing an
arbitrary *later* statement, not just mishandling the READ itself. All 8 are
now fixed; every promoted program hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 6 (MOST DANGEROUS) | `ReadStatement.atEnd`/`.notAtEnd` default to `[]` in `parser/ast.js`, and `[] \|\| x` is truthy in JS - `generateReadStatement`'s `if (statement.atEnd \|\| statement.notAtEnd)` (`generator/expression-gen.js`) was therefore *always* true, even for a bare `READ file.` with no AT END clause at all. That routed every bare READ through the if/hasNext/else branch with BOTH branches empty, and because Scala 3 uses significant indentation, the empty `else` had nothing indented under it - the statement lexically following the READ then rendered at the *same* indent as the empty `else` and was silently absorbed as if unconditional | Check `.length > 0` instead of bare truthiness, routing a genuinely bare READ to the pre-existing unconditional-read branch instead; the AT END branch, when it legitimately has no clause of its own (FILE STATUS absent too), now always emits a `()` placeholder rather than relying on a separate, gap-prone condition to decide whether to. Same empty-branch audit applied to `generateIf`: an IF with an empty `thenStatements` array now also always emits `()` | u07 |
| 8 | A SECTION's own leading statements (directly under its header, before the first named paragraph) were silently discarded entirely whenever that section also had at least one named paragraph - `generateSectionMethod`/`flattenProcedureUnits` (`generator/method-gen.js`) only ever looked at `section.paragraphs`, never `section.statements`, once `section.paragraphs` was non-empty | New `sectionLeadingUnit` synthesizes a leading pseudo-paragraph (`<section-name>-SECTION-BODY`) from `section.statements` and prepends it to the section's own fall-through chain (`renderNestedFallthroughSteps`) and to `flattenProcedureUnits`'s whole-program unit list - compiler-verified against installed GnuCOBOL (u13) that `PERFORM <section-name>` runs this leading block first, then falls through into the first named paragraph exactly like any other paragraph boundary (including running that paragraph a *second* time via ordinary fall-through, even after an explicit nested `PERFORM` of it already ran it once - u13's own oracle output: `NAMED-PARA` prints twice) | u12, u13 |
| 1a | `CALL "X" USING BY REFERENCE A, B, C` (comma-separated operands) silently truncated to just the first operand - the USING loop's own continuation condition (`parser/procedure-parser.js`'s `parseCallStatement`) never listed `TokenType.COMMA`, so it exited the instant it saw one, leaving every token from the first comma onward unconsumed and corrupting the rest of the PROCEDURE DIVISION parse (a trailing operand like `WS-SUM.` could even be misdetected as a brand-new paragraph name). The exact same bug existed in a callee's own `PROCEDURE DIVISION USING LK-A, LK-B, LK-C` clause (`parseProcedureDivision`) | Both USING loops now explicitly consume `TokenType.COMMA` (and, for `PROCEDURE DIVISION USING`, an optional `BY REFERENCE`/`BY VALUE`/`BY CONTENT` mode prefix per operand) instead of treating it as an unrecognized terminator | u01 |
| 1b | No same-file multi-PROGRAM-ID support existed at all - `CALL "PROGNAME"` always rendered a bare, undeclared `progname(args)` call, a hard compile error, regardless of whether a sibling `PROGRAM-ID. PROGNAME.` existed in the very same source (u01's own repro shape: cobc compiles and runs this natively) | `index.js`'s new `splitProgramSources` detects >1 `PROGRAM-ID` and splits the source into one segment per program (falls back to the exact pre-round-7 single-program path otherwise - zero behavior change for every existing corpus program); `generator/scala-generator.js`'s new `generateMultiProgramScala` emits one `object` per program (shared preamble/runtime emitted once, via new `opts.skipPreamble`), builds a `CALL_PROGRAM_REGISTRY` (program name -> object/param count) *before* generating any program's methods (so a forward reference - u01's own MAIN-PARA calls ADDER, declared *after* it - still resolves), and gives every program its own `entry(...)` method (new `generateEntryMethod`) that assigns each incoming argument to that program's own LINKAGE SECTION var (LINKAGE SECTION items previously weren't flattened into the field registry/vars at all - `buildFieldRegistry` only ever walked WORKING-STORAGE/FILE SECTION items; new `getLinkageSectionItems` fixes that too), runs the whole PROCEDURE DIVISION, and returns every parameter's final value as a tuple. `generateCall` (`generator/expression-gen.js`) resolves the CALL target against this registry, passes current argument values in, and reassigns each BY REFERENCE (COBOL's default) operand from the returned tuple - the pragmatic "value-in/tuple-out" mapping this generator uses for COBOL's real BY-REFERENCE mutation semantics, since Scala has no pass-by-reference mechanism. Only the *first* program in the file gets `@main def run()`, matching cobc (the primary/first program in a source is the one an `-x` executable runs) | u01 |
| 1c | An unresolvable CALL target (a genuinely external subprogram this source doesn't define, or a dynamic `CALL <data-name>`) still rendered a bare, undeclared call | `generateCall` now emits a visible, still-compiling `() // TODO: CALL "<name>" - external subprogram not available for conversion ...` marker instead whenever the target isn't in `CALL_PROGRAM_REGISTRY` - see "Known gaps" below | none - documented gap, not promoted |
| 2 | `DISPLAY` of a COMP-1/COMP-2 (Float/Double) field rendered empty/wrong - these have no PIC clause at all, so `integerDigits`/`decimalDigits` were always 0/0, and `CobolFmt.num` (built entirely around PIC digit counts) produced an all-zero-width, effectively empty numeric string | New `CobolFmt.floatDisplay` runtime helper (`generator/expression-gen.js`) renders the field's own `.toString` (Float/Double's own shortest round-tripping decimal text - compiler-verified to already match cobc's own rendering for every value checked, e.g. `3.5`/`2.25`) with a trailing `.0` stripped (cobc renders a whole float value with no decimal point at all, e.g. `7.0` -> `"7"`, not Scala's default `"7.0"`); `renderDisplayOperand` routes a Float/Double-typed field through it instead of `CobolFmt.num` | u02, u02b |
| 3 | A COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE storing into a COMP-1/COMP-2 target left the bare BigDecimal-valued result expression unconverted (`storeNumericByInfo`'s digit-truncation logic only recognized `Int`/`Long`/`BigDecimal` targets) - a hard "Found: BigDecimal, Required: Float/Double" compile error | `storeNumericByInfo` now casts with `.toFloat`/`.toDouble` for a Float/Double target, bypassing the PIC-digit-count truncation entirely (COMP-1/COMP-2 are genuine binary floating point with no COBOL-defined digit-truncation semantics of their own) | u02 |
| 4 | A COMP-3 (BigDecimal-typed) variable used as a table subscript (e.g. a `PERFORM VARYING` control variable declared `COMP-3`) produced `vector.updated(wsI - 1, ...)` - a `BigDecimal`-valued index, which `Vector.apply`/`.updated` (both requiring a plain `Int`) reject outright at compile time | `subscriptIndexExpr` (`generator/expression-gen.js`) now appends `.toInt` at every non-literal subscript-rendering branch (read, `.updated` write, multi-dimensional) - a no-op for the common case where the subscript is already a plain Scala `Int` (`Int#toInt` returns itself), so this is a pure addition with no behavior change for any pre-existing corpus program | u04 |
| 5 | SPECIAL-NAMES' `DECIMAL-POINT IS COMMA` clause was not parsed at all, so (a) a comma-decimal VALUE literal (`VALUE 123,45`) parsed as *two* separate comma-separated values instead of one `123.45`, and (b) DISPLAY/numeric-edited PICTURE formatting always rendered a period as the decimal point regardless of this clause | `parser/index.js`'s `parseEnvironmentDivision` now detects the clause (`environmentDivision.decimalPointIsComma`); `parseValueClause`'s (`parser/data-division-parser.js`) new `ctx.decimalPointIsComma`-gated `readNumericLiteral` combines an adjacent `NUMERIC_LITERAL COMMA NUMERIC_LITERAL` into one comma-decimal value; `generator/expression-gen.js`'s `CobolFmt.num`/`CobolFmt.edited` runtime helpers and the JS-side `formatEditedPicture` (compile-time literal folding) all gained a `decimalComma`/`decimalPointIsComma` parameter (threaded from `scala-generator.js`'s new `setDecimalPointIsComma`, called once per program from the parsed `environmentDivision`) that swaps the rendered decimal-point character from `.` to `,` - and, for an edited PICTURE, swaps *which* literal character (`,` vs `.`) marks the pattern's own decimal-point position, matching COBOL's documented role-swap exactly (`PIC ZZ9,99` under this clause means what `PIC ZZ9.99` means by default) | u03b |
| 7 | `MOVE GROUP-ITEM TO elementary-field` referenced the group's own bare (nonexistent) identifier (`wsGroup = ...`) - a group never gets a flat Scala var of its own, only its children do - a hard "not found" compile error | `renderVariableMoveSource` (`generator/expression-gen.js`) now detects a source with no `FIELD_REGISTRY` entry that resolves to a known group (via the same `GROUP_REGISTRY`/`resolveGroupKey` DISPLAY-of-a-bare-group already uses - round-5 finding 3's `groupDisplayValueExpr`) and routes it through that same raw-storage concatenation instead, letting the existing alphanumeric-target fit/truncate/pad logic downstream apply unchanged | u11, u11b |

Re-run `npm test` after generator changes; the table above will drift as new gaps are
found and fixed - the "how to run" commands are the source of truth, this table is
only a snapshot. See also `tests/round7-fixes.test.js` for focused,
toolchain-independent unit tests of each fix above.

### Round-8 adversarial-refutation findings (v01-v12) and their fixes

A round-8 refuter found 4 more root-cause dishonest divergences, all in CALL
BY REFERENCE marshalling of a GROUP item, `FUNCTION NUMVAL` under
SPECIAL-NAMES' `DECIMAL-POINT IS COMMA`, unequal-width alphanumeric relational
comparison, and group-level VALUE-clause inheritance. All 4 are now fixed;
every promoted program hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `CALL ... USING BY REFERENCE` of a GROUP item generated a reference to a nonexistent flat Scala var on both the caller and callee side (a group has no flat var of its own - only its children do) | New `groupDisplayValueExpr`/`scatterGroupFromString` (`generator/expression-gen.js`) marshal a group operand as its own concatenated raw-storage text across the CALL boundary in both directions (caller argument, callee `entry(...)` parameter and return value) | v02 |
| 2 | `FUNCTION NUMVAL` under SPECIAL-NAMES' `DECIMAL-POINT IS COMMA` crashed - `CobolFmt.numval` had no `decimalComma` parameter at all (unlike its `num`/`edited` siblings, which already had one) | `CobolFmt.numval` gains a `decimalComma` parameter, threaded through the same way `num`/`edited` already are | v05, v05c |
| 3 | An unequal-width alphanumeric relational comparison (`IF WS-SHORT = WS-LONG` with different declared PIC X widths) did a bare Scala `==`/`.compareTo` with no space-padding - COBOL always right-pads the shorter operand to the longer's declared width before comparing | `renderRelationalCondition`'s string-vs-string branch computes each operand's own compile-time-known width (`stringOperandWidth`) and splices literal space-padding onto the shorter side | v08 |
| 4 | A group-level VALUE clause (`01 WS-REC VALUE "AB1234". 05 WS-CODE PIC X(2). 05 WS-NUM PIC 9(4).`) never propagated down to a VALUE-less child - every such child silently defaulted to zero/blank instead of its own positional slice of the ancestor's literal | New `ownValueStorageText`/`defaultElementaryValueWithInheritance` (`generator/scala-generator.js`) compute each VALUE-less descendant's own byte-offset slice of the nearest VALUE-bearing ancestor's storage text, recursively through nested groups | v10 |

All 12 round-8 probes (`v01`-`v12`, including the `v05b`/`v05c` bisections)
were promoted; 9 of the 12 already passed unmodified before this round's
fixes (`v01` CALL-loop static semantics, `v03` BY CONTENT isolation, `v04`
3-level nested CALL chains, `v06` INSPECT per-operand BEFORE/AFTER scoping,
`v07` 3-deep `PERFORM VARYING ... AFTER`, `v09` `MOVE ALL` onto an OCCURS
elementary, `v11` an intrinsic FUNCTION used directly as a condition, `v12`
cross-CALL file I/O, and `v05b` decimal-comma with only an edited MOVE
target) - these lock in existing behavior as regression guards, not new
fixes. See `tests/round8-fixes.test.js` for focused, toolchain-independent
unit tests of the 4 fixes above.

### Round-9 adversarial-refutation findings (w01-w14) and their fixes

A round-9 refuter found 6 more root-cause dishonest divergences. All 6 are
now fixed; every promoted program hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `EVALUATE <subject> WHEN <value>` (the VALUE-clause WHEN test, `evaluateConditionExpr`'s default case) rendered a bare `(subjectExpr) == (valueExpr)` with no space-padding - unlike an ordinary IF/relational comparison (round-8 finding 3), which already pads the shorter of two unequal-width alphanumeric operands | Round-8 finding 3's operand-classification/padding core was factored out of `renderRelationalCondition` into a shared `renderComparisonExpr(subjectNode, objectNode, rawOp)` (`generator/expression-gen.js`); `evaluateConditionExpr`'s VALUE case now calls it too (a TRUE/FALSE pseudo-subject, which has no real "subject node" to classify, still falls back to the old rendering - the only shape this doesn't cover) | w01 |
| 2 | `CALL ... USING BY REFERENCE` of a GROUP with a *signed* COMP-3 (or other signed numeric) child silently dropped its sign crossing the CALL boundary - the round-8 finding-1 marshalling channel (`groupDisplayValueExpr`/`scatterGroupFromString`) reused `CobolFmt.digitsOf`'s own *unsigned* digit text (correct for an ordinary MOVE-numeric-to-alphanumeric, where COBOL really does drop the sign, but not for this internal round-trip channel, where the sign is real data) | A signed numeric child's marshalled text now carries a one-character `'+'`/`'-'` sign marker ahead of its unsigned digit text (`groupDisplayValueExpr`), and the scatter direction (`scatterGroupFromString`) consumes that marker and negates the parsed magnitude when it reads `'-'` - both updated symmetrically; an unsigned child is completely unaffected (same text/width as before) | w02 |
| 3 | A group-level VALUE clause laid across a **non-DISPLAY** (COMP-3/BINARY) child sliced the child's byte span as if it held plain ASCII digit text (the DISPLAY-numeric assumption `defaultElementaryValueWithInheritance` otherwise makes) - compiler-verified against installed GnuCOBOL that cobc instead byte-reinterprets that same span as the child's own actual storage format (packed-decimal nibbles for COMP-3), producing a different, but fully deterministic, digit sequence (`VALUE "AB1234CD"` under a `PIC 9(4) COMP-3` child displays `1323`, not the naive `0123`) | New `nonDisplayInheritedNumericText` (`generator/scala-generator.js`) reuses the already-tested `codecs.js` `packedDecode`/`binaryDecode` (the same decoders this generator relies on for real COMP-3/BINARY file-record storage elsewhere) to reinterpret the inherited byte slice, then truncates to the child's own low-order declared digit count (packed-decimal's own leading-pad-nibble math guarantees the true digits are always the *last* N characters of the raw decoded digit string). **Route taken: matched cobc's actual byte-reinterpretation** (not the documented-TODO fallback) - it reproduced exactly, reusing existing tested codec functions, so no `???` marker was needed. COMP-3 is oracle-verified (w03); COMP/COMP-4/COMP-5/BINARY reuses the identical truncation principle for consistency but has no corpus program exercising a binary child under a group VALUE clause - flagged below under "Known gaps" | w03 |
| 4 | `MOVE WS-ROW(1) TO WS-ROW(3)` (a whole-row MOVE of a *subscripted* GROUP-with-OCCURS reference) hit neither the bare-group MOVE path (`groupRefNameUpper` requires zero subscripts) nor the elementary-MOVE fallback (WS-ROW itself has no flat Scala var - only its children do) - a hard "Not found: wsRow" compile error | New `subscriptedGroupRowRef`/`generateSubscriptedGroupMove`/`subscriptedGroupMoveChildLines` (`generator/expression-gen.js`) detect a subscripted reference to the same registered OCCURS-group on both sides of a MOVE and compose each child's own `.updated(targetIdx, <child>(sourceIdx))` read/write, reusing `GROUP_REGISTRY` (recursing into a nested-group child); bails out to a visible `???` marker for a shape it can't represent this way (a nested-OCCURS-within-the-row child, or more than one subscript dimension) rather than emitting a wrong/non-compiling copy | w05 |
| 5 | A **backward** `PERFORM x THRU y` range (`y` declared *before* `x` in program order, e.g. `PERFORM PARA-C THRU PARA-A` when PARA-A comes first) silently generated an empty no-op wrapper - the range-collection loop's own `if (u.name === toParagraph) break` fired on `toParagraph` before `fromParagraph` was ever reached at all, since for a backward range that happens first in program order | `generatePerformThruMethod` (`generator/method-gen.js`) now explicitly detects `endIndex < startIndex` (both paragraphs' positions in the whole-program unit list) and, compiler-verified against installed GnuCOBOL (w10), matches cobc's actual behavior: run the start paragraph (plus whatever naturally falls through after it, reusing the existing `renderNestedFallthroughDefs` machinery, now over every unit through the true end of the program rather than stopping at `toParagraph`), then terminate (`sys.exit(0)`) instead of ever returning to the PERFORM's own caller - matching cobc's own "falls off the end of the PROCEDURE DIVISION" (implicit STOP RUN) semantics. The general "falls through past the start paragraph" tail is not independently oracle-verified beyond w10 (whose start paragraph happens to be the program's own last unit) - see "Known gaps" | w10 |
| 6 | `DIVIDE ... GIVING q REMAINDER r` computed `r` via BigDecimal's own `%` operator - which effectively uses an *integer*-floor quotient (`floor(7.5/2.0) = 3`, remainder `1.5`) instead of COBOL's own decimal-digit-truncated quotient (`3.75`, remainder `0`) - wrong whenever `q`'s own declared decimal digits are wide enough that no truncation actually occurs | New `storedQuotientBDExpr` (`generator/expression-gen.js`) computes the exact same ROUNDED-or-truncated-to-declared-digits BigDecimal value `q` is itself stored with (reusing `storeNumericByInfo`'s own formula, minus its final Int/Long/Float/Double/edited-string coercion); REMAINDER is now `dividend - (storedQuotient * divisor)`, using that value | w11 |

All 12 valid round-9 probes (`w01`-`w08`, `w10`, `w11`, `w13`, `w14`) were
promoted; the 6 survivors (`w04`, `w06`, `w07`, `w08`, `w13`, `w14`) already
passed unmodified before this round's fixes (`w04` SET index arithmetic,
`w06` INSPECT CONVERTING with overlapping FROM/TO alphabets, `w07` STRING
with multiple different delimiters, `w08` MOVE into a JUSTIFIED RIGHT field
with truncation, `w13` MULTIPLY/DIVIDE ROUNDED, `w14` exponentiation with a
zero/negative exponent) - these lock in existing behavior as regression
guards, not new fixes. `w09` (a 3-level REDEFINES chain) and `w12`
(an 88-level condition name used directly as an `EVALUATE WHEN` operand
under a non-TRUE/FALSE subject) are both rejected by cobc itself (compile
errors, not runtime divergences) and were deliberately **not promoted** -
same reasoning as every other cobc-rejected repro this refutation process
has found: a program real COBOL itself refuses to compile is not a
meaningful oracle comparison target. See `tests/round9-fixes.test.js` for
focused, toolchain-independent unit tests of all 6 fixes above.

### Round-10 adversarial-refutation findings (x01-x12) and their fixes

A round-10 refuter found 6 more root-cause dishonest divergences: DECLARATIVES/
`USE AFTER STANDARD ERROR PROCEDURE` had ZERO parser handling at all (the
whole block silently ran unconditionally at program start), an OPEN failure
crashed with a raw Java exception instead of setting FILE STATUS, WRITE and
READ used two flatly incompatible byte models for the same non-DISPLAY
(COMP-3/binary) record shape, WRITE of an `OCCURS ... DEPENDING ON` record
referenced a nonexistent bare variable, ADD/SUBTRACT CORRESPONDING never
consumed their own trailing ROUNDED clause, and multi-target COMPUTE's own
target-collection loop had an inverted `break` that silently discarded every
target after the first. All 6 are now fixed; every promoted program
hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `DECLARATIVES ... END DECLARATIVES` (a `USE AFTER [STANDARD] ERROR PROCEDURE ON <file-name\|INPUT\|OUTPUT\|I-O\|EXTEND>` handler section) had no parser support whatsoever - the whole block, including its own mandatory `USE` statement, was absorbed by the ordinary section/paragraph loop, so its body ran unconditionally at program start (before the program's real first paragraph), not only on a file-operation failure | New `parseDeclaratives`/`parseUseStatement` (`parser/procedure-parser.js`) run as a dedicated pre-pass immediately after `PROCEDURE DIVISION`'s own USING/RETURNING clause (exactly where the grammar requires DECLARATIVES to appear), collecting every DECLARATIVES SECTION into a new `division.declaratives` array - deliberately kept OUT of `division.sections`/`division.paragraphs`, so `method-gen.js`'s fall-through flattening never sees them at all. `scala-generator.js`'s new `generateDeclarativeSupport` compiles each one into an ordinary (but never-unconditionally-called) method plus two lookup registries (file name -> handler, mode -> handler) that `file-io-gen.js`'s `generateOpen` and `expression-gen.js`'s `generateReadStatement` consult (see finding 2) to invoke the right handler on a real file-operation failure, then fall through to the statement after the failing one - exactly cobc's own observed behavior (x01: the handler's own DISPLAY fires with the freshly-set FILE STATUS, then the program continues normally). Scope is deliberately pragmatic: only `ON <file-name>` and `ON INPUT/OUTPUT/I-O/EXTEND` targets are wired to anything; any other `USE` form (`USE FOR DEBUGGING`, ...) still parses and compiles (an honest `// unsupported USE form` comment marks it) but is never invoked - see "Known gaps" | x01 |
| 2 | An OPEN failure (missing file, bad path, ...) surfaced as a raw, uncaught `java.io.FileNotFoundException`/`IOException` - a hard runtime crash, with no FILE STATUS mapping at all, compiler-verified wrong against installed GnuCOBOL (cobc itself just sets FILE STATUS and keeps running) | `generateOpen` (`generator/file-io-gen.js`) now wraps every java.io-touching OPEN mode (INPUT/OUTPUT/I-O/EXTEND; the unrecognized-mode fallback never touches java.io, so it's untouched) in `try`/`catch`: `FileNotFoundException` -> FILE STATUS `"35"`, any other `IOException` -> `"30"` - matching cobc's own observed default (x02: `OPEN INPUT` of a nonexistent file -> `"35"`, program continues). A registered DECLARATIVES handler (finding 1) for this file/mode fires right after the status is set; with neither a FILE STATUS field nor a handler registered, the catch body is a harmless `()` (matches cobc's default of silently continuing past a failed OPEN with no other visible effect). The bare-READ-at-EOF path (the FILE-STATUS-driven READ branch) got the same handler-invocation hook | x01, x02 |
| 3 | WRITE and READ of the SAME non-DISPLAY (COMP-3/binary) record used two flatly incompatible byte models: WRITE rendered the field's *display-text* unsigned digit representation (`groupDisplayValueExpr`), but READ decoded the physical bytes as real packed-decimal/binary via the record's own generated case-class `parse()` - a WRITE-then-READ round trip was guaranteed to crash (`packedDecode: non-digit nibble ... encountered`) or silently corrupt data, never actually reproducing cobc's own on-disk format | **Write-path model decision: the record's on-disk bytes (CobolCodecs encoding, via the record's own generated case-class `format()`) are the single true byte-level format** - new `writeRecordPlan`/`groupContainsNonDisplay`/`groupChildConstructorExpr` (`generator/expression-gen.js`) route a WRITE of any record containing at least one non-DISPLAY child through `format()`, written as raw bytes (an ISO-8859-1 identity-mapped string, never display text) - the exact same bytes READ's `parse()` already (correctly) decodes, and byte-for-byte what cobc itself writes (x03 verified: cobc's `23 45 67 8c 41 41 41 41` for `+23456.78 "AAAA"` reproduced exactly). A pure-DISPLAY record is completely unaffected - still the original `println(...).stripTrailing()` text path, which is what s01/t01-t06/u12 and every other existing file-I/O corpus program depends on (all re-verified green). Companion fix: the file reader (`Source.fromFile`) and writer (`PrintWriter`) now use an explicit ISO-8859-1 (Latin-1) charset - a lossless 1:1 byte<->char identity mapping - instead of the JVM's platform default (UTF-8), which silently mangles any byte >= 0x80 that a packed/binary field routinely produces; a pure no-op for every existing plain-ASCII record | x03 |
| 4 | WRITE of a record containing an `OCCURS ... DEPENDING ON` (ODO) child fell straight through `groupDisplayValueExpr`'s unconditional OCCURS-child bail-out (`return null`) to a nonexistent bare variable reference - a hard compile error | New `odoDisplayValueExpr` (`generator/expression-gen.js`) - used only by the WRITE path (`writeRecordPlan`), so DISPLAY-of-a-group behavior is untouched - contributes exactly `<counter>`-many elements' worth of digit text for a DISPLAY-only ODO child, where `<counter>` is the table's LIVE runtime value (not the fixed max occurrence count `case-class-gen.js`'s own `parse()`/`format()` are pinned to); `scala-generator.js`'s `tableRegistry` now also records the ODO counter field's own camelCase name (`dependingOn`) for this lookup. Verified byte-exact against cobc (x04: `MOVE 2 TO OUT-COUNT` -> both sides write the identical 9-byte file `02111222\n`, not the fixed-max-5-element record). A non-DISPLAY (packed/binary) ODO child would combine with finding 3's byte-level path, which conservatively bails to a visible `() // TODO` marker instead of guessing at a wrong layout - see "Known gaps" | x04 |
| 5 | `ADD/SUBTRACT CORRESPONDING group-1 TO/FROM group-2 ROUNDED` never consumed its own trailing `ROUNDED` at all - the parser returned immediately after building the statement, leaving the unconsumed `ROUNDED` token to leak out as a bogus separate `UnknownStatement`, and `generateAddCorresponding`/`generateSubtractCorresponding` always hardcoded `false` for the rounded flag regardless | `parseAddStatement`/`parseSubtractStatement`'s CORRESPONDING branches (`parser/procedure-parser.js`) now check for a trailing `ROUNDED` before returning, setting `statement.rounded`; `generateAddCorresponding`/`generateSubtractCorresponding` (`generator/expression-gen.js`) pass `!!statement.rounded` into the same `storeNumericByInfo` ROUNDED-or-truncated store-time path every other arithmetic statement already uses (x05 verified: `0.06` into a `V9` target rounds to `000.1`, not truncates to `000.0`) | x05 |
| 6 | `COMPUTE A B C = expr` (multiple targets) silently collapsed to just the FIRST target - `parseComputeStatement`'s target-collection loop had a stray inverted `if (!ctx.check(OP_EQUAL)) break;` that fired the instant it saw the SECOND target's own name (itself an IDENTIFIER, not `=`), immediately aborting the loop | Removed the inverted break entirely (the loop's own `while (ctx.check(IDENTIFIER))` condition alone already stops correctly at `=`) - `parser/procedure-parser.js`. Each target's own optional trailing `ROUNDED` is now stashed directly on that target's own `VariableReference` node (`target.rounded`), so `COMPUTE A B ROUNDED C = expr` rounds only B; `generateCompute` (`generator/expression-gen.js`) stores each target through `storeNumericExpr` using ITS OWN per-target flag, not a shared statement-level one (x06 verified: `A=022.05 B=022 C=022.1` - A truncated, C rounded, matching cobc exactly) | x06 |

All 12 round-10 probes (`x01`-`x12`) were promoted; the 6 survivors
(`x07`-`x12`) already passed unmodified before this round's fixes - `x07`
SIGN IS LEADING SEPARATE marshalling across a CALL BY REFERENCE boundary,
`x08` a backward `PERFORM ... THRU` range whose start paragraph is NOT the
program's last unit (the probe that resolves round-9 finding 5's own noted
uncertainty - see "Known gaps" below), `x09` DIVIDE ... GIVING REMAINDER
with negative and mixed-sign, differently-scaled operands, `x10` EVALUATE
against figurative SPACES on both the subject and the WHEN side, `x11`
OCCURS ... DEPENDING ON driven at the PROCEDURE DIVISION level (a live,
mid-loop-mutated counter growing the loop bound, plus a shrink-then-read-
beyond-the-new-count probe), and `x12` a triple-nested inline `PERFORM
VARYING` where only the innermost loop's own `EXIT PERFORM` unwinds, plus
`CONTINUE` as the sole statement of both an IF's THEN and ELSE branches -
these lock in existing behavior as regression guards, not new fixes. See
`tests/round10-fixes.test.js` for focused, toolchain-independent unit tests
of all 6 fixes above.

### Round-11 adversarial-refutation findings (y01-y17) and their fixes

A round-11 refuter found 3 more root-cause dishonest divergences, each
precisely isolated to a minimal repro before the fix: DISPLAY of a GROUP
containing an OCCURS child (fixed-size OR `... DEPENDING ON`) referenced a
nonexistent bare Scala identifier, `SEARCH ALL` against a table declared
with a MULTI-field composite key silently discarded every key past the
first (a wrong-*match* bug, not just an incompleteness), and `INITIALIZE` of
a subscripted table element ignored the subscript entirely and wiped the
WHOLE table. All 3 are now fixed; every promoted program hard-passes
`oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `DISPLAY` of a GROUP containing an OCCURS child fell through every branch of `renderDisplayOperand` to a bare `expr` at the bottom - a reference to a nonexistent Scala identifier (a group has no flat var of its own). Round-10 had already built `odoDisplayValueExpr` for exactly this table-aware raw-storage concatenation, but wired it ONLY into `writeRecordPlan` (the WRITE path); `renderDisplayOperand` (the DISPLAY path) still only tried `groupDisplayValueExpr`, which unconditionally bails (`null`) the instant ANY OCCURS child is present, fixed-size or ODO alike | `odoDisplayValueExpr` (`generator/expression-gen.js`) is extended to also handle a FIXED-size OCCURS child (not just `DEPENDING ON` - the count expression is now `tableInfo.dependingOn ? "(<counter>).toInt" : "<literal times>"`), and `renderDisplayOperand` now tries it FIRST, before `groupDisplayValueExpr` - every other `groupDisplayValueExpr` caller (READ's group-mode fallback text, the CALL BY REFERENCE group-marshalling convention) is untouched. Verified byte-exact against cobc's own y11b oracle: `GROUP=[3123]` for a 3-element ODO table (a 1-digit counter holding 3, elements 1/2/3) | y11b |
| 2 | `SEARCH ALL` against a table declared `ASCENDING KEY IS WS-K1 WS-K2` (a genuine multi-field composite key) drove the binary search off WS-K1 ALONE - `findKeyEquality` only ever extracted the FIRST key's equality test out of the WHEN's AND-chain, silently discarding every conjunct past it. This was a wrong-**match** bug: a WHEN testing `WS-K1(x) = 20 AND WS-K2(x) = 9` (no such row exists in the table) matched purely on `WS-K1 = 20` and returned whichever of the several same-K1 rows binary search happened to land on - a fabricated match where cobc reports "not found" | New `flattenAndChain`/`extractKeyPrefix` (`generator/expression-gen.js`) extract the full ordered PREFIX of the table's declared composite key that has an equality conjunct in the WHEN (stopping at the first declared key with none - a legitimate "search on a leading prefix" COBOL usage), driving a genuine composite-key binary search (`compositeShouldNarrowLowerExpr` - the direct multi-key generalization of the pre-existing single-key ternary, tuple-comparing in declared key order); any residual conjunct (an un-prefixed trailing key, or an ordinary non-key test) is re-verified at the narrowed candidate index before declaring a match - a composite-key match can only occur at ONE table position, so a residual failure there is force-terminated as "not found," not "keep narrowing." A WHEN with no equality on even the table's FIRST declared key still falls back to the pre-existing, honestly-noted linear scan. Verified against cobc's own y12 oracle: `FOUND1=DDD` (the true match), `FOUND2=AAA` (a valid one-key-prefix search), `FOUND3=NONE` (the fabricated-match case above, now correctly "not found") | y12 |
| 3 | `INITIALIZE` of a SUBSCRIPTED table element (`INITIALIZE WS-ENTRY(WS-I)`) completely ignored the target's own subscript - `generateInitialize`/`initializeAssignmentLines` always emitted a bare `<child camel> = Vector.fill(<full count>)(...)` for every leaf, wiping EVERY row of the table exactly as if the INITIALIZE had named the bare (unsubscripted) table name | The target's own subscript list is now threaded through both the group-recursion path (`initializeAssignmentLines`) and the direct-elementary-OCCURS path (`generateInitialize`), rebuilding only the indexed row/element via the same subscripted-MOVE-target `.updated(idx, value)` convention (`renderAssignment`) any other subscripted write already uses - never a fresh whole-table `Vector.fill`. `wrapInitializeOccurs` gained a `skipDims` parameter so a *further* nested OCCURS dimension inside a partially-subscripted multi-dimensional target still gets its own remaining structure reset via `Vector.fill`, not a bare scalar. Verified against cobc's own y17 oracle: `INITIALIZE WS-ENTRY(2)` resets only row 2 (`E2=      /0000`), leaving rows 1 and 3 (`E1=AAAAAA/0111`, `E3=CCCCCC/0333`) completely untouched | y17 |

16 valid round-11 probes were promoted (3 fixed divergers - `y11b`, `y12`,
`y17` - plus 13 survivors that already passed unmodified before this
round's fixes, locking in existing behavior as regression guards: `y01`
DECLARATIVES two-file mode-form, `y02` a DECLARATIVES handler that itself
performs a file operation, `y03` a retry-after-OPEN-failure-succeeds path,
`y04` a COMP (binary) file WRITE/READ round trip, `y05` a SIGN IS LEADING
SEPARATE file WRITE/READ round trip, `y06` trailing-space byte-path
preservation on a mixed record, `y07` READ INTO landing in the SECOND
record of a file, `y08` a COMPUTE with mixed ROUNDED/unrounded subscripted
targets, `y10` SUBTRACT CORRESPONDING ROUNDED recursing into a NESTED group
while also skipping non-corresponding sibling fields (partial-and-nested
CORRESPONDING in one program), `y13` SORT with an INPUT PROCEDURE spanning
multiple SECTIONs, `y14` EVALUATE TRUE ALSO a numeric subject with 88-level
condition-name WHEN operands (including `ALSO ANY`), `y15` a compound
(AND-of-two-88s) PERFORM UNTIL condition, and `y16` a recursive (nested-
group) MOVE CORRESPONDING).

4 probes were deliberately **not promoted**:

- `y09` (`ADD CORRESPONDING` between two flat groups with a partial
  field-name overlap) - not a new fix or a distinct capability from what
  `r13-addcorresponding-nested.cbl` (round-4) already locks in end-to-end
  (partial overlap AND nested-group recursion, for the same `ADD
  CORRESPONDING` verb); kept out of the promoted set as redundant with
  existing coverage rather than double-counted.
- `y11` (`OUT-COUNT`/`OUT-ELEM` WRITE-then-DISPLAY across three WRITEs, the
  last of which SHRINKS the live `OCCURS ... DEPENDING ON` counter after
  previously extending it) - the "UB fall-through probe": COBOL's own
  standard does not mandate what happens to storage beyond the *current*
  `DEPENDING ON` count once it has shrunk (there is no requirement that a
  compiler clear or preserve those bytes) - this generator's Vector-based
  storage model happens to retain the original values (and happens to
  match this installed GnuCOBOL's own behavior for this exact repro), but
  that agreement is a property of two SPECIFIC implementations, not a
  portable COBOL guarantee an oracle-based regression suite should
  permanently pin down. Its well-defined half (a single ODO WRITE) is
  already covered by round-10's `x04-odo-record-write.cbl`.
- `y11probe` and `y18` are both rejected by cobc itself at COMPILE time
  (`y11probe`: a second `OCCURS ... DEPENDING ON` field in the same record
  - "`WS-TAB1` cannot have OCCURS DEPENDING because of `WS-CNT2`";
  `y18`: a numeric-edited item (`PIC ZZ,ZZ9.99`) used directly as a
  `COMPUTE` arithmetic operand - "`'WS-EDITED' is not a numeric value`") -
  same reasoning as every other cobc-rejected repro this refutation
  process has found: a program real COBOL itself refuses to compile is not
  a meaningful oracle comparison target.

See `tests/round11-fixes.test.js` for focused, toolchain-independent unit
tests of all 3 fixes above.

### Round-12 adversarial-refutation findings (z01-z15) and their fixes

A round-12 refuter found 4 more root-cause dishonest divergences - one of
them (finding 1) a **severe, crash-class** bug (an infinite parser loop, not
merely wrong output), the other three silent wrong-output/corruption bugs -
plus one bonus fix promoted from the "honest" column (an explicit `PERFORM
... OF/IN <section>` qualifier wasn't even consumed by the parser). All 4
findings plus the bonus fix are now fixed; every promoted program
hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | An 88-level's `WHEN SET TO FALSE IS <literal>` clause (the standard COBOL-2002+ grammar for a condition-name's false value) hung `parseLevel88`'s VALUE-clause loop in an INFINITE LOOP: none of the loop's branches recognize the `WHEN`/`SET`/`TO` tokens, and its own continuation condition kept looping on any non-PERIOD/non-EOF token regardless of whether anything was actually consumed that iteration - a hang, not a wrong-output bug, and the most severe class of finding this refutation process has found to date | `parser/data-division-parser.js`'s `parseLevel88` now (a) breaks out of the VALUE loop the instant an iteration recognizes no value token at all (a forced-progress guard - the loop's own continuation condition can no longer spin without an accompanying consumed token), (b) actually parses `WHEN SET TO FALSE IS <literal>` into `condition.falseValue` (normalized to the same `{ type, value }` shape `condition.values` entries use), and (c) `generateSet`'s new `level88FalseValueAssignment` (`generator/expression-gen.js`, mirroring the pre-existing `level88FirstValueAssignment` for `SET ... TO TRUE`) assigns the parent field that literal - not the Scala boolean `false`, which was never valid for a COBOL data item either. A parser-wide audit for the same "loop condition doesn't require progress" anti-pattern (grepping every `while`/`do...while` in `parser/`) found no other instance - every other loop either requires forward progress in its own continuation test, or has an unconditional fallback `ctx.advance()`/`break` in its body. Verified against installed GnuCOBOL (z11): `INITIAL=P`, `AFTER-TRUE=A`, `AFTER-FALSE=P` | z11 |
| 2 | Multi-key `SEARCH ALL` whose WHEN clause skips a middle declared key (`WS-K1(x) = 10 AND WS-K3(x) = 9` against `ASCENDING KEY WS-K1 WS-K2 WS-K3` - a legal COBOL "search on key K1, re-verify K3" shape) force-terminated as "not found" the instant the binary search's own midpoint landed on a K1-tied row that failed the residual (K3) conjunct - round-11 finding 2's "a composite-key match can only occur at ONE table position" assumption is only true when the *extracted* prefix key is the table's FULL declared key; here it is a strict prefix (K2 has no equality conjunct), so multiple rows legitimately tie on it and a residual failure at the FIRST one landed on does not mean no OTHER tied row matches | `generateSearchAll` (`generator/expression-gen.js`) now, on a residual-conjunct failure at the landed index, scans outward to find the full contiguous tied range (every row sharing the same extracted-prefix key value), then linearly rescans that range for a row satisfying every conjunct (prefix equality AND residual) before force-terminating the outer binary search as "not found" - only once the WHOLE tied range is exhausted with no match. Verified against installed GnuCOBOL (z13): `SKIPMID=CCC` (row 3, `K1=10,K2=2,K3=9`) even though the binary search's own midpoint lands on row 2 (`K1=10,K2=2,K3=5`) first | z13 |
| 3 | `CALL ... USING` with FEWER operands than the callee's own LINKAGE SECTION/`PROCEDURE DIVISION USING` declares (legal COBOL - an un-passed trailing LINKAGE item is simply not addressable, not a compile error) required exact Scala method arity (`generateEntryMethod`'s `entry(_arg0: T0, _arg1: T1, ...)` had no default values), so the CALL site's shorter argument list was a hard "missing argument" Scala compile error | `generateEntryMethod` (`generator/scala-generator.js`) now gives every LINKAGE parameter a default value - its type's own zero/spaces default (new `defaultZeroValueForScalaType`, `generator/expression-gen.js`) - and `generateCall` (same file) never pads its own argument list out to the callee's full declared arity; it passes exactly as many arguments as the CALL statement supplied, relying on Scala's own default-parameter mechanism for the (always-trailing) rest. Verified against installed GnuCOBOL (z14): `AFTER A=0011` (the callee's own un-passed `LK-B` is simply never touched, matching cobc) | z14 |
| 4 | `CALL ... USING ... OMITTED ...` (a positional operand explicitly not supplied) wasn't even recognized by `parseCallStatement`'s USING loop condition (`OMITTED` is its own dedicated token type, not `IDENTIFIER`) - the loop silently exited the instant it saw `OMITTED`, leaving it and everything after it (further operands, `RETURNING`, the terminating period, ...) unconsumed to corrupt the rest of the statement parse | `parseCallStatement` (`parser/procedure-parser.js`) now parses `OMITTED` into an explicit placeholder `CallParameter` (`{ omitted: true, value: null }`) so every argument *after* it still lines up with the right callee parameter position; `generateCall` (`generator/expression-gen.js`) substitutes the callee's own zero/spaces default (via the new per-parameter `paramTypes` on `CALL_PROGRAM_REGISTRY`, populated from each program's own LINKAGE field registry in `generateMultiProgramScala`) in that exact positional slot, and never writes a value back to it (there is no caller-side operand to write back into - `refWriters` already skips it for free, since its `value` is `null`). Verified against installed GnuCOBOL (z15): `AFTER A=0011 C=0011` | z15 |

**Bonus fix** (promoted from the "honest"/no-new-finding column, but with a
newly-assessed severity - it silently corrupted the parse stream, which the
original honest assessment understated): an explicit qualified out-of-line
`PERFORM <paragraph-name> OF/IN <section-name>` (real COBOL's own required
disambiguation whenever a bare paragraph name collides across sections) was
not even *consumed* by `parsePerformStatement` - the `OF`/`IN` token and the
section name after it fell straight through every remaining PERFORM clause
check unconsumed, corrupting the rest of the PROCEDURE DIVISION parse
(exactly the same *class* of bug as findings 1/4 above - an unconsumed
qualifier/clause left to corrupt the token stream - caught by the same
audit pass). Fixed in full (not just "consume and ignore"): `parsePerformStatement`
now parses the qualifier into `PerformStatement.targetSection`/
`throughSection`; `generatePerformFromAST` (`generator/method-gen.js`) and
`generatePerform` (`generator/expression-gen.js`) route a qualified target
through the same collision-aware `resolveParagraphMethodName` resolver
`generateAllMethods`/`generateSectionMethod` already use to *declare* a
qualified method (threaded via each module's own
`setAmbiguousParagraphNamesForPerform`, mirroring the existing
registry-setter pattern) - not just the previous, always-bare
`toMethodName`/`paragraphMethodName`. An ordinary *unqualified* PERFORM to a
would-be-ambiguous name is deliberately untouched (still the pre-existing,
documented "Known gaps" limitation below) - only an explicit `OF`/`IN`
qualifier is resolved. Verified against installed GnuCOBOL (z12): `START`,
`IN-SECTION-B-PARA-ONE`, `END` (not `IN-SECTION-A-PARA-ONE`, which an
unqualified/bare resolution would have wrongly called first) | z12 |

**Incidentally-discovered-and-fixed bug** (found while promoting z09, not
one of the 4 findings or the bonus fix itself, but blocking that survivor
from hard-passing): `generateCall` always named its intermediate result
`val _callRet`, so a SECOND BY-REFERENCE-writeback CALL in the *same*
paragraph (z09's own shape - no single-CALL-per-paragraph corpus program
before it exercised this) redeclared the identical `val` name - a hard
Scala "already defined" compile error. Fixed by a per-call unique name
(`nextCallRetName`/`resetCallRetSeq`, `generator/expression-gen.js`) instead
of a hardcoded literal.

15 round-12 probes were promoted: 5 fixed divergers (`z11` finding 1, `z13`
finding 2, `z14` finding 3, `z15` finding 4, `z12` the bonus fix) plus 10
survivors that already passed unmodified (once the incidental `_callRet`
bug above was also fixed) before this round, locking in existing behavior
as regression guards: `z01` further SEARCH ALL variants, `z02`
two-dimensional subscripted INITIALIZE, `z03` INITIALIZE REPLACING of a
subscripted table element, `z04` INITIALIZE of a whole record containing an
OCCURS ... DEPENDING ON child, `z05` a 150-line "everything at once"
integration program (DECLARATIVES triggered for real via a deliberate
first-open-before-create, a self-seeded input file, SORT with INPUT/OUTPUT
PROCEDURE, a multi-key SEARCH ALL, an edited-numeric report write, a CALL
to a contained subprogram with a GROUP parameter, and a final read-back of
the report file - a crown-jewel regression guard exercising a huge swath of
the engine in one program), `z06` a pointer/index chain, `z07` INSPECT
TALLYING against a subscripted table element, `z08` numeric MOVE
truncation, `z09` combines findings 3/4 (OMITTED and fewer-args CALLs) with
GOBACK-returns-to-caller vs STOP RUN-terminates-the-whole-run-unit
semantics in one integration program, and `z09b` isolates the GOBACK-vs-
STOP-RUN distinction on its own.

See `tests/round12-fixes.test.js` for focused, toolchain-independent unit
tests of all 4 findings, the bonus fix, and the incidental `_callRet` fix
above - including a parser-termination guard (finding 1) that runs the
conversion in a child process with a hard wall-clock timeout, since a
synchronous infinite loop cannot be interrupted from within the same
process/thread the way an ordinary assertion failure can.

### Round-13 adversarial-refutation findings (aa01-aa10, aa02b) and their fixes

A round-13 refuter found 5 more root-cause dishonest divergences - one of
them (finding 3) **SEVERE** (a whole class of DECLARATIVES reentrancy - a
handler retrying its own failed OPEN, or one handler's body triggering
another - saw empty/partial registries, not merely one wrong value). Three
findings (2, 3, 4) are fixed in full; every promoted program for those hard-
passes `oracleCompare()`. Two findings (1, 5) are fixed only as far as an
honest, visible, compiling degradation - the underlying capability (byte-
level marshalling of an OCCURS table across a CALL boundary; a true
byte-slice table view for a REDEFINES of one OCCURS-bearing group by
another) is genuinely not implemented, and the round's own instructions
explicitly anticipated this as an acceptable outcome - see "Known gaps"
below for both; their own repro programs (`r1303c`/`r1313` in the
adversarial-refutation scratch history) are deliberately **not promoted**
into this corpus (same reasoning as every other documented gap here: a
program that actually exercises a known, intentional gap would fail
`oracleCompare()` by design).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 2 | `SORT ... INPUT PROCEDURE`/`OUTPUT PROCEDURE ... THRU <para>` (a THRU range on a SORT's own procedure clause, not an ordinary PERFORM) never had its THRU range collected at all - `generateAllMethods`' (`generator/method-gen.js`) THRU-range collection pass only ever scanned `PerformStatement` nodes for `.throughParagraph`, never `SortStatement.inputProcedure`/`.outputProcedure` (a `{ procedure, through }` shape parsed by `parseSortProcedureClause`) - so `generateSort`'s own `procedureCallExpr` (`generator/expression-gen.js`, pre-existing) called a `<from>To<To>()` wrapper method that `generatePerformThruMethod` was never actually asked to build: a hard "not found" compile error, unless some unrelated ordinary PERFORM elsewhere in the same program happened to request the identical THRU range by coincidence | `generateAllMethods`'s THRU-collection loop (`generator/method-gen.js`) now also inspects every `SortStatement` in the program and adds its `inputProcedure`/`outputProcedure` THRU ranges (when present) to the exact same `performThrus` Set the ordinary PERFORM scan already builds - a pure addition, since it only ever adds wrapper methods a SORT statement elsewhere in the same file will actually call. Verified against installed GnuCOBOL (aa01): a `SORT ... INPUT PROCEDURE IS 1000-FILL THRU 1000-FILL-EXIT` (with `1000-FILL` itself doing a nested `PERFORM 3000-A THRU 3000-C`) now RELEASEs the exact rows cobc's own run produces, byte-for-byte | aa01 |
| 3 (SEVERE) | DECLARATIVES handler registries (`DECL_FILE_HANDLERS`/`DECL_MODE_HANDLERS`, consulted by `declarativeHandlerFor` in both `generator/expression-gen.js` and `generator/file-io-gen.js`) were installed via `setDeclarativeHandlersExpr`/`FileIO` only AFTER `generateDeclarativeSupport` had already generated every declarative SECTION's own method body (`scala-generator.js` ~2110-2112, pre-fix) - a single-pass loop that generated each `decl`'s body via `generateSectionMethod` and only added ITS OWN registry entries at the very END of that same iteration. Any file operation generated INSIDE a DECLARATIVES body - a handler retrying its own failed OPEN (the file it's itself the handler for), or handler A's body triggering handler B (regardless of which one is declared textually first) - resolved against an empty (self-retrigger) or partially-populated (cross-handler, declaration-order-dependent) registry, silently generating an unconditional/no-handler OPEN instead of the correct recursive call into the right handler method | Split `generateDeclarativeSupport` into a genuine two-pass pipeline: new `collectDeclarativeHandlers` walks every DECLARATIVES section's `useClause.targets` ONLY (zero codegen, so nothing downstream can ever observe a partial registry) and returns the COMPLETE `fileHandlers`/`modeHandlers` maps; the caller (`convertProgramAst`) installs those via `setDeclarativeHandlersExpr`/`FileIO` BEFORE the second pass (new `generateDeclarativeMethodBodies`) generates a single declarative body - so by the time ANY declarative body (or the ordinary PROCEDURE DIVISION body after it) is generated, every handler - including a handler's own file, and every OTHER handler in the same DECLARATIVES block regardless of textual order - is already visible. Verified against installed GnuCOBOL: a single self-retriggering handler (`aa02b`) fires exactly twice (`HANDLER FIRED N=1`, retries its own OPEN, `HANDLER FIRED N=2`, then terminates - matching cobc's own `COUNT=2` exactly, not an infinite loop and not a single mis-resolved fire); a two-handler reentrancy case (`aa02`, handler B declared BEFORE handler A but B's own body triggers A) fires both handlers in the correct nested order regardless of declaration order | aa02, aa02b |
| 4 | Level-66 `RENAMES` (`item.renames`/`.renamesThrough`, parsed by `parser/data-division-parser.js` but with **zero codegen anywhere**) fell through `buildFieldRegistry`'s ordinary elementary-leaf branch like any plain field - it got its own disconnected flat var (default-initialized, PIC-less) that never aliased the sibling range it was supposed to rename at all; DISPLAY of it showed nothing meaningful and a MOVE into it never touched the fields it renames | `buildFieldRegistry` (`generator/scala-generator.js`) now tracks a flat, whole-WORKING-STORAGE-section `flatLeafOrder` (every elementary leaf/FILLER registered so far, in physical declaration order - deliberately flattened past any intermediate GROUP_REGISTRY nesting, since RENAMES is defined purely by byte position and can legally cross a group boundary) and, on a level-66 item, slices the contiguous run between its FROM/THRU endpoints (inclusive) into a synthetic GROUP_REGISTRY entry keyed by the RENAMES name itself - from that point on it IS "just another group" to every existing consumer: `groupDisplayValueExpr` already handles its DISPLAY for free. MOVE INTO it needed one new piece - `generateMove` (`generator/expression-gen.js`) only handled a group-to-group MOVE and a group-as-CALL-argument before this fix, never "scalar/literal source INTO a bare group target" - so new `generateScalarIntoGroupMove` fits the source to the target group's total byte width (`GROUP_BYTE_LENGTH_REGISTRY`) and reuses `scatterGroupFromString` (the exact inverse of `groupDisplayValueExpr`, previously only used for CALL BY REFERENCE marshalling) to split it across the covered fields. Verified against installed GnuCOBOL (aa03): `AB=[AAABBB]` then, after `MOVE "XXXXXX" TO WS-AB`, `A=[XXX] B=[XXX] C=[CCC]` (WS-C, outside the renamed range, is untouched) | aa03 |

**Honest-degradation findings** (not hard-passing `oracleCompare()` by design - see "Known gaps" below for each):

| # | Finding | Route taken | Program (not promoted) |
|---|---|---|---|
| 1 | `CALL ... USING BY REFERENCE` of a GROUP containing an OCCURS table (`generateCall`'s `argExprs`, `generator/expression-gen.js`) fell through to a bare `toCamelCase(name)` whenever `groupDisplayValueExpr` returned `null` for an OCCURS-bearing group (it has no scalar concatenation - see that function's own doc comment) - an undeclared-identifier hard COMPILE error, since a group has no flat Scala var of its own | **Honest TODO route** (not true marshalling): mirrored the pre-existing writeback-side fallback (`renderWriteback`'s own `scatterGroupFromString == null` branch, already a visible TODO) onto the argument-construction side - a same-typed (`String`) `""` placeholder plus a visible, compiling comment, matching `generateEntryMethod`'s own callee-side return-expression fallback exactly. Compiles and runs to completion (verified: no crash), but does not reproduce cobc's actual cross-CALL byte marshalling - the callee sees empty/default data instead of the caller's actual table contents | `r1303c` (scratch-only) |
| 5 | REDEFINES of a group-with-OCCURS by another group-with-OCCURS (`WS-TAB-BY-NAME REDEFINES WS-TAB-BY-NUM`, both sides' single child itself `OCCURS ... INDEXED BY ...`): three registries disagreed about whether the redefining group's OCCURS child was a table at all - `todoStubRedefinesLines` (`generator/scala-generator.js`) recursed into its elementary children as bare, `occursDepth: 0` scalar `def`s (no OCCURS-awareness, unlike `buildFieldRegistry`'s own main walk), while `TABLE_REGISTRY` (subscripting, and `generateSearch`'s own `lookupTable`) had NO entry for it at all. Two dishonest, disagreeing outcomes followed: a subscripted reference to one of these fields (`WS-NAME-KEY(1)`, including `generateSearchAll`'s own generated comparisons) compiled as `String#apply(Int): Char` instead of a table subscript - a hard, mismatched-type Scala COMPILE error (r1313's own failure: `value padTo is not a member of Char`) - and even where that happened not to trip, `SEARCH ALL` silently degraded to "no metadata found" and never ran at all | **"All three registries honestly agree" route** (not a true byte-slice table view - that would need per-element packed/binary-aware byte codecs threaded through a REDEFINES-of-REDEFINES chain, out of scope for this fix): `todoStubRedefinesLines` now registers the SAME `TABLE_REGISTRY` entry (times/indexed/ascending/descending/dependingOn) `buildFieldRegistry`'s own OCCURS registration would give a real item - fixing the "SEARCH ALL's no-metadata-found gap for a redefining table" half of this finding on its own (verified: the generated code now contains a real binary-search loop, `var idxS: Int`/`_lo`/`_hi`, not a bare no-op comment) - and declares each elementary child a `Vector[<baseType>]` honest `???` stub (matching the Vector-per-OCCURS-dimension shape every other table-child registry entry has, so a subscripted reference type-checks) instead of a bare scalar. Compiles cleanly (verified: no compile error); throws `NotImplementedError` only if the table is actually read at runtime (the established convention this whole REDEFINES-stub subsystem already uses elsewhere - see `todoStubRedefinesLines`'s own pre-existing doc comment) - r1313's own SEARCH ALL is reached (real metadata now exists for it), so it does throw at runtime rather than silently producing wrong search results | `r1313` (scratch-only) |

11 valid round-13 probes were promoted: 4 files backing the 3 fully-fixed
findings (`aa01` finding 2, `aa02`/`aa02b` finding 3's two-handler/self-
retrigger shapes, `aa03` finding 4) plus 7 survivors that already passed
unmodified before this round: `aa04` DECLARATIVES precedence (an ordinary
paragraph's own file operation is unaffected by an unrelated DECLARATIVES
section), `aa05` a CALL combined with a DECLARATIVES handler on the same
file, `aa06` a 3-level table with 2 INDEXED BY names under `SEARCH ...
VARYING`, `aa07` a nested `FUNCTION` call used directly as an `EVALUATE`
subject, `aa08` an 18-digit COMP-3 field with both `ROUNDED` and `ON SIZE
ERROR`, `aa09` a `STRING` result used directly as a `SEARCH ALL` key, and
`aa10` a mid-statement (not just mid-line) COBOL comment. The 2
honest-degradation findings' own repro programs (`r1303c`/`r1313`) are
deliberately **not promoted** - see the table above and "Known gaps" below.
`r13-04` (a REDEFINES-of-an-ODO-table repro) is also excluded - cobc itself
rejects it (compile error, not a runtime divergence) - same reasoning as
every other cobc-rejected repro this refutation process has found.

See `tests/round13-fixes.test.js` for focused, toolchain-independent unit
tests of all 5 findings above, including a termination/reentrancy test for
finding 3 (a self-retriggering handler resolves to itself instead of an
empty registry; a two-handler reentrancy case resolves the second handler
regardless of declaration order).

### Round-14 adversarial-refutation findings (b1-b6, c1/c3/c4b/c5/c6) and their fixes

A round-14 refutation reported 4 dishonest findings, all now fixed in full;
every promoted program hard-passes `oracleCompare()`. Finding 3 (sentence-
scope termination) is the most consequential: it is a **general parser
flaw**, not a narrow statement-specific gap - `parseStatementBlock` is the
single shared block-parsing routine every conditional-clause form (IF/ELSE,
READ AT END/INVALID KEY, ON SIZE ERROR/OVERFLOW/EXCEPTION, EVALUATE WHEN,
...) is built on, so the bug silently affected all of them at once whenever
a program used the (perfectly legal) sentence-scope form - an implicit
scope terminated by a bare period - instead of an explicit `END-*` keyword.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 3 (MOST IMPORTANT - general parser flaw) | `parseStatementBlock` (`parser/procedure-parser.js`) treated a PERIOD as "skip it and keep collecting into THIS block" - so ANY conditional clause lacking its own explicit `END-*` terminator (`IF` without `END-IF`, `READ AT END` without `END-READ`, `ON SIZE ERROR`/`ON OVERFLOW`/`INVALID KEY` without their own `END-*`, `EVALUATE WHEN` without `END-EVALUATE`, ...) silently absorbed every statement written AFTER it in the same paragraph into its own implicit scope - real COBOL's actual rule is the opposite: a PERIOD ends the whole SENTENCE, closing every open implicit scope at once, however many are nested | `parseStatementBlock` now treats a period exactly like any other terminator - it stops the block WITHOUT consuming the period, leaving it in place so it propagates upward through every nested `parseStatementBlock` call (each one also stops without consuming) until it reaches whichever sentence-level loop actually owns period consumption - `parseProcedureDivision`'s and `parseDeclaratives`' own per-paragraph loops, both of which already explicitly skip a period exactly once at their own level. No other line changed - this is a single, surgical fix to one shared routine. Verified against installed GnuCOBOL: `c4b` (IF condition false, no END-IF) - "NEXT"/"THIRD" print as top-level statements, "POS" never prints; `c3` (READ AT END with no END-READ) - the DISPLAY and CLOSE *after* the bare READ run as normal top-level statements, not swallowed into the AT END arm. Ran the FULL 198+11-program suite with ONLY this fix applied before layering findings 1/2/4 (per this round's own instructions) - 828/828 pass, 0 regressions, confirming no existing corpus program was accidentally relying on the old (wrong) absorption behavior | c3, c4b |
| 1 | Qualified `PERFORM x OF/IN secA THRU y OF/IN secB` (`generatePerformThruMethod`, `generator/method-gen.js`) matched THRU endpoints by BARE NAME ONLY (`units.findIndex(u => u.name === fromParagraph)`), ignoring `targetSection`/`throughSection` entirely - so it always resolved the FIRST program-order paragraph pair sharing those bare names, regardless of which section the PERFORM statement actually qualified. A separate bug compounded this: the THRU-range collection `Set` was also keyed by bare name only, so two DIFFERENT qualified THRU ranges sharing both bare endpoint names (legal COBOL, different sections) would collapse onto one entry | Threaded `fromSection`/`toSection` through `generatePerformThruMethod`'s own unit lookup (`units.findIndex` now also requires `u.sectionName === fromSection`/`toSection` when a qualifier is present) and through the forward-range `rangeUnits` slice (which had its OWN separate, still-bare-name-only re-scan loop - fixed by slicing directly from the already-resolved `startIndex`/`endIndex` instead of re-deriving the range via a second unqualified lookup). New shared `performThruWrapperName(from, fromSection, to, toSection)` helper builds the wrapper method's own composite name, folding in a section qualifier when present (`paraOneInSectionBToParaTwoInSectionB`, not the previous, always-bare `paraOneToParaTwo`) so two qualified ranges sharing bare endpoint names in different sections get two DIFFERENT wrapper methods, never colliding; `generatePerformFromAST`'s own qualified-THRU call site (previously explicitly documented as an unfixed limitation - "a THRU range's own composite wrapper-method name is untouched/still built from the plain unqualified name... no corpus program combines THRU with an explicit qualifier, so that combination is deliberately left as-is") now calls the SAME shared helper, so the call site and the declaration can never drift apart. The THRU-range collection Set is now keyed by the full `(from, fromSection, to, toSection)` tuple. Reduces byte-for-byte to the pre-existing unqualified scheme whenever neither endpoint carries a qualifier (every pre-round-14 corpus program, and SORT's own `INPUT`/`OUTPUT PROCEDURE ... THRU` clause, which has no qualifier grammar of its own). Verified against installed GnuCOBOL (b3): `PERFORM PARA-ONE OF SECTION-B THRU PARA-TWO OF SECTION-B` prints `B-ONE`/`B-TWO` (SECTION-B's own paragraphs), never `A-ONE`/`A-TWO` (an unrelated, textually-identical pair in SECTION-A, declared earlier in the program) | b3 |
| 2 | `INSPECT ... REPLACING` with MULTIPLE clauses in ONE statement (`generateInspect`, `generator/expression-gen.js`) cascaded: each clause's own codegen (`applyInspectRegion`/`buildOperation`) wrapped the *previous* clause's own resulting Scala expression as its input, so a later clause's comparand could match text an EARLIER clause in the SAME statement had just written - `INSPECT WS-STR REPLACING ALL "A" BY "B" ALL "B" BY "A"` against `"AAAABBBB"` produced `"AAAAAAAA"` (first pass turns every A into B, second pass then turns ALL of those - including the ones the first pass just wrote - into A) instead of cobc's actual single left-to-right-scan result, `"BBBBAAAA"` | New `CobolInspect.replaceMultiClause` runtime helper (embedded alongside the existing single-clause helpers) evaluates every REPLACING clause in ONE left-to-right scan of the untouched original string - at each position, the FIRST clause (in the order written) whose comparand matches wins, matched characters are skipped over (never re-examined by a later clause), mirroring real COBOL's own documented rule exactly; each clause's own BEFORE/AFTER INITIAL region (if any) is honored independently. `generateInspect` now routes any statement with 2+ REPLACING clauses through this helper; a single clause (the overwhelmingly common case, and the only shape any pre-round-14 corpus program used) is completely untouched - identical, byte-for-byte codegen to before, calling the pre-existing per-clause-type helper (`replaceAll`/`replaceFirst`/`replaceLeading`/`replaceCharacters`) directly. Verified against installed GnuCOBOL (c1): `STR=[BBBBAAAA]` | c1 |
| 4 | `SYNCHRONIZED`/`SYNC` was parsed (`item.sync`, `parser/data-division-parser.js`) but had ZERO consumers anywhere in the generator - silently accepted and then completely ignored, so `FUNCTION LENGTH` of a record containing a SYNC binary item, and any real file-record byte layout (`parse`/`format`) built from one, were simply wrong (missing the alignment padding real COBOL inserts) | New `layout.js` `syncPadBytes(item, offset)`: a SYNC binary item (`COMP`/`COMP-4`/`COMP-5`/`BINARY`/`COMPUTATIONAL[-4/-5]`) of N bytes (2/4/8, the same sizing `elementaryByteLength` already uses) aligns to the next multiple of N, inserting pad bytes immediately before it; `itemByteLength` now accounts for this when summing a group's children (feeding `FUNCTION LENGTH`/`groupByteLengthRegistry` automatically), and `case-class-gen.js`'s field-offset computation/`parse`/`format` codegen do too (an explicit `offset += N // SYNC alignment padding` line in both, skipping - never reading or writing - the pad region; `format`'s output buffer is already zero-filled by default, matching the pad byte's own value with no extra code needed). Compiler-verified via direct file-write probes (not assumed): a COMP-3/PACKED-DECIMAL item carrying SYNC is completely UNAFFECTED (cobc's SYNCHRONIZED clause only concerns binary-word alignment) - probed by comparing a SYNC COMP-3 record's total length against the identical PICTURE with no SYNC clause at all (identical); the pad byte's own value is `0x00`, never a space - probed via a REDEFINES-as-flat-PIC-X view tallying `X"00"` vs `X"20"` occurrences; alignment verified for 2-byte (SIGN present), 4-byte, and 8-byte binary sizes (offset advances to the next even/multiple-of-4/multiple-of-8 position respectively; an already-aligned item gets zero padding). Verified against installed GnuCOBOL (c6): `LEN=5` for `X(1)` + `S9(4) COMP SYNC` + `X(1)` (1 pad byte inserted before the 2-byte COMP field) - a pre-fix engine reported `LEN=4`, silently ignoring the SYNC clause entirely | c6 |

11 valid round-14 probes were promoted: 5 files backing the 4 fixed findings
(`b3` finding 1, `c1` finding 2, `c4b`/`c3` finding 3's IF/READ-AT-END
shapes, `c6` finding 4) plus 6 survivors that already passed unmodified
before this round, locking in existing behavior as regression guards: `b1`
a level-66 RENAMES spanning a REDEFINES sibling, `b2` a level-66 RENAMES
passed BY REFERENCE across a CALL boundary, `b4` a SORT INPUT/OUTPUT
PROCEDURE combined with a DECLARATIVES error handler on an unrelated file,
`b5` a CALL whose CALLEE (not the caller) has its own DECLARATIVES section,
`b6` an EVALUATE used directly inside a DECLARATIVES handler body, and `c5`
`SIGN IS TRAILING` on a signed DISPLAY numeric (including after an ADD that
crosses back through zero).

`method-gen.js`'s own previously-undocumented comment gap - `generatePerformFromAST`'s
doc comment explicitly stated "a THRU range's own composite wrapper-method
name is untouched/still built from the plain unqualified name... no corpus
program combines THRU with an explicit qualifier, so that combination is
deliberately left as-is rather than guessed at" - is now fully closed by
finding 1's fix; no part of qualified-THRU remains unfixed, so nothing new
was added to "Known gaps" for it (the existing "bare, UNQUALIFIED PERFORM"
note below has been updated instead to reflect that THRU is now covered by
the qualified form too).

A parallel state-isolation audit (round-14, "angle A" - 13 adversarial
same-process-vs-fresh-process scenarios covering every module-level
registry this generator maintains) found 0 divergences: every registry this
generator relies on is already correctly reinstalled at the top of every
`generateScala()`/`generateMultiProgramScala()` call. `tests/state-isolation.test.js`
was extended with 6 more permanent regression tests for scenarios it didn't
already cover (GROUP_REGISTRY/TABLE_REGISTRY in reverse order,
AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM, ADVANCING_FILES, and CALL_RET_SEQ's
same-source-repeated-3x determinism) alongside its 5 pre-existing ones - the
13 scratch-only node scripts themselves are not promoted (same reasoning as
every other adversarial-refutation scratch script: the permanent, data-
driven regression coverage lives in the test suite, not the scratch
history).

See `tests/round14-fixes.test.js` for focused, toolchain-independent unit
tests of all 4 findings above, including a battery over finding 3 covering
IF/READ AT END/COMPUTE ON SIZE ERROR/STRING ON OVERFLOW/WRITE INVALID
KEY/EVALUATE WHEN, each with AND without its own explicit `END-*`
terminator, plus a doubly-nested-IF-with-no-END-IF case (one period closing
two levels of implicit scope at once).

### Round-15 adversarial-refutation findings (d01-d14) and their fixes

A round-15 refuter found 8 more dishonest divergences. 7 are fixed in full -
every promoted program for those hard-passes `oracleCompare()`. The 8th
(finding 8, `d12`) is fixed exactly to the scope its own instructions called
for: it previously turned a documented, out-of-scope, already-visible gap
(reference modification, round-3 finding 3) into a hard COMPILE crash when
combined with STRING - this round stops the crash (STRING now compiles and
runs cleanly around a ref-mod segment source) without implementing ref-mod's
own semantics, which stays exactly as out-of-scope as before. `d12` therefore
still shows as the Phase 2 suite's one todo (see "Known gaps"), by design -
not a regression, and not the crash finding 8 was reported against.

Findings 1-3 are one connected thread: `layout.js`'s SYNC-alignment
machinery (round-14 finding 4) was correct only for a SYNC item directly
under a flat, non-repeating, non-nested group - the three narrower
combinations its own doc comment flagged as unverified (group-VALUE
inheritance offset drift, a nested sub-group's non-zero absolute offset, and
OCCURS-stride rounding) turned out to all be real, oracle-confirmed bugs.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | SYNC binary child inheriting a GROUP-level VALUE clause - `scala-generator.js`'s `buildFieldRegistry` offset-walk (`walk()`) never consulted `syncPadBytes` when advancing its own running `offset` (used both to slice each child's span out of the group's VALUE literal, and - after this round's finding 2 - as the absolute base offset threaded into a nested group), even though `layout.js`'s `itemByteLength` (used for the group's *total* width) already applied it - the two offsets silently drifted apart the instant a SYNC child needed padding, corrupting which bytes of the VALUE literal every SYNC child (and everything declared after it) actually read | `walk()` now computes `syncPadBytes(item, baseOffset + offset)` and adds it to `offset` BEFORE using `offset` for anything - identical padding decision to `itemByteLength`'s own, by construction (same function, same inputs) | d02 |
| 2 | SYNC alignment inside a nested sub-group that itself sits at a non-zero ABSOLUTE record offset - both `itemByteLength` and `walk()` aligned relative to the sub-group's own local `offset` (always reset to 0 per recursive call), not the item's true absolute record position - a SYNC item whose sub-group happens to start at an odd absolute offset could be wrongly judged "already aligned" (or vice versa) purely because its *local* offset within the sub-group looked aligned | Threaded a `baseOffset` parameter through both functions' recursion - `itemByteLength(item, baseOffset = 0)` and `walk(list, occursChain, ancestorNames, parentValueText, baseOffset = 0)` - each nested group's own recursive call now passes its own absolute start (`baseOffset + offset` at the point the group itself was reached) instead of implicitly restarting at 0. Every pre-round-15 call site either omits the parameter (defaults to 0, correct for a record's own top level) or was already effectively anchored at 0, so this is a no-op for every existing corpus program. Verified against installed GnuCOBOL (d03): `W-LEAD PIC X(1)` + `W-GRP { F1 PIC X(1), F2 PIC S9(4) COMP SYNC, F3 PIC X(1) }` + `W-TAIL PIC X(1)` totals `LEN=6` - F2's absolute offset (2, right after W-LEAD+F1) is ALREADY even, so cobc inserts NO padding; the pre-fix engine, aligning against F2's local offset within W-GRP (1, odd), wrongly inserted one, reporting `LEN=7` | d03 |
| 3 | SYNC binary item inside an OCCURS table - `itemByteLength` only padded *before* the SYNC child within one occurrence, never rounding the OCCURRENCE'S OWN STRIDE up afterward to the alignment boundary - so occurrence 0 laid out correctly, but occurrence 1 (and beyond) started at whatever offset occurrence 0's unrounded width happened to leave, silently drifting out of alignment after the first repetition | New `layout.js`-internal `syncAlignmentSize(item)` (recursive - the widest SYNC alignment any descendant anywhere inside one occurrence requires, 1 when none). `itemByteLength` now rounds its own per-occurrence `single` width up to that alignment whenever `item` itself carries `OCCURS > 1` - real cobc pads the END of each occurrence so every repetition starts at the same alignment-class offset the first one does. A no-op whenever no descendant of an OCCURS item carries SYNC on a binary item (every pre-round-15 OCCURS table). Verified against installed GnuCOBOL (d04): `WS-ROW OCCURS 2 { R-LEAD PIC X(1), R-NUM PIC S9(4) COMP SYNC, R-TAIL PIC X(1) }` totals `LEN=12` (stride rounded 5 -> 6, times 2) - the pre-fix engine reported `LEN=10` (naive `5 * 2`, unrounded), and - worse - `R-NUM(2)`'s own bytes would have been read from the wrong (mis-aligned) offset entirely had the table's stride ever needed to line up with real file-record bytes | d04 |
| 4 | Group-VALUE slicing over a COMP-5 (native/host binary) child - `scala-generator.js`'s `nonDisplayInheritedNumericText` truncated the DISPLAY-derived value to the PICTURE's declared digit count for every non-DISPLAY USAGE uniformly (COMP-3/COMP/COMP-4/COMP-5/BINARY alike) - correct for COMP-3/COMP/COMP-4/BINARY (real cobc's `binary-truncate` convention DOES clip those to their low-order declared digits - re-confirmed, not just assumed, by this round's own d02 - a plain `COMP` case - now passing end-to-end), but WRONG for COMP-5: cobc's FILE STATUS "35"-style low-order clipping is documented as specific to non-native binary storage; COMP-5's DISPLAY shows the TRUE stored magnitude even past the declared digit count | `nonDisplayInheritedNumericText` now skips the truncate-to-`digits` step specifically for COMP-5 (`magnitudeStr.padStart(digits, '0')` only - a no-op when already wide enough); `defaultElementaryValueWithInheritance`'s own downstream numeric-literal construction widens the synthetic item's own `pic.integerDigits` to match whenever the decoded value came back wider than declared, so `defaultElementaryValue`'s shared `truncateNumericLiteralText` call (used for an ORDINARY too-wide VALUE literal, which legitimately DOES truncate) doesn't independently re-clip a COMP-5 value this fix already decided to leave alone. Verified against installed GnuCOBOL (d06): `PIC 9(4) COMP-5` reading raw bytes `"12"` (native/little-endian) decodes to 12849 and DISPLAYs `AMT=12849` in full - the pre-fix engine reported `AMT=2849` (12849 mod 10^4, the COMP-3/COMP/COMP-4/BINARY truncation rule wrongly applied to COMP-5 too) | d06 |
| 5 | Subscripted whole-row MOVE across two DIFFERENT tables (`MOVE WS-ROW-A(i) TO WS-ROW-B(j)`, two distinct 01-records) fell through the pre-existing single-table-only guard (`sourceRow.groupKey === targetRow.groupKey`) straight into the ordinary elementary-MOVE codegen path, which has no flat var for a group-with-OCCURS name at all - a hard `Not found: wsRowB` compile error (`wsRowB = wsRowB.updated(...)`, referencing a name that was never declared) | **Real fix, not a degraded marker** (a natural generalization of the existing single-table logic): `subscriptedGroupMoveChildLines`/`generateSubscriptedGroupMove` (`generator/expression-gen.js`) now accept two (possibly different) group keys, matching each side's children POSITIONALLY (same count, same per-position Scala type/width/decimals - the identical rule `generateGroupMove`'s own `groupLayoutsIdentical` already applies for a bare, non-subscripted cross-record group MOVE) and copying `<targetChildCamel> = <targetChildCamel>.updated(<targetIdx>, <sourceChildCamel>(<sourceIdx>))` per matched pair; a layout mismatch (different child count, or a positional type/width/decimals disagreement) still falls back to the pre-existing visible `??? TODO` marker rather than emit a wrong assignment. The same-table case (`sourceGroupKey === targetGroupKey`, w05's own shape) is unaffected - matching itself against itself positionally produces byte-for-byte the same output as the pre-round-15 single-groupKey code path. Verified against installed GnuCOBOL (d07): `MOVE WS-ROW-A(1) TO WS-ROW-B(2)` correctly copies `A-CODE(1)`/`A-NUM(1)` into `B-CODE(2)`/`B-NUM(2)` (`B2-CODE=AAA B2-NUM=111`), leaving `WS-ROW-A(1)` itself untouched (`A1-CODE=AAA A1-NUM=111`) | d07 |
| 6 | Subscripted whole-row MOVE with TWO subscript dimensions (`MOVE WS-INNER(1,1) TO WS-INNER(2,2)`, OCCURS nested inside OCCURS) was rejected by `generateSubscriptedGroupMove`'s own `targetSubscripts.length !== 1` guard, falling back to a comment-only marker (`() // ... row left unchanged`) that left the target's stale value completely untouched at runtime - a SILENT wrong-output bug (worse than finding 5's hard compile error: the generated code compiled and ran, just silently did nothing) | **Real fix, not a degraded marker**: new `nestedReadExpr`/`nestedUpdateExpr` helpers build a full N-dimension-deep `.updated(...)`/read chain (mirroring `renderAssignment`'s own local nested-update shape for an ordinary elementary multi-dimensional subscript write) instead of the original single-`.updated` shape; `subscriptedGroupMoveChildLines`/`generateSubscriptedGroupMove` now accept an ARRAY of subscript index expressions per side (any length, source/target must match) - a 1-dimensional row (the common case, w05) still produces byte-for-byte the same single-`.updated` output as before. Verified against installed GnuCOBOL (d08): `MOVE WS-INNER(1,1) TO WS-INNER(2,2)` correctly copies `IN-CODE(1,1)`/`IN-NUM(1,1)` ("AA"/11) into `IN-CODE(2,2)`/`IN-NUM(2,2)` (`OUT22=AA 11`), leaving `WS-INNER(1,1)` itself untouched (`OUT11=AA 11`) - the pre-fix engine printed `OUT22=ZZ 99` (the stale, never-overwritten value) | d08 |
| 7 | SORT with DECLARATIVES firing from inside the OUTPUT PROCEDURE - traced to `file-io-gen.js`'s OPEN-failure classifier: EVERY `java.io.FileNotFoundException` mapped to FILE STATUS "35" regardless of OPEN mode. "35" ("file not found") is specifically documented (COBOL standard and GnuCOBOL's own FILE STATUS table) as an INPUT/I-O-only condition (those modes require the file to already exist); OPEN OUTPUT/EXTEND instead CREATE the target file, so a `FileNotFoundException` there means the file genuinely couldn't be CREATED (parent directory missing, permission error, ...) - cobc's generic permanent-I/O-error code, "30" | `generateOpen`'s FileNotFoundException-to-status mapping now branches on OPEN mode: INPUT/I-O keep the pre-existing "35" (unaffected - x01/x02 regression-verified still "35"); OUTPUT/EXTEND now map to "30". Distinguished by mode alone (not a runtime parent-directory-existence probe) - the FILE STATUS specification itself already ties "35"'s meaning to INPUT/I-O, so mode is a direct, unambiguous signal, not a heuristic. Verified against installed GnuCOBOL (d10): `OPEN OUTPUT` against `/no/such/dir/D10BADOUT.DAT` (nonexistent parent directory) reports FILE STATUS "30" - both from a DECLARATIVES handler fired on the failure AND from the FILE STATUS field read immediately after OPEN - the pre-fix engine reported "35" for both | d10 |

**Honest-degradation finding** (compiles and runs cleanly - no crash - but
does not implement the underlying capability, by explicit design; see "Known
gaps" below):

| # | Finding | Route taken | Program |
|---|---|---|---|
| 8 | Reference modification (`identifier(start:length)`, round-3 finding 3 - a documented, ALREADY-VISIBLE gap: read/write both degrade to a `???`-typed, Nothing-valued placeholder) used as a STRING segment source combined with STRING's own segment-copy loop calling `.indices`/`.length` directly on that placeholder - `Nothing` has neither member, so this combination was a HARD COMPILE ERROR (`Found: Nothing, Required: ?{indices}`) instead of an honest, compiling gap | **Honest-decline route, ref-mod semantics still explicitly out of scope**: `stringSegmentValueExpr` (`generator/expression-gen.js`) now detects a ref-mod'd `VariableReference` segment source directly and substitutes a concrete, String-typed placeholder (`"" /* TODO: ... */`) instead of routing through the shared `convertIdentifier` Nothing-typed `???` - `"".indices`/`"".length` both compile AND run (contributing zero characters to the STRING result, never advancing the pointer) rather than crashing. Reference modification's own read/write semantics are NOT implemented by this fix (deliberately - see this round's own instructions) - a program combining STRING-with-ref-mod with any OTHER ref-mod usage (d12 also has an UNSTRING-INTO-ref-mod-target and an INSPECT-of-a-ref-mod'd-substring) still reaches the pre-existing `???` placeholder for THOSE uses and throws `NotImplementedError` at runtime if actually executed - exactly Known Gap #1's own long-documented, accepted behavior, unrelated to and unaffected by this fix. Verified against installed GnuCOBOL/scala-cli (d12): the generated Scala now COMPILES cleanly (previously a hard compile error) and RUNS the STRING statement to completion (prints `TARGET=          ` - wrong content, since the ref-mod segments contribute nothing, but a compiling, non-crashing, honestly-marked decline) before reaching the still-unimplemented UNSTRING-INTO-ref-mod line and throwing there, exactly as Known Gap #1 predicts for any program that actually exercises ref-mod | d12 (not fully passing `oracleCompare()` by design - see "Known gaps") |

14 valid round-15 probes were promoted: 7 files backing the 7 fully-fixed
findings (`d02` finding 1, `d03` finding 2, `d04` finding 3, `d06` finding 4,
`d07` finding 5, `d08` finding 6, `d10` finding 7) plus `d12` backing finding
8's honest-decline fix (see above - deliberately still 1 todo, not a
regression), plus 6 survivors that already passed unmodified before this
round, locking in existing behavior as regression guards: `d01` a 3-way
DECLARATIVES/CALL/file-I/O integration, `d05` an ordinary (non-SYNC)
COMP-4 group-VALUE child (confirms the truncation rule finding 4 narrowed to
COMP-5-only is still correct for COMP-4), `d09` a non-DISPLAY (COMP-3) field
sharing a record with an OCCURS table across a WRITE/READ round trip, `d11`
EVALUATE/PERFORM combined with a DECLARATIVES handler, `d13` the same CALLed
subprogram invoked three times in one run (state-isolation regression
guard), and `d14` a qualified `PERFORM ... THRU` crossing two SECTIONs
combined with `GO TO ... DEPENDING ON`.

See `tests/round15-fixes.test.js` for focused, toolchain-independent unit
tests of all 8 findings above, including direct `itemByteLength`/
`syncPadBytes` unit coverage for findings 1-3 (isolated from the cobc/
scala-cli toolchain) and regression guards confirming the multi-dimension
row-move generalization (finding 6) produces byte-for-byte the same output
as before for a 1-dimensional row (w05's own shape).

### Round-16 adversarial-refutation findings (e01-e14) and their fixes

A round-16 refuter found 6 more dishonest divergences (4 hard compile
crashes, 1 silent-wrong-output CALL argument, 1 silent-wrong-output
numeric-typing bug). 4 are fixed in full - every promoted program for those
hard-passes `oracleCompare()`. The other 2 (findings 2 and 3, both surfacing
the same pre-existing, documented, out-of-scope reference-modification gap -
round-3 finding 3/Known Gap #1) are fixed exactly to the scope their own
instructions called for: they stop a crash / a silent-wrong value from a
NEW operand position (a relational comparison; a CALL argument) without
implementing ref-mod's own semantics, which stays exactly as out of scope as
before - see the "Honest-degradation findings" table below, matching round-15
finding 8's own precedent.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `REDEFINES` of a GROUP whose base carries a SYNC-padded child (`05 WS-B REDEFINES WS-A PIC X(5)` where `WS-A` is `{ A-LEAD PIC X(1), A-NUM PIC S9(4) COMP SYNC, A-TAIL PIC X(1) }`) - a hard `Not found: wsB` compile error. Root cause was actually TWO compounding gaps: (a) `redefinesAccessorLines`'s group-target branch (`scala-generator.js`) unconditionally routed every group-target REDEFINES through `groupOverGroupRedefinesLines`, which only ever declares accessors for the REDEFINING item's OWN children - it silently assumed the redefining item is itself a group. `WS-B` is elementary (no children of its own), so NOTHING was ever declared for it at all; and (b) even had that been handled, the target-flattening helper (`flattenRedefinesLeaves`) deliberately bails (returns `null`) on a signed numeric child - correct for a DISPLAY-signed field (real storage overpunches the sign into a zone nibble, which digit-text concatenation can't model), but `A-NUM`'s SIGN is an ordinary two's-complement SYNC `COMP` field, not DISPLAY - a shape the pre-existing model never had a real fallback for beyond an honest-decline stub, which itself only handles the *group*-redefining-group shape (walks `item.children`, empty for an elementary `item`) | **Real fix, not a degraded marker.** Two additions: (1) new `elementaryOverGroupRedefinesLines` (`scala-generator.js`) - the missing mirror image of the existing "group redefines elementary" case - handles an ELEMENTARY item redefining a GROUP by exposing the same kind of synthetic flat-character view directly as the item's own accessor (instead of a further-sliced `...BaseFlat` helper), with a read-modify-write setter when the redefining item's own width is a strict prefix of the target's; (2) new `flattenRedefinesLeavesBytes`, a byte-accurate FALLBACK target-flattener (tried only after the pre-existing `flattenRedefinesLeaves` text model returns `null`, so every previously-supported shape emits byte-for-byte the same Scala as before) that reuses `case-class-gen.js`'s own `classifyCodec`/`decodeFieldExpr`/`encodeFieldExpr` - the EXACT codec dispatch a record's own byte-level `parse`/`format` already uses - so a signed/binary/packed/SYNC-padded child decodes/encodes identically to how it would round-trip through real file I/O, including a synthetic "pad leaf" for the SYNC alignment gap itself (real 0x00 bytes with no COBOL name, but real character positions the view must still account for) and `CobolFmt.truncNumeric`-based low-order-digit truncation for a decoded COMP/COMP-4/BINARY value that overflows its own declared PICTURE width (round-15 finding 4's own "binary-truncate" rule, re-applied here - COMP-5-family USAGEs, including this same round's BINARY-CHAR/SHORT/LONG/DOUBLE, stay exempt). A new `itemAbsoluteOffsets` map threaded through `buildFieldRegistry`'s `walk()` gives the byte-accurate flattener the target's TRUE absolute record offset (needed for a correct SYNC alignment decision - round-15 findings 1/2's own `baseOffset` convention, extended to reach this new call site). `groupOverGroupRedefinesLines` itself also gained the same byte-accurate fallback (tried before its own pre-existing honest-decline stub), a pure capability addition since that fallback is only ever reached for a shape the text model already couldn't represent at all. Verified against installed GnuCOBOL (e02): `WS-A` totals 5 bytes (`A-LEAD`(1) + 1 SYNC pad byte + `A-NUM`(2) + `A-TAIL`(1)); `MOVE "PQRST" TO WS-B` (its REDEFINES alias) correctly leaves `A-LEAD=P`, `A-TAIL=T`, and `A-NUM` reading raw bytes `"RS"` (0x52 0x53) as a big-endian signed 16-bit value truncated to its declared 4 digits: `+1075` | e02 |
| 2 | Reference modification (`identifier(start:length)`, Known Gap #1) used as an IF/EVALUATE relational-comparison operand (`IF WS-SRC(8:3) > "AAA"`) - a hard `Found: Nothing, Required: ?{compareTo}` compile error. Root cause: round-15 finding 8 only patched the STRING-segment-source code path (`stringSegmentValueExpr`) to substitute a concrete String-typed placeholder; every OTHER operand-position call site - including the relational-comparison codegen (`renderComparisonExpr`'s `cmp` helper, `generator/expression-gen.js`) still routed a ref-mod'd operand through the shared `convertIdentifier` `Nothing`-typed `???` via `relationalOperandExpr`. `Nothing` unifies fine with `==`/`!=` (defined on `Any`) but has no `compareTo` member, so any OTHER relational operator (`>`, `<`, `>=`, `<=`) crashed at compile time | **Honest-decline route, ref-mod semantics still explicitly out of scope**: `relationalOperandExpr` now detects a ref-mod'd `VariableReference` operand directly (the same detect-at-the-specific-call-site shape round-15 finding 8 used, rather than widening the shared `convertIdentifier` placeholder itself - which risked also changing ref-mod's already-`???`-typed behavior in arithmetic/DISPLAY contexts this round didn't audit) and substitutes a concrete, String-typed placeholder (`"" /* TODO: ... */`) - `"".compareTo(...)`/`"" == ...` both compile and run (comparing against an empty string - visibly wrong, never a crash). Verified against installed GnuCOBOL/scala-cli (e05): the generated Scala now compiles and runs to completion (all three IFs evaluate, `FLAG=N` printed - wrong, since ref-mod contributes nothing - instead of crashing) | e05 (not fully passing `oracleCompare()` by design - ref-mod's own read semantics remain unimplemented, matching Known Gap #1) |
| 3 | Reference modification used as a `CALL ... USING` argument (`CALL "E06SUB" USING WS-SRC(3:5) WS-RESULT`) - SILENT WRONG OUTPUT, no crash, no marker: the callee received the FULL base variable (`wsSrc`, all 10 characters) instead of the 5-character slice the COBOL source names, and (for the default BY REFERENCE mode) a post-call writeback would have copied the callee's returned value back into the FULL base variable too - both silently, with no visible indication anything was wrong | **Honest-decline route** (this is a documented Known Gap #1 scenario - ref-mod isn't implemented - so a compiling, VISIBLE placeholder is the correct fix, not real ref-mod slicing): `generateCall`'s argument-building (`generator/expression-gen.js`) now detects a ref-mod'd `VariableReference` argument and substitutes a concrete, String-typed, visibly-marked placeholder instead of `toCamelCase(name)`'s silent full-variable pass-through; the matching BY REFERENCE writeback path gets a new `{ kind: 'refmod-unsupported' }` writer that renders a visible no-op comment instead of writing the callee's result back into the untouched base variable. Verified against installed GnuCOBOL/scala-cli (e06): the generated Scala now compiles and runs cleanly, printing `RESULT=` (empty - visibly wrong, since the ref-mod placeholder contributes nothing - not the full/untruncated `wsSrc` content a silent pass-through would have produced) instead of silently passing wrong data with no marker at all | e06 (not fully passing `oracleCompare()` by design - ref-mod's own semantics remain unimplemented, matching Known Gap #1) |
| 4 | `EVALUATE ... ALSO` (multiple subjects) nested inside a `PERFORM ... THRU` crossing two SECTIONs, itself inside two nested `PERFORM VARYING` loops - a hard `Not found: secaP1ToSecbP2` compile error. Root cause: `generateAllMethods`'s PERFORM-THRU-wrapper-method collection pass (`method-gen.js`) only ever walked each paragraph's own TOP-LEVEL `.statements` list looking for a `PerformStatement` with a `throughParagraph` - a PERFORM THRU nested inside ANY other control-flow construct's own body (an inline `PERFORM VARYING`'s loop body, an IF branch, an EVALUATE WHEN, ...) was invisible to it, so `generatePerformThruMethod`'s own wrapper method (`secaP1ToSecbP2`) never got generated at all, even though the call site generating the PERFORM THRU statement itself (deep inside two nested loops) assumed it would exist | Real fix: new `collectStatementsDeep` (`method-gen.js`) recurses into every statement-list-bearing field this AST defines - inline PERFORM's own body, IF's then/else branches, EVALUATE's WHEN/WHEN-OTHER bodies (unwrapping each `WhenClause`'s own `.statements`), SEARCH's WHEN bodies, and every ON EXCEPTION/SIZE ERROR/OVERFLOW/INVALID KEY/AT END(-OF-PAGE) imperative list any other statement type carries - so a PERFORM THRU (or a SORT ... THRU procedure clause) is found regardless of nesting depth, not just at a paragraph's own top level. A no-op for every program where every PERFORM THRU already sat at a paragraph's own top level (the entire pre-round-16 corpus). Verified against installed GnuCOBOL (e10): the full 2x2 `PERFORM VARYING` cross product correctly enters `SECA-P1` through `SECB-P2` on each of the 4 iterations, with `EVALUATE ... ALSO` selecting the right `CASE-*` branch each time | e10 |
| 5 | `SEARCH` over a table declared `OCCURS ... DEPENDING ON` (ODO) ignored the live counter value entirely, scanning up to the table's fixed declared MAXIMUM instead - SILENT WRONG OUTPUT: a row placed past the current live count (but still within the fixed-max storage) was found by SEARCH even though it shouldn't be visible yet | Both `generateSearch` and `generateSearchAll` (`generator/expression-gen.js`) now use the table's depending-on counter field's own camelCase flat-var name (`tinfo.dependingOn`, already recorded by `buildFieldRegistry`'s OCCURS registration - round-10 finding 4 - but never previously consulted here) as the loop/binary-search upper bound instead of the fixed `tinfo.times`, whenever the table actually has an ODO clause (a no-op for every fixed-size OCCURS table - `tinfo.dependingOn` is `null`). Verified against installed GnuCOBOL (e13): with `WS-COUNT = 3`, `SEARCH` finds `"CC"` at row 3 but correctly reports NOT FOUND for `"DD"` at row 4 (present in the fixed-max storage, but beyond the live count) - `SEARCH` then finds it once `WS-COUNT` is raised to 5 | e13 |
| 6 | A bare `USAGE BINARY-LONG` item with NO PIC clause (the only legal form for this USAGE - GnuCOBOL's native fixed-width binary "int32" USAGE) was silently treated as alphanumeric/DISPLAY text: `parseUsageClause`'s `usageMap` (`parser/data-division-parser.js`) didn't recognize `BINARY-LONG` (or `BINARY-CHAR`/`BINARY-SHORT`/`BINARY-DOUBLE`) at all, so it fell through to the `'DISPLAY'` fallback WITHOUT consuming the token, which the main clause loop's own "skip unknown tokens" fallback then silently discarded - the item ended up USAGE DISPLAY with no PIC at all. `ADD 1 TO` it behaved like string concatenation (`"30"+"1"="301"`) instead of signed numeric arithmetic, and DISPLAY showed the raw text instead of zero-padded signed digits | Real fix: `parseUsageClause`'s `usageMap` now recognizes all four fixed-width native binary USAGEs; a new post-clause-loop step in `parseDataItem` synthesizes the implicit PIC these USAGEs imply (`S9(3)`/`S9(5)`/`S9(10)`/`S9(20)` for BINARY-CHAR/SHORT/LONG/DOUBLE respectively - oracle-verified for BINARY-LONG via e14, 10 digits, not the 9 an ordinary "5-9 digits -> 4 bytes" COMP tiering would suggest; the other three widths are the same "digits needed for the USAGE's full storage-width magnitude" convention, extrapolated but not independently oracle-verified) when no explicit PIC was parsed, plus optional `SIGNED`/`UNSIGNED` clause recognition. `layout.js`'s `elementaryByteLength`/`syncPadBytes`/`syncAlignmentSize` now give these USAGEs their own FIXED byte width (1/2/4/8 bytes, straight from the USAGE name) instead of deriving it from digit count (which would wrongly tier BINARY-LONG's own 10-digit implicit PIC into an 8-byte field) - `scalaBaseType` needed no change at all, since it already derives entirely from `item.pic`, which is now correctly populated. `case-class-gen.js`'s `BINARY_USAGES`/`COMP5_USAGES` sets and `expression-gen.js`'s `NON_DISPLAY_USAGES` set gained these USAGEs too (native/host-endian like COMP-5, non-DISPLAY storage), for consistency with any future byte-level (file I/O) use of these fields. The "e14 - honest table BY REFERENCE mismatch" part of e14's own output (a `CALL ... USING BY REFERENCE` of a group containing an OCCURS table) is an ALREADY-documented round-13 known gap, deliberately untouched by this fix. Verified against installed GnuCOBOL (e14): `WS-VALUE-VAL USAGE BINARY-LONG VALUE 30`, passed `BY VALUE` to a subprogram that does `ADD 1 TO LK-VALUE`, correctly DISPLAYs `+0000000031` inside the subprogram and leaves the caller's own `WS-VALUE-VAL` untouched at `+0000000030` (BY VALUE semantics) - every BINARY-LONG-related output line now matches exactly; only the pre-existing, out-of-scope table-marshalling lines (`AFTER CALL T1/T2/T3`) still differ | e14 (not fully passing `oracleCompare()` - the pre-existing round-13 table-BY-REFERENCE gap is the only remaining difference) |

14 valid round-16 probes were promoted: 4 files backing the 4 fully-fixed
findings (`e02` finding 1, `e10` finding 4, `e13` finding 5, `e14` finding 6 -
`e14` itself still shows as a todo for the unrelated, pre-existing round-13
table-marshalling gap, not the BINARY-LONG bug this round fixed), 2 files
backing the 2 honest-decline fixes (`e05` finding 2, `e06` finding 3 -
deliberately still todos, not regressions, exactly like round-15 finding
8's `d12`), plus 8 survivors that already passed (or already exercised
Known Gap #1 in an already-accepted, pre-existing way - `e04`, a plain
MOVE-source/MOVE-target ref-mod combination, degrades to the same
pre-existing `???` runtime crash this round's own instructions call out of
scope, unaffected by any round-16 change) before this round, locking in
existing behavior as regression guards: `e01` a doubly-nested-OCCURS SYNC
layout, `e03` a group-level SYNC clause, `e04` (see above), `e07` a 3-level
DECLARATIVES/CALL chain, `e08` group-VALUE combined with REDEFINES, `e09`
SEARCH ALL combined with a DECLARATIVES file-I/O handler, `e11` INITIALIZE
of an OCCURS COMP-3 field sharing a record with a REDEFINES, and `e12` a
subscripted MOVE against an ODO table.

See `tests/round16-fixes.test.js` for focused, toolchain-independent unit
tests of all 6 findings above, including direct `elementaryOverGroupRedefinesLines`/
`flattenRedefinesLeavesBytes` coverage for finding 1 (isolated from the cobc/
scala-cli toolchain), a regression guard confirming `groupOverGroupRedefinesLines`
still produces byte-for-byte the same output as before for the pre-existing
unsigned-DISPLAY shape (round-3's own `WS-DATE-ALT` probe), and a direct
`parseUsageClause`/`elementaryByteLength` unit check for finding 6's implicit
PIC synthesis.

### Round-17 adversarial-refutation findings (f01-f14) and their fixes

A round-17 refuter found 8 more dishonest divergences: 3 hard COMPILE
crashes over reference modification reaching a NEW operand position each
(findings 1, 3, and finding 2's own SILENT WRONG OUTPUT variant), 1 hard
COMPILE crash over an 88-level condition-name under a REDEFINES target
(finding 8), 1 hard COMPILE crash over INSPECT REPLACING on a subscripted
table element (finding 6), 1 hard RUNTIME crash (`StringIndexOutOfBounds`)
over SYNC on a REDEFINING item (finding 4), 1 SILENT WRONG OUTPUT over
SEARCH ALL on a 3+ dimension table (finding 7), and 1 SILENT WRONG OUTPUT
over CALL BY CONTENT of a group-with-OCCURS argument (finding 5). 5 are
fixed in full (findings 2, 4, 6, 7, 8) - every promoted program for those
hard-passes `oracleCompare()`. The other 3 (findings 1, 3, 5) are fixed
exactly to the scope their own instructions called for: they stop a crash /
a silent-wrong value from a NEW operand position without implementing
reference modification's own semantics (Known Gap #1) or CALL-argument
group-with-OCCURS marshalling (round-13 finding 1), both of which stay
exactly as out of scope as before - see the "Honest-degradation findings"
table below, matching round-15 finding 8's and round-16 findings 2/3's own
precedent.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 2 | `FUNCTION LENGTH` of a reference-modified argument (`FUNCTION LENGTH(WS-SRC(3:4))`) previously ignored `.refMod` entirely and returned the BASE field's own full declared `picLength` - SILENT WRONG OUTPUT (`FUNCTION LENGTH(WS-SRC(3:4))` reported 10, WS-SRC's own full width, instead of 4, the ref-mod's own substring length) | **Real fix, not a degraded marker.** Unlike every other ref-mod call site in this file (STRING/comparison/CALL-argument/MOVE-target/DISPLAY - all honest declines, since ref-mod's runtime substring *value* isn't implemented), the *length* of a reference modification is a compile-time-known constant in the overwhelmingly common case - the `(start:length)` clause's length operand is almost always a literal. New `refModLiteralLengthText` (`generator/expression-gen.js`) recognizes a bare numeric `Literal` or the single-leaf `ArithmeticExpression` wrapper `parseArithmeticExpression` produces for one, and `functionLength()` returns that literal directly - feeding MOVE/COMPUTE/arithmetic contexts a plain numeric value, same as the pre-existing `info.picLength` case. A direct DISPLAY of `FUNCTION LENGTH` over a ref-mod'd argument additionally needs cobc's own 10-digit zero-padded runtime-intrinsic-result format (verified against installed GnuCOBOL) - `generateDisplay` special-cases exactly that FunctionCall/LENGTH shape separately rather than baking display-only formatting into the shared value. Only when the length operand is itself a variable/expression (not a literal) - genuinely not foldable at generation time - does this fall back to an honest TODO decline. Verified against installed GnuCOBOL/scala-cli (f02): `FUNCTION LENGTH(WS-SRC)` (no ref-mod) still reports `FULLEN=10`; `FUNCTION LENGTH(WS-SRC(3:4))` correctly reports `SUBLEN=0000000004` (cobc's own zero-padded runtime-intrinsic DISPLAY format); `MOVE FUNCTION LENGTH(WS-SRC(2:5)) TO WS-LEN` correctly yields `MOVEDLEN=05` | f02 |
| 4 | SYNC on the REDEFINING item (not the target) - `01 WS-B REDEFINES WS-A` where WS-B has a `PIC S9(4) COMP SYNC` child (`characterSlicedGroupRedefinesLines`, `generator/scala-generator.js`) - EVERY child, DISPLAY or not, was sized by `child.pic.length` (its PICTURE's DECIMAL DIGIT COUNT), never its true BINARY STORAGE WIDTH - correct for a DISPLAY child (1 character IS 1 byte) but wrong for a COMP/COMP-3/COMP-4/BINARY/COMP-5 child, whose real storage is usually NARROWER than its digit count implies (a 4-digit COMP field is 2 bytes, not 4 characters) - silently walking the running `offset` past the target's own true length, eventually throwing `StringIndexOutOfBoundsException`. A companion bug found while fixing this: a REDEFINES item that is ITSELF A GROUP (has real children of its own) was never registered in `groupRegistry`/`groupKeyRegistry`/`groupByteLengthRegistry` at all - this whole `if (item.redefines)` branch `continue`s before ever reaching the ordinary group-registration code further down the loop - so `FUNCTION LENGTH`/MOVE/DISPLAY of the bare redefining group name had nowhere to resolve to at all, a hard "Not found" compile error (a group has no flat var of its own) | **Real fix, not a degraded marker** (the mirror image of round-16 finding 1's own fix, applied on the REDEFINING side this time): a non-DISPLAY child in `characterSlicedGroupRedefinesLines` is now sized by its real `elementaryByteLength`, any SYNC alignment pad bytes real cobc inserts before it are accounted for via `syncPadBytes` (exactly like round-16's `flattenRedefinesLeavesBytes` does for the other direction), and its value is decoded/encoded through the same `classifyCodec`/`decodeFieldExpr`/`encodeFieldExpr` byte-level codec dispatch a record's own byte-level `parse`/`format` already uses - not plain digit-text substring/concatenation, which can't represent binary/packed storage at all. A DISPLAY child (occurs or not) is completely unaffected - its byte width already equals its digit/character count, a pure no-op for every pre-existing corpus program. An OCCURS non-DISPLAY child (a rarer, entirely unexercised shape) still falls back to the pre-existing PICTURE-digit-count model rather than risk an unverified partial byte-accurate table model. The companion group-registration bug is fixed by registering a REDEFINES item's own real children in `groupRegistry`/`groupKeyRegistry`/`groupByteLengthRegistry` right where `redefinesAccessorLines` already declares their accessors, keyed off `registry` (FIELD_REGISTRY) rather than `qualifiedRegistry` since those children are registered directly under their bare name, not a qualified `name::parent` key. Verified against installed GnuCOBOL (f06): `WS-A PIC X(4)` VALUE "PQRS", `WS-B REDEFINES WS-A` = `{ B-LEAD PIC X(1), B-NUM PIC S9(4) COMP SYNC }` - `B-LEAD`'s own byte 0 is `P`; the SYNC pad byte lands at byte 1; `B-NUM`'s real 2-byte binary slice (bytes 2-3, `"RS"` = 0x52 0x53) decodes as a big-endian signed 16-bit value, `NUM=+1075`; `FUNCTION LENGTH(WS-B)` correctly resolves to `LEN=4` (WS-A's own byte width) instead of crashing "Not found: wsB" | f06, f07 |
| 6 | `INSPECT` REPLACING/CONVERTING on a SUBSCRIPTED table element (`INSPECT WS-ROW(3) REPLACING ALL "A" BY "Z"`) - a hard "value update is not a member of Vector[String]" compile error: the write-back previously hand-built a naive `${target} = ${expr}` string, where `target` is `convertIdentifier(statement.target)`'s READ-form rendering - fine for a plain scalar (`wsField = ...`), but for a subscripted table-row element this renders `wsRow(2) = ...`, an illegal Vector element WRITE (Scala's `x(i) = v` sugar needs a real `.update` method, which an immutable `Vector` - this generator's OCCURS-table representation - doesn't have) | **Real fix, not a degraded marker.** All three INSPECT write-back sites in `generateInspect` (single REPLACING/CONVERTING clause, and the multi-clause REPLACING path) now route through the shared `renderAssignment(statement.target, expr)` helper every other subscripted-write call site (MOVE/STRING/...) already uses, instead of hand-building the assignment string locally - a pure no-op for a non-subscripted target (`renderAssignment`'s own `subscripts.length === 0` branch produces the identical `${camel} = ${expr}` text as before this fix). Verified against installed GnuCOBOL (f10): `INSPECT WS-ROW(3) REPLACING ALL "A" BY "Z"` (WS-ROW an `OCCURS ... DEPENDING ON` table) correctly writes back via `wsRow = wsRow.updated(2, CobolInspect.replaceAll(wsRow(2), "A", "Z"))`, leaving every other row untouched | f10 |
| 7 | `SEARCH ALL` on a table with 3+ OCCURS dimensions (nested OCCURS inside OCCURS inside OCCURS) - the binary search's own key-lookup expression (`${pk.camel}(${idxVar} - 1)`, `generateSearchAll`, `generator/expression-gen.js`) never accounted for the OUTER (fixed) subscripts a 3+-dimension table's key field needs before its own innermost, search-driven index - a hard "wrong number of arguments" / value-mismatch (the generated code indexed a 3-dimensional `Vector[Vector[Vector[_]]]` with only one subscript) | **Real fix, not a degraded marker.** `extractKeyPrefix` now carries each key reference's own subscript list (`leaf.subject.subscripts`) alongside the pre-existing per-key metadata, and a new `outerKeySubscriptChain(pk)` helper (`generator/expression-gen.js`) returns every subscript BUT the innermost one, rendered as a `(idx1)(idx2)...` chain - prepended before the binary search's own driven index at every key-lookup site (`generateSearchAll`'s main binary-search loop AND its tie-breaking `_tieLo`/`_tieHi` scan). A 1-dimension table's key has exactly one subscript (the innermost/only one), so `subscripts.slice(0, -1)` is empty and this is a pure no-op - byte-for-byte the same output as before this fix for every 1-2 dimension SEARCH ALL table (every pre-round-17 corpus program). Verified against installed GnuCOBOL (f12): a `2 x 2 x 4` triply-nested OCCURS table, `SEARCH ALL WS-CELL WHEN WS-CELL-KEY(IDX1, IDX2, IDX3) = TARGET-KEY` correctly finds the matching cell only within the `(IDX1=2, IDX2=1)` slice the outer subscripts pin down, reporting the right `WS-CELL-VAL`/`IDX3` | f12 |
| 8 | `EVALUATE TRUE` with an 88-level condition-name declared under a REDEFINES target (e.g. `01 WS-FLAG-NUM REDEFINES WS-FLAG PIC 9(1). 88 FLAG-LOW VALUE 0 1.`) - a hard "Not found: flagLow" compile error: `buildFieldRegistry`'s `walk()` (`generator/scala-generator.js`) `continue`s its REDEFINES branch before ever reaching the ordinary elementary-leaf's own `conditionRegistry` registration loop further down (only reached for a NON-redefines item), even though the parser attaches `item.conditions` to a REDEFINES item exactly the same way it does for an ordinarily-declared one | **Real fix, not a degraded marker.** The REDEFINES branch now registers `item.conditions` right where `redefinesAccessorLines` just declared `item`'s own accessor, using `registry.get((item.name).toUpperCase())` for the same `{ info, values, falseValue }` shape the ordinary path builds - `level88ConditionExpr`/`evaluateConditionExpr` need no changes at all to consume it. Verified against installed GnuCOBOL (f13): `WS-FLAG-NUM REDEFINES WS-FLAG` with `88 FLAG-LOW VALUE 0 1`/`88 FLAG-MID VALUE 2 3`/`88 FLAG-HIGH VALUE 4 THRU 9` - `EVALUATE TRUE` correctly selects `RESULT=MID` (`WS-FLAG="2"`), then `RESULT2=HIGH` (`WS-FLAG="7"`), then `RESULT3=LOW` (`WS-FLAG-NUM` set directly to 0) | f13 |

**Honest-degradation findings** (compile and run cleanly - no crash - but do
not implement the underlying capability, by explicit design; see "Known
gaps" below):

| # | Finding | Route taken | Program |
|---|---|---|---|
| 1 | Reference modification (Known Gap #1) used as a MOVE target's SOURCE when the target is NUMERIC (`MOVE WS-SRC(3:4) TO WS-NUM` where `WS-NUM` is `PIC 9(4)`) - a hard "Ambiguous overload" compile error distinct from (and not fixed by) round-15/16's String-typed placeholder work: `renderVariableMoveSource`'s numeric-target branch (`generator/expression-gen.js`) feeds the shared `Nothing`-typed `???` placeholder straight to `BigDecimal(...)`, and EVERY one of `BigDecimal.apply`'s 7 overloads independently accepts a `Nothing`-typed argument, so the compiler can't pick one | **Honest-decline route, ref-mod semantics still explicitly out of scope**: a ref-mod'd MOVE source reaching a numeric target now substitutes the new `refModNumericPlaceholder`'s concrete `BigDecimal(0)` instead of `BigDecimal(???)` - a concrete, unambiguous, honestly-wrong (always zero) stand-in that compiles and runs rather than crashing. Verified against installed GnuCOBOL/scala-cli (f01): the generated Scala now compiles and runs to completion, printing `NUM=0000`/`DEC=000.00` (wrong - ref-mod contributes nothing - instead of a hard compile error) | f01 (not fully passing `oracleCompare()` by design - ref-mod's own read semantics remain unimplemented, matching Known Gap #1) |
| 3 | Reference modification used as a plain DISPLAY operand (`DISPLAY WS-SRC(start:length)`, no intervening MOVE/STRING/comparison) - a hard "Found: Nothing, Required: ?{padTo}" compile error: `renderDisplayOperand` (`generator/expression-gen.js`) calls a String/numeric member directly on `convertIdentifier`'s shared `Nothing`-typed `???` placeholder in EVERY one of its type-specific branches (`.padTo`/`.take` for alphanumeric, `BigDecimal(...)` for numeric, `CobolFmt.floatDisplay(...)` for Float/Double) - `Nothing` has none of those members, so this crashed regardless of which branch the field's own declared type would otherwise route through | **Honest-decline route, ref-mod semantics still explicitly out of scope**: `renderDisplayOperand` now detects a ref-mod'd operand directly, up front, before any type-specific branch is reached, and substitutes the shared `refModStringPlaceholder` - `"".padTo(...)`/`"".take(...)` both compile and run cleanly. Verified against installed GnuCOBOL/scala-cli (f04): the generated Scala now compiles and runs to completion, printing `OUTER=` (empty - wrong, since the ref-mod placeholder contributes nothing, including for the doubly-nested case where the ref-mod's own START operand is itself a ref-mod'd `FUNCTION NUMVAL` argument) instead of crashing | f04 (not fully passing `oracleCompare()` by design - ref-mod's own semantics remain unimplemented, matching Known Gap #1) |
| 5 | `CALL ... USING BY CONTENT` of a GROUP containing an OCCURS table - reported as SILENT WRONG OUTPUT: the callee would see blank/default table elements instead of the caller's actual values, with no compiling marker anywhere. Investigation found this scenario is **already covered** by round-13 finding 1's own fix: `generateCall`'s `argExprs`/`refWriters` construction (`generator/expression-gen.js`) never branches on `param.mode` ('CONTENT'/'REFERENCE'/'VALUE') for the group-with-OCCURS honest-placeholder case at all (the `isRegisteredGroupName` + `groupDisplayValueExpr`-returns-null branch runs identically regardless of mode) - it was already generalized, just never independently verified for BY CONTENT specifically | **No new production code needed - verified, not fixed.** Re-running f09 (`CALL "F09SUB" USING BY CONTENT WS-REC`) against the current generator confirms the argument already renders as the same visible `"" /* TODO: ... group argument marshalling not supported for a group containing an OCCURS table ... */` placeholder round-13 finding 1 established for BY REFERENCE, and (since `refWriters` filters on `mode !== 'REFERENCE'`) correctly OMITS the BY-REFERENCE-only writeback no-op marker entirely, matching real BY CONTENT semantics (the callee's mutations never flow back to the caller either way). A hand-built BY REFERENCE variant of the identical shape was compared side-by-side to confirm byte-for-byte identical argument-placeholder text between the two modes, differing only in the (correctly BY-CONTENT-omitted) writeback line. Verified against installed GnuCOBOL/scala-cli (f09): the generated Scala compiles and runs to completion, printing blank/default values for `SUB-SEEN-1/2/3` (wrong - the callee never receives the caller's real table contents - but a compiling, honestly-marked decline, not a crash) while every OTHER line (`BEFORE1`, `SUB-AFTER-1`, `AFTER1`, `COUNT`) matches cobc exactly, since BY CONTENT correctly performs no writeback at all | f09 (not fully passing `oracleCompare()` by design - see round-13's own known gap, unrelated to and unaffected by this round) |

9 valid round-17 probes were promoted: 5 files backing the 5 fully-fixed
findings (`f02` finding 2, `f06`+`f07` finding 4 - `f07` a triple-REDEFINES-
view regression guard for the companion group-registration fix, `f10`
finding 6, `f12` finding 7, `f13` finding 8), 3 files backing the 3
honest-decline fixes (`f01` finding 1, `f04` finding 3, `f09` finding 5 -
deliberately still todos, not regressions, exactly like round-15 finding
8's `d12` and round-16 findings 2/3's `e05`/`e06`), plus survivors that
already exercised known, out-of-scope, or unrelated behavior before this
round (unaffected by any round-17 change): `f03` (`FUNCTION NUMVAL` over a
ref-mod'd argument, itself used as a subscript - reaches the pre-existing
`???` runtime crash Known Gap #1 already documents, unaffected by this
round's findings 1-3 fixes since none of those cover a NUMVAL argument or a
computed-subscript context), `f05` (`MOVE CORRESPONDING` with a ref-mod'd
source into one field of the group - the same pre-existing `???` runtime
crash, since the ref-mod'd source here targets an ALPHANUMERIC field, not
the NUMERIC-target case finding 1 fixes), `f08` (SORT with DECLARATIVES
firing from BOTH an INPUT and an OUTPUT PROCEDURE's own OPEN failure - an
existing, already-working capability, confirmed unaffected), `f11`
(`UNSTRING` into an `OCCURS ... DEPENDING ON` table with `COUNT IN` -
existing, already-working capability, confirmed unaffected), and `f14` (`GO
TO ... DEPENDING ON` jumping into a paragraph range a separate `PERFORM ...
THRU` also covers - a pre-existing, unrelated control-flow limitation of
this generator's paragraph-as-method model, out of scope for this round's 8
findings).

See `tests/round17-fixes.test.js` for focused, toolchain-independent unit
tests of all 8 findings above, including a direct regression test pinning
down finding 5's BY-CONTENT-vs-BY-REFERENCE equivalence, and a dedicated
"shared helper refactor" describe block confirming the new
`refModGapComment`/`refModStringPlaceholder`/`refModNumericPlaceholder`
helper trio (introduced this round to stop duplicating the same ref-mod
honest-placeholder sentence at every operand-position call site) produces
byte-for-byte the same text as before at every pre-existing round-15/
round-16 ref-mod call site it now routes through (also confirmed by
`tests/round15-fixes.test.js`/`tests/round16-fixes.test.js` themselves,
unmodified and still green).

### Round-18 adversarial-refutation findings (g01-g14) and their fixes

A round-18 refuter found 8 more dishonest divergences: 1 PARSER-level
SILENT WRONG OUTPUT so severe it drops an entire unnamed PROCEDURE
DIVISION's worth of statements (finding 1), 1 statement type with literally
ZERO generator support at all (finding 2 - MERGE), 1 SILENT WRONG OUTPUT
where a whole EVALUATE construct simply never executes for most of its own
matching values (finding 3), 1 narrow live-aliasing semantic gap between
cobc's in-place STRING/UNSTRING storage and this generator's snapshot-based
one (finding 4), 1 hard COMPILE crash over ADD CORRESPONDING between
subscripted OCCURS DEPENDING ON rows (finding 5), 1 hard COMPILE crash over
OCCURS directly on a REDEFINES 01-level item (finding 6), 1 hard COMPILE
crash over REDEFINES nested 4 levels deep (finding 7), and 1 hard RUNTIME
crash (`IndexOutOfBoundsException`) where a round-17 honest-placeholder
value propagates into a table subscript (finding 8). Findings 1, 2, 3, 4, 5,
6, 7 are fixed IN FULL - every promoted program for those hard-passes
`oracleCompare()`. Finding 8 is a defensive-guard fix (not a capability
implementation) that stops the crash but cannot make the underlying,
already-out-of-scope reference-modification gap (Known Gap #1) produce a
correct value - see the "Honest-degradation findings" table below, matching
round-15 finding 8's and round-16/17's own precedent for this exact
distinction.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | A `PROCEDURE DIVISION.` whose very first thing (after any USING/RETURNING clause) is a STATEMENT, not a paragraph- or section-name declaration - an entirely unnamed, implicit top-level "main" body (legal COBOL) - was dropped ENTIRELY: `parseProcedureDivision`'s (`parser/procedure-parser.js`) statement-collection loop only ever appended a parsed statement to `currentParagraph.statements` or `currentSection.statements`, and both are `null` until the FIRST paragraph/section name appears - a statement reached in that state matched neither branch and was silently discarded, repeating for every subsequent statement until (if ever) a real name appeared. `parseCobol` returned ZERO paragraphs/sections for a program shaped this way, so `generateAllMethods`/`findMainProcedure` (`generator/method-gen.js`, `generator/scala-generator.js`) had nothing to generate at all - both `run()` and any callee's `entry()` compiled to a bare `()`, every statement invisible | **Real fix, not a degraded marker.** `parseProcedureDivision` now synthesizes an implicit top-level paragraph (`IMPLICIT-MAIN-PARAGRAPH` - hyphenated, matching ordinary COBOL paragraph-name shape so `toMethodName`/`toPascalCase` split it correctly into a legal Scala identifier, `implicitMainParagraph`) the FIRST time a statement is reached with neither `currentParagraph` nor `currentSection` set, and routes that statement (and every subsequent one, until a real paragraph/section name appears) into it - exactly the same "leading anonymous block becomes its own unit" idea round-7 finding 8's `sectionLeadingUnit` already applies one level down, inside a SECTION. Pushed as `division.paragraphs`' own FIRST entry, so `flattenProcedureUnits`/`generateAllMethods`/`findMainProcedure` all see it as an ordinary paragraph - including as the program's true entry point (`units[0]`), with no changes needed to any generator code at all. A pure addition: a program that already opens with a named paragraph/section (the entire pre-round-18 corpus) never reaches this branch. Verified against installed GnuCOBOL (g14): a two-program source, both with a completely unnamed PROCEDURE DIVISION body, correctly runs `MAIN-BEFORE-CALL` / (via `CALL "G14SUB"`) `SUB-RAN-NO-PARA-NAME` / `MAIN-AFTER-CALL X=005` - previously all three DISPLAYs (and the ADD/CALL) would have compiled to nothing at all. Confirmed to generalize past this one repro: g06's and g10's own source `.cbl` files needed an explicit `MAIN-PARA.`/`SUB-PARA.` paragraph name specifically to work around this exact gap before this fix (visible in their own PROCEDURE DIVISIONs) | g14 |
| 2 | `MERGE` had **zero generator support of any kind** - `generateExpression`'s statement-type switch (`generator/expression-gen.js`) had no `'MERGE'` case at all (only `'SORT'`), so a `MergeStatement` node silently fell through to the generic default no-op - directly contradicting `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`'s claim that MERGE was already oracle-equivalent alongside SORT (it had simply never been tested until this round). A companion gap surfaced while building a corpus program to exercise it: `WRITE rec FROM "literal text"` (a string/numeric/figurative-constant literal FROM source, not an identifier) - `parseWriteStatement`'s FROM parse used `parseVariableReference`, which only recognizes an IDENTIFIER token and returns `null` for a literal, silently dropping the FROM value AND leaving the literal's own token unconsumed in the stream (misparsed as a separate garbage `UnknownStatement` right after) | **Real fix, not a degraded marker**, reusing almost all of SORT's own machinery (the SD work-file row-case-class + `Vector` buffer + read-cursor model, `buildSortFileRegistry`/`generateSortFileSupport`, and the multi-key ASCENDING/DESCENDING tie-breaking cascade - factored out into a new shared `sortCascadeLines` helper both `generateSort` and the new `generateMerge` now call, byte-for-byte unchanged for SORT). MERGE has no INPUT PROCEDURE of its own (COBOL only allows `USING`) - `generateMerge` opens each USING file itself (reusing file-io-gen.js's own `generateOpen`/`generateClose`, exactly as an explicit OPEN/CLOSE statement would), reads every record to exhaustion, copies each one into the SD record's own fields BY POSITION (the same convention RELEASE ... FROM already uses), and appends it to the shared buffer - then applies the identical `sortCascadeLines` stable sort SORT uses. Since MERGE's own semantics assume every USING file is ALREADY sorted, concatenating each file's records (each internally already in key order) and applying one single STABLE sort produces exactly the same final ordering (including cross-file tie-break by USING's own listed order) a genuine k-way merge would - not a mere approximation. The companion `WRITE ... FROM <literal>` gap is fixed by routing `parseWriteStatement`/`parseRewriteStatement`'s FROM clause through `parseOperand` (recognizes a literal in addition to every identifier shape `parseVariableReference` already did) and a new `writeFromLiteralPlan` (`generator/expression-gen.js`) that reuses `renderLiteralForTarget` (the exact same literal-into-alphanumeric-target rendering `generateScalarIntoGroupMove`'s MOVE-into-a-whole-group path already uses) against a synthetic target descriptor sized to the record's own declared width - producing a correctly fitted/padded compile-time string literal, never the record's own unrelated (default-initialized) current field values. Verified against installed GnuCOBOL (g12): `MERGE MERGE-FILE ASCENDING KEY M-KEY USING IN-FILE-1 IN-FILE-2 OUTPUT PROCEDURE IS EMIT-PARA` (IN-FILE-1: 010/030, IN-FILE-2: 020/040, each written via `WRITE ... FROM "<literal>"`) correctly interleaves into `010/020/030/040` order | g12 |
| 3 | `EVALUATE subject WHEN "A" WHEN "B" WHEN "C" <shared-body>` (repeated WHEN keywords - not a single WHEN's comma/ALSO-separated multi-value list - sharing one imperative-statement body, real cobc's own documented "multiple WHEN phrases" idiom) - SILENT WRONG OUTPUT so severe the shared body effectively never ran for most of its own matching subject values: `parseEvaluateStatement` correctly parses each `WHEN <cond>` as its own separate `WhenClause`, and a WHEN followed immediately by another WHEN (no statements in between) correctly gets an EMPTY `.statements` list - but `generateEvaluate` (`generator/expression-gen.js`) rendered every WhenClause as its OWN independent `if`/`else if` branch, each with ONLY that one clause's own (possibly empty) body - turning "A or B or C share this body" into "A and B do nothing, only C runs the body", so the EVALUATE ran the shared body only when the subject happened to equal the LAST condition in the cascade. A SEPARATE, compounding bug surfaced while isolating this: `generatePerform` (the nested-statement sibling of method-gen.js's `generatePerformFromAST`, used for a PERFORM inside an IF/EVALUATE/SEARCH branch body) never checked `statement.throughParagraph` at ANY of its 3 call sites, so a `PERFORM x THRU y` nested inside (for example) a shared EVALUATE WHEN body always called ONLY `x`'s own standalone method, never the THRU range's real wrapper method - silently skipping every paragraph after the first in the range, with no fallthrough at all | **Real fix, not a degraded marker, for both bugs.** New `mergeCascadingWhenClauses` (`generator/expression-gen.js`) runs BEFORE codegen: it merges a run of consecutive empty-bodied WHEN clauses into the NEXT WhenClause in the same run that actually carries a body, tracking each original clause's own condition(s) as one more OR'd "condition set" attached to that one real body - a pure generalization (an ordinary WHEN with its own body becomes a one-element `conditionSets` list, rendering byte-for-byte the same `if`/`else if` text as before this fix). New `performTargetCallExpr`/`performThruWrapperNameLocal` (mirroring method-gen.js's own `performThruWrapperName` - duplicated locally since method-gen.js imports FROM expression-gen.js, so the reverse import would cycle) fix the second bug: every one of `generatePerform`'s 3 call sites now checks `statement.throughParagraph` and calls the THRU wrapper method when present, exactly like `generatePerformFromAST` already did for a top-level PERFORM - a pure addition, an ordinary (non-THRU) nested PERFORM renders identical text to before. Verified against installed GnuCOBOL (g08): `EVALUATE WS-CODE WHEN "A" WHEN "B" WHEN "C" DISPLAY "GROUP-ABC-BEFORE" PERFORM STEP-ONE THRU STEP-THREE DISPLAY "GROUP-ABC-AFTER" ...` with `WS-CODE = "B"` (the middle condition, previously the exact shape that ran nothing at all) now correctly runs the shared body, including the full THRU fallthrough (`STEP-ONE`/`STEP-TWO`/`STEP-THREE`, `TOTAL=0060`) | g08 |
| 4 | STRING/UNSTRING with the SAME subscripted table element as both a source and a destination (g09: `UNSTRING R-FIELD(1) DELIMITED BY "-" INTO R-FIELD(1) R-FIELD(3)`) - real cobc's UNSTRING reads/writes its source and INTO targets against the SAME live storage, so writing the first target back (into `R-FIELD(1)`, aliasing the source) is visible to every SUBSEQUENT field's own scan of `R-FIELD(1)` - this generator's `generateUnstring` instead called `CobolUnstring.unstring(source, ..., targets.length)` exactly ONCE, evaluating `source` (a live Scala expression, e.g. `rField(0)`) into that ONE call's arguments before ANY target write happened - a frozen snapshot, diverging from cobc's own live aliasing the moment source and a target coincide (`ROW3` reported the wrong, non-blank `"CD"` and `PTR=007` instead of cobc's own blank field and `PTR=011`) | **Real fix, not a degraded marker.** `generateUnstring` now processes exactly ONE field per target, in a loop, re-evaluating `source` FRESH inside EACH one-field `CobolUnstring.unstring(source, _ptr, delims, 1)` call (never hoisted into a single `val` up front) - a call made after an earlier target's own write sees that write's effect, exactly like cobc's in-place storage does. A companion fix was required to make this correct: UNSTRING's target write previously left the target UNPADDED (the bare matched substring, not fitted to the target's own full declared storage width) - invisible before this round (DISPLAY always re-pads to full width regardless), but directly observable the instant an unpadded write is re-read as a LIVE UNSTRING source in the very next field (the short unpadded text clamps the next scan's start position against the wrong, too-short length) - fixed via a new `unstringTargetWidth` helper that pads/fits every target write through `CobolFmt.fitLeft` when the target is a registered String-typed field with a known width. `_uActive` (mirroring `CobolUnstring.unstring`'s own internal `continue_` flag - false once a call finds no more delimiter, signaled by an empty DELIMITER-IN result) makes every target AFTER that point a plain `""` write with no further call at all, exactly matching the pre-existing (batch-call) TALLYING/leftover-target semantics. A pure restructuring for the non-aliased case: re-reading an unchanged `source` expression one field at a time produces byte-for-byte the same split a single batch call would. Verified against installed GnuCOBOL (g09): `STRING`'s own same-source-read-twice-different-target shape (unaffected, not aliased) still correctly gives `ROW2=[XY        ]`; `UNSTRING`'s aliased shape now correctly gives `ROW1=[AB        ]`, `ROW3=[          ]` (blank), `PTR=011` | g09 |
| 5 | `ADD CORRESPONDING` between SUBSCRIPTED rows of two OCCURS DEPENDING ON tables (g13: `ADD CORRESPONDING WS-ROW-A(1) TO WS-ROW-B(2)`) - a hard compile crash: `generateAddCorresponding`/`generateSubtractCorresponding` (`generator/expression-gen.js`) never looked at `sourceRef`/`targetRef`'s own `.subscripts` at all, feeding the BARE (whole-table) `Vector[Int]` flat var straight into `BigDecimal(...)` - "Found: Vector[Int], Required: ?" - and even had it compiled, the assignment itself would have overwritten the WHOLE table variable, not one row's own scalar field | **Real fix, not a degraded marker** - a straightforward propagation fix: `sourceSuffix`/`targetSuffix` (via the pre-existing `subscriptSuffixExpr` helper, already used by RELEASE/RETURN's own FROM/INTO subscript handling) resolve each side's own subscript expression down to the actual scalar read (`aAmt1(0)`, `bAmt1(1)`, ...), and the write-back now goes through `renderCamelAssignment` (already used by `generateReturn`'s own subscripted INTO target) to rebuild via `.updated(...)` instead of a bare, type-mismatched `=`. A pure generalization: an empty subscript suffix (the ordinary, non-subscripted case - every pre-round-18 ADD/SUBTRACT CORRESPONDING call site) renders byte-for-byte the same text as before. Verified against installed GnuCOBOL (g13): `ADD CORRESPONDING WS-ROW-A(1) TO WS-ROW-B(2)` (`A-AMT1(1)=10`, `A-AMT2(1)=20`, `B-AMT1(2)=1000`, `B-AMT2(2)=2000`) correctly yields `B2-AMT1=1010`/`B2-AMT2=2020`, leaving `WS-ROW-B(1)` (`B1-AMT1=1000`) completely untouched | g13 |
| 6 | OCCURS directly on a REDEFINES 01-level item ITSELF (not on a nested row-group descendant of it - `characterSlicedGroupRedefinesLines` already handles THAT shape) - g07: `01 WS-SRC-ARR REDEFINES WS-SRC-TABLE OCCURS 3 TIMES. 05 A-KEY PIC 9(3). 05 A-VAL PIC X(5).` over a target consisting of three bare `05 FILLER PIC X(8) VALUE "..."` items - a hard "method aKey does not take parameters" compile error: `groupOverGroupRedefinesLines` (`generator/scala-generator.js`) never consulted `hasOccurs(item)` at all, so A-KEY/A-VAL always got a single, ZERO-PARAMETER accessor (sliced from only the FIRST occurrence's bytes) - subscripting it (`A-KEY(WS-IDX)`) crashed exactly like subscripting any other registered scalar field would. A companion gap made this g07 repro specifically necessary: the target here is an ALL-FILLER group, and `flattenRedefinesLeaves`/`flattenRedefinesLeavesBytes` both bail outright on ANY FILLER child (needed for their own OPPOSITE "expose the target's own NAMED fields through the redefiner" direction, where a nameless FILLER has nothing to expose) - so even the pre-fix scalar path degraded further, to the honest `???` stub, for this exact target shape | **Real fix, not a degraded marker.** New `occursOnRedefinesItemLines` builds TABLE (`Vector[Int]`/`Vector[String]`) accessors for each of the REDEFINES item's own children when `hasOccurs(item)` is true: a synthetic flat-character view over the TARGET's storage (built via a new FILLER-tolerant `flattenRedefinesLeavesAllowingFiller` - reuses a FILLER's own already-declared hidden `_fillerCamel` var, unlike the target-exposing flatteners above, since this view only needs the target's raw concatenated BYTES, not its named fields) is sliced per-row (`row i`'s child at `flatName.substring(i*rowWidth + start, ...)`); each child's SETTER rebuilds the ENTIRE flat view (a row's sibling children's bytes are interleaved with this child's own, not contiguous), reading every sibling's CURRENT row value back through its own generated getter to preserve it exactly. Registered in FIELD_REGISTRY with `occursDepth: 1`, the identical shape `characterSlicedGroupRedefinesLines`'s own OCCURS-on-CHILD branch already registers, so every subscripted-reference/DISPLAY/MOVE call site treats it identically. A pure addition - `hasOccurs(item)` is false for every pre-round-18 REDEFINES program, unaffected. Verified against installed GnuCOBOL (g07, also exercising DECLARATIVES + a file-sort OUTPUT PROCEDURE in the same program): `SORT SD-FILE ASCENDING KEY SD-KEY INPUT PROCEDURE IS FEED-PARA` (reading `A-KEY(WS-IDX)`/`A-VAL(WS-IDX)` off the REDEFINES table) correctly sorts `030/010/020` into `010 WWWWW` / `020 XXXXX` / `030 VVVVV` | g07 |
| 7 | REDEFINES nested 4 LEVELS deep on the REDEFINING side (g10: `01 WS-ALT REDEFINES WS-L1. 05 WS-ALT-L2. 10 WS-ALT-L3. 15 WS-ALT-L4. 20 WS-ALT-FLAT PIC X(8).` - `WS-ALT-FLAT` is 4 levels below `WS-ALT` itself) - a hard "Not found: wsAltFlat" compile error: `characterSlicedGroupRedefinesLines` (`generator/scala-generator.js`) only ever handled ONE flat level of elementary (or OCCURS-elementary) children directly - a child that is ITSELF a group (real children of its own, no `.pic`) fell through to the elementary-sizing logic, which reads `child.pic.length` (`undefined` for a group), silently producing a ZERO-WIDTH slice for that whole child AND everything nested inside it - so the true leaf, `WS-ALT-FLAT`, was never declared or registered at all, no matter how deep. (The TARGET side, `flattenRedefinesLeaves`, has always recursed into nested groups correctly - this was purely a REDEFINING-side depth limit) | **Real fix, not a degraded marker.** `characterSlicedGroupRedefinesLines` is now genuinely recursive: a child with real (non-88) children of its own and no OCCURS on itself recurses into ITS OWN children (via a new internal `walk`/`processLeaf` split, sharing the same running character `offset` across every recursion level) instead of attempting to size it as if it were elementary - reaching the true leaves regardless of nesting depth. Only a nested child that ALSO carries its own OCCURS (a table-of-groups nested inside a REDEFINES's own children - a rarer shape no corpus program exercises) still falls through to the pre-existing (zero-width, unchanged) elementary path. A pure generalization: a REDEFINES whose own children are already flat (every pre-round-18 corpus program) recurses zero times, rendering identical output to before. Verified against installed GnuCOBOL (g10): `CALL "G10SUB" USING BY REFERENCE WS-L1` (the callee mutates `LK-CODE`/`LK-NUM`, 4 levels deep under `LK-L1`) followed by `DISPLAY WS-ALT-FLAT` (4 levels deep under the REDEFINES) correctly shows `AFTER-FLAT=ZZZZ9999`, aliasing the callee's own writes through the REDEFINES view at full depth | g10 |

**Honest-degradation findings** (compile and run cleanly - no crash - but do
not implement the underlying capability, by explicit design; see "Known
gaps" below):

| # | Finding | Route taken | Program |
|---|---|---|---|
| 8 | A round-17 finding 1 honest placeholder (`BigDecimal(0)`, substituted for a reference-modification MOVE-into-numeric-target that stays deliberately out of scope - Known Gap #1) reaching a TABLE SUBSCRIPT (g03: `MOVE WS-IDXSRC(6:1) TO WS-IDXNUM` then `WS-VAL(WS-IDXNUM)`) computed a 1-based COBOL subscript of 0 - a 0-based Scala index of -1 - `IndexOutOfBoundsException` at RUNTIME, a hard crash rather than a controlled honest decline | **Defensive-guard fix, not a capability implementation** (ref-mod's own read semantics remain exactly as out of scope as round-17 left them): `subscriptIndexExpr` (`generator/expression-gen.js`) now appends a `.max(0)` clamp to every DYNAMIC (non-literal) subscript index it builds - a purely defensive guard against ANY upstream garbage-but-plausible numeric value (not special-cased to ref-mod specifically - it protects every non-literal subscript call site uniformly), preventing a negative computed index from ever reaching `Vector.apply`/`.updated`. Does NOT (and, without threading each specific table's own runtime length into every subscript call site, cannot) guard the UPPER bound - an implausibly-large computed subscript can still throw, matching real cobc's own equally unsafe behavior for an out-of-range subscript when SSRANGE checking isn't enabled (the default). A no-op for every legitimately in-range subscript value across the entire pre-round-18 corpus (`.max(0)` only ever changes an already-negative, already-wrong result). Verified against installed GnuCOBOL/scala-cli (g03): the generated Scala now compiles and runs to completion, printing `IDX=0`/`VAL=111` (wrong - the ref-mod placeholder still contributes 0, not cobc's real `3` - Known Gap #1 remains exactly as unimplemented as before) instead of crashing with `IndexOutOfBoundsException` | g03 (not fully passing `oracleCompare()` by design - ref-mod's own read semantics remain unimplemented, matching Known Gap #1 and round-17 finding 1's own `f01`) |

14 valid round-18 probes were promoted: 7 files backing the 7 fully-fixed
findings (`g07` finding 6, `g08` finding 3, `g09` finding 4, `g10` finding 7,
`g12` finding 2, `g13` finding 5, `g14` finding 1), 1 file backing the
defensive-guard fix (`g03` finding 8 - deliberately still a todo, not a
regression, exactly like round-15 finding 8's `d12` and round-16/17's own
ref-mod-adjacent precedents), plus survivors that already exercised known,
out-of-scope, or unrelated (and confirmed unaffected) behavior before this
round: `g01` (UNSTRING DELIMITED BY a ref-mod'd delimiter operand - the
pre-existing ref-mod `???` placeholder, Known Gap #1, unaffected by this
round's UNSTRING restructuring since the DELIMITED BY operand itself, not a
source/target field, is what's ref-mod'd here), `g02` (SEARCH WHEN over a
ref-mod'd comparison operand - the same pre-existing Known Gap #1 `???`
placeholder, unrelated to and unaffected by any round-18 change), `g04`
(REDEFINES of a sibling item that itself has an OCCURS DEPENDING ON child -
an existing, already-working capability, confirmed unaffected by finding
6/7's REDEFINES changes), `g05` (SYNC alignment mixed with a REDEFINES -
existing, already-working capability, confirmed unaffected), `g06`
(CALL BY VALUE of a group containing an OCCURS table - already required an
explicit paragraph name to avoid finding 1's parser gap, as noted in
finding 1's own writeup above; the CALL-argument marshalling itself is an
existing, unrelated, already-covered honest decline per round-17 finding 5),
and `g11` (GO TO DEPENDING ON jumping across sections - an existing,
already-working capability, confirmed unaffected).

See `tests/round18-fixes.test.js` for focused, toolchain-independent unit
tests of all 8 findings above.

### Round-19 adversarial-refutation findings (h01-h14) and their fixes

A round-19 refuter found 4 more dishonest divergences (1 silent data-loss
bug in round-18's own new MERGE support, 1 silent-wrong-output GO TO/PERFORM-
THRU interaction, 1 hard compile crash over CALL BY REFERENCE of a
subscripted table element, and 1 inconsistent-clamping/no-marker gap around
negative table subscripts). Findings 1 and 3 are fixed IN FULL - the
promoted program for each hard-passes `oracleCompare()`. Finding 2 is a
documented HONEST DECLINE (a visible, compiling marker - the underlying
runtime divergence is deliberately left unfixed; see below for why). Finding
4 is split: a small, genuinely safe real fix for the one sub-case that is
actually decidable at generation time (a bare literal subscript), plus a
documented, deliberate non-fix for the sub-case that isn't (a variable whose
runtime value happens to be negative).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `MERGE ... USING` of a FLAT/ELEMENTARY (non-group) FD record - h09: `FD IN-FILE-1. 01 IN-REC-1 PIC X(6).` merged (via round-18 finding 2's own new MERGE support) into an SD record shaped as a GROUP (`01 MERGE-REC. 05 M-KEY PIC 9(3). 05 M-TAG PIC X(3).`) - silently lost data: `generateMergeUsingFileLines` (`generator/expression-gen.js`) copies a USING file's FD record into the SD record's fields via `positionalPairs(resolveGroupKey(fdRecordUpper), resolveGroupKey(sdRecordUpper))`, but `positionalPairs`/`GROUP_REGISTRY` only ever hold GROUP items - an elementary FD record (the ordinary "raw text line" FD shape almost every LINE SEQUENTIAL file uses) has no entry there at all, so this always silently returned an EMPTY pair list. The merge's own ORDERING was already correct (round-18's SD work-file/buffer/sort machinery is unaffected) - only the SD record's own field values were never actually populated from the USING file, left at their stale/default values every single merge cycle | **Real fix, not a degraded marker.** Real cobc treats an elementary source moved onto a group target as an ordinary whole-record structural MOVE: the source's raw text is sliced across the target's own children BY POSITION/WIDTH - exactly the convention `generateScalarIntoGroupMove`/`scatterGroupFromString` already implement for MOVE (round-13 finding 4) and `generateCall`/`generateEntryMethod` already implement for a group CALL BY REFERENCE operand. `generateMergeUsingFileLines` now falls back to `scatterGroupFromString(sdGroupKey, dest.camel, ...)` whenever `positionalPairs` returns zero pairs AND the FD record resolved to a plain elementary field (`readDestination`'s `mode: 'elementary'`) - `dest.camel` is already fitted to the FD record's own declared width by the pre-existing `readAssignLines` call just above, so no further padding is needed. A pure addition, gated on `pairs.length === 0`: a USING file whose FD record is already a GROUP (the pre-existing, already-working shape - round-18's own g12 test) takes the exact same `positionalPairs` branch as before, completely unaffected. Verified against installed GnuCOBOL (h09, also combining DECLARATIVES file-status error handling and a per-record CALL in the same program - none of round-18's g07/g12/g13/g14 combine MERGE with either): `MERGE MERGE-FILE ASCENDING KEY M-KEY USING IN-FILE-1 IN-FILE-2 OUTPUT PROCEDURE IS EMIT-PARA` (each USING file an elementary `PIC X(6)` FD record) now correctly decodes each merged line's own `M-KEY`/`M-TAG` and passes them on to `CALL "H09DMCSUB"`, printing `SUB-SAW=010 AAA` / `020 BBB` / `030 CCC` / `040 DDD` / `COUNT=04` in the correct merged-ascending-key order - previously `M-KEY`/`M-TAG` kept whatever stale value was last MOVEd into them (typically blank/zero), silently wrong every time | h09 |
| 3 | `CALL ... USING BY REFERENCE` of a SINGLE already-subscripted SCALAR element of an OCCURS table (h12: `CALL "H12CBRSUB" USING BY REFERENCE WS-VAL(2)`, `WS-VAL PIC X(5) OCCURS 3 TIMES`) - a hard compile crash, and a DIFFERENT, simpler gap than the pre-existing "group containing an OCCURS table" decline (round-13 finding 1/round-17 finding 5's own known gap - a group with no flat Scala var of its own at all): `generateCall`'s argument-building code (`generator/expression-gen.js`) checked `hasSubscripts` only for the ref-mod and whole-group-argument branches, then fell through to a bare `toCamelCase(name)` for anything else - passing the WHOLE table's flat `Vector[String]` var instead of the one requested element (`Found: Vector[String], Required: String`), and the writeback side had the mirror-image bug: `wsVal = <scalar return value>` against a `Vector[String]` var (`Found: String, Required: Vector[String]`) | **Real fix, not a degraded marker**, reusing existing subscript-resolution/writeback machinery rather than reimplementing it. Argument side: a subscripted, non-group USING operand now dispatches to `convertIdentifier(param.value)` - the same helper that already builds a correctly-subscripted `wsVal(idx)` read for MOVE/STRING/INSPECT of a subscripted element - instead of the bare `toCamelCase(name)`. Writeback side: a new `{ kind: 'scalar-subscripted', ref: param.value }` writer renders through `renderAssignment(writer.ref, sourceExpr)` - the exact same `.updated(idx, ...)` rebuild every other subscripted-target assignment in this generator already uses - instead of a bare `camel = value` assignment. A pure addition, gated on `hasSubscripts && !isRegisteredGroupName(...)` on both sides: an unsubscripted scalar CALL argument (the entire pre-round-19 corpus) takes the exact same branches as before. Verified against installed GnuCOBOL (h12): `MOVE "AAAAA"/"BBBBB"/"CCCCC" TO WS-VAL(1)/(2)/(3)` then `CALL ... USING BY REFERENCE WS-VAL(2)` (callee displays, then overwrites its argument with `"ZZZZZ"`) correctly yields `ROW1=AAAAA`, `ROW2=ZZZZZ`, `ROW3=CCCCC` - only the SECOND row is touched, never the whole table | h12 |

**Honest-degradation / documented-limitation findings** (compile and run
cleanly - no crash - but do not implement, or deliberately do not attempt to
match, the underlying capability/behavior; see "Known gaps" below):

| # | Finding | Route taken | Program |
|---|---|---|---|
| 2 | `GO TO` (plain, or `... DEPENDING ON`) whose target paragraph lies OUTSIDE an active `PERFORM x THRU y` range it is textually inside (h11: `PERFORM STEP-ONE THRU STEP-THREE` where `STEP-ONE`'s own `GO TO STEP-TWO-A STEP-TWO-B DEPENDING ON WS-BRANCH` can land on `STEP-TWO-B`, outside the range) - real COBOL treats this as a PERMANENT transfer: the implicit "fall off the range's own end, return to the PERFORM's own caller" behavior a normal in-range exit gets is abandoned entirely, and control never returns there again, no matter how many PERFORM calls are currently nested (h11's own oracle never prints `MAIN-DONE`, the `DISPLAY` right after the original `PERFORM ... THRU`). This engine models every paragraph as an ordinary Scala method and PERFORM as an ordinary method call (`return x()`), which can only ever resume its own caller once `x()` itself returns - so the generated program silently RESUMES after the PERFORM once every nested call unwinds, directly contradicting cobc | **Investigated a real fix first, then took an honest-decline route.** This engine's only two existing "escape" mechanisms were checked for reuse: STOP RUN's `sys.exit(n)` (terminates the whole JVM process - unwinds everything, but permanently, which would wrongly prevent the target paragraph and anything textually after it from running rather than letting them run normally) and GOBACK/EXIT PROGRAM's bare `return` (unwinds only the ONE immediately-enclosing method/nested-def, not every PERFORM call frame currently on the stack - insufficient here, since a GO TO can be nested arbitrarily deep inside PERFORM-THRU-within-PERFORM-THRU). Neither generalizes to "abandon every active PERFORM call frame, then resume normal paragraph-to-paragraph fallthrough at an arbitrary target paragraph." A genuine fix (a thrown control-flow signal carrying the target paragraph, caught by a new top-level trampoline/dispatch loop that re-enters the whole-program fallthrough chain at the right paragraph) is architecturally plausible but would require threading "which THRU range, if any, is lexically active" as new context through every statement-generation call site in `expression-gen.js`/`method-gen.js` (arbitrarily deep inside IF/EVALUATE/PERFORM-VARYING bodies, plus a new whole-program paragraph-name dispatch table) - a large, invasive refactor whose blast radius is entirely out of proportion to this one narrow finding, per this campaign's own explicit allowance for an honest decline over a risky large lift. Instead: new `annotateGoToThruEscapes` (`generator/method-gen.js`) runs a static pre-pass, before any method body is generated, over every `PERFORM ... THRU` range already discovered by `generateAllMethods`'s own existing THRU-wrapper collection loop - for each range, it resolves the range's paragraph membership (mirroring `generatePerformThruMethod`'s own `startIndex`/`endIndex` resolution) and walks every statement inside that range (via the existing `collectStatementsDeep`, so a GO TO nested inside an IF/EVALUATE/PERFORM-VARYING body within the range is found too) looking for a `GoToStatement` whose target(s) fall outside the range's membership set - each such target is tagged directly onto the AST node (`_thruEscapeTargets`/`_thruEscapeRange`). `generateGoTo` (`generator/expression-gen.js`) then renders a visible, compiling inline BLOCK comment (never a line comment - this text is always spliced into a larger single-line `return`/`case` statement) naming the exact escaping target and range on any tagged case. The runtime behavior itself is completely UNCHANGED by this fix - h11 still (silently, wrongly) prints `MAIN-DONE` - only its VISIBILITY changes, from invisible to grep-able. A GO TO whose target is inside the range, or with no enclosing THRU range at all, is completely unaffected (gated on the annotation being present at all). Verified against installed GnuCOBOL/scala-cli (h11): the generated Scala still compiles and still (wrongly) prints `STEP-ONE` / `STEP-TWO-B (outside THRU range)` / `STEP-FOUR` / `MAIN-DONE` (cobc's own oracle stops after `STEP-FOUR`, never printing `MAIN-DONE`) - but the generated source now carries a `// TODO(round-19 finding 2): "STEP-TWO-B" lies outside the enclosing PERFORM STEP-ONE THRU STEP-THREE range - ...` comment directly on the offending `case`, so this is a documented, visible gap rather than a silent one | h11 (not fully passing `oracleCompare()` by design - the underlying GO TO/PERFORM-THRU divergence remains exactly as unimplemented as before this round) |
| 4 | Round-18 finding 8's `.max(0)` dynamic-subscript clamp was built as a defensive guard against a *computed* placeholder value (ref-mod's `BigDecimal(0)`) accidentally becoming a negative Vector index - it was never meant to silently paper over a genuinely-invalid subscript with zero visibility. Two DIFFERENT shapes both reach a negative/zero subscript, and only one of them is actually decidable at generation time: (a) a bare, compile-time-known NEGATIVE OR ZERO integer LITERAL directly in the subscript position (e.g. `WS-VAL(-1)`, `WS-VAL(0)`) - `subscriptIndexExpr`'s literal-folding branches had NO clamp and NO marker at all before this round (an inconsistency with the dynamic case: a literal negative subscript crashed with `IndexOutOfBoundsException` at runtime, harder-failing than the already-silently-wrong dynamic case); (b) h08's own repro, `WS-VAL(WS-NEG)` where `WS-NEG` is an ordinary signed variable (`PIC S9(2) VALUE -1`) - a subscript that is a ordinary VARIABLE reference, indistinguishable at generation time from any other signed variable that might legitimately hold a positive value at runtime; cobc's own behavior for this shape is a genuine, platform/build-dependent out-of-bounds memory read (confirmed non-reproducible across repeated harness runs of h08 itself - one run captured `NEG=` followed by three raw NUL bytes, a DIFFERENT `.oracle.txt` capture than an earlier run's blank-looking spaces) | **Split decision, exactly matching the campaign's own "don't guess at undefined behavior" discipline.** For shape (a) (the only one actually decidable at generation time): a small, genuinely safe REAL fix - new `literalSubscriptIndexExpr` (`generator/expression-gen.js`) applies the identical `.max(0)` clamp the dynamic branches already have, PLUS a visible inline block comment naming the invalid literal subscript, whenever the folded 0-based index is negative; a normal (>=1) literal subscript takes the exact same unclamped, unmarked path as before (`literalSubscriptIndexExpr` only branches differently once `n - 1 < 0`) - zero behavior change for the entire pre-round-19 corpus, since no existing program uses a negative/zero literal subscript. For shape (b) (h08's own actual repro - NOT decidable as a literal without whole-program constant-propagation, which would be a fragile, disproportionate undertaking to add just to special-case one VALUE-initialized variable): DECLINED as a real fix, left running round-18's own pre-existing `.max(0)` clamp completely unchanged (no new marker, no behavior change) - and documented here as an ACCEPTED LIMITATION rather than chased further, because cobc's own output for this exact shape is non-reproducible undefined behavior (verified above by two different `.oracle.txt` captures of the SAME program disagreeing byte-for-byte with each other, let alone with this generator) - there is no "more correct" wrong value to converge on, and guessing at one would be chasing noise, exactly the failure mode this campaign's own methodology (see "What the `.oracle.txt` files mean" above) warns against | h08 (not fully passing `oracleCompare()` by design - matches cobc's own undefined behavior on purpose is explicitly out of scope, not a regression) |

10 further round-19 probes were valid and already passed/were already
honest before any of the above fixes: `h01`/`h02`/`h03`/`h04` (empty/near-
empty WORKING-STORAGE, PROCEDURE DIVISION, and multiple SD records -
existing, already-working capability, confirmed unaffected by any of this
round's changes), `h05` (`MERGE ... GIVING`, as opposed to `OUTPUT
PROCEDURE` - an existing, already-documented decline per round-18 finding
2's own writeup: "only OUTPUT PROCEDURE is implemented" - `h05` correctly
still shows the pre-existing `TODO: MERGE ... GIVING ... not yet supported`
marker, unaffected by this round's MERGE fix, which only touches the
USING-file-fill step, not the GIVING output step), `h06`/`h07` (reference
modification as an INITIALIZE target / an OCCURS DEPENDING ON counter - both
the pre-existing, already-documented Known Gap #1 `???`/placeholder decline,
confirmed unrelated to and unaffected by any of this round's changes), `h10`
(REDEFINES kept in sync with an OCCURS DEPENDING ON sibling - existing,
already-working capability, confirmed unaffected), `h13` (SORT with a
duplicate-name OUTPUT PROCEDURE plus DECLARATIVES - existing, already-working
capability, confirmed unaffected), and `h14` (STRING with three-way aliased
source/target fields - existing, already-working capability, confirmed
unaffected).

See `tests/round19-fixes.test.js` for focused, toolchain-independent unit
tests of all 4 findings above.

### Round-20 adversarial-refutation findings (i01-i14) and their fixes

A round-20 refuter found 2 more dishonest divergences: a paragraph-name
recognition gap that could make an entire generated program's real body dead
code, and a MERGE-internal file-open bug that wrongly invoked a program's own
DECLARATIVES error handler. Both are fixed at their root cause. Investigating
finding 2's own repro also surfaced a third, SEPARATE, previously-
uncatalogued instance of round-19 finding 2's own already-accepted GO-TO/
implicit-range limitation - handled the identical honest-decline way, per
that same established precedent, rather than attempted as a new fix.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | A paragraph literally named `EXIT` (i05: a whole PROCEDURE DIVISION consisting of exactly one, implicitly-entered paragraph named `EXIT`) truncated its own body to nothing: `isParagraphName` (`parser/procedure-parser.js`) required `ctx.check(TokenType.IDENTIFIER)`, but the lexer tokenizes `EXIT` (like `CONTINUE`) as its own reserved-word token type, never `IDENTIFIER` - so the parser instead dispatched it to `parseExitStatement`, producing a bare `ExitStatement` (defaulting to `exitType: 'PARAGRAPH'`) as the FIRST statement of round-18's implicit-main-paragraph mechanism. That `EXIT PARAGRAPH` immediately `return`s, so every statement physically after it (DISPLAY/ADD/DISPLAY/STOP RUN) became dead code - silently wrong, not a crash | `isParagraphName` gained an opt-in `allowReservedWord` flag: when set, a token whose value is `EXIT` or `CONTINUE` (`PARAGRAPH_NAME_RESERVED_WORDS`) is accepted in an IDENTIFIER's place, subject to the exact same PERIOD-or-SECTION lookahead ordinary paragraph names already require. Threaded from the two genuine "paragraph name expected" call sites (`parseProcedureDivision`'s main loop, `parseDeclaratives`' own loop) - but ONLY while NOTHING has been recorded there yet (`!currentParagraph && !currentSection && division.paragraphs.length === 0 && division.sections.length === 0`, or the DECLARATIVES-scope equivalent) - i.e. this token is either immediately after `PROCEDURE DIVISION.` itself (optionally after a DECLARATIVES prologue) or nowhere at all. This narrow guard is the whole fix's precision: without it, the far more common `SOME-EXIT. EXIT.` idiom (a bare EXIT/CONTINUE used as an ordinary no-op statement, usually marking a PERFORM-THRU range's own end - see aa01/i08/p14/x12, all pre-existing corpus programs) has the EXACT SAME "reserved word then period" shape, but occurs once a real paragraph is already open - completely unaffected by this fix, confirmed by re-running all four (all still `oracleCompare()`-clean). Verified against installed GnuCOBOL (i05): the fix makes the generated `exit()` method run its whole body (`IN-EXIT-PARA` / `X=005`), not just return | i05 |
| 2 | `generateMergeUsingFileLines` (round-18/19's MERGE implementation, `generator/expression-gen.js`) reused `generateOpen`'s own OPEN codegen verbatim for its internal per-USING-file open - including its `catch FileNotFoundException/IOException => <declarativesHandler>()` branch. Real cobc does NOT invoke a `USE AFTER STANDARD ERROR PROCEDURE ON <file>` handler for a MERGE statement's own internal access to one of its USING files (confirmed against installed GnuCOBOL, i06: a MERGE whose USING file doesn't exist on disk silently contributes zero records from that file - no error, no handler call - and merges whatever OTHER USING file(s) it does have normally) | New `generateMergeUsingFileOpenLines` (`generator/expression-gen.js`) replaces the `generateOpen` call for just this one step: it opens the same reader/iterator variables `generateOpen`'s INPUT case would, but on ANY `java.io.IOException` (a superclass of `FileNotFoundException`, so one catch arm covers both) just leaves the iterator `Iterator.empty` - no FILE STATUS write, no handler dispatch at all, regardless of whether a DECLARATIVES handler happens to be registered for that file name. Everything downstream (the drain loop, `readAssignLines`/`positionalPairs`/`scatterGroupFromString` for the per-line decode, `generateClose` for the close - already null-guarded, so it's a harmless no-op when the open above failed) is unchanged. Verified against installed GnuCOBOL (i06): the generated Scala's MERGE USING open for `IN-FILE-2` (missing, with a DECLARATIVES handler registered on it) no longer calls that handler anywhere - confirmed by direct codegen inspection, since `file2Err()` (the handler's own section-wrapper method `declarativeHandlerFor` would have resolved to) now appears exactly once in the whole generated program: its own `def` header, never a call site | i06 (fix verified directly; see "addendum" note below for why `i06` does not itself achieve a hard `oracleCompare()` pass) |

**Addendum, discovered while verifying finding 2 (not part of finding 2's own
described scope - it reproduces even with finding 2 fully fixed, and is
unrelated to the DECLARATIVES/FILE-STATUS codegen finding 2 actually
describes):** i06's `MERGE ... OUTPUT PROCEDURE IS EMIT-PARA` (no `THRU`) has
an AT END arm that does `GO TO EMIT-DONE` - a DIFFERENT, later paragraph that
is never part of that OUTPUT PROCEDURE's own range (with no `THRU` clause,
the range is exactly the one named paragraph, per the COBOL standard).
Confirmed directly against installed GnuCOBOL (both via the harness and a
hand-compiled `cobc -x` run of the isolated repro): control never returns to
the statement after MERGE once this fires - real cobc's own i06 oracle stops
at `MERGED=020 BBB`, never printing `MAIN-END`, exit code 0. This is EXACTLY
round-19 finding 2's own already-accepted "GO TO escaping an active PERFORM
... THRU range is a PERMANENT transfer in real COBOL, but this generator's
method-call-based paragraph model can only ever resume normally" limitation
(see the round-19 table above) - just manifested through SORT/MERGE's own
implicit PROCEDURE-clause range instead of an explicit `PERFORM x THRU y`
statement. Per round-19's own deliberate, explicitly-reaffirmed precedent for
declining the large, invasive "thrown control-flow signal + top-level
trampoline" refactor a genuine general fix would require (threading "which
range is lexically active" through every statement-generation call site) -
disproportionate blast radius for what remains a narrow finding - this is
handled the identical HONEST-DECLINE way, reusing the existing mechanism
rather than building a new one: `method-gen.js`'s `annotateGoToThruEscapes`
collection pass (via its caller, `generateAllMethods`) now also treats a
SORT/MERGE INPUT/OUTPUT PROCEDURE clause as an implicit range even with NO
`THRU` at all (`{procedure: X, through: X}` - a one-paragraph range - reuses
the exact same `startIndex === endIndex` range machinery an explicit `PERFORM
X THRU X` would, with zero changes to `annotateGoToThruEscapes` itself), so a
GO TO escaping it gets the identical visible, compiling `TODO(round-19
finding 2)` marker `generateGoTo` already renders for an explicit `PERFORM
... THRU` escape. Runtime behavior is UNCHANGED (i06 still prints the extra
`MAIN-END`, exactly like round-19's own h11 still prints its own extra
`MAIN-DONE`) - only the divergence's visibility improves, from invisible to
grep-able. A SORT/MERGE PROCEDURE clause whose body has no escaping GO TO at
all (the pre-existing g12/h09 `PERFORM UNTIL`/`RETURN` shape - no `GO TO`
anywhere in either) is completely unaffected, confirmed by re-running both
(still `oracleCompare()`-clean).

12 further round-20 probes were valid and already passed/were already honest
before any of the above fixes: the remaining `i01`-`i14` programs not named
above (confirmed unaffected by either fix, re-verified green/honest after
both).

See `tests/round20-fixes.test.js` for focused, toolchain-independent unit
tests of both findings (and the addendum) above.

### Round-21 adversarial-refutation findings (j01-j12) and their fixes

A round-21 refuter found 3 more dishonest divergences, each a hard/silent
failure in a different layer this campaign hadn't exercised yet: the
COPY-statement resolver (a preprocessing step, ahead of the lexer/parser
entirely), RECURSIVE CALL's own LINKAGE SECTION parameter binding, and GO
TO's own OF/IN section qualifier (PERFORM's own qualifier was extended in
rounds 12/14, but GO TO's was explicitly flagged - see "Known gaps" below -
as unaddressed until a program actually needed it). All 3 are now fixed at
their root cause; every promoted program hard-passes `oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `parser/copybook-resolver.js`'s `COPY_PATTERN` regex matched a `COPY <name>[ REPLACING ...].` lookalike sequence ANYWHERE in the source text during its recursive `expand()` pass - including inside a quoted string literal's own `VALUE` text (j05: a copybook declaring `VALUE "SEE COPY DONE."` - ordinary literal content, not a real COPY statement) and, separately, inside an ordinary source comment (j05's own header commentary happens to mention `"COPY DONE."` in prose, with no quotes around it at all on one line - a second, independent way the same purely-textual regex over-matched). `convertToScala()` did not throw on either shape - it silently spliced an unrelated copybook's own record layout into the middle of the literal/comment, corrupting the source with no visible marker anywhere: the resulting Scala still compiled and ran, with `REC1-MSG` silently truncated to `"SEE"` (padded) | Quote-and-comment-aware COPY-statement detection, mirroring - not reinventing - how the rest of this codebase already tracks this exact context during source scanning. New `findQuotedRanges` (`parser/copybook-resolver.js`) walks the text the same way `parser/lexer.js`'s own `Lexer#scanString` does (either quote character opens a literal, a doubled quote of the same kind is an escaped literal quote that stays inside it, an unterminated literal bails at end-of-line - the same fallback `scanString` uses), producing `[start, end)` spans. New `findCommentRanges` mirrors `lexer.js`'s own `detectFormat`/`preprocessFixedFormat`/`preprocessFreeFormat` comment recognition (a fixed-format line whose column-7 indicator is `*`/`/`/`D` is a whole comment line; a free-format inline `*>` strips from there to end of line, honored regardless of detected format, exactly like `preprocessFreeFormat` already does unconditionally). New `replaceOutsideQuotes` (a quote-and-comment-aware drop-in for `text.replace(pattern, replacer)`) skips any `COPY_PATTERN` match whose start index falls inside either range set entirely - the match is left completely untouched, not passed to the replacer at all - and `expand()`'s single `text.replace(COPY_PATTERN, ...)` call now goes through it instead. Applied uniformly at every recursion depth (the same helper handles the top-level source text and each recursively-expanded copybook body), so a lookalike inside a *nested* copybook's own literal is caught exactly the same way as one at the top level. Verified against installed GnuCOBOL (j05): `MSG=SEE COPY DONE.` (the full, un-truncated 20-byte literal), `VAL=005`, `DECOY=OOPS` - three independent, uncorrupted values, matching cobc exactly; confirmed zero regressions on every pre-existing COPY-bearing corpus program (u09, u10, i03, i04, and this round's own j02, all re-verified `oracleCompare()`-clean) | j05 |
| 2 | A RECURSIVE subprogram's LINKAGE SECTION parameter(s) were modeled as a single, object-level (module-scoped) Scala `var` (e.g. `var lsDepth`) - every activation, at every recursion depth, read and wrote the SAME variable, exactly like every other (non-recursive) callable subprogram's LINKAGE item already safely does, since only one activation is ever mid-flight there. A RECURSIVE program can CALL itself while an outer activation is still on the Scala call stack, so the DEEPEST recursive call's own `lsDepth = _arg0` assignment silently clobbered the OUTERMOST frame's own value too: once the deepest call returned, the outer frame's own subsequent statements read the (now-corrupted) shared var instead of its own original parameter (j10, verified against installed GnuCOBOL first: cobc's own WORKING-STORAGE for a RECURSIVE program actually IS shared/static across recursive activations, confirmed reproducible, not assumed - `WS-N` legitimately keeps counting up across all three levels, and even a deeper-level's own `WS-NEXT` writeback legitimately becomes visible through a shallower level's own aliased `LS-DEPTH` - but cobc's LINKAGE SECTION *parameter passing* still keeps the OUTERMOST call's own parameter binding completely distinct, because that outermost call's actual BY REFERENCE argument, `WS-D`, lives in a totally different program/object's storage, never touched by anything inside the recursive subprogram itself: cobc's own oracle shows `EXIT DEPTH=01` for the outermost frame, `EXIT DEPTH=03`/`EXIT DEPTH=03` for the two inner ones - the generated Scala, before this fix, showed `EXIT DEPTH=03` for every single frame, including the outermost) | New `generateRecursiveEntryMethod` (`generator/scala-generator.js`), gated on a new `isRecursiveProgram(ast)` (scans this program's own `PROGRAM-ID ... RECURSIVE.` clause the same tokens-based way `extractProgramName` already resolves the program's own name) AND every one of this program's LINKAGE parameters being a plain scalar (a GROUP LINKAGE parameter falls back to the ordinary `generateEntryMethod` convention entirely - an out-of-scope combination no corpus program exercises, matching this project's established practice of an honest, narrowly-scoped decline over a half-working mixed convention). Real cobc doesn't have this bug because a BY REFERENCE CALL passes the ADDRESS of whatever variable the caller named - each activation's own LINKAGE item is a true alias of that one variable, never a fresh copy; this fix reproduces that aliasing directly instead of copying a value into a module var: `entry(...)` now accepts a getter/setter CLOSURE pair per parameter (`_getN: () => T`, `_setN: T => Unit`), and a local `def <camel>: T = _getN()` / `def <camel>_=(v: T): Unit = _setN(v)` pair (Scala's own getter/setter assignment sugar - the identical pattern round-3 finding 6's REDEFINES-of-GROUP accessor pair already uses) lets every reference to the LINKAGE item elsewhere in the program's body read/write straight through to whichever variable the CURRENT call activation was actually invoked with, with zero changes needed to how `expression-gen.js` reads/writes an ordinary identifier. Because these getter/setter defs are local to `entry()`'s own call - Scala's ordinary per-call parameter/local scoping, no different from any other recursive method - every recursive self-CALL gets its own fresh, independent binding, exactly matching cobc's own per-activation pointer; every paragraph reachable from the entry point is nested as a local `def` *inside* `entry()` itself (new `generateProgramFlowLinesNested`, `generator/method-gen.js` - body-duplicating, reusing `generatePerformThruMethod`'s existing `renderNestedFallthroughDefs` helper verbatim, NOT the ordinary `generateProgramFlowLines`/`renderNestedFallthroughSteps` wrapper that calls shared top-level paragraph methods) so each paragraph's own body closes over THIS SPECIFIC call's own getter/setter defs. `entry()` itself now returns `Unit`, not a value - any assignment to the LINKAGE item anywhere in the body already writes straight back through its setter closure, live, the instant it happens, rather than a single point-in-time round trip after the whole CALL returns. The caller side (`generateCall`, `generator/expression-gen.js`) checks the new `target.recursive` flag (set in `generateMultiProgramScala`'s `CALL_PROGRAM_REGISTRY`-population loop, using the SAME gating condition independently re-derived from that callee's own ast, so both sides always agree on the same convention) and, only for such a target, builds a live getter/setter for a plain BY REFERENCE variable operand (COBOL's default - the shape this fix extends true aliasing to) or a value-snapshot getter with a no-op setter for every other operand shape (BY CONTENT/VALUE, a literal/computed expression, `OMITTED`, or one of the rarer ref-mod/group/subscripted-scalar operand shapes) - matching "the callee's own copy is local to that call" exactly like the ordinary CALL convention already does for those same shapes. WORKING-STORAGE itself is left completely untouched by this fix (still an unconditional shared module `var`, recursive or not) - that sharing is cobc's own confirmed, deliberate behavior to preserve, not a bug. Verified against installed GnuCOBOL (j10): `ENTER DEPTH=01/02/03`, `EXIT DEPTH=03/03/01` (in that exact order) - byte-for-byte matching cobc; confirmed zero regressions on every pre-existing multi-level/DECLARATIVES CALL-chain corpus program (e07, h07, h09, h12, i06, u01, aa05, q09/q09b/q09c, all re-verified `oracleCompare()`-clean) | j10 |
| 3 | `GO TO para OF section` (disambiguating a paragraph name that collides across multiple sections, exactly the same real-world shape `PERFORM para OF section` already resolves per rounds 12/14 - and explicitly flagged, in this very README's own "Known gaps" section below, as GO TO's still-unaddressed counterpart) was never parsed at all: `parseGoToStatement`'s target-collecting loop naturally stops the moment it hits the `OF`/`IN` token (its own reserved-word token type, never `IDENTIFIER`) - but nothing downstream ever consumed that `OF`/`IN` token or the section name after it, so it (and, corrupted from that point on, the rest of the PROCEDURE DIVISION parse) fell straight through every remaining clause check unconsumed. At codegen, `generateGoTo` unconditionally emitted a bare, unqualified `return para()` even where a real qualifier WAS present in-source, since it had nowhere to route one to. j11's own repro (three sections each declaring their own `1000-PARA`) produced a duplicate `def third(): Unit` collision - a downstream symptom of the corrupted parse, not a separate bug - plus the unresolved/wrong `return para()` itself: both a hard scala-cli compile error | Parser: `GoToStatement` (`parser/ast.js`) gained a new `targetSections` array, index-aligned with the pre-existing `targets` array (GO TO's `DEPENDING ON` form can list more than one target - unlike PERFORM's single `targetParagraph`/`throughParagraph` pair, each one can independently carry its own qualifier); `parseGoToStatement` (`parser/procedure-parser.js`) now consumes an optional `OF`/`IN` qualifier immediately after each target it collects, mirroring `parsePerformStatement`'s own pre-existing `targetSection`/`throughSection` handling immediately above it in the same file. Codegen: `generateGoTo` (`generator/expression-gen.js`) now passes each target's own resolved section (or `null`, for an unqualified target - the entire pre-existing corpus) through to `paragraphMethodName(name, sectionName)` - the exact same collision-aware resolver PERFORM's own qualified targets already route through (round-12 bonus finding, z12), which only actually qualifies a bare name by its section when that bare name is genuinely ambiguous (`AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM`, populated once per program by `generateAllMethods` before any GO TO/PERFORM codegen runs) - an unqualified GO TO to a non-colliding name is completely unaffected. A pure addition on both the plain and `DEPENDING ON` forms: an already-collision-free target list is untouched. Verified against installed GnuCOBOL (j11): `START` / `CORRECT-1000-IN-THIRD-SECTION` - the qualifier correctly resolves to the THIRD section's own paragraph, matching cobc exactly, with no duplicate-definition collision anywhere in the generated Scala | j11 |

9 further round-21 probes were valid and already passed/were already honest
before any of the above fixes, confirmed unaffected by all three: `j01` (a
paragraph literally named GOBACK - the identical bug *class* round-20
finding 1 fixed for EXIT/CONTINUE, but for a reserved word round-20's own
narrow `PARAGRAPH_NAME_RESERVED_WORDS` allowlist doesn't cover - this
generator dispatches bare `GOBACK.` in paragraph-name position to the
GOBACK *statement* exactly like cobc's own parser does, so both sides
happen to agree: a blank stdout, since the implicit first paragraph becomes
just that one statement - not a gap this round needed to fix, since nothing
here diverges from cobc), `j02` (MERGE ... USING with three input files,
not just the two every prior MERGE finding tested - existing, already-
working capability, confirmed unaffected), `j03` (GO TO ... DEPENDING ON
falling through to the ordinary next-sentence no-op, in a program that also
has an unrelated DECLARATIVES section registered - two independently-
existing mechanisms, confirmed not to trip over each other), `j04` (a CALL
BY REFERENCE writeback into a table element whose value then drives a
DIFFERENT table's own OCCURS DEPENDING ON count - existing capability,
confirmed to compose correctly), `j06` (PERFORM WITH TEST BEFORE/AFTER
where the loop's own subscript is mutated via a CALL BY REFERENCE
writeback rather than a plain in-line statement - existing TEST BEFORE/
AFTER timing logic, confirmed unaffected by where the mutation textually
lives), `j07` (STRING ... WITH POINTER whose pointer value arrives via a
nested intrinsic FUNCTION call - existing capability, confirmed unaffected),
`j08` (INITIALIZE ... REPLACING on a group with both an OCCURS table and a
sibling REDEFINES - existing capability, confirmed unaffected), `j09` (an
outer SORT whose OUTPUT PROCEDURE calls a subprogram running its own,
separate, independent SORT mid-stream - existing capability, confirmed two
independent SD/sort-work areas active across a CALL boundary don't
interfere with each other), and `j12` (MOVE CORRESPONDING between two
groups whose overlapping field names are declared in a completely different
physical order in each - existing capability, confirmed the field-pairing
logic matches strictly by name, never by positional alignment).

See `tests/round21-fixes.test.js` for focused, toolchain-independent unit
tests of all 3 findings above.

### Round-22 adversarial-refutation findings (k01-k13) and their fixes

A round-22 refuter found 4 more dishonest divergences, each a comma-consumption
parser bug (the same bug CLASS round-7 finding 1a already fixed for CALL ...
USING's own operand list, recurring in three more comma-separated-list shapes
this campaign hadn't exercised yet: GO TO's own multi-target DEPENDING ON list,
and SET's own multi-condition-name list), a copybook REPLACING clause
termination gap one level deeper than round-21 finding 1 already fixed, and
round-21 finding 2's own explicitly-documented "out-of-scope" GROUP LINKAGE
narrowing turned out not to be genuinely honest once actually probed - it
silently reproduced the exact bug round-21 finding 2 fixed for a scalar
parameter, just for a GROUP's children, with no visible marker anywhere. All 4
are now fixed at their root cause; every promoted program hard-passes
`oracleCompare()`.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | Round-21 finding 2's own doc comment (`generateRecursiveEntryMethod`, `generator/scala-generator.js`) explicitly narrowed its getter/setter-closure fix to a RECURSIVE program whose LINKAGE parameter is a plain SCALAR, calling a GROUP LINKAGE parameter an "out-of-scope combination no corpus program exercises" that falls back to the ordinary (non-recursive-safe) shared-module-var convention. Tried for real (k01: a RECURSIVE subprogram whose sole LINKAGE item is a GROUP, `LS-DEPTH-GRP` containing `LS-DEPTH`/`LS-TAG`, called recursively three levels deep, mirroring j10's own shape), this was NOT actually an honest decline - there is no visible marker anywhere, and the generated program silently produced wrong per-activation output: the exact same clobbering bug round-21 finding 2 fixed for a scalar parameter, just for a GROUP's children sharing one module-level var pair instead | Chose option (a) (extending the closure-aliasing convention itself) over option (b) (a visible honest-decline marker) - a GROUP LINKAGE parameter's children are ALREADY flattened to their own individually-named flat Scala vars (`lsDepth`/`lsTag`), exactly like a WORKING-STORAGE group's own children, so the scalar fix's core mechanism (a local getter/setter `def` pair per Scala identifier, closing over a closure built by the caller) generalizes directly to "one such pair per LEAF child" instead of "one pair per parameter" - a comparably-sized change, not a disproportionate one, so the narrower honest-decline route was not needed. New `flattenGroupLeaves` (`generator/expression-gen.js`) flattens a group's own children (recursing into any nested group, mirroring `groupDisplayValueExpr`'s own traversal and bail-out conditions - an OCCURS-bearing child, a FILLER child, or a child with no registered field info at all all still return `null`, the genuinely-unsupported residual case that keeps the ordinary convention) into an ordered `{ camel, scalaType }` leaf list. New `computeParamLeafShapes` (`generator/scala-generator.js`) builds this list for EVERY LINKAGE parameter (a plain scalar trivially being its own one-element list) and is the single shared gating decision both `generateEntryMethod`'s own RECURSIVE check and `generateMultiProgramScala`'s pre-loop `CALL_PROGRAM_REGISTRY` construction independently recompute (mirroring round-21 finding 2's own "both sides must agree" discipline, now also from the ast's own freshly-built registries where the pre-loop runs before any global registry is installed - see `flattenGroupLeaves`'s own registry-parameter defaulting). `generateRecursiveEntryMethod` flattens every parameter's own leaf list together and builds one `_getN`/`_setN` closure pair per leaf (not per parameter), with a local `def <camel>: T`/`def <camel>_=(v: T): Unit` pair per leaf - the callee side is otherwise unchanged. `generateCall`'s own RECURSIVE-target branch (`generator/expression-gen.js`) builds the mirroring per-leaf closures on the caller side: a plain NAMED group operand (REFERENCE or CONTENT/VALUE alike - reading a caller-side child var is always safe, since the caller is blocked for the CALL's whole duration) gets its own per-child live aliasing (`flattenGroupLeaves` again, this time over the CALLER's own group), with only a REFERENCE operand's setter actually writing back; any other shape (no caller-side name, ref-mod'd, subscripted, or a caller/callee leaf-count mismatch) falls back to each leaf's own zero/spaces default and a no-op setter. Verified against installed GnuCOBOL (k01): `ENTER DEPTH=01/02/03`, `EXIT DEPTH=03/03/01` - byte-for-byte matching cobc (including the self-referential aliasing quirk where a deeper activation's own `LS-DEPTH-GRP` IS the same storage as its caller's own `WS-NEXT-GRP`, so writing `WS-NEXT` through `COMPUTE` legitimately mutates that activation's own `LS-DEPTH` too - exactly as j10 already established for the analogous scalar case); confirmed zero regressions on every pre-existing RECURSIVE corpus program (j10, k04, k12, all re-verified `oracleCompare()`-clean) | k01 |
| 2 | `GO TO t1 OF s1, t2 OF s2, t3 OF s3 DEPENDING ON sel` (multiple comma-separated, individually OF/IN-qualified targets - round-21 finding 3 only fixed a SINGLE qualified target) truncated to just the FIRST target: `parseGoToStatement`'s target-collecting loop (`parser/procedure-parser.js`) never listed `TokenType.COMMA` in its own continuation condition, so it stopped dead the instant it saw the separator after the first target - leaving every token from that comma onward (", 1000-PARA OF 3000-THIRD, 1000-PARA OF 4000-FOURTH DEPENDING ON LS-SEL.") completely unconsumed. Those leftover tokens corrupted the rest of the PROCEDURE DIVISION parse exactly the way every other unfixed instance of this bug CLASS in this file already had (round-7 finding 1a): the DEPENDING ON identifier itself (`LS-SEL`) was eventually reached as a bare token immediately followed by a period, satisfying `isParagraphName`'s own pattern - silently splitting the ONE paragraph it appeared in into TWO, with the spurious second paragraph named after that identifier. Since that identifier also names this program's own LINKAGE parameter var, the generated Scala hit a hard `Conflicting definitions: var lsSel: Int ... and def lsSel(): Unit` compile error - not a silent wrong answer this time, but still a codegen-corruption bug, not (as the parser's own shape might first suggest) a synthetic-name-collision-avoidance bug: the paragraph split itself is the actual defect (GO TO ... DEPENDING ON does not, and should not, ever split its own enclosing paragraph in two) - once the whole DEPENDING ON clause parses correctly as ONE statement, no second paragraph is ever spuriously created at all, so there is no synthetic name to rename in the first place | `parseGoToStatement`'s target-collecting `while` loop now also matches/consumes `TokenType.COMMA` (mirroring `parseCallStatement`'s own pre-existing CALL ... USING comma-handling, round-7 finding 1a, and round-22 finding 4's identical fix for SET below) - a comma between targets is skipped and the loop continues to the next target; a comma-FREE multi-target list (COBOL's targets are comma-OPTIONAL - already exercised by `tests/round21-fixes.test.js`'s own DEPENDING ON regression test, space-separated with no commas at all) is completely unaffected, since the loop's pre-existing IDENTIFIER-driven continuation already handled that shape correctly. Verified against installed GnuCOBOL (k02): `SEL=1`/`CHOSEN-SECOND`, `SEL=2`/`CHOSEN-THIRD`, `SEL=3`/`CHOSEN-FOURTH`, `SEL=4`/`NO-MATCH-FALLTHROUGH` - matching cobc exactly, with `lsSel` now declared exactly once (a plain `var`, no colliding spurious paragraph method); confirmed zero regressions on every pre-existing GO TO ... DEPENDING ON corpus program (p14, j03, j11, all re-verified `oracleCompare()`-clean) | k02 |
| 3 | `parser/copybook-resolver.js`'s `COPY_PATTERN` regex captured a REPLACING clause via `(REPLACING\s+[\s\S]*?)?\.` - a non-greedy capture that terminates at the FIRST literal `.` character it finds, full stop, with no quote-awareness of its own at all. Round-21 finding 1 only made the COPY-statement's own START detection quote-aware (a lookalike match beginning inside a pre-existing quoted literal is skipped entirely) - the REPLACING clause's own internal termination search was a completely separate mechanism, never touched by that fix. A REPLACING pair whose own BY-text is a quoted literal containing an embedded, doubled-quote-escaped period (k03: `REPLACING ==:QVAL:== BY =="IT""S COPY DONE."==` - the COBOL doubled-quote convention for a literal quote character inside a literal, chosen so the literal's own text reads exactly like j05's own COPY-lookalike, "COPY DONE.", becoming "safe" text only once substitution has actually happened) hit this blind spot directly: the capture stopped at the period right after "DONE" and before the closing quote, silently truncating the REPLACING clause and dropping the second pair (and anything after it) entirely | Restructured COPY-statement matching from one all-in-one regex into the two-step process this class of bug always needs: `COPY_HEADER_PATTERN` now matches ONLY the statement's header (copybook name + optional OF/IN library qualifier), never attempting to capture through to the REPLACING clause/terminating period at all. New `findStatementEnd` (`parser/copybook-resolver.js`) finds the TRUE terminating period - the first `.` character whose own index does NOT fall inside a quoted literal or a comment, reusing the exact same `findQuotedRanges`/`findCommentRanges` ranges COPY-statement detection's own quote-awareness (round-21 finding 1) already computes - and new `replaceCopyStatements` (replacing the old generic `replaceOutsideQuotes`, no longer needed once the single-regex approach was retired) drives the whole scan: a header match, then a quote-aware search for that statement's own real end, then everything between them is either blank (a plain `COPY NAME.`) or the REPLACING clause text, extracted by a simple bounded slice - no regex needs to "know" where the clause ends anymore, since `findStatementEnd` already found that boundary correctly. Verified against installed GnuCOBOL (k03): `MSG=IT"S COPY DONE.` (the full pair correctly applied, including the escaped embedded quote), `DECOY-IN-CPY=ANOTHER COPY DONE X` (the copybook's OWN sibling field, physically after the substituted token, still recognized correctly - the post-substitution quote/comment scan isn't thrown off by whatever quote characters the substitution itself introduced), `DECOY=OOPS` (the real, unrelated top-level `COPY DONE.` still expands) - all three matching cobc exactly; confirmed zero regressions on every pre-existing COPY-bearing corpus program (u09, u10, i03, i04, j02, j05, all re-verified `oracleCompare()`-clean) | k03 |
| 4 | `SET condition-name-1, condition-name-2 TO TRUE` (a comma-separated list of MULTIPLE condition-names in one SET - round-1 finding 2 only fixed the single-condition-name form) truncated to just the FIRST name, for the identical structural reason as finding 2 above: `parseSetStatement`'s target-collecting loop (`parser/procedure-parser.js`) never listed `TokenType.COMMA` either, so it stopped after `FLAG-A-ON` the instant it saw the comma before `FLAG-B-ON` - `stmt.value`/`stmt.setType` were never even set (the very next token was a comma, not `TO`/`UP`/`DOWN`), and the leftover tokens (", FLAG-B-ON TO TRUE.") corrupted the rest of the parse the same way, surfacing at codegen as a bare, valueless `flagAOn = ` assignment immediately followed by an `UnknownStatement` marker | `parseSetStatement`'s target-collecting `while` loop now also matches/consumes `TokenType.COMMA` (the identical fix pattern as finding 2 above and round-7 finding 1a). `generateSet` (`generator/expression-gen.js`) already iterated `statement.targets` independently for each one, running round-1 finding 2's own "assign the condition's parent field its own first declared VALUE" logic per target unconditionally - it only ever needed this parser-side fix to see more than one target in the `stmt.targets` array in the first place; no codegen change was needed at all. Verified against installed GnuCOBOL (k11): `BEFORE A=N B=N` / `AFTER A=Y B=Y` - both parent fields correctly set to their own respective condition's VALUE, matching cobc exactly; confirmed zero regressions on every pre-existing SET-condition-name corpus program (r14, r14b, both re-verified `oracleCompare()`-clean) | k11 |

9 further round-22 probes were valid and already passed/were already honest
before any of the above fixes, confirmed unaffected by all four: `k04` (MUTUAL
recursion - two different RECURSIVE-adjacent programs CALLing each other five
levels deep, neither ever writing back through its own LINKAGE parameter -
isolates the per-program recursive-entry codegen path itself from round-21
finding 2's own BY-REFERENCE-aliasing mechanism; both stay correctly
independent), `k05` (a DECLARATIVES handler registered for a file the rest of
the program never OPENs or otherwise touches at all - a "dead declarative";
existing registration codegen already tolerates a file with no runtime
open/close state ever created), `k06` (MOVE/ADD CORRESPONDING between two
groups with genuinely different field COUNTS, not just a different field
order - the field-pairing logic already matches strictly by name and silently
ignores any non-matching field on either side, in both directions), `k07`
(PERFORM UNTIL vs PERFORM WITH TEST AFTER UNTIL, same already-true starting
condition - existing TEST BEFORE/AFTER timing logic already produces the
correct zero-vs-one-iteration contrast), `k08` (SEARCH ALL against a
zero-length OCCURS DEPENDING ON table - the AT END branch already fires
immediately with no WHEN ever evaluated against a nonexistent element), `k09`
(an intrinsic FUNCTION call used directly as a table subscript expression,
with no intermediate helper variable - existing subscript-expression codegen
already handles a full expression, not just a bare identifier/literal, in
subscript position), `k10` (plain linear SEARCH, not SEARCH ALL, against the
same zero-length-table shape as k08 - existing linear SEARCH codegen already
handles an empty table correctly too), `k12` (STOP RUN fired from inside a
depth-3 RECURSIVE CALL activation - real cobc's STOP RUN terminates the whole
run unit regardless of call/recursion depth, and the generated Scala's own
`sys.exit(0)` already does the same, unwinding every nested `def` on the
JVM call stack at once, correctly suppressing every enclosing
activation's own remaining statements), and `k13` (INITIALIZE of a group whose
OCCURS DEPENDING ON table is currently zero-length - the existing live-count
per-element reset loop already handles a zero live count as a trivial no-op
loop, with sibling fields still reset correctly and the table left usable
afterward).

See `tests/round22-fixes.test.js` for focused, toolchain-independent unit
tests of all 4 findings above.

### Round-23 adversarial-refutation findings (l01-l13) and their fixes

A round-23 refuter found 4 more dishonest divergences, all tracing back to the
RECURSIVE-program/group-LINKAGE machinery rounds 21-22 introduced
(`generateRecursiveEntryMethod` and friends, `generator/scala-generator.js`):
the getter/setter LOCAL-def convention that whole mechanism rests on turned
out to have never actually been exercised with a real write anywhere in this
campaign (every prior RECURSIVE-with-writeback program only ever computed a
NEW value into a separate WORKING-STORAGE variable and passed THAT onward -
none assigned directly to the LINKAGE parameter identifier itself within the
same activation), and both of round-22 finding 1's own documented
`flattenGroupLeaves` bail-out cases (an OCCURS child, a FILLER child) turned
out to have two DIFFERENT failure modes once actually probed - one a silent
infinite recursion, the other a silent reproduction of the exact clobbering
bug round-21/22 already fixed twice before. All 4 are now fixed at their
root cause; every promoted program hard-passes `oracleCompare()` except
`l10`, a **deliberate** `t.todo(...)` entry (see below - the same
"honest, out-of-scope decline" shape as `r1303c`/round-13 finding 1, not a
regression).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | **Root cause of l12/l04's compile failure**: `generateRecursiveEntryMethod`'s own doc comment claimed Scala's assignment-operator desugaring (`x = y` -> `x_=(y)`) would let ordinary generated code read/write a RECURSIVE program's LINKAGE-aliased local `def <camel>: T` / `def <camel>_=(v: T): Unit` pair transparently, "with zero changes needed to how expression-gen.js reads/writes an ordinary identifier." Never true: independently re-verified against the ACTUAL generated Scala for l12 (a minimal single-self-recursive-program repro, `SUBTRACT 1 FROM LS-N` - a direct write to its own LINKAGE parameter) with scala-cli, confirming a hard `Reassignment to val lsN` compile error, then bisected with standalone scala-cli snippets down to the precise Scala semantics: assignment-sugar desugaring only fires for a `def x`/`def x_=` pair that are MEMBERS of an enclosing template (a class/object/trait) - even an *unqualified* reference to such a pair (relying on an implicit `this`) desugars correctly (confirmed with a minimal object-member snippet) - but a **local** `def x`/`def x_=` pair declared directly inside a method body (exactly what `generateRecursiveEntryMethod` emits - these getter/setter defs are local to `entry()`'s own call, never members of any object) is not a template member, so the compiler never looks for an `x_=` companion at all: `x = y` there is parsed as a doomed attempt to reassign the (immutable, val-like) local def `x` itself. A genuine Scala language limitation, not a narrower generation bug (bad nesting/naming collision/incorrect def syntax) - confirmed by isolating a single-level-nested local def pair with no other change and reproducing the identical error | Centralized, not per-statement-type: the explicit method-call form `x_=(y)` compiles and runs correctly for a local def pair (confirmed with its own minimal snippet - it needs no template-member lookup at all, it's an ordinary method call), so every write site was changed to emit that form instead of teaching Scala to do something it fundamentally does not do for locals. New `RECURSIVE_LEAF_NAMES` (`generator/expression-gen.js`) is the set of camelCase identifiers currently aliased as local getter/setter def pairs inside the CURRENT program's own `entry()` - installed (and reset to empty in a `finally`) around each `generateRecursiveEntryMethod` call site (`generateEntryMethod`, `generator/scala-generator.js`), populated from the exact same `paramLeafShapes.flat()` list that call site already builds. New `assignExpr(camel, valueExpr)` is the single shared "write a plain camelCase Scala identifier" primitive - checks `RECURSIVE_LEAF_NAMES` and emits `<camel>_=(value)` instead of `<camel> = value` when the name is aliased. `renderAssignment` (the shared low-level assignment-rendering helper every statement generator - MOVE/ADD/SUBTRACT/COMPUTE/STRING/UNSTRING/ACCEPT/INITIALIZE/SET, etc. - already funnels through, per rounds 16-19's own precedent) now calls `assignExpr` instead of building `${camel} = ${valueExpr}` directly, in both its string-target and plain-scalar branches - a single, centralized fix rather than touching every statement type individually. Three MORE bare-assignment string-building call sites, all in `generateCall`'s own CALL-boundary closure/writeback construction (not statements `renderAssignment` ever sees), needed the identical treatment since a RECURSIVE program's own LINKAGE-aliased variable can ALSO be the operand of a CALL it makes (to itself, a sibling, or an ordinary non-recursive callee) - `generateCall`'s RECURSIVE-target closure-building branch (both the plain-scalar and the per-leaf GROUP-child cases) and its ordinary-target `renderWriteback`/single-writer-scalar branches all now route their setter-lambda-body/writeback text through `assignExpr` too. Verified against installed GnuCOBOL and re-compiled with scala-cli (l12): `ENTER N=03/02/01/00`, `EXIT N=00` x4, `MAIN N AFTER=00` - byte-for-byte matching cobc; l04 (a 3-program mutual-recursion cycle - A calls B calls C calls A - that also layers the writeback-aliasing check k04 deliberately skipped, each unwinding level reading its own `WS-NEXT` mutation back through its own `LS-N`) matches cobc exactly too (`A ENTER N=003` ... `MAIN N AFTER=677`); confirmed zero regressions on every pre-existing RECURSIVE corpus program's own read-only/computed-writeback LINKAGE references (j10, k01, k04, k12, all re-verified `oracleCompare()`-clean end to end with scala-cli) | l12, l04 |
| 2 | A RECURSIVE program's GROUP LINKAGE parameter containing an OCCURS-bearing child (`flattenGroupLeaves`'s first documented bail-out case) falls back to the ordinary (non-recursive-safe) `generateEntryMethod` convention, per round-22 finding 1's own doc comment - but that fallback's own group-parameter SCATTER (the code that copies the incoming CALL argument into the callee's own flat vars) was ALREADY a silent no-op (`() // TODO: ... - value left unchanged`) whenever `scatterGroupFromString` itself also bails (l10: `LS-ITEMS`, the OCCURS table, makes `scatterGroupFromString` bail for the WHOLE group, not just that one child - `if (c.nameUpper && TABLE_REGISTRY.has(c.nameUpper)) return null`). For an ordinary non-recursive callee this is a harmless (if not byte-accurate) "compiles and runs to completion" decline, since it only ever runs once per CALL - but l10's own `LS-DEPTH` (the program's OWN recursion loop-guard field) lives in the SAME group as the un-scatterable `LS-ITEMS`, so it too is silently never updated across the recursive CALL boundary: it stays frozen at its module-var default (0) forever, and `IF LS-DEPTH < 3 THEN CALL ...` becomes permanently true - genuine infinite recursion, confirmed reproducible as a real `StackOverflowError` (directly contradicting `tests/oracle/README.md`'s own README - see the Known Gaps update below - which only ever documented this fallback's non-recursive "compiles and runs to completion, but... not byte-accurate" behavior, never a hang) | **Honest, VISIBLE decline that terminates, not full correctness** (matching round-13 finding 1's own explicitly-out-of-scope precedent for this exact shape - true byte-level marshalling of an OCCURS-bearing GROUP across a CALL boundary stays out of scope, for the recursive case exactly as much as the non-recursive one). `generateEntryMethod`'s group-scatter fallback (`generator/scala-generator.js`) now branches on `isRecursiveProgram(ast)`: an ORDINARY (non-recursive) callee keeps the EXACT pre-existing silent no-op (never loops, so nothing to fix there - unaffected, zero regression risk for round-13's own `r1303c`), but a RECURSIVE program's own entry() now `throw`s a `NotImplementedError` with a full explanation instead, so EVERY activation (including the very first, outermost CALL) fails fast and loud, before ever reaching whatever recursive CALL this unresolvable parameter would otherwise have silently fed forever - a hang/resource-exhaustion crash (StackOverflowError, after however many thousand frames the JVM allows, with a stack trace that gives no hint WHY) is strictly worse than an immediate, clearly-labeled decline. Verified against installed GnuCOBOL and scala-cli (l10): before the fix, `scala-cli run` crashes with a genuine `StackOverflowError` (confirmed reproducible); after the fix, it fails immediately with `scala.NotImplementedError: CALL ... USING LS-DEPTH-GRP: group parameter scatter not supported for this shape ... on a RECURSIVE program - declining honestly here instead of silently leaving this program's own loop-guard field frozen at its default forever (genuine infinite recursion)` - a clean, immediate, explained failure instead of a resource-exhaustion hang. **Deliberately left as a `t.todo(...)` entry, not promoted to a hard pass** - l10 exercises a documented, intentional gap (the same reasoning as every other "Known gaps" entry in this file): a program exercising this gap is EXPECTED to fail `oracleCompare()` (real cobc's own output shows the fully-correct 3-level `ENTER/EXIT DEPTH=`/`I1=`/`I2=` trace, which this decline does not attempt to reproduce), and forcing a byte-exact match here was never the goal - only replacing a silent hang with a visible, honest failure was. Confirmed zero regressions on every pre-existing non-recursive group-with-OCCURS CALL corpus program (the `isRecursiveProgram(ast)` branch is false for all of them, so they hit the exact same code path as before, byte for byte) | l10 |
| 3 | A RECURSIVE program's GROUP LINKAGE parameter containing a FILLER child (`flattenGroupLeaves`'s SECOND documented bail-out case) falls back to the same ordinary convention as finding 2 above - but unlike the OCCURS case, `scatterGroupFromString` does NOT bail for a FILLER child (it already reads/writes a FILLER's own hidden `_fillerN` var, populated by `buildFieldRegistry`, exactly like any other named leaf - `flattenGroupLeaves`'s FILLER bail-out, unlike `scatterGroupFromString`'s, was never actually load-bearing). So l11's own CALL-argument scatter DOES correctly copy per-call values into `lsDepth`/`_fillerN`/`lsTag` on every activation - but since it's still the ORDINARY (non-recursive-safe) convention, that scatter target is a SHARED module-level var, not a per-activation alias: the deepest recursive activation's own writeback silently clobbers the outermost frame's own value, EXACTLY the pre-round-21 scalar clobbering bug and the pre-round-22 GROUP clobbering bug, reproduced a third time for a FILLER-bearing GROUP specifically (l11's own oracle: the outermost frame must read back `EXIT DEPTH=01 TAG=TOP` even after two deeper activations both correctly show `EXIT DEPTH=03 TAG=SUB` - the pre-fix generated Scala showed `DEPTH=03 TAG=SUB` for all three, including the outermost) | **Real fix, extending the exact same per-activation closure-aliasing mechanism, not a new decline** - unlike l10's OCCURS case (which has no single flat-var leaf to alias at all for the un-flattenable child), a FILLER child's underlying storage is a completely ordinary flat var (`_fillerN`) that just happens to have no COBOL-level name; `buildFieldRegistry` already gives it exactly the same `{ camel, info }` shape as any named sibling in `groupRegistry`'s own per-child entries (only its `isFiller: true` tag distinguishes it) - `scatterGroupFromString`'s own indifference to that tag is WHY it never needed to bail here in the first place. `flattenGroupLeaves` (`generator/expression-gen.js`) now does the same: a FILLER child (`c.isFiller`) is flattened into its own leaf using its existing hidden `_fillerN` camel/info instead of bailing to `null` for the WHOLE group, giving it the SAME per-call-activation getter/setter closure pair every other leaf gets (`generateRecursiveEntryMethod`/`generateCall`'s RECURSIVE-target branch, unchanged otherwise) - a synthetic internal identifier that's never exposed to any COBOL-level reference (since none can name it), scoped per-call exactly like every other leaf. An OCCURS-bearing child (l10's own shape) is unaffected - it still bails to `null`, the genuinely-unsupported residual case with no single flat-var leaf to alias at all. Verified against installed GnuCOBOL and scala-cli (l11): `ENTER DEPTH=01/02/03 TAG=TOP/SUB/SUB WS-N=01/02/03`, `EXIT DEPTH=03/03/01 TAG=SUB/SUB/TOP WS-N=03/03/03` - byte-for-byte matching cobc (the outermost activation's own `LS-DEPTH`/`LS-TAG` correctly survive both deeper activations' own writes, while `WS-N`, genuine shared WORKING-STORAGE, legitimately keeps counting up across all three, exactly like j10/k01 already established); confirmed zero regressions on k01 (the non-FILLER GROUP LINKAGE case this extends) | l11 |

9 further round-23 probes were valid, confirmed unaffected by all three
production fixes above (finding 2's own fix only changes behavior for the
one genuinely-broken shape it targets - an ORDINARY, non-recursive callee's
group-scatter fallback is byte-for-byte unchanged): `l01` (a RECURSIVE
program's GROUP LINKAGE parameter with a NESTED sub-group - `LS-DEPTH-GRP`
containing elementary `LS-DEPTH` AND a nested `LS-INNER-GRP` with its own
two elementary children - no OCCURS/FILLER anywhere in it, `flattenGroupLeaves`'s
own recursion into a nested `c.groupKey` child, untested by k01's own flat
two-child group; re-verified with scala-cli: matches cobc exactly, confirming
the nested-group leaf flattening produces correct independent per-activation
values one level deeper than k01 already established, not silently
reused/clobbered storage for the nested sub-group's own children), `l02`
(the identical qualified multi-target `GO TO t1 OF s1, t2 OF s2 DEPENDING ON
WS-SEL` shape round-22 finding 2 fixed for a LINKAGE selector (k02), here
with an ORDINARY WORKING-STORAGE selector instead, in a program with no
CALL/LINKAGE/GOBACK at all - confirms the comma-consuming parser fix isn't
somehow dependent on the selector being a LINKAGE parameter, and that
`WS-SEL` itself is never misinterpreted as a spurious paragraph name;
re-verified with scala-cli: matches cobc exactly), `l03` (a copybook
pseudo-text (`==...==`) REPLACING pair with NO quoted literal on either side
- a multi-word clause substituted in for a single placeholder token, COBOL's
ordinary "parameterize a PICTURE/VALUE clause via copybook" idiom, distinct
from k03/j05's own narrower identifier-prefix substitution use of pseudo-text
- existing REPLACING/COPY machinery, re-verified with scala-cli AND its own
`.copybooks.json` fixture: matches cobc exactly), `l05` (a dynamic
`CALL <data-name>` whose data-name's runtime VALUE happens to match a sibling
PROGRAM-ID this same source defines - the exact "coincidental match" scenario
round-7 finding 1c's own Known Gap text explicitly calls out as untried;
confirmed this generator's existing decline (the same "external subprogram
not available for conversion" TODO-marker path a genuinely-unresolvable
dynamic CALL already takes, since resolving a data-name's runtime value
against a sibling PROGRAM-ID is explicitly out of scope) is a genuinely
HONEST one - a visible, distinguishable `AFTER X=007` (the argument
correctly left unchanged, since the CALL was skipped) rather than a silently
wrong "looks like it worked" result mimicking `L05SUB`'s own real mutation -
an EXPECTED `oracleCompare()` mismatch against cobc's own `AFTER X=107`, not
a new regression; still an honest, already-documented decline, exactly as
before this round), `l06`/`l13` (a `PERFORM ... VARYING ... AFTER` whose
INNER index's own UNTIL bound depends on the OUTER index's live,
per-iteration value - a triangular/staggered iteration space, `l13` nesting
a THIRD such dependent index one level deeper still - distinct from every
prior multi-AFTER PERFORM corpus program's fixed, mutually-independent inner
bounds; re-verified with scala-cli: both match cobc exactly, confirming the
inner UNTIL condition is correctly re-evaluated against the outer variable's
current value on every outer iteration, never a value snapshotted once
up front), `l07` (an out-of-line, call/return-semantics PERFORM issued FROM
inside a DECLARATIVES handler INTO an ordinary paragraph physically declared
OUTSIDE the DECLARATIVES range - distinct from every prior DECLARATIVES
corpus program, none of which PERFORM out of their own handler body at all;
re-verified with scala-cli: matches cobc exactly, confirming control
correctly returns to the statement right after the PERFORM once the outside
paragraph finishes), `l08` (two level-88 condition-names attached directly to
a REDEFINES item itself, not the base item being redefined - existing
REDEFINES/condition-name machinery, re-verified with scala-cli: matches cobc
exactly), `l09` (EVALUATE with a THRU range over an ALPHANUMERIC subject - a
lexicographic/collating-sequence bound check rather than the arithmetic one
every prior EVALUATE-THRU corpus program exercises - re-verified with
scala-cli: matches cobc exactly).

See `tests/round23-fixes.test.js` for focused, toolchain-independent unit
tests of all 3 production-code findings above (finding 2's own decline is
exercised there too, asserting the `NotImplementedError` marker text rather
than a full run, since l10 is a deliberate `t.todo(...)`, not a hard pass).

### Round-24 adversarial-refutation findings (m01-m14) and their fixes

A round-24 refuter found 5 more dishonest divergences. Two of them (m01, m02)
were the SAME bug round-23 finding 1 fixed - a fourth and fifth independent
call site that builds a bare `<camel> = <expr>` assignment string directly,
bypassing the shared `assignExpr` helper that call site's own doc comment
already promised every such site would go through. Rather than patch just
those two and wait for a round-25 refuter to find a sixth, this round did a
full audit of `generator/` for every remaining bare-assignment-string call
site and fixed the whole class at once (see finding 1 below for the complete
list). The other 3 findings (m04, m08, m10) are unrelated, independent gaps
in UNSTRING's own comma-list parsing, CALL's own BY-REFERENCE aliasing model,
and FD record default values, respectively. All are now fixed at their root
cause (m10 via a deliberate, documented honest decline rather than a full
fix - see finding 3 below for why); every promoted program hard-passes
`oracleCompare()` except `m10` itself, a **deliberate** `t.todo(...)` entry
(the same "honest, out-of-scope decline" shape as `l10`/round-13 finding 1,
not a regression).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | **Centralization-gap audit.** Round-23 finding 1's own `assignExpr` helper (`generator/expression-gen.js`) was only ever wired into `renderAssignment` and 3 call sites inside `generateCall`'s own CALL-boundary closure/writeback construction - it was never actually threaded through EVERY place that builds a "write a plain camelCase Scala identifier" string, despite that finding's own doc comment implying otherwise. `initializeAssignmentLines` (INITIALIZE's own unsubscripted-leaf codegen, m01: `INITIALIZE LS-GRP` on a RECURSIVE program's own GROUP LINKAGE parameter) and `generateMoveCorresponding` (MOVE CORRESPONDING's own per-pair codegen, m02: `MOVE CORRESPONDING LS-SRC TO LS-SRC`) each independently built a bare `${camel} = ${expr}` string - the SAME "Reassignment to val" hard compile error round-23 finding 1 fixed everywhere else, reproduced a 4th and 5th time. A full audit of every other statement generator in `generator/` (not just the two reported repros) turned up several MORE bypasses, none previously reported: `generateGroupMove` (a plain, non-CORRESPONDING group-to-group MOVE), `renderCamelAssignment`'s own unsubscripted branch (used by `generateReturn`'s INTO target AND, through it, by `generateAddCorresponding`/`generateSubtractCorresponding`'s own target write), `scatterGroupFromString` (the CALL BY REFERENCE group-writeback primitive, both its String and numeric branches - reused by `generateEntryMethod`'s own group-parameter scatter, `generateCall`'s ordinary-target group writeback, AND `generateScalarIntoGroupMove`'s MOVE-into-group path, so ONE fix here covers all three callers at once), `generateRelease`'s FROM writeback, `generateReturn`'s own SD-record-field scatter, `generateMergeUsingFileLines`'s USING-file-to-SD-record copy, `readAssignLines` (READ INTO's own elementary/group destination, both branches), `generateSet`'s level-88 TRUE/FALSE branches (SET condition-name TO TRUE/FALSE's own parent-field write), `generateInspect`'s TALLYING counter increment (all 3 sub-types: CHARACTERS/ALL/LEADING), the FILE STATUS writeback in `generateReadStatement` (all 4 sites) and `generateWriteStatement` (`statusSuffix`), `generateSearch`'s own `VARYING identifier-2` index increment (SEARCH ALL's own index was confirmed unreachable here - see below), and - in a completely different file, `generator/method-gen.js` - PERFORM VARYING's own loop-control-variable init/increment (`generatePerformFromAST`'s `initLines` and `generateVaryingNest`'s own FROM-init/BY-increment/deeper-level-reset lines, all 5 sites), which needed a NEW import of `assignExpr` from `expression-gen.js` since it had never needed anything from `RECURSIVE_LEAF_NAMES`'s own machinery before. Two sites were deliberately investigated and confirmed to NOT need this fix, not merely overlooked: ADD/SUBTRACT/MULTIPLY/DIVIDE/COMPUTE's own GIVING-target write (already routes through `renderAssignment` - verified line by line, matching m05's own already-passing status) and SEARCH ALL's own index variable (`tinfo.indexed[0]`, an OCCURS table's INDEXED BY name - COBOL's SEARCH ALL has no VARYING clause of its own, and any OCCURS-bearing LINKAGE parameter already falls back to the ordinary, non-aliased convention entirely per round-23 finding 2's own `flattenGroupLeaves` TABLE_REGISTRY bail-out, so this identifier can never be a `RECURSIVE_LEAF_NAMES` entry in the first place - confirmed unreachable, not fixed defensively) | Every site above now calls `assignExpr(camel, valueExpr)` instead of building `${camel} = ${valueExpr}` directly - the exact same centralized primitive round-23 finding 1 introduced, just actually wired through everywhere this time. No new mechanism: `assignExpr` itself is unchanged, still checking the same `RECURSIVE_LEAF_NAMES` set and emitting `<camel>_=(value)` only for a name currently aliased as a RECURSIVE program's own local getter/setter `def` pair - every one of these fixes is a pure no-op (byte-for-byte identical generated Scala) for every pre-existing corpus program, since `RECURSIVE_LEAF_NAMES` is empty outside a RECURSIVE program's own `entry()` body. `renderCamelAssignment`'s fix (`generator/expression-gen.js`) automatically also fixes `generateAddCorresponding`/`generateSubtractCorresponding`, which already routed their own target write through it. `scatterGroupFromString`'s fix automatically also fixes its 3 separate callers (`generateEntryMethod`'s group-parameter scatter, `generateCall`'s ordinary-target group writeback, `generateScalarIntoGroupMove`). `method-gen.js` gained a new named import of `assignExpr` from `expression-gen.js` (previously imported nothing from that module's own RECURSIVE-aliasing machinery). Verified against installed GnuCOBOL and re-compiled with scala-cli (m01): `INITIALIZE LS-GRP` (a GROUP LINKAGE parameter, `LS-A`/`LS-B`) on a RECURSIVE program correctly resets to 0/spaces on entry and leaves the outermost frame's own values undisturbed by deeper activations - matches cobc exactly; (m02): `MOVE CORRESPONDING LS-SRC TO LS-SRC` writes through the explicit setter form and matches cobc exactly. Every one of the OTHER, not-previously-reported bypass sites above was independently exercised via `tests/round24-fixes.test.js` (PERFORM VARYING and SET-condition-name cases) rather than a dedicated `.cbl` repro, since the underlying mechanism is identical to m01/m02's own and no corpus program happens to combine RECURSIVE LINKAGE with, e.g., a raw group-to-group MOVE or a FILE-STATUS-bearing READ; confirmed zero regressions on every pre-existing RECURSIVE corpus program (j10, k01, k04, k12, l04, l11, l12, m03, m05, m06, m07, m09, m14, all re-verified `oracleCompare()`-clean) | m01, m02 |
| 2 | (m04) `UNSTRING ... INTO target1, target2, target3` (comma-separated INTO targets - commas are optional noise words between list items throughout COBOL, exactly like every other comma-separated list this campaign has already fixed) truncated to just the FIRST target, for the identical structural reason as round-22 findings 2/4: `parseUnstringStatement`'s INTO-collecting `while` loop (`parser/procedure-parser.js`) never listed `TokenType.COMMA` in its own continuation condition, so it stopped dead the instant it saw the separator after the first target - leaving every token from that comma onward completely unconsumed. Those leftover tokens corrupted the rest of the PROCEDURE DIVISION parse the same way every other unfixed instance of this bug class already had: the second target's own identifier token was eventually reached as a bare token followed by a period-adjacent context, satisfying `isParagraphName`'s pattern - silently splitting the enclosing paragraph into two, with the spurious second paragraph colliding with that identifier's own declared var, a hard `Conflicting definitions` compile error (m04's own repro combines this with a RECURSIVE program's own GROUP-adjacent LINKAGE parameters specifically to also regression-test that `generateUnstring`'s own per-target `renderAssignment` calls correctly route BOTH writes through the getter/setter closure mechanism once the parse itself is fixed) | `parseUnstringStatement`'s INTO-collecting `while` loop now also matches/consumes `TokenType.COMMA` (the identical fix pattern as round-22 findings 2/4 and round-7 finding 1a) - a comma between INTO targets is skipped and the loop continues to the next target; a comma-free INTO list (space-separated, the entire pre-existing corpus) is completely unaffected. UNSTRING's other comma-separated-list-shaped clause (`DELIMITED BY [ALL] id-1 [OR [ALL] id-2 ...]`) was also checked and confirmed NOT to have this gap - its alternatives are separated by the required keyword `OR`, never a comma, so there was nothing to fix there. Verified against installed GnuCOBOL and scala-cli (m04): `ENTER N=02/01/00 A=[AAA] B=[BBB]` at every recursion depth, `EXIT N=00 A=[AAA] B=[BBB]` x3, `MAIN A=[AAA] B=[BBB]` - both INTO targets correctly populated and correctly aliased across the RECURSIVE CALL boundary, matching cobc exactly; confirmed zero regressions on every pre-existing UNSTRING corpus program (its own `.length > 0` continuation condition for a comma-free list is untouched) | m04 |
| 3 | (m10) `CALL "M10SUB" USING WS-X, WS-X` - the SAME caller-side variable named as TWO different USING arguments to ONE CALL. Real cobc's BY REFERENCE semantics pass the ADDRESS of `WS-X` for both `LK-A` and `LK-B`, so they are the SAME storage for the whole call - `ADD 500 TO LK-A` is immediately visible reading `LK-B` (`AFTER-ADD A=0600 B=0600`), and a later `MOVE 999 TO LK-B` is immediately visible reading `LK-A` too (`AFTER-MOVE A=0999 B=0999`) - even from INSIDE the callee's own body, not just after the call returns. This generator's ordinary (non-recursive) CALL convention scatters each USING argument into its own INDEPENDENT module-level var inside the callee (`generateEntryMethod`), so `lkA`/`lkB` behave as if they were different storage: the callee's own internal `DISPLAY`s would show `A=0600 B=0100` then `A=0600 B=0999` - silently wrong, diverging the instant either parameter is written, with no marker anywhere | **Investigated a real fix, judged too large a change for this round, and implemented the documented narrower alternative instead.** A true fix would generalize round 21-23's getter/setter-closure aliasing mechanism (built specifically for a RECURSIVE program's own self-CALL) to EVERY ordinary CALL - every non-recursive callee's `entry()` would need to accept closures for its LINKAGE parameters unconditionally, not just when self-recursing, and every paragraph would need to become a nested `def` closing over them (`generateProgramFlowLinesNested`, currently only used by the RECURSIVE convention) - a change of comparable size to that whole mechanism, applied across the ENTIRE non-recursive CALL corpus (the overwhelming majority of this project's CALL-handling code), with correspondingly large regression risk for a single narrow repro. Chose the honest-decline route instead (matching round-13 finding 1/round-23 finding 2's own precedent for a disproportionately large fix): new `duplicateByReferenceCallArgNames` (`generator/expression-gen.js`) detects, at the CALL site, whether any caller-side variable name is passed BY REFERENCE (COBOL's default) more than once in the SAME CALL's USING list - gated on `!target.recursive`, since a RECURSIVE target's own closures already alias this exact shape correctly for free (both USING positions resolve to the SAME caller-side Scala identifier, so their getter/setter pairs trivially read/write the same storage with no special-casing needed at all). When detected, `generateCall` prepends a visible `// TODO: ...` comment naming the aliased variable(s) and explaining the gap, directly above the (unchanged, pre-existing) independently-scattered-copies codegen - a pure additive comment, not a behavior change, so every pre-existing CALL corpus program (none of which pass the same variable twice) is completely unaffected. Verified against installed GnuCOBOL and scala-cli (m10): the generated Scala still compiles and runs to completion (not a crash), now with a visible, grep-able decline comment immediately above the CALL, honestly marking the divergence instead of a silent wrong answer with no marker at all; confirmed zero regressions on every pre-existing CALL corpus program (e07, h07, h09, h12, i06, u01, aa05, q09/q09b/q09c, j10, k01, k04, k12, l04, l10, l11, l12, m03/m05/m06/m07/m09/m14, all re-verified `oracleCompare()`-clean) | m10 (not fully passing `oracleCompare()` by design - a genuine, documented gap, matching l10/round-13 finding 1's own precedent) |
| 4 | (m08) An FD (FILE SECTION) record's own alphanumeric field with no VALUE clause (COBOL disallows a VALUE clause on an FD/SD record's own children entirely, so this is unconditionally the "no VALUE" case) defaulted to spaces - like an ordinary WORKING-STORAGE item with no VALUE clause, whose own default-to-spaces behavior IS correct and deliberate. Real cobc instead leaves an FD record's own storage at LOW-VALUES (NUL bytes, `0x00`) until a successful OPEN+READ/WRITE actually touches it - confirmed against installed GnuCOBOL (m08): `DISPLAY "BEFORE-OPEN REC=[" SOME-REC "]"`, issued before `OPEN INPUT SOME-FILE` (which then fails - the file doesn't exist - and a `USE AFTER STANDARD ERROR PROCEDURE` DECLARATIVES handler fires instead), shows 10 raw NUL bytes, not 10 spaces | `buildFieldRegistry`'s own `walk()` (`generator/scala-generator.js`) now threads a new `isFileSection` parameter down through its single recursive (nested-group) self-call, defaulting to `false` - set to `true` ONLY at the FILE SECTION's own top-level `walk(fileItems, ...)` call, completely distinct from the separate `walk(wsItems, ...)`/`walk(linkageItems, ...)` calls (both left at the default `false`, completely unaffected). `defaultElementaryValue` (the actual default-value-literal builder) gained the same `isFileSection` parameter (threaded through its own `defaultElementaryValueWithInheritance` wrapper too, for the group-VALUE-inheritance case - a no-op in practice, since an FD/SD record can never legally have a VALUE-bearing ancestor group to inherit from): its String-type branch now returns a FULL-WIDTH low-values literal (`"\u0000\u0000...\u0000"`, `width` NUL characters, via Scala's own `\u0000` string-escape syntax rather than an embedded raw NUL byte) instead of `""` whenever `isFileSection` is true AND no VALUE literal is present - every OTHER branch (an FD field that DOES have a VALUE - impossible per the COBOL standard but harmless if it somehow occurred - and every WORKING-STORAGE/LINKAGE field regardless of section) is completely unchanged. This required no change at all to the DISPLAY-time padding logic (`CobolFmt.fitLeft`/`.padTo(width, ' ')`) - returning the FULL-WIDTH low-values string up front means that padding is already a no-op (the string is already `width` bytes long), so the NUL bytes flow through unchanged instead of being silently widened with spaces. `case-class-gen.js`'s own case-class field declarations were confirmed NOT to need any change - a case class has no default values of its own at all (every field is always constructed explicitly from the record's own CURRENT flat-var values at `format()`/`parse()` time), so the "default before first touch" behavior lives entirely in `buildFieldRegistry`'s own flat `var` declaration, now fixed. Verified against installed GnuCOBOL and scala-cli (m08): `BEFORE-OPEN REC=[` followed by 10 raw NUL bytes then `]`, matching cobc exactly (previously showed 10 spaces); re-verified a broad swath of the pre-existing file-I/O corpus (every `oracle compare` test under `tests/corpus/proc`/`tests/corpus/data`, not just FD-bearing ones) with zero regressions - no pre-existing program's own oracle output happens to DISPLAY an FD record before its first successful OPEN+I/O, so this fix is invisible/harmless everywhere else, exactly as anticipated | m08 |

5 further round-24 probes were valid and already passed/were already honest
before any of the above fixes, confirmed unaffected by all four production
fixes: `m03` (STRING writing into a RECURSIVE program's own LINKAGE
parameter - already correctly routed through `renderAssignment`/`assignExpr`
per round-23 finding 1, confirmed unaffected by this round's audit), `m05`
(ADD ... GIVING writing into a RECURSIVE program's own LINKAGE parameter -
confirmed ADD/SUBTRACT/MULTIPLY/DIVIDE/COMPUTE's own GIVING-target write
already routes through `renderAssignment`, as finding 1 above independently
re-verifies), `m06` (a RECURSIVE program CALLing an ordinary, non-recursive
SIBLING and passing its own LINKAGE parameter BY REFERENCE - existing
`generateCall` writeback machinery, confirmed unaffected), `m07` (6-level-deep
self-recursion with a write to the LINKAGE parameter at the deepest level -
existing round-21/23 closure-aliasing mechanism, confirmed correct one level
deeper than any prior corpus program), and `m09` (an OCCURS DEPENDING ON
counter as an ADD ... GIVING target - existing ODO/arithmetic codegen,
confirmed unaffected). A further 4 probes (`m11` GO TO qualified to a
paragraph in its OWN enclosing section, `m12` PERFORM THRU where the FROM and
THRU paragraph are the SAME paragraph, `m13` EVALUATE nested inside another
EVALUATE testing the identical subject, `m14` a RECURSIVE program called
TWICE, non-overlapping, from the same caller) were also valid and already
passed - none touch any of this round's 4 fixed areas at all.

See `tests/round24-fixes.test.js` for focused, toolchain-independent unit
tests of all 4 findings above (finding 3's own decline is exercised there
too, asserting the TODO marker text rather than a full run, since m10 is a
deliberate `t.todo(...)`, not a hard pass).

### Round-25 adversarial-refutation findings (o01-o14) and their fixes

A round-25 refuter found 6 dishonest divergences clustering into 4 root
causes, all in territory no prior round had exercised at all: `OPEN I-O`
(never used by any of the 332 pre-existing corpus programs), REWRITE/DELETE
(never exercised either - a sibling gap to `OPEN I-O`), `SET condition-name
TO TRUE` against a subscripted OCCURS-table element (every prior probe only
ever targeted an unsubscripted condition-name), a qualified `PERFORM x OF
secA THRU y OF secA` inside a RECURSIVE program's own nested-paragraph
convention, and a genuinely subtle real-cobc-vs-generated-Scala divergence in
BRANCHING mutual RECURSIVE recursion. 3 of the 4 are now fixed at their root
cause; the 4th is documented as a narrow Known Gap below (see that finding's
own writeup for why forcing a fix wasn't pursued this round).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | `OPEN I-O` (a file opened for BOTH reading and writing/updating, the ordinary way to prepare a RELATIVE/INDEXED file for REWRITE/DELETE) never initialized the read iterator at all - `generateOpen`'s I-O branch (`generator/file-io-gen.js`) only ever created a `java.io.RandomAccessFile` handle (itself never actually read from anywhere else in this generator - dead weight, and its own `"rw"` open mode has the further side effect of silently CREATING a missing file rather than failing with FILE STATUS 35 the way OPEN INPUT/I-O both must) and left `iteratorVar` at its `Iterator.empty` default (`generateFileHandleDeclarations`) - so any READ after `OPEN I-O` always reported FILE STATUS 10 (no record), no matter what was actually on disk (o03: a plain `OPEN I-O` + two READs, confirmed against installed GnuCOBOL to return the file's real first two records, `ST=00` both times). Separately, `generateRewriteStatement`/`generateDeleteStatement` (`generator/expression-gen.js`) were bare `// REWRITE ... - update current record in file`/`// DELETE record from ...` COMMENT no-ops - they compiled cleanly and looked exactly like working code, but never actually rewrote or deleted anything, with no `???`/TODO marker or any other runtime signal distinguishing this from a real implementation (o01: REWRITE a record's field after READ, reopen INPUT, the new value was never persisted; o02: DELETE the middle of 3 records, reopen INPUT, all 3 records were still there) | Implemented REAL semantics for all three (route (a), not an honest decline) since this generator's existing storage model (a plain text line per record - the ONLY file organization it has ever modeled, whether the SELECT clause says LINE SEQUENTIAL/RELATIVE/INDEXED) turned out to support this without inventing a new one. `OPEN I-O`'s branch now loads the whole file into a new in-memory `scala.collection.mutable.ArrayBuffer[String]` (`bufVar`, new `toBufVarName`/`fileHandleVarNames` entry) up front via the exact same ISO-8859-1-identity-mapped `scala.io.Source.fromFile` reading OPEN INPUT already uses (so a missing file still throws `FileNotFoundException`/hits the existing catch-and-set-FILE-STATUS-35 path, instead of the old RandomAccessFile behavior of silently creating one), tracks a 0-based read-position counter (`posVar`, new `toPosVarName`), and sets `iteratorVar` to a small anonymous `Iterator[String]` adapter (`hasNext`/`next()`) over that buffer+position - so `generateRead`'s own existing, UNCHANGED `iteratorVar.hasNext`/`.next()`/`.nextOption()` codegen (previously only ever fed by OPEN INPUT's `Source`-backed iterator) works identically regardless of which mode opened the file. `generateRewriteStatement`/`generateDeleteStatement` now mutate this SAME buffer at `posVar - 1` ("the record most recently READ" - COBOL's own REWRITE/DELETE target for SEQUENTIAL access): REWRITE reuses `writeRecordPlan`/`writeFromLiteralPlan` (the identical content-building logic `generateWriteStatement` already uses for WRITE, so a REWRITE record's rendered text is byte-identical to what a WRITE of the same value would produce) to overwrite `bufVar(posVar - 1)` in place; DELETE removes that slot (`bufVar.remove(posVar - 1)`) and rewinds `posVar` so a subsequent sequential READ continues correctly. `generateClose` (`file-io-gen.js`) now flushes `bufVar` back to disk (a fresh `PrintWriter` over the file, one buffer line per `println`) whenever it's non-null, before closing whichever other handle(s) OPEN actually assigned - a file never opened I-O in a given run leaves `bufVar` at its `null` default, so this is a pure addition with zero effect on every pre-existing (non-I-O) corpus program. RANDOM/DYNAMIC access via an explicit RELATIVE/RECORD KEY (rather than "whatever was just READ") is not modeled - no corpus program exercises it. Verified against installed GnuCOBOL (o01: `AFTER-REWRITE STATUS=00`, `REREAD1 ID=001 VAL=ZZZZZ`, `REREAD2 ID=002 VAL=BBBBB`; o02: `AFTER-DELETE STATUS=00`, `REC ID=001 VAL=AAAAA`, `REC ID=003 VAL=CCCCC`; o03: `IOREAD1 ST=00 ID=001 VAL=AAAAA`, `IOREAD2 ST=00 ID=002 VAL=BBBBB`) - all three matching cobc byte-for-byte; confirmed zero regressions on every pre-existing file-I/O corpus program (s01-s12, t01-t12, u12, x01/x02/d10, m08, all re-verified `oracleCompare()`-clean) | o01, o02, o03 |
| 2 | `SET WS-FLAG-OK(2) TO TRUE` (a level-88 condition-name reference where the 88-level's PARENT item is itself a child of an OCCURS table, so the condition-name reference is legally subscripted) crashed the generated Scala at compile time (`Found: Int, Required: Vector[String]`-shaped error, since `wsFlag` is declared `Vector[String]`). `generateSet`'s level-88 branch (`generator/expression-gen.js`) correctly resolved `l88.camel` to the PARENT field's own flat var name (`wsFlag`, via `CONDITION_REGISTRY`/`level88FirstValueAssignment` - already correct, since `info.camel`/`info.scalaType` there describe the elementary item's own base type regardless of `occursDepth`) but then always emitted a bare scalar assignment (`assignExpr(l88.camel, l88.literal)` -> `wsFlag = "Y"`), silently dropping the level-88 reference's OWN subscript (`target.subscripts`, e.g. `(2)`) entirely - it was never even read | `generateSet`'s TRUE/FALSE level-88 branches now thread `target.subscripts` through to `renderCamelAssignment(l88.camel, subscripts, l88.literal)` - the SAME shared "camel + optional subscript list" write primitive `renderAssignment` itself already uses for every other subscripted write (`.updated(idx, value)` for a `Vector[...]`, falling back to `assignExpr` for an empty subscript list - so a plain, unsubscripted condition-name is completely unaffected, byte-for-byte identical output). No change to `level88FirstValueAssignment`/`level88FalseValueAssignment` themselves (already correct) - only to how their result gets written, now honoring whatever subscript the SET statement's own target actually carried. Verified against installed GnuCOBOL and scala-cli (o04): `F1=N F2=Y F3=N` - only index 2 set, matching cobc exactly; confirmed zero regressions on every pre-existing SET-condition-name corpus program (r14, r14b, k11, all re-verified `oracleCompare()`-clean) | o04 |
| 3 | `PERFORM 1000-PARA OF SEC-A THRU 2000-PARA OF SEC-A` inside a RECURSIVE program crashed the generated Scala at compile time (`secAPara is already defined as method secAPara` / `Conflicting definitions`) - and, once that crash was fixed, still produced WRONG output (stale `N=00` instead of the correct per-activation `LS-N`). Investigation found this was actually TWO separate bugs, not one: **(a)** the compile crash turned out to be a MORE general, pre-existing bug than the round's own framing suggested - `resolveParagraphMethodName`/`collectAmbiguousParagraphNames` (`generator/method-gen.js`) qualify a colliding bare paragraph name (post-numeric-prefix-strip, e.g. `1000-PARA` and `2000-PARA` both stripping to bare `para`) by its OWN enclosing section name - but `1000-PARA` and `2000-PARA` are BOTH declared inside `SEC-A` here, so qualifying-by-section collapses onto the IDENTICAL name (`secAPara`) for both; reproduced identically (confirmed with a standalone, non-recursive, non-THRU test program built specifically to isolate it) whether or not RECURSIVE/PERFORM-THRU are even involved at all - a same-section bare-name collision this generator had simply never been asked to qualify before. **(b)** separately, even with (a) fixed, a qualified (or any) `PERFORM ... THRU`'s own wrapper method (`generatePerformThruMethod`) is ALWAYS generated as a single, shared, TOP-LEVEL method (`generateAllMethods`, unconditionally, recursive or not) - but a RECURSIVE program's own paragraphs are instead nested as LOCAL `def`s *inside* `entry()` (`generateProgramFlowLinesNested`, round-21 finding 2), each closing over THAT call activation's own LINKAGE getter/setter closures; the shared top-level wrapper's own nested defs close over NOTHING (they read/write the ordinary, always-default module-level LINKAGE var `generateEntryMethod`'s non-recursive convention uses instead) - so a PERFORM ... THRU executed from inside a RECURSIVE program's own body silently read/wrote the WRONG storage for its whole duration | **(a)**: `collectAmbiguousParagraphNames` now ALSO tracks `(section, bareName)` pair counts (attached as a `sameSectionCollisions` property on the SAME `Set` instance it already returns - not a second return value, so every existing `.has(bare)` call site is completely unaffected); `resolveParagraphMethodName` (and its exact duplicate in `expression-gen.js`, `paragraphMethodName` - kept in sync for the same reverse-import-cycle reason its own doc comment already documents) now falls back to a name built from the paragraph's OWN full, unstripped text (`sectionPart + toPascalCase(rawName)`, e.g. `secA1000Para`/`secA2000Para`) whenever plain section-qualification would STILL collide - COBOL guarantees paragraph names are unique within their own section, so this is inherently collision-free with no further bookkeeping; the ordinary (different-section) ambiguity case is completely untouched (byte-for-byte the same `secAPara`-style name as before). **(b)**: new `collectPerformThrus` (`generator/method-gen.js`) factors the existing PERFORM-THRU/SORT-THRU/MERGE-THRU collection pass out of `generateAllMethods` so `generateProgramFlowLinesNested` can run the IDENTICAL pass over the SAME `units` list and build its OWN nested-local counterpart of each wrapper method, using `generatePerformThruMethod` itself, unchanged, just at the nested indent level. Because `generatePerformFromAST`'s own PERFORM ... THRU call site already emits a call to the bare, unqualified `performThruWrapperName(...)()` identifier (no codegen change needed there at all), declaring a nested `def` with the IDENTICAL name inside `entry()` makes Scala's ordinary lexical-shadowing rules resolve every such call made from within the RECURSIVE program's own nested paragraph defs to THIS activation's version instead of escaping out to the top-level, module-shared one. Verified against installed GnuCOBOL and scala-cli (o13): `ENTER N=02`/`SECA-1000 N=02`/`SECA-2000 N=02`/`ENTER N=01`/.../`EXIT N=00`/`EXIT N=00`/`EXIT N=02` - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing qualified-PERFORM-THRU corpus program (z12, b3) and every pre-existing RECURSIVE corpus program (j10, k01, k04, k12, l04, l10-l12, m01-m14, all re-verified `oracleCompare()`-clean) | o13 |

3 further round-25 probes were valid and already passed/were already honest
before any of the above fixes, confirmed unaffected by all three production
fixes: `o05` (a linear mutual-RECURSIVE chain sharing WORKING-STORAGE across
activations, the same confirmed-deliberate model as round-21's j10, one
level deeper - unaffected), `o06` (`SET index-name UP/DOWN BY` inside a
RECURSIVE program's own body - existing SET-index codegen, confirmed
unaffected by the LINKAGE-aliasing convention), `o07` (a CALL passing the
same caller-side variable BY REFERENCE for one parameter and BY CONTENT for
another in the same statement - existing per-parameter mode handling,
confirmed each operand's own mode is honored independently), `o08` (a
RECURSIVE self-CALL supplying FEWER USING arguments than the callee's own
LINKAGE SECTION declares - existing default-parameter convention, confirmed
unaffected), `o09` (COMPUTE ... ON SIZE ERROR where the erroring target is
also read on the right-hand side of its own expression - existing SIZE ERROR
codegen, confirmed unaffected), `o10` (a DECLARATIVES handler cascade -
existing registration/invocation codegen, confirmed unaffected), `o11`/`o12`
(FD records combining REDEFINES/OCCURS with LOW-VALUES defaulting - round-24
finding 4's own fix, confirmed to already cover both shapes).

Root cause 4 (`o14`) - two mutually-RECURSIVE programs (`O14A`/`O14B`)
computing `fib(5)` via a BRANCHING (non-linear) call graph, where the SAME
program has multiple SIMULTANEOUSLY-SUSPENDED activations at once (not just
nested-and-returning ones, the shape every prior linear-chain corpus program,
including this round's own `o05`, is limited to) - is a genuinely subtle
case, investigated but **left as a documented Known Gap** rather than forced
to a fix; see the Known Gaps section below for the full writeup of why.

See `tests/round25-fixes.test.js` for focused, toolchain-independent unit
tests of all 3 production fixes above.

### Round-26 adversarial-refutation findings (bb01-bb14) and their fixes

A round-26 refuter found 8 dishonest divergences clustering into 4 root
causes, all in the SAME `OPEN I-O`/REWRITE/DELETE territory round-25 first
built out: round-25's own new guard (`posVar > 0`) had no `else` branch at
all (bb02/bb03/bb04/bb07), `START` was still a complete no-op exactly like
REWRITE/DELETE were before round-25 fixed them (bb09), RANDOM/DYNAMIC access
mode ignored the RELATIVE KEY entirely for both READ and REWRITE - and,
investigation found, WRITE too (bb10/bb13), and a REDEFINES-over-OCCURS
target caused a hard compile crash in WRITE/REWRITE's own record-plan
construction (bb11). All 4 are now fixed at their root cause - no Known Gap
added this round.

6 further round-26 probes (bb01, bb05, bb06, bb08, bb12, bb14) were valid and
already passed/were already honest before any of this round's fixes,
confirmed unaffected by all four: `bb01` (REWRITE shrinking a record's own
rendered width below the FD's fixed length - `stripTrailing()`'s existing
short-line behavior, confirmed a later `parse()` and a neighboring
never-rewritten record are both unaffected), `bb05` (OPEN I-O ... CLOSE ...
OPEN I-O again on the same file within one run - round-25's own buffer
reload/flush cycle, confirmed each reopen correctly picks up the prior
CLOSE's own flushed state), `bb06` (two files simultaneously OPEN I-O -
confirmed each file's own `bufVar`/`posVar` pair, keyed by file name, has zero
cross-contamination), `bb08` (REWRITE from deep inside a RECURSIVE program's
own base-case activation - confirmed the shared top-level `bufVar` correctly
reaches every activation, and the freshly-read record's ID correctly flows
back up through the LINKAGE-aliasing chain), `bb12` (OPEN I-O combined with
an unrelated SD/SORT in the same program - confirmed no shared-state
collision between the two independent subsystems), `bb14` (a *valid*
alternating READ-before-every-DELETE pattern across 5 records - confirmed
round-25's posVar-rewind logic holds up across multiple deletes interspersed
with reads, not just a single one).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | Round-25's own `posVar > 0` guard on REWRITE/DELETE (`generateRewriteStatement`/`generateDeleteStatement`, `generator/expression-gen.js`) had no `else` branch: an INVALID REWRITE/DELETE (no prior READ at all - bb02/bb07; or a SECOND REWRITE/DELETE with no intervening READ - bb03/bb04) silently no-op'd with ZERO visible effect - no FILE STATUS update (stale value kept) and no DECLARATIVES handler invocation, even though real cobc (confirmed against installed GnuCOBOL) sets FILE STATUS to `"43"` and DOES invoke a registered `USE AFTER STANDARD ERROR PROCEDURE` handler for that file (bb07). Worse, `posVar > 0` alone doesn't even detect every invalid case: DELETE's own existing `posVar` decrement happens to make a SECOND immediate DELETE re-fail the guard correctly on its own (bb03), but REWRITE never touched `posVar` at all, so a SECOND immediate REWRITE with no intervening READ still satisfied `posVar > 0` and silently mutated the buffer a second time (bb04 - a genuinely invalid REWRITE must never mutate anything) | New `hasCurrentVar` flag per file (`toHasCurrentVarName`, `generator/file-io-gen.js`, alongside `bufVar`/`posVar` in `fileHandleVarNames`/`generateFileHandleDeclarations`) - true only immediately after a READ actually obtains a record (every branch of `generateReadStatement` now sets it, including the FILE-STATUS-only and bare/no-clause branches), false again the instant a REWRITE or DELETE *consumes* it, or a READ fails/hits AT END. REWRITE/DELETE now guard on `bufVar != null && hasCurrentVar` (not the old, only-incidentally-correct `posVar > 0`) and have a REAL `else` branch: sets the file's own FILE STATUS field (if declared) to `"43"`, then invokes `declarativeHandlerFor(fileName, 'I-O')` (reusing the exact same DECLARATIVES-dispatch primitive `generateOpen`'s own failure path already established in round-10) if one is registered - matching cobc's "run the declarative, then fall through" behavior exactly like OPEN's own failure path does. A pre-existing, unrelated latent bug surfaced by bb11 (not this root cause, but blocking it) was fixed alongside: `generateReadStatement`'s bare-READ/no-FILE-STATUS branch rendered a single-line `_record.foreach(r => <body>)` even when `<body>` was itself a trailing `// TODO ...` comment (the 'unsupported' READ-INTO-group marker) - inlined onto one line, the comment swallowed the rest of the line INCLUDING the foreach call's own closing `)`, a hard compile error; now falls back to the existing multi-line block form whenever the body contains `//`. Verified against installed GnuCOBOL and scala-cli: bb02 (`BEFORE-REWRITE STATUS=00`/`AFTER-REWRITE STATUS=43`/`REREAD ID=001 VAL=AAAAA` - the record is untouched), bb03 (`AFTER-DELETE-1 STATUS=00`/`AFTER-DELETE-2 STATUS=43`/`SURV ID=002 V=BBBBB`/`SURV ID=003 V=CCCCC`), bb04 (`AFTER-REWRITE-1 STATUS=00`/`AFTER-REWRITE-2 STATUS=43`/`REC1 ID=001 VAL=XXXXX`/`REC2 ID=002 VAL=BBBBB` - the second, invalid REWRITE's `"YYYYY"` never lands), bb07 (`DECLARATIVES-FIRED STATUS=43`/`AFTER-REWRITE STATUS=43`) - all four matching cobc byte-for-byte; confirmed zero regressions on every pre-existing I-O corpus program (bb01, bb05, bb06, bb08, bb12, bb14, o01-o03, all re-verified `oracleCompare()`-clean) | bb02, bb03, bb04, bb07 |
| 2 | RANDOM/DYNAMIC access mode ignored the RELATIVE KEY entirely for READ, REWRITE, AND (investigation found) WRITE - every one just used "whatever the sequential iterator/position currently is," so "random access" wasn't actually random at all. Compiler-verified against installed GnuCOBOL that this is a real, common, and CONSEQUENTIAL gap: a `READ` with `ACCESS MODE IS RANDOM` and a computed (FUNCTION MOD-derived) RELATIVE KEY (bb10) silently read whatever the forward iterator happened to be sitting on instead of the keyed record; a `REWRITE` with `ACCESS MODE IS RANDOM` and a RELATIVE KEY pointing at a record NEVER read (bb13) either mutated the WRONG record or silently no-op'd, when real cobc actually raises/resolves the INVALID KEY condition (or, for REWRITE specifically, auto-extends the file - see below) by the KEY, never by read position | Every RANDOM-access file, or DYNAMIC-access file for a statement that is NOT an explicit sequential `NEXT`/`PREVIOUS` READ (`isKeyedAccess`, `generator/expression-gen.js` - COBOL: DYNAMIC access lets a program mix both styles, chosen per-statement), now addresses its record DIRECTLY by the file's CURRENT `RELATIVE KEY` value as a 1-based index into the exact same in-memory `bufVar` round-25 already built - `bufVar(key - 1)`, computed as a general `.toInt`-converted expression (a literal, a variable, or an arbitrary arithmetic/FUNCTION-call result - bb10's own `COMPUTE WS-RKEY = FUNCTION MOD(WS-BASE, 3) + 1`, already fully evaluated by the time READ/REWRITE reads the key field's current value, needs no special per-statement re-evaluation). Two new per-file registries feed this: `RELATIVE_KEY_REGISTRY` (the `RELATIVE KEY IS <field>` clause's own camelCase flat-var name - `parser/index.js`'s `parseEnvironmentDivision` now captures it, previously parsed ASSIGN/ORGANIZATION/ACCESS/STATUS but not this) and `ACCESS_MODE_REGISTRY` (the `ACCESS MODE IS <mode>` clause, default `SEQUENTIAL`) - both built once by `scala-generator.js` from the same FILE-CONTROL entries the FILE STATUS registry already loops over, and threaded into both `expression-gen.js` (READ/REWRITE/WRITE/START) and `file-io-gen.js` (OPEN), each keeping its own copy like every other per-file registry. `generateOpen`'s own INPUT/OUTPUT branches (`file-io-gen.js`) now ALSO build the indexable buffer (previously only I-O did) whenever access mode is RANDOM/DYNAMIC - INPUT loads existing lines into `bufVar` exactly like I-O; OUTPUT starts a fresh EMPTY `bufVar` (no disk read - OUTPUT always creates a new file) instead of a plain `PrintWriter`, so WRITE (`generateKeyedWriteStatement`) can index into it the same way REWRITE (`generateKeyedRewriteStatement`) and READ (`generateKeyedReadStatement`) do. FILE STATUS/behavior, each independently compiler-verified against installed GnuCOBOL (a genuinely surprising, but reproducible, set of rules - not textbook guesses): **READ** - an EMPTY buffer (zero records at all) -> `"10"`, and NEITHER INVALID KEY nor NOT INVALID KEY fires (status 10 is the AT-END family, not the invalid-key family a RANDOM READ normally reports through - confirmed empirically, a genuine cobc quirk specific to a truly empty relative file); a key resolving to an existing record -> `"00"` + NOT INVALID KEY; a key out of range (non-empty buffer) -> `"23"` + INVALID KEY, record area untouched. **WRITE** - a non-positive key -> `"24"` (boundary violation), record NOT persisted at all (confirmed: bb09/bb10/bb13's own OUTPUT-phase WRITEs never assign their RELATIVE KEY field before writing, so it stays at its `VALUE 0` default - every one of those writes boundary-violates, and the resulting file is genuinely EMPTY, which is exactly what makes bb09's `START`/bb10's `READ` subsequently see zero records); a positive key -> always succeeds (`"00"`), auto-extending the buffer with blank placeholder lines up to that key if needed. **REWRITE** - identical positive-key-always-succeeds/auto-extend behavior to WRITE (bb13: `REWRITE` at key 99 against a 0-record file - after its own OUTPUT-phase WRITEs likewise boundary-violated - succeeds, `"00"`, `REWRITE-SUCCEEDED`, and BOTH subsequent bare `READ`s, which never advance the still-99-valued RELATIVE KEY, return the SAME record twice). `parseRewriteStatement`/`parseWriteStatement`/`parseStartStatement` (`parser/procedure-parser.js`) each gained `NOT INVALID KEY` parsing (READ/DELETE already had it; REWRITE/WRITE/START didn't - bb13's own `REWRITE ... INVALID KEY ... NOT INVALID KEY ... END-REWRITE` would otherwise have left its own trailing tokens unconsumed, silently misparsed as a bogus following statement). Verified against installed GnuCOBOL and scala-cli: bb10 (`COMPUTED-KEY=003`/`STATUS=10`, neither KEY clause fires - matches the genuinely-empty-file quirk above), bb13 (`REWRITE-SUCCEEDED`/`STATUS=00`/`REC1 ID=099 VAL=NOPE!`/`REC2 ID=099 VAL=NOPE!`) - both matching cobc byte-for-byte; confirmed zero regressions on every pre-existing SEQUENTIAL-access RELATIVE-file corpus program (bb01-bb08, bb12, bb14, o01-o03, s01-s12, t01-t12, all re-verified `oracleCompare()`-clean, since `isKeyedAccess` is false whenever access mode is SEQUENTIAL or absent) | bb10, bb13 (bb09 also depends on this fix's WRITE-gating half - see finding 3) |
| 3 | `START` (`generateStartStatement`, `generator/expression-gen.js`) was a complete no-op: a bare `// START ... - position file for reading` comment, no positioning logic, no FILE STATUS update at all - the identical "documented as stubbed" shape REWRITE/DELETE were in before round 25 fixed them, but never itself revisited. Separately uncovered while building bb09's own repro: `parseStartStatement` (`parser/procedure-parser.js`) mis-parsed `KEY IS GREATER THAN OR EQUAL <field>` (bb09's own exact idiom, a second legal spelling of `>=` alongside `NOT LESS THAN`) - it stopped at plain `GREATER THAN` (`>`) and left the trailing `OR EQUAL` tokens unconsumed, silently corrupting the rest of the statement's own parse (misread as the START key's own field reference); a bare `KEY IS LESS THAN` (`<`) had no branch at all either | Round-25's own buffer/position infrastructure turned out to be directly reusable, as this round's own brief predicted - implemented for REAL, not a decline. `generateStartStatement` now resolves the smallest 1-based buffer index satisfying the KEY clause's comparison against the key field's CURRENT value (the buffer is always dense/gapless - the only shape any corpus RELATIVE file ever has - so this is closed-form, no runtime scan needed): `=` -> the key itself; `>=` (`GREATER THAN OR EQUAL` or `NOT LESS THAN`) -> `max(key, 1)`; `>` -> `max(key, 0) + 1`; `<` -> `1` (if `key > 1`, else no candidate). A resolved candidate inside `[1, bufVar.length]` sets `posVar` (so a subsequent sequential `READ NEXT` continues from there), `"00"`, and runs any NOT INVALID KEY statements; anything else (including a completely EMPTY buffer - bb09's own case, since its OUTPUT-phase WRITEs all boundary-violate under finding 2's now-modeled WRITE-key-gating, exactly like bb10/bb13's do) sets `"23"` and runs the INVALID KEY statements. `parseStartStatement` now also matches `OR EQUAL` after `GREATER THAN` (`>=`) and a bare `LESS THAN` (`<`), and gained `NOT INVALID KEY` parsing (START never had it before, unlike READ/DELETE). A file with no RELATIVE KEY clause registered (illegal COBOL for a RELATIVE file, so unreachable from any corpus program) degrades to a visible, compiling `// TODO` decline rather than a guess. Verified against installed GnuCOBOL and scala-cli (bb09): `START-FAILED`/`AFTER-START STATUS=23`/`NEXT1 ID=005 VAL=EEEEE`/`NEXT2 ID=005 VAL=EEEEE`/`NEXT3 ID=005 VAL=EEEEE` (the file is genuinely empty per finding 2's WRITE-gating, so START correctly fails, and the 3 subsequent bare `READ NEXT RECORD`s - no AT END clause - correctly leave REC-ID/REC-VAL at their last-MOVEd, never-actually-written value, `005`/`EEEEE`, unchanged) - matching cobc byte-for-byte; confirmed zero regressions (no pre-existing corpus program uses START at all) | bb09 |
| 4 | `writeRecordPlan`'s own record-plan construction (and, upstream of it, EVERY consumer of a group's `GROUP_REGISTRY` child list - `groupDisplayValueExpr`/`odoDisplayValueExpr`/`groupChildConstructorExpr`/`groupContainsNonDisplay`/`groupChildInfos`) enumerated a REDEFINES target (e.g. `05 REC-TABLE REDEFINES REC-FLAT. 10 REC-ELEM PIC X(2) OCCURS 5 TIMES.`) as an ADDITIONAL, independent child alongside its base item, rather than recognizing it as an ALTERNATE VIEW over the exact SAME underlying storage - `scala-generator.js`'s own `realChildren` filter (used when building a group's `GROUP_REGISTRY` child-list entry) excluded only level-88 items, never a `.redefines` item. For WRITE/REWRITE specifically (bb11: `WRITE SOME-REC` where `SOME-REC` contains this exact shape) this produced something like `CobolFmt.fitLeft(recFlat,10) + CobolFmt.fitLeft(recElem,2)` - concatenating BOTH the base's actual bytes AND the redefining view's own (unrelated) text - with a hard `Vector[String]` vs `String` type-mismatch compile error, since `recElem` is really a `Vector[String]` (an OCCURS table), not the scalar `String` this path assumed. The SAME upstream over-inclusion also broke a plain, unconditional `READ` of the same record (no WRITE involved at all): `readDestination`'s own "every child has real elementary info" `usable` check saw REC-TABLE's own childless info and degraded the ENTIRE read - including the base REC-FLAT field - to an unsupported no-op, even though case-class-gen.js's own generated case class (unaffected by this bug - it already correctly excludes a REDEFINES item from its constructor/fields) had everything needed to decode REC-FLAT correctly | Each `GROUP_REGISTRY` child descriptor built for an ordinary (non-REDEFINES) group's own children (`scala-generator.js`) now carries a new `isRedefines: !!c.redefines` flag - a pure additive tag, zero behavior change on its own. Every consumer that iterates a group's children for a WRITE/REWRITE/DISPLAY-of-whole-group byte/text plan (`groupDisplayValueExpr`, `odoDisplayValueExpr`, `groupChildConstructorExpr`, `groupContainsNonDisplay` - all `generator/expression-gen.js`) now `continue`s past (never contributes bytes for, never lets a non-DISPLAY USAGE force byte-mode for) a flagged child - matching COBOL's own REDEFINES semantics (an alternate view is never independently written) and, as a beneficial side effect, MOVE CORRESPONDING/whole-group-MOVE's documented standard behavior of excluding REDEFINES items from correspondence. `groupChildInfos` (the READ-INTO-group/group-MOVE per-child metadata builder, same file) now filters `isRedefines` children out of its own returned list entirely, so `readDestination`'s `usable` all-children-have-info check is no longer poisoned by a childless REDEFINES entry - the base item's own fields decode correctly again, with the REDEFINES item's own already-independently-correct character-sliced accessor (round-16/17's own established mechanism) automatically reflecting the SAME just-decoded bytes, no separate assignment needed. Verified against installed GnuCOBOL and scala-cli (bb11): `BEFORE-OPEN FLAT=[` + 10 raw NUL bytes + `]` / `BEFORE-OPEN ELEM(1..5)=[` + 2 raw NUL bytes + `]` (round-24's own FD-LOW-VALUES-default, confirmed to still apply correctly through this fix) / `AFTER-READ FLAT=[XYXYXYXYXY]` / `AFTER-READ ELEM(1..5)=[XY]` - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing REDEFINES corpus program (d02-d09, e01-e08, f01-f13, g01-g13, all re-verified `oracleCompare()`-clean) | bb11 |

See `tests/round26-fixes.test.js` for focused, toolchain-independent unit
tests of all 4 findings above.

### Round-27 adversarial-refutation findings (cc01-cc12) and their fixes

A round-27 refuter found 8 dishonest bugs across 8 new probes (cc01, cc02,
cc03, cc04, cc05, cc06, cc10, cc11) - 4 further probes (cc07-cc09, cc12) were
valid and already passed/were already honest before any of this round's fixes
(EXEC SQL, JCL/COBOL correlation, an unknown-verb CICS skeleton, and COPY
REPLACING combined with FD I/O - none touched by this round at all, confirmed
unaffected). Every finding but one clusters in the SAME RELATIVE-file
RANDOM/DYNAMIC-access territory rounds 25-26 built out - DELETE never got
round-26's own RELATIVE-KEY-addressing treatment at all (cc05), DELETE's
parser never learned `NOT INVALID KEY` (cc06, which also surfaced a plain
READ's own identical gap), WRITE's "positive key always succeeds" rule
(round-26 finding 2) never checked for an ALREADY-occupied slot (cc02), and a
buffer slot that rule auto-extends as a blank placeholder was never
distinguished from a genuinely-written one (cc01) - plus one collision with
the RECURSIVE-program nested-def convention (cc10, the THIRD such collision
after round-25's own qualified-PERFORM-THRU fix and its own predecessor), one
STRING/numeric-MOVE interaction (cc11), one genuinely obscure cobc runtime
quirk investigated and fixed for real (cc03), and one toolchain-limited
crash-to-decline conversion with no real fix attempted (cc04, see its own
entry and the Known Gaps section below for why).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | DELETE in RANDOM/DYNAMIC access mode never addressed the RELATIVE KEY directly at all - round-26 finding 2 added this exact addressing to READ/REWRITE/WRITE but never revisited `generateDeleteStatement`, which still unconditionally required `hasCurrentVar` (a prior READ having established a position) - a RANDOM-access DELETE-by-key with no prior READ (cc05) always reported `"43"` and deleted nothing, no matter what the key pointed at | New `generateKeyedDeleteStatement` (`generator/expression-gen.js`), dispatched from `generateDeleteStatement` via the same `isKeyedAccess` check READ/REWRITE/WRITE/START already use. Compiler-verified against installed GnuCOBOL (cc05, plus two isolated probes built during this round's investigation - a genuinely surprising rule, not a textbook guess): a POSITIVE key ALWAYS succeeds (`"00"`), even addressing a slot never written (or already deleted) at all - identical to WRITE/REWRITE's own "auto-extend, always succeeds" rule (round-26 finding 2) - while a non-positive key reports `"24"` (WRITE/REWRITE's own boundary-violation code, NOT `"23"`). The delete itself marks the target slot as an unoccupied GAP (`bufVar(key-1) = ""`, the new `occVar(key-1) = false` - see finding 4 below) rather than removing it from the buffer (`.remove()`, the pre-existing SEQUENTIAL-access DELETE's own approach, left completely unchanged) - a real RELATIVE file's records occupy FIXED relative positions; `.remove()` would silently shift every LATER record's own position down by one, corrupting every subsequent keyed lookup (cc05 itself: deleting key 2 must leave key 3's own record still readable AT key 3, not shifted down to key 2's now-vacated slot). Verified against installed GnuCOBOL and scala-cli (cc05): `DELETE2 STATUS=00`/`READ1 ID=001 VAL=AAAAA`/`READ3 ID=003 VAL=CCCCC` - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing SEQUENTIAL-access DELETE corpus program (o02, bb03, bb07, all re-verified `oracleCompare()`-clean, since `isKeyedAccess` is false whenever access mode is SEQUENTIAL) | cc05 |
| 2 | `parseDeleteStatement` (`parser/procedure-parser.js`) only ever parsed `INVALID KEY`, never `NOT INVALID KEY` - the standard `INVALID KEY ... NOT INVALID KEY ... END-DELETE` form's trailing clause was left completely unconsumed, and those leftover tokens got reparsed as garbage, corrupting the parse of (and erasing the output of) the SUBSEQUENT unrelated statement in the same paragraph (cc06: a real, unrelated `DISPLAY` right after the DELETE lost its own output entirely). Investigating cc06 (whose own SECOND probe statement is a plain, non-keyed `READ ... INVALID KEY ... NOT INVALID KEY ...` on a SEQUENTIAL-access file) surfaced a SEPARATE, pre-existing companion gap: `generateReadStatement`'s plain (non-keyed) codegen path never even looked at `statement.invalidKey`/`notInvalidKey` at all (only `generateKeyedReadStatement`, the RANDOM/DYNAMIC path, did) - such a READ fell through to branches with no DISPLAY-carrying clause body at all, silently dropping the NOT INVALID KEY statements' entire output regardless of DELETE's own parser bug | `parseDeleteStatement` now parses an optional `NOT INVALID KEY <imperative-statements>` clause through `END-DELETE`, mirroring how READ/REWRITE/WRITE/START (round 26) already do. `generateDeleteStatement`'s own SEQUENTIAL-access success branch now runs `statement.notInvalidKey` (its failure/`"43"` branch deliberately does NOT run `statement.invalidKey` - see below). For the companion gap, `generateReadStatement`'s `hasAtEnd \|\| hasNotAtEnd` dispatch condition now ALSO fires on `hasInvalidKey \|\| hasNotInvalidKey`, and both success branches (the `hasNext` case) run whichever of `notAtEnd`/`notInvalidKey` is present - compiler-verified against installed GnuCOBOL that `NOT INVALID KEY` fires exactly like `NOT AT END` would when the next record is found. Two DIRECT PROBES built while investigating this (not just cc06 itself) turned up a further, genuinely surprising cobc quirk, generalizing round-26 finding 2's own "status 10 is the AT-END family, not the invalid-key family" rule to a PLAIN sequential READ too: a sequential READ genuinely past end-of-file, declaring ONLY `INVALID KEY`/`NOT INVALID KEY` (no AT END clause at all), fires NEITHER clause (though FILE STATUS still becomes `"10"`) - and, separately, a SEQUENTIAL-access DELETE with no valid prior READ, run a second time immediately with no intervening READ, ALSO fires neither of ITS own `INVALID KEY`/`NOT INVALID KEY` clauses despite FILE STATUS updating - the same family of behavior finding 7 (cc03) documents for START/READ NEXT. Since no corpus probe exercises the DELETE-failure shape specifically, `generateDeleteStatement`'s failure branch is left exactly as round-26 had it (status + DECLARATIVES handler only, no clause statements) rather than guessed at further; the READ end-of-file shape IS directly probed and implemented for real (see the `else` branch's own code comment). Verified against installed GnuCOBOL and scala-cli (cc06): `DELETE NOTINVALID ST=00`/`AFTER-DELETE STATUS=00`/`READ2 ID=002 VAL=BBBBB` - matching cobc byte-for-byte; confirmed zero regressions (no pre-existing corpus program declares INVALID KEY/NOT INVALID KEY on a plain READ or DELETE at all) | cc06 |
| 3 | WRITE (RANDOM/DYNAMIC access, explicit RELATIVE KEY) to a key that ALREADY has a record silently overwrote it - round-26 finding 2's "positive key always succeeds, auto-extend" rule never checked whether the target slot was already occupied, so WRITE behaved indistinguishably from REWRITE for this shape, when real cobc (compiler-verified, cc02) reports FILE STATUS `"22"` (duplicate key) and leaves the EXISTING record completely untouched instead | New `occVar` per-file registry (`toOccVarName`, `generator/file-io-gen.js`, alongside `bufVar`/`posVar`/`hasCurrentVar` in `fileHandleVarNames`/`generateFileHandleDeclarations`) - a parallel `ArrayBuffer[Boolean]`, same length as `bufVar`, true only for a slot some WRITE/REWRITE has genuinely stored a record into (see finding 4 below for the full rationale - it also distinguishes a genuine record from an auto-extended gap). `generateKeyedWriteStatement` now checks `occVar(key-1)` before writing: already `true` -> `"22"`, run the INVALID KEY statements, buffer/occVar left COMPLETELY unchanged; otherwise -> write the record AND set `occVar(key-1) = true`, exactly as before. REWRITE's own auto-extend loop (`generateKeyedRewriteStatement`) and DELETE's (finding 1) grow `occVar` in lockstep with `bufVar` too, so the two arrays are always the same length wherever either is indexed. Verified against installed GnuCOBOL and scala-cli (cc02): `WRITE1 OK ST=00`/`WRITEDUP INVALID ST=22`/`READBACK ID=001 VAL=FIRST` (the original record survives, `"DUPE!"` never lands) - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing WRITE corpus program (bb09, bb10, bb13, s01-s12, t01-t12, all re-verified `oracleCompare()`-clean, since `occVar` starts empty/all-false and no pre-existing program ever WRITEs the same key twice) | cc02 |
| 4 | A buffer slot WRITE/REWRITE's own "positive key always succeeds" rule auto-extends with a blank `""` placeholder (to keep `bufVar` densely index-addressable up to the target key) is NOT a real record - real cobc reports FILE STATUS `"23"` (record not found) reading such a "gap" slot. This generator instead tried to zoned-decode the blank placeholder as if it were genuine numeric field data, throwing `IllegalArgumentException: zonedDecode: non-digit data` (cc01: `WRITE`s at keys 3, 1, 5 - skipping 2 and 4 - then a later `READ` of key 2, the never-written gap) | The SAME `occVar` registry finding 3 introduces also closes this gap: `generateKeyedReadStatement`'s success condition now additionally requires `occVar(key-1)` (not just "key in `[1, bufVar.length]`") - a gap slot simply falls into the SAME `else`/invalid-key branch an out-of-range key already used, with no separate crash path or special-casing needed. `generateOpen`'s `pushBufferLoadLines` (I-O opens, and INPUT opens of a RANDOM/DYNAMIC-access file) rebuilds `occVar` on every reload from the just-loaded `bufVar`'s own content (`bufVar.map(_.nonEmpty)`) - a reloaded slot is occupied unless its own on-disk line is the EXACT empty string, the literal filler value the auto-extend loop uses (a real relative file's own gap slots are genuinely absent bytes, not zero-length text, but since this generator's WRITE/REWRITE render every DISPLAY-numeric field as non-blank digit text, an all-blank *legitimately-written* record colliding with this heuristic is an existing, accepted imprecision - not one this fix introduces, and not exercised by any corpus program). Verified against installed GnuCOBOL and scala-cli (cc01): `WRITE3 OK ST=00`/`WRITE1 OK ST=00`/`WRITE5 OK ST=00`/`READ1 ID=001 VAL=ONE  `/`READ3 ID=003 VAL=THREE`/`READ5 ID=005 VAL=FIVE `/`READ2 INVALID ST=23` - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing corpus program (no pre-existing program ever creates a gap - `occVar` is all-`true` for every one of them, since every reloaded/written slot has real content) | cc01 |
| 5 | A THIRD collision (after round-25's own qualified-PERFORM-THRU fix and its own predecessor bug) between an existing feature's fallthrough/wrapper-method logic and round-21's RECURSIVE-program nested-local-def paragraph convention (`generateProgramFlowLinesNested`): a SORT's own INPUT PROCEDURE paragraph (no explicit THRU), reached from inside a RECURSIVE program, auto-chained directly into the immediately-following OUTPUT PROCEDURE paragraph - `renderNestedFallthroughDefs` (used ONLY by this RECURSIVE convention, over the WHOLE program's unit list) bakes an automatic "fall through to the next paragraph" call into EVERY paragraph's own nested def unless it ends in an unconditional transfer, with no exception for a paragraph that is also a SORT/MERGE procedure-clause target. The ordinary (non-recursive) convention never has this problem: `generateAllMethods`' flat per-paragraph methods have NO auto-chain baked in at ALL (fall-through is modeled ONLY by the separate, uniquely-named `_stepN` wrapper the whole-program entry point uses - see `renderNestedFallthroughSteps`'s own doc comment and the `p12-sort.cbl` regression it was built to fix), so SORT's own out-of-line call to the bare paragraph name (`procedureCallExpr`, no-THRU case) always resolves to that non-chaining flat method. Result (cc10): the OUTPUT PROCEDURE ran once prematurely against the still-UNSORTED buffer, in addition to its own later, correct invocation, at every recursion depth | New `collectSortMergeThroughEndpoints` (`generator/method-gen.js`) - walks the same statement tree `collectPerformThrus` already does, collecting just the "through" paragraph name (with-THRU: the named end; without: the clause's own single paragraph, matching round-20 finding i06's `{procedure: X, through: X}` shape) of every SORT/MERGE INPUT/OUTPUT PROCEDURE clause. `renderNestedFallthroughDefs` gained an optional `noFallthroughAfter` parameter (a Set of these upper-cased names) - only ever passed non-null by `generateProgramFlowLinesNested`'s own top-level call (over the WHOLE program) - suppressing the auto-chain specifically at each such paragraph's own boundary, regardless of what physically follows it. `generatePerformThruMethod`'s own (bounded-range) use of `renderNestedFallthroughDefs` is unaffected (omits the new parameter entirely - a bounded THRU range's own last paragraph already never auto-chains, since it's always the range's own last unit). Verified against installed GnuCOBOL and scala-cli (cc10): `ENTER DEPTH=00`/`SORTED1 DEPTH=00 KEY=00 TAG=BBB`/`SORTED2 DEPTH=00 KEY=09 TAG=AAA`/`ENTER DEPTH=01`/`SORTED1 DEPTH=01 KEY=01 TAG=BBB`/`SORTED2 DEPTH=01 KEY=08 TAG=AAA`/`ENTER DEPTH=02`/`SORTED1 DEPTH=02 KEY=02 TAG=BBB`/`SORTED2 DEPTH=02 KEY=07 TAG=AAA`/`EXIT DEPTH=02`/`EXIT DEPTH=02`/`EXIT DEPTH=00` (each depth's own OUTPUT PROCEDURE now runs EXACTLY once, against the correctly-sorted buffer, at every recursion level) - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing RECURSIVE-program corpus program (j01-j12, k01-k13 etc., all re-verified `oracleCompare()`-clean, since `collectSortMergeThroughEndpoints` returns an empty set for any program with no SORT/MERGE at all) and every pre-existing SORT corpus program (p12 and friends, none RECURSIVE, so `generateProgramFlowLinesNested`/`noFallthroughAfter` never even runs for them) | cc10 |
| 6 | A field partially filled by STRING (leaving an untouched tail byte at whatever the target's OWN pre-STRING content was - this generator's confirmed default for an ordinary WORKING-STORAGE alphanumeric item with no VALUE clause is a space, via `generateString`'s own `.padTo(width, ' ')` snapshot) crashed with a `NumberFormatException` when later MOVEd into a numeric context (cc11: `STRING WS-PART1 DELIMITED BY SIZE INTO WS-KEYSTR` where `WS-KEYSTR` is 1 byte wider than `WS-PART1`, then `MOVE WS-KEYSTR TO WS-RKEY`). STRING's own fill convention was already correct (space, matching cobc) - the bug was entirely on the numeric-conversion side: `renderVariableMoveSource`'s numeric-target branch (`generator/expression-gen.js`) only routed a String-typed source through the whitespace-tolerant `CobolFmt.numval(...)` when `sourceInfo.dataType === 'edited'` (round-5 finding 6, for a numeric-edited source's own internal spacing) - a PLAIN alphanumeric source hit a bare `BigDecimal(rawExpr)`, which Java's `BigDecimal(String)` constructor rejects outright on ANY embedded non-digit character, including a single trailing (or even interior) space | Broadened the existing condition from `sourceInfo?.dataType === 'edited'` to `sourceInfo?.scalaType === 'String'` (true for BOTH `'edited'` and plain `'alphanumeric'` dataType - a genuinely numeric source is never String-typed in this generator's own type model, so this can't misfire on an already-numeric source). Compiler-verified against installed GnuCOBOL (three isolated probes built during this round's investigation, not just cc11 itself) that a plain alphanumeric-to-numeric MOVE tolerates - and simply ignores - ANY embedded whitespace, not just a leading/trailing pad byte (`PIC X(4) VALUE "4 2 "`, a space in the MIDDLE, still MOVEs to a numeric target as `42`) - ruling out a narrower "just strip one trailing byte" fix in favor of reusing `CobolFmt.numval` exactly as-is (its own `filterNot(_.isWhitespace)` already strips every space, not just a boundary one). Verified against installed GnuCOBOL and scala-cli (cc11): `WRITE OK ST=00`/`READ ID=042 VAL=042TWO    `/`UNSTRING A=[042] B=[   ]` - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing numeric-MOVE corpus program (a genuinely numeric source keeps the exact `BigDecimal(rawExpr)` path unchanged, and a numeric-edited source keeps its own pre-existing `CobolFmt.numval` path unchanged too - both re-verified) | cc11 |
| 7 | A failed keyed `START` (its own `KEY` clause comparison matched no record) leaves a RELATIVE file's sequential position "undefined" in real cobc - a SUBSEQUENT plain sequential `READ NEXT`/`PREVIOUS` fires NEITHER its AT END nor its NOT AT END clause at all (though FILE STATUS still updates, to `"46"`, not the ordinary `"10"` a genuine end-of-file gets) - confirmed reproducible via THREE separate direct probes built during this round's investigation (not just cc03 itself): the "swallowed" behavior persists across MULTIPLE subsequent READ NEXTs with no intervening START, and is fully cleared by any LATER *successful* START on the same file (a probe combining a failed START, one swallowed READ NEXT, a successful START, and a further READ NEXT confirmed the fourth statement recovers completely normal AT END/NOT AT END behavior). Investigated thoroughly (per this round's own brief) rather than assumed or left as a guess - the exact rule turned out to be small and precisely reproducible, not "genuinely unclear cobc internals" | Implemented for real (not a Known Gap): new `startInvalidVar` per-file flag (`toStartInvalidVarName`, `generator/file-io-gen.js`, alongside `bufVar`/`occVar`/etc. in `fileHandleVarNames`/`generateFileHandleDeclarations`), defaulting `false`. `generateStartStatement`'s own success branch sets it `false`; its failure/INVALID-KEY branch sets it `true`. `generateReadStatement`'s ENTIRE plain (non-keyed) body - whichever of its three pre-existing branches applies (AT END/NOT AT END, FILE-STATUS-only, or bare) - is now wrapped in an outer `if startInvalidVar then <swallow: hasCurrentVar=false, FILE STATUS "46", NEITHER clause> else <the original body, re-indented>`, built as a uniform 2-space re-indent of the pre-existing `lines` array so all three shapes get the identical swallow behavior without duplicating any of them. Only the plain/non-keyed READ path is touched - `generateKeyedReadStatement` (RANDOM/DYNAMIC-access keyed READ) is a separate, untouched function; no probe exercises whether this same quirk applies there, so no guess was made either way. Verified against installed GnuCOBOL and scala-cli (cc03): `START INVALID ST=23` (and NOTHING else - both subsequent bare `READ REL-FILE NEXT RECORD` statements, each with its own AT END/NOT AT END clause, produce ZERO output, exactly matching cobc's own captured `.oracle.txt`, which itself has only that one line) - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing START/READ-NEXT corpus program (bb09, all re-verified `oracleCompare()`-clean, since `startInvalidVar` defaults `false` and bb09's own START also fails but is never followed by a plain READ NEXT with an AT END/NOT AT END clause that would exercise this new guard differently than before) | cc03 |
| 8 | `RECORD KEY IS <field>` (the clause `ORGANIZATION IS INDEXED` files use instead of `RELATIVE KEY`) was never parsed at all (`parser/index.js`'s `parseEnvironmentDivision` only recognized `RELATIVE KEY`), and separately, `ORGANIZATION IS INDEXED` combined with `ACCESS MODE IS RANDOM`/`DYNAMIC` crashed with a `NullPointerException` on the very first WRITE: `file-io-gen.js`'s `generateOpen` decides whether to build the keyed/`bufVar` handle (vs. a plain writer) purely from `ACCESS MODE`, independent of organization, so it silently built the keyed-only handle for this file; `expression-gen.js`'s `generateWriteStatement` instead gated on `isKeyedAccess`, which ALSO requires a registered RELATIVE KEY (never true here, since RECORD KEY was never captured) - so WRITE took the OLD plain-writer codegen path, referencing a writer OPEN never created. **This sandbox's installed GnuCOBOL build has INDEXED-file support compiled out entirely** (`cobc --info`: "indexed file handler : disabled"; confirmed no VBISAM/D-ISAM/BDB library installed either) - there is NO cobc oracle available anywhere in this environment to verify real RECORD-KEY-addressed semantics against, for this finding or any future one | **Crash-to-honest-decline conversion only - no real INDEXED/RECORD-KEY semantics implemented**, per this campaign's own methodology (never guess at correctness with no way to verify) and this round's own explicit brief. `parser/index.js` now parses `RECORD KEY IS <field>` into `fileControl.recordKey` (purely for recognition - not fed into `RELATIVE_KEY_REGISTRY`, since a RECORD KEY is an arbitrary field, not a relative-record-number, and this generator's keyed-access codegen is only correct for the latter). New `INDEXED_ORGANIZATION_FILES` registry (`scala-generator.js`, built from `fc.organization === 'INDEXED'`) feeds a new `isIndexedRandomAccess` predicate in BOTH `expression-gen.js` (checked first thing in `generateReadStatement`/`generateWriteStatement`/`generateRewriteStatement`/`generateDeleteStatement`) and `file-io-gen.js` (`generateOpen`, checked before the mode switch) - an INDEXED file in RANDOM/DYNAMIC access mode now degrades EVERYWHERE (OPEN and every I/O statement, consistently, so there is no OPEN-vs-statement mismatch left to crash on) to a visible, compiling `// TODO: ... ORGANIZATION IS INDEXED with RANDOM/DYNAMIC access is not supported ... - see tests/oracle/README.md known gaps` comment - a pure no-op, no FILE STATUS update, no clause execution (firing either INVALID KEY or NOT INVALID KEY would itself be an unverified guess about behavior this sandbox has no way to check). Verified with scala-cli only (no cobc comparison possible - see the Known Gaps section below): the generated Scala for cc04 now compiles cleanly and RUNS TO COMPLETION (exit 0, no exception), instead of crashing with a NullPointerException on the first WRITE; confirmed zero regressions on every pre-existing RELATIVE-file RANDOM/DYNAMIC-access corpus program (bb09, bb10, bb13, cc01, cc02, cc05, cc11, all re-verified `oracleCompare()`-clean, since `isIndexedRandomAccess` is false for any non-INDEXED file) and every pre-existing INDEXED-organization SEQUENTIAL-access program (none exist in the corpus, but a plain SEQUENTIAL-access INDEXED file would also be unaffected, since the new check requires RANDOM/DYNAMIC access mode too) | cc04 |

See `tests/round27-fixes.test.js` for focused, toolchain-independent unit
tests of all 8 findings above.

### Round-28 adversarial-refutation findings (dd01-dd13) and their fixes

A round-28 refuter found 4 dishonest bugs across 13 new probes
(dd01-dd13) - 9 further probes (dd01, dd03-dd08, dd12, dd13) were valid and
already passed/were already honest before any of this round's fixes
(EVALUATE/MERGE/INSPECT-STRING/GOTO-DEPENDING/REWRITE-DELETE-REWRITE/DELETE-
then-SORT/OCCURS-VARYING-reopen/RECURSIVE-DELETE/PERFORM-THRU-cross-section,
all inside a RECURSIVE program or combined with prior rounds' file-I/O work -
none touched by this round at all, confirmed unaffected). Finding 1 is the
FOURTH instance of the recurring "feature collides with the RECURSIVE-program
nested-local-def convention" bug (after round-25's qualified-PERFORM-THRU fix,
its own predecessor, and round-27 finding 5's SORT/MERGE procedure-clause
fix) - DECLARATIVES simply hadn't been audited against that convention yet.
Finding 2 closes the SAME "never wired into the keyed/RANDOM/DYNAMIC-access
codegen paths" gap pattern round-26/27 already fixed for RELATIVE-KEY
addressing (READ/REWRITE/WRITE/START) and duplicate-key detection
(WRITE) - this time for DECLARATIVES dispatch itself. Finding 3 is a genuine
DATA-CORRUPTION bug (not merely a missing-feature decline) - COMP-1/COMP-2
file-record fields had NO real byte-level codec at all, silently truncating
precision through a text round trip the instant they were combined with real
file I/O for the first time in this corpus's history. Finding 4 is a
straightforward missing-type-dispatch crash, the same "was only ever
exercised with numeric data" gap shape several earlier rounds' ODO/table
findings share.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | A DECLARATIVES `USE AFTER STANDARD ERROR PROCEDURE` handler method (`generateDeclarativeMethodBodies`, `scala-generator.js`, round-10 finding 1) was ALWAYS generated as a flat TOP-LEVEL method reading the module-level LINKAGE `var` directly - correct for an ordinary program, but wrong the instant the program is RECURSIVE: round-21's `generateRecursiveEntryMethod` represents each LINKAGE parameter as a PER-CALL getter/setter closure pair (`def lsN: Int = _get0()`/`def lsN_=(v) = _set0(v)`) instead of a shared module `var`, and every ORDINARY paragraph reachable from `entry()` is nested as a local `def` INSIDE it (`generateProgramFlowLinesNested`) specifically so it closes over THAT call's own closures - but the DECLARATIVES handler method was never part of that nesting, so a call to it from inside a nested paragraph body (`declarativeHandlerFor`'s dispatch, e.g. `missingFileErr()` from `generateOpen`'s failure path) resolved to the STALE, flat top-level method instead - which read the module var's own never-actually-assigned DEFAULT value (dd02: `HANDLER-FIRED AT DEPTH=00` instead of the correct, CURRENT activation's `LS-DEPTH`, which is `02` at the depth the OPEN actually fails at) | New `generateDeclarativeHandlerDefsNested` (`generator/method-gen.js`) - reuses `renderNestedFallthroughDefs` (the SAME body-duplicating helper `generateProgramFlowLinesNested` itself already uses for ordinary paragraphs) to nest each ERROR-kind DECLARATIVES SECTION's own handler body directly inside `entry()`, named IDENTICALLY to the pre-existing flat top-level method (`toMethodName(decl.name)`) so Scala's ordinary lexical shadowing rules resolve every `${handlerMethod}()` call made from within THIS activation's own nested paragraph defs to THIS nested version instead of escaping out to the stale module-shared one - zero changes needed at any `declarativeHandlerFor` call site. `generateEntryMethod`/`generateRecursiveEntryMethod` (`scala-generator.js`) now thread `declaratives` through to this new function. The pre-existing flat top-level handler method is left completely unchanged (still generated by `generateDeclarativeMethodBodies`, exactly as before) - simply unreachable dead code for a RECURSIVE program, exactly like the flat top-level per-paragraph methods `generateAllMethods` already unconditionally (and harmlessly) emits regardless of recursion. Verified against installed GnuCOBOL and scala-cli (dd02): `ENTER DEPTH=00`/`ENTER DEPTH=01`/`ENTER DEPTH=02`/`HANDLER-FIRED AT DEPTH=02`/`EXIT DEPTH=02`/`EXIT DEPTH=02`/`EXIT DEPTH=00` - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing DECLARATIVES corpus program (x01-x03, aa01-aa10, all NON-recursive, so the new nested defs are simply never generated for them at all) and every pre-existing RECURSIVE-program corpus program with no DECLARATIVES (j01-j12, k01-k13, etc., all re-verified `oracleCompare()`-clean, since `generateDeclarativeHandlerDefsNested` returns an empty line list when `declaratives` is empty) | dd02 |
| 2 | `declarativeHandlerFor` (the shared DECLARATIVES-dispatch helper `generateOpen`'s OPEN-failure path, a bare READ's end-of-file path, and REWRITE/DELETE's own SEQUENTIAL-access failure path already use - rounds 10/26) was never wired into ANY of `generateKeyedReadStatement`/`generateKeyedWriteStatement`/`generateKeyedRewriteStatement`/`generateKeyedDeleteStatement`/`generateStartStatement` (the RANDOM/DYNAMIC-access RELATIVE-KEY-addressed codegen paths rounds 25-27 built) at all - a registered `USE AFTER STANDARD ERROR PROCEDURE ON <file>` handler simply never fired for a KEYED I/O failure, no matter the FILE STATUS value, even though real cobc invokes it for EVERY qualifying file-status-generating I/O failure, keyed or not (dd09: a single handler registered on a RELATIVE file, EVALUATE-branching on the FILE STATUS it receives, never fired at all for a duplicate-key WRITE (`"22"`), a not-found keyed READ (`"23"`), or a boundary-violating WRITE (`"24"`) - each triggering statement deliberately has no INVALID KEY clause of its own, relying entirely on the implicit DECLARATIVES path) | Every keyed failure branch identified above now ALSO calls `declarativeHandlerFor(fileName, mode)` and invokes the returned method if one is registered, exactly mirroring the non-keyed precedent: `'INPUT'` for keyed READ/START (matching the non-keyed bare-READ precedent), `'I-O'` for keyed WRITE (both its duplicate-key AND boundary-violation branches)/REWRITE/DELETE (matching the non-keyed REWRITE/DELETE precedent - REWRITE/DELETE are only ever legal under I-O access). Since every one of dd09's own triggering statements uses a FILE-specific `ON REL-FILE` registration (not a mode-generic `ON I-O`/`ON INPUT` one), the exact mode string passed only matters as a fallback and is never actually exercised by this fix's own verification - `declarativeHandlerFor`'s file-name lookup always wins first, matching every real-world `ON <file-name>` declaration this generator's DECLARATIVES support was originally built around. Verified against installed GnuCOBOL and scala-cli (dd09): `AFTER-W1 ST=00`/`HANDLER: DUP-KEY ST=22`/`AFTER-DUP-WRITE ST=22`/`HANDLER: NOT-FOUND ST=23`/`AFTER-GAP-READ ST=23 ID=001`/`HANDLER: BOUNDARY ST=24`/`AFTER-BOUNDARY-WRITE ST=24`/`AFTER-STALE-REWRITE ST=00` - matching cobc byte-for-byte (the final REWRITE, with a valid prior implicit position from the preceding gap READ, actually SUCCEEDS in this exact probe shape rather than hitting the `"43"` case its own header comment anticipated - real cobc's own actual behavior, not a guess, is what the fixture captures); confirmed zero regressions on every pre-existing keyed-access corpus program (bb09, bb10, bb13, cc01, cc02, cc05, all re-verified `oracleCompare()`-clean, since none of them register a DECLARATIVES handler at all - `declarativeHandlerFor` returns `null` and the new call sites contribute zero generated lines) | dd09 |
| 3 | **Data-corruption bug.** COMP-1/COMP-2 (Float/Double) fields had NO real byte-level codec at all - `case-class-gen.js`'s `classifyCodec` labeled them `'legacy'`, and `decodeFieldExpr`/`encodeFieldExpr`'s `default` branch fell back to `legacyEncodeExpr`/`legacyDecodeExpr`, a TEXT-TRUNCATING shortcut (`value.toString.reverse.padTo(len,'0').reverse.take(len).getBytes`) that had only ever been exercised for WORKING-STORAGE-level COMP-1/COMP-2 (which never round-trips through bytes at all - it's a plain native Scala `Float`/`Double` var) - never for an actual FD file-record WRITE/REWRITE/READ round trip until dd10 combined the two for the first time. `-7.125` silently became the 4 ASCII characters `"-7.1"`, which then decoded back as `-7.099999904632568` (an inexact reparse of truncated text) - real, silent numeric corruption, not a crash or a visible decline | Added real IEEE-754 codecs - `floatEncode`/`floatDecode` (4 bytes, COMP-1) and `doubleEncode`/`doubleDecode` (8 bytes, COMP-2) - to BOTH `generator/codecs.js` (the JS reference implementation) and `runtime/CobolCodecs.scala` (the embedded Scala runtime), using `java.lang.Float.floatToIntBits`/`intBitsToFloat` and `Double.doubleToLongBits`/`longBitsToDouble` (JS: `DataView.setFloat32`/`getFloat32`/`setFloat64`/`getFloat64`). Byte ORDER is HOST-NATIVE (little-endian on x86_64) - compiler-verified DIRECTLY against installed GnuCOBOL (not just "compiles and runs"): a tiny COBOL program (an FD record with a COMP-1 and a COMP-2 field, `WRITE`n to a RELATIVE file, then hex-dumped) wrote `3.5` as COMP-1 bytes `00 00 60 40` and `2.25` as COMP-2 bytes `00 00 00 00 00 00 02 40` - each the EXACT byte-reverse of the standard big-endian IEEE-754 bit pattern Java's `Float.floatToIntBits(3.5f)` (`0x40600000`) / `Double.doubleToLongBits(2.25)` (`0x4002000000000000`) produce; `-7.125` (COMP-1 `00 00 e4 c0`, reverse of `0xC0E40000`) and `100.5` (COMP-2 `00 00 00 00 00 20 59 40`, reverse of `0x4059200000000000`) confirmed the same reversed-big-endian (i.e. host-native little-endian) pattern holds for negative values and doubles alike - exactly like COMP-5's own already-established host-native convention (round-16), NOT the big-endian default plain COMP/COMP-4/BINARY use. `case-class-gen.js`'s `decodeFieldExpr`/`encodeFieldExpr` now route their `'legacy'` `default` branch through new `legacyFloatDecodeExpr`/`legacyFloatEncodeExpr` helpers that call these real codecs for `Float`/`Double` (falling back to the old text-based `legacyDecodeExpr`/`legacyEncodeExpr` only defensively - `'legacy'` is never assigned for any other Scala type). Verified against installed GnuCOBOL and scala-cli (dd10): `REC1 ID=001 F1=3.5 F2=2.25`/`REREAD1 ID=001 F1=4.5 F2=2.25`/`REREAD2 ID=002 F1=-7.125 F2=100.5` (the `COMPUTE REC-F1 = REC-F1 + 1.0` between WRITE and REWRITE - `3.5 + 1.0 = 4.5` - round-trips exactly, and `-7.125`/`100.5` survive a full WRITE/CLOSE/OPEN/READ round trip with zero precision loss) - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing COMP-1/COMP-2 WORKING-STORAGE-only corpus program (u02/u02b, which never go through this byte-level path at all - `classifyCodec`'s `'legacy'` kind is only ever consulted by a case class's own `format()`/`parse()`, never by a plain WORKING-STORAGE var's arithmetic) | dd10 |
| 4 | The OCCURS DEPENDING ON (ODO) table WRITE codegen (`odoDisplayValueExpr`, `generator/expression-gen.js`, round-10 finding 4) built `CobolFmt.digitsOf(BigDecimal(${camel}(i)), ...)` for EVERY table element regardless of its own declared PIC clause - a hard `NumberFormatException` the moment an alphanumeric (`PIC X(n)`) table element was written (dd11: `REC-ITEM PIC X(3) OCCURS 1 TO 5 TIMES DEPENDING ON REC-COUNT`, `"AAA"`/`"BBB"`/etc. can't parse as a `BigDecimal`) - the ordinary (non-table) elementary-child branch of the SAME function, just a few lines below, already correctly dispatched on `info.scalaType === 'String'` vs numeric; the table branch simply never got the same treatment | `odoDisplayValueExpr`'s table-element branch now dispatches on `info.scalaType` exactly like its own non-table sibling branch does: a `String`-typed element uses `CobolFmt.fitLeft(${camel}(i), width)` (the same per-element padding/truncation an ordinary alphanumeric field's own WRITE already uses), a numeric element keeps the pre-existing `CobolFmt.digitsOf(BigDecimal(...))` path unchanged. Verified against installed GnuCOBOL and scala-cli (dd11): `BEFORE-REWRITE COUNT=2`/`  ITEM(1)=AAA`/`  ITEM(2)=BBB`/`AFTER-REWRITE COUNT=4`/`  ITEM(1)=CCC`/`  ITEM(2)=DDD`/`  ITEM(3)=EEE`/`  ITEM(4)=FFF` - matching cobc byte-for-byte (a WRITE at one live ODO count followed by a REWRITE at a DIFFERENT live count, then a full read-back, all round-trip correctly); confirmed zero regressions on every pre-existing ODO/table corpus program (every one of which uses only NUMERIC table elements, e.g. y11b - `odoDisplayValueExpr`'s numeric branch is byte-for-byte unchanged) | dd11 |

See `tests/round28-fixes.test.js` for focused, toolchain-independent unit
tests of all 4 findings above.

### Round-29 adversarial-refutation findings (ee09/ee10/ee13 - RECURSIVE-nested-def EXIT trio, PERFORM-vs-fallthrough, ALTER parse corruption)

A round-29 refuter left 14 new probes (ee01-ee14); this section covers the 3
assigned to this fix agent - ee09, ee10, ee13 (the other 11, including
ee01-ee08/ee11/ee12/ee14 - COMP-1/COMP-2 float-codec findings and EXIT
PERFORM's own already-correct `scala.util.boundary` precedent - are a
separate workstream's own findings, not touched here). Findings 1 and 2 are
the FIFTH and SIXTH instances of the recurring "feature collides with the
RECURSIVE-program nested-local-def convention" bug class (after round-25's
qualified-PERFORM-THRU fix and its own predecessor, round-27 finding 5's
SORT/MERGE fix, and round-28 finding 1's DECLARATIVES fix) - `generateExit`'s
SECTION/default(PARAGRAPH) cases and `renderNestedFallthroughDefs`'s baked-in
auto-fallthrough had never been audited against that convention either.
Finding 3 is a different class entirely - a genuinely unrecognized verb
(ALTER, confirmed nowhere in this parser/generator at all) corrupting the
surrounding parse, the same class of bug round-21's own GO-TO-OF-SECTION fix
closed for a different construct.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1 | EXIT SECTION (and, latently, EXIT PARAGRAPH) inside a RECURSIVE program's own nested-local-def paragraph (`generateProgramFlowLinesNested`/`renderNestedFallthroughDefs`, `generator/method-gen.js`) cascaded WAY too far. Root cause: for an ORDINARY (non-recursive) program every paragraph is its own separate top-level method, so `generateExit`'s bare `return` (`generator/expression-gen.js`) correctly stops just that one paragraph. But round-21's RECURSIVE convention nests every paragraph as a local `def` *inside* `entry()` and chains fall-through by appending a call to the NEXT paragraph at the END of the CURRENT paragraph's own def body (not sequential top-level calls) - so a bare `return` fired partway through one such nested def also skips that appended next-paragraph call (it's textually part of the SAME def), and transitively every paragraph chained after it, cascading all the way to the true end of the RECURSIVE program's own flow (ee09: a `return` fired at LS-DEPTH=1 silently skipped the rest of SECTION-A, all of SECTION-B, and the entire next recursive sub-call, with zero error or indication) | `isRecursiveNestedFlowMode()` (new flag, `generator/expression-gen.js` - installed/reset by `scala-generator.js`'s `generateEntryMethod` for exactly the duration of its `generateRecursiveEntryMethod` call, alongside the existing `setRecursiveLeafNames`) lets `generateExit`/`generateMethodBody`'s own EXIT dispatch tell the two conventions apart. EXIT PARAGRAPH becomes `scala.util.boundary.break()` - `renderNestedFallthroughDefs` wraps ONLY a paragraph's own original statements in `scala.util.boundary { ... }` (gated on `paragraphsContainExitOfType(paragraphs, 'PARAGRAPH')`, so a paragraph list using neither EXIT kind renders byte-identical to before), leaving the appended fall-through call OUTSIDE the boundary so it still runs after a `break()` - correct, since EXIT PARAGRAPH must still fall through normally, exactly mirroring EXIT PERFORM's own pre-existing, already-correct `scala.util.boundary` precedent (ee14, confirmed unaffected). EXIT SECTION becomes `throw CobolExitSectionSignal` instead (a new no-stack-trace `RuntimeException` object, emitted once per RECURSIVE program's own `object` body) - a paragraph can have OTHER paragraphs chained after it within the SAME section, which a single boundary local to one def cannot reach across, but a dynamically-scoped exception can: every cross-SECTION fall-through call `renderNestedFallthroughDefs` emits (and the one-off call that "enters" `paragraphs[0]`, `renderSectionAwareEntryCall`) is wrapped in `try { ... } catch { case CobolExitSectionSignal => <resume at the SECTION after the one that was entered, or do nothing if there is none> }` whenever the paragraph list actually contains an EXIT SECTION anywhere (`findNextSectionHead`/`paragraphsContainExitOfType`). Verified against installed GnuCOBOL and scala-cli (ee09): `A1 DEPTH=00`/`A1-TAIL DEPTH=00`/`A2 DEPTH=00`/`B1 DEPTH=00`/`A1 DEPTH=01`/`B1 DEPTH=01`/`A1 DEPTH=02`/`A1-TAIL DEPTH=02`/`A2 DEPTH=02`/`B1 DEPTH=02`/`EXIT DEPTH=02`/`EXIT DEPTH=02`/`EXIT DEPTH=00` - matching cobc byte-for-byte (LS-DEPTH=1's own EXIT SECTION correctly skips A1-TAIL/A2, lands at SECTION-B, and the recursive sub-call still completes); confirmed zero regressions on every pre-existing RECURSIVE-program corpus program (j01-j12, k01-k13, m07, dd02, etc., all re-verified `oracleCompare()`-clean, since `paragraphsContainExitOfType` returns false - so every new boundary/try-catch is skipped entirely - for any unit list with no EXIT SECTION/PARAGRAPH at all) | ee09 |
| 2 | A bare out-of-line `PERFORM <paragraph>` to a paragraph inside a RECURSIVE program incorrectly cascaded into whatever paragraph comes "after" it in program order, even when reached via an explicit, deliberate PERFORM (not natural fall-through) - `PERFORM COMMON-PARA OF SECTION-ONE` (ee10: two different SECTIONs each declaring their own bare-named `COMMON-PARA`, disambiguated via qualified PERFORM) incorrectly ALSO ran SECTION-TWO's own same-named `COMMON-PARA`, producing spurious duplicate output. Root cause: `generateProgramFlowLinesNested`'s single nested-def-per-paragraph convention serves BOTH "the whole program's own natural top-to-bottom fall-through" AND "an out-of-line call to this one paragraph" at once (unlike the ordinary convention, where `generateAllMethods`' flat top-level methods have NO auto-chain baked in at all - fall-through is modeled ONLY by the separate `_stepN` wrapper `renderNestedFallthroughSteps` builds for the whole-program entry point) - so the auto-chained fall-through `renderNestedFallthroughDefs` baked into `sectionOneCommonPara`'s own def body ALSO fired the moment the qualified PERFORM called it directly | Ported the ordinary convention's own flat-method/`_stepN`-wrapper split into the RECURSIVE nested-def convention: `generateProgramFlowLinesNested` now renders every paragraph as a FLAT nested def via `renderNestedFallthroughDefs(units, indent, nameFor, noFallthroughAfter, true)` - the new trailing `true` (`suppressAllFallthrough`) unconditionally disables auto-chaining for this call, so an out-of-line PERFORM/GO TO resolving to one of these defs (via `nameFor`, unchanged) is a genuine call-and-return, never an auto-cascade. The program's own NATURAL fall-through is instead modeled by a SEPARATE new `_stepN` wrapper chain, `renderNestedProgramFlowSteps` (`generator/method-gen.js`) - mirroring `renderNestedFallthroughSteps` exactly, but calling each paragraph's own FLAT nested sibling def instead of an already-generated top-level method - which also carries finding 1's own EXIT SECTION try/catch (per-step now, since the flat defs no longer chain into each other at all, each `_stepN` is the ONLY call site for its own paragraph). `generatePerformThruMethod`/`generateDeclarativeHandlerDefsNested` (bounded THRU ranges / one DECLARATIVES SECTION's own paragraphs) are UNCHANGED - still body-duplicating with embedded fall-through, exactly like the ordinary convention's own equivalent THRU-range wrapper already is; only the WHOLE-PROGRAM flow (where an explicit qualified PERFORM and natural fall-through can target the exact same def) needed the split. Verified against installed GnuCOBOL and scala-cli (ee10): `ENTER DEPTH=00`/`IN-SECTION-ONE DEPTH=00`/`IN-SECTION-TWO DEPTH=00`/`ENTER DEPTH=01`/`IN-SECTION-ONE DEPTH=01`/`IN-SECTION-TWO DEPTH=01`/`ENTER DEPTH=02`/`IN-SECTION-ONE DEPTH=02`/`IN-SECTION-TWO DEPTH=02`/`EXIT DEPTH=02`/`EXIT DEPTH=02`/`EXIT DEPTH=00` - matching cobc byte-for-byte (each qualified PERFORM now runs its OWN target exactly once, no duplicate SECTION-TWO output); confirmed zero regressions on every pre-existing RECURSIVE-program corpus program (the `_stepN` indirection is purely structural - functionally a no-op restructuring for any program with no ambiguous cross-section PERFORM target - all re-verified `oracleCompare()`-clean) | ee10 |
| 3 | ALTER (`ALTER <para> TO [PROCEED TO] <target>.`) is confirmed nowhere in this parser/generator at all - not even a documented `???` stub - and an unrecognized ALTER clause didn't just fail to do anything, it actively CORRUPTED the surrounding parse: `parseStatement`'s default case fell through to `parseUnknownStatement`'s generic verb-scan, which stops the instant it sees anything matching `isParagraphName` (an IDENTIFIER immediately followed by a PERIOD) - and the clause's own FINAL target procedure-name (`TARGET-TWO` in `ALTER JUMP-PARA TO PROCEED TO TARGET-TWO.`) is always immediately followed by the period ending the WHOLE ALTER statement, so the generic scan always stopped exactly one token early. The ENCLOSING per-paragraph loop then found that identical "IDENTIFIER then PERIOD" shape and concluded a brand new paragraph (named after the ALTER clause's own target) had started there - silently hijacking every statement that actually belonged to the CURRENT paragraph (MAIN-PARA's own trailing `PERFORM`/`DISPLAY`/`STOP RUN`) into a phantom, duplicate `TARGET-TWO` paragraph instead - a hard scala-cli duplicate-method compile error, not a clean decline | New `parseAlterStatement` (`parser/procedure-parser.js`), dispatched from `parseStatement`'s switch via a new `case 'ALTER'` (and `'ALTER'` added to `STATEMENT_KEYWORDS`, so an UnknownStatement scan for some OTHER unrecognized verb correctly stops AT an ALTER clause too, rather than swallowing it). Understands just enough of ALTER's own grammar - `<para> TO [PROCEED TO] <target> [, <para> TO [PROCEED TO] <target>]*` - to always consume every one of its own tokens up through the REAL terminating period, never guessing at a boundary the way the generic scan must. Deliberately implements NO real ALTER semantics (retargeting a GO TO's own destination at runtime) - ALTER is a rare, deprecated COBOL feature this campaign's own roadmap already lists as low-priority/out of scope, and real runtime semantics would be a disproportionately large feature for it; the clause is parsed into a plain `UnknownStatement` (`keyword: 'ALTER'`), degrading to the SAME visible, compiling `() /* ??? TODO: unsupported statement type (UNKNOWN) */` no-op every other out-of-scope construct already uses (`generateExpression`'s own default case, `generator/expression-gen.js`) - a compiling, honest decline, never a crash or corruption. Verified against installed GnuCOBOL and scala-cli (ee13): parse no longer corrupts (confirmed via direct AST inspection - MAIN-PARA keeps its own full statement list, no phantom paragraph, exactly 4 real paragraphs afterward) and the generated Scala now compiles and runs cleanly (`BEFORE-ALTER`/`IN-TARGET-ONE`/`AFTER-PERFORM` - JUMP-PARA's own un-retargeted `GO TO TARGET-ONE` still fires, since real ALTER semantics are intentionally not implemented); this is a KNOWN, DOCUMENTED semantic mismatch against cobc's own `IN-TARGET-TWO`-only oracle (registers as `t.todo('Phase 2 work queue - ...')`, not a failure - see the Known Gaps entry below), not a regression, and matches this finding's own explicit brief (fix the parse corruption only, do not implement real ALTER retargeting) | ee13 |

See `tests/round29-fixes.test.js` for focused, toolchain-independent unit
tests of these 3 findings (a parallel workstream's own COMP-1/COMP-2
float-codec findings, over the same round, may add further `describe`
blocks to that same file - not duplicated here).

### Round-29 adversarial-refutation findings (ee01/ee02/ee04/ee06/ee07 - COMP-1/COMP-2 IEEE-754 float codec gaps)

This section covers the 5 COMP-1/COMP-2 (IEEE-754 float) findings assigned to
this fix agent (ee01, ee02, ee04, ee06, ee07) - a parallel workstream's own
RECURSIVE-nested-def/ALTER findings (ee09, ee10, ee13) are covered in the
table above, not touched here (the round-29 refuter's other probes, ee03/
ee05/ee08/ee11/ee12/ee14, are further float/RECURSIVE probes not assigned to
either fix agent this round - not investigated here). Findings 1/2/4 close a
recurring gap shape this campaign has now hit four times: a byte-level
codec/display convention gets built for COMP-3/BINARY (or COMP-1/COMP-2 in a
DIFFERENT context) and simply never gets audited against COMP-1/COMP-2's own
narrower `isFloatUsage`/`scalaType` special-casing until a refuter's probe
combines the two for the first time (`isNonDisplay` omitting COMP-1/COMP-2
entirely - round-9's own convention for COMP-3/BINARY; the elementary
REDEFINES alias never reinterpreting bytes at all; `floatDisplay(v: Double)`
silently widening a Float before ever formatting it). Finding 5 (ee06) is the
single most serious finding of this round - not a narrow float-codec gap at
all, but a genuine, foundational architecture bug in this generator's
RELATIVE-file storage model, general to ANY binary-encoded field (not just
COMP-1/COMP-2), which ee06 merely happens to be the first program in this
corpus's history to expose.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 1/2 | `defaultElementaryValueWithInheritance`'s `isNonDisplay` check (`generator/scala-generator.js`, round-9 finding 3) - which routes a group-VALUE-inheriting child's own byte slice through real byte-reinterpretation instead of plain-digit-text parsing - listed COMP-3/COMP/COMP-4/COMP-5/BINARY but omitted COMP-1/COMP-2 entirely, so a COMP-1/COMP-2 child inheriting its initial value from an enclosing group's own VALUE clause fell all the way through to the final `!/^\d+$/.test(inheritedSlice)` plain-digit-text branch, which fails for arbitrary raw bytes and silently defaults to `0.0f`/`0.0` instead of decoding the sliced bytes as a real IEEE-754 float/double (ee01: `01 WS-GRP VALUE "AB1234CD". 05 WS-PREFIX PIC XX. 05 WS-FLOAT COMP-1. 05 WS-SUFFIX PIC XX.` - the raw bytes `"1234"` landing under WS-FLOAT's own 4-byte span silently became `0.0` instead of the real float32 bit pattern those 4 bytes encode; ee02 is the identical gap for an 8-byte COMP-2 child) | New `isFloatUsage`/`floatInheritedNumericText` helpers (`generator/scala-generator.js`) - `isFloatUsage` is a small shared USAGE-spelling check (COMP-1/COMPUTATIONAL-1/COMP-2/COMPUTATIONAL-2), consulted by `defaultElementaryValueWithInheritance` BEFORE the pre-existing `isNonDisplay` digit-slicing branch (a Float/Double scalaType has no PICTURE digit count to slice at all, so the digit-slicing model is meaningless for it and must not be reached). `floatInheritedNumericText` decodes `inheritedSlice`'s raw bytes via round-28's real `CobolCodecs.floatDecode`/`doubleDecode` (`generator/codecs.js`, imported alongside the pre-existing `packedDecode`/`binaryDecode`) and hands the decoded JS number's own string form to the ordinary `defaultElementaryValue` as a synthetic numeric VALUE clause - reusing every existing Float/Double literal-formatting rule (the `f`/`d` suffix) instead of re-deriving it. Verified against installed GnuCOBOL and scala-cli: ee01 (`FLOAT=1.6688934E-7`) and ee02 (`DBL=6.821320051701325E-38`) both match cobc byte-for-byte; confirmed zero regressions on every pre-existing group-VALUE-inheritance corpus program (w03/d02/d06, all COMP-3/COMP/COMP-5 children, none of which are COMP-1/COMP-2 - `isFloatUsage` is false for all of them, so the pre-existing `isNonDisplay` branch is reached exactly as before) | ee01, ee02 |
| 3 | **Silent wrong-value bug.** The "elementary REDEFINES: direct alias" codegen path (`redefinesAccessorLines`, `generator/scala-generator.js` ~line 1166) unconditionally aliased the redefining item directly to the target's own CURRENT VALUE (`def wsFloat: Float = wsInt`) with ZERO byte reinterpretation - correct only when both sides of the REDEFINES share an identical Scala representation, but silently WRONG (or a hard compile error, since `Float`/`Int` don't even implicitly convert) the instant a COMP-1/COMP-2 item redefines a differently-represented one (ee04: `01 WS-INT PIC S9(9) COMP VALUE 1078530011. 01 WS-FLOAT REDEFINES WS-INT COMP-1.` - real cobc reinterprets WS-INT's own big-endian binary-int bytes as a host-native little-endian IEEE-754 float, `-5.5641903E+16`, not any kind of numeric conversion of 78530011 itself) | When an elementary REDEFINES pairs two items with DIFFERENT Scala types AND at least one side is COMP-1/COMP-2 (`isFloatUsage`, shared with findings 1/2 above), and both sides' own byte widths match (`elementaryByteLength`), the accessor now routes through real byte encode/decode instead of a bare alias: `classifyCodec`/`encodeFieldExpr`/`decodeFieldExpr` (`case-class-gen.js`, already used elsewhere for byte-accurate FD records) encode the TARGET's current value to its own real byte representation (`CobolCodecs.binaryEncode` for a binary int, `CobolCodecs.floatEncode` for a COMP-1), then decode those EXACT SAME bytes as the REDEFINING item's own real type (`CobolCodecs.floatDecode`/`binaryDecode` respectively) - both directions operate on a genuine `Array[Byte]` directly (no ISO-8859-1 String round trip needed here, unlike `byteLeafOp`'s own flat-character-view use of the identical codecs for a byte-accurate GROUP REDEFINES, round-16 - there is no String-typed flat view backing an elementary REDEFINES' own typed Scala var). A byte-width MISMATCH between the two sides (rare/invalid COBOL) falls back to the pre-existing plain alias unchanged, exactly like every other elementary-REDEFINES shape neither side of which is COMP-1/COMP-2. Verified against installed GnuCOBOL and scala-cli (ee04): `INT=+078530011`/`FLOAT=-5.5641903E+16`/`FLOAT2=3.5`/`INT2=+000024640` (WS-INT's own VALUE, truncated to its declared 9 digits, decodes as a real IEEE-754 float when viewed through WS-FLOAT; `MOVE 3.5 TO WS-FLOAT` then re-encodes back to WS-INT's own binary-int bytes, decoding as `24640`) - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing elementary-REDEFINES corpus program (none of which pair a COMP-1/COMP-2 side with a differently-typed one, so the new branch's own guard condition is never even reached for them - the pre-existing plain-alias code is untouched, only reached via an explicit fallback path) | ee04 |
| 4 | `CobolFmt.floatDisplay(v: Double)` (round-7 findings 2/3) was called for EVERY floating-point DISPLAY regardless of whether the field was actually COMP-1 (Float) or COMP-2 (Double) - passing an actual `Float` there forces Scala's own automatic Float->Double WIDENING before the function ever sees it, and a widened 32-bit bit pattern is only an approximation of the original decimal value at full 64-bit precision, introducing REAL extra (wrong) precision digits into the formatted string (ee07: `1.0E30f` widened to Double stringifies as `"1.0000000150474662E30"` instead of the true 32-bit shortest-round-trip text `"1.0E30"` cobc's own COMP-1 DISPLAY actually shows) | New `CobolFmt.floatDisplaySingle(v: Float)` (embedded runtime, `generator/expression-gen.js`) operates on a genuine `Float` all the way through - `v.toString` on an ACTUAL (never-widened) Float produces the shortest round-tripping decimal text for the TRUE 32-bit value, sharing the same `formatFloatText` scientific-notation normalizer (trailing-`.0` mantissa stripping, missing `"+"` exponent-sign insertion - itself a NEW fix this round needed too, since neither `.0`-stripping nor exponent-sign rules had ever been exercised against a large/scientific-notation magnitude before ee07's `1.0E30`/`-1.0E30`) `floatDisplay` (COMP-2's own path) already used. `renderDisplayOperand` (`generator/expression-gen.js`) now dispatches on the field's own actual `info.scalaType` - `'Float'` routes to the new `floatDisplaySingle`, `'Double'` keeps the pre-existing `floatDisplay` - rather than "any floating type uses floatDisplay". Verified against installed GnuCOBOL and scala-cli (ee07): `REC1 ID=001 F=0`/`REC2 ID=002 F=1E+30`/`REC3 ID=003 F=-1E+30` - matching cobc byte-for-byte (zero, and both a very large positive and negative COMP-1 magnitude, all round-trip through a RELATIVE file - see finding 5 below for why ee07 was DELIBERATELY chosen not to contain an embedded 0x0A byte in its own IEEE-754 bit pattern, isolating this display-formatting fix from that separate file-corruption bug); confirmed zero regressions on every pre-existing COMP-1/COMP-2 DISPLAY corpus program (u02/u02b/dd10, all re-verified `oracleCompare()`-clean - u02/u02b's own COMP-1 values are small/exact enough that the pre-fix widening bug happened to not manifest, which is exactly why this gap went undetected until ee07's extreme magnitudes) | ee07 |
| 5 | **THE MOST SERIOUS FINDING - genuine architectural bug, not scoped to floats.** RELATIVE-file record storage (round-25's in-memory `bufVar: ArrayBuffer[String]` model) was built entirely on `scala.io.Source.fromFile(...).getLines()` for reading and `PrintWriter.println`/`.print(...); .print("\n")` for writing - ONE text "line" (`\n`-delimited) per logical record. Real COBOL RELATIVE (and INDEXED) files are FIXED-LENGTH BYTE RECORDS, not newline-delimited text - a raw 0x0A byte inside ANY binary-encoded field's own value (COMP-1/COMP-2/COMP-3/BINARY, or a packed/zoned field whose byte pattern happens to produce one) is a completely ordinary, valid occurrence, but the newline-delimited reader has no way to tell it apart from a genuine record boundary, silently SPLITTING one logical record's own bytes into two "lines" and corrupting every subsequent record's read position (ee06: COMP-2 3.25 encodes, host-native/little-endian, to bytes ending in `...00 0A 40` - a real 0x0A data byte at a real position, not a delimiter) | **Real, general architectural fix** (not a narrower interim workaround - investigated and judged tractable given the existing buffer-model code structure): a new `relativeRecordLengthRegistry` (FD file name -> its own record's total byte width, computed via `layout.js`'s `itemByteLength` over the FD's own 01 record - `scala-generator.js`, fed to independent copies in both `expression-gen.js` and `file-io-gen.js`, mirroring every other per-file registry this generator already threads through both modules) is populated ONLY for a FILE-CONTROL entry that declared `ORGANIZATION IS RELATIVE` with a determinable record length - gating this fix so a genuine LINE SEQUENTIAL file (correctly newline-delimited COBOL text) is completely unaffected, and so this is a pure ADDITION alongside the pre-existing code path, not a wholesale rewrite of it. When a file has an entry: (a) `file-io-gen.js`'s new `fixedWidthLoadLines` helper (used by both `pushBufferLoadLines`, the shared I-O/RANDOM/DYNAMIC buffer-load routine, AND the plain, non-random OPEN INPUT branch - so a SEQUENTIAL-access RELATIVE file, ee06/ee07's own shape, gets the fix too, not just RANDOM/DYNAMIC access) reads the WHOLE file as raw bytes (`java.nio.file.Files.readAllBytes`) and slices it into exactly-`recordLength`-character chunks with NO delimiter involved at all - `iteratorVar`/`bufVar` stay the exact same opaque `Iterator[String]`/`ArrayBuffer[String]` types either way, so EVERY downstream READ/keyed-READ/REWRITE/DELETE/START code path needed ZERO changes at all; (b) `generateClose`'s buffer flush now writes raw, concatenated bytes via a plain `FileOutputStream`/`.write(...)` with NO delimiter between records, instead of `bufVar.foreach(_w.println)`; (c) a plain (non-keyed) WRITE to such a file (`generateWriteStatement`) writes the EXACT fixed-width record via `.print(...)` with NO trailing newline at all, using `CobolFmt.fitLeft(text, recordLength)` (deliberately NOT `.stripTrailing()`, which would silently shrink a record whenever its own last field happens to end in whitespace - a fixed-length record's trailing bytes are real stored content, not insignificant whitespace); (d) the SAME fixed-width text-building (`plainRecordTextExpr`, shared by a KEYED WRITE's `finalTextExpr` and REWRITE's own `recordExpr`) and (e) the auto-extend gap-fill placeholder used by `generateKeyedWriteStatement`/`generateKeyedRewriteStatement`/`generateKeyedDeleteStatement` (a never-actually-written slot, previously the bare empty string `""`) is now a full-`recordLength`-width ALL-NUL placeholder (`gapFillExpr`/`relativeGapFillLiteral`) instead, so every `bufVar` entry stays uniformly `recordLength` characters wide for the raw, undelimited CLOSE-time flush to reconstruct record boundaries correctly - `pushBufferLoadLines`' own occVar-reload heuristic (a slot loaded from disk is "occupied" unless it looks like a gap) is adapted in lockstep, testing a reloaded chunk against this SAME all-NUL literal instead of the pre-fix `_.nonEmpty` check (which can no longer usefully distinguish anything once every chunk is forced to a uniform width). ADVANCING (a LINE-SEQUENTIAL/printer-file-only convention) is never combined with RELATIVE organization in real COBOL, so no ADVANCING-model interaction needed any handling at all. Verified against installed GnuCOBOL and scala-cli (ee06): `ADD=15.75`/`SUB=9.25`/`MUL=40.625`/`DIV=3.846153846153846` (a RELATIVE file with a COMP-2 field whose own IEEE-754 bytes genuinely contain 0x0A now reads back correctly across ADD/SUBTRACT/MULTIPLY/DIVIDE, not just the COMPUTE round-28 finding 3 already covered) - matching cobc byte-for-byte, INCLUDING an unrelated, previously-undiscovered COMP-2 DISPLAY precision gap this same investigation surfaced (see finding 4's own table entry, `truncateSignificantDigits` - DIVIDE's own `12.5 / 3.25` quotient is not exactly decimal-representable, and cobc's real COMP-2 DISPLAY caps at 16 significant digits, TRUNCATING rather than rounding any further ones, unlike Scala's own 17-digit shortest-round-trip `Double.toString`); confirmed zero regressions on every one of the 34 pre-existing RELATIVE-organization corpus programs (bb01-bb14, cc01-cc11, dd06-dd12, o01-o03, ee05/ee08/ee12, all re-verified `oracleCompare()`-clean, since none of their own record data happens to contain an embedded 0x0A byte - the exact reason this bug went undetected for 4 rounds of RELATIVE-file work) - see `tests/round25-fixes.test.js`/`tests/round26-fixes.test.js`/`tests/round27-fixes.test.js`'s own updated assertions (their literal generated-code shape legitimately changed for a determinable-record-length RELATIVE file; their own underlying runtime behavior, independently re-verified via `oracleCompare()`, did not) | ee06 |

See `tests/round29-fixes.test.js` (the same file findings 1/2/3 above use -
this workstream's own `describe` blocks are appended after them, clearly
marked) for focused, toolchain-independent unit tests of all 5 findings
above.

**Known, narrower residual gap left by finding 5's own fix**: a
RANDOM/DYNAMIC-access RELATIVE file's auto-extend gap-fill placeholder is
now a full-width all-NUL string rather than a plain `""` - this is
completely internal bookkeeping (never itself exposed as a real record's
own DISPLAY output, since a gap slot is only ever addressed by a
subsequent WRITE/REWRITE that overwrites it, or a READ that correctly
declines with FILE STATUS "23"/"24" before ever decoding the placeholder's
own bytes as field data - round-27 findings 3/4's own `occVar` guard,
unaffected by this round). A RELATIVE file whose own record byte width
could NOT be determined at all - either `itemByteLength` itself declines
(some shape it can't lay out at all), OR (a real bug caught and fixed
DURING this round's own testing, not merely a theoretical concern) the
FD record contains an OCCURS ... DEPENDING ON child anywhere: `itemByteLength`
itself still returns a nonzero value there (its own occursCount helper
deliberately uses the MAXIMUM count so BYTE-LEVEL LAYOUT offsets stay
fixed), but a real ODO record's own WRITE (`odoDisplayValueExpr`, round-10
finding 4) writes a VARIABLE-length concatenation driven by the field's own
LIVE counter, not always the maximum - treating such a record as uniformly
"fixed length" here would have silently misaligned the new fixed-width
byte-chunking model the instant a live count differed from the max (caught
via dd11/ee12, both of which combine OCCURS DEPENDING ON with RELATIVE
organization - confirmed regressed during this round's own manual
verification, before the new `hasOccursDependingOn` guard, `generator/
scala-generator.js`, was added to explicitly exclude any such record from
`relativeRecordLengthRegistry` at any nesting depth). Either way, a file
this fix declines to cover keeps the exact pre-existing (still line-
delimited, still theoretically vulnerable to an embedded-0x0A byte)
behavior, silently, exactly as before this round - re-verified `oracleCompare()`-clean
for dd11/ee12 with the guard in place. No corpus program (old or new)
exercises the remaining (non-ODO, `itemByteLength`-declines) narrower
residual gap.

### Round-29 post-merge regression fixes (t02 indentation, dd05 GO TO cascade)

The two round-29 fix agents above ran **concurrently against the same
working tree**. A fresh, complete full-suite verification run AFTER both
finished (before this note's own fixes) found the whole-program `todo`
count at 32, not the 31 the two agents' own tables above would predict
(28 pre-round-29 baseline + 3 legitimate new declines, ee03/ee05/ee13) -
`dd05-goto-depending-recursive.cbl` had silently flipped from a clean,
byte-for-byte oracle match (confirmed passing as of round 28) to a
mismatching `t.todo(...)`, and `tests/corpus/proc/t02-multi-file-open.cbl`
(a round-6 corpus program) now produced a hard `scala-cli` compile error
when run through `convertToScala()` directly - both fixed here, at root
cause, without reverting either agent's own real fix:

- **t02 (indentation - `generator/expression-gen.js`'s `generateReadStatement`)**:
  round-27 finding 7's "wrap the entire plain-READ body in an outer `if
  <startInvalidVar> then <swallow> else <original body>`" mechanism
  re-indents the original (pre-wrap) body by prepending exactly `"  "` to
  each element of its own `lines` array - correct as long as every element
  is a single physical line. t02's own `READ IN-FILE-A` has a `NOT AT END`
  clause that itself contains a nested `READ IN-FILE-B` (also plain/
  sequential, so it ALSO gets this same round-27 wrap) - and that nested
  READ's own fully-wrapped, already-multi-line (`\n`-joined) output is
  pushed onto the OUTER read's `lines` array as a single array element.
  Prepending `"  "` to that element only shifted its FIRST physical line;
  every other physical line folded up inside stayed exactly as indented as
  before, one level short of everything around it once embedded a second
  time - producing a Scala 3 significant-whitespace violation (an `if`'s
  own true-branch body at the SAME indentation as the `if` line itself).
  Fixed by splitting every element on `\n` before the indent bump
  (`lines.flatMap(l => l.split('\n')).map(l => \`  ${l}\`)`), so the extra
  2 spaces land on every physical line, not just once per array element,
  at any nesting depth. This bug's own root cause (`lines.map(l => ...)`)
  predates round 29 - it already existed, unnoticed, in the round-28
  commit (t02 was already an `oracleCompare()` `t.todo(...)` at the
  round-28 baseline, not a clean pass, for this exact reason, though the
  task briefing that flagged it described it as round-29-introduced) -
  fixing it now still closes a real, previously-undetected corpus gap and
  correctly reduces the `todo` count by one, regardless of which round's
  commit first introduced it. Verified via direct `scala-cli` compile
  through `convertToScala()`'s real t02 source: compiles cleanly and
  matches `t02-multi-file-open.oracle.txt` byte-for-byte (`MERGED-COUNT=02`
  / `OUT=[AAAAA11111]` / `OUT=[BBBBB22222]`).
- **dd05 (GO TO cascade - `generator/method-gen.js`'s
  `generateProgramFlowLinesNested`/`renderNestedFallthroughDefs`,
  `generator/expression-gen.js`'s `generateGoTo`)**: a genuine, round-29-
  introduced regression, caused by finding 2's (ee10) own fix above. That
  fix split the RECURSIVE nested-def convention's single per-paragraph def
  (which used to bake BOTH "callable out-of-line PERFORM/GO TO target" AND
  "the program's own natural fall-through" into the SAME def body) into a
  flat, fall-through-free def (for PERFORM/GO TO call sites) plus a
  SEPARATE `_stepN` wrapper chain (modeling natural fall-through by calling
  each paragraph's flat def as one opaque unit, then unconditionally
  deciding whether to call the next step). That split conflated two
  genuinely different COBOL semantics that the pre-round-29 single-def
  convention had never needed to distinguish: an out-of-line **PERFORM**
  runs its target and returns to the performer (must never auto-cascade -
  ee10's own concern), but **GO TO** transfers control to its target
  *permanently*, and real paragraph-to-paragraph fall-through correctly
  resumes from wherever GO TO actually landed - exactly like natural
  top-to-bottom flow would from that same point. dd05's `MAIN-PARA` ends
  `GO TO PATH-ZERO, PATH-ONE, PATH-TWO DEPENDING ON WS-SEL` followed by a
  fallback `DISPLAY` (so the GO TO is deliberately NOT the paragraph's own
  last statement - COBOL falls through to that DISPLAY, then off the
  paragraph's end, only when WS-SEL is out of range). The `_stepN` wrapper
  called `MAIN-PARA`'s flat def as one opaque unit and, seeing its own last
  statement wasn't an unconditional transfer, unconditionally called the
  next step afterward too - with no way to tell "the flat def returned
  because one of its DEPENDING ON arms already fired `return pathTwo()`
  partway through" apart from "the flat def genuinely fell through to its
  own end" (both look identical from outside a plain function call) -
  spuriously re-invoking `PATH-ZERO` after `WRAP-UP`'s own natural
  completion, on EVERY activation, real cobc never does. Fixed by removing
  the `_stepN` split entirely and instead giving every paragraph in the
  RECURSIVE whole-program flow list a `_chain: Boolean = false` parameter
  (`renderNestedFallthroughDefs`'s new `gated` mode) that gates its own
  appended fall-through tail call: an out-of-line PERFORM/qualified GO TO
  OF SECTION still calls with no args (`_chain` defaults `false`, so it
  still can never re-trigger fall-through - ee10 stays fixed), while GO
  TO's own target call (`generateGoTo`) now explicitly passes `_chain =
  true`, and the program's true entry point enters `units[0]` the same way
  (`renderSectionAwareEntryCall`'s new `chained` flag). A `return` embedded
  partway through a paragraph's own body (from an unconditional GO TO, or a
  fired DEPENDING ON arm) is lexically inside that SAME def again (no
  separate wrapper), so it correctly short-circuits that def's own appended
  fall-through call too - restoring the exact single-def short-circuiting
  the pre-round-29 convention relied on, but now WITH ee10's fix intact.
  ee09's EXIT SECTION/EXIT PARAGRAPH machinery (`needsSectionCatch`/
  `needsParagraphBoundary`, `paragraphsContainExitOfType`) is preserved
  unchanged, just re-homed onto this same per-def `_chain` gating instead
  of the removed `_stepN` chain. Verified against installed GnuCOBOL and
  scala-cli (dd05): `ENTER N=02`/`PATH-TWO N=02`/`ENTER N=01`/`PATH-ONE
  N=01`/`EXIT N=01`/`EXIT N=02` - matching cobc byte-for-byte (no more
  spurious `PATH-ZERO` lines); re-verified `oracleCompare()`-clean on
  ee09/ee10/ee14 (the RECURSIVE EXIT SECTION/PARAGRAPH and out-of-line
  PERFORM/qualified-GO-TO corpus programs this same convention also
  covers) and every pre-existing RECURSIVE-program corpus program
  (`tests/round21-fixes.test.js` through `tests/round29-fixes.test.js`'s
  own focused unit tests, updated only where they asserted the removed
  `_stepN`/bare-`(): Unit =` literal shape - their underlying behavioral
  assertions are unchanged).

Net effect on the whole-suite `todo` count: 32 (post-merge, pre-this-fix)
&rarr; 30 (28 pre-round-29 baseline, minus t02's now-fixed pre-existing
gap, plus ee03/ee05/ee13's 3 legitimate new round-29 declines) - see
`tests/round29-fixes.test.js` for the updated focused unit-test assertions
these two fixes required.

### Round-30 adversarial-refutation findings (ff01/ff09/ff13/ff14) and their fixes

A round-30 refuter left 14 new probes (ff01-ff14, 10 already passing/
honest); this section covers the 4 that were failing - ff01, ff09, ff13,
ff14 - which the task briefing grouped into 3 root causes. Finding 3
(ff09/ff14) is fixed first, as the most clean-cut, scoped bug; finding 1
(ff01) extends round-29 finding 5's own fixed-width RELATIVE-file model to
cover the one shape it deliberately excluded (an ODO-bearing record); finding
2 (ff13) is a genuine architectural tension between this engine's simplified
flat-byte-array file model and content-based occupied-slot reconstruction -
investigated and resolved as a REAL fix (not a Known Gap), since a reliable
signal already available in-process (the engine's own prior in-memory
occupied-tracking array, never actually invalidated by CLOSE) turned out to
make the content-based heuristic's own ambiguity avoidable entirely, without
touching the on-disk file format at all.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 3 | **WRITE/READ encoding asymmetry, the most basic and common gap this round found.** A plain signed DISPLAY (zoned-decimal, default trailing-overpunch sign - no `SIGN IS LEADING/TRAILING SEPARATE` clause) field written to a file and read back crashed with `IllegalArgumentException: zonedDecode: non-digit data in '+0123'`, even for a POSITIVE value on the very first record. Root cause: `writeRecordPlan`'s (`generator/expression-gen.js`) "plain, all-DISPLAY group" branch built its WRITE text via `groupDisplayValueExpr` - a convention built for the CALL BY REFERENCE marshalling channel (round-9 finding 2), which prepends a LITERAL `'+'`/`'-'` marker BYTE before an UNSIGNED digit run - while `readDestination`'s 'group' READ path (same file) ALWAYS decodes back through the SAME record's real generated `.parse()` (`CobolCodecs.zonedDecode`, a genuine trailing zone-overpunch decoder, case-class-gen.js) regardless of whether the group happens to contain a non-DISPLAY field - a hard WRITE/READ asymmetry: the marker-byte text is one byte too wide for the field's real declared PICTURE width and uses an encoding `zonedDecode` was never built to read, corrupting every byte position after it. A SEPARATE, previously-masked bug surfaced once this crash was fixed: `renderVariableMoveSource`'s (`generator/expression-gen.js`) plain numeric-target MOVE branch had never been audited against COMP-1/COMP-2 (Float/Double) targets the way `storeNumericByInfo` (COMPUTE/ADD/SUBTRACT, round-7 findings 2/3) already was - `MOVE IN-VAL TO SORT-KEY-F` (ff09's own COMP-1 SORT KEY) silently truncated through `CobolFmt.truncNumeric(v, 18, 0)` (meaningless digit-width coercion for a field with no PIC clause at all) THEN `.toInt`, discarding the entire fractional part and any true floating-point representation - `30.5`/`-12.25` silently became `30`/`-12` - masked behind the zonedDecode crash for every round until now, since ff09 never got far enough to reach its own SORT comparison before crashing on the very same file's own READ | **Encoding symmetry (root fix)**: `writeRecordPlan`'s decision for an all-DISPLAY group with NO OCCURS table anywhere (`groupContainsTable`, a new helper mirroring `groupContainsNonDisplay`) now attempts the SAME byte-accurate case-class codec (`.format()`/`.parse()`, `groupChildConstructorExpr`) READ already always used, instead of falling to `groupDisplayValueExpr`'s CALL-marshalling-only text convention - `writeRecordPlan` only falls back to the old text-mode path when `groupChildConstructorExpr` itself declines (a FILLER/ambiguous-nested-group child, unchanged narrow shape from before this round). A record combining a non-DISPLAY field with an OCCURS table (ff01's own shape) is covered by finding 1 below, not this one. **MOVE-to-float companion fix**: `renderVariableMoveSource`'s numeric-target branch now checks `info.scalaType === 'Float'/'Double'` BEFORE building the `CobolFmt.truncNumeric(...)` expression (mirroring `storeNumericByInfo`'s own round-7 special case exactly) and returns a direct `(<value>).toFloat`/`.toDouble` coercion instead - the PIC-based digit-truncation model has no meaning for a USAGE with no PIC clause at all. Verified against installed GnuCOBOL and scala-cli: ff14 (`ID=01 VAL=+012.34`/`ID=02 VAL=-000.12`/`ID=03 VAL=+000.00`/`ID=04 VAL=-099.99`) and ff09 (`SORTED ID=02 KEY=-12.25`/`ID=04 KEY=-0.12`/`ID=03 KEY=7`/`ID=01 KEY=30.5`/`ID=05 KEY=99.75`) both match cobc byte-for-byte; confirmed zero regressions on every pre-existing signed-numeric-file-I/O corpus program (y05's own SIGN IS LEADING SEPARATE, y06's COMP-3, dd10/ee06/ee07's COMP-1/COMP-2 RELATIVE records, u12/t01/x03/x04/w03's plain-DISPLAY group WRITE/READ, all re-verified `oracleCompare()`-clean - none of them is the ONE narrow shape this fix changed: an all-DISPLAY group with NO table that previously fell to text mode) | ff09, ff14 |
| 1 | **Round-29's own fixed-width RELATIVE-file model (finding 5) EXCLUDED any ODO-bearing record entirely**, falling back to the OLD line-delimited reader for the WHOLE record - reintroducing round-29's own embedded-0x0A-byte corruption bug, narrowed to "an ODO record that ALSO has a binary/float field elsewhere in the same record" (ff01: OCCURS DEPENDING ON combined with a COMP-2 field whose IEEE-754 bytes genuinely contain 0x0A). Investigated (rather than assumed) what cobc's own on-disk RELATIVE-file representation actually does for an ODO record via a direct GnuCOBOL probe (two records, live counts 2 and 3 of a 1-to-3-times OCCURS DEPENDING ON table): confirmed cobc pads EVERY record's own table portion to its declared MAXIMUM width regardless of live count (the un-lived tail bytes are genuinely present on disk, e.g. left as whatever a prior WRITE happened to leave there) - the "ODO records have no determinable fixed length" premise was only ever true for THIS engine's own pre-round-30 write path (`odoDisplayValueExpr`'s variable-length text), not for cobc's real on-disk format, which is exactly as fixed-width as an ordinary record. A SECOND, narrower gap: even setting that aside, `writeRecordPlan` declined the WRITE OUTRIGHT (a silent no-op `bytes-unsupported` TODO) the instant ANY non-DISPLAY field combined with ANY OCCURS table in the same record, regardless of file organization | **"Pad to declared maximum" - the real, general fix the task briefing hoped for, confirmed against cobc's own byte layout rather than guessed.** `relativeRecordLengthRegistry`'s build site (`scala-generator.js`) no longer excludes an ODO record (the `hasOccursDependingOn` guard is removed entirely) - `itemByteLength` already computes an ODO table's own MAXIMUM byte width (occursCount's existing convention for byte-level layout purposes), which is now exactly the right, determinable `recLen` for the fixed-width chunk model too. This alone fixes every ODO-only (no non-DISPLAY sibling) RELATIVE record "for free": `plainRecordTextExpr`'s pre-existing `CobolFmt.fitLeft(plan.expr, recLen)` call (unconditionally reused, no changes needed) now pads a live-count-driven `odoDisplayValueExpr` WRITE up to the registered maximum automatically, matching cobc's own real padding behavior. The remaining, narrower gap - a non-DISPLAY field co-present with a table (ff01's own shape) - needed one more change: `groupChildConstructorExpr` (`generator/expression-gen.js`) gained a new `allowTables` parameter (default `false`, every pre-existing call site unaffected) that, when true, contributes an OCCURS table child's own flat Vector var directly as a constructor argument instead of declining - safe because that flat var (fixed-size OR ODO alike) is ALWAYS already a full maximum-size Vector (e.g. `Vector.fill(3)(...)`, mutated only via `.updated(i, ...)`, never resized), the exact same shape the generated case class's own table field already expects. `writeRecordPlan` only turns `allowTables` on for a RELATIVE-organization file with a determinable maximum record byte width (`relativeRecordLengthFor(fileName)`, now threaded through as a new parameter) - the ONE case the direct cobc probe actually confirmed pads to maximum; a LINE SEQUENTIAL file (or any other org) keeps `allowTables` false, so that combination still declines exactly as before this round (no corpus program exercises it). A pure-ODO-table-no-non-DISPLAY group (dd11/ee12's own shape) is completely unaffected by the `allowTables` change - it never reaches `groupChildConstructorExpr` at all (writeRecordPlan's own gating condition, `containsNonDisplay || !containsTable`, is false for that shape both before and after this round), so it stays on the pre-existing, already-oracle-verified text-mode path, now simply also padded via the recLen-registry fix above. Verified against installed GnuCOBOL and scala-cli (ff01): `WRITE1 ST=00`/`WRITE2 ST=00`/`READ1 ST=00 COUNT=2 VAL=3.25`/`ITEM(1)=AAA`/`ITEM(2)=BBB`/`READ2 ST=00 COUNT=3 VAL=6.5`/`ITEM(1)=CCC`/`ITEM(2)=DDD`/`ITEM(3)=EEE`/`AT-END ST=10` - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing RELATIVE+ODO corpus program (dd11, ee12, both re-verified `oracleCompare()`-clean, plus every non-ODO RELATIVE-file corpus program using the fixed-width model - bb01-14, cc01-12, dd06-12, o01-03, ee05-08, x03/x04, y05/y06, w03, u12, t01 - all re-verified clean) | ff01 |
| 2 | **A REAL fix, not a Known Gap.** A RELATIVE-file record whose entire content is genuinely all-zero bytes (a COMP-1 field holding `0.0`, ff13) is indistinguishable, from content alone, from a never-written gap slot - `pushBufferLoadLines`'s (`file-io-gen.js`) occupied-tracking reload heuristic (round-27 findings 3/4, adapted by round-29 finding 5) compares each reloaded record's own bytes against the all-NUL gap-fill placeholder, which cannot tell "genuinely all-zero content" apart from "never written" after a CLOSE+reopen round trip - a keyed READ of the genuinely-written all-zero record wrongly reported "not found" (status 23), and a subsequent WRITE to that same key wrongly succeeded (status 00) instead of correctly detecting an already-occupied duplicate key (status 22). Investigated whether a tractable fix exists WITHOUT changing the on-disk file format: **it does.** `generateClose` (`file-io-gen.js`) flushes and nulls the record buffer (`bufVar`) on CLOSE, but NEVER nulls the occupied-tracking array (`occVar`) - so a perfectly accurate, already-in-memory answer from an EARLIER open/close cycle in the SAME running program silently went unused, overwritten every time by a fresh, ambiguous content-based guess, even though nothing other than this program's own WRITE/REWRITE/DELETE (all of which already keep `occVar` exactly in sync) could possibly have changed the file's bytes in between | `pushBufferLoadLines`'s occVar-reload assignment (both branches - the round-29 fixed-width/all-NUL-literal one AND the older line-delimited/`.nonEmpty` one, for consistency) is now gated behind a runtime `if <occVar> == null then <rebuild-from-content>` check instead of an unconditional rebuild - the content-based heuristic only ever runs on this file's genuine FIRST open in this run (when there is no prior in-memory answer to trust at all - the only case that's still an honest guess, not a regression); every later reopen within the same run reuses the exact array already sitting in memory, which is ground truth, not a heuristic. A fresh `OPEN OUTPUT` of a RANDOM/DYNAMIC-access file (a genuinely different code path, not `pushBufferLoadLines`) still unconditionally allocates a brand-new empty `occVar`, exactly as before - re-truncating a file correctly resets its own occupied-tracking too. Verified against installed GnuCOBOL and scala-cli (ff13): `WRITE1 ST=00`/`WRITE2 ST=00`/`READ1 ST=00 VAL=0`/`READ2 ST=00 VAL=9.5`/`REWRITE-CHECK-DUPKEY ST=22` - matching cobc byte-for-byte (the genuinely-written all-zero record at key 1 is now found, AND a subsequent WRITE to that same key correctly reports duplicate-key status 22); confirmed zero regressions on every pre-existing close/reopen-cycling RELATIVE-file corpus program (dd08 - literally named `occvar-reopen-reload` - bb05/bb09/bb10/bb13/bb14, cc01/cc02/cc05/cc06, ee05/ee08/ee12, o01-03, all re-verified `oracleCompare()`-clean) | ff13 |

See `tests/round30-fixes.test.js` for focused, toolchain-independent unit
tests of all 3 findings above (11 assertions across 6 `describe` blocks,
including regression coverage for the LINE SEQUENTIAL ODO case finding 1
deliberately leaves untouched, and the fresh-`OPEN OUTPUT` case finding 2
deliberately leaves untouched).

Net effect on the whole-suite `todo` count: 30 (round-29 baseline) &rarr; 30
(unchanged) - all 4 fixes above are genuine, oracle-verified corrections to
already-promoted corpus programs (ff01/ff09/ff13/ff14), not new declines;
the round-30 refuter's other 10 probes (ff02-ff08, ff10-ff12) were already
passing/honest at hand-off and needed no further work this round.

### Round-31 adversarial-refutation findings (gg01/gg05/gg15) and their fixes

A round-31 refuter left 15 new probes (gg01-gg15, 12 already passing/
honest); this section covers the 3 that were failing - gg15, gg01, gg05 -
fixed in that order per the task briefing: gg15 (a clean, self-contained
parser clause-ordering bug) first, then gg01 (extends round-30 finding 2's
own occVar-persistence fix to a gap in its own reasoning), then gg05
(extends round-30 finding 3's own signed-DISPLAY byte-mode fix to a
combination its own gating condition explicitly excluded).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 3 | **Parser bug: a bare `READ ... NOT INVALID KEY` (no preceding `AT END`/`INVALID KEY` clause) silently vanished, with no crash or marker of any kind.** `parseReadStatement`'s (`parser/procedure-parser.js`) clause-parsing loop has TWO independent "NOT ..." clauses - `NOT AT END` and `NOT INVALID KEY` - parsed by two separate, UNCONDITIONAL `if (ctx.matchValue('NOT'))` checks in sequence (the AT-END-oriented one first). `matchValue('NOT')` consumes the NOT token the instant it sees one, with no lookahead - so `READ REL-FILE NOT INVALID KEY DISPLAY ... END-READ` (legal COBOL; every pre-existing corpus program instead pairs `INVALID KEY` with `NOT INVALID KEY` together, cc06's own idiom, which never reaches this ambiguity, since the paired form's own preceding `INVALID KEY` branch already consumes its own tokens first) had its NOT token greedily consumed by the FIRST check. `ctx.matchValue('AT')` then failed (the next token is INVALID, not AT), `ctx.matchValue('END')` failed too, and `parseStatementBlock` ran anyway from that wrong position - silently swallowing "INVALID KEY DISPLAY ..." as if it were a NOT-AT-END block's own body, leaving the SECOND `if (ctx.matchValue('NOT'))` below with no NOT token left to find at all - the genuine `NOT INVALID KEY` clause and its imperative statement (gg15's own `DISPLAY "FOUND-KEY1 VAL=" REC-VAL`) never reached `stmt.notInvalidKey`, vanishing entirely with no error, marker, or crash | `parseReadStatement`'s first NOT check now looks ahead (`ctx.peek(1)`, without consuming the NOT token) to confirm the NEXT token is actually `AT` before treating this as `NOT AT END` at all - only then is NOT consumed (`ctx.checkValue('NOT') && ctx.peek(1)?.value?.toUpperCase() === 'AT'`, replacing the bare `ctx.matchValue('NOT')`). A `NOT INVALID KEY` (next token INVALID, not AT) now falls through this check untouched, reaching the pre-existing `INVALID KEY`/`NOT INVALID KEY` checks below exactly where it belongs, whether or not an `AT END`/`INVALID KEY` clause precedes it. Verified against installed GnuCOBOL and scala-cli (gg15): `FOUND-KEY1 VAL=AAAAA`/`AFTER-READ1 ST=00`/`AFTER-READ9 ST=23` - matching cobc byte-for-byte (key 9 doesn't exist, so its own `NOT INVALID KEY` body correctly does NOT fire, and no `FOUND-KEY9` line prints); confirmed zero regressions on the already-correct `NOT AT END` case (with or without a preceding `AT END` clause) and the paired `INVALID KEY ... NOT INVALID KEY` idiom (cc06, gg09, both re-verified `oracleCompare()`-clean) | gg15 |
| 1 | **A gap in round-30 finding 2's own reasoning, not a new bug class.** Round-30 finding 2 made a RELATIVE file's occupied-tracking array (`occVar`) reload reuse the in-memory array verbatim once it's non-null (only rebuilding from disk content on this file's true FIRST open), reasoning that "nothing other than this program's own WRITE/REWRITE/DELETE could possibly have changed the file's bytes in between." That reasoning silently assumed a logical file's own `occVar` is the ONLY actor touching its physical path - but this engine generates a SEPARATE `bufVar`/`occVar`/etc. set per logical file NAME (per SELECT/FD entry), while cobc allows two DIFFERENT logical files (two different SELECT/FD entries) to be `ASSIGN`ed to the SAME physical path. gg01: FILE-A writes one record and closes; a DIFFERENT logical file, FILE-B, then opens OUTPUT and rewrites that SAME shared physical path with different content/size (3 records, one of them a gap) and closes; FILE-A then reopens I-O - its own persisted `occVar` (sized/valued from its earlier, shorter 1-record session) is stale the moment it reopens, since a completely different actor changed the file's physical shape out from under it. Trusting it unconditionally (round-30's `== null` check alone) reads key 3 from the freshly-reloaded `bufVar` (correctly showing the file's NEW, 3-record content) but indexes the STALE, still-1-element `occVar` at that position - an `IndexOutOfBoundsException` | The freshly-reloaded `bufVar`'s own record count (always trustworthy - it comes straight off disk, computed just above) is compared against the persisted `occVar`'s own length: if they MATCH, round-30's reuse still applies unchanged (the common case - this file's own occVar genuinely still describes this file's current shape). If they DIFFER, `occVar` can no longer be trusted at all (some other actor changed this file's physical shape since this logical file last saw it) - it is rebuilt from the freshly-reloaded content instead, exactly as if this were a true first open. `pushBufferLoadLines`'s (`generator/file-io-gen.js`) reload-gate condition becomes `if <occVar> == null \|\| <occVar>.length != <bufVar>.length then <rebuild-from-content>`, applied to BOTH branches (the fixed-width/all-NUL-literal RELATIVE-file one, and the older line-delimited/`.nonEmpty` one, for the same consistency round-30 itself applied its own fix to both branches). Verified against installed GnuCOBOL and scala-cli (gg01): `A-WRITE1 ST=00`/`B-WRITE-KEY1 ST=00`/`B-WRITE-KEY3 ST=00`/`A-READ-KEY1 ST=00 VAL=5000`/`A-READ-KEY2 ST=23`/`A-READ-KEY3 ST=00 VAL=7000` - matching cobc byte-for-byte (FILE-A's reopened READ correctly sees FILE-B's own rewritten content, including the genuine gap at key 2 FILE-B itself never wrote); confirmed zero regressions on every pre-existing close/reopen-cycling RELATIVE-file corpus program (dd08, ff13, bb05/bb09/bb10/bb13/bb14, cc01/cc02/cc05/cc06, ee05/ee08/ee12, o01-03, all re-verified `oracleCompare()`-clean - none of them shares a physical path across two different logical files, so the length comparison is a no-op agreement for every one of them, exactly preserving round-30's own reuse behavior) | gg01 |
| 2 | **Round-30 finding 3's own gating condition explicitly excluded this combination, reproducing round-30's own fixed crash for it.** `writeRecordPlan`'s (`generator/expression-gen.js`) decision to route a signed-DISPLAY-bearing all-DISPLAY group through the byte-accurate case-class codec (round-30 finding 3) was gated `containsNonDisplay \|\| (containsSignedDisplay && !containsTable)` - the `!containsTable` clause meant a record combining a signed DISPLAY field with an UNRELATED OCCURS table (even a plain, non-ODO, fixed-size table of ordinary DISPLAY elements - gg05: `REC-ITEM PIC S9(3)V99 OCCURS 3 TIMES` alongside `REC-ID PIC 9(2)`, no non-DISPLAY field anywhere) still fell through to the OLD `groupDisplayValueExpr`/`odoDisplayValueExpr` marker-byte text convention, reproducing the EXACT `zonedDecode: non-digit data` crash round-30 finding 3 was meant to close. Investigated WHY the exclusion existed rather than assuming it was arbitrary: it predates round-30 finding 1's own `allowTables` parameter on `groupChildConstructorExpr` (also this round-30, but a SEPARATE fix within the same round) - at the time finding 3's own condition was written, `groupChildConstructorExpr` had no way to handle a table child AT ALL, so excluding any table from the signed-DISPLAY byte-mode path was the only honest option then available. By the time round-30 landed, `allowTables` already existed (added for finding 1's own non-DISPLAY-plus-table combination), but finding 3's own condition was never revisited to take advantage of it. Separately confirmed `case-class-gen.js`'s byte-level codec ALREADY fully supports a plain (non-group) OCCURS table of DISPLAY elements, signed or not - `classifyCodec`'s `signed` flag is read per table ELEMENT, from that element's own PIC clause, exactly like an ordinary non-table elementary field - so this is not a "byte-level path can't handle tables" gap for this shape at all; it is simply that `writeRecordPlan` never tried, since `!containsTable` was written before `allowTables` existed | `writeRecordPlan`'s condition drops the `!containsTable` exclusion entirely (now `containsNonDisplay \|\| containsSignedDisplay`, matching `containsNonDisplay`'s own unconditional table-agnostic check just above it) - a signed-DISPLAY + table record now reaches the SAME `allowTables`-gated `groupChildConstructorExpr` call finding 1 already established: still byte mode ONLY for a RELATIVE-organization file with a determinable maximum record byte width (`relativeRecordLengthFor` - the one shape finding 1's own direct cobc probe confirmed pads to maximum) - a LINE SEQUENTIAL file (or any other organization) keeps `allowTables` false, so `ctorArgs` comes back null for that narrower shape and the combination falls through to the pre-existing text-mode path below, exactly as before this round (no corpus program exercises that narrower combination - a genuine, not new, boundary this round leaves exactly where finding 1 already drew it, not a regression or a fresh decline). Verified against installed GnuCOBOL and scala-cli (gg05): `WRITE1 ST=00`/`WRITE2 ST=00`/`READ1 ST=00 ID=01`/`  ITEM(1)=+012.34`/`  ITEM(2)=-056.78`/`  ITEM(3)=-001.00`/`READ2 ST=00 ID=02`/`  ITEM(1)=-000.01`/`  ITEM(2)=+099.99`/`  ITEM(3)=-099.99`/`AT-END ST=10` - matching cobc byte-for-byte; confirmed zero regressions on every pre-existing signed-DISPLAY-file (ff09, ff14, y05, y06), OCCURS-table-file (dd11, ee05, ee12, ff01, x04), and general RELATIVE/LINE-SEQUENTIAL file-I/O corpus program (bb01-14, cc01-06, o01-03, u12, t01, w03, x03, all re-verified `oracleCompare()`-clean - an all-unsigned table, dd11's own shape, is unaffected since `containsSignedDisplay` is false for it; a signed field with no table at all, ff09/ff14's own shape, is unaffected since it never depended on `containsTable` in the first place) | gg05 |

See `tests/round31-fixes.test.js` for focused, toolchain-independent unit
tests of all 3 findings above (11 assertions across 8 `describe` blocks,
including regression coverage for the already-correct `NOT AT END`/paired
`INVALID KEY ... NOT INVALID KEY` READ idioms finding 3 leaves untouched,
the same-physical-file reopen case finding 1's length-comparison keeps
behaviorally identical to round-30, and the LINE-SEQUENTIAL/all-unsigned-
table/no-table boundary cases finding 2 deliberately leaves untouched).

Net effect on the whole-suite `todo` count: see the exact reconciled count
recorded at the end of this round's own verification pass below - all 3
fixes above are genuine, oracle-verified corrections to already-promoted
corpus programs (gg01/gg05/gg15), not new declines; the round-31 refuter's
other 12 probes (gg02-gg04, gg06-gg14) were already passing/honest at
hand-off and needed no further work this round.

### Round-32 adversarial-refutation findings (hh01/hh02/hh03/hh04/hh12) and their fixes

A round-32 refuter (explicitly briefed to keep pressure-testing round 31's
own fixes as its primary strategy, given rounds 22-31 all found real bugs
this same way) left 12 new probes (hh01-hh12, 7 already passing/honest);
this section covers the 5 that were failing - fixed in priority order:
the byte-layout bug (findings 3/4/5, foundational and shared across three
probes) first, then the compile crash (part of the same finding), then the
occVar content-fingerprint gap (finding 2, the most architecturally
significant), then WRITE's AT END-OF-PAGE clause (finding 1, lowest
priority, resolved with a real fix rather than a decline once the
triggering condition turned out to be simple).

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 3 | **An OCCURS table of GROUPS (each group containing a signed field and a plain field) in a RELATIVE-file record crashed at Scala COMPILE time.** `groupChildConstructorExpr`'s `allowTables` path (round-30 finding 1, `generator/expression-gen.js`) was built to handle a table of plain ELEMENTARY fields (a `Vector[Int]`/`Vector[String]` constructor argument) - a table whose own elements are themselves GROUPS (hh03: `REC-ROW OCCURS 2 TIMES { ROW-AMT PIC S9(3)V99. ROW-TAG PIC X(2). }`) needs a `Vector[<nested case class>]` argument instead, and the pre-fix code conflated the two shapes, passing a flat scalar-typed Vector where the constructor expected a nested-case-class-typed one - a hard type mismatch | Extended the leaf-resolution machinery to recognize a table child that is ITSELF a group (not just a table of scalars) and build the correct `Vector[<RowCaseClass>](<RowCaseClass>(...), ...)` nested constructor expression, generating a genuine per-row case class for the table's own row shape exactly like an ordinary (non-table) nested group already gets. Verified against installed GnuCOBOL and scala-cli (hh03): both rows' own signed/plain fields round-trip correctly through WRITE/READ | hh03 |
| 4/5 | **A nested (non-repeating) group containing an OCCURS table of signed elements misaligned every keyed READ by exactly one whole record.** The fixed-width RELATIVE-file byte-width calculation (round 29-30's own `itemByteLength`-derived record length) undercounted the total width whenever an OCCURS table sat inside a nested, non-repeating group rather than directly at the record's own top level - the table child's own per-occurrence width times its occurs count was not being correctly summed into the ENCLOSING group's own total before that group's own width was added to the record's grand total, so the record's own declared fixed-width chunk size was too small. Every keyed READ then read from the WRONG byte offset - starting mid-way through record 1 and ending mid-way through record 2 - so the very first READ returned the SECOND written record's data instead of the first. Confirmed independently with both default trailing-overpunch (hh04) and `SIGN IS LEADING SEPARATE` (hh12) sign representations, proving the bug was in the WIDTH/OFFSET arithmetic itself, not the sign encoding | Fixed the nested-group width-summing recursion to correctly multiply a table child's own per-occurrence width by its occurs count BEFORE adding it into the enclosing (non-repeating) group's own running total, for any nesting depth - not just when the table sits directly at the record's own top level. Verified against installed GnuCOBOL and scala-cli (hh04, hh12): both records now read back in the correct order with the correct field values | hh04, hh12 |
| 2 | **Round-31's own occVar staleness check (comparing array LENGTH only) could be defeated by coincidence.** Round 31 fixed a cross-logical-file-same-physical-path staleness bug by comparing the persisted `occVar`'s length against the freshly-reloaded `bufVar`'s length on every reopen - but this only detects a CHANGE IN RECORD COUNT, not a change in WHICH records are occupied while the count stays the same. hh02 engineers exactly this: FILE-B rewrites the shared physical file with the SAME total record count FILE-A last saw, but a DIFFERENT specific record (key 2) is now a genuine gap - FILE-A's stale, coincidentally-same-length `occVar` survives round 31's check undetected, and reading the now-gap slot crashes decoding blank placeholder bytes as real data | Added a lightweight content fingerprint per file (`someFileSig`, captured at CLOSE time as the exact string content of the buffer just flushed to disk) as a THIRD disjunct in the reload-staleness check: `occVar == null \|\| occVar.length != bufVar.length \|\| fileSig != freshSig` (the freshly-reloaded buffer's own content, computed at the same reload site). A length-preserving rewrite by a different logical file now changes the fingerprint even though the record count didn't change, correctly forcing a rebuild from content; an untouched file (the overwhelming common case) has a fingerprint that trivially matches itself, so round 30/31's own reuse-when-safe behavior is completely unchanged for every pre-existing corpus program. Verified against installed GnuCOBOL and scala-cli (hh02): FILE-A's reopened READ now correctly detects FILE-B's rewrite and reports status 23 for the genuine gap at key 2, matching cobc exactly | hh02 |
| 1 | **WRITE's `AT END-OF-PAGE ... NOT AT END-OF-PAGE` clause was entirely unimplemented** - parsed into the AST but never consulted by `generateWriteStatement` at all, silently dropping both branches with zero visible marker, undocumented anywhere as a Known Gap. Investigated cobc's own real trigger condition rather than assuming it was too complex to implement (hh01: `LINAGE IS 2 LINES`, 4 successive WRITEs, alternating NOTEOP/EOP/NOTEOP/EOP) | Implemented for real, not a decline: a per-file LINAGE line-counter (`LINAGE IS <n> LINES`, a plain integer literal), incremented by one on every WRITE to a LINAGE-bearing file, compared against that file's own declared page size, resetting to 0 the instant it reaches that size (a fresh page) - AT END-OF-PAGE fires exactly on that reset, matching "line counter reaches the declared page size" precisely. A file with no LINAGE clause at all (every pre-existing corpus program) has no registry entry, so this is a pure addition - the pre-existing silent-drop behavior is unchanged for it. Verified against installed GnuCOBOL and scala-cli (hh01): NOTEOP/EOP/NOTEOP/EOP across 4 WRITEs, matching cobc byte-for-byte | hh01 |

See `tests/round32-fixes.test.js` for focused, toolchain-independent unit
tests of all 5 findings above, including regression coverage confirming
round 30/31's own occVar-reuse behavior is byte-for-byte unchanged when no
cross-file rewrite has actually occurred, and that a table of plain
(non-group) elements or a top-level (non-nested) table keeps its
pre-existing generated shape exactly as round 30/31 left it.

Net effect on the whole-suite `todo` count: all 5 fixes above are genuine,
oracle-verified corrections to already-promoted corpus programs
(hh01/hh02/hh03/hh04/hh12), not new declines - the round-32 refuter's other
7 probes (hh05-hh11) were already passing/honest at hand-off and needed no
further work this round. Independently re-verified by the orchestrator
after an activity gap interrupted the fix agent's own first verification
attempt mid-run: a complete, from-scratch full-suite pass showed 1624/1653
passing, 0 failing, 29 todo - unchanged from round 31's own baseline,
confirming none of this round's 5 fixes introduced a new decline or left
any prior gap unresolved.

### Round-33 adversarial-refutation findings (ii01/ii06/ii09) and their fixes

A round-33 refuter (again briefed to keep pressure-testing prior rounds' own
fixes, given rounds 22-32 all found real bugs this same way) left 13 new
probes (ii01-ii13, 10 already passing/honest); this section covers the 3
that were failing.

| # | Finding | Fix | Program(s) |
|---|---|---|---|
| 3 | **STRING's own `WITH POINTER` value, after an `ON OVERFLOW` truncation, silently advanced by the ENTIRE source segment's own length rather than the number of characters actually written into the bounded target.** `generateString`'s (`generator/expression-gen.js`) per-character bounds-check loop already correctly detects overflow and stores only the characters that fit (`_overflow = true` for anything past the target's own width) - both the overflow condition and the truncated target content were already correct - but the very next line unconditionally advanced `_ptr` by `<segVar>.length`, the FULL source segment's own length, with no regard for whether every character of it actually fit. Real cobc leaves the pointer positioned exactly where writing stopped (right after the last character genuinely stored) - confirmed a GENERAL bug (`generateString` is called identically regardless of which paragraph-rendering convention wraps it), not something specific to ii09's own RECURSIVE-paragraph repro (chosen by the refuter only to probe whether the recursive nested-local-def convention interacted with it - it doesn't) | Added a per-segment written-character counter (`_writtenN`), incremented in lockstep with the pre-existing bounds check exactly when a character is actually stored (`_sb.setCharAt(...); _writtenN += 1`, the `else _overflow = true` branch left untouched) - `_ptr` now advances by `_writtenN` instead of the segment's raw `.length`. A segment that never overflows has `_writtenN == <segVar>.length` at runtime (every character passes the bounds check), so this is behaviorally identical to before this fix for any non-overflowing STRING - a pure correction of the truncated case only. Verified against installed GnuCOBOL and scala-cli (ii09): `TARGET=[HELLO]`/`PTR=06` (position right after the 5th stored character), matching cobc exactly - the pre-fix generated code produced `PTR=11` (1 + the full 10-character source length) instead | ii09 |
| 2 | **A table-within-a-table-of-groups RELATIVE-file record crashed at Scala COMPILE time with a bare undeclared-identifier reference, not a decline.** Round-32's `groupChildConstructorExprIndexed` (`generator/expression-gen.js`) correctly and deliberately declines (returns `null`) a table-of-groups row that ITSELF contains another nested OCCURS table (ii06: `REC-ROW OCCURS 2 TIMES` containing `ROW-ITEM ... OCCURS 3 TIMES`, a genuine, documented, narrower limitation - not itself a bug) - but `writeRecordPlan`'s own fallback chain didn't stop there. Since this record has no non-DISPLAY field either (all signed/plain DISPLAY), `writeRecordPlan` next tried `odoDisplayValueExpr`/`groupDisplayValueExpr` (the older ODO/group text-mode paths) - both ALSO decline this exact shape (each bails to `null` the moment a table-of-groups top-level child is seen; neither was ever taught the table-of-groups shape round-32 added only to `groupChildConstructorExpr`) - leaving `writeRecordPlan` to fall all the way through to its final, UNCONDITIONAL fallback, `return { mode: 'text', expr: toCamelCase(recordName) }`, which blindly references a flat Scala variable (`relRec`) that is NEVER declared for a record built entirely out of nested group/table structure (such a record has no single flat text var at all - only its own case class). This produced a hard `Not found: relRec` Scala COMPILE error, not a visible, honest decline | Added a guard immediately before that final unconditional fallback: when `isGroup` is true and none of the byte-mode/ODO/group-display paths above could represent this record's own shape, `writeRecordPlan` now returns a new `{ mode: 'text-unsupported' }` plan instead of guessing at an identifier that doesn't exist - `generateWriteStatement` and `generateRewriteStatement` (the only two callers) both check for it right alongside the pre-existing `bytes-unsupported` check and emit an equally honest, visible, compiling `// TODO: ... a group record built entirely from nested group/table structure ... is not supported ...` marker (record simply not written/rewritten), matching how this codebase already declines every other unsupported shape. The two-level-deep table-of-groups-containing-a-table shape itself is deliberately NOT newly implemented (still a real, narrower, out-of-scope limitation per round 32's own reasoning) - only the crash-to-decline conversion is new. Verified against installed GnuCOBOL and scala-cli (ii06): the generated Scala now compiles cleanly and runs to completion (registering as an honest `t.todo(...)` in `oracleCompare()`, since the WRITE itself is correctly declined rather than corrupting anything) instead of failing to compile at all; confirmed zero regressions on the pre-existing round-32 table-of-groups WRITE path (a table-of-groups row with no further nested table still gets its real `Vector.tabulate(...)` constructor call, untouched) and on the pre-existing non-DISPLAY/FILLER `bytes-unsupported` decline (still reached, and still distinct from the new `text-unsupported` message, for that separate shape) | ii06 |
| 1 | **LINAGE's fuller clause grammar (`WITH FOOTING AT <m>`) was silently discarded, so a FOOTING-driven AT END-OF-PAGE timing was indistinguishable from a bare `LINAGE IS <n> LINES`.** Round 32 implemented `LINAGE IS <n> LINES` (a bare integer page size) but `parseFileDescription` (`parser/data-division-parser.js`) let any `WITH FOOTING AT`/`LINES AT TOP`/`LINES AT BOTTOM` sub-clause tokens fall through to the generic per-token catch-all, uncaptured - so `LINAGE IS 5 LINES WITH FOOTING AT 3` behaved identically to a bare `LINAGE IS 5 LINES` in the generated Scala. A direct cobc probe (ii01, alongside a companion `LINES AT TOP`/`LINES AT BOTTOM` probe, ii02, already passing) confirmed FOOTING alone changes AT END-OF-PAGE's own real timing: with `LINAGE IS 5 LINES WITH FOOTING AT 3`, cobc's own oracle output across 8 successive WRITEs is `NOTEOP/EOP/EOP/EOP/EOP/NOTEOP/EOP/EOP` - AT END-OF-PAGE fires from the moment the running line counter reaches (pageSize - footingLines) = 2, and KEEPS firing on every subsequent WRITE (not just once), until the counter actually reaches the full pageSize (5), at which point (and only then) it resets for a fresh page - a materially different shape from round 32's bare-LINAGE model, which resets the counter the INSTANT the threshold is reached (so EOP only ever fires on exactly one WRITE per page) | Parsed `WITH FOOTING AT <m>` (a plain integer literal, mirroring how the bare LINAGE integer is already parsed) into a new `fd.linageFootingLines` AST field, threaded through `LINAGE_REGISTRY` (now `{ pageSize, footingLines }` per file instead of a bare integer) into `linageEopLines` (`generator/expression-gen.js`): the AT END-OF-PAGE condition now compares the counter against `footingLines != null ? pageSize - footingLines : pageSize`, and the counter-reset check is a SEPARATE, unconditional `if <ctr> >= <pageSize> then <ctr> = 0` immediately after (previously the reset was nested inside the same `if` as the EOP condition, which is exactly why bare LINAGE degenerates back to firing/resetting on the identical single WRITE - the two conditions collapse to the same value when `footingLines` is absent). `LINES AT TOP <p>`/`LINES AT BOTTOM <q>` are now parsed too (consumed by name, not left to the untargeted catch-all) but deliberately not captured anywhere - ii02's own direct cobc probe already confirmed neither affects AT END-OF-PAGE timing, so harmlessly discarding their integer operand is correct, not a gap. Verified against installed GnuCOBOL and scala-cli (ii01): `NOTEOP/EOP/EOP/EOP/EOP/NOTEOP/EOP/EOP` across 8 WRITEs, matching cobc byte-for-byte; confirmed zero regressions on hh01's own bare-LINAGE corpus program (no FOOTING clause at all - the threshold degenerates to `pageSize` exactly as before this round, and the reset still happens on the same WRITE as the EOP condition, reproducing round 32's own `NOTEOP/EOP/NOTEOP/EOP` output unchanged) | ii01 |

See `tests/round33-fixes.test.js` for focused, toolchain-independent unit
tests of all 3 findings above, including regression coverage confirming a
bare LINAGE (no FOOTING clause) keeps round 32's own exact fire/reset-on-
the-same-WRITE behavior, that `LINES AT TOP`/`LINES AT BOTTOM` parse
harmlessly without corrupting the surrounding FD clause, that a plain
(non-doubly-nested) table of groups still gets its real round-32
`Vector.tabulate` WRITE untouched, that a genuinely non-DISPLAY/FILLER
record still reaches the pre-existing `bytes-unsupported` decline (not the
new `text-unsupported` one), and that a non-overflowing STRING's pointer
arithmetic is unchanged from before this round.

Net effect on the whole-suite `todo` count: findings 1 and 3 are genuine,
oracle-verified corrections to already-promoted corpus programs (ii01,
ii09), not new declines. Finding 2 (ii06) converts a hard Scala COMPILE
FAILURE into an honest, visible `t.todo(...)` decline - ii06 could not
compile at all before this round's fix (so it could not previously
contribute to any todo count), and after the fix it compiles and runs to
completion, registering as exactly one new, correctly-attributed
`t.todo(...)` entry (the two-level table-of-groups-containing-a-table shape
remains a real, narrower, deliberately out-of-scope limitation, exactly as
round 32 already established for the one-level case) - see the exact
reconciled full-suite counts recorded after this round's own verification
pass below. The round-33 refuter's other 10 probes (ii02-ii05, ii07-ii08,
ii10-ii13) were already passing/honest at hand-off and needed no further
work this round.

### Known gaps

- **Reference modification (`identifier(start:length)`), round-3 finding 3** - read
  and write both degrade to a visible, compiling `??? ` marker (see
  `generator/expression-gen.js`'s `convertIdentifier`/`renderAssignment`) rather than
  actually slicing/patching the field's display representation. The parser itself is
  fixed (see the table above - `identifier(start:length)` no longer mis-parses and
  corrupts the rest of the statement), so this is purely a codegen gap, not a
  crash-or-corruption risk. Not promoted into this corpus (no `n03*.cbl`) - a program
  actually exercising reference modification would hit the `???` marker at runtime and
  fail `oracleCompare()` by design, which would misrepresent a *known, intentional*
  gap as a regression. Revisit by implementing substring-read / splice-write against
  the field's own display text (its own declared width is already known via the field
  registry) if a future pass has time for it. **Round-15 update**: `d12` IS now
  promoted (deliberately, unlike every other program exercising this gap) - it
  exists specifically to regression-test round-15 finding 8 (STRING no longer
  hard-crashes when a segment source is a ref-mod expression - see the round-15
  table above), not to exercise ref-mod's own semantics. `d12` still shows as the
  Phase 2 suite's one `t.todo(...)` entry, exactly as this note predicts for any
  program that reaches the `???` placeholder at runtime (its own UNSTRING-INTO-
  ref-mod-target and INSPECT-of-a-ref-mod'd-substring both still do) - this is
  expected, by design, and not a regression. **Round-16 update**: `e04`/`e05`/
  `e06` are now promoted too (see the round-16 table above), each regression-
  testing a DIFFERENT operand position this round stopped from crashing/
  silently-corrupting - `e05` (relational comparison, finding 2) and `e06`
  (CALL argument, finding 3) both now degrade to a visible, compiling,
  String-typed placeholder instead of a `Nothing`-typed `???`/a silent full-
  variable pass-through; `e04` (a plain MOVE ref-mod source/target, not
  touched by this round at all) still hits the pre-existing `???` placeholder
  and throws `NotImplementedError` at runtime, exactly as this note has always
  predicted - all three still show up as `t.todo(...)` entries, by design, not
  regressions.

- **A bare, UNQUALIFIED out-of-line `PERFORM <paragraph-name>` (or `GO TO`) that
  targets one specific paragraph whose bare name is ambiguous across sections
  (round-4 finding 8's qualification)** - **round-12 narrowed this gap
  considerably**: an *explicitly qualified* reference (`PERFORM 1000-PARA-A OF
  3000-THIRD`/`... IN 3000-THIRD`) is now fully supported end-to-end -
  `parsePerformStatement` (`parser/procedure-parser.js`) parses the `OF`/`IN`
  qualifier into `PerformStatement.targetSection`/`throughSection`, and
  `generatePerformFromAST` (`generator/method-gen.js`)/`generatePerform`
  (`generator/expression-gen.js`) route it through the same collision-aware
  `resolveParagraphMethodName` resolver `generateAllMethods`/
  `generateSectionMethod` already use to *declare* a qualified method (see the
  round-12 table above, `z12`) - **round-14 finding 1 extended this to the
  THRU form too** (`PERFORM x OF secA THRU y OF secB` - previously
  unaddressed, and explicitly documented as such, until this round's fix; see
  the round-14 table above, `b3`) - what remains unaddressed is only a
  **bare, UNQUALIFIED** reference (single-target OR THRU) to a paragraph name
  that happens to collide: real COBOL requires qualification whenever it
  would otherwise be ambiguous - a program using a bare, would-be-ambiguous
  reference is *already invalid COBOL* without qualifying it - so this
  narrower residual gap only matters for a program that is itself not valid
  COBOL, which no corpus program (old or new) is; `sect01`/`q09`'s own only
  cross-paragraph reference is a `PERFORM` of the (never-ambiguous) *section*
  name, not one of its colliding paragraphs, and `z12`/`b3` themselves use
  the (legally required) qualified form. `GO TO`'s own qualification was
  unaffected by either fix (only `PERFORM` was addressed) through round-20 -
  **round-21 finding 3 closed this specific gap**: `GO TO para OF section`
  (single-target and multi-target `DEPENDING ON` alike) now resolves through
  the identical collision-aware `paragraphMethodName`/
  `resolveParagraphMethodName` machinery PERFORM's own qualified form
  already used - see the round-21 table above, `j11`. What remains
  unaddressed is only a **bare, UNQUALIFIED** reference (GO TO, or PERFORM
  single-target/THRU) to a paragraph name that happens to collide: real
  COBOL requires qualification whenever it would otherwise be ambiguous - a
  program using a bare, would-be-ambiguous reference is *already invalid
  COBOL* without qualifying it - so this narrower residual gap only matters
  for a program that is itself not valid COBOL, which no corpus program
  (old or new) is. Revisit by threading the calling paragraph's own
  enclosing section through `generateExpression`/nested-PERFORM/nested-GO-TO
  resolution, if a future program needs the bare-unqualified case too.

- **GO TO (or a nested PERFORM) into a paragraph that must then *itself* keep
  falling through, within a SECTION wrapper or the whole-program flow (round-4
  findings 7/9's `renderNestedFallthroughSteps`)** - a GO TO from paragraph A to
  paragraph B (both part of the same section/whole-program chain) correctly runs
  B's own flat method (an ordinary Scala call), but if B's own last statement
  *isn't itself* a transfer, real COBOL would keep falling through from B into
  whatever comes after it in that same range - B's flat method has no fallthrough
  of its own (only the `_stepN` wrapper chain does, and a GO TO resolves straight
  to the flat method, not the wrapper), so that further fall-through does not
  happen. This is the deliberate, narrower trade-off `renderNestedFallthroughSteps`
  accepts in exchange for fixing the `p12-sort.cbl` regression above (see its doc
  comment and finding 9's fix note) - unlike that regression (a very common
  pattern: an ordinary out-of-line PERFORM elsewhere in the program), this needs a
  GO TO specifically, to a paragraph that itself doesn't end in a transfer, where
  the code additionally depends on cascading past it - a narrow combination no
  corpus program (existing or newly promoted) exercises. `PERFORM ... THRU`
  (`generatePerformThruMethod`) is unaffected - it still duplicates bodies as
  nested defs, so a GO TO within a THRU range correctly cascades exactly as before
  (see `r08-perform-thru-backward-goto.cbl`/`p14-godep.cbl`, both still passing).
  Revisit only if a future program actually needs this; no corpus target regresses
  without it today. **Round-5 update**: this exact gap now has a live repro - a GO
  TO from outside a `PERFORM ... THRU` range that jumps directly into the *middle*
  of that range (not its first paragraph) fails `oracleCompare()` (the mid-range
  paragraph correctly runs, but doesn't fall through to the paragraph after it) -
  confirmed against installed GnuCOBOL. Deliberately **not promoted** into
  `tests/corpus/proc/` (same reasoning as round-3 finding 3's reference-
  modification gap below: a program that actually exercises a known, intentional
  gap would fail `oracleCompare()` by design, misrepresenting a known limitation as
  a regression). The repro lives outside this corpus for now; revisit by giving
  each nested-def paragraph its own fallthrough-aware entry point reachable from a
  GO TO, not just from the `_stepN` wrapper chain, if a future pass has time.

- **Figurative constant vs. a genuinely numeric field in a comparison, round-4
  finding 1's untested edge** - `renderRelationalCondition`'s "genuine numeric vs
  alphanumeric" branch (e.g. `IF WS-NUMERIC-FIELD = SPACES`) computes the
  alphanumeric side's padding width from `relationalOperandDescriptor`, which does
  not (and, without knowing the *other* operand first, cannot on its own) assign a
  figurative constant a `literalText`/width - this is a narrow, pre-existing
  (not newly introduced) inconsistency this round's fix did not additionally chase,
  since fig01/q02 only exercises a figurative constant against an *alphanumeric*
  field/figurative constant (the common case, and the one this fix fully corrects).
  Not promoted as its own corpus program - no test asserts a specific outcome for
  it. Revisit by threading the anchor width through before computing
  `relationalOperandDescriptor` for the figurative side, if a future pass has time.

- **`SORT ... USING <file> GIVING <file>` (whole-file form, round-6 t09)** - only
  `SORT ... INPUT PROCEDURE ... OUTPUT PROCEDURE ...` (with RELEASE/RETURN) is
  implemented (`generateSort`, `generator/expression-gen.js`); the file-driven
  `USING`/`GIVING` form (no procedural hook at all - reads straight from one file,
  sorts, writes straight to another) generates a visible `() // TODO: SORT ...
  USING <file> not yet supported` marker instead. Deliberately **not promoted**
  into `tests/corpus/proc/` (t09 stays out by design - same reasoning as every
  other documented gap here: a program that actually exercises a known,
  intentional gap would fail `oracleCompare()`, misrepresenting a known
  limitation as a regression). Revisit by adding a `USING`/`GIVING` code path to
  `generateSort` that reads the USING file's records into the SD's in-memory
  buffer (`buildSortFileRegistry`'s existing support) before sorting and writes
  the sorted buffer straight to the GIVING file afterward, if a future pass has
  time.

- **`WRITE ... BEFORE ADVANCING` as the very LAST write to a file that also uses
  ADVANCING elsewhere, round-6 finding 1's narrow edge** - the deferred-
  terminator model (see finding 1's fix) leaves a file's last physical line
  unterminated whenever the last WRITE used `AFTER ADVANCING` (or no ADVANCING
  clause at all), which is why CLOSE unconditionally flushes one final newline
  for any file in `ADVANCING_FILES`. A `BEFORE ADVANCING` write already
  self-terminates its own line (confirmed empirically: its own newline/carriage-
  return is emitted immediately after its own text, not deferred) - if such a
  write happens to be the *last* WRITE before CLOSE, that unconditional final
  newline is one blank line too many. Not independently verified against cobc
  (t01, the only ADVANCING corpus program, uses `AFTER ADVANCING` exclusively)
  and not promoted as its own corpus program. Revisit by tracking, per file,
  whether the most recently generated WRITE for it was BEFORE- or
  AFTER-positioned (a compile-time property, decidable per WRITE statement) and
  only emitting CLOSE's unconditional flush when the *last* WRITE to that file
  in program order was AFTER-positioned (or absent), if a future pass has time.

- **`CALL` to an external subprogram this source doesn't define, round-7
  finding 1c** - same-file (multi-PROGRAM-ID) CALLs are fully supported (see
  the round-7 table above - `CALL_PROGRAM_REGISTRY`/`generateEntryMethod`), but
  a genuinely external subprogram (compiled separately, never appearing in
  this source as its own `PROGRAM-ID`) has no Scala counterpart this generator
  could possibly produce on its own - there is no COBOL source to convert.
  `generateCall` (`generator/expression-gen.js`) emits a visible, still-
  compiling `() // TODO: CALL "<name>" - external subprogram not available for
  conversion (no PROGRAM-ID "<NAME>" found in this source); call skipped` marker
  instead of a bare undeclared call. A dynamic `CALL <data-name>` (naming a
  variable holding a program name at runtime, rather than a literal) falls
  into this same "unresolvable" path today, even if that name would happen to
  match a sibling PROGRAM-ID at runtime - resolving it would require tracking
  the variable's possible values, out of scope. Not promoted as its own corpus
  program (a program that actually calls a name with no definition anywhere
  would fail to *link*, not just run differently, under real cobc too - not a
  meaningful oracle comparison either way). Revisit by accepting a
  `linkedPrograms`/external-stub option (a caller-supplied Scala shim per
  external name) if a future pass needs to convert a program that genuinely
  calls out to a separately-compiled subprogram.

- ~~Group-level VALUE slicing over a BINARY (COMP/COMP-4/COMP-5) child,
  round-9 finding 3's narrower half~~ **RESOLVED by round-15 findings 1 and
  4.** `nonDisplayInheritedNumericText` (`generator/scala-generator.js`)
  reuses `codecs.js`'s `binaryDecode` for a BINARY child exactly the same way
  it reuses `packedDecode` for a COMP-3 child; the "truncates to the child's
  own low-order declared digit count" behavior is now compiler-verified for
  an ordinary (non-COMP-5) binary child too - `d02` (COMP, combined with
  SYNC - round-15 finding 1's own fix was needed for `d02` to reach the
  right offset at all) and the pre-existing `d05` (COMP-4, no SYNC) both
  confirm the truncation rule is correct there, matching the already-
  verified COMP-3 case (w03). COMP-5 turned out to be the genuine exception,
  not an unverified guess: round-15 finding 4 found (and fixed) that COMP-5
  is EXEMPT from this truncation - its DISPLAY shows the full native-binary
  magnitude even past the declared digit count (`d06`). All four non-DISPLAY
  USAGEs this function handles (COMP-3/COMP/COMP-4/COMP-5/BINARY-as-COMP)
  are now compiler-verified, one way or the other.

- ~~A subscripted whole-row MOVE (`MOVE WS-ROW(i) TO WS-ROW(j)`) across TWO
  DIFFERENT tables, or with more than one subscript dimension, round-9
  finding 4's narrower edge~~ **RESOLVED by round-15 findings 5 and 6** (both
  as REAL fixes, not degraded markers) - see the round-15 table above (`d07`
  cross-table, `d08` two-dimensional). What remains unaddressed is only a row
  child that itself has its OWN additional OCCURS clause (a table nested
  inside each row, independent of the row's own subscript dimensions) -
  `subscriptedGroupMoveChildLines` (`generator/expression-gen.js`) still
  bails out to `null` for that one shape (falling back to the pre-existing
  visible `??? TODO` marker) since its flat var would need yet another,
  independently-driven Vector index no corpus program supplies. Not
  exercised by any corpus program. Revisit by threading a THIRD, independent
  index dimension through the recursion (distinct from the row's own
  subscript chain) if a future program needs it.

- ~~A backward `PERFORM x THRU y` range's post-start-paragraph fallthrough,
  round-9 finding 5's narrower edge~~ **RESOLVED by round-10's `x08`.**
  Round-9's `w10` only confirmed cobc's "run the start paragraph, then behave
  as if execution fell off the end of the PROCEDURE DIVISION" model for a
  start paragraph that already happened to be the program's own last unit -
  round-10's `x08` (`PERFORM PARA-C THRU PARA-A` inside a SECTION, with a
  SEPARATE `TAIL-SECTION`/`PARA-D` still physically following it in program
  order) is the general case: cobc's own oracle output shows `PARA-D` DOES
  still run (`IN-PARA-C` then `IN-PARA-D`, cascading past the THRU range's own
  start paragraph through the rest of the program before terminating), and
  the generated Scala matches byte-for-byte via `oracleCompare()` - confirming
  `generatePerformThruMethod`'s existing general-case implementation
  (`renderNestedFallthroughDefs` over every unit from the start paragraph
  through the true end of the program, then `sys.exit(0)`) was already
  correct, not just "correct in the one case tested so far."

- **A record combining a non-DISPLAY (COMP-3/binary) child WITH an OCCURS
  table (fixed-size or `... DEPENDING ON`) in the same record, round-10
  finding 3/4's own explicitly-acknowledged intersection** - `writeRecordPlan`
  routes such a record to the byte-level `format()` path (finding 3, since it
  has a non-DISPLAY child), but `groupChildConstructorExpr` unconditionally
  bails out (`return null`) the moment it sees ANY OCCURS-table child (a
  case class's own `.format()` always writes a table at its fixed max width,
  which would be wrong for an ODO table's variable-length WRITE, and this
  generator has no established way to build a `Vector[...]`-shaped
  constructor argument from the flat per-element vars for a *fixed*-size
  table either) - `generateWriteStatement` emits a visible, still-compiling
  `() // TODO: ... a byte-level (non-DISPLAY-child) record with a
  FILLER/OCCURS child is not supported` marker instead of a wrong/guessed
  byte layout. Same bail-out (same TODO marker) for a FILLER child in a
  non-DISPLAY record, for the same reason `generateGroupMove`'s own
  differing-layout path already documents (no established flat-var <->
  case-class-constructor-slot correspondence for a FILLER). Not exercised by
  any corpus program (x03 and x04 each exercise ONE of these two
  ingredients, deliberately, never combined). Revisit by teaching
  `groupChildConstructorExpr` to build a `Vector.tabulate(...)`/live-count-
  sliced constructor argument for a table child if a future program needs
  this combination.

- **A bare elementary (non-group, no children at all) FD record declared
  directly as a non-DISPLAY USAGE (e.g. a 01-level `PIC S9(5)V99 COMP-3` FD
  record with no subordinate 05-level items)** - `generateCaseClass`
  (`generator/case-class-gen.js`) only ever generates a case class (and thus
  a `.format()`/`.parse()`) for an item with at least one real child;
  `writeRecordPlan`'s byte-level branch is therefore reachable only through
  the GROUP path, so a childless non-DISPLAY elementary record still falls
  through to the pre-round-10 `CobolFmt.num(...)`-based text rendering,
  unaffected by this round's fix either way. Not exercised by any corpus
  program (every FD record in the corpus that has a non-DISPLAY USAGE is a
  child of a group, per ordinary COBOL style). Revisit only if a future
  program needs a childless non-DISPLAY 01-level FD record specifically.

- **DECLARATIVES `USE` forms other than `[AFTER] [STANDARD] ERROR PROCEDURE
  ON ...`, round-10 finding 1's deliberately narrow scope** - `USE FOR
  DEBUGGING ON ...`, `USE BEFORE REPORTING ...`, and any other `USE` clause
  this parser doesn't specifically recognize are still parsed (tagged `{
  kind: 'UNSUPPORTED' }` by `parseUseStatement`, so they never corrupt the
  token stream) and their section body still compiles to a real, callable
  Scala method - but `generateDeclarativeSupport` never registers it in
  either handler registry, so it is never actually invoked from anywhere (an
  honest `// unsupported USE form` comment marks the generated method as
  such). Not exercised by any corpus program. Revisit by adding dedicated
  wiring for whichever additional `USE` form a future program needs.

- **DECLARATIVES handler invocation is wired only from OPEN's failure path
  and a bare (no AT END clause) READ's end-of-file path, round-10 finding
  1/2's own pragmatic scope** - a READ that DOES have an AT END clause never
  invokes a registered handler even on end-of-file (matches real COBOL: the
  AT END phrase is the statement's own explicit handling, which takes
  precedence over the implicit DECLARATIVES procedure), and WRITE/CLOSE have
  no modeled failure path AT ALL in this generator to hook a handler into (a
  WRITE always "succeeds" here - there is no simulated disk-full/permission
  error to react to) - so a DECLARATIVES handler registered `ON` a file's
  OUTPUT/EXTEND mode, or `ON` a file only ever WRITE-failure-triggered in
  real COBOL, is parsed and compiled but has no invocation site that could
  ever reach it. Only the OPEN-failure (x01/x02) and bare-READ-EOF paths are
  oracle-verified. Revisit by modeling an actual WRITE/CLOSE failure
  scenario (and wiring its own handler invocation) if a future program needs
  it.

- **CALL ... USING BY REFERENCE of a GROUP containing an OCCURS table,
  round-13 finding 1** - `generateCall`'s `argExprs` (`generator/
  expression-gen.js`) now degrades to a visible, compiling TODO placeholder
  instead of an undeclared-identifier compile error (see the round-13 table
  above), but true byte-level marshalling of the table's own elements across
  the CALL boundary (matching `scatterGroupFromString`'s existing writeback-
  side convention, extended to concatenate/re-split each element rather than
  bailing to `null` the instant any OCCURS child is present) is NOT
  implemented. A program that actually passes such a group BY REFERENCE
  compiles and runs to completion, but the callee sees a default (empty)
  value instead of the caller's actual table contents - not a crash, but not
  byte-accurate either. Deliberately **not promoted** into
  `tests/corpus/proc/` (the repro, `r1303c`, stays in the adversarial-
  refutation scratch history only) - same reasoning as every other
  documented gap here: a program exercising this gap would fail
  `oracleCompare()` by design. Revisit by extending `groupDisplayValueExpr`/
  `scatterGroupFromString`'s table-child branch (already built for
  `odoDisplayValueExpr`'s DISPLAY/WRITE use - see round-10/11's table-aware
  concatenation) into the CALL BY REFERENCE marshalling channel specifically,
  if a future pass has time.

  **Round-23 update**: the "compiles and runs to completion" behavior
  described above is still exactly accurate for an ORDINARY (non-recursive)
  callee - unaffected by this round. But a **RECURSIVE** program (can CALL
  itself while an outer activation is still on the Scala call stack) whose
  OWN GROUP LINKAGE parameter has this same unresolvable shape is a
  genuinely different, worse failure mode: round-22 finding 1's own
  getter/setter closure-aliasing convention can't apply either (no single
  flat-var leaf exists for an OCCURS-bearing child to alias), so it falls
  back to this SAME silent-no-op scatter - but since the callee can silently
  re-CALL itself using this exact parameter as its own loop-guard, "the
  callee sees a default (empty) value instead of the caller's actual...
  contents" is no longer merely "not byte-accurate": the guard field is
  NEVER updated across the recursive CALL boundary at all, so it stays
  frozen at its default forever, and genuine infinite recursion (a real
  `StackOverflowError`, confirmed reproducible - `l10-recgrp-occurs.cbl`)
  results, not just a wrong-but-terminating answer. **Fixed** (see the
  round-23 table above, finding 2): a RECURSIVE program's own entry() now
  `throw`s a `NotImplementedError` from this exact fallback instead of
  silently no-op'ing, so every activation fails fast and loud instead of
  hanging. `l10` IS promoted into `tests/corpus/proc/` (deliberately, unlike
  `r1303c` above) specifically to regression-test that this decline
  terminates - it is intentionally left as a `t.todo(...)` entry, not a hard
  pass, since real cobc's own output for this shape is fully correct
  (matching k01's own 3-level trace) and this fix does not attempt that
  level of correctness, only removing the hang.

- **REDEFINES of a group-with-OCCURS by another group-with-OCCURS, round-13
  finding 5** - `todoStubRedefinesLines` (`generator/scala-generator.js`) now
  keeps `TABLE_REGISTRY`/the elementary-child registry/`generateSearchAll`'s
  own metadata lookup all consistent (Vector-typed stubs, real OCCURS
  metadata - see the round-13 table above), so the generated Scala always
  compiles and a `SEARCH ALL` against the redefining table actually runs
  real (if ultimately unimplemented) search code - but there is still no
  true byte-slice table VIEW: each elementary child is an honest `???` stub
  that throws `NotImplementedError` the instant it's actually read (a DISPLAY
  of one of its elements, or the SEARCH ALL that reaches into it). A program
  exercising this shape therefore compiles cleanly but throws at runtime
  instead of producing cobc's actual (correct) output. Deliberately **not
  promoted** into `tests/corpus/proc/` (the repro, `r1313`, stays in the
  adversarial-refutation scratch history only) - same reasoning as every
  other documented gap here. Revisit by threading real packed/binary-aware
  byte codecs (`generator/codecs.js`, already used for genuine COMP-3/BINARY
  file-record storage elsewhere) through a per-element byte-slice view over
  the target's own underlying storage, if a future pass has time.

- ~~SYNCHRONIZED/SYNC alignment (round-14 finding 4) combined with a NESTED
  sub-group, or with OCCURS, on the SYNC item's own enclosing structure~~
  **RESOLVED by round-15 findings 2 and 3** (`layout.js`'s `itemByteLength`
  now takes a `baseOffset` parameter threaded through its own recursion - a
  nested sub-group's children align against their TRUE absolute record
  position, not a position relative to the sub-group's own local start -
  `d03`; an OCCURS item's own per-occurrence stride now rounds up to its
  widest SYNC descendant's alignment requirement, keeping every repetition
  self-consistent - `d04`; see the round-15 table above for both). What
  remains unaddressed is only `case-class-gen.js`'s OWN independent real-
  file-record byte-layout codegen (`generateFieldsFromChildren`'s
  `totalLength` accumulator, and each nested group's own separately-
  generated `parse`/`format` methods) - it still computes each nested case
  class's own field offsets/`recordLength` starting fresh at local offset 0,
  unaware of where that nested group's OWN case class instance will actually
  sit within some enclosing FILE SECTION record's real byte stream, and its
  own per-occurrence stride (used by a `Vector`-of-groups field's `parse`/
  `format` loop) is `itemByteLength({ ...child, occurs: null })` - occurs
  deliberately stripped, the pre-existing "one occurrence width" convention -
  so it does NOT pick up finding 3's new stride-rounding either. Neither gap
  is exercised by any corpus program (`d03`/`d04` are both plain
  WORKING-STORAGE, with no FILE SECTION/WRITE/case-class byte round trip
  involved) - `layout.js`'s own `itemByteLength`/`groupByteLengthRegistry`
  (used for `FUNCTION LENGTH` and the group-VALUE-inheritance offset walk)
  are fully fixed and is what both `d03`/`d04` actually verify. Revisit by
  threading the same `baseOffset` (for absolute-offset alignment) and
  `syncAlignmentSize`-based stride rounding (for OCCURS) into
  `case-class-gen.js`'s own field-offset computation and the `parse`/
  `format` codegen it emits, if a future program needs a real FILE SECTION
  record combining SYNC with a nested sub-group or an OCCURS table.

- **BRANCHING mutual RECURSIVE recursion's exact shared-WORKING-STORAGE
  collision values, round-25 finding (o14)** - round-21 finding 2 established
  (and rounds 22/23/24 repeatedly re-verified) that a RECURSIVE program's own
  WORKING-STORAGE is genuinely shared/static storage across every one of its
  own recursive activations, matching real cobc - a confirmed, deliberate
  behavior this generator correctly reproduces via one ordinary module-level
  `var` per WORKING-STORAGE field, regardless of recursion depth, plus true
  live-closure (pointer-style) aliasing for LINKAGE SECTION parameters passed
  BY REFERENCE (the same getter/setter-closure mechanism, unchanged since
  round-22). Every corpus program that has exercised this so far - j10, k01,
  k04, k12, l04, l10-l12, m01-m14, this round's own o05 - is a LINEAR
  recursive/mutual-recursive chain: at any given moment, at most ONE
  activation of a given program is ever suspended waiting on a deeper call,
  so "shared static storage" and "a fresh copy per activation" are
  observationally indistinguishable for depth alone (only the VALUE keeps
  changing across levels, never which STORAGE two simultaneously-alive
  frames are each independently relying on). `o14` (`tests/corpus/proc/
  o14-mutual-recur-branch.cbl`) is structurally different: two RECURSIVE
  programs (`O14A`/`O14B`) computing `fib(5)` via a BRANCHING call graph
  (each activation calls the other program TWICE, non-tail, to compute two
  sub-results before combining them) - so the SAME program can have TWO (OR
  MORE) activations simultaneously suspended, each one's own LINKAGE
  parameter potentially aliased (BY REFERENCE) directly into a SHARED
  WORKING-STORAGE cell (`WS-N1`/`WS-R1`/`WS-N2`/`WS-R2`) that ANOTHER,
  unrelated, more-deeply-nested activation of that SAME program can ALSO be
  actively writing through its own identical aliasing, before the shallower
  activation's own pending use of that cell is done with it. Manually tracing
  even the first 2-3 levels of this call tree (treating each field as one
  shared, live-aliased cell, exactly matching what this generator's own
  `generateRecursiveEntryMethod`/`generateCall` already implement and rounds
  21-24 verified correct for every linear-chain shape) confirms this is a
  genuine, reproducible entanglement - NOT an artifact of a coding mistake in
  this generator's own aliasing mechanism, which was independently confirmed
  (by reading the actual generated `O14A`/`O14B` Scala) to already be a
  faithful, live, closure-based alias exactly like the verified-correct
  linear-chain case, with no snapshot-by-value or wrong-cell bug found
  anywhere in it. The generated Scala's own output diverges from cobc's
  oracle capture starting partway through the call tree (`oracleCompare()`
  reports a `t.todo(...)`, not a hard failure - see Phase 2's own
  match-or-todo convention above) - reproducing cobc's EXACT resulting
  values here would require matching cobc's own internal, undocumented,
  implementation-specific timing of exactly when a BY-REFERENCE argument's
  underlying storage is read versus written relative to an unrelated, more
  deeply nested call that happens to alias the identical cell - not a
  documented part of the COBOL standard, and not something a black-box
  compiler oracle comparison can distinguish from "many other equally
  plausible timings cobc could instead have chosen" without instrumenting
  GnuCOBOL's own generated C internally. This is also an exceedingly
  narrow, arguably pathological COBOL idiom in the first place (recursive
  mutual CALLs deliberately reusing shared, static WORKING-STORAGE cells as
  BY-REFERENCE argument storage across a BRANCHING call graph) that
  real-world COBOL is exceedingly unlikely to rely on - deliberately
  **not fixed this round**, per this campaign's own established precedent
  for a disproportionately large investigation with a narrow, low-value
  payoff (see round-24 finding 3/m10's identical reasoning for an unrelated
  gap). `o14` stays promoted in `tests/corpus/proc/` (unlike most other
  documented gaps here, which are deliberately kept OUT of the corpus) since
  it is already an honest `t.todo(...)` under the existing Phase 2
  match-or-todo convention, not a hard failure that would need special-
  casing to avoid misrepresenting a known limitation as a regression -
  exactly like `d12` (round-15) already does for the reference-modification
  gap. Revisit only by instrumenting (or otherwise obtaining precise
  documentation of) GnuCOBOL's own exact BY-REFERENCE-argument/static-storage
  read-write interleaving for this specific branching shape, if a future
  program genuinely needs this narrow combination.

- **`ORGANIZATION IS INDEXED` files (`RECORD KEY IS <field>`) accessed in
  RANDOM/DYNAMIC mode, round-27 finding 8** - this generator does not
  implement real RECORD-KEY-addressed random-access semantics for INDEXED
  files at all (OPEN/READ/WRITE/REWRITE/DELETE/START all degrade to a
  visible, compiling `// TODO ...` decline the instant an INDEXED file is
  opened in RANDOM or DYNAMIC access mode - see the round-27 table above,
  finding 8, `cc04`). This is a **toolchain limitation, not a scoping
  choice**: this sandbox's installed GnuCOBOL build has indexed-file support
  compiled out entirely (`cobc --info` reports "indexed file handler :
  disabled", and no VBISAM/D-ISAM/BDB library is installed to enable it), so
  there is NO way to compile-and-run even a single `ORGANIZATION IS INDEXED`
  `.cbl` program in this environment to capture real cobc behavior against -
  every other finding in this entire campaign is verified against an actual
  `cobc`-produced `.oracle.txt`; this one cannot be, for ANY INDEXED-file
  program, now or in any future round, unless the sandbox's GnuCOBOL build
  changes. Implementing real semantics anyway would mean guessing at
  RECORD-KEY lookup/ordering/duplicate-key rules with no way to verify
  correctness - exactly what this campaign's own methodology prohibits (see
  this file's own "On an expected-vs-oracle mismatch" section) - so only the
  crash (a `NullPointerException` on the very first WRITE to such a file) was
  fixed, converted to an honest, visible decline instead. `cc04` itself is
  named `cc04-indexed-recordkey-random.cbl.txt` (not `.cbl`) specifically so
  `oracle.test.js`'s `walkCblFiles()` sweep - which requires every discovered
  `.cbl` under `tests/corpus/` to both compile AND run cleanly under `cobc`,
  with no toolchain-unavailability escape hatch - does not pick it up and
  hard-fail on a toolchain gap unrelated to the actual (now-fixed) finding.
  Revisit only if a future sandbox's GnuCOBOL build is reconfigured with
  indexed-file support enabled, making real verification possible.

- **ALTER's own real runtime semantics (retargeting a GO TO statement's own
  destination), round-29 finding 3** - only the PARSE-CORRUPTION bug is fixed
  (see the round-29 table above, `ee13`): `ALTER <para> TO [PROCEED TO]
  <target>.` now parses correctly and degrades to a visible, compiling
  no-op (`UnknownStatement`) instead of corrupting the surrounding paragraph
  structure. The actual behavior - every subsequent `GO TO` inside the named
  paragraph should be retargeted to the new destination at runtime - is NOT
  implemented at all: `ee13`'s own generated Scala still runs `JUMP-PARA`'s
  original, un-retargeted `GO TO TARGET-ONE`, producing `IN-TARGET-ONE`/
  `AFTER-PERFORM` where cobc's own oracle shows only `IN-TARGET-TWO` (`ee13`
  registers as a `t.todo(...)` in the Phase 2 suite for exactly this reason,
  not a failure). This is a deliberate scoping decision, not an oversight:
  ALTER is a rare, deprecated COBOL feature (most modern style guides forbid
  it outright) this campaign's own roadmap already lists as low-priority: OPEN
  - not implemented, low priority (rare, deprecated) - and real semantics
  would require modeling a mutable "current GO TO target" per altered
  paragraph (the paragraph's own `GO TO` would need to read that mutable
  target at the point it fires, rather than being compiled to a fixed
  `return <target>()` the way every other GO TO is - a structural change to
  how `generateGoTo` translates a GO TO inside any paragraph ALTER ever
  names), disproportionate for a construct this rare. Revisit only if a
  future program genuinely needs real ALTER semantics.

- **A table-within-a-table-of-groups (two independent OCCURS dimensions) in
  a RELATIVE-file record, round-33 finding 2's own explicitly-acknowledged
  boundary** - `groupChildConstructorExprIndexed` (`generator/
  expression-gen.js`) still bails out (`return null`) the moment a
  table-of-groups row's OWN child is itself another OCCURS table (ii06:
  `REC-ROW OCCURS 2 TIMES` containing `ROW-ITEM ... OCCURS 3 TIMES`) - round
  33 only fixed the resulting Scala COMPILE crash (see the round-33 table
  above), converting `writeRecordPlan`'s previous bare undeclared-identifier
  reference into a visible, compiling `// TODO: ... a group record built
  entirely from nested group/table structure ... is not supported ...`
  marker; the WRITE is honestly skipped (record not written), not
  byte-accurately produced. `ii06` IS promoted into `tests/corpus/proc/`
  (deliberately, unlike most other documented gaps here) since it is now an
  honest `t.todo(...)` under the existing Phase 2 match-or-todo convention,
  not a hard failure or compile error that would need special-casing to
  avoid misrepresenting a known limitation as a regression - exactly like
  `o14` (round-25) or `d12` (round-15) already do for their own respective
  gaps. Revisit by threading a SECOND, independent index dimension through
  `groupChildConstructorExprIndexed`'s own recursion (distinct from the
  outer table-of-groups' `indexVar` it already carries) if a future program
  needs this specific two-level nesting.
