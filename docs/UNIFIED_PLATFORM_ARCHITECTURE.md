# Thyraa: Unified COBOL Modernization Platform

**Originally authored: 2026-02-08** · **Status annotated: 2026-07-23**

> This document is the product vision and system architecture for Thyraa, written five and a half months ago as a forward-looking design. It remains legitimately aspirational in large part — that framing is kept intact below. What changed starting 2026-07-11 is that the conversion engine at the center of this architecture went from "designed" to "built and independently verified" via an adversarial-verification campaign that ran in two phases — an initial 14 rounds, paused by owner decision, then resumed at the owner's request and run to completion at round 40 as of 2026-07-23 — while the platform layers around it (UI, gateway, orchestration, auth, deployment) are still exactly as aspirational as they were in February; the campaign was engine-only and never touched them. The sections below are annotated throughout with **✅ Built & verified**, **🟡 Partial**, or **⬜ Vision (not yet built)** so the built/aspirational line is unmissable. See the new "Implementation Status" section immediately below for the full picture, `docs/PROGRESS_STATUS.md` for the closing campaign report (and `docs/ADVERSARIAL_ROUNDS_REPORT.md` for the original rounds 1-14 narrative), and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` for the statement-level engine capability audit.

## Product Vision

**Thyraa** is an enterprise-grade platform that transforms legacy COBOL systems into modern Scala applications through a human-in-the-loop, AI-assisted pipeline.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                         T H Y R A A                                         │
│              COBOL → Scala Modernization Platform                           │
│                                                                             │
│   "Understand First, Convert Confidently, Deploy Safely"                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Status (2026-07-23)

*Added 2026-07-11, five months after original authoring; refreshed 2026-07-23 now that the campaign has run to completion. This section — and the ✅/🟡/⬜ tags used throughout the rest of the document — reflect what has actually been built and verified since, versus what remains architecture/product vision. Full detail: `docs/PROGRESS_STATUS.md` (closing report for the full 40-round campaign), `docs/ADVERSARIAL_ROUNDS_REPORT.md` (original rounds 1-14 narrative), `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md` (the complete round-by-round finding→fix→program ledger), `docs/AUTONOMOUS_BUILD_LOG.md` (per-cycle log), and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` (statement-by-statement engine capability audit and roadmap).*

### ✅ BUILT & VERIFIED

The COBOL→Scala **conversion engine** (`Thyraa-COBOL-main/backend/packages/cobol-to-scala/`) is real, tested, and verified against a real compiler oracle — not a prototype or a mock:

- **Real architecture**: lexer → parser → AST → Scala generator. Note this is a **Node.js/JavaScript package**, not a separate JVM/Scala microservice as the "Scala Engine Integration" section below envisions — see the annotation there.
- **Byte-level codecs**: packed decimal/COMP-3, binary/COMP (including COMP-5 little-endian), zoned/overpunch numerics, EBCDIC cp037.
- Field/group/table/CALL registries, DECLARATIVES support (including reentrancy and cross-conversion state isolation), multi-program `CALL`, SORT SD work-file model.
- **574 oracle-verified corpus programs** (grown from 48 pre-campaign, 209 at the round-14 checkpoint): 563 `.cbl` programs that compile and run clean under real GnuCOBOL (`cobc`), plus 11 deliberately-named `.cbl.txt` probes whose own correct behavior is a nonzero `cobc` exit / compile rejection.
- **~2,017 automated tests** (898 unit + 1,119 oracle-harness), 0 failing, plus 45 honest/individually-documented `t.todo()` work-queue entries (never silent) — up from 879/879 at the round-14 checkpoint.
- **241 silent-divergence findings found and fixed at root cause** across all 40 completed adversarial rounds (110 in rounds 1-14, 131 more in rounds 15-40) — each finding verified byte-for-byte against real GnuCOBOL (`cobc`) compiler output, not a hand-written expectation. The campaign's own convergence bar (0-2 findings for two consecutive rounds) was met only once, briefly, at rounds 36-37; rounds 38-40 then deliberately broadened the search and found real bugs again at an *increasing* rate (6, then 7, then 8 per round), including two entirely-unimplemented statements (`REPLACE`, `PROGRAM-ID ... INITIAL`) discovered as late as round 40 — so the 40 completed rounds should not be read as "adversarially exhausted," only as "run to the owner's requested target." Major capability built (not just bugs fixed) along the way, in rounds 15-40: real RECURSIVE-program support (per-activation LINKAGE aliasing, BY REFERENCE/CONTENT semantics, self-call-cycle detection); a full architectural rewrite of RELATIVE file I/O after round 29 found the original storage model silently corrupted binary data containing a newline byte (the single most serious finding of the whole campaign); real LINAGE + FILE STATUS lifecycle support; and real IEEE-754 COMP-1/COMP-2 float/double codecs.
- Four engine phases built: (1) data layer + codecs, (2) full PROCEDURE DIVISION logic, (3) `EXEC SQL` → Doobie generation + JCL parsing (MVP — compile-verified in isolation but **not yet spliced into the main generator's output path**), (4) CICS scaffolding (classification/BMS parsing/skeleton generation only — **not** behavioral conversion).
- A minimal **analysis platform** (React frontend + Express backend + Bull/Redis job queue + regex-level dependency parsing) also exists and predates this campaign — see "Partial" below.

### ⬜ STILL VISION (not built)

The platform layers *around* the engine were **not** part of this campaign (which was engine-only) and remain architectural vision, confirmed by direct filesystem search of this repo:

- Human-in-the-loop review workflow (the "👤 HUMAN REVIEW" checkpoints in the User Journey below)
- Authentication / authorization: OAuth 2.0/OIDC, SAML, JWT, RBAC, API keys — all API endpoints today are unauthenticated and open, `cors()` allows all origins
- Multi-tenancy, project management, audit trail persistence
- Job orchestration for conversion/validation specifically (conversion runs synchronously in-process today; only the pre-existing *analysis* pipeline has a real queue)
- Deployment/infra: Docker, Docker Compose, Kubernetes manifests — none exist anywhere in this repo
- Observability: logging/metrics/tracing infrastructure
- Persistence/database: no PostgreSQL; Redis exists only for the analysis job queue, not for conversion/validation results
- Packaging / release process
- A customer-facing **Validation Engine** (dual-run comparison as a *product feature* — the oracle-comparison harness in `tests/oracle/` is a developer test tool internal to the engine repo, not a service)
- The **AI Layer** (Claude-powered documentation/explanation/business-rule-extraction as a product feature) — no such integration exists in the backend today
- VS Code Extension, standalone CLI
- Engine-internal gaps also still open (per the full 40-round campaign's closing risk catalogue — see `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` §1.3 for the risk-ordered detail): reference modification (`field(start:length)`) still degrades to a placeholder for its actual value almost everywhere — the single largest remaining silent-wrong-output risk; `ORGANIZATION IS INDEXED` (VSAM-style keyed) files are unimplemented and unverifiable in this sandbox (the installed GnuCOBOL has indexed support compiled out); `CALL BY REFERENCE`/`CONTENT` of a GROUP containing an OCCURS table into an ordinary (non-recursive) subprogram silently passes empty/default data; plus SQL wire-in, CICS behavioral conversion, SORT USING/GIVING, external/dynamic CALL, OCCURS DEPENDING ON dynamic sizing, general GO TO webs, JCL→sbt skeletons. (REWRITE/DELETE/START file-status/lifecycle handling, previously listed here as open, was built during rounds 15-40 — see "Implementation Status" above.) The oracle is GnuCOBOL, not IBM Enterprise COBOL.

### 🟡 PARTIAL (exists already, predates this campaign, narrower than the vision below)

- **Web UI**: a real React frontend exists (`Thyraa-COBOL-main/src/`) with an analysis-results page (`AnalysisResults.tsx`) and a conversion page (`ScalaConverter.tsx`) — functional but far narrower than the Presentation Layer pictured below (no validation-results UI, no review workflow, no VS Code extension, no CLI).
- **API Gateway**: a real Express API exists (`backend/api/`) with working `/analyze` and `/convert/{parse,scala,batch,runtime}` routes — but no `/api/projects`, no `/validate`, no `/api/ai` endpoints, and none of the security features (auth, rate limiting, CORS whitelisting) called for in the Security Architecture section.
- **Job Queue**: Bull + Redis is real, but wired only to the *analysis* pipeline; the conversion engine is called in-process/synchronously from the controller, not queued.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THYRAA PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     PRESENTATION LAYER                               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   Web UI     │  │   VS Code    │  │     CLI      │               │   │
│  │  │   (React)    │  │  Extension   │  │   (Scala)    │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      API GATEWAY LAYER                               │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │                   REST API (Express)                          │   │   │
│  │  │  • /api/projects      - Project management                    │   │   │
│  │  │  • /api/analyze       - Analysis pipeline                     │   │   │
│  │  │  • /api/convert       - Conversion pipeline                   │   │   │
│  │  │  • /api/validate      - Validation & testing                  │   │   │
│  │  │  • /api/ai            - AI assistance                         │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATION LAYER                               │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │   │
│  │  │   Job Queue    │  │   Workflow     │  │    Event       │         │   │
│  │  │    (Bull)      │  │   Engine       │  │    Bus         │         │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│           ┌────────────────────────┼────────────────────────┐              │
│           ▼                        ▼                        ▼              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  ANALYSIS       │    │  CONVERSION     │    │  VALIDATION     │        │
│  │  ENGINE         │    │  ENGINE         │    │  ENGINE         │        │
│  │  (Node.js)      │    │  (Scala/JVM)    │    │  (Scala/JVM)    │        │
│  │                 │    │                 │    │                 │        │
│  │  • Ingestion    │    │  • Parser       │    │  • Dual-run     │        │
│  │  • Parsing      │    │  • TypeMapper   │    │  • Comparison   │        │
│  │  • Graph Build  │    │  • Generator    │    │  • Reports      │        │
│  │  • Flow ID      │    │  • Runtime      │    │  • Metrics      │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│           │                        │                        │              │
│           └────────────────────────┼────────────────────────┘              │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        AI LAYER                                      │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │   │
│  │  │  Documentation │  │   Business     │  │   Code         │         │   │
│  │  │  Generator     │  │   Rule Extract │  │   Explanation  │         │   │
│  │  │  (Claude)      │  │   (Claude)     │  │   (Claude)     │         │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      DATA LAYER                                      │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │   │
│  │  │   PostgreSQL   │  │     Redis      │  │   File Store   │         │   │
│  │  │   (Projects,   │  │   (Cache,      │  │   (Source,     │         │   │
│  │  │    Results)    │  │    Queue)      │  │    Output)     │         │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Layer-by-layer status (2026-07-23):**

| Layer | Status | Notes |
|---|---|---|
| Presentation Layer (Web UI, VS Code Extension, CLI) | 🟡 Partial | React web UI exists for analysis + a basic conversion page; no VS Code extension, no CLI |
| API Gateway (REST) | 🟡 Partial | `/api/analyze` and `/api/convert/*` are real; `/api/validate` and `/api/ai` do not exist |
| Orchestration Layer (Job Queue, Workflow Engine, Event Bus) | 🟡 Partial | Bull/Redis queue is real for analysis only; no workflow engine, no event bus, conversion is synchronous in-process |
| Analysis Engine (Node.js) | 🟡 Partial | Real and working, but its COBOL "parsing" is regex-level (`packages/cobol-analysis/parsers/cobol.parser.js`) — it does not build a full AST the way the conversion engine does |
| Conversion Engine | ✅ Built & verified | The real, hardened lexer→parser→AST→generator described in "Implementation Status" above — but it's a Node.js package, not the separate "Scala/JVM" service pictured here (see annotation under "Scala Engine Integration") |
| Validation Engine | ⬜ Vision | No customer-facing dual-run/comparison service exists; the oracle harness (`tests/oracle/`) is a developer test tool inside the conversion-engine repo, not a product feature |
| AI Layer (Documentation, Rule Extraction, Explanation) | ⬜ Vision | No Claude integration exists in the backend |
| Data Layer (PostgreSQL, Redis, File Store) | ⬜ Vision / 🟡 Partial | No PostgreSQL anywhere in the repo; Redis exists only as the analysis job queue/cache, not as a general data layer |

---

## User Journey & Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MODERNIZATION WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: INGEST                                                             │
│  ─────────────────                                                          │
│  User provides: GitHub URL / File Upload / Local Path                       │
│         ↓                                                                   │
│  System: Discovers all COBOL files (.cbl, .cob, .cpy, .jcl)                │
│         ↓                                                                   │
│  Output: File inventory, initial statistics                                 │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  STEP 2: ANALYZE (Thyraa Analysis Engine)                                   │
│  ─────────────────────────────────────────                                  │
│  • Parse all programs and copybooks                                         │
│  • Build dependency graph (calls, copies)                                   │
│  • Identify circular dependencies                                           │
│  • Discover business flows from JCL                                         │
│  • Generate documentation with AI                                           │
│         ↓                                                                   │
│  Output: Interactive dashboard with graphs, flows, documentation            │
│         ↓                                                                   │
│  👤 HUMAN REVIEW: Approve analysis, select programs to convert              │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  STEP 3: CONVERT (cobol2scala Engine)                                       │
│  ─────────────────────────────────────                                      │
│  • Deep parse copybooks (full PIC, COMP, OCCURS, REDEFINES)                │
│  • Map COBOL types to Scala types                                           │
│  • Generate Scala 3 case classes                                            │
│  • Generate enums from level 88s                                            │
│  • Create runtime library integration                                       │
│  • Convert PROCEDURE DIVISION (Phase 2)                                     │
│  • AI-enhanced documentation                                                │
│         ↓                                                                   │
│  Output: Scala source code, build files, runtime library                    │
│         ↓                                                                   │
│  👤 HUMAN REVIEW: Review generated code, approve or request changes         │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  STEP 4: VALIDATE                                                           │
│  ─────────────────                                                          │
│  • Compile generated Scala code                                             │
│  • Run unit tests                                                           │
│  • Dual-run comparison (COBOL vs Scala with same input)                    │
│  • Byte-level verification for file I/O                                     │
│  • Performance benchmarking                                                 │
│         ↓                                                                   │
│  Output: Validation report, test results, comparison metrics                │
│         ↓                                                                   │
│  👤 HUMAN REVIEW: Approve for production or iterate                         │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  STEP 5: DEPLOY                                                             │
│  ─────────────────                                                          │
│  • Package Scala application                                                │
│  • Generate Docker containers                                               │
│  • CI/CD pipeline integration                                               │
│  • Production deployment                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Status per step (2026-07-23):** STEP 1 (Ingest) and STEP 2 (Analyze) are 🟡 Partial — the analysis pipeline is real, but "Generate documentation with AI" is ⬜ Vision (no AI integration exists). STEP 3 (Convert) is the strongest part of the whole journey: the actual COBOL parsing/type-mapping/case-class/enum/runtime generation is ✅ Built & verified (and far more capable than this five-month-old bullet list suggests — see "Implementation Status" above for the real internal architecture); "AI-enhanced documentation" in this step is still ⬜ Vision. STEP 4 (Validate) is ⬜ Vision as a product step — real oracle-comparison logic exists but only as an internal developer test harness (`tests/oracle/`), not a report/dashboard a user triggers. All 👤 HUMAN REVIEW checkpoints are ⬜ Vision — no review workflow UI exists. STEP 5 (Deploy) is entirely ⬜ Vision — no packaging, Docker, or CI/CD exists anywhere in the repo.

---

## Component Integration

### How the Engines Connect

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INTEGRATION FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌───────────────────┐                               │
│                         │    Web UI         │                               │
│                         │    (React)        │                               │
│                         └─────────┬─────────┘                               │
│                                   │                                         │
│                                   ▼                                         │
│                         ┌───────────────────┐                               │
│                         │   API Gateway     │                               │
│                         │   (Express)       │                               │
│                         └─────────┬─────────┘                               │
│                                   │                                         │
│              ┌────────────────────┼────────────────────┐                   │
│              ▼                    ▼                    ▼                   │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│    │                 │  │                 │  │                 │          │
│    │  POST /analyze  │  │  POST /convert  │  │ POST /validate  │          │
│    │                 │  │                 │  │                 │          │
│    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│             │                    │                    │                    │
│             ▼                    ▼                    ▼                    │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│    │   Bull Queue    │  │   Bull Queue    │  │   Bull Queue    │          │
│    │  "analysis"     │  │  "conversion"   │  │  "validation"   │          │
│    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│             │                    │                    │                    │
│             ▼                    ▼                    ▼                    │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│    │                 │  │                 │  │                 │          │
│    │  ANALYSIS       │  │  CONVERSION     │  │  VALIDATION     │          │
│    │  ENGINE         │  │  ENGINE         │  │  ENGINE         │          │
│    │  (Node.js)      │  │  (Scala JVM)    │  │  (Scala JVM)    │          │
│    │                 │  │                 │  │                 │          │
│    │  Thyraa's       │  │  cobol2scala    │  │  Test runner    │          │
│    │  existing code  │  │  integrated     │  │  + comparator   │          │
│    │                 │  │                 │  │                 │          │
│    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│             │                    │                    │                    │
│             ▼                    ▼                    ▼                    │
│    ┌─────────────────────────────────────────────────────────┐            │
│    │                                                         │            │
│    │                    SHARED DATA STORE                    │            │
│    │                                                         │            │
│    │  • PostgreSQL: Projects, results, audit trail           │            │
│    │  • Redis: Job queues, caching                           │            │
│    │  • File Store: Source files, generated code             │            │
│    │                                                         │            │
│    └─────────────────────────────────────────────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Reality check (2026-07-23):** 🟡 Partial, and structured differently than pictured. `POST /analyze` is real and does queue through Bull. `POST /convert` is real (`/api/convert/parse`, `/api/convert/scala`, `/api/convert/batch`) but is **not** queued — the controller calls the conversion engine's `convertToScala()` directly, in-process, synchronously (`backend/api/controllers/conversion.controller.js`), and the "CONVERSION ENGINE (Scala JVM)" box does not exist as a separate JVM process — see the note under "Scala Engine Integration" below. `POST /validate` does not exist at all — ⬜ Vision. There is no PostgreSQL and no shared "SHARED DATA STORE" beyond the analysis job queue's Redis instance.

---

## Scala Engine Integration

> **⬜ Vision — none of Options A/B/C below are how the system actually works today.** The real conversion engine (`Thyraa-COBOL-main/backend/packages/cobol-to-scala/`) is a **plain Node.js/JavaScript package** (see its `package.json`: `"main": "index.js"`), imported and called directly, in-process, by the Express backend (`import { convertToScala, parseCobol } from '../../packages/cobol-to-scala/index.js'` in `conversion.controller.js`). It is not a Scala/JVM program at all — it is a JS lexer/parser/generator that *emits Scala source text as its output*. There is no separate JVM service, no http4s, no GraalVM native image, and no node-java bridge anywhere in this repo. If the platform ever needs the engine to run as an isolated service (for scaling, sandboxing, or a genuine polyglot rewrite), the three options below remain a reasonable menu of future choices — they are just not what exists.

### Option A: HTTP Microservice (Recommended)

cobol2scala runs as a separate JVM service that the Node.js backend calls via HTTP.

```
┌─────────────────┐         ┌─────────────────┐
│   Node.js       │  HTTP   │   Scala         │
│   Backend       │ ──────► │   Service       │
│   (Express)     │  REST   │   (http4s)      │
└─────────────────┘         └─────────────────┘

Endpoints:
  POST /parse     - Parse COBOL and return AST
  POST /convert   - Convert AST to Scala code
  POST /generate  - Full pipeline: parse + convert
  GET  /health    - Health check
```

**Pros:**
- Language isolation (Node.js doesn't need JVM)
- Independent scaling
- Easy to deploy as separate container
- Clear API boundary

**Cons:**
- Network overhead
- Additional service to manage

### Option B: Native Integration via GraalVM

Compile Scala to native image, call from Node.js via child process.

```
┌─────────────────┐         ┌─────────────────┐
│   Node.js       │  exec   │   Native        │
│   Backend       │ ──────► │   Binary        │
│                 │ stdin/  │   (GraalVM)     │
│                 │ stdout  │                 │
└─────────────────┘         └─────────────────┘
```

**Pros:**
- Fast startup
- No network overhead
- Single deployment unit

**Cons:**
- GraalVM complexity
- Limited reflection support

### Option C: JVM Bridge (node-java)

Direct JVM calls from Node.js using node-java bridge.

**Not recommended** - complex, fragile, hard to debug.

---

## Data Models

⬜ **Vision.** None of the interfaces below are implemented as a formal shared contract today — there is no `Project`/`ProjectStatus` model, no persisted `AnalysisResult`/`ConversionResult` records, and no `projectId`-scoped data flow. The real `/api/convert/*` endpoints (see "API Specification" below) take a raw `source` string and `options` object and return an ad hoc JSON shape directly from the conversion engine's return value — not this typed contract. This section is worth keeping as a target schema for whenever the platform layer gets built.

### Shared Data Contract

```typescript
// TypeScript interface for data exchange

interface Project {
  id: string;
  name: string;
  source: SourceConfig;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface SourceConfig {
  type: 'github' | 'upload' | 'local';
  url?: string;
  branch?: string;
  path?: string;
}

type ProjectStatus =
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'converting'
  | 'converted'
  | 'validating'
  | 'validated'
  | 'failed';

// Analysis output (from Thyraa engine)
interface AnalysisResult {
  projectId: string;
  programs: Program[];
  copybooks: Copybook[];
  dependencies: Dependency[];
  flows: Flow[];
  statistics: Statistics;
  graph: GraphData;
}

interface Program {
  name: string;
  filePath: string;
  calls: string[];
  copies: string[];
  lines: number;
  divisions: Division[];
}

// Conversion input (to Scala engine)
interface ConversionRequest {
  projectId: string;
  files: FileToConvert[];
  options: ConversionOptions;
}

interface FileToConvert {
  path: string;
  content: string;
  type: 'program' | 'copybook';
}

interface ConversionOptions {
  packageName: string;
  generateTests: boolean;
  aiDocumentation: boolean;
  targetDialect: 'scala3' | 'scala2';
}

// Conversion output (from Scala engine)
interface ConversionResult {
  projectId: string;
  files: GeneratedFile[];
  errors: ConversionError[];
  warnings: ConversionWarning[];
  statistics: ConversionStats;
}

interface GeneratedFile {
  path: string;
  content: string;
  type: 'case-class' | 'enum' | 'object' | 'runtime' | 'test';
  sourceFile: string;
}
```

---

## API Specification

🟡 **Partial — real endpoints exist but not these ones.** No `/api/projects*` resource exists (⬜ Vision — there is no project model at all, see "Data Models" above). The real, working conversion endpoints today are `POST /api/convert/parse`, `POST /api/convert/scala`, `POST /api/convert/batch`, and `GET /api/convert/runtime` (`Thyraa-COBOL-main/backend/api/routes/conversion.routes.js`) — synchronous, not job-queued, and not scoped to a project ID. The real analysis endpoints are `POST /api/analyze`, `DELETE /api/analyze/cache`, `GET /api/analyze/:jobId/status`, `GET /api/analyze/:jobId/result` (`analysis.routes.js`) — these *are* queued via Bull. `/api/projects/{id}/validate`, `/api/projects/{id}/conversion`-as-a-resource, and the entire `/api/ai/*` family below are ⬜ Vision — none exist in the codebase.

### New Endpoints for Unified Platform

```yaml
# Analysis (existing Thyraa endpoints)
POST /api/projects
  - Create new project

POST /api/projects/{id}/analyze
  - Start analysis job

GET /api/projects/{id}/analysis
  - Get analysis results

# Conversion (NEW - calls Scala engine)
POST /api/projects/{id}/convert
  - Start conversion job
  Request:
    {
      "files": ["CUSTOMER.cpy", "TRANSACTION.cpy"],
      "options": {
        "packageName": "com.bank.models",
        "generateTests": true,
        "aiDocumentation": true
      }
    }
  Response:
    {
      "jobId": "conv-123",
      "status": "queued"
    }

GET /api/projects/{id}/conversion
  - Get conversion results
  Response:
    {
      "status": "completed",
      "files": [
        {
          "path": "Customer.scala",
          "content": "case class Customer...",
          "type": "case-class"
        }
      ]
    }

# Validation (NEW)
POST /api/projects/{id}/validate
  - Start validation job

GET /api/projects/{id}/validation
  - Get validation results

# AI Enhancement
POST /api/ai/document
  - Generate documentation for code

POST /api/ai/explain
  - Explain COBOL code in plain English

POST /api/ai/extract-rules
  - Extract business rules from code
```

---

## Directory Structure (Unified)

🟡 **Partial — real layout differs in important ways.** The actual repo layout is `Thyraa-COBOL-main/src/` (frontend), `Thyraa-COBOL-main/backend/` (API + engine), with no top-level `thyraa/` monorepo root. Marked below: ✅ = exists as pictured, 🟡 = exists but different in kind, ⬜ = does not exist.

```
thyraa/
├── frontend/                    # ✅ exists, as Thyraa-COBOL-main/src/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Index.tsx                # ✅ exists
│   │   │   ├── GetStarted.tsx           # ✅ exists
│   │   │   ├── AnalysisResults.tsx      # ✅ exists
│   │   │   ├── ConversionResults.tsx    # 🟡 exists as ScalaConverter.tsx (different name/shape)
│   │   │   └── ValidationResults.tsx    # ⬜ does not exist
│   │   ├── components/
│   │   │   ├── analysis/
│   │   │   ├── conversion/              # ⬜ NEW — not present
│   │   │   └── validation/              # ⬜ NEW — not present
│   │   └── lib/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                     # ✅ exists, as Thyraa-COBOL-main/backend/
│   ├── src/
│   │   └── server.js                    # ✅ exists
│   ├── api/
│   │   ├── routes/
│   │   │   ├── analyze.routes.js        # ✅ exists
│   │   │   ├── convert.routes.js        # ✅ exists, as conversion.routes.js
│   │   │   └── validate.routes.js       # ⬜ NEW — does not exist
│   │   └── controllers/                 # ✅ exists (analysis.controller.js, conversion.controller.js)
│   ├── packages/
│   │   ├── github-ingestion/            # ✅ exists
│   │   ├── cobol-analysis/              # ✅ exists (regex-level parsing)
│   │   └── cobol-to-scala/              # ✅ exists — this is the real, hardened engine (see "Implementation Status"); NOT pictured in this original diagram at all, which only anticipated it living under scala-engine/
│   ├── services/
│   │   └── scala-engine.service.js      # ⬜ NEW — does not exist; conversion is called in-process, no service-call layer needed because there's no separate service
│   └── package.json
│
├── scala-engine/                # ⬜ Vision — this entire directory/service does not exist. The real conversion engine
│   ├── build.sbt                #   lives at backend/packages/cobol-to-scala/ and is plain JavaScript (see "Scala
│   │                             #   Engine Integration" above) — there is no build.sbt, no Main.scala HTTP server,
│   │                             #   and no separate Dockerfile for it. Its real files are parser/lexer.js,
│   │                             #   parser/*-parser.js, generator/*.js, runtime/*.scala (only the *emitted runtime
│   │                             #   helpers* are Scala — the engine itself is not).
│   ├── src/main/scala/
│   │   └── com/thyraa/
│   │       ├── Main.scala               # ⬜ does not exist
│   │       ├── api/
│   │       │   └── ConversionApi.scala  # ⬜ does not exist
│   │       ├── parser/
│   │       │   ├── Lexer.scala          # ⬜ does not exist as Scala; real equivalent is parser/lexer.js
│   │       │   ├── CopybookParser.scala # ⬜ does not exist as Scala; real equivalent is parser/copybook-resolver.js + data-division-parser.js
│   │       │   └── Ast.scala            # ⬜ does not exist as Scala; AST is plain JS objects
│   │       ├── analyzer/
│   │       │   └── TypeMapper.scala     # ⬜ does not exist as Scala; type mapping lives in generator/*.js
│   │       ├── generator/
│   │       │   └── ScalaGenerator.scala # ⬜ does not exist as Scala; real equivalent is generator/scala-generator.js (JS emitting Scala text)
│   │       └── runtime/
│   │           └── CobolTypes.scala     # ✅ this one is real — runtime/CobolTypes.scala and runtime/CobolCodecs.scala exist and are genuine Scala, embedded into generated output
│   └── Dockerfile                       # ⬜ does not exist
│
├── ai-service/                  # ⬜ Vision — does not exist, no Python AI service anywhere in repo
│   ├── src/
│   │   ├── documentation.py
│   │   ├── explanation.py
│   │   └── rule_extraction.py
│   └── Dockerfile
│
├── docker/                      # ⬜ Vision — no docker/ directory, no compose files anywhere in repo
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── nginx/
│       └── nginx.conf
│
├── k8s/                         # ⬜ Vision — no k8s/ directory or manifests anywhere in repo
│   ├── frontend.yaml
│   ├── backend.yaml
│   ├── scala-engine.yaml
│   ├── redis.yaml
│   └── postgres.yaml
│
└── docs/                        # ✅ exists (this docs/ directory), though with different filenames than pictured —
    ├── architecture.md          #   see this file, PROGRESS_STATUS.md, ADVERSARIAL_ROUNDS_REPORT.md, CAPABILITY_AUDIT_AND_ROADMAP.md, etc.
    ├── api.md
    └── deployment.md
```

---

## Deployment Architecture

⬜ **Vision — entirely unbuilt.** Confirmed by filesystem search: there is no `Dockerfile`, no `docker-compose.yml`, and no Kubernetes manifest anywhere in this repo as of 2026-07-23. No container image has ever been built for any component. This was never in scope for the (now-complete) 40-round engine campaign, which was engine-only. Both subsections below (Docker Compose and Kubernetes) describe a deployment model that does not exist yet in any form, not even a partial one.

### Docker Compose (Development/Small Scale)

```yaml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "3002:3002"
    environment:
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=postgres://postgres:5432/thyraa
      - SCALA_ENGINE_URL=http://scala-engine:8080
    depends_on:
      - redis
      - postgres
      - scala-engine

  scala-engine:
    build: ./scala-engine
    ports:
      - "8080:8080"
    environment:
      - AI_API_KEY=${CLAUDE_API_KEY}

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=thyraa
      - POSTGRES_USER=thyraa
      - POSTGRES_PASSWORD=thyraa
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Kubernetes (Production/Enterprise)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KUBERNETES CLUSTER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   Ingress        │  thyraa.company.com                                  │
│  │   Controller     │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ├──────────────────┬──────────────────┐                          │
│           ▼                  ▼                  ▼                          │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│  │   Frontend      │ │   Backend       │ │   Scala Engine  │              │
│  │   (3 replicas)  │ │   (3 replicas)  │ │   (3 replicas)  │              │
│  │                 │ │                 │ │                 │              │
│  │   React SPA     │ │   Node.js API   │ │   JVM Service   │              │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘              │
│                              │                  │                          │
│                              ▼                  ▼                          │
│  ┌─────────────────────────────────────────────────────────┐              │
│  │                     StatefulSets                        │              │
│  │                                                         │              │
│  │  ┌─────────────────┐  ┌─────────────────┐              │              │
│  │  │     Redis       │  │   PostgreSQL    │              │              │
│  │  │   (HA Cluster)  │  │   (HA Cluster)  │              │              │
│  │  └─────────────────┘  └─────────────────┘              │              │
│  │                                                         │              │
│  └─────────────────────────────────────────────────────────┘              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────┐              │
│  │                   Persistent Volumes                    │              │
│  │                                                         │              │
│  │  • Source files    • Generated code    • Audit logs     │              │
│  └─────────────────────────────────────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Architecture

⬜ **Vision — entirely unbuilt, and today's actual posture is the opposite of this diagram.** Per `docs/ENTERPRISE_READINESS_GAP_ANALYSIS.md` §1 (confirmed independently in this pass): all API endpoints are completely open with **zero authentication**, CORS is configured as `cors()` with no origin restriction (`server.js`), there is no TLS/HTTPS termination, no RBAC, no encryption at rest, no PII detection, and no compliance program of any kind. None of NETWORK SECURITY, AUTHENTICATION, AUTHORIZATION, DATA PROTECTION, or COMPLIANCE below exist in even a partial form.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  NETWORK SECURITY                                                           │
│  ─────────────────                                                          │
│  • TLS 1.3 everywhere                                                       │
│  • Network policies (pod-to-pod isolation)                                  │
│  • Private subnets for databases                                            │
│  • WAF at ingress                                                           │
│                                                                             │
│  AUTHENTICATION                                                             │
│  ──────────────────                                                         │
│  • OAuth 2.0 / OIDC (enterprise SSO)                                        │
│  • SAML 2.0 support                                                         │
│  • API key authentication for CLI                                           │
│  • JWT tokens with short expiry                                             │
│                                                                             │
│  AUTHORIZATION                                                              │
│  ─────────────────                                                          │
│  • RBAC (Admin, Developer, Viewer)                                          │
│  • Project-level access control                                             │
│  • Audit logging for all actions                                            │
│                                                                             │
│  DATA PROTECTION                                                            │
│  ─────────────────                                                          │
│  • Encryption at rest (AES-256)                                             │
│  • Encryption in transit (TLS)                                              │
│  • No source code leaves customer environment (on-premise)                  │
│  • Automatic PII detection and masking                                      │
│                                                                             │
│  COMPLIANCE                                                                 │
│  ───────────                                                                │
│  • SOC 2 Type II                                                            │
│  • ISO 27001                                                                │
│  • GDPR compliant                                                           │
│  • Full audit trail                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

> **Note (2026-07-23):** these are the *platform-integration* phases (1–6, below) — do not confuse them with the conversion engine's own internal build phases referenced in "Implementation Status" above (data layer, procedure logic, EXEC SQL/JCL, CICS scaffolding), which are a completely different numbering scheme and are already built. Everything below is still ⬜ Vision except where noted.

### Phase 1: Integration Foundation (2-3 weeks)
- [ ] Set up monorepo structure — ⬜ not done, repo is not structured as pictured
- [x] ~~Create Scala HTTP service wrapper around cobol2scala~~ — superseded: the engine is called in-process instead (see "Scala Engine Integration"); no wrapper service exists or is needed for the current architecture
- [x] Add conversion endpoints to Node.js backend — ✅ done (`/api/convert/parse`, `/scala`, `/batch`, `/runtime`), though synchronous, not job-queued
- [ ] Create service communication layer — ⬜ not applicable/not done (no separate service to communicate with)
- [ ] Docker Compose for local development — ⬜ not done

### Phase 2: Unified UI (2-3 weeks)
- [x] Add conversion workflow to React UI — 🟡 partial: a conversion page (`ScalaConverter.tsx`) exists, but not the full workflow pictured
- [ ] Create code review component — ⬜ not done
- [ ] Add side-by-side COBOL/Scala view — ⬜ not done
- [ ] Implement conversion progress tracking — ⬜ not done
- [ ] Add download/export functionality — ⬜ not done

### Phase 3: AI Enhancement (1-2 weeks)
- [ ] Integrate Claude API for documentation — ⬜ not done, no AI integration exists in the backend
- [ ] Add "Explain this code" feature — ⬜ not done
- [ ] Implement business rule extraction — ⬜ not done
- [ ] Create inline documentation generation — ⬜ not done

### Phase 4: Validation Engine (2-3 weeks)
- [x] Build Scala test runner — 🟡 partial, but not the product feature pictured: `tests/oracle/` is a real, working oracle-comparison harness against GnuCOBOL, used internally by the engine's own adversarial-verification campaign (now complete at 40 rounds: ~2,017 tests — 898 unit + 1,119 oracle — 0 failures, 574 corpus programs) — it is a developer test tool, not a UI-facing "Validation Engine" a customer triggers per-project
- [x] Implement dual-run comparison — ✅ done, but as above: internal to the engine's own test suite, not exposed as a platform feature
- [ ] Create validation dashboard — ⬜ not done
- [ ] Add metrics and reporting — ⬜ not done (as a product feature; the engine's own `docs/PROGRESS_STATUS.md` closing report and `docs/ADVERSARIAL_ROUNDS_REPORT.md` are reports, but human-authored ones, not a generated dashboard)

### Phase 5: Enterprise Features (2-3 weeks)
- [ ] Add user authentication (OAuth/SAML) — ⬜ not done
- [ ] Implement RBAC — ⬜ not done
- [ ] Create audit logging — ⬜ not done
- [ ] Add project management features — ⬜ not done
- [ ] Kubernetes deployment manifests — ⬜ not done

### Phase 6: Polish & Launch (1-2 weeks)
- [ ] Documentation — 🟡 partial: extensive engine-side docs exist (`docs/PROGRESS_STATUS.md`, `docs/ADVERSARIAL_ROUNDS_REPORT.md`, `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`, `docs/AUTONOMOUS_BUILD_LOG.md`, this document); platform-side docs (api.md, deployment.md) do not
- [ ] Performance optimization — ⬜ not evaluated at platform level
- [ ] Security audit — ⬜ not done (informal gap analysis exists: `docs/ENTERPRISE_READINESS_GAP_ANALYSIS.md`, but no formal audit)
- [ ] Beta testing with pilot customer — ⬜ not done

---

## Technology Summary

| Component | Technology | Purpose | Status (2026-07-23) |
|-----------|------------|---------|---|
| Frontend | React + TypeScript + Tailwind | User interface | 🟡 Partial — real, narrower than pictured |
| API Gateway | Express.js | Route handling, orchestration | 🟡 Partial — real routes, no gateway-grade features (auth, rate limiting) |
| Analysis Engine | Node.js | GitHub ingestion, dependency analysis | 🟡 Partial — real, but regex-level parsing, not a full COBOL AST |
| Conversion Engine | ~~Scala 3 + http4s~~ Node.js/JavaScript, emitting Scala 3 source | COBOL parsing, Scala generation | ✅ Built & verified — 574 oracle-verified corpus programs, ~2,017 tests (0 failures) across a completed 40-round adversarial campaign; see "Implementation Status" |
| Job Queue | Bull + Redis | Async job processing | 🟡 Partial — real for analysis only; conversion is not queued |
| Database | PostgreSQL | Project data, results, audit | ⬜ Vision — no PostgreSQL anywhere in the repo |
| Cache | Redis | API caching, session store | 🟡 Partial — real, used by the analysis pipeline |
| AI | Claude API | Documentation, explanation | ⬜ Vision — no integration exists |
| Container | Docker | Packaging |
| Orchestration | Kubernetes | Production deployment |

---

## Success Metrics

⬜ **Vision — these are unmeasured targets, not reported results.** None of these have an instrumented measurement pipeline (no telemetry, no dashboard). The one row with a real, closely-related, *independently measured* number is "Conversion success rate": the actual engine-side result as of 2026-07-23, at the close of the full 40-round adversarial campaign, is **574 oracle-verified corpus programs** (563 `.cbl` compiling and running clean under real GnuCOBOL, plus 11 `.cbl.txt` probes whose own correct behavior is a compile rejection) and **~2,017 automated tests passing, 0 failures** (898 unit + 1,119 oracle, plus 45 honest documented todos) — a stronger and more specific claim than the "95%/85%" estimate below, but it is a corpus-verification statistic (measured against a curated, growing adversarial test corpus), not a measurement of "success rate on arbitrary customer programs," so the two numbers aren't directly comparable. All other rows (analysis accuracy, processing speed, UI/API response time, validation pass rate, customer satisfaction) remain aspirational targets with no measurement in place.

| Metric | Target |
|--------|--------|
| Analysis accuracy | 99% (dependency detection) |
| Conversion success rate | 95% (copybooks), 85% (programs) |
| Processing speed | 10,000 LOC/minute |
| UI response time | < 200ms |
| API response time | < 500ms |
| Validation pass rate | 98% |
| Customer satisfaction | 4.5/5 |

---

## Next Steps

*(Original 2026-02-08 next-steps list, kept as-is below for the historical record. As of 2026-07-23, with the 40-round adversarial campaign now complete, items 3–5 have effectively been superseded: no monorepo was created, and rather than a separate Scala HTTP service, the conversion engine was built and hardened in-place as a Node.js package inside the existing `backend/packages/` structure — see "Scala Engine Integration" above. The real next step today is the platform work in "STILL VISION" at the top of this document: auth, job orchestration for conversion, a real validation product feature, and deployment infra, now that the engine itself is no longer the risky part — though see the engine-internal gaps also listed there (reference modification, indexed/VSAM files, GROUP+OCCURS BY REFERENCE into non-recursive subprograms) for what "no longer the risky part" does not yet cover.)*

1. **Share this architecture with your friend**
2. **Agree on the integration approach** (HTTP microservice recommended)
3. **Set up the monorepo structure**
4. **Create the Scala HTTP service**
5. **Build the integration layer in Node.js**
6. **Iterate on the unified workflow**

**Ready to build? Let's start with Phase 1!**
