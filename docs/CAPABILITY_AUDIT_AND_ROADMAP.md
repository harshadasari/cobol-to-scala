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

**Procedure Division** (`procedure-parser.js`, 2,068 lines) — 30 statement types:

| Category | Statements |
|---|---|
| Control flow | PERFORM (inline/thru/times/until/varying), IF/ELSE, EVALUATE (incl. TRUE/FALSE/ANY/ranges/NOT), GO TO, CONTINUE, NEXT SENTENCE, EXIT, STOP RUN, GOBACK |
| Data movement | MOVE (multi-target, figurative constants), INITIALIZE, SET |
| Arithmetic | COMPUTE (with precedence & **), ADD, SUBTRACT, MULTIPLY, DIVIDE |
| String handling | STRING, UNSTRING, INSPECT (tallying/replacing/converting) |
| File I/O | OPEN, CLOSE, READ, WRITE, REWRITE, DELETE, START |
| Interop | CALL (BY REFERENCE/CONTENT/VALUE), EXEC SQL / EXEC CICS (captured as opaque blocks) |
| Terminal | ACCEPT, DISPLAY |
| Conditions | relational (all operator spellings), class tests (NUMERIC/ALPHABETIC…), sign tests, level-88 condition names, AND/OR/NOT compounds |

**SQL** (`sql-parser.js`): extracts EXEC SQL blocks, classifies statement type, host variables; generator can emit Doobie-style stubs.

**Generator** (`generator/`): Scala 3 case classes with byte-accurate `recordLength`/`parse`/`format` companions, level-88 → enum generation, paragraphs → methods, expression/condition translation, file-I/O abstractions, runtime library of Scala helpers.

### 1.2 What was broken until today (and is now fixed)

The user's instinct that the app "did one small thing and didn't think through the rest" was directionally right — but the deeper truth found in this audit: **the pipeline was architecturally complete and functionally broken at its foundation**. Five root-cause defects meant that essentially *no real COBOL program converted correctly*:

1. **`PIC 9(6)` destroyed the parse.** The lexer emitted `9` as a bare token; the parser mistook it for a level number, creating phantom FILLER children on every elementary field and losing every PIC pattern. *Fixed: PIC-aware lexing (`PICTURE_STRING` token).*
2. **`recordLength: Int = 0` everywhere.** Generators read `item.picture` (string) while the parser produced `item.pic` (object); every length computed as zero. *Fixed: shared `generator/layout.js`, byte counts hand-verified (e.g., `S9(13)V99 COMP-3` → 8 bytes).*
3. **`[object Object]` in output.** Expression/condition converters matched node type names that the parser never emitted, so everything fell to `String(node)`. *Fixed: real AST shapes handled; unknown constructs emit visible `??? /* TODO */` markers.*
4. **COMP-3 never detected** (`COMP-3` token didn't match the `checkValue('COMP')` test), so packed-decimal money fields got display lengths. *Fixed.*
5. **COPY statements were inventoried but never expanded** — meaning any program that keeps its record layouts in copybooks (i.e., virtually all production COBOL) parsed without its data. *Fixed: `parser/copybook-resolver.js` (OF/IN, REPLACING pseudo-text & word, nested, cycle-safe), wired through `options.copybooks`.*

Also fixed en route: duplicate `filler` parameters (generated Scala didn't compile), REDEFINES double-counting storage, `Vector[Int].parse` (invalid Scala) for elementary OCCURS tables, COMPUTE dropping its assignment target, implied-decimal rescaling on parse/format, and the test suite itself (was `console.log("PASSED")` regardless of result → now 26 assertion-based `node:test` cases, all passing).

### 1.3 What it still does not handle

| Gap | Real-world weight |
|---|---|
| SEARCH / SEARCH ALL | High — table lookups are everywhere in batch |
| SORT / MERGE / RELEASE / RETURN | High — batch job cores |
| MOVE/ADD CORRESPONDING semantics | Medium |
| GO TO DEPENDING ON, ALTER | Medium/legacy |
| EXEC CICS semantics (currently opaque) | High for online systems |
| EXEC SQL → real Doobie/Slick with host-variable typing | High |
| COMP-3/COMP binary **byte-level decode** in generated `parse` (currently display-string based) | High — needed for real dataset round-trips |
| EBCDIC code pages | High for real mainframe data |
| REDEFINES as accessible views (currently skipped with marker) | Medium |
| Intrinsic function library completeness | Medium |
| JCL beyond regex inventory; BMS maps; IMS DL/I; DCLGEN | Phase-dependent |
| Report Writer, Screen Section, OO-COBOL | Low (rare in the wild) |

---

## Part 2 — The Plan: "Don't Miss Any Aspect of COBOL"

### 2.0 Strategic reframe (from the market analysis)

The winning product is **not** "a converter." It is an engine that (a) *understands* a COBOL estate completely — every file type — and (b) *proves* its conversions are right. Translation is commoditizing (LLMs); byte-accurate layout truth and behavioral equivalence are not. Every phase below therefore pairs coverage with verification.

### What a real mainframe estate contains (the file-type map)

| Artifact | Extension(s) | Role | Engine status |
|---|---|---|---|
| Programs | .cbl .cob .ccp | Batch & online logic | Parsed (30 stmt types) |
| Copybooks | .cpy .cop | Shared record layouts | **Expanded + standalone parse (new)** |
| JCL | .jcl .proc | Job orchestration | Regex inventory only |
| BMS maps | .bms | 3270 screen definitions | Not handled |
| DCLGEN | .dclgen | DB2 table ↔ copybook bindings | Not handled |
| SQL/DDL | .sql .ddl | Schemas | Not handled |
| VSAM definitions | IDCAMS | Keyed datasets | Inferred from SELECT only |
| IMS PSB/DBD | .psb .dbd | Hierarchical DB | Not handled |
| Parm/control cards, sort cards | misc | Batch config | Not handled |
| Data files | EBCDIC fixed-length | The actual records | Layout math now correct; EBCDIC decode missing |

### Phase 1 — Data-layer truth (now → +6 weeks) ✅ largely done, finish the tail

The record layout is the atom of everything. Completed today: PIC lexing, byte-accurate lengths, COMP/COMP-3 sizing, copybook expansion, standalone copybooks, REDEFINES-safe lengths.
**Remaining:**
1. EBCDIC ↔ ASCII decode tables in the Scala runtime (cp037/cp1047), zoned-decimal sign nibbles, packed-decimal byte decode in generated `parse`/`format`.
2. REDEFINES as lazy alternate views over the same bytes.
3. OCCURS DEPENDING ON variable-length record handling.
4. **Verification deliverable:** round-trip property tests — `format(parse(bytes)) == bytes` for generated record classes against synthesized datasets. This single feature is a sellable copybook-to-Scala/case-class tool on its own (the proven "understanding wedge" every funded startup used).

### Phase 2 — Batch-complete procedure coverage (+6 → +14 weeks)

1. SEARCH / SEARCH ALL (→ `find`/binary search on Vector), SORT/MERGE/RELEASE/RETURN (→ `sortBy` pipelines), CORRESPONDING, GO TO DEPENDING ON.
2. Full intrinsic function set (NUMVAL-C, date functions, REVERSE, ORD/CHR…).
3. Paragraph fall-through semantics done honestly: build a control-flow graph, detect fall-through chains and PERFORM THRU ranges, emit structured Scala (or flag irreducible GO TO webs for human review instead of silently mis-translating).
4. **Verification deliverable:** characterization-test generator — given a program + record layouts, synthesize input datasets, and (where GnuCOBOL can compile the source) run COBOL vs generated Scala side-by-side and diff outputs. This is the moat feature.

### Phase 3 — The database layer: DB2 & JCL (+14 → +24 weeks)

1. DCLGEN ingestion (ties SQL host variables to copybook fields — cheap win, high signal).
2. EXEC SQL → typed Doobie/Slick with correct host-variable mapping, cursors → streams, SQLCODE handling → Either.
3. JCL real parser: steps, DD statements, dataset lineage, PROC expansion → per-job flow diagrams and sbt/pipeline skeletons. JCL is also the estate map that makes the analysis dashboards genuinely useful.

### Phase 4 — Online systems: CICS (+24 weeks →)

EXEC CICS command classification (SEND/RECEIVE MAP, READ/WRITE, LINK/XCTL, COMMAREA) → service-endpoint skeletons; BMS maps → request/response DTOs. Note: online conversion is where incumbents concentrate; keep this phase behind the batch+data wedge unless a design partner pulls it forward.

### Deliberately out of scope (documented so nothing is "missed" silently)

Report Writer, Screen Section (console apps), OO-COBOL, Assembler subroutines, IMS DL/I — rare or specialist; the engine should *detect and report* them in analysis (coverage honesty) rather than mistranslate.

### Cross-cutting engineering rules

1. **Coverage honesty:** every construct the engine sees but cannot convert must surface in the analysis report and as a `??? /* TODO */` marker in output — never silent garbage. (Started today with `safeNodeString`.)
2. **Dialect switches:** IBM Enterprise COBOL first; GnuCOBOL for test-oracle runs; flag extensions per dialect.
3. **Multi-target ready:** keep AST → emitter boundary clean; a Java emitter reuses ~95% of the pipeline and unlocks the mainstream buyer per the market analysis.
4. **Golden corpus:** grow `tests/samples/` into a corpus of real-world-shaped programs (batch report, VSAM maintenance, DB2 cursor loop, CICS inquiry) each with expected-output fixtures; CI runs the full corpus. (Enterprise-platform items — auth, CI, Docker — are tracked in `ENTERPRISE_READINESS_GAP_ANALYSIS.md`.)

### The pitch that falls out of this plan

> "Point us at your repo. We inventory every program, copybook, and JCL job; we compute your record layouts to the byte; we convert your batch logic to Scala that round-trips your data files bit-for-bit — and we hand you the generated tests that prove it."

That sentence is buildable by a small team on this codebase, it is differentiated from every incumbent (none target Scala; none lead with proof), and each phase ships a standalone sellable artifact.
