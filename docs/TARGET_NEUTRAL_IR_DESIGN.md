# Target-neutral IR: design, inventory and costed migration path

**Date:** 2026-10-05 · **Branch:** `claude/analyze-codebase-pdPSZ` · **Status:** design only; nothing in this document has been built.
**Grounding:** step 5 of `docs/ACTION_PLAN_2026-10.md` ("Decide the target language explicitly ... design a target-neutral IR before writing a Java emitter") and the section "Scala as the sole target is the project's largest strategic liability" of `docs/VIABILITY_REPORT_2026-10.md`.
**Scope rule:** the owner chooses between (a) Java via an IR and (b) staying Scala-only. This document makes that choice costable. It does not make it, and it builds no emitter.

**Measurement caveat (read first).** Another agent was editing `generator/expression-gen.js` (reference modification) while this was written, and had added 12 untracked corpus programs (`qq01`...). Line counts for `expression-gen.js` are therefore +/- a few dozen lines, and every reference-modification excerpt below reflects the file as it stood mid-edit. Corpus statistics use the 563 git-tracked `.cbl` files unless stated. All Java in this document is hand-derived and was **not compiled**; all Scala excerpts are real output of `convertToScala()` run during this task.

---

## 0. Summary

| Question | Answer (evidence in the sections below) |
|---|---|
| How big is the generator really? | 21.7k physical lines in 11 files, but **only 10.4k are code**; 9.9k (45%) are comments and 1.4k blank. The report's "~21,600 lines" is a physical-line count. |
| How many Scala-emitting sites? | **856** by a one-line grep (matches the report's ~848); **1,165** by a broader classifier. 707 of the 1,165 (61%) are in `expression-gen.js`. |
| Where does Scala leak into analysis? | The field registry's `scalaType` field (194 lines mention it; ~80 comparisons against `'BigDecimal'`/`'Int'`/`'String'`...), `layout.scalaBaseType`, a name-keyed global `RECURSIVE_LEAF_NAMES` consulted by `assignExpr`, and 35 module-level mutable registries. The **parser has zero Scala references in code** (10 mentions, all comments). |
| Is the runtime really ~2.2k portable lines? | No. Only `CobolCodecs.scala` (530 lines) is embedded in generated programs. `package.scala`, `CobolTypes.scala`, `FileIO.scala`, `DbAdapter.scala` (1,663 lines) are referenced by **no** generator code. The live runtime that matters is `CobolCodecs` (530) + `CobolFmt`/`CobolInspect`/`CobolUnstring` (~625 lines of Scala stored as **JS string arrays** in `expression-gen.js`) + file I/O that is emitted **inline** as `java.io` code. |
| IR cost | ~88 engineer-days nominal (range 80-120), touching ~9,000 lines; every phase gated by a byte-identical-Scala check over 563 programs that runs in ~1 second. |
| Java emitter + runtime on top of the IR | 65-95 engineer-days (~75 nominal). Total (a): **~150-200 (~180 nominal) engineer-days** (7-10 engineer-months). |
| Recommendation | Do the ~10 engineer-day no-regret prefix now (Section 4, Phases 0-1). Gate Phases 2+ and the Java emitter on the step-4 partner answers. Leaning (a) on the report's demand evidence, but the evidence is desk research, not partner calls. |

---

## 1. Inventory

### 1.1 Modules (`generator/*.js`)

Measured with `wc -l generator/*.js` plus the classifier in Appendix A (comment = line starting `//`, `*`, `/*`; code = everything else non-blank).

| File | Physical | Code | Comment | Scala-emitting sites (grep, Metric A) | Sites (classifier, Metric B) | Role |
|---|---:|---:|---:|---:|---:|---|
| `expression-gen.js` | 10,407 | 5,012 | 4,791 | 569 | 707 | Statement + expression emission, all file-statement emission, CALL, runtime helper text |
| `scala-generator.js` | 5,002 | 2,375 | 2,342 | 102 | 183 | Program assembly, **field registry construction**, REDEFINES views, entry/recursive entry, declaratives |
| `method-gen.js` | 1,762 | 627 | 1,032 | 21 | 22 | Paragraph methods, PERFORM THRU wrappers, nested fall-through (recursive) |
| `file-io-gen.js` | 1,355 | 543 | 701 | 65 | 78 | OPEN/CLOSE/handles, per-file state variables |
| `case-class-gen.js` | 781 | 458 | 244 | 57 | 84 | Record `case class` + `parse`/`format` via CobolCodecs |
| `sql-gen.js` | 765 | 440 | 248 | 25 | 45 | EXEC SQL to Doobie (standalone, **not wired in**) |
| `codecs.js` | 662 | 361 | 246 | 0 | 2 | Pure-JS reference codecs (test oracle for `CobolCodecs.scala`; not an emitter) |
| `cics-gen.js` | 357 | 230 | 89 | 10 | 15 | CICS/BMS service skeleton |
| `layout.js` | 333 | 162 | 141 | 1 | 9 | Byte layout helpers + `scalaBaseType` |
| `enum-gen.js` | 201 | 130 | 37 | 6 | 20 | 88-level enums |
| `index.js` | 110 | 85 | 14 | 0 | 0 | Re-exports |
| **Total** | **21,735** | **10,423** | **9,885** | **856** | **1,165** | |

(`wc -l` printed 21,724 at the start of the task; the file grew by 11 lines during it.)

The parser for comparison: `wc -l parser/*.js` = 11,093 lines (`procedure-parser.js` 3,612; `data-division-parser.js` 1,447; `ast.js` 1,122).

Churn evidence for "every round adds Scala-specific code": `git log --oneline -- generator/expression-gen.js | wc -l` = 44 of the branch's 114 commits (39%). `grep -c "round-[0-9]*"` finds 387 round-annotated comments in `expression-gen.js` alone.

### 1.2 How the site counts were produced (reproducible)

A "site" is a source line, outside comments, containing a JS string or template literal whose content is Scala syntax. Two metrics, because the answer depends on how strict the definition is.

**Metric A (strict, one grep per file; reproduces the report's ~848 within 1%):**

```bash
cd Thyraa-COBOL-main/backend/packages/cobol-to-scala/generator
G1='(\bval |\bvar |\bdef |\bobject |case class|\bthen\b|\belse\b|boundary|\.break|BigDecimal|Vector|Cobol[A-Z][a-z]+|\.updated|\.setScale|=> )'
for f in *.js; do
  echo "$f $(grep -E "[\`'\"][^\`'\"]*$G1" $f | grep -vE '^\s*(//|\*|/\*)' | wc -l)"
done
# -> 57 10 0 6 569 65 0 1 21 102 25  = 856 (alphabetical file order)
```

Single-line template literals only: `grep -vE '^\s*(//|\*|/\*)' *.js | grep -cE '`[^`]*'"$G1"` = 509. Plain counts for orientation: lines containing a backtick, 3,280 across the generator (`expression-gen.js` 1,800); lines containing `push(`, 910.

**Metric B (broad, categorized; script in Appendix A).** Classifies each code line holding a string literal with any Scala token (keywords, `=>`, `Cobol*` helpers, stdlib calls) by first match in priority order sql, file-io, runtime-call, closure, control-flow, declaration, numeric, string/vector. It is a heuristic; treat the category split as +/-15%. Multi-line template literals count once per physical line, which both inflates and deflates depending on how a template is wrapped.

### 1.3 Sites by kind (Metric B)

| Kind | Sites | Where (top files) | What it is |
|---|---:|---|---|
| Control flow (`if/then/else`, `match`, `while ... do`, `boundary`/`break`, `try/catch`, `case ... =>`) | 271 | expression-gen 250, method-gen 6, file-io 7 | IF/EVALUATE/PERFORM/loops/EXIT/SIZE ERROR guards; 73 lines in `expression-gen.js` mention `boundary` |
| Declarations (`object`/`val`/`var`/`def`/`case class`/`import`) | 258 | expression-gen 169, scala-gen 35, case-class 24, file-io 19 | module vars, per-file handle vars, record classes, nested local defs |
| Numeric expressions (`BigDecimal`, `.setScale`, `.toInt`, `.signum`) | 77 | expression-gen 58, scala-gen 8 | arithmetic, truncation/rounding, coercions |
| String / Vector expressions (`.updated`, `.substring`, `.padTo`, `.take`, `* n`) | 140 | expression-gen 63, scala-gen 42, case-class 24 | subscripted writes (`Vector.updated`), DISPLAY padding, slices |
| Runtime-helper calls (`CobolFmt.*`, `CobolCodecs.*`, `CobolInspect.*`, `CobolUnstring.*`, `CobolExitSectionSignal`) | 110 | expression-gen 69, scala-gen 26 | see Section 2 |
| File I/O (`java.io`, `RandomAccessFile`, `Source.fromFile`, iterators, per-file state) | 67 | file-io 46, expression-gen 13 | undercounts: most file statements are control flow + status assignments |
| SQL / Doobie (`ConnectionIO`, `sql"..."`, `Transactor`, `SQLException`) | 46 | sql-gen 45, scala-gen 1 | not wired into main output |
| Closure / RECURSIVE getter-setter (`_=(`, `(v: T) =>`, `_get`/`_set`) | 27 | scala-gen 22, expression-gen 5 | direct sites only; see the call-site count below |
| CICS skeleton | 15 | cics-gen | text skeleton, not behavioural |
| Other Scala-token lines not matched above | 154 | expression-gen 80, scala-gen 40 | |
| **Total** | **1,165** | | |

The closure row understates the footprint of the RECURSIVE convention because every assignment goes through one choke point. `grep -c "assignExpr(" generator/expression-gen.js` = 73 and `generator/method-gen.js` = 8, i.e. roughly 80 call sites whose output flips between `x = v` and `x_=(v)` depending on a global set (Section 1.5).

### 1.4 Footprint by statement family (code lines, by function-name heuristic)

Computed by summing non-comment, non-blank lines per top-level `function` and bucketing by name regex (script not included; the bucketing is coarse, +/-15%; the ref-mod bucket is in flux):

| Family | Code lines | Notes |
|---|---:|---|
| Data division: registry build, VALUE init, REDEFINES views, case classes, enums, layout | ~2,240 | `scala-generator.js` alone has ~1,350 code lines of REDEFINES/registry/default-value code (e.g. `buildFieldRegistry` 251, `characterSlicedGroupRedefinesLines` 158, `redefinesAccessorLines` 144, `todoStubRedefinesLines` 125, `elementaryOverGroupRedefinesLines` 117) |
| File I/O (statements in `expression-gen` ~554, `file-io-gen` 543, `scala-generator` ~43) | ~1,140 | |
| CALL, entry, recursive entry, declaratives, INITIAL | ~733 | `generateCall` 197; `generateEntryMethod` 106 |
| MOVE / INITIALIZE / literals / edited pictures / group gather-scatter | ~663 | |
| PERFORM / paragraph flow / THRU / GO TO / EXIT | ~635 | `method-gen.js` 409 of it |
| Runtime text embedded as JS strings (`generateCobolFmtHelper` 387, `generateCobolInspectHelper` 171, `generateCobolUnstringHelper` 43) | ~601 | not logic; Scala source stored as string arrays |
| Arithmetic (ADD/SUB/MUL/DIV/COMPUTE, SIZE ERROR, store) | ~486 | |
| Conditions / EVALUATE / IF | ~457 | |
| SQL (`sql-gen`) | 440 | not wired in |
| STRING / UNSTRING / INSPECT / ACCEPT / DISPLAY | ~354 | |
| SEARCH / SORT / MERGE | ~315 | |
| CICS | 230 | |
| Reference modification | ~145 | in flux (concurrent edit) |

About 8.4k of the 10.4k code lines fall in these buckets.

**Correction to the report's sizing.** "~21,600 lines" is physical lines. The logic a fork would have to duplicate is ~10.4k code lines (and the report's "~17k lines of core logic" in step 5 is likewise a physical-line figure). That makes both the fork and the IR refactor smaller than the report implies, which is the more favourable reading for (a). Likewise the "~2,200-line runtime" is mostly unused (Section 2).

### 1.5 Where Scala leaks into non-emitter layers

| Leak | Evidence | Why it matters for a second target |
|---|---|---|
| **`scalaType` in the field registry.** Registry entries are `{ camel, scalaType, dataType, integerDigits, decimalDigits, signed, editPattern, occursDepth, ... }` (header comment, `expression-gen.js` ~line 68). | `grep -c scalaType`: expression-gen 100, scala-generator 72, case-class-gen 14, sql-gen 6, cics-gen 2 (116 reference lines by `grep -nE "\.scalaType\|scalaType ==="`). ~80 comparisons against type literals: `grep -cE "scalaType\s*(===\|!==)\s*'(Int\|Long\|String\|BigDecimal\|Double\|Float)'"` gives 64 (expression-gen) + 12 (scala-generator) + 4 (case-class-gen) + 1 (sql-gen); `=== 'BigDecimal'` alone 27. | The analysis result *is* a Scala type name; decisions (`Int` vs `Long` vs `BigDecimal`) are encoded in the string. The mapping itself (`layout.scalaBaseType`: `Int` if <=9 digits, `Long` otherwise, `BigDecimal` if scaled or COMP-3, `Float`/`Double` for COMP-1/2, else `String`) is target-neutral in content (JVM `int`/`long`/`BigDecimal`/`String` also), only the spelling is Scala. |
| **`Vector[T]` as the storage model.** `mapCobolTypeToScala` wraps OCCURS items in `Vector`; subscripted writes are `v.updated(i, x)` (persistent copy). | `case-class-gen.js:108`; the worked example in 3.3 shows `wsEnt = wsEnt.updated(...)` | Copy-on-write gives value semantics for free. A Java array target must clone explicitly at group/table copies and BY CONTENT snapshots; this is invisible today. |
| **`assignExpr` + `RECURSIVE_LEAF_NAMES`.** A module-level `Set` of camelCase names, installed by `setRecursiveLeafNames` (`scala-generator.js:4475/4486/4490`), decides whether a write is `x = v` or `x_=(v)`. | `expression-gen.js:265-272, 1321-1326`; its doc comment (lines ~1300-1320 and ~233-263) records the root cause: Scala's `x = y` sugar only rewrites to `x_=(y)` for **template members**, not for local `def` pairs. | A Scala-compiler workaround stored as global state keyed by *name*, not by *binding*. A Java target has no such problem (cells are objects) and would carry dead machinery. |
| **Recursive flow flag** `IN_RECURSIVE_NESTED_FLOW` (`expression-gen.js:317`) selects `boundary.break()` vs `throw CobolExitSectionSignal` vs `return` for EXIT forms. | `generateExit`, `expression-gen.js:10049-10090` | The EXIT-family semantics are encoded as Scala control-flow idioms chosen by a global mode flag. |
| **Module-level mutable registries.** 27 `let` in `expression-gen.js`, 8 in `file-io-gen.js`, 1 in `method-gen.js`, installed by ~40 `setXxx()` functions from `scala-generator.js`. Seven are **duplicated** between `expression-gen` and `file-io-gen` (`ADVANCING_FILES`, `FILE_STATUS_REGISTRY`, `ACCESS_MODE_REGISTRY`, `RELATIVE_RECORD_LENGTH_REGISTRY`, `INDEXED_ORGANIZATION_FILES`, declarative handlers, plus `setAmbiguousParagraphNamesForPerform` in `method-gen` and `expression-gen`). | `grep -n "^let " generator/*.js` | The "analysis result" is not a value that can be handed to a second emitter; it is ambient state. Conversion is order-independent today (see 4.0 measurement), so this is hygiene, not a bug. |
| **Analysis written onto the AST.** `annotateGoToThruEscapes` mutates statements (`_thruEscapeRange`, `_thruEscapeTargets`). | `method-gen.js:1631` | Minor; the IR lowering should own these annotations. |
| **SQL host-variable typing** uses `scalaBaseType`; SQL output is Doobie (`ConnectionIO`, `Transactor`). | `sql-gen.js` header; 22 Doobie-token lines | Plus `runtime/DbAdapter.scala` (441 lines) which nothing references. |
| **Parser / lexer** | `grep -in scala parser/*.js` = 10 lines, all comments | The parser, `ast.js`, copybook/REPLACE resolvers carry over untouched. |

---

## 2. The runtime contract (what a Java target must mirror)

Every generated file embeds its runtime. A 15-line COBOL program yields a 1,184-line Scala file; the program's own object starts at line 1,161. The embedded runtime comprises:

1. `object CobolCodecs` (read from `runtime/CobolCodecs.scala` at module load, `scala-generator.js:122`; 530 lines).
2. `object CobolFmt`, `object CobolInspect`, `object CobolUnstring`: ~625 physical lines, **stored as arrays of JS strings** in `expression-gen.js` (`generateCobolFmtHelper` L1587, `generateCobolInspectHelper` L1982, `generateCobolUnstringHelper` L2171).
3. A per-program `private object CobolExitSectionSignal extends RuntimeException(null, null, false, false)` (recursive programs, EXIT SECTION).
4. **File I/O is not a runtime library.** The generator emits `java.io.RandomAccessFile`, `scala.io.Source.fromFile(...)(Codec.ISO8859)`, `PrintWriter`, `ArrayBuffer[Array[Byte]]`, iterators and ~14 per-file state variables directly into each program (`file-io-gen.js` `toFileVarName`...`toSigVarName`, `fileHandleVarNames`). `runtime/FileIO.scala` (`CobolSequentialFile`, `CobolIndexedFile`, ...) is not used.
5. Direct stdlib use: `println`, `sys.exit`, `scala.io.StdIn.readLine`, `java.time.*` (ACCEPT DATE/TIME/DAY, CURRENT-DATE), `Math.pow`, `scala.util.boundary`, `java.nio.charset.StandardCharsets` (14 refs), `scala.collection.mutable.ArrayBuffer` (12 refs).

Not referenced by any generator code (`grep -rn "CobolSequentialFile\|DbAdapter\|CobolMath\|moveNumeric\|performVarying\|FixedString" generator tests` is empty): `runtime/package.scala` (352), `CobolTypes.scala` (343), `FileIO.scala` (527), `DbAdapter.scala` (441).

### 2.1 `CobolCodecs` functions the generator calls (case-class-gen `parse`/`format`)

| Function | Semantics (from `runtime/CobolCodecs.scala` and `generator/codecs.js`, the JS ground truth) | Language-neutral concept |
|---|---|---|
| `packedDecode(bytes, scale)` / `packedEncode(value, digits, scale, signed)` | COMP-3: two digits per byte, sign nibble last (0xF unsigned); encode rescales HALF_UP, rejects negative into unsigned | yes (BigDecimal <-> byte[]) |
| `binaryDecode(bytes, endianness)` / `binaryEncode(value: Long, byteLength, endianness)` | COMP/COMP-4/BINARY big-endian, COMP-5 little-endian (host-native, compiler-verified); two's complement | yes |
| `zonedDecode(bytes, scale, signed, signLeading, signSeparate, codePage)` / `zonedEncode(...)` | DISPLAY numeric: one digit per byte; sign overpunch (ASCII: zone nibble 0x3x/0x7x; EBCDIC: letter substitution) or separate sign byte; scale echoed, not derived | yes |
| `floatEncode/Decode`, `doubleEncode/Decode` | IEEE-754 COMP-1/COMP-2 | yes |
| `ebcdicToString`, `stringToEbcdic(s, length)` | cp037 <-> Unicode, 256-entry table | yes (Java: `Charset.forName("IBM037")` is a possible shortcut, but must be checked against the table for unmapped bytes) |

Defined but unused by the generator: `packedByteLength`, `binaryByteLength`, `ebcdicByteToChar`, `charToEbcdicByte`. The codecs have a pure-JS twin (`generator/codecs.js`, 661 lines) tested by `tests/codecs.test.js`; that twin is the ready-made source of cross-language golden vectors for a Java port.

### 2.2 `CobolFmt` (every helper the generator emits calls for)

| Helper | Semantics | Neutral? |
|---|---|---|
| `num(v, intDigits, decDigits, signed, decimalComma)` | DISPLAY text of a numeric: zero-padded digits per PIC, sign char `+`/`-` always for signed (zero is `+`), decimal point inserted; all-decimal PIC omits leading zero; negative `decDigits` encodes trailing-`P` scaling | concept yes; formula uses HALF_UP `setScale` |
| `digitsOf(v, intDigits, decDigits)` | unsigned digit string, high-order digits truncated (numeric-to-alphanumeric MOVE) | yes |
| `zonedText(v, i, d)` / `refModToNumeric(text, d, signed)` | storage text of a signed DISPLAY numeric (trailing overpunch `p`..`y`) and its inverse | yes |
| `truncNumeric(v, i, d)` | MOVE/store without ROUNDED: `setScale(d, DOWN)`, then `whole % 10^i + frac` (drops high-order digits) | yes |
| `roundNumeric(v, i, d)` | store with ROUNDED: `setScale(d, HALF_UP)` then the same high-order truncation | yes |
| `fitsDigits(v, intDigits)` | ON SIZE ERROR test: integer-digit overflow only; fraction never triggers it; `intDigits<=0` means value must be zero | yes |
| `numval(s, decimalComma)` | FUNCTION NUMVAL: whitespace anywhere, leading/trailing sign, CR/DB handling | yes |
| `edited(pattern, raw, blankWhenZero, decimalComma)` | runtime port of `formatEditedPicture` (Z/9/$/+/-/CR/DB, floating insertion) | yes |
| `fitLeft(s, w)` / `fitRight(s, w)` | alphanumeric MOVE: pad with spaces or truncate (left- or JUSTIFIED RIGHT) | yes |
| `alnumCompare(a, b)` | shorter operand space-padded, then ordinal compare | yes (note: ordinal compare of Latin-1 chars) |
| `refModLen`, `refModFillLen`, `refModSlice`, `refModPatch`, `refModCheck`, `refModUnsupported` | (start:length) read/patch, 1-based; open-ended form encoded as `Int.MinValue`; currently throws on out-of-range (mid-edit by the concurrent agent) | yes |
| `floatDisplay`, `floatDisplaySingle` | COMP-2/COMP-1 DISPLAY text (16 significant digits truncated DOWN, then formatting) | concept yes; uses `Double.toString` text, which is JVM-defined and identical in Java |
| `advanceSep(n)` | WRITE ADVANCING: `"\r"` for 0 lines, `"\n"*n` otherwise (compiler-verified) | yes |

### 2.3 `CobolInspect` / `CobolUnstring`

`tallyAll`, `tallyLeading`, `replaceAll/First/Leading/Trailing/Characters`, `beforeInitial`/`afterInitial` (BEFORE/AFTER INITIAL regions), `ReplClause` + `replaceMultiClause(s, clauses)` (multi-clause REPLACING with region bounds), and `unstring(source, startPos, delims, maxFields) -> (fields, delimiters, pointer, overflow)`. All are pure string functions with no Scala-only semantics beyond `Vector`/tuple return types (Java: `record UnstringResult`).

### 2.4 Stdlib semantics that silently carry COBOL meaning

These are the places where "Scala does X" is part of the verified behaviour and a Java port must replicate X deliberately:

| Scala behaviour relied on | Where | Java equivalent / hazard |
|---|---|---|
| `scala.math.BigDecimal` operators (`+ - * /`) round to `MathContext.DECIMAL128` (34 digits, HALF_EVEN); the generator's `(a / b)` and `(a * b)` depend on it (`expression-gen.js:5905`). **Measured here with scala-cli 3.7.3:** `BigDecimal(1)/BigDecimal(3)` prints 34 threes; `123456789012345678.123456789012345678` squared prints `15241578753238836558451457271757357.1` in Scala but `15241578753238836558451457271757357.071178178283798204527968299765279684` with `java.math.BigDecimal.multiply`. `BigDecimal("1.0") == BigDecimal("1.00")` is `true`. | all arithmetic | `java.math.BigDecimal.divide(b)` **throws** on non-terminating quotients and `multiply` is exact. A Java target must pass `MathContext.DECIMAL128` to reproduce current output; a product of two 18-digit fields (36 digits) already differs. This is also exactly the intermediate-precision question the action plan's step 3 (IBM calibration) will reopen, so it must be a named IR parameter (Section 3.2). |
| Scala `BigDecimal ==`/`compare` are numeric (`1.0 == 1.00`) | conditions | Java `equals` is scale-sensitive; must use `compareTo` |
| Scala `Vector.updated` is persistent | tables, groups | clone discipline in Java |
| `"x" * n`, `padTo`, `take` | DISPLAY padding | `repeat`, explicit helper |
| `(wsI - 1).toInt.max(0)`: subscript index is **clamped to 0**, never out of range | every subscripted access (worked example 3.3) | an IR decision (`subscriptPolicy: clampLow`), not an emitter idiom |
| `scala.io.Source.fromFile(path)(Codec.ISO8859)`, `ArrayBuffer[Array[Byte]]` | file I/O | `Files.readAllBytes`, `ArrayList<byte[]>`, ISO_8859_1 explicitly |
| `sys.exit(n)` flushes stdout via normal JVM shutdown | STOP RUN | `System.exit(n)` after flushing `System.out` |
| `println` = platform line separator (`\n` on Linux) | DISPLAY | `System.out.print(s + "\n")` to stay platform-independent |

---

## 3. The proposed IR

### 3.1 Where it sits and why

```
 lexer -> parser -> AST ----+
                            v
                  Analysis: ProgramModel          (today: buildFieldRegistry + ~35 global registries)
                            v
                  Lowering: AST + Model -> IR     (today: the *decisions* inside every generateXxx)
                            v
                  IR passes (target-neutral)      (EXIT scopes, THRU-escape annotation, call-temp allocation)
                            v
                  Emitter(Scala | Java)           (today: the *string templates* inside every generateXxx)
```

Position: **after name resolution and layout, before any text.** Rationale, each tied to evidence:

* Not at the AST level. The AST has qualified names, ambiguous leaf names (resolved by `collectAmbiguousGroupClassNames`/`countLeafNameOccurrences`), REDEFINES that must become views, INITIAL/RECURSIVE per-program flags, and 88-level conditions. Every `generateXxx` begins by consulting registries to resolve these. The IR must start after that, or the second emitter re-implements name resolution.
* Not as a flat byte buffer. The current model is **typed leaf variables plus string gather/scatter for group views** (`groupDisplayValueExpr`, `scatterGroupFromString`; REDEFINES accessors compute views over leaves). Re-basing storage on one `byte[]` per record would be the most faithful design for COBOL, but it changes the observable behaviour of 563 verified programs and kills the byte-identical strangler test (Section 4). The IR therefore *describes the existing storage model* and exposes byte layout only through explicit `Codec`/`Gather`/`Slice` nodes. A byte-buffer storage model remains a possible later IR revision.
* Most of the semantic decisions already exist as function boundaries that return strings. Examples: `storeNumericByInfo` picks truncate vs round and the cast; `generateArithmeticSizeErrorCheck` takes `entries: { target, resultBD, finalExpr }` (an IR node in all but name); `generateCall` computes closure/snapshot plans before concatenating text. The IR is the extraction of what those functions already decide.

**What stays Scala/Java-specific** (syntax and library idiom only): identifier spelling and reserved-word escaping; `object`/`class` vs `final class` + `static`; `if ... then` vs `if (...) {}`; the encoding of structured early exit (`scala.util.boundary` vs labeled block); `Vector.updated` vs in-place array store plus clone points; closure pairs vs `Cell<T>` objects; string idioms; library import lines; whether the runtime is embedded text or a jar. **Nothing semantic** may live there. Section 3.2 lists eight decisions that are currently implicit in Scala idioms and must become explicit IR fields.

### 3.2 Node vocabulary

IR is plain JS objects with a `kind` tag (matching the existing code style; `ast.js` is already class-per-node), validated by a small schema checker. Names below are proposals.

**Program level**

| Node | Fields | Already decided today in |
|---|---|---|
| `Program` | `id`, `kind: main\|sub`, `recursive`, `initial`, `options{decimalComma, charset}`, `storage`, `files[]`, `units[]`, `declaratives[]`, `entry{params[], returns}` | `generateScala`, `generateMultiProgramScala` (49 code lines), `isRecursiveProgram`/`isInitialProgram` |
| `Section` | `kind: WS\|LS\|LINKAGE\|FILE`, `items[]`; LS is per-activation, WS is shared across a RECURSIVE chain (documented in `generateRecursiveEntryMethod`) | `getWorkingStorageItems` ... |
| `Leaf` | `id`, `name`, `path`, `repr: int32\|int64\|decimal\|text\|float32\|float64`, `pic{intDigits, decDigits, signed, edit, blankWhenZero}`, `usage: display\|zoned{signPos, separate}\|packed\|binary{bytes, endian}\|float`, `layout{offset, length}`, `init: Lit\|InheritedSlice`, `dims[]` | `buildFieldRegistry`, `layout.js`, `defaultElementaryValue*` |
| `Group` | `id`, `children[]`, `byteLen`, `dims[]`; derived `Gather(g)` (leaves -> text) and `Scatter(g, text)` | `groupDisplayValueExpr`, `scatterGroupFromString`, `GROUP_REGISTRY` |
| `Table` (dims entry) | `max`, `odo: LeafRef?` (DEPENDING ON), `indexNames[]`, `keys{asc[], desc[]}` | `TABLE_REGISTRY`, `odoDisplayValueExpr` |
| `View` (REDEFINES / RENAMES) | `base`, `shape: elemOverGroup\|groupOverGroup\|charSliced\|occursOnRedefines\|renames`, `read: Expr`, `write: Block` over the base's typed leaves, `repr` | the five `...RedefinesLines` generators (~600 code lines) |
| `Cond88` | `parent: LeafRef`, `values/ranges` | `CONDITION_REGISTRY`, `level88ConditionExpr` |
| `FileDecl` | `id`, `org: seq\|lineSeq\|relative\|indexed`, `access`, `recordLen`, `recordItem`, `status: Loc?`, `relativeKey: Loc?`, `linage{lines, footing, top, bottom}?`, `advancing`, `declarativeHandler: UnitRef?` | the seven file registries in `expression-gen`/`file-io-gen` |
| `Unit` | `id`, `name`, `section?`, `body: Block` (one per paragraph) | `flattenProcedureUnits` |

**Locations (lvalues) and bindings**

| Node | Fields | Notes |
|---|---|---|
| `Var` | `leaf: id`, **`binding: module\|frameCell\|temp`** | `binding` replaces the global `RECURSIVE_LEAF_NAMES`: a RECURSIVE program's LINKAGE leaves are `frameCell`, everything else `module`. Scope-correct by construction. |
| `Index` | `base: Loc`, `subs: Expr[]`, `policy: clampLow` | today `(i - 1).toInt.max(0)` and nested `.updated` (`renderAssignment`) |
| `Slice` | `base: Loc`, `start: Expr`, `len: Expr?` (open-ended), `check: runtime` | reference modification; canonicalised away (below) |
| `GroupLeaf` | `group`, `leaf` (per-leaf Vectors of an OCCURS-of-groups) | `flattenGroupLeaves` |

**Expressions** (all typed; every node carries `type: {repr, intDigits, decDigits, signed}`)

`Lit`, `Load(loc)`, `Arith{op, a, b, prec}` where **`prec = DECIMAL128` today** (named parameter; Section 2.4), `Neg`, `Pow`, `Fn{name, args}` (intrinsics: NUMVAL, LENGTH, UPPER-CASE, MOD, ... `functionLength` etc.), `Cmp{kind: numeric\|alnum\|class\|cond88, op, a, b}` (numeric uses `compareTo` semantics), `Logic{and\|or\|not}`, `Coerce{value, to}`, `NumFit{value, intDigits, decDigits, mode: truncate\|roundHalfUp}`, `Digits`, `Edited{pattern, value, blankWhenZero}`, `Fit{text, width, justify}`, `Gather(group)`, `SliceRead`, `Codec{decode\|encode, usage, bytes}`.

**Statements**

| Node | Fields | Already decided in |
|---|---|---|
| `Store` | `target: Loc`, `value: Expr` | `renderAssignment`, `assignExpr` |
| `ArithStmt` | `entries[{target, exact: Expr, finalValue: Expr}]`, `onSizeError: Block?`, `notOnSizeError: Block?`, `extraErrorCond: Expr?` (DIVIDE BY ZERO), `rounded` | `generateArithmeticSizeErrorCheck` (per-target gating, round-38 fix), `generateAdd/Subtract/Multiply/Divide/Compute` |
| `Block`, `If{cond, then, else}`, `Switch{subjects, whens[{conds\|ranges, body}], other}` | | `generateIf`, `generateEvaluate` |
| `Scope{id, body, used}` + `Exit{scope}` | structured early exit; `used` lets an emitter elide the wrapper | `scala.util.boundary` + `break()`, `return`, `throw CobolExitSectionSignal` |
| `Loop{init[], test: before\|after, cond, step[], body, scope}` | PERFORM UNTIL/TIMES/VARYING (nested AFTER via nesting) | `generatePerformFromAST`, `generateVaryingNest` |
| `PerformUnit{unit}`, `PerformThru{from, to, wrapper}` | THRU wrappers are shared generated units | `generatePerformThruMethod`, `performThruWrapperName` |
| `GoTo{targets[], dependingOn?, escapesThru}` | tail-call + `return` convention, shared by both targets | `generateGoTo`, `annotateGoToThruEscapes` |
| `ExitKind{paragraph\|section\|perform\|program\|cycle}` lowered by a pass to `Exit{scope}` | | `generateExit`, `IN_RECURSIVE_NESTED_FLOW` |
| `Return{code?}`, `Stop{code?}` | GOBACK / STOP RUN | |
| `Call{target, mode: static\|dynamic, args[{loc\|expr, by: ref\|content\|value, omitted}], recursiveTarget, onException}` + `Temp` declarations for BY CONTENT snapshots | | `generateCall` (197 code lines), `nextCallSiteId` |
| `FileOp{op: open\|close\|read\|write\|rewrite\|delete\|start, file, mode, key?, into?, from?, advancing?, atEnd, notAtEnd, invalidKey, notInvalidKey, onError}` | status-code decisions (00/10/22/23/24/43/46/47/48/49) are *data in the lowering*, not strings in emitters | ~1,140 code lines |
| `StringOp`, `UnstringOp`, `InspectOp`, `SearchOp{linear\|all}`, `SortOp`/`MergeOp` (with procedures), `Release`, `Return`, `Initialize`, `Set`, `Display`, `Accept` | thin nodes over the Section 2.3 helpers | |
| `SqlOp{kind, text, hostIn[], hostOut[], cursor?, indicators}` | emitter chooses JDBC/Doobie | `sql-gen.js` |
| (not in IR v1) CICS | stays a template-per-target; it is explicitly "not a behavioural conversion" | `cics-gen.js` |

**Canonicalisation passes** (target-neutral, run on IR before emission): (1) `Store(Slice(b,s,l), v)` becomes `Store(b, Patch(Load b, s, l, v))` (and `Scatter(g, Patch(Gather g, ...))` for groups); so no emitter ever sees a slice as an lvalue. (2) `ExitKind` becomes `Exit{scope}` and marks `Scope.used`. (3) BY CONTENT/VALUE arguments get explicit `Temp` nodes (today `_call{n}_{i}Snapshot{j}` naming lives inside `generateCall`). (4) `Index.policy` default filled.

**The eight decisions the IR must make explicit** (each is today implied by a Scala idiom and appears in the generated code above or in Section 2.4): intermediate precision (`DECIMAL128`); rounding modes (ROUNDED = HALF_UP, truncation = DOWN, high-order digit drop via `% 10^i`); per-target ON SIZE ERROR gating; numeric comparison by value; subscript clamp; reference-modification range policy; charset (Latin-1 vs cp037) for text and files; stdout/exit flushing.

### 3.3 Worked examples

The Scala excerpts are real output (`convertToScala(...)` run in this task). Java is hand-derived and uncompiled. Notation: `Var(x)` is `Var{leaf: x, binding: module}` unless stated.

#### Example 1: MOVE with truncation (`MOVE WS-BIG TO WS-SMALL`; `WS-BIG PIC 9(5)V99`, `WS-SMALL PIC 9(3)V9`)

IR (after lowering):

```
Store{
  target: Var(wsSmall),                                   // repr decimal, 3.1
  value:  NumFit{ value: Load(Var(wsBig)),                // repr decimal, 5.2
                  intDigits: 3, decDigits: 1, mode: truncate }  }
```

Scala (actual): `wsSmall = CobolFmt.truncNumeric(wsBig, 3, 1)`
For an `Int` target, `Coerce{to: int32}` wraps the NumFit and Scala renders it as `... .toInt` (seen in the PERFORM example: `CobolFmt.truncNumeric(BigDecimal(wsI), 2, 0).toInt`).

Java: `wsSmall = CobolFmt.truncNumeric(wsBig, 3, 1);` and for int: `CobolFmt.truncNumeric(BigDecimal.valueOf(wsI), 2, 0).intValue()`. `CobolFmt.truncNumeric` in Java is five lines (`setScale(d, DOWN)`, `remainder(TEN.pow(i))`, `add(frac)`).

What this proves: the high-order-truncation semantics, which is the verified COBOL behaviour, lives in a node with named parameters, not in a Scala template. ROUNDED is `mode: roundHalfUp`; ON SIZE ERROR wraps the same `NumFit` in an `ArithStmt` whose `entries[i].exact` feeds `fitsDigits`.

#### Example 2: reference-modification write (`MOVE "XY" TO WS-NAME(3:2)`; `WS-NAME PIC X(10)`)

IR before canonicalisation:

```
Store{ target: Slice{ base: Var(wsName), start: Lit 3, len: Lit 2, check: runtime },
       value:  Fit{ text: Lit "XY", width: 2, justify: left } }
```

After canonicalisation:

```
Store{ target: Var(wsName),
       value:  Patch{ base: Fit{ text: Load(Var(wsName)), width: 10, justify: left },
                      start: Lit 3, len: Lit 2, value: Lit "XY" } }
```

Scala (actual, mid-edit by the concurrent agent): `wsName = CobolFmt.refModPatch(CobolFmt.fitLeft(wsName, 10), (3).toInt, (2).toInt, "XY")`
Java: `wsName = CobolFmt.refModPatch(CobolFmt.fitLeft(wsName, 10), 3, 2, "XY");`

A slice of a subscripted element becomes `Store(Index(...), Patch(Load(Index(...)), ...))`; of a group, `Scatter(g, Patch(Gather g, ...))`; of a RECURSIVE LINKAGE leaf, the `Var` carries `binding: frameCell` and the same Store rule applies, so ref-mod needs no recursion special case (today `refModWriteStatement` must route through `assignExpr` by hand, as its comment states).

#### Example 3: PERFORM VARYING with a subscripted write and ADD

```cobol
PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 5
    MOVE WS-I TO WS-ENT(WS-I)
    ADD WS-ENT(WS-I) TO WS-TOT
END-PERFORM.
```

IR:

```
Scope s1 (used: false) {
  Loop{ init: [ Store(Var(wsI), Lit 1) ],
        test: before,
        cond: Cmp{numeric, GT, Load(wsI), Lit 5},
        step: [ Store{ target: Var(wsI), value: Arith{add, Load(wsI), Lit 1, prec: DECIMAL128}, fit: none } ],
        body: [
          Store{ target: Index{ Var(wsEnt), [Load(wsI)], clampLow },
                 value: Coerce{int32, NumFit{ Load(wsI), 2, 0, truncate }} },
          ArithStmt{ entries: [{ target: Var(wsTot),
                                 exact: Arith{add, Load(wsTot), Load(Index(wsEnt,[wsI]))},
                                 finalValue: Coerce{int32, NumFit{exact, 4, 0, truncate}} }] } ],
        scope: s1 } }
```

Scala (actual):

```scala
scala.util.boundary {
  wsI = 1
  while !(wsI > 5) do
    wsEnt = wsEnt.updated((wsI - 1).toInt.max(0), CobolFmt.truncNumeric(BigDecimal(wsI), 2, 0).toInt)
    wsTot = (CobolFmt.truncNumeric((BigDecimal(wsTot) + (BigDecimal(wsEnt((wsI - 1).toInt.max(0))))), 4, 0)).toInt
    wsI = wsI + 1
}
```

Java (derived; `used: false` so the labeled block is elided, which the byte-identical Scala emitter must *not* do until a golden rebase):

```java
wsI = 1;
while (!(wsI > 5)) {
    wsEnt[Math.max(wsI - 1, 0)] = CobolFmt.truncNumeric(BigDecimal.valueOf(wsI), 2, 0).intValue();
    wsTot = CobolFmt.truncNumeric(BigDecimal.valueOf(wsTot).add(BigDecimal.valueOf(wsEnt[Math.max(wsI - 1, 0)]), MC), 4, 0).intValue();
    wsI = wsI + 1;
}
```

Observations from writing this example: (i) the loop step is an **unfitted** `wsI = wsI + 1` (`fit: none`), whereas COBOL ADD would truncate; for `PIC 9(2)` stepping past 99 the Scala never wraps. I did not test this against cobc; it is a candidate adversarial probe. The IR forces the question to be answered in one place (`Loop.step.fit`). (ii) Java mutates `wsEnt` in place where Scala copies; correct only because nothing else aliases the array, which the `Store`-of-table rule (clone on whole-table or group copy and on BY CONTENT) must guarantee.

#### Example 4: RECURSIVE CALL BY REFERENCE (`corpus/proc/l12-recur-selfwrite.cbl`: `SUBTRACT 1 FROM LS-N` then `CALL "L12SUB" USING LS-N`)

IR for `L12SUB` (`recursive: true`, one REFERENCE parameter with one leaf):

```
Program L12SUB{ recursive: true,
  entry: { params: [ { leaves: [ Leaf lsN : int32, PIC 9(2), binding: frameCell ] , by: ref } ] },
  units: [ mainPara: [
     Display( ... Load(Var(lsN, frameCell)) ... ),
     If{ cond: Cmp{numeric, GT, Load(Var(lsN, frameCell)), Lit 0},
         then: [
           ArithStmt{ entries:[{ target: Var(lsN, frameCell),
                                 exact: Arith{sub, Load(lsN), Lit 1},
                                 finalValue: Coerce{int32, NumFit{exact, 2, 0, truncate}} }] },
           Call{ target: L12SUB, recursiveTarget: true,
                 args: [ { loc: Var(lsN, frameCell), by: ref } ] } ] },
     Display( ... ),
     Return ] ] }
```

Scala (actual, from `L12sub.entry` in the generated file):

```scala
def entry(_get0: () => Int = () => 0, _set0: Int => Unit = (_: Int) => ()): Unit =
  def lsN: Int = _get0()
  def lsN_=(v: Int): Unit = _set0(v)
  def mainPara(_chain: Boolean = false): Unit =
    ...
    if lsN > 0 then
      lsN_=((CobolFmt.truncNumeric((BigDecimal(lsN) - (BigDecimal("1"))), 2, 0)).toInt)
      L12sub.entry(() => lsN, (v: Int) => lsN_=(v))
```

The Scala emitter derives `lsN_=(...)` from `binding: frameCell` on the `Var` and renders a `ref` argument as a getter/setter pair. The caller (`L12main`) renders the same `Call` with a `module` binding as `L12sub.entry(() => wsN, (v: Int) => wsN = v)`.

Java (derived): the aliasing the Scala emitter simulates with closures is a plain object in Java.

```java
final class L12sub {
    private final Cell<Integer> lsN;                    // frameCell binding: the caller's cell itself
    private L12sub(Cell<Integer> lsN) { this.lsN = lsN; }
    static void entry(Cell<Integer> lsN) { new L12sub(lsN).mainPara(); }
    private void mainPara() {
        System.out.print("ENTER N=" + CobolFmt.num(BigDecimal.valueOf(lsN.get()), 2, 0, false, false) + "\n");
        if (lsN.get() > 0) {
            lsN.set(CobolFmt.truncNumeric(BigDecimal.valueOf(lsN.get()).subtract(BigDecimal.ONE, MC), 2, 0).intValue());
            L12sub.entry(lsN);                           // BY REFERENCE: pass the cell
        }
        System.out.print("EXIT  N=" + ... + "\n");
    }
}
// caller, L12main (wsN is a static field):
L12sub.entry(new Cell<>(() -> wsN, v -> wsN = v));
```

What this proves: the `assignExpr`/`RECURSIVE_LEAF_NAMES` convention and the round-23 Scala-local-def workaround become one emitter decision (`frameCell` rendering) instead of global state; a Java emitter has no analogue of that workaround. The BY CONTENT path is the same node with `by: content`, which the canonicalisation pass expands to an explicit `Temp` plus a cell over it. Not covered by this example, and still open under any IR: CALL BY REFERENCE of a group containing an OCCURS table (listed in the viability report as silently passing empty data today); the IR makes the per-leaf fan-out explicit (`GroupLeaf`) but the bug must be fixed in lowering.

Note also that, as the generated file shows, every program is currently emitted **twice** (module-level `mainPara()` plus a nested copy inside `entry`); a recursive program's module-level copy is dead. The IR makes one body with one binding, and the emitter chooses the shape.

---

## 4. Migration path (strangler, oracle kept green at every step)

### 4.0 The regression net, and a feasibility measurement

Two nets exist, with very different speed:

| Net | What it proves | Cost |
|---|---|---|
| **Golden snapshot (to build, Phase 0):** hash of the full generated Scala for every corpus program | the refactor changed **zero bytes** of output, hence cannot change oracle results | Measured here: `convertToScala` over all 563 tracked `.cbl` programs takes **1.0 s** (44.6 MB of output; 79 KB average because ~97% of each file is the embedded runtime). Output was identical when the corpus was converted in forward vs reverse order (0 of 563 differ), so the module-level registries do not leak state between conversions. Scripts: Appendix B. |
| **Oracle suite** (`tests/oracle/oracle.test.js`): cobc vs scala-cli for every program | generated Scala still matches real GnuCOBOL on stdout | Needs `cobc` and `scala-cli` (both present in this sandbox, JDK 21.0.10 too); each program compiles under scala-cli; wall-clock for the full suite was not measured in this task. **It skips silently when `scala-cli` is absent** (`docs/toolchain-status.md` 2026-10-05 note), so every acceptance run must assert `scala-cli version` and zero skips. |

Because the strangler rule is "output byte-identical", the oracle result is invariant by construction and only needs to be re-run at phase boundaries to catch an environment problem; the golden snapshot is the per-commit gate. The 981 text-pinning assertions in `tests/*.test.js` (`grep -hcE "\.includes\(|assert\.match\(" tests/*.test.js`, summed; 43 of 51 test files call the generator) likewise stay valid. Baseline caveat: take the golden baseline **after** the concurrent reference-modification work lands, since that work changes Scala output.

Corpus coverage of the risk areas (grep over the 563 tracked programs; upper bounds because comment text matches; `xargs grep -liE '<pattern>' < tracked.txt | wc -l`):

| Area | Programs | | Area | Programs |
|---|---:|---|---|---:|
| `OPEN` (any file I/O) | 153 | | `ROUNDED` | 14 |
| `RECURSIVE` | 82 | | `SIZE ERROR` | 13 |
| `CALL` | 137 | | `LINAGE` | 11 |
| `DECLARATIVES` | 42 | | `PERFORM ... THRU` | 27 |
| `OCCURS` | 131 | | `EXIT PARAGRAPH/SECTION/PERFORM` | 15 |
| `DEPENDING ON` | 40 | | `REDEFINES` | 38 |
| `RELATIVE` | 76 | | `LINE SEQUENTIAL` | 78 |
| ref-mod `(a:b)` pattern | 20 | | `EXEC SQL` | 5 (no DB in harness) |
| `SORT`/`MERGE` | 32 | | `SEARCH` | 28 |

Per-target ON SIZE ERROR and ROUNDED have the thinnest net (13-14 programs) among the high-risk areas; Phase 2b should add programs before it starts, not after.

### 4.1 The step recipe (applied per statement family)

1. Write `lowerX(stmt, model) -> IRNode` by *moving* the decision logic out of `generateX`.
2. Write `emitScalaX(node)` containing the existing template text.
3. Make `generateX = emitScalaX(lowerX(...))`.
4. Run the golden snapshot: **0 diffs over 563 programs**, unit tests green.
5. At the end of the phase only: full oracle run, same pass/fail/todo counts as baseline, skipped = 0.

### 4.2 Phases

Effort model: engineer-days of a single engineer who knows the codebase, no AI assistance assumed, calibrated at ~80-120 lines touched per day including verification (the work is restructuring with a 1-second equivalence check, not new semantics). Overall uncertainty +/-35%.

| Phase | Scope | Lines touched / written | Days | Acceptance |
|---|---|---:|---:|---|
| **0a** Golden snapshot | `tests/golden/` map path -> md5 of full output, `--update` flag, wired into `npm test`; baseline oracle counts recorded | +150 new, 0 existing | 2 | Snapshot test green; a deliberate one-character template change makes it fail |
| **0b** Extract embedded runtime | Move `CobolFmt`/`CobolInspect`/`CobolUnstring` from JS string arrays to `runtime/*.scala`, embedded by `readFileSync` like `CobolCodecs` | ~625 moved | 3 | Golden: 0 diffs. (Whitespace/escape fidelity of the `\\u` and `\\r` string escapes is the only risk.) |
| **1** Neutral type vocabulary + `ProgramModel` | `scalaType` -> `repr` (`'int32'...`) with `scalaTypeOf(repr)` at the emitter edge; one `ProgramModel` value that installs the existing registries (globals stay for now, but each registry is set from exactly one place; dedupe the 7 duplicates) | ~700 touched (~200 comparison sites + `layout.js` + registry builders), ~300 new | 5 | Golden 0 diffs; unit tests green; oracle full run |
| **2a** `Loc` + binding + `assignExpr` | `Var/Index/Slice`, `binding`, `Store`; delete `RECURSIVE_LEAF_NAMES` by name in favour of the leaf's binding; canonicalise Slice stores | ~350 | 4 | Golden 0 diffs; the 82 RECURSIVE programs and ref-mod programs identical |
| **2b** Numeric core | `Value` nodes, `Arith{prec}`, `NumFit`, `ArithStmt` incl. per-target SIZE ERROR, conditions (`Cmp`/`Logic`/`Cond88`) | ~1,200 (arithmetic 486 + conditions 457 + ~250 shared) | 12 | Golden 0 diffs; **first add ~10 ROUNDED/SIZE ERROR programs to the corpus**; oracle full run |
| **2c** MOVE family | MOVE/INITIALIZE/literals/edited/ref-mod/`Gather`/`Scatter`/CORRESPONDING | ~900 | 9 | Golden 0 diffs |
| **3** Control flow | IF/EVALUATE/PERFORM (TIMES/UNTIL/VARYING/AFTER)/THRU wrappers/GO TO/EXIT scopes/paragraph units/nested fall-through (recursive) | ~1,100 (`method-gen` 627 + ~480 in `expression-gen`) | 10 | Golden 0 diffs; the 27 THRU, 15 EXIT, 82 RECURSIVE programs |
| **4** Text and tables | STRING/UNSTRING/INSPECT/ACCEPT/DISPLAY/intrinsics, SEARCH/SEARCH ALL, SORT/MERGE | ~700 | 7 | Golden 0 diffs |
| **5** File I/O | `FileDecl`, `FileOp`, status lattice as data, LINAGE, RELATIVE, DECLARATIVES hooks, advancing | ~1,200 | 12 (inline path, byte-identical) | Golden 0 diffs; the 153 OPEN programs; see risk note |
| **6** CALL / entry / recursive / declaratives / INITIAL | `Call`, `Temp`, frame cells, entry method, declarative dispatch | ~900 | 10 | Golden 0 diffs; the 137 CALL + 82 RECURSIVE + 42 DECLARATIVES programs |
| **7** Data division | `Leaf/Group/Table/View`, VALUE init and inheritance, REDEFINES views, case-class/enum emission | ~2,000 | 14 | Golden 0 diffs; the 38 REDEFINES + 40 ODO programs |
| **Subtotal** | | **~9,000 touched; ~+2,500 net new** (IR schema, validator, passes) | **88** | |
| Integration/regression buffer (20%) | | | +17 | |
| **IR total** | | | **~105 (range 80-120)** | oracle suite identical to baseline, skipped = 0 |

Order rationale: `Loc`/binding first (smallest, and everything else stores through it); numeric core before MOVE (MOVE is `Store(NumFit)`); control flow before file I/O (file ops embed blocks); data division last because the registry is read by everything and replacing its construction last avoids moving the floor under earlier phases. Phase 0b may be done anywhere before Phase 5.

### 4.3 Riskiest areas and why

| Area | Why risky | Mitigation inside the plan |
|---|---|---|
| **RECURSIVE getter/setter convention** (`assignExpr`, `RECURSIVE_LEAF_NAMES`, `generateRecursiveEntryMethod`, nested fall-through, `IN_RECURSIVE_NESTED_FLOW`, `CobolExitSectionSignal`) | The convention is a Scala-compiler workaround (documented root cause at `expression-gen.js` ~1300-1320) layered over round-21/22/23/29/35 fixes; the name-keyed set is replaced by binding-keyed, which can only differ if a name collision exists. 82 programs exercise it. | Phase 2a does only the binding swap (golden-identical); Phase 6 changes entry shape later |
| **`assignExpr`** | ~80 call sites, one string-level switch; a missed site compiles to `Reassignment to val` | Make `Store` the only way to write; delete the string builder; golden catches any miss at the first diff |
| **File-I/O fixed-width byte model** | Round 29 rewrote RELATIVE storage after silent corruption of a newline byte; ~14 state vars per file; status decisions are spread across ~1,100 lines | Phase 5 first keeps inline emission (byte-identical). **Decision point:** a Java target should not copy 1,100 lines of inline state machines; consolidating into a `CobolFile` runtime class changes Scala output, so it cannot be golden-identical. Plan it as Phase 5b (+8 days, ~600 lines) with a re-baselined golden *restricted to the 153 OPEN programs* and the full oracle as the gate. |
| **LINAGE** | Handle-declaration-time state (`linageRegistry`, `LINAGE_INVALID_FILES`, page/footing counters, status 57 abort) | 11 programs; add 3-4 before Phase 5 |
| **Per-target ON SIZE ERROR** | Each receiving field is gated independently (round-38 finding); DIVIDE BY ZERO is a whole-statement short-circuit | Thinnest coverage (13 programs): add ~10 first (Phase 2b) |
| **REDEFINES views** | ~600 code lines of five view shapes, some `todoStub` | Phase 7 last; golden catches; leave stubs as stubs |
| **Process risk** | New adversarial fixes keep landing in `expression-gen.js` during the 105+ day migration | Land fixes on the pre-IR code until a family's phase finishes, then port; or merge-freeze per family. Budget the rework in the 20% buffer |

---

## 5. The Java emitter phase

Not started by this document. Scope and estimate, assuming the IR above exists.

### 5.1 Construct mapping (Java 21)

| IR / Scala idiom | Java 21 | Note |
|---|---|---|
| `object Prog` with `var` module state | `final class Prog { static ... }` for ordinary programs | statics keep today's shared-storage semantics, including WS shared across a RECURSIVE chain |
| RECURSIVE program (`entry(_get,_set)` + local defs) | `final class Prog` instantiated per activation; LINKAGE leaves are `Cell<T>` fields; LOCAL-STORAGE are instance fields | Example 4 |
| `case class Rec(...)` + companion `parse/format` | `record Rec(...)` with `static Rec parse(byte[])`, `byte[] format()` | records are immutable, matching the case class; mutation stays in the flat static fields |
| `Int`/`Long`/`BigDecimal`/`String` | `int`/`long`/`java.math.BigDecimal`/`String` | `repr` already says which; `scala.math.BigDecimal` -> `MathContext.DECIMAL128` on `add/subtract/multiply/divide`; `compareTo` for `==` |
| `Vector[T]` + `.updated` | `T[]` in place; clone on whole-table/group copy and BY CONTENT | the only place Java needs *new* discipline |
| `if ... then`, `while ... do`, `match` | `if`, `while`, `switch` | `GO TO ... DEPENDING ON` -> int `switch`; EVALUATE conditions are boolean chains, **not** pattern switches |
| `scala.util.boundary`/`break` | labeled block `s1: { ... break s1; }`, emitted only when `Scope.used` | |
| `throw CobolExitSectionSignal` | `final class ExitSection extends RuntimeException(null, null, false, false)` | same stackless trick |
| `Option`, tuples (`unstring` result) | `record UnstringResult(...)`, `Optional` or sentinel | |
| `println`, `sys.exit` | `System.out.print(s + "\n")`, flush + `System.exit` | |
| Sealed types / record patterns / pattern `switch` | used **in the emitter's own Java runtime where useful** (e.g. `sealed interface FileStatus`), not needed for the generated program body | the engine is JS; the IR is JS objects with `kind` tags |
| File state (14 vars/file inline) | one `CobolFile` runtime class over `RandomAccessFile` / `Files` with ISO-8859-1 | after Phase 5b the Scala target uses the same shape |

### 5.2 SQL: JDBC versus Doobie

Doobie needs `cats-effect` and the Scala library; the viability report notes most bank Java teams do not run it. `sql-gen.js` (440 code lines) is not wired into the main output and nothing in the oracle verifies SQL (5 corpus programs, no database). Recommendation: lower EXEC SQL to an IR `SqlOp{text, hostIn, hostOut, cursor, indicators}` and emit it against **one** small `CobolSql` runtime over plain JDBC (`PreparedStatement`, `ResultSet`, SQLCODE/SQLSTATE mapping) for Java, and, if a Scala target survives, also for Scala (Scala calls JDBC fine), retiring the Doobie dependency in both. Verification is limited to an embedded database (H2 or SQLite) smoke tests, not an oracle; say so in any partner conversation. Estimate 7 days (plus 3 if a Java CICS skeleton is wanted).

### 5.3 Estimate

| Item | Size | Days |
|---|---|---:|
| Java runtime: `CobolCodecs` (port of 530 Scala lines), `CobolFmt`/`Inspect`/`Unstring` (~650), `CobolFile` (~600), `Cell`, `CobolSql` (~300) | ~2,300 Java lines | 14 |
| Cross-check Java codecs against `generator/codecs.js` golden vectors | | (in the 14) |
| Java emitter (parallel to the Scala emitter, over the same IR) | ~4,000 JS lines (the emitters are the residue of today's ~10.4k lines once decisions are in lowering) | 30 |
| Oracle harness: `runJava` (`javac`/`java` single-file or classpath; JDK 21 present here), per-target switch in `oracle.test.js` | ~200 lines | 3 |
| Triage to parity on the 563-program corpus (expect a minority to diverge initially, clustered in tens of root causes; planning figure 30-40 root causes at ~0.5 day) | | 15-25 |
| JDBC SQL | | 7 |
| **Java phase total** | | **~75 (range 65-95)** |

**Total for option (a): ~105 (IR) + ~75 (Java) = ~180 engineer-days, range 150-200**, i.e. 7-10 engineer-months for one engineer, roughly 4-5 calendar months for two. Not included: a C# emitter (the report notes vendors emit Java *or* C#; the IR would serve it, but C# `decimal` is 28 digits against the DECIMAL128 intermediate precision above, a real design question) and platform work.

**Alternative considered: fork the generator and retarget it** (no IR). Edit ~7k lines of string templates (cheaper per line than restructuring, ~150 lines/day), plus the same Java runtime (14), harness (3) and triage (20): roughly 90-110 days, i.e. 50-90 days cheaper up front. It makes every future fix a two-place edit. The campaign found 241 bugs in 40 rounds (about 6 per round); at an extra 0.5-1 day per duplicated fix that is 3-6 extra days per round, so break-even against the IR path is on the order of 12-25 further rounds' worth of fixes, or about a year if the product is actively developed. If both targets are expected to live more than a year, the IR wins; if Java is a one-time port to be pursued only with a partner, the fork is the cheaper bet. This is an estimate, not a measurement.

---

## 6. Decision framing for the owner

| | (a) IR + Java emitter | (b) Scala-only, named design partners | (c) Do nothing (keep deferring) |
|---|---|---|---|
| **Cost** | ~180 engineer-days (150-200); ~10 of them (Phases 0-1) are safe to start now | ~10 engineer-days (Phase 0 + `scalaType` rename) if hygiene is wanted; otherwise ~0; partner-specific work additional | 0 now; every Scala-only fix raises (a)'s later cost (expression-gen.js is touched by 39% of branch commits) |
| **Risk** | Medium: byte-identical gate is cheap and strong, but 88+ days of restructuring while fixes keep landing; Java runtime semantics (DECIMAL128, clone discipline) are new surface; no IBM calibration yet | Low technically; high commercially if partners are not Scala shops | Silent: a Java request arrives and the answer is ~180 days, not a decision |
| **Demand evidence (report)** | Every commercial COBOL-conversion vendor found emits Java or C#; Java/Scala postings treat Scala as one dialect inside a Java estate; insurers/governments show no Scala footprint | "the ~dozen global banks with large existing Scala platforms ... enough for first design partners, not for the whole company" (the market analysis the report quotes); 43% of Scala-using teams report hiring difficulty; Flink dropped its Scala API | Neither |
| **Evidence quality** | Desk research only; **no partner has been asked** (step 4 is the first real test) | Same | n/a |
| **Reversibility** | Phases 0-1 fully reversible and useful either way; Phases 2-7 are reversible by revert while byte-identical, but sunk | Fully reversible: Phases 0-1 can be added later; cost grows with generator size | Not a state, a drift |
| **Forecloses** | Nothing technically (Scala emitter retained); ~180 days of opportunity cost | Java-only buyers (the majority per the report's evidence) until reopened | Both options degrade |
| **Fits step 6/9 of the action plan** | Needs a partner commitment before the April 2027 kill date to be worth finishing | Gives the clearest positioning ("Scala shops") | Fails the plan's "decide explicitly" instruction |

**Recommendation (the choice is the owner's):**

1. **Start now, whatever the answer:** Phase 0a, Phase 0b, Phase 1 and the Section 7 fixes. About 10 engineer-days, zero change to Scala output (golden-verified), and they lower the cost of either path and of continued adversarial work. This honours "stop deferring" without committing ~180 days.
2. **Gate the remaining ~95 days of IR work and the ~75-day Java phase on step 4** (the ten partner conversations). The decisive question is the one the action plan already asks: in what language would you consume this? If two or more integrators or bank platform teams say Java (or C#), commit to (a); the evidence in the viability report points that way, and nothing found in this design argues against it. If the answers are Scala banks, choose (b) and write the named accounts into every document.
3. **If a Java-only partner appears early and wants a pilot, the fork variant** in Section 5.3 reaches a demo sooner (~90-110 days) at the price of permanent duplicate maintenance; the IR path should still be chosen if the product is expected to be developed beyond a year.
4. (c) is dominated: it has no cost advantage over (b)'s hygiene work and leaves the question open.

My own lean is (a), because the desk evidence for Java demand is one-sided and the IR cost, once the real size (10.4k code lines, not 21.6k) is used, is more modest than the report's framing suggests. That lean rests on desk research; the partner conversations can overturn it, which is why Phases 2-7 should wait for them.

---

## 7. Worth fixing regardless of the decision

Each simplifies the Scala emitter or tightens verification, with or without Java.

1. **Replace `scalaType` with a neutral `repr`** (Phase 1). Removes ~80 string comparisons against Scala type names and the `scalaBaseType` leak into SQL typing; ~5 days; golden-verifiable.
2. **Extract the embedded runtime text** (625 lines of Scala in JS string arrays) into real `.scala` files. Gets them compile-checked and editable without `\\u`/`\\r` escape layers; ~3 days; golden-verifiable.
3. **Delete or quarantine the four unreferenced runtime files** (`package.scala`, `CobolTypes.scala`, `FileIO.scala`, `DbAdapter.scala`, 1,663 lines) and correct the "~2.2k portable runtime" claim in the viability report: the live runtime is ~1,155 lines plus inline file I/O. Avoids a Java port of dead code.
4. **Deduplicate the seven registries duplicated between `expression-gen.js` and `file-io-gen.js`** and install each from one place (Phase 1). Today a missed `set...` in one module is a silent wrong-state hazard, currently masked by identical installs.
5. **Key RECURSIVE aliasing by binding, not by name** (Phase 2a). The current global `Set` is scope-insensitive by construction.
6. **Stop emitting each RECURSIVE program's body twice** (module-level `mainPara()` that is dead, plus the nested copy), visible in the l12 output. Shrinks recursive output and removes a class of "fixed it in one copy" mistakes. This changes Scala output, so it needs a re-baselined golden for the 82 RECURSIVE programs.
7. **Candidate bug, unverified:** PERFORM VARYING step is an unfitted `wsI = wsI + 1` (Example 3). COBOL's ADD would truncate to the PIC width. Worth one adversarial probe against `cobc` (e.g. `PIC 9(1)` counter stepping through 9).
8. **Golden snapshot as a permanent test** (Phase 0a): a 1-second check that a refactor or a fix changed only the programs it was meant to. It also makes each adversarial fix's blast radius visible in review.
9. **Add corpus programs before touching** per-target ON SIZE ERROR, ROUNDED (13-14 programs) and LINAGE (11): the thinnest nets over the riskiest code.

---

## Appendix A: Metric B classifier (reproduces Section 1.1/1.3)

Save as `inv.mjs`, set `dir`, run `node inv.mjs`. First-match category priority is the order of `cats`.

```js
import fs from 'fs';
const dir = '/home/user/cobol-to-scala/Thyraa-COBOL-main/backend/packages/cobol-to-scala/generator/';
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort();
// string-literal extractor: contents of '...', "..." and `...` on one physical line
const strRe = /`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g;
const SCALA = /\b(val|var|def|object|case class|then|else|match|boundary|break|while|BigDecimal|Vector|Array\[|Option|Some\(|None\b|\.updated|\.setScale|\.substring|CobolFmt|CobolCodecs|CobolInspect|CobolUnstring|Cobol[A-Z]\w+|import|println|scala\.|java\.|lazy|Int|Long|String|Double|Unit|=>|\.toInt|\.length|\.take|\.drop|\.padTo|\.map|\.foreach|\.apply)\b|=>|:\s*(Int|String|BigDecimal|Unit|Boolean)\b/;
const cats = [
 ['sql', /Doobie|doobie|ConnectionIO|Transactor|sql"|fr"|\bSQLCODE|sqlca|SQLException|\.query\[|\.update\.run|\.transact|java\.sql/i],
 ['file-io', /RandomAccessFile|FileOutputStream|PrintWriter|Source\.from|java\.io|java\.nio|FileNotFound|IOException|\.readLine|\.hasNext|Iterator|StdIn|fileStatus|\bfs\w*\s*=|Files\.|ArrayBuffer|BufferedSource|\.close\(\)|\.flush|isOpen|pastEnd|openMode|Linage|linage/],
 ['runtime-call', /Cobol(Fmt|Codecs|Inspect|Unstring)\b|\bCobol[A-Z]\w+\.|ExitSectionSignal|CobolExit/],
 ['closure/recursive-linkage', /_=\(|\(v: [A-Za-z\[\]]+\) =>|getter|setter|Getter|Setter|\bdef \w+_=|\(\) => \w+,?\s*\(v|alias/i],
 ['control-flow', /\bif\b.*\bthen\b|\belse\b|\bmatch\b|boundary|break|\bwhile\b.*\bdo\b|\bfor\b.*\bdo\b|\btry\b|\bcatch\b|\bthrow\b|\bcase\b.*=>|\breturn\b|\bend\s+(if|while|match)/],
 ['declaration', /\b(object|case class|class|trait|enum|val|var|def|lazy val|type|import|package|private)\s|\bextends\b/],
 ['expression-numeric', /BigDecimal|\.setScale|RoundingMode|\.toBigInt|\.signum|\.abs|\.compare|\.bigDecimal|\.toLong|\.toInt|\.intValue|\.pow|\.longValue/],
 ['expression-string/vector', /\.substring|\.updated|Vector|\.padTo|\.take|\.drop|\.mkString|\.trim|\.length|\.charAt|\.toString|\.map|String|"\s*\*|\*\s*\d|\.apply|\.indexOf/],
];
const out = {}; let total={files:0,lines:0,code:0,comment:0,blank:0,sites:0}; const per={};
for (const f of files) {
  const src = fs.readFileSync(dir+f,'utf8').split('\n');
  let inBlock=false; const r={lines:src.length,code:0,comment:0,blank:0,sites:0,cat:{}};
  for (const raw of src) {
    const l = raw.trim();
    if (!l) {r.blank++;continue;}
    if (inBlock){r.comment++; if(l.includes('*/')) inBlock=false; continue;}
    if (l.startsWith('/*')){r.comment++; if(!l.includes('*/')) inBlock=true; continue;}
    if (l.startsWith('//')||l.startsWith('*')){r.comment++;continue;}
    r.code++;
    const strs = l.match(strRe)||[];
    // site: a string literal that holds Scala syntax
    if (strs.some(s=>s.length>2 && SCALA.test(s))) {
      r.sites++;
      let k = 'other';
      const joined = strs.join(' ');
      if (f==='cics-gen.js') k='cics';
      else if (f==='sql-gen.js') k='sql';
      else for (const [n,re] of cats) if (re.test(joined)) {k=n;break;}
      r.cat[k]=(r.cat[k]||0)+1;
    }
  }
  per[f]=r;
}
console.log(JSON.stringify(per,null,1));
const tot={}; let s=0,c=0,cm=0,b=0,L=0;
for (const r of Object.values(per)){s+=r.sites;c+=r.code;cm+=r.comment;b+=r.blank;L+=r.lines;for(const [k,v] of Object.entries(r.cat)) tot[k]=(tot[k]||0)+v;}
console.log({L,c,cm,b,s,tot});
```

## Appendix B: Golden-snapshot feasibility script (reproduces the 1.0 s / 0-diff measurement)

```js
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { convertToScala } from '/home/user/cobol-to-scala/Thyraa-COBOL-main/backend/packages/cobol-to-scala/index.js';
const root='/home/user/cobol-to-scala/Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/corpus';
const files=[];(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())w(p);else if(p.endsWith('.cbl'))files.push(p)}})(root);
files.sort(); if(process.argv[2]==='rev') files.reverse();
const t=Date.now(); const h={}; let err=0, bytes=0;
for(const f of files){ try{const r=convertToScala(fs.readFileSync(f,'utf8'),{}); const o=typeof r==='string'?r:JSON.stringify(r); bytes+=o.length; h[f]=crypto.createHash('md5').update(o).digest('hex');}catch(e){err++;h[f]='ERR'} }
console.error(files.length,'files',err,'errors',(Date.now()-t)/1000+'s',bytes,'bytes');
fs.writeFileSync(process.argv[3],JSON.stringify(h));
```

Run `node snap.mjs fwd h1.json; node snap.mjs rev h2.json` and diff the JSON maps. In this task: 563 files, 0 errors, 1.0 s each way, 0 differences. A production version would commit the hash map (~60 KB) under `tests/golden/` and print a unified diff on failure by re-generating the previous revision.

## Appendix C: Other reproducible commands

```bash
cd Thyraa-COBOL-main/backend/packages/cobol-to-scala
wc -l generator/*.js parser/*.js runtime/*                        # sizes
grep -c scalaType generator/*.js                                  # leak per file
grep -n "^let " generator/*.js                                    # module-level registries
grep -ohE "\bCobol[A-Z][A-Za-z]*\.[a-zA-Z]+" generator/*.js | sort | uniq -c | sort -rn   # runtime helper surface
grep -ohE "(java|scala)\.[a-z]+\.[A-Za-z]+(\.[A-Za-z]+)?" generator/*.js | sort | uniq -c | sort -rn  # stdlib surface
grep -rln "CobolSequentialFile\|DbAdapter\|CobolMath\|FixedString" generator tests   # empty: runtime files unused
git log --oneline -- generator/expression-gen.js | wc -l          # churn (44)
git ls-files tests/corpus | grep "\.cbl$" | wc -l                  # 563 tracked corpus programs
```
