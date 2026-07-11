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

## Current inventory (last recorded run: 2026-07-11)

Toolchain: cobc and scala-cli both available.

**cobc oracle capture / expected-vs-oracle check** - 172 corpus programs found
(19 under `data/`, 153 under `proc/`; `tests/corpus/sql/`'s 5 EXEC-SQL programs are
excluded from this cobc sweep - plain GnuCOBOL can't compile embedded SQL without a
precompiler, see `tests/sql.test.js` instead; two round-9 repros, `w09`/`w12`, are
deliberately excluded entirely - see the round-9 table below - since cobc itself
rejects them), all 172 compiled and ran cleanly under cobc (exit 0). 28 of the 172
(19 `data/` + 9 `proc/` baseline programs) already have a hand-written `.expected.txt`
that matches the captured `.oracle.txt` exactly - 0 mismatches. The 20 `r01`-`r14*`,
15 `n01`-`n16*`, 16 `q01`-`q12*`, 14 `s01`-`s12*`, 11 `t01`-`t12*` (`t09` excluded),
14 `u01`-`u13*`, 12 `v01`-`v12*`, 12 `w01`-`w14*` (`w09`/`w12` excluded), 12
`x01`-`x12`, and 16 `y01`-`y17*` (see the round-11 table below for the exact
subset) programs have no hand-written `.expected.txt` by design (they're
verified directly against cobc via `oracleCompare()` below, not a separately
hand-authored expectation) and show up here as a diagnostic-only capture ("no
`<name>.expected.txt` alongside ... yet").

**Phase 1 (`data/`) COBOL-vs-generated-Scala oracle compare** - 19/19 programs match
end-to-end (0 todo).

**Phase 2 (`proc/`) COBOL-vs-generated-Scala oracle compare** - 153/153 programs
match end-to-end (0 todo), including all 20 `r01`-`r14*`, all 15 `n01`-`n16*`, all 16
`q01`-`q12*`, all 14 `s01`-`s12*`, all 11 `t01`-`t12*` (`t09` excluded), all 14
`u01`-`u13*`, all 12 `v01`-`v12*`, all 12 `w01`-`w14*` (`w09`/`w12` excluded), all
12 `x01`-`x12`, and all 16 `y01`-`y17*` adversarial-refutation programs below.

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
  registry) if a future pass has time for it.

- **An explicit out-of-line `PERFORM <paragraph-name>` (or `GO TO`) that targets
  one specific paragraph whose bare name is ambiguous across sections (round-4
  finding 8's qualification)** - the qualified flat top-level method name (e.g.
  `thirdParaA` for `1000-PARA-A` inside `3000-THIRD SECTION`) is only ever
  produced by, and known to, `generateAllMethods`/`generateSectionMethod`/
  `generateProgramFlowLines` (all in `generator/method-gen.js`); a `PERFORM`/
  `GO TO` *statement* naming that same paragraph is rendered via
  `expression-gen.js`'s `paragraphMethodName` (or `method-gen.js`'s bare
  `toMethodName` for a top-level `PerformStatement`), neither of which knows
  about section-qualification at all - both always emit the plain bare name
  (`paraA()`), which would not compile if that specific bare name turned out to
  be ambiguous. Real COBOL itself requires such a reference to be qualified
  (`PERFORM 1000-PARA-A OF 3000-THIRD`) or it is genuinely ambiguous and illegal
  unqualified - a program that actually needs this is *already* invalid COBOL
  without doing so, so this gap only matters for programs using a bare,
  would-be-ambiguous reference, which none of the round-4 corpus programs (or any
  prior corpus) do; `sect01`/`q09`'s own only cross-paragraph reference is a
  `PERFORM` of the (never-ambiguous) *section* name, not one of its colliding
  paragraphs. Revisit by threading qualification context through
  `paragraphMethodName`/nested-PERFORM resolution (needs the calling paragraph's
  own enclosing section, not currently plumbed through `generateExpression`) if a
  future program needs it.

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

- **Group-level VALUE slicing over a BINARY (COMP/COMP-4/COMP-5) child,
  round-9 finding 3's narrower half** - `nonDisplayInheritedNumericText`
  (`generator/scala-generator.js`) reuses `codecs.js`'s `binaryDecode` for a
  BINARY child exactly the same way it reuses `packedDecode` for a COMP-3
  child, and truncates the decoded two's-complement value to the child's own
  low-order declared digit count for consistency with the COMP-3 case and
  with this generator's usual high-order-truncation convention
  (`CobolFmt.truncNumeric`) - but only the COMP-3 path is compiler-verified
  (w03); no corpus program exercises a BINARY child inheriting a group VALUE
  clause, so this half of the fix has not been checked against real cobc.
  Revisit by adding a BINARY-specific probe once a use case surfaces.

- **A subscripted whole-row MOVE (`MOVE WS-ROW(i) TO WS-ROW(j)`) across TWO
  DIFFERENT tables, or with more than one subscript dimension, round-9
  finding 4's narrower edge** - `subscriptedGroupRowRef`/
  `generateSubscriptedGroupMove` (`generator/expression-gen.js`) only handle
  the same table on both sides (`sourceRow.groupKey === targetRow.groupKey`)
  with exactly one subscript per side (w05's own shape, and the common
  shift/copy-a-row-within-one-table idiom) - a cross-table row MOVE, a
  two-dimensional (OCCURS-within-OCCURS) row reference, or a row child that
  itself has its own further OCCURS clause all fall back to a visible,
  still-compiling `??? TODO` marker (the multi-table/multi-dimension cases
  fall through to the pre-existing elementary-MOVE path instead, unchanged)
  rather than emitting a wrong/non-compiling copy. Not exercised by any
  corpus program. Revisit by threading a second Vector-index dimension
  through `subscriptedGroupMoveChildLines`'s recursion, and by extending
  `generateGroupMove`'s existing differing-layout (byte-level case-class
  round-trip) strategy to a subscripted-row shape, if a future program needs
  either.

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
