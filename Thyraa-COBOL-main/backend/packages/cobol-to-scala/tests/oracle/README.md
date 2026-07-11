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
six further expression/statement gaps - see "Round-4 findings" below. All of
these were promoted into this directory (not kept as a separate corpus)
specifically so this same data-driven suite picks them up automatically: no
test-registration code changes were needed to add them, only the
generator/parser fixes each one's mismatch pointed at.

## Current inventory (last recorded run: 2026-07-11)

Toolchain: cobc and scala-cli both available.

**cobc oracle capture / expected-vs-oracle check** - 79 corpus programs found (19
under `data/`, 60 under `proc/`; `tests/corpus/sql/`'s 5 EXEC-SQL programs are
excluded from this cobc sweep - plain GnuCOBOL can't compile embedded SQL without a
precompiler, see `tests/sql.test.js` instead), all 79 compiled and ran cleanly under
cobc (exit 0). 28 of the 79 (19 `data/` + 9 `proc/` baseline programs) already have a
hand-written `.expected.txt` that matches the captured `.oracle.txt` exactly - 0
mismatches. The 20 `r01`-`r14*`, 15 `n01`-`n16*`, and 16 `q01`-`q12*` programs have no
hand-written `.expected.txt` by design (they're verified directly against cobc via
`oracleCompare()` below, not a separately hand-authored expectation) and show up
here as a diagnostic-only capture ("no `<name>.expected.txt` alongside ... yet").

**Phase 1 (`data/`) COBOL-vs-generated-Scala oracle compare** - 19/19 programs match
end-to-end (0 todo).

**Phase 2 (`proc/`) COBOL-vs-generated-Scala oracle compare** - 60/60 programs match
end-to-end (0 todo), including all 20 `r01`-`r14*`, all 15 `n01`-`n16*`, and all 16
`q01`-`q12*` adversarial-refutation programs below.

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
  without it today.

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
