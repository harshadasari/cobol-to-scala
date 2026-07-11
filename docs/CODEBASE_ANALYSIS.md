# Codebase Analysis: Thyraa-COBOL vs cobol2scala

*Originally authored: 2026-02-08.*

> **Status note — updated 2026-07-11:** an autonomous 14-round adversarial-verification
> campaign hardened Thyraa-COBOL's conversion engine
> (`Thyraa-COBOL-main/backend/packages/cobol-to-scala/`) since this analysis was first
> written. The engine grew from an early-stage prototype into a lexer → parser → AST →
> Scala-generator pipeline that is now oracle-verified (byte-for-byte against real
> GnuCOBOL) across 209 corpus programs, with 879/879 automated tests passing and 110
> silent-divergence bugs found and fixed at root cause across the 14 rounds. This means
> the original framing below — "Thyraa-COBOL does analysis only, no code conversion" —
> is **no longer accurate** and has been corrected in place where it appears, with
> `(fixed in the 2026-07 verification campaign)` markers. The sections describing the
> peer `cobol2scala` project itself are unchanged. See `docs/ADVERSARIAL_ROUNDS_REPORT.md`
> (full campaign narrative) and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` (current
> capability/gap ledger) for the underlying detail; this document's comparative framing
> has been updated to match but is not a restatement of those two.

## Executive Summary

You and your friend set out to build **complementary** solutions to the same problem (COBOL modernization), with different approaches and delivery models. As of 2026-07, that framing needs a caveat: Thyraa-COBOL's own conversion engine has since been hardened to the point that it now overlaps with cobol2scala on the "actual code conversion" axis too (see status note above), not just the analysis axis. The two projects still differ sharply in delivery model, tech stack, and verification method, so "complementary" is still mostly true — but no longer because Thyraa does zero conversion.

| Aspect | Thyraa-COBOL (Friend's) | cobol2scala (Yours) |
|--------|-------------------------|---------------------|
| **Focus** | Analysis & Documentation, **plus a separately-built, oracle-verified COBOL→Scala conversion engine** (`packages/cobol-to-scala`, added/hardened since this doc was authored) | Code Conversion |
| **Delivery** | Web Application (SaaS) | CLI / On-Premise Containers |
| **Technology** | TypeScript/React + Node.js (analysis platform); the conversion engine is also Node.js, generating Scala 3 output | Scala 3 |
| **Output** | Dependency graphs, flows, documentation; **also Scala 3 case classes, enums, and a runtime codec library from the conversion engine** | Scala 3 case classes, code |
| **Target Language** | None for the analysis platform; **Scala 3 for the conversion engine** (209 oracle-verified programs, 0 SQL-generator wiring into the main pipeline yet) | Scala 3 |
| **Stage** | Pre-conversion analysis for the dashboard; **the conversion engine has passed 14 rounds of adversarial verification** (879/879 tests, 110 bugs fixed) though it has not converged (finding-count plateaued at 3–5/round) | Actual conversion |

---

## Thyraa-COBOL: What Your Friend Built

### Purpose
A **web-based COBOL analysis platform** that ingests GitHub repositories, parses COBOL code, and provides:
- Dependency graph visualization
- Program/copybook relationships
- Business flow identification
- Interactive dashboard for review

**Update (2026-07-11):** the same monorepo now also contains a second, independent
product component — `Thyraa-COBOL-main/backend/packages/cobol-to-scala/`, a real
COBOL→Scala **conversion engine** (not analysis-only). It did not exist in this form
when the "no code conversion" characterization below was first written. See the new
"Conversion Engine" subsection after Key Features, and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`
Part 1 for the source-level audit.

### Philosophy
**"Documentation and understanding BEFORE code generation"**

The approach emphasizes human-reviewable output at every step - not black-box conversion. This reduces risk in enterprise modernization by ensuring business logic is understood before translation.

### Technology Stack

**Frontend:**
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn-ui components
- Monaco Editor (code viewing)
- XyFlow (dependency graph visualization)
- Framer Motion (animations)

**Backend:**
- Node.js + Express
- Bull queue (Redis-backed job processing)
- GitHub API integration (Octokit)
- Regex-based COBOL parsing

**Infrastructure:**
- Redis (job queue + caching)
- GitHub API for repository ingestion

### Key Features Implemented

1. **Repository Ingestion**
   - GitHub URL input
   - Branch selection
   - File discovery and filtering

2. **COBOL Parsing**
   - PROGRAM-ID extraction
   - CALL statement detection
   - COPY statement detection
   - Division analysis

3. **Dependency Analysis**
   - Call graph construction
   - Circular dependency detection
   - Entry point identification

4. **Flow Identification**
   - JCL batch flow extraction
   - Call chain analysis
   - Flow grouping

5. **Interactive Dashboard**
   - Overview statistics
   - Program/copybook listing
   - Dependency matrix
   - Graph visualization
   - Code viewer

6. **COBOL→Scala Conversion Engine** *(added/hardened since this doc was originally written — see below)*

### Architecture

```
GitHub Repo URL
      ↓
[GitHub Ingestion] → Discover files
      ↓
[COBOL Parser] → Extract metadata (regex-based)
      ↓
[Dependency Analyzer] → Build graph
      ↓
[Flow Analyzer] → Identify business flows
      ↓
[Frontend Dashboard] → Visualize results
```

*(This diagram covers the analysis platform only. The conversion engine described below is a separate pipeline that lives alongside it in the same monorepo.)*

### Conversion Engine (new since original analysis — as of 2026-07-11)

The original version of this document described Thyraa-COBOL as analysis-only. That is
no longer the whole picture: `Thyraa-COBOL-main/backend/packages/cobol-to-scala/` is a
real COBOL→Scala conversion engine, hardened by a 14-round autonomous
adversarial-verification campaign completed 2026-07-11. Full detail lives in
`docs/ADVERSARIAL_ROUNDS_REPORT.md` and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`; the
verified headline facts:

- **Pipeline:** lexer → parser → AST → Scala generator (Node.js, ~9,500 lines before
  the campaign), with byte-level codecs for packed decimal/COMP-3, binary/COMP
  (including COMP-5 little-endian), zoned overpunch, and EBCDIC cp037; field/group/table/
  CALL registries; DECLARATIVES support; multi-program CALL; a SORT SD work-file model.
  Key directories: `parser/`, `generator/`, `runtime/`, `tests/oracle/` (the
  compiler-oracle harness).
- **Verification:** 209 oracle-verified COBOL programs in the corpus (grown from 48),
  plus 5 EXEC-SQL programs verified separately against real Doobie (214 `.cbl` files on
  disk in total). 879/879 automated tests passing (`node --test`), 0 failing / 0 todo
  (grown from ~379).
- **Method:** real GnuCOBOL (`cobc -x`) as the oracle, diffed byte-for-byte against the
  generated-then-compiled Scala (`scala-cli`); oracle fixtures are re-captured live from
  the compiler on every run rather than hand-maintained.
- **Impact:** 110 silent-divergence bugs (wrong output, crash, or hang on a
  claimed-supported feature) found and fixed at root cause across the 14 rounds
  (per-round trend: 11, 16, 15, 16, 6, 6, 8, 4, 6, 6, 3, 4, 5, 4).
- **Four roadmap phases built:** (1) data layer + codecs; (2) full procedure logic (all
  PERFORM forms, IF/EVALUATE, SEARCH/SEARCH ALL, SORT, STRING/UNSTRING/INSPECT,
  arithmetic with ROUNDED, MOVE incl. CORRESPONDING, file I/O, DECLARATIVES,
  multi-program CALL, SECTIONs); (3) EXEC SQL→Doobie + JCL parsing as an MVP; (4) CICS
  scaffolding.
- **Still genuinely open** (unchanged by this campaign, not overclaimed): the SQL
  generator is not wired into the main pipeline; CICS support is scaffolding only, not
  behavioral; reference-modification codegen is a visible placeholder;
  REWRITE/DELETE/START are stubbed; `SORT ... USING/GIVING` and external/dynamic `CALL`
  are TODOs; OCCURS DEPENDING ON uses fixed-max sizing; general inter-paragraph GO TO
  webs are unsupported; JCL→sbt skeletons are not generated. The oracle is GnuCOBOL, not
  IBM Enterprise COBOL — closely compatible but a different dialect, so "verified" means
  equivalent on these 209 programs against this compiler, not correct on arbitrary
  COBOL. The campaign did not converge (bug-finding plateaued at 3–5/round against a
  0–2 target); hunting was paused by owner decision, not because the engine ran out of
  bugs to find.

### Strengths
- Beautiful, modern UI
- Real-time progress tracking
- Interactive graph visualization
- Scalable async job processing
- Comprehensive GitHub integration
- **Its conversion engine is now oracle-verified against a real compiler across 209
  programs with 879/879 tests passing** *(new since original analysis)*

### Limitations
- ~~**No code conversion** - analysis only~~ **(fixed in the 2026-07 verification
  campaign)** — the `packages/cobol-to-scala` engine now performs real, oracle-verified
  conversion; see the "Conversion Engine" subsection above.
- ~~**No Scala output** - just documentation~~ **(fixed in the 2026-07 verification
  campaign)** — the engine generates Scala 3 case classes, enums, a runtime codec
  library, and parse/format code.
- Regex-based parsing (not full grammar) — **still true of the analysis platform's own
  parser** (`packages/cobol-analysis/parsers/cobol.parser.js`), used for the
  dependency-graph/dashboard flow. The separate conversion engine's parser
  (`packages/cobol-to-scala/parser/`) is a real lexer/grammar, not regex-based.
- Requires Redis infrastructure — still true (analysis platform only)
- SaaS model may not suit air-gapped banks — still true
- **New, not previously listed:** the conversion engine's own remaining gaps — SQL
  generator not wired into the main pipeline, CICS scaffolding only, REWRITE/DELETE/
  START stubbed, `SORT ... USING/GIVING` and external/dynamic `CALL` are TODOs, OCCURS
  DEPENDING ON is fixed-max only, general inter-paragraph GO TO webs unsupported, and
  verification is against GnuCOBOL rather than IBM Enterprise COBOL. See
  `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` for the full gap ledger.

---

## cobol2scala: What We Built

### Purpose
A **CLI/on-premise platform** that converts COBOL copybooks and programs to **idiomatic Scala 3 code**.

### Philosophy
**"Deterministic conversion with AI assistance"**

Banks need auditable, reproducible transformations. The core uses rule-based parsing and conversion, with optional AI for documentation enhancement.

### Technology Stack

**Core:**
- Scala 3.3 LTS
- Hand-written recursive descent parser
- Custom code generator

**CLI:**
- decline (CLI framework)

**Runtime:**
- Custom COBOL types (PackedDecimal, FixedString)
- Binary/display numeric codecs

### Key Features Implemented

1. **Copybook Parser**
   - Full DATA DIVISION parsing
   - Level numbers (01-49, 66, 77, 88)
   - PIC clause analysis
   - OCCURS, REDEFINES support
   - Hierarchical structure building

2. **Type Mapper**
   - PIC X → String
   - PIC 9 → Int/Long
   - COMP-3 → BigDecimal
   - Level 88 → Scala enum

3. **Scala Generator**
   - Case classes from records
   - Enums from level 88s
   - Companion objects with parse/format
   - Proper Scala 3 syntax

4. **Runtime Library**
   - PackedDecimal (COMP-3) encoding/decoding
   - BinaryNumeric (COMP) handling
   - DisplayNumeric (zoned decimal)
   - EBCDIC overpunch support

5. **CLI Tool**
   - `cobol2scala copybook --input FILE`
   - `cobol2scala analyze --input FILE`

### Architecture

```
COBOL Copybook
      ↓
[Lexer] → Tokens (handle columns 1-72)
      ↓
[Parser] → AST (DataItem hierarchy)
      ↓
[TypeMapper] → Scala types
      ↓
[ScalaGenerator] → Scala 3 code
      ↓
Output: case classes + runtime support
```

### Strengths
- Actual code conversion (not just analysis)
- Deterministic, auditable output
- On-premise / air-gapped friendly
- No external infrastructure needed
- Proper Scala 3 with type safety

### Limitations
- No web UI (CLI only for now)
- No dependency graph visualization
- No GitHub integration yet
- No flow identification

---

## Side-by-Side Comparison

### Delivery Model

| Thyraa-COBOL | cobol2scala |
|--------------|-------------|
| Web application | CLI tool |
| Browser-based | Terminal-based |
| Requires server + Redis | Single binary |
| Cloud or on-premise server | Pure on-premise |
| Real-time progress UI | Streaming logs |

### What They Parse

| Feature | Thyraa-COBOL | cobol2scala |
|---------|--------------|-------------|
| PROGRAM-ID | ✅ | ⚠️ (planned) |
| CALL statements | ✅ | ⚠️ (planned) |
| COPY statements | ✅ | ✅ (inline) |
| DATA DIVISION | ⚠️ (basic) | ✅ (full) |
| PIC clauses | ⚠️ (basic) | ✅ (detailed) |
| COMP types | ❌ | ✅ |
| Level 88 | ⚠️ (basic) | ✅ |
| OCCURS | ⚠️ (basic) | ✅ |
| REDEFINES | ❌ | ✅ |
| PROCEDURE DIVISION | ⚠️ (calls only) | ⚠️ (planned) |
| JCL files | ✅ | ❌ |

> **Note (2026-07-11):** the "Thyraa-COBOL" column above describes the
> analysis-platform's own parser (`packages/cobol-analysis`, still regex-based, still
> ⚠️/❌ as shown). Thyraa-COBOL now also contains a **second, independent** parser inside
> its conversion engine (`packages/cobol-to-scala/parser/`) that fully and
> oracle-verifiedly handles DATA DIVISION, PIC clauses, COMP types (COMP/COMP-3/COMP-5/
> BINARY), Level 88, OCCURS (incl. DEPENDING ON), and REDEFINES — i.e. this second
> parser would score ✅ across that whole column, not ⚠️/❌. It is not reflected in this
> table because the table is specifically about the analysis-ingestion parser. See
> `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` §1.1 for the statement-by-statement audit.

### Output Produced

| Output | Thyraa-COBOL | cobol2scala |
|--------|--------------|-------------|
| Dependency graph | ✅ | ❌ |
| Flow identification | ✅ | ❌ |
| Statistics/summary | ✅ | ⚠️ (basic) |
| Scala case classes | ✅ *(via conversion engine, added since original analysis)* | ✅ |
| Scala enums | ✅ *(via conversion engine, added since original analysis)* | ✅ |
| Runtime library | ✅ *(via conversion engine, added since original analysis)* | ✅ |
| Parse/format code | ✅ *(via conversion engine, added since original analysis)* | ✅ |
| Documentation | ✅ | ⚠️ (planned AI) |

The four rows above were originally all ❌ for Thyraa-COBOL when this table was first
written; that was accurate at the time (Thyraa was analysis-only). As of 2026-07-11,
Thyraa-COBOL's `packages/cobol-to-scala` engine produces all four, oracle-verified
against real GnuCOBOL across 209 corpus programs (879/879 automated tests passing). See
the "Conversion Engine" subsection above and `docs/ADVERSARIAL_ROUNDS_REPORT.md`.

### Technology Comparison

| Aspect | Thyraa-COBOL | cobol2scala |
|--------|--------------|-------------|
| Language | TypeScript/JavaScript | Scala 3 |
| Frontend | React + Tailwind | None (CLI) |
| Backend | Node.js + Express | JVM |
| Parser approach | Regex extraction (analysis platform); **the conversion engine uses a real lexer → parser → AST pipeline, not regex** *(added since original analysis)* | Recursive descent |
| Async processing | Bull queue + Redis | Synchronous |
| Visualization | XyFlow graphs | None |

---

## How They Complement Each Other

```
                    COBOL MODERNIZATION PIPELINE

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  PHASE 1: ANALYSIS & UNDERSTANDING (Thyraa-COBOL)               │
│  ─────────────────────────────────────────────────              │
│  • Ingest repository from GitHub                                │
│  • Parse and identify all programs/copybooks                    │
│  • Build dependency graph                                       │
│  • Identify business flows                                      │
│  • Generate documentation                                       │
│  • Human review and approval                                    │
│                                                                 │
│                          ↓                                      │
│                                                                 │
│  PHASE 2: CODE CONVERSION (cobol2scala)                         │
│  ─────────────────────────────────────────                      │
│  • Convert copybooks to Scala case classes                      │
│  • Generate enums from level 88s                                │
│  • Create runtime library for COBOL types                       │
│  • Convert procedures to Scala methods                          │
│  • AI-enhanced documentation                                    │
│                                                                 │
│                          ↓                                      │
│                                                                 │
│  PHASE 3: VALIDATION & DEPLOYMENT                               │
│  ─────────────────────────────────────                          │
│  • Dual-run testing (COBOL vs Scala)                            │
│  • Byte-level verification                                      │
│  • Performance benchmarking                                     │
│  • Production deployment                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Thyraa-COBOL** answers: "What do we have? What calls what? What are the flows?"

**cobol2scala** answers: "How do we convert this to Scala? What's the equivalent code?"

> **Note (2026-07-11):** the diagram above still describes the intended two-project
> pipeline as originally envisioned. In practice, Thyraa-COBOL has since built its own
> in-house answer to Phase 2 ("How do we convert this to Scala?") — the
> `packages/cobol-to-scala` engine covers copybook→case-class conversion, level-88→enum
> generation, a runtime library, and procedure-to-method conversion, oracle-verified
> against real GnuCOBOL. It has not built the AI-enhanced-documentation piece of Phase 2,
> and Phase 3 (dual-run/byte-level validation) is exactly the discipline its 14-round
> adversarial campaign already performs internally for its own 209-program corpus (see
> `docs/ADVERSARIAL_ROUNDS_REPORT.md`), rather than a phase still waiting on
> cobol2scala. The two projects can still complement each other on delivery model,
> tooling, and cross-verification — but the premise that only cobol2scala does
> conversion no longer holds.

---

## Recommendation: Unified Platform

### Option 1: Integrate Both
Keep both codebases but create integration points:

```
Thyraa-COBOL Web UI
      ↓
[Analysis Results JSON]
      ↓
cobol2scala CLI (receives analysis)
      ↓
[Scala code output]
      ↓
Back to Thyraa-COBOL for review
```

### Option 2: Thyraa as Frontend, cobol2scala as Backend
- Use Thyraa's React UI and job queue infrastructure
- Replace Node.js analysis with cobol2scala Scala engine
- Expose cobol2scala as REST API
- Get best of both: beautiful UI + robust conversion

### Option 3: Merge Feature Sets
- Add Thyraa's dependency graphing to cobol2scala
- Add cobol2scala's code generation to Thyraa
- Single unified platform

---

## Technical Gaps to Bridge

### What Thyraa Needs from cobol2scala
1. Proper PIC clause parsing (COMP-3, COMP, etc.) — **still a real gap in the analysis
   platform's own regex-based parser**, though the conversion engine's separate parser
   now has this fully, oracle-verified.
2. ~~Actual Scala code generation~~ **(closed, independently — not via cobol2scala)** —
   Thyraa's own `packages/cobol-to-scala` engine now does this, hardened through the
   2026-07 verification campaign.
3. ~~Runtime library for COBOL types~~ **(closed, independently — not via cobol2scala)**
   — same engine, byte-level codecs for packed decimal/COMP-3, binary/COMP, zoned
   overpunch, EBCDIC cp037.
4. ~~Detailed type mapping~~ **(closed, independently — not via cobol2scala)** — same
   engine's data-division parser and generator.

**Net effect (2026-07-11):** the integration case for "Thyraa needs cobol2scala" is
weaker than when this document was written — items 2–4 are no longer open gaps Thyraa
must borrow from cobol2scala. What remains genuinely useful to borrow, if anything, is
item 1 (folding the conversion engine's stronger parser back into the analysis
platform's own ingestion path) and any cross-pollination on verification methodology.

### What cobol2scala Needs from Thyraa
1. GitHub repository ingestion
2. Dependency graph building
3. Web UI for visualization
4. Async job processing
5. JCL flow identification

---

## Next Steps

1. **Sync with your friend** - share this analysis
2. **Decide on integration approach** - merge or interop?
3. **Define API contract** - if interop, what's the data format?
4. **Share the plan** - the detailed plan we created covers the full vision

---

## Summary

| Question | Answer |
|----------|--------|
| What did your friend build? | Web-based COBOL analysis platform with dependency graphs, **plus (as of 2026-07-11) a separately-hardened COBOL→Scala conversion engine, oracle-verified against real GnuCOBOL across 209 programs with 879/879 tests passing** |
| What did we build? | CLI-based COBOL-to-Scala code converter |
| Are they competing? | Originally: no. **As of 2026-07-11: partially** — both projects now do real COBOL→Scala conversion, so they overlap on that axis; they still differ on delivery model (SaaS web app vs. CLI/on-prem), tech stack (Node.js-generated Scala vs. Scala-native), and verification approach (oracle-diffed against GnuCOBOL vs. this project's own methods) |
| Can they work together? | Yes, though less by necessity than before — Thyraa no longer needs cobol2scala's conversion capability to close its own gap, since it built one independently |
| What's missing overall? | Integration layer, unified deployment; also unchanged: neither project's platform-level gaps (auth, CI/CD, deployment tooling) were touched by the 2026-07 campaign, which was scoped to the conversion engine only |

Your friend focused on **understanding and documenting** the COBOL codebase, and — as
this document's original framing did not anticipate — has since also built and
adversarially hardened their own **COBOL→Scala conversion engine**.
You focused on **converting** it to modern Scala code.

**Together, you still have a complementary story worth telling — just not the strict "analysis vs. conversion" split this document originally described.** See `docs/ADVERSARIAL_ROUNDS_REPORT.md` and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` for the full detail behind Thyraa-COBOL's current conversion-engine state.
