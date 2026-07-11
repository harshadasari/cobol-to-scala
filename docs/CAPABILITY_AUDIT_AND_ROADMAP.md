# Codebase Capability Audit & Full-COBOL Coverage Roadmap

**Date:** 2026-07-11
**Companion docs:** `MARKET_ANALYSIS_COBOL_MODERNIZATION.md` (why), `ENTERPRISE_READINESS_GAP_ANALYSIS.md` (platform gaps)

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
| String handling | STRING, UNSTRING (incl. COUNT IN), INSPECT (tallying/replacing/converting) |
| Table handling | SEARCH, SEARCH ALL (real binary search), incl. VARYING other-index |
| Batch/sort | SORT (multi-key, mixed ASCENDING/DESCENDING), MERGE, RELEASE, RETURN |
| File I/O | OPEN, CLOSE, READ, WRITE for LINE SEQUENTIAL files are now oracle-equivalent (round-5 fix: `convertToScala()`'s own entry point never parsed the ENVIRONMENT DIVISION at all before this — FILE-CONTROL/SELECT...ASSIGN never reached the generator, so every OPEN/WRITE/READ silently referenced undeclared variables; see `tests/corpus/proc/s01-fileio-roundtrip.cbl`). REWRITE, DELETE, START, and any non-LINE-SEQUENTIAL organization (INDEXED, RELATIVE) remain unimplemented comment-only stubs |
| Intrinsics | Full FUNCTION set exercised by the corpus: NUMVAL/NUMVAL-C, LENGTH (incl. of a GROUP), MAX/MIN, date functions, REVERSE, ORD/CHR, and others — see `tests/oracle/README.md` for the exact list a given run has verified |
| Interop | CALL (BY REFERENCE/CONTENT/VALUE), EXEC SQL (parsed + compile-verified Doobie generation, not yet wired into the main generator — see Phase 3), EXEC CICS (parsed + classified; skeleton generation only — see Phase 4) |
| Terminal | ACCEPT, DISPLAY |
| Conditions | relational (all operator spellings), class tests (NUMERIC/ALPHABETIC…), sign tests, level-88 condition names, AND/OR/NOT compounds |

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

Everything in the previous version of this table (SEARCH/SEARCH ALL,
SORT/MERGE/RELEASE/RETURN, MOVE/ADD CORRESPONDING, GO TO DEPENDING ON,
COMP-3/COMP byte-level decode, intrinsic functions, REDEFINES-as-views,
JCL/DCLGEN structural parsing) has since been built and is now
oracle-verified — see the Verification record below and `tests/oracle/README.md`
for the exact, current pass counts. What is genuinely still open, as of this
writing:

| Gap | Status | Real-world weight |
|---|---|---|
| OCCURS DEPENDING ON dynamic `parse`/`format` | **OPEN** — sized at a fixed max for round-trip stability; live counter field not honored; every occurrence carries a `// TODO(ODO)` marker (`generator/case-class-gen.js`) | High — variable-length records are common in batch |
| General inter-paragraph GO TO (outside a PERFORM THRU range) | **OPEN** — deliberately not attempted; see Phase 2 below | Medium/legacy — arbitrary GO TO webs are a known-hard COBOL problem everywhere, not just here |
| ALTER | **OPEN** — not implemented | Low/legacy (rare, and deprecated in modern COBOL) |
| EXEC CICS behavioral conversion | **OPEN** — classified and turned into an honest `???`-bodied service skeleton (Phase 4), not a working translation | High for online systems |
| EXEC SQL wired into the main generator | **OPEN** — Doobie generation exists and is compile-verified in isolation (`generator/sql-gen.js`) but is not yet spliced into `generator/scala-generator.js`'s own output path | High |
| EBCDIC for numeric (zoned/packed) fields, generator-integration-verified | **Partial/OPEN** — the codec itself is compiler- and unit-test-verified; no generated-class round-trip test combines `charset: 'ebcdic'` with a numeric field the way `tests/roundtrip.test.js` does for strings | Medium — real mainframe numeric data is usually COMP-3, which is charset-independent (packed BCD), so the practical exposure is mainly zoned/DISPLAY-numeric EBCDIC data |
| JCL flow diagrams / sbt-pipeline skeletons | **OPEN** — dataset lineage exists as structured JSON (`buildDatasetFlow()`); no rendered diagrams (Mermaid/Graphviz/etc.) and no sbt/pipeline scaffolding are generated from it | Phase-dependent |
| IMS DL/I | **OPEN** — not handled | Phase-dependent |
| Report Writer, Screen Section, OO-COBOL | **Deliberately out of scope** — see Part 2 | Low (rare in the wild) |
| COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE truncation semantics without ROUNDED | **DONE (round-3 fix)** — `generator/expression-gen.js`'s `storeNumericExpr`/`storeNumericByInfo` now apply COBOL's real store-time semantics on *every* arithmetic statement: `ROUNDED` present → `CobolFmt.roundNumeric` (HALF_UP to the target's declared decimal digits); absent → `CobolFmt.truncNumeric` (truncate toward zero) — either way followed by the same high-order integer-digit truncation MOVE already applied. Re-verified directly against `cobc`: `COMPUTE X = 2.345` into a 2-decimal target with no ROUNDED now stores `2.34` (matches real GnuCOBOL), not `2.35`. Covered by a dedicated corpus program with a truncation-vs-rounding-discriminating final digit (`tests/corpus/proc/n16-unrounded-truncation.cbl` — 2.345/2.344/-2.345 into 2-decimal targets, plus a 0-decimal target), oracle-verified end-to-end, plus focused unit tests (`tests/round3-fixes.test.js`) — see `tests/oracle/README.md`'s round-3 findings table (finding 13) and known-gaps section. | Medium/High — silently wrong money math is exactly the class of bug byte-level verification exists to catch; this is now closed for every arithmetic statement type (COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE, including multi-target GIVING and CORRESPONDING), not just the one discriminating case that first surfaced it |

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
this is a narrower gap than it sounds, but it is real — see 1.3).

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
corpus exercises, STRING/UNSTRING/INSPECT, and EVALUATE (incl. arithmetic
and full-condition subjects) are all built and **oracle-verified**: 29
`tests/corpus/proc/` programs (9 baseline + 20 adversarial-refutation
programs) produce byte-identical stdout to real `cobc`. The adversarial round
found 14 root-cause silent-divergence gaps (NUMVAL crashing on internal
whitespace, `SET condition-name TO TRUE`, EVALUATE expression-subject
collapse, recursive PERFORM naming, `WITH TEST AFTER` emitting invalid
Scala 3, duplicate nested group name collisions, `LENGTH` of a GROUP,
`MAX`/`MIN` on `BigDecimal`, `SEARCH ... VARYING`, index-name `DISPLAY`
format, multi-key mixed-direction `SORT`, `RELEASE`/`RETURN` name-vs-position
matching, `UNSTRING ... COUNT IN`) — every one is fixed, and the 20 refuting
programs are permanently in the corpus so none can silently regress. See
`tests/oracle/README.md`'s finding table for the full finding → fix → program
mapping.

**Paragraph control flow, done honestly rather than completely:** the
generator builds a CFG-aware scheme scoped specifically to PERFORM-THRU
ranges — every paragraph inside a `PERFORM x THRU y` becomes a nested local
`def` inside that wrapper method, so GO TO to a sibling paragraph in the same
range resolves by ordinary lexical scoping and natural fallthrough across
paragraph boundaries is reproduced (`generator/method-gen.js#generatePerformThruMethod`).
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

What "verified" means, precisely, as of this writing (2026-07-11):

- **48 oracle-gated corpus programs** compile and run cleanly under real
  GnuCOBOL (`cobc`, exit 0 for all 48): 19 under `tests/corpus/data/`
  (Phase 1) and 29 under `tests/corpus/proc/` (Phase 2). All 48 also pass
  `oracleCompare()` — the generated Scala's stdout matches `cobc`'s stdout
  byte-for-byte — with **0 outstanding `t.todo()` work-queue entries** on
  either side. (`tests/corpus/sql/`'s 5 EXEC-SQL programs are verified by a
  separate compile-check against real `doobie-core`, not the `cobc` sweep,
  since plain GnuCOBOL can't compile embedded SQL without a precompiler.)
- **3 adversarial refutation rounds**, each a dedicated pass whose only job
  is to write new programs designed to break the generator, run them against
  the same compiler oracle, and report divergences without fixing them
  itself:
  - **Round 1 (Phase 1 / data layer):** 12 new edge-case programs — 11/12
    diverged. Every finding was root-caused and fixed (MOVE truncation/
    JUSTIFIED/group-MOVE semantics, arithmetic subscripts silently dropped,
    ON SIZE ERROR unimplemented, 88-level conditions, edited-picture
    zero-suppression/BLANK WHEN ZERO, REDEFINES-over-OCCURS); all 12
    programs promoted into the permanent corpus.
  - **Round 2 (Phase 2 / procedure layer):** 20 new edge-case programs —
    16/20 diverged, 14 distinct root causes (see Phase 2 above and
    `tests/oracle/README.md`'s finding table). Every finding was fixed; all
    20 programs promoted into the permanent corpus.
  - **Round 3: OPEN / pending.** Not yet run as of this writing. Until it
    runs (and its findings, if any, are fixed), treat every claim in this
    document as "survived two adversarial passes," not "adversarially
    exhausted." Two rounds is meaningfully more scrutiny than an unaudited
    corpus, and meaningfully less than a closed question.
- **379 automated tests, 0 failing, 0 skipped, 0 todo** at the current
  commit (`npm test` inside
  `Thyraa-COBOL-main/backend/packages/cobol-to-scala/`), spanning parser
  unit tests, codec property/parity tests, generator tests, the oracle
  harness described above, JCL/DCLGEN/SQL/CICS/BMS corpus tests, and
  focused regression tests for each adversarial-round finding
  (`tests/phase2-refutation-fixes.test.js`, `tests/adversarial-fixes.test.js`).
- **What "verified" does not mean:** it does not mean every COBOL construct
  in the language works, only that the specific constructs in the 48-program
  corpus (plus the units the codec/parser test files exercise directly) do,
  against a real compiler, as of this commit. It also does not mean
  adversarially exhausted (see Round 3 above), and it does not mean IBM
  Enterprise COBOL-verified — the oracle throughout is GnuCOBOL, a different
  (though closely compatible) dialect/implementation. One further,
  previously undocumented gap was found and disclosed while preparing this
  document itself: COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE without ROUNDED does
  not truncate to the target's declared decimal digits at assignment time
  (see 1.3) — a concrete illustration of exactly why "N programs pass" and
  "the construct is fully correct" are different claims, and why a third
  refutation round is still on the roadmap rather than considered optional.

### Cross-cutting engineering rules

1. **Coverage honesty:** every construct the engine sees but cannot convert must surface in the analysis report and as a `??? /* TODO */` marker in output — never silent garbage. (Started today with `safeNodeString`.)
2. **Dialect switches:** IBM Enterprise COBOL first; GnuCOBOL for test-oracle runs; flag extensions per dialect.
3. **Multi-target ready:** keep AST → emitter boundary clean; a Java emitter reuses ~95% of the pipeline and unlocks the mainstream buyer per the market analysis.
4. **Golden corpus:** done for the batch/data shapes — `tests/corpus/` now holds 48 oracle-gated programs (data/proc) plus JCL/DCLGEN/SQL/CICS/BMS fixtures, all compiler- or compile-verified, growing via adversarial refutation rather than hand-curation alone (see the Verification record above). Real-world-shaped scenarios beyond what the corpus covers (e.g. a full VSAM maintenance job, a multi-cursor DB2 batch program) remain a valid way to grow it further. (Enterprise-platform items — auth, CI, Docker — are tracked in `ENTERPRISE_READINESS_GAP_ANALYSIS.md`.)

### The pitch that falls out of this plan

> "Point us at your repo. We inventory every program, copybook, and JCL job; we compute your record layouts to the byte; we convert your batch logic to Scala that round-trips your data files bit-for-bit — and we hand you the generated tests that prove it."

That sentence is buildable by a small team on this codebase, it is differentiated from every incumbent (none target Scala; none lead with proof), and each phase ships a standalone sellable artifact.
