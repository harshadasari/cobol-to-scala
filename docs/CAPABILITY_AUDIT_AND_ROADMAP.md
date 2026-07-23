# Codebase Capability Audit & Full-COBOL Coverage Roadmap

**Date:** 2026-07-11 (original audit) — **truth-passed 2026-07-23** after the campaign ran to round 40
**Companion docs:** `MARKET_ANALYSIS_COBOL_MODERNIZATION.md` (why), `ENTERPRISE_READINESS_GAP_ANALYSIS.md` (platform gaps)

> **Status note (2026-07-23, current):** the autonomous adversarial-verification campaign this document originally described as "paused at round 14" was resumed and run all the way to **round 40** (the owner's own target). Across rounds 15–40 (26 further rounds), the campaign fixed **131 additional dishonest findings** (241 total since round 1) and grew the oracle-verified corpus from 209 to **574 programs** (563 `.cbl` + 11 deliberately-excluded `.cbl.txt` probes whose own correct behavior is a nonzero cobc exit/compile rejection). The whole-suite automated test count grew from 879 to **~2,017** (898 unit + 1,119 oracle-harness tests), with **0 failures** and **45 honest, visibly-marked `t.todo()` work-queue entries** at the round-40 commit — every one individually traced to a specific, named, still-open gap (see §1.3 and the Verification record below), never a silent pass.
>
> The campaign's own 0–2-findings-for-two-consecutive-rounds convergence bar was **met once, briefly, at rounds 36–37** (2 findings, then 0) — the first time since resuming at round 15. Rounds 38–40 then deliberately broadened the search from "pressure-test only the immediately preceding round" into cross-round feature combinations and previously-untouched territory, and immediately found real bugs again at an *increasing* rate (6, then 7, then 8 findings in the final three rounds) — including two entirely unimplemented statements (`REPLACE`, `PROGRAM-ID ... INITIAL`) discovered 39-40 rounds in. Read this as the broadened strategy working as intended, not as quality regressing: the narrow, easy-to-find bugs were genuinely exhausted by round 37; widening the search surface kept finding real ones. **This means "40 rounds, 0–2 recently" should NOT be read as "adversarially exhausted"** — it is read the same way round 14's own status note read 14 rounds: strong evidence for the specific ~574-program corpus, not a claim that arbitrary new COBOL won't surface more.
>
> See `docs/ADVERSARIAL_ROUNDS_REPORT.md` for the full 40-round campaign report and `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md` for the complete, round-by-round finding→fix→program ledger for all 40 rounds (very long; ~2,300+ lines). The numbers and gap statuses throughout the rest of this document have been updated to match the round-40 state, including one internal-consistency correction made during this truth-pass (see the ledger's own round-39/40 "reconciliation note" entries) and a corpus-count correction (a small cumulative drift in the running tally across many rounds' incremental arithmetic — 574 is the verified, actual on-disk count, not a number carried forward from any single round's own commit message).

This document answers two questions precisely:
1. **What does this codebase actually do today?** (audited at source level, statement by statement)
2. **What would "not missing any aspect of COBOL" actually require?** (a staged plan grounded in what real mainframe estates contain)

---

## Part 1 — What the App Actually Is

Two loosely-coupled products live in this repo:

**A. Analysis platform** (`Thyraa-COBOL-main/` frontend + backend): point it at a GitHub repo, it inventories COBOL programs/copybooks/JCL, builds a dependency graph, and renders dashboards. Uses Redis/Bull job queue, worker pool, React+Monaco frontend. Its COBOL "parsing" (`packages/cobol-analysis/parsers/cobol.parser.js`, 116 lines) is regex-level: it finds `PROGRAM-ID`, `CALL`, `COPY` references for graphing — it does not understand the language.

**B. Conversion engine** (`packages/cobol-to-scala/`, ~9,500 lines): a real lexer → parser → AST → Scala-generator pipeline. This is the product's technical heart and the subject of this audit.

### 1.1 What the conversion engine handles (verified in source)

**Lexer** (`parser/lexer.js`): fixed & free format detection, sequence/indicator columns, continuation lines, comments, string/hex literals, digit-leading paragraph names, and (since 2026-07-11) PIC-aware tokenization of picture strings.

**Data Division** (`data-division-parser.js`): WORKING-STORAGE / FILE / LINKAGE / LOCAL-STORAGE sections, level numbers 01–49/66/77/88, PIC clauses (9 X A S V P Z * + - $ , . B 0 / CR DB with (n) repetition), USAGE (DISPLAY, COMP through COMP-5, BINARY, PACKED-DECIMAL, INDEX, POINTER), OCCURS (fixed + DEPENDING ON + INDEXED BY + KEY), REDEFINES, RENAMES (66), VALUE, SIGN, SYNC, JUSTIFIED, BLANK WHEN ZERO, FILLER, FD entries. Standalone copybook fragments (no DATA DIVISION header) parse as of 2026-07-11.

**Procedure Division** (`procedure-parser.js`) — statement types, all of which are now **oracle-equivalent** (see the Verification record below), not merely parsed:

| Category | Statements |
|---|---|
| Control flow | PERFORM (inline/thru/times/until/varying), IF/ELSE, EVALUATE (incl. TRUE/FALSE/ANY/ranges/NOT/arithmetic-expression subjects), GO TO (incl. DEPENDING ON), CONTINUE, NEXT SENTENCE, EXIT, STOP RUN, GOBACK |
| Data movement | MOVE (multi-target, figurative constants, CORRESPONDING), INITIALIZE, SET (incl. `SET condition-name TO TRUE`) |
| Arithmetic | COMPUTE (with precedence & **, ROUNDED), ADD/SUBTRACT (incl. CORRESPONDING), MULTIPLY, DIVIDE (INTO/GIVING/REMAINDER) |
| String handling | STRING, UNSTRING (incl. COUNT IN), INSPECT (tallying/replacing/converting, incl. correct multi-clause REPLACING snapshot semantics — round 14) |
| Table handling | SEARCH, SEARCH ALL (real binary search), incl. VARYING other-index and composite/multi-key tie-breaking |
| Batch/sort | SORT (multi-key, mixed ASCENDING/DESCENDING, `THRU` ranges, `DUPLICATES IN ORDER`) via INPUT/OUTPUT PROCEDURE, RELEASE, RETURN — the whole-file `SORT ... USING <file> GIVING <file>` form (no procedure) is still not implemented (visible TODO marker; see §1.3 — round 40's completeness audit flagged this as newly tractable, since round 18's own MERGE implementation built almost exactly the machinery SORT's USING/GIVING form would need). MERGE `... USING file1 file2 ... OUTPUT PROCEDURE` (multi-key, mixed ASCENDING/DESCENDING) is genuinely implemented and oracle-verified since round 18. MERGE's own `GIVING` form (no OUTPUT PROCEDURE) remains an unimplemented visible TODO, same as SORT's |
| File I/O | OPEN, CLOSE, READ, WRITE for LINE SEQUENTIAL files are oracle-equivalent since round 5. **RELATIVE-organization file I/O underwent a full architectural rewrite in round 29** (the single most serious finding of the whole 40-round campaign): the original line-delimited-text storage model silently corrupted any binary field whose bytes happened to contain `0x0A`, so it was replaced with a real fixed-width raw-byte-chunk model (`generator/file-io-gen.js`'s `fixedWidthLoadLines`) that all the file-I/O work below now builds on. On top of that model: real RELATIVE KEY random access, START (round 26), REWRITE/DELETE (rounds 25, 27, generalized), OPEN I-O read-iterator initialization (round 25), and LINAGE (page-size line counting, `WITH FOOTING AT`, `AT END-OF-PAGE`/`NOT AT END-OF-PAGE` — rounds 32-34, with the `FOOTING AT` threshold formula itself needing a further correction in round 34 after round 33's own regression test happened to mask the bug) are all real, oracle-verified implementations, not stubs. **FILE STATUS lifecycle tracking** was added incrementally across rounds 38-40: OPEN/CLOSE/READ (round 38) then WRITE/REWRITE/DELETE/START (rounds 39-40) all now correctly report status codes 41/46/47/48/49 for closed-file and wrong-access-mode conditions instead of crashing or silently misreporting, and the registered DECLARATIVES error handler is correctly invoked on these paths (round 40). `ORGANIZATION IS INDEXED` (VSAM-style keyed) files remain genuinely unimplemented, and — unlike every other gap in this document — **cannot be oracle-verified at all in this project's own sandbox**, since the installed GnuCOBOL build has indexed-file support compiled out entirely (round 27) |
| Intrinsics | Full FUNCTION set exercised by the corpus: NUMVAL/NUMVAL-C, LENGTH (incl. of a GROUP), MAX/MIN, MOD, date functions, REVERSE, ORD/CHR, and others — see `tests/oracle/README.md` for the exact list a given run has verified. FUNCTION arguments that are themselves full arithmetic expressions (not just bare operands) — including nested FUNCTION calls, parenthesized sub-expressions, and `**`/unary-minus — are correctly parsed since round 36 (a parser gap silently truncated and corrupted the surrounding statement's parse before this) |
| RECURSIVE programs | A substantial capability area built almost entirely across rounds 20-40, not present at round 14: a `PROGRAM-ID ... RECURSIVE` program gets real per-call-activation LINKAGE-parameter aliasing (getter/setter closures nesting every reachable paragraph as a local `def` inside `entry()`), correct BY REFERENCE vs BY CONTENT/VALUE writeback semantics (including for subscripted and GROUP-shaped operands, and for multiple/interleaved call sites to the same or different RECURSIVE targets — rounds 35-40), and `scala.util.boundary`/`break()`-based early-exit handling for EXIT-family statements that would otherwise cascade too far through the nested-`def` structure. A **non-RECURSIVE** program illegally calling itself indirectly (a cycle through 2+ other programs, or back through the top-level "main" program) is correctly detected and aborted to match cobc's own runtime abend, rather than silently completing (rounds 39-40) |
| Interop | CALL (BY REFERENCE/CONTENT/VALUE), incl. full same-file multi-`PROGRAM-ID` interop (round 7) and the RECURSIVE-program semantics above — a genuinely external or dynamic-name subprogram not defined in the same source emits a visible TODO marker rather than converting; CALL with more actual arguments than the callee declares is correctly ignored (matching cobc) rather than a Scala compile error (round 40); EXEC SQL (parsed + compile-verified Doobie generation, not yet wired into the main generator — see Phase 3), EXEC CICS (parsed + classified; skeleton generation only — see Phase 4) |
| Terminal | ACCEPT (incl. FROM DATE/DATE YYYYMMDD/DAY/DAY-OF-WEEK special registers, round 39), DISPLAY |
| Conditions | relational (all operator spellings), class tests (NUMERIC/ALPHABETIC…), sign tests, level-88 condition names (incl. `SET` of multiple condition-names to TRUE in one statement), AND/OR/NOT compounds |
| Source preprocessing | `REPLACE` (standalone source pseudo-text substitution, distinct from COPY REPLACING) was entirely unimplemented through round 39 — silently corrupting any PIC/VALUE clause that referenced a pseudo-text marker, with zero visible error. Implemented for real in round 40 by reusing the existing COPY REPLACING pseudo-text machinery |
| Program initialization | `PROGRAM-ID ... INITIAL` was entirely unmodeled through round 39 — WORKING-STORAGE silently persisted across calls instead of resetting to VALUE-clause defaults every activation, the opposite of what INITIAL means. Implemented for real in round 40, mirroring the existing RECURSIVE-program detection pattern |

**SQL** (`sql-parser.js` + `generator/sql-gen.js`): extracts EXEC SQL blocks, classifies statement type and host variables, and — as of Phase 3 — generates typed Doobie source fragments compile-verified against the real `doobie-core` dependency. Not yet spliced into the main generator's own output (Phase 3, OPEN).

**Generator** (`generator/`): Scala 3 case classes with byte-accurate `recordLength`/`parse`/`format` companions backed by real byte-level codecs (packed decimal, binary, zoned decimal, EBCDIC cp037), level-88 → enum generation, paragraphs → methods (including a CFG-aware PERFORM-THRU scheme — see Phase 2), expression/condition translation, file-I/O abstractions, an embeddable runtime library of Scala helpers, Doobie SQL fragments, and an honest CICS/BMS service-skeleton generator.

### 1.2 What was broken until today (and is now fixed)

The user's instinct that the app "did one small thing and didn't think through the rest" was directionally right — but the deeper truth found in this audit: **the pipeline was architecturally complete and functionally broken at its foundation**. Five root-cause defects meant that essentially *no real COBOL program converted correctly*:

1. **`PIC 9(6)` destroyed the parse.** The lexer emitted `9` as a bare token; the parser mistook it for a level number, creating phantom FILLER children on every elementary field and losing every PIC pattern. *Fixed: PIC-aware lexing (`PICTURE_STRING` token).*
2. **`recordLength: Int = 0` everywhere.** Generators read `item.picture` (string) while the parser produced `item.pic` (object); every length computed as zero. *Fixed: shared `generator/layout.js`, byte counts hand-verified (e.g., `S9(13)V99 COMP-3` → 8 bytes).*
3. **`[object Object]` in output.** Expression/condition converters matched node type names that the parser never emitted, so everything fell to `String(node)`. *Fixed: real AST shapes handled; unknown constructs emit visible `??? /* TODO */` markers.*
4. **COMP-3 never detected** (`COMP-3` token didn't match the `checkValue('COMP')` test), so packed-decimal money fields got display lengths. *Fixed.*
5. **COPY statements were inventoried but never expanded** — meaning any program that keeps its record layouts in copybooks (i.e., virtually all production COBOL) parsed without its data. *Fixed: `parser/copybook-resolver.js` (OF/IN, REPLACING pseudo-text & word, nested, cycle-safe), wired through `options.copybooks`.*

Also fixed en route: duplicate `filler` parameters (generated Scala didn't compile), REDEFINES double-counting storage, `Vector[Int].parse` (invalid Scala) for elementary OCCURS tables, COMPUTE dropping its assignment target, implied-decimal rescaling on parse/format, and the test suite itself (was `console.log("PASSED")` regardless of result → now 26 assertion-based `node:test` cases, all passing).

### 1.3 What it still does not handle (OPEN items, honestly)

This table was fully re-audited at round 40 (2026-07-23) by an independent
completeness-critic pass over all 40 rounds' own "Known gaps" entries in
`tests/oracle/README.md` (lines ~2239 onward there), not just carried
forward from the round-14 version. Ordered roughly by real-world risk to
someone converting production COBOL, highest first:

| Gap | Status | Real-world weight |
|---|---|---|
| **Reference modification (`identifier(start:length)`)** | **OPEN, and the single largest remaining risk in the whole engine** — both READ and WRITE degrade to a visible, compiling `???`/placeholder almost everywhere (a handful of narrow carve-outs exist: literal-length `FUNCTION LENGTH`, STRING's own segment source, a few crash-safety substitutions that make surrounding code compile but stay wrong). A program that ref-mods a field and uses the *actual substring text or number* gets a placeholder, not the right answer, and not a crash either — since ref-mod is extremely common in production COBOL (date/key parsing, fixed-width record slicing), this is the top item to check for before trusting a converted program's output | **Highest** — silent-wrong-output on a common, everyday construct |
| `ORGANIZATION IS INDEXED` files (VSAM-style keyed access) | **OPEN**, and structurally different from every other gap here: this project's own installed GnuCOBOL build has indexed-file support compiled out, so this gap **cannot be oracle-verified in this sandbox even if implemented** (round 27) | High — indexed/VSAM files are extremely common on real mainframes |
| GO TO / PERFORM permanently escaping an active `PERFORM ... THRU` range (or a SORT/MERGE PROCEDURE clause) | **OPEN** — deliberately not attempted; the escape is now visibly TODO-commented in generated Scala (round 19), but the generated program's actual *output* still silently resumes normally instead of reproducing cobc's true non-local jump. (Note: an explicitly *qualified* `PERFORM x OF/IN section`, including THRU, is fully supported since rounds 12/14 — this row is only about a jump that abandons an active THRU range entirely, not ordinary qualified PERFORM/GO TO) | Medium/legacy — a known-hard COBOL problem everywhere, not just here |
| `CALL BY REFERENCE`/`CONTENT` of a GROUP containing an OCCURS table, into an **ordinary (non-recursive)** subprogram | **OPEN** — compiles and runs with no crash, but the callee silently sees a default/empty table instead of the caller's real data, with only a source-comment marker, not a runtime signal. (The identical shape into a RECURSIVE callee has real, working per-leaf aliasing since rounds 22/39 — round 40's completeness audit flagged this as a good candidate to extend to the non-recursive path next, since the exact machinery it would reuse, `flattenGroupLeaves`, already exists) | Medium-High |
| `UNSTRING` with a variable/data-name `DELIMITED BY` operand | **OPEN** — the whole UNSTRING statement no-ops (every INTO target stays blank) whenever the delimiter isn't a compile-time-foldable literal. STRING's own `DELIMITED BY` has no such restriction (resolves at runtime), an asymmetry discovered in round 36 that could easily surprise someone since the two statements look symmetric | Medium |
| `SORT ... USING <file> GIVING <file>` (no procedure) | **OPEN** — same for MERGE's own GIVING form. Flagged by round 40's completeness audit as a good next target: round 18's own MERGE-with-OUTPUT-PROCEDURE implementation built almost exactly the machinery this would need (open each USING file, drain into the shared SD buffer, reuse the existing stable-sort helper, write out) | Medium |
| ALTER | **OPEN** — parses cleanly (a round-29 fix resolved a parse-corruption bug), but its actual retargeting effect on a GO TO is a complete no-op | Low/legacy (rare, deprecated in modern COBOL) |
| REDEFINES of a group-with-OCCURS by another group-with-OCCURS | **OPEN**, still a byte-level stub (round 13) — compiles and runs real SEARCH ALL code against the redefining table, but each element throws `NotImplementedError` at runtime if actually read. Round 40's completeness audit flagged this as more tractable now than in round 13, since rounds 16-17 built real byte-accurate REDEFINES flatteners that could plausibly be reused | Low-Medium (narrow shape) |
| OCCURS DEPENDING ON dynamic `parse`/`format` | **OPEN** — sized at a fixed max for round-trip stability; live counter field not honored; every occurrence carries a `// TODO(ODO)` marker (`generator/case-class-gen.js`) | High in principle, but no corpus program has yet hit a case this doesn't already visibly flag |
| EXEC CICS behavioral conversion | **OPEN** — classified and turned into an honest `???`-bodied service skeleton (Phase 4), not a working translation | High for online systems |
| EXEC SQL wired into the main generator | **OPEN** — Doobie generation exists and is compile-verified in isolation (`generator/sql-gen.js`) but is not yet spliced into `generator/scala-generator.js`'s own output path | High |
| Non-error-procedure `USE` declaratives (`USE FOR DEBUGGING`, `USE BEFORE REPORTING`) | **OPEN** — parse and compile cleanly but are never invoked from anywhere | Low-Medium |
| EBCDIC for numeric (zoned/packed) fields, generator-integration-verified | **Partial/OPEN** — the codec itself is compiler- and unit-test-verified; no generated-class round-trip test combines `charset: 'ebcdic'` with a numeric field the way `tests/roundtrip.test.js` does for strings | Medium — real mainframe numeric data is usually COMP-3, which is charset-independent (packed BCD), so the practical exposure is mainly zoned/DISPLAY-numeric EBCDIC data |
| JCL flow diagrams / sbt-pipeline skeletons | **OPEN** — dataset lineage exists as structured JSON (`buildDatasetFlow()`); no rendered diagrams (Mermaid/Graphviz/etc.) and no sbt/pipeline scaffolding are generated from it | Phase-dependent |
| IMS DL/I | **OPEN** — not handled | Phase-dependent |
| Report Writer, Screen Section, OO-COBOL | **Deliberately out of scope** — see Part 2 | Low (rare in the wild) |
| COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE truncation semantics without ROUNDED | **DONE (round-3 fix, extended round 38)** — `generator/expression-gen.js`'s `storeNumericExpr`/`storeNumericByInfo` apply COBOL's real store-time semantics on every arithmetic statement (ROUNDED → HALF_UP; absent → truncate toward zero). **Round 38 further fixed a genuine bug in the multi-target case**: a statement with 2+ GIVING targets and mixed overflow (one target overflows, another doesn't) previously used an all-or-nothing store model, suppressing ALL targets' stores on ANY single target's overflow — real COBOL evaluates and stores each target's own overflow independently. Now correct for 1, 2, or more targets across COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE alike | Medium/High — silently wrong money math is exactly the class of bug byte-level verification exists to catch |
| This document's own accuracy | **Was itself caught being wrong once** — round 18 found this document had previously (falsely) claimed MERGE was "already oracle-equivalent alongside SORT" when no `MergeStatement` codegen case existed at all before that round. A concrete reminder that a roadmap document's own "done" claims need the same adversarial scrutiny as the code, which is exactly why this truth-pass exists | n/a |

---

## Part 2 — The Plan: "Don't Miss Any Aspect of COBOL"

### 2.0 Strategic reframe (from the market analysis)

The winning product is **not** "a converter." It is an engine that (a) *understands* a COBOL estate completely — every file type — and (b) *proves* its conversions are right. Translation is commoditizing (LLMs); byte-accurate layout truth and behavioral equivalence are not. Every phase below therefore pairs coverage with verification.

### What a real mainframe estate contains (the file-type map)

| Artifact | Extension(s) | Role | Engine status |
|---|---|---|---|
| Programs | .cbl .cob .ccp | Batch & online logic | Parsed + oracle-equivalent for 30 statement types (see 1.1) |
| Copybooks | .cpy .cop | Shared record layouts | Expanded + standalone parse |
| JCL | .jcl .proc | Job orchestration | Structural parse: steps, DD, PROC expansion, referbacks, dataset lineage JSON. **OPEN:** flow diagrams, sbt/pipeline skeletons |
| BMS maps | .bms | 3270 screen definitions | Parsed; layout drives CICS skeleton DTOs (Phase 4) |
| DCLGEN | .dclgen | DB2 table ↔ copybook bindings | Parsed; feeds SQL host-variable typing |
| SQL/DDL | .sql .ddl | Schemas | EXEC SQL parsed + compile-verified Doobie generation (standalone, **OPEN:** not wired into main generator). Standalone `.sql`/`.ddl` files: not handled |
| VSAM definitions | IDCAMS | Keyed datasets | Inferred from SELECT only |
| IMS PSB/DBD | .psb .dbd | Hierarchical DB | Not handled (**OPEN**) |
| Parm/control cards, sort cards | misc | Batch config | Not handled |
| Data files | EBCDIC fixed-length | The actual records | Byte-level codecs (packed/binary/zoned/EBCDIC cp037) compiler-verified; ODO fields fixed-max only (**OPEN**) |

### Phase 1 — Data-layer truth: DONE for fixed-length records, ODO honestly open

PIC lexing, byte-accurate lengths, COMP/COMP-3/binary/zoned-decimal sizing and
byte-level codecs, copybook expansion, standalone copybooks, REDEFINES-safe
lengths, and REDEFINES as lazy accessor views are all built and
**oracle-verified**: 19 `tests/corpus/data/` programs (7 baseline + 12
adversarial-refutation programs, promoted in after round 1 found 11/12
diverging and every finding was fixed) produce byte-identical stdout to real
`cobc`. EBCDIC (cp037) is exercised end-to-end for PIC X/A string fields and
DISPLAY-numeric fields through `options.charset: 'ebcdic'`; for COMP-3/binary
numeric fields EBCDIC is verified at the codec level, not through a
generated-class round trip (packed decimal is charset-independent BCD, so
this is a narrower gap than it sounds, but it is real — see 1.3). One narrow
REDEFINES shape remains a stub rather than a true view: REDEFINES of a
group-with-OCCURS by another group-with-OCCURS (round 13) compiles and runs
real `SEARCH ALL` code against the redefining table, but each elementary
child is an honest `???` stub that throws at runtime if actually read — see
`tests/oracle/README.md`'s Known Gaps.

**Still OPEN:**
1. OCCURS DEPENDING ON: `parse`/`format` are sized at a fixed maximum, not
   the live counter field, for round-trip stability. Every occurrence
   carries a `// TODO(ODO)` marker in generated output — never a silent
   guess. Dynamic-length handling is not implemented.
2. COMP-1/COMP-2 (Float/Double) byte-level codecs — still display-string
   placeholder logic, explicitly out of this phase's scope so far.
3. **Verification deliverable, done:** `tests/roundtrip.test.js` runs
   `format(parse(bytes)) == bytes` property tests against synthesized
   datasets for every codec `case-class-gen.js` dispatches, via real
   `scala-cli` execution (not just JS-side self-consistency).

### Phase 2 — Batch-complete procedure coverage: DONE for the corpus scope, GO TO scoped by design

SEARCH/SEARCH ALL (real binary search), SORT/MERGE/RELEASE/RETURN,
MOVE/ADD CORRESPONDING, GO TO DEPENDING ON, the intrinsic function set the
corpus exercises, STRING/UNSTRING/INSPECT, DECLARATIVES (incl. reentrancy
and cross-conversion state isolation), and EVALUATE (incl. arithmetic
and full-condition subjects) are all built and **oracle-verified**: 190
`tests/corpus/proc/` programs (9 baseline plus 13 further rounds of
adversarial-refutation programs, rounds 2–14) produce byte-identical stdout
to real `cobc`. Round 2 alone (20 probe programs) found 14 root-cause
silent-divergence gaps (NUMVAL crashing on internal whitespace,
`SET condition-name TO TRUE`, EVALUATE expression-subject collapse, recursive
PERFORM naming, `WITH TEST AFTER` emitting invalid Scala 3, duplicate nested
group name collisions, `LENGTH` of a GROUP, `MAX`/`MIN` on `BigDecimal`,
`SEARCH ... VARYING`, index-name `DISPLAY` format, multi-key mixed-direction
`SORT`, `RELEASE`/`RETURN` name-vs-position matching, `UNSTRING ... COUNT IN`)
— every one is fixed, and the refuting programs are permanently in the corpus
so none can silently regress. Rounds 3–14 continued the same discipline
against SECTION organization, CALL/interop, DECLARATIVES, file I/O byte
models, and more — 110 dishonest findings fixed across all 14 rounds in
total. See `tests/oracle/README.md`'s finding table for the full finding →
fix → program mapping, and `docs/ADVERSARIAL_ROUNDS_REPORT.md` for the full
campaign narrative and impact analysis.

**Rounds 15–40 (resumed campaign) continued the identical discipline** and
found 131 further dishonest findings (241 total across all 40 rounds),
built almost the entire RECURSIVE-program capability area described in
§1.1 from scratch, rewrote RELATIVE file I/O's storage model after finding
it silently corrupted binary data (round 29 — the single most serious
finding of the whole campaign), added real LINAGE and FILE STATUS lifecycle
support, and implemented two previously-entirely-unimplemented statements
(`REPLACE`, `PROGRAM-ID ... INITIAL`) as late as round 40. One genuine
regression was introduced and caught mid-campaign (round 35's first attempt
at a RECURSIVE BY CONTENT fix broke three previously-passing RECURSIVE
programs; caught by independent full-suite verification before the commit
that would have shipped it, and corrected in the same round) — see
`tests/oracle/README.md`'s round-35 entry for the full account. See that
same file's round-15-through-40 entries for the complete finding → fix →
program mapping this paragraph summarizes.

**Paragraph control flow, done honestly rather than completely:** the
generator builds a CFG-aware scheme scoped specifically to PERFORM-THRU
ranges — every paragraph inside a `PERFORM x THRU y` becomes a nested local
`def` inside that wrapper method, so GO TO to a sibling paragraph in the same
range resolves by ordinary lexical scoping and natural fallthrough across
paragraph boundaries is reproduced (`generator/method-gen.js#generatePerformThruMethod`).
Since round 12, and extended to the THRU form in round 14, an explicitly
**qualified** `PERFORM x OF/IN section` — including `PERFORM x OF secA THRU
y OF secB` — resolves correctly across section boundaries via the same
collision-aware resolver used to *declare* a qualified method; only a bare,
**unqualified** reference to a paragraph name that is ambiguous across
sections remains unaddressed (and such a reference is already invalid COBOL
without qualification, so no corpus program is affected either way).
**General inter-paragraph GO TO — an arbitrary paragraph-to-paragraph GO TO
web outside any THRU range — was not attempted.** Each paragraph is still
also generated as an independent top-level method (for the plain, non-THRU
`PERFORM x` case), and that path does not resolve arbitrary GO TO webs
between top-level paragraphs. This is a real, disclosed scope boundary, not
an oversight: irreducible GO TO webs are a genuinely hard translation
problem in every COBOL modernization tool, and the PERFORM-THRU scheme
covers the overwhelmingly common structured-COBOL shape (GO TO used only for
local flow control within a THRU-delimited paragraph range) without
overclaiming the general case.

**Verification deliverable, done:** the same `oracleCompare()` data-driven
pattern used for Phase 1 (synthesize/author a program, run real `cobc`, run
the generated Scala, diff stdout) is applied to every `tests/corpus/proc/`
program, plus the adversarial-refutation pass described above.

### Phase 3 — The database layer: DB2 done for the parser/generator pieces, JCL structurally done, wiring OPEN

1. **DCLGEN ingestion:** done. `parser/dclgen-parser.js` ties SQL host
   variables to copybook fields; feeds SQL host-variable typing.
2. **EXEC SQL → typed Doobie:** done as a standalone, compile-verified
   generator. `generator/sql-gen.js` covers SELECT INTO/INSERT/UPDATE/
   DELETE/cursors-as-materialized-streams/SQLCODE 100/WHENEVER/indicator
   variables as `Option` guards, compile-checked against the real
   `doobie-core:1.0.0-RC5` dependency resolved from Maven Central (not a
   hand-written fixture pretending to be Doobie). **OPEN:** it is not yet
   spliced into `generator/scala-generator.js`'s main generation path — see
   the "Wire-in TODO" in `generator/sql-gen.js`'s own header. Any
   `EXEC SQL` statement kind the generator doesn't recognize gets an honest
   `// TODO(sql-gen): <KIND> not translated` comment carrying the original
   SQL, never a silent drop.
3. **JCL real parser:** done for structure. `parser/jcl-parser.js` parses
   steps, DD statements, PROC expansion, and referbacks, and
   `buildDatasetFlow()` derives a per-dataset read/write lineage JSON graph
   from it (verified against 3 corpus job streams). **OPEN:** per-job
   rendered flow *diagrams* (Mermaid/Graphviz or similar) and sbt/pipeline
   skeletons generated from that lineage do not exist yet — only the
   structured JSON does.

### Phase 4 — Online systems: CICS classifier + BMS parser + honest skeleton generator, NOT a behavioral converter

`parser/cics-parser.js` classifies EXEC CICS commands (SEND/RECEIVE MAP,
READ/WRITE, LINK/XCTL, COMMAREA, HANDLE CONDITION, ABEND, ASSIGN, GETMAIN/
FREEMAIN, START/RETRIEVE, SYNCPOINT, transient-data/temp-storage queue ops,
and more) and `parser/bms-parser.js` parses BMS 3270 screen-map definitions
into symbolic layouts. `generator/cics-gen.js` turns these into a Scala 3
service-endpoint *skeleton*: request/response DTOs for SEND/RECEIVE MAP pairs
(using the real BMS layout when available), abstract repository traits for
file operations actually used, and call stubs for LINK/XCTL targets.

**This is explicitly not a behavioral converter.** Every generated method
whose body could plausibly be mistaken for a real translation is exactly
`???`, immediately preceded by a comment carrying the original `EXEC CICS`
command(s) — so nobody reading the output can mistake scaffolding for
working logic. Repository-interface members are left properly abstract
(no `= ???`) rather than faked. `RETURN`/pseudo-conversational continuation
is documented as a state-machine design decision for a human, never
code-generated. Every CICS command the parser saw but didn't turn into a
method is still surfaced as a comment in an "other CICS commands observed"
inventory — never silently dropped. Verified via a small CICS/BMS corpus
(2 programs + 1 BMS map) with compile-checked expected-skeleton assertions,
not against a real CICS runtime (there is no such oracle available in this
environment — see the Verification record below for what "verified" means
per phase).

### Deliberately out of scope (documented so nothing is "missed" silently)

Report Writer, Screen Section (console apps), OO-COBOL, Assembler subroutines, IMS DL/I — rare or specialist; the engine should *detect and report* them in analysis (coverage honesty) rather than mistranslate.

### Verification record

What "verified" means, precisely, as of round 40 (2026-07-23, after the full
resumed campaign — original round-14 detail in
`docs/ADVERSARIAL_ROUNDS_REPORT.md`; the complete round-15-through-40 ledger
is in `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md`):

- **574 oracle-gated corpus programs**: 563 `.cbl` files compile and run
  cleanly under real GnuCOBOL (`cobc`, exit 0), plus 11 deliberately-named
  `.cbl.txt` probes whose own CORRECT cobc behavior is a nonzero exit or a
  compile-time rejection (e.g. an illegal non-RECURSIVE self-call cycle, or
  a genuinely invalid PICTURE clause a probe intentionally exercises) —
  excluded by naming convention from the automated "every `*.cbl` must exit
  0" sweep for that reason, not because they're unverified; each is still
  independently confirmed correct via a direct `scala-cli run` comparison
  (see their own ledger entries). All 563 `.cbl` programs also pass
  `oracleCompare()` (generated Scala's stdout matches cobc's byte-for-byte)
  or are honestly registered as `t.todo()` with the exact, specific mismatch
  reason — **0 silent passes, 0 unexplained failures**.
- **40 adversarial refutation rounds total** (round-14 campaign resumed and
  run to completion): **241 dishonest findings fixed** across all 40 rounds
  (110 in rounds 1-14, 131 more in rounds 15-40). Round-by-round trend for
  rounds 15-40: 8, 6, 8, 8, 4, 2, 3, 4, 4, 5, 6, 8, 8, 4, 8, 4, 3, 5, 3, 2, 5,
  2, 0, 6, 7, 8. The campaign's own 0-2-for-two-consecutive-rounds
  convergence bar was met exactly once, at rounds 36-37, before rounds 38-40
  deliberately broadened the search strategy and immediately found real bugs
  again at an increasing rate — see the status note at the top of this
  document for why that's read as the strategy working, not quality
  regressing. Treat every claim in this document as "survived 40 rounds of
  adversarial refutation, with a real-compiler oracle, on a 574-program
  corpus," not "adversarially exhausted on arbitrary COBOL" — rounds 38-40
  alone found two entirely unimplemented statements that 37 prior rounds had
  never probed for, direct evidence that broadening the search surface
  further would very likely keep finding real gaps.
- **~2,017 automated tests** (898 unit + 1,119 oracle-harness tests), **0
  failing**, **45 honest `t.todo()` work-queue entries** — every single one
  individually named to a specific, documented, still-open gap in §1.3 above
  (never a silently-accepted or unexplained mismatch). Spans parser unit
  tests, codec property/parity tests, generator tests, the oracle harness,
  JCL/DCLGEN/SQL/CICS/BMS corpus tests, a dedicated state-isolation
  regression suite, and one focused regression-test file per round (40 of
  them, `tests/round<N>-fixes.test.js`) pinning every fixed finding against
  its own exact expected behavior.
- **What "verified" does not mean:** it does not mean every COBOL construct
  in the language works, only that the specific constructs in the
  574-program corpus (plus the units the codec/parser test files exercise
  directly) do, against a real compiler, as of round 40. It also does not
  mean adversarially exhausted — see the status note at the top of this
  document — and it does not mean IBM Enterprise COBOL-verified — the oracle
  throughout is GnuCOBOL, a different (though closely compatible)
  dialect/implementation, and at least one GnuCOBOL-build-specific quirk was
  itself discovered during the campaign (this sandbox's own installed cobc
  corrupts a bare numeric literal passed as a `CALL ... USING` argument to a
  blank value, rounds 39-40) — a reminder that "byte-matches this sandbox's
  cobc" is strong evidence, not an absolute ground truth independent of the
  specific compiler build used. See §1.3 above (fully re-audited at round
  40) for the complete, current list of every documented, visible
  degradation still open, ordered by real-world risk — reference
  modification's still-pervasive placeholder semantics is the single
  largest one.

### Cross-cutting engineering rules

1. **Coverage honesty:** every construct the engine sees but cannot convert must surface in the analysis report and as a `??? /* TODO */` marker in output — never silent garbage. (Started today with `safeNodeString`.)
2. **Dialect switches:** IBM Enterprise COBOL first; GnuCOBOL for test-oracle runs; flag extensions per dialect.
3. **Multi-target ready:** keep AST → emitter boundary clean; a Java emitter reuses ~95% of the pipeline and unlocks the mainstream buyer per the market analysis.
4. **Golden corpus:** done for the batch/data shapes — `tests/corpus/` now holds 574 oracle-gated programs (data/proc, after the full 40-round adversarial campaign) plus 5 SQL fixtures and JCL/DCLGEN/CICS/BMS fixtures, all compiler- or compile-verified, growing via adversarial refutation rather than hand-curation alone (see the Verification record above, `docs/ADVERSARIAL_ROUNDS_REPORT.md` for rounds 1-14, and `tests/oracle/README.md` for rounds 15-40). Real-world-shaped scenarios beyond what the corpus covers (e.g. a full VSAM maintenance job, a multi-cursor DB2 batch program, or genuinely new feature-intersection probes) remain a valid way to grow it further — round 40's own completeness audit identified reference modification, INDEXED files, and `CALL BY REFERENCE` of a GROUP+OCCURS into a non-recursive callee as the highest-value next targets (see §1.3). (Enterprise-platform items — auth, CI, Docker — are tracked in `ENTERPRISE_READINESS_GAP_ANALYSIS.md`.)

### The pitch that falls out of this plan

> "Point us at your repo. We inventory every program, copybook, and JCL job; we compute your record layouts to the byte; we convert your batch logic to Scala that round-trips your data files bit-for-bit — and we hand you the generated tests that prove it."

That sentence is buildable by a small team on this codebase, it is differentiated from every incumbent (none target Scala; none lead with proof), and each phase ships a standalone sellable artifact.
