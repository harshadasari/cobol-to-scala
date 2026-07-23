# Enterprise Readiness Gap Analysis

**Original analysis date:** 2026-02-09
**Updated 2026-07-23 (engine dimensions only)**
**Scope:** Full codebase analysis of cobol-to-scala platform
**Overall Enterprise Readiness Score: 4.5 / 10** (was 3.5/10 on 2026-02-09)

---

> ## Update banner — 2026-07-23 (campaign complete, ran to round 40)
>
> Between 2026-02-09 and 2026-07-23, an autonomous adversarial-verification campaign
> hardened **one subsystem only** — the COBOL→Scala conversion engine at
> `Thyraa-COBOL-main/backend/packages/cobol-to-scala/`. The campaign ran in two phases:
> an initial **14 rounds**, reported on 2026-07-11 (110 bugs fixed, corpus grown to 209
> programs, 879 tests), then — at the owner's explicit request — **resumed and run to
> completion at round 40**. Across the full 40 rounds the campaign fixed **241 total
> dishonest findings** (110 in rounds 1-14, 131 in rounds 15-40), grew the real-compiler-
> verified corpus from 48 to **574 GnuCOBOL-oracle-verified programs** (563 `.cbl` clean
> under real GnuCOBOL + 11 `.cbl.txt` whose correct behavior is a nonzero cobc exit), and
> grew the engine's own automated test count to **~2,017 tests** (898 unit + 1,119
> oracle), **0 failures**, with **45 honestly documented `t.todo()` entries**. The
> campaign's own convergence bar (0-2 findings for two consecutive rounds) was met
> exactly once, briefly, at rounds 36-37 — before rounds 38-40 deliberately broadened the
> search and found bugs again at an *increasing* rate (6, 7, 8), including two previously
> entirely-unimplemented statements (`REPLACE`, `PROGRAM-ID ... INITIAL`) discovered as
> late as round 40. **This is not "adversarially exhausted."** Full details, method, and
> an honest list of what still isn't verified: **`docs/ADVERSARIAL_ROUNDS_REPORT.md`**
> (original 14-round report), **`docs/PROGRESS_STATUS.md`** (closing report for the full
> campaign), **`docs/CAPABILITY_AUDIT_AND_ROADMAP.md`** (statement-level capability
> audit), and `tests/oracle/README.md` (full 40-round finding ledger).
>
> **Every other dimension of this platform is unchanged.** No security work, no
> authentication, no CI/CD, no containerization, no observability, no compliance work,
> and no frontend/API test coverage happened in this window — running the campaign out
> to round 40 changed nothing about that. This overall score stays at **4.5**, unmoved
> even by the engine's further progress from round 14 to round 40, precisely because 7 of
> the 10 scorecard dimensions below are identical to February and gate the platform
> regardless of engine correctness. **A correct conversion engine is necessary but not
> sufficient for a production platform** — security, infrastructure, CI/CD, and
> observability remain the gating blockers to enterprise deployment, exactly as they
> were five months ago, and are now the *sole* gating blockers, since the engine is the
> one dimension that materially improved. Anyone citing "the engine got dramatically
> better" as evidence the *platform* is enterprise-ready is misreading this document.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Security Gaps (CRITICAL)](#2-security-gaps)
3. [Authentication & Authorization (CRITICAL)](#3-authentication--authorization)
4. [COBOL Parser Coverage Gaps](#4-cobol-parser-coverage-gaps)
5. [Scala Generator Correctness Gaps](#5-scala-generator-correctness-gaps)
6. [Testing Infrastructure Gaps](#6-testing-infrastructure-gaps)
7. [Infrastructure & DevOps Gaps](#7-infrastructure--devops-gaps)
8. [Observability & Monitoring Gaps](#8-observability--monitoring-gaps)
9. [Frontend Gaps](#9-frontend-gaps)
10. [Documentation Gaps](#10-documentation-gaps)
11. [Planned vs Actual Architecture](#11-planned-vs-actual-architecture)
12. [Remediation Roadmap](#12-remediation-roadmap)

---

## 1. Executive Summary

The cobol-to-scala platform has a solid architectural vision. As of 2026-02-09, it had a functional-but-shallow COBOL parsing + Scala generation pipeline for simple programs; as of 2026-07-23, that one pipeline — the conversion engine — has been adversarially hardened across a full 40-round campaign against a real GnuCOBOL compiler oracle (574 verified programs, ~2,017 tests with 0 failures, 241 root-cause bugs fixed; see the banner above). The platform as a whole, however, is **still not ready for enterprise deployment**. Nothing changed in this window for security, authentication, infrastructure/DevOps, observability, or compliance — those remain exactly as gap-ridden as they were five months ago, and are now the sole gating blockers since the engine is the one dimension that materially improved. The codebase still represents roughly **35-45% of the planned platform**: substantially further along on COBOL language coverage and Scala generation correctness than in February, but with the same critical gaps across security, testing (outside the engine), infrastructure, and compliance.

### Scorecard

| Dimension                     | Score | Notes                                      |
|-------------------------------|-------|---------------------------------------------|
| Security                      | 2/10  | No auth, no CSRF, debug code in production. Unchanged since 2026-02-09; still true as of 2026-07-23 — no security work occurred in this window. |
| COBOL Language Coverage       | 7/10 (was 4/10) | Broad and now **oracle-verified**: 574 programs byte-diffed against real GnuCOBOL output across the full 40-round adversarial campaign (14 rounds reported 2026-07-11, then resumed and run to completion by 2026-07-23), covering full procedure logic, byte-level codecs (packed decimal/COMP-3, binary, zoned, EBCDIC, IEEE-754 COMP-1/COMP-2), COPY/REPLACE nesting plus standalone `REPLACE`, DECLARATIVES, RECURSIVE programs, LINAGE, FILE STATUS lifecycle, real RELATIVE-organization file I/O (rewritten in round 29 after a serious silent-corruption finding), same-file multi-program CALL, and SECTIONs. Not 10/10: reference-modification codegen (the single largest remaining risk), `ORGANIZATION IS INDEXED`/VSAM (unimplemented and unverifiable in this sandbox), `CALL BY REFERENCE` of a GROUP+OCCURS into a non-recursive callee (silently passes empty data), SORT USING/GIVING (whole-file form), external/dynamic CALL, OCCURS DEPENDING ON dynamic sizing, general GO TO webs, CICS behavioral conversion, SQL not wired into the main generator path remain open; oracle is GnuCOBOL, not IBM Enterprise COBOL; the campaign's own convergence bar was met only once, briefly (rounds 36-37), before broadening the search found bugs again at an increasing rate through round 40 — so this is not adversarially exhausted. See §4. |
| Scala Generation Correctness  | 8/10 (was 4/10) | The campaign's core win: 241 silent-correctness bugs (wrong output, crashes, hangs — none of which produced a compile error) fixed at root cause across the full 40-round campaign; all 574 corpus programs are byte-equivalent to real-compiler output (or correctly reject, for the 11 deliberately-invalid `.cbl.txt` probes). Not 10/10 for the same reasons as above — GnuCOBOL-only oracle, not adversarially exhausted (rounds 38-40 found bugs at an increasing rate right through the final round), and a documented list of Known Gaps (`tests/oracle/README.md`, `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`) remains open by design — most notably reference modification and non-recursive GROUP+OCCURS CALL BY REFERENCE. See §5. |
| Test Coverage                 | 4/10 (was 1/10) | The **engine package alone** now has ~2,017 tests (898 unit + 1,119 oracle), 0 failures, plus a live compiler-oracle harness (real `cobc`/`scala-cli`) — a large jump for that one package, up from 879 at the round-14 checkpoint. Stays well below the platform average because the platform still has **zero** frontend tests, zero API/E2E tests, zero security tests (SAST/DAST/fuzz), and no CI automation anywhere — see §6. |
| Infrastructure / DevOps       | 0/10  | No Docker, no CI/CD, no K8s. Unchanged since 2026-02-09; still true as of 2026-07-23. |
| Observability                 | 1/10  | Console.log only, minimal health check. Unchanged since 2026-02-09; still true as of 2026-07-23. |
| Frontend Quality              | 5/10  | Good UI foundation, missing auth & tests. Unchanged since 2026-02-09; still true as of 2026-07-23. |
| Documentation                 | 6/10 (was 5/10) | Good architecture docs, missing ops guides (still true). Bumped one point for the new, unusually rigorous engineering documents produced by this campaign — `docs/ADVERSARIAL_ROUNDS_REPORT.md` (rounds 1-14), `docs/PROGRESS_STATUS.md` (closing report for the full 40-round campaign), and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`, plus the 2,000+ line verification ledger `tests/oracle/README.md` — which document methodology, findings, and honest known-gaps with a rigor well above the rest of the doc set. Still missing: OpenAPI spec, deployment guide, runbooks, SECURITY.md, CHANGELOG. |
| API Completeness              | 3/10  | ~30% of planned endpoints implemented. Unchanged since 2026-02-09; still true as of 2026-07-23. |
| Compliance Readiness          | 0/10  | No SOC2, GDPR, audit trail, or encryption. Unchanged since 2026-02-09; still true as of 2026-07-23. |

**Why the overall score only moves 3.5 → 4.5, not further:** the overall score is a holistic judgment of production-readiness, not a raw average of the ten rows above — and production-readiness is gated by its weakest blocking dimensions, not lifted by its strongest one. Security (2), Infrastructure/DevOps (0), Observability (1), and Compliance (0) are unconditional blockers for any enterprise deployment regardless of how correct the conversion engine is, and all four are completely untouched since February. A three-point jump in Scala Generation Correctness and a three-point jump in COBOL Language Coverage are real and substantial engine-level achievements, but they address only 2 of the 10 dimensions that gate enterprise readiness in any complete sense. The one-point Test Coverage move and one-point Documentation move are both explicitly *engine-adjacent* side effects of the same campaign, not independent platform progress. Read this as: **the hardest, most differentiated technical problem (COBOL semantic correctness) is now substantially de-risked; the operationally mandatory but comparatively mundane work (auth, CI/CD, monitoring, compliance) has not been started.** Running the same campaign on from its round-14 checkpoint to its round-40 completion moved the engine sub-dimensions further (see §4/§5) but did not add any new dimension to this list or move the overall score past 4.5 — the four blocking dimensions above are exactly as untouched today as they were at round 14.

---

## 2. Security Gaps

*Still true as of 2026-07-23 — no work occurred in this area between 2026-02-09 and this update (the engine campaign that ran through 2026-07-23 was scoped entirely to the conversion engine). Everything below is exactly as it was in the original analysis.*

### 2.1 CRITICAL: Debug Telemetry Code Left in Production

**Files affected:**
- `backend/api/controllers/analysis.controller.js` (line ~121)
- `src/components/get-started/AnalysisProgress.tsx` (line ~159)

**Issue:** Hardcoded `fetch()` calls send application data (job IDs, analysis results, internal state) to `http://127.0.0.1:7242/ingest/<hardcoded-uuid>`. This is debug/telemetry code that:
- Transmits internal application state to an external endpoint
- Uses silent error handling (`.catch(() => {})`) to hide failures
- Contains hardcoded session/run IDs indicating test code
- Represents a **potential data exfiltration vector** in production

**Recommendation:** Remove immediately.

### 2.2 No Request Size Limits

**File:** `backend/src/server.js` (line ~13)

```javascript
app.use(express.json()); // No size limit configured
```

Unbounded JSON payloads enable denial-of-service via memory exhaustion. A single multi-GB request could crash the server.

**Recommendation:** Add `express.json({ limit: '10mb' })`.

### 2.3 No Security Headers

**Missing entirely:**
- No `helmet.js` middleware (Content-Security-Policy, X-Frame-Options, HSTS, X-Content-Type-Options)
- No HTTP Parameter Pollution protection
- No XSS protection headers

### 2.4 CORS Open to All Origins

**File:** `backend/src/server.js` (line ~12)

```javascript
app.use(cors()); // Allows all origins
```

This permits any website to make authenticated requests to the API, enabling CSRF attacks.

**Recommendation:** Whitelist specific allowed origins.

### 2.5 No CSRF Protection

No CSRF token generation or validation exists anywhere in the codebase. All state-mutating POST endpoints are vulnerable.

### 2.6 No Rate Limiting on HTTP Endpoints

The only rate limiter is for outbound GitHub API calls (in-memory, non-distributed). No HTTP endpoint rate limiting exists, leaving the server vulnerable to brute-force and resource-exhaustion attacks.

### 2.7 Potential Path Traversal

**File:** `backend/api/controllers/conversion.controller.js` (lines ~71-86)

The `getRuntime()` method reads files from a directory using `path.join(process.cwd(), ...)` without validating resolved paths stay within the expected directory. No symlink protection.

### 2.8 No Secrets Management

- GitHub tokens stored as plaintext environment variables
- No encryption at rest
- No secret rotation mechanism
- No integration with vaults (HashiCorp Vault, AWS Secrets Manager)
- No `.env.example` file documenting required variables

---

## 3. Authentication & Authorization

*Still true as of 2026-07-23 — no work occurred in this area between 2026-02-09 and this update (the engine campaign that ran through 2026-07-23 was scoped entirely to the conversion engine). Everything below is exactly as it was in the original analysis.*

### 3.1 Zero Authentication

**Every API endpoint is publicly accessible.** No middleware for:
- API keys
- JWT tokens
- OAuth 2.0 / OIDC
- SAML 2.0
- Session management

Any user on the network can:
- Trigger expensive GitHub repository analysis (`POST /api/analyze`)
- Process arbitrary COBOL code (`POST /api/convert/*`)
- Clear all cached data (`DELETE /api/analyze/cache`)
- Access any job result without ownership verification

### 3.2 Zero Authorization / RBAC

- No user model or roles
- No project-level permissions
- No resource ownership checks
- Admin operations (cache clear) accessible to everyone

### 3.3 No Audit Trail

- No logging of who performed what action
- No database persistence of operations
- No compliance-grade audit records

---

## 4. COBOL Parser Coverage Gaps

> **Update 2026-07-23:** the sections below are cross-checked against the live verification
> ledger, `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md`, and
> `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` — both fully updated for the completed 40-round
> campaign (an initial 14 rounds reported 2026-07-11; resumed and run to completion by
> 2026-07-23). Items are marked **FIXED** only where the ledger's "Current inventory" /
> round tables / Known Gaps section confirm oracle-verified behavior; everything else is
> left as originally assessed, or narrowed to the specific sub-case that remains open.
> This reflects the engine only — no other part of the platform changed.

### 4.1 What Works (Good Coverage)

- Basic data types: `PIC X`, `PIC 9`, `PIC S9`, `PIC A`
- Computational types: COMP-1, COMP-2, COMP-3, COMP-4, COMP-5 (real IEEE-754 codecs for COMP-1/COMP-2 built during rounds 15-40)
- Fixed OCCURS clauses (arrays)
- REDEFINES (**FIXED for most shapes** — see §5.2; one narrow group-with-OCCURS-over-group-with-OCCURS shape remains a stub)
- Level 88 conditions (simple values, and now compound `WHEN SET TO FALSE` forms — **FIXED**, round 12 also closed an infinite-parser-loop crash on this construct)
- Basic file I/O: OPEN, CLOSE, READ, WRITE (**FIXED and oracle-verified for LINE SEQUENTIAL as of round 5**; **RELATIVE organization got a full storage-model rewrite in round 29** after the original line-delimited model was found to silently corrupt binary data containing a newline byte — the single most serious finding of the whole campaign — and now has real RELATIVE KEY random access, REWRITE/DELETE/START, and LINAGE/FILE STATUS lifecycle support, all oracle-verified). `ORGANIZATION IS INDEXED` (VSAM-style keyed access) remains genuinely unimplemented, and — uniquely among the engine's gaps — cannot even be oracle-verified in this project's own sandbox, since the installed GnuCOBOL build has indexed-file support compiled out — see §4.3.
- Arithmetic: ADD, SUBTRACT, MULTIPLY, DIVIDE, COMPUTE (**scale/rounding/truncation semantics FIXED** — see §4.2 and §5.3)
- Control flow: IF/ELSE, EVALUATE/WHEN (incl. TRUE/FALSE/ANY/ranges/arithmetic-expression subjects — **FIXED**), PERFORM (simple/TIMES/UNTIL/VARYING, incl. nested VARYING...AFTER — **FIXED**, see §4.2)
- CALL with USING/RETURNING, now including full same-file multi-`PROGRAM-ID` interop (**FIXED**, round 7), plus real `PROGRAM-ID ... RECURSIVE` support built across rounds 20-40 (per-activation LINKAGE aliasing, correct BY REFERENCE/CONTENT/VALUE writeback including for GROUP-shaped and subscripted operands) — a genuinely external or dynamic-name subprogram still emits a visible TODO marker rather than converting (documented gap, not a silent failure)
- Basic EXEC SQL (SELECT, INSERT, UPDATE, DELETE) — parsing and a standalone, compile-verified Doobie generator now exist (`generator/sql-gen.js`), but it is **still not wired into the main generator's output path** — see §4.3

### 4.2 CRITICAL Missing Features (P0) — original assessment vs. 2026-07-23 status

| Feature | 2026-02-09 status | 2026-07-23 status |
|---------|--------------|-----------------|
| **COPY/REPLACE with nesting** | Basic single-level only; not applied | **FIXED.** `parser/copybook-resolver.js` handles nested, cycle-safe COPY/REPLACE (OF/IN, pseudo-text and word replacement), wired through `options.copybooks`; standalone copybook fragments (no DATA DIVISION header) also parse. Oracle-verified via corpus programs `u09`/`u10`. Standalone source-level `REPLACE` (outside COPY) was found entirely unimplemented as late as round 40 and has now been implemented for real by reusing the same machinery. |
| **OCCURS DEPENDING ON** | Parsed, `dependingOn` captured; ignored at codegen | **Still OPEN**, unchanged through round 40. `dependingOn` is captured but `parse`/`format` are sized at a fixed maximum, not the live counter field — every occurrence now carries a visible `// TODO(ODO)` marker (an honest degradation, not a silent one, but the underlying capability is still missing) rather than silently guessing. Dynamic-length handling is not implemented. |
| **Reference modification** | Parsed (`refMod` with start:length); not generated | **Parser bug FIXED (round 3); codegen still open and now the single largest remaining risk in the engine.** The parser previously mis-parsed `identifier(start:length)` badly enough to corrupt the rest of the statement's token stream — that corruption is fixed. Actual read/write substring semantics still degrade to a visible, compiling `???`/placeholder almost everywhere (a handful of narrow carve-outs exist: literal-length `FUNCTION LENGTH`, STRING's own segment source) — confirmed still open through the full 40-round campaign and flagged by the closing report as the top item to check before trusting a converted program's output, since ref-mod is extremely common in production COBOL. |
| **CALL BY REFERENCE/CONTENT/VALUE** | Parsed (`mode` field in AST); all treated as by-reference | **Substantially FIXED for same-file and RECURSIVE targets; a specific non-recursive shape still silently wrong.** Same-file multi-`PROGRAM-ID` CALL correctly marshals arguments via a value-in/tuple-out model approximating BY REFERENCE mutation (round 7), and a `PROGRAM-ID ... RECURSIVE` callee gets real per-leaf aliasing for GROUP+OCCURS operands (rounds 22, 39). **`CALL BY REFERENCE`/`CONTENT` of a GROUP containing an OCCURS table into an ordinary (non-recursive) subprogram remains open**: it compiles and runs with no crash, but the callee silently sees a default/empty table instead of the caller's real data (only a source-comment marker, not a runtime signal) — flagged by the round-40 completeness audit as a good next target, since it could reuse the same `flattenGroupLeaves` machinery. External/dynamic-name CALL still emits a TODO marker rather than converting. |
| **Decimal arithmetic scale tracking** | Partial; scale not passed to arithmetic ops | **FIXED.** `storeNumericExpr`/`storeNumericByInfo` (round 3) now apply COBOL's real store-time semantics on every arithmetic statement: `ROUNDED` present → HALF_UP to the target's declared decimal digits; absent → truncate toward zero — verified directly against `cobc` (e.g. `COMPUTE X = 2.345` into a 2-decimal target with no ROUNDED now stores `2.34`, matching real GnuCOBOL, not display-time-rounded `2.35`). `ON SIZE ERROR` overflow checking was also implemented (round 1), later extended (round 38) so multi-target COMPUTE/arithmetic with `ON SIZE ERROR` uses COBOL's correct per-target-independent store rule rather than an all-or-nothing one. |
| **SEARCH / SEARCH ALL** | Keyword recognized only; no parser or generator | **FIXED.** Real binary search for SEARCH ALL, including `VARYING other-index` and composite/multi-key tie-breaking, oracle-verified. |
| **SORT / MERGE** | Keyword recognized only; no parser or generator | **FIXED for the procedural form** (multi-key, mixed ASCENDING/DESCENDING, INPUT/OUTPUT PROCEDURE, THRU ranges) — oracle-verified; MERGE's own `... USING file1 file2 ... OUTPUT PROCEDURE` form is also implemented (round 18). **Still OPEN:** the whole-file `SORT ... USING <file> GIVING <file>` form (no INPUT/OUTPUT PROCEDURE) — and MERGE's equivalent `GIVING` form — emit a visible TODO marker rather than converting (round 40's completeness audit flagged this as newly tractable, since MERGE's own implementation built much of the needed machinery). |

### 4.3 HIGH Missing Features (P1) — original assessment vs. 2026-07-23 status

| Feature | 2026-02-09 status | 2026-07-23 status |
|---------|--------|--------|
| **CICS commands** (SEND, RECEIVE, XCTL, LINK) | Parser recognizes syntax; no Scala generation | **Partially improved, still fundamentally OPEN.** A CICS/BMS classifier and an honest Scala service-*skeleton* generator now exist (`generator/cics-gen.js`) — request/response DTOs, repository traits, call stubs — but every method body that could be mistaken for real logic is deliberately `???`. This is **not a behavioral converter**; online transaction programs are still non-functional as generated code, just more honestly scaffolded than before. Unchanged across rounds 15-40. |
| **Dynamic SQL** (PREPARE/EXECUTE) | Not implemented | Still not implemented; unrelated to the standalone Doobie generator progress noted in §4.1. |
| **Cursor operations** (OPEN/FETCH/CLOSE) | Parser stub; generator incomplete | Doobie generation now models cursors as materialized streams (compile-verified in isolation), but this is **not wired into the main generator path** — a program run through `convertToScala()` today gets none of this. |
| **Complex PIC patterns** (Z, *, $, floating sign, SIGN LEADING SEPARATE) | Partially parsed; typed as String | **Largely FIXED for numeric-edited fields.** The lexer became PIC-aware (round-1-era fix, `PICTURE_STRING` token) and numeric-edited formatting (Z/9/./,/CR/DB, `DECIMAL-POINT IS COMMA`) is now applied both at DISPLAY time and at VALUE-clause declaration time via `CobolFmt.edited`/`formatEditedPicture`, oracle-verified (e.g. round-4 finding q02, round-7 finding u03b). Asterisk check-protection (`***9.99`) and scaling-position `P` combined with COMP-3 are not called out as independently spot-checked in the ledger — treat as unconfirmed rather than fixed; see §4.4. |
| **VSAM / Indexed file access** | Organization parsed but treated as sequential | **Narrowed, one part FIXED.** `ORGANIZATION IS RELATIVE` got a full storage-model rewrite (round 29) plus real RELATIVE KEY access, REWRITE/DELETE/START (rounds 25-27), and FILE STATUS lifecycle (rounds 38-40) — all oracle-verified, no longer a stub. `ORGANIZATION IS INDEXED` (true VSAM-style keyed access) remains genuinely unimplemented, and — unlike every other gap in this document — cannot be oracle-verified at all in this sandbox, since the installed GnuCOBOL build has indexed-file support compiled out entirely (round 27). |
| **STRING/UNSTRING** | Parsed; generator produces comment stubs only | **FIXED.** Both statements, including STRING/UNSTRING `ON OVERFLOW`/`NOT ON OVERFLOW`, `WITH POINTER`, `DELIMITED BY ALL`, `DELIMITER IN`, and `COUNT IN`, are oracle-verified (rounds 4, 6). A prior unguarded copy loop that could crash with `StringIndexOutOfBoundsException` on overflow was also fixed (round 6); STRING's pointer value after an ON OVERFLOW truncation was also found and fixed (round 33). |
| **INSPECT REPLACING/TALLYING/CONVERTING** | Parsed; no Scala generation | **FIXED**, including `BEFORE INITIAL`/`AFTER INITIAL` region restriction (round 4) and correct multi-clause REPLACING snapshot semantics (round 14). |
| **SQL WHENEVER** (NOT FOUND / SQLERROR) | Recognized; not generated | Now generated in the standalone Doobie path (`generator/sql-gen.js`), but — same caveat as Dynamic SQL/Cursors above — **not wired into the main generator**, so this doesn't yet reach a real conversion. |
| **EVALUATE WHEN ALSO / WHEN THRU** | Partial parsing | **WHEN THRU (ranges) FIXED** and oracle-verified as part of the broader EVALUATE rewrite (round 2). Multi-subject `WHEN ... ALSO ...` is not explicitly confirmed in the ledger — treat as still unconfirmed/partial rather than fixed. |
| **PERFORM VARYING AFTER** (nested loops) | Only first AFTER captured | **FIXED.** Nested AFTER levels are now reset to FROM correctly at every level per cobc's actual documented algorithm, oracle-verified (round 4, finding q07). |
| **`PROGRAM-ID ... INITIAL`** | Not assessed in original analysis (not a known concept at the time) | **FIXED in round 40**, the campaign's final round: WORKING-STORAGE previously silently persisted across calls instead of resetting to VALUE-clause defaults every activation, the opposite of what INITIAL means — found entirely unimplemented as late as round 40 and implemented for real, mirroring the existing RECURSIVE-program detection pattern. |

### 4.4 PIC Clause Edge Cases

| Pattern | 2026-02-09 issue | 2026-07-23 status |
|---------|-------|-------|
| `PIC S9(7)V99 COMP-3` | Byte size calculation wrong (uses digit count, not COMP-3 encoding) | **FIXED.** Byte-accurate layout (`generator/layout.js`) is hand-verified for COMP-3 (e.g. `S9(13)V99 COMP-3` → 8 bytes) and oracle-verified across the corpus. |
| `PIC Z(9)9.99` | Recognized as edited but treated as plain String | **FIXED** — see §4.3; numeric-edited formatting is applied via `CobolFmt.edited`. |
| `PIC ***9.99` | Asterisk confuses lexer (treated as operator) | **Unconfirmed.** The lexer was rewritten to be PIC-aware, which plausibly fixes this class of bug, but neither the 14-round nor the full 40-round ledger calls out this exact asterisk check-protection pattern as independently verified. Left as an open/unconfirmed item rather than claiming a fix without evidence. |
| `PIC S9(5)P(3)` | Scaling position not applied to COMP-3 | **Largely FIXED (round 38).** The general `P`-scaling-position bug was found and fixed: trailing-P (`PIC S9(3)PPP`) and leading-P (`PIC SPPP9(3)`) forms previously computed the same, wrong scaled value; real scaling-position arithmetic is now applied. The ledger's round-38 fix addresses `P`-scaling generally rather than the COMP-3-specific combination called out in the original row, so treat the exact COMP-3 pairing as very likely fixed rather than independently spot-checked. |
| `PIC X(10)B(2)X(5)` | Parser stops at first pattern | **Unconfirmed / likely still open** — not mentioned as fixed anywhere in the verification ledger (rounds 1-40) or roadmap doc. |

### 4.5 Parser Error Recovery: Still Largely None

- No recovery to next statement boundary on parse error
- No error collection/reporting API
- Unknown statement keywords silently skipped
- Unmatched END statements (END-IF, END-PERFORM) not detected
- Malformed PIC clauses cause cascade failures
- No diagnostic messages for IDE integration
- **A small number of narrow reliability fixes landed across the campaign, but general error recovery was never in scope:** round 12 found and fixed a genuine infinite-loop hang in the 88-level VALUE-clause parser (`WHEN SET TO FALSE IS <literal>`), and audited the whole parser for the same "loop doesn't require forward progress" anti-pattern at the time (no other instance found then); a second, unrelated instance of the same anti-pattern (a bare numeric-literal CALL argument) was independently found and fixed in round 40. These are crash/hang fixes, not general error recovery — the bullet points above remain accurate through round 40.

---

## 5. Scala Generator Correctness Gaps

> **Update 2026-07-23:** cross-checked against `tests/oracle/README.md` (the verification
> ledger, now covering all 40 rounds), `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` (truth-passed
> for round 40), and `docs/ADVERSARIAL_ROUNDS_REPORT.md` (original 14-round report). This
> section's original claims were, in several cases, actually an *understatement* of how
> broken the generator was in February — e.g. file I/O (§5.5) turned out to be completely
> non-functional end-to-end, not merely "inconsistently wired." The current state reflects
> the full, completed 40-round campaign (14 rounds reported 2026-07-11; resumed and run to
> round 40 by 2026-07-23); it does not reflect any change to the platform outside this one
> engine package.

### 5.1 Reserved Keyword Collisions — Still OPEN, unchanged

If COBOL has fields named `type`, `class`, `def`, `val`, `var`, `object`, `trait` — the generator produces invalid Scala that won't compile. No escaping with backticks (`` `type` ``) is performed. Nothing in the full 40-round campaign's findings tables addresses this; it is not called out as fixed anywhere in the ledger and should be treated as still open.

### 5.2 REDEFINES — Mostly FIXED, one narrow shape still stubbed

**2026-02-09 state:** REDEFINES produced a case class with both fields always present (incorrect — REDEFINES means mutually exclusive interpretations of the same memory, not separate fields), and REDEFINES over an OCCURS table didn't even compile.

**2026-07-23 state:** REDEFINES is implemented as lazy accessor views over the same underlying storage (not a `sealed trait`/ADT as originally suggested as the ideal shape, but functionally correct: reading through either name reflects the same bytes) and is oracle-verified for the common cases, including:
- REDEFINES over an OCCURS table (round 1 compile failure — **FIXED**)
- GROUP-over-GROUP REDEFINES with differing shapes, including one side containing an OCCURS (round 3, finding n06 — **FIXED**, via a synthesized flat-accessor pair)
- An OCCURS table REDEFINED by a differently-shaped OCCURS table (round 32 — **FIXED**), and a numeric-over-group REDEFINES that previously crashed a later MOVE at compile time due to a missing field-registry entry (round 38 — **FIXED**)

**Still a documented stub (Known Gap):** REDEFINES of a group-with-OCCURS by *another* group-with-OCCURS compiles and runs real SEARCH ALL code against the redefining table, but each elementary child is an honest `???` that throws `NotImplementedError` if actually read at runtime — a narrow, disclosed gap, not a silent one, confirmed still open through round 40 (though round 40's completeness audit flags it as now more tractable, since later rounds built real byte-accurate REDEFINES flatteners that could plausibly be reused).

### 5.3 Arithmetic Precision Loss — Largely FIXED

**2026-02-09 state:** bare `a + b`, no scale threading, ROUNDED parsed-but-ignored, ON SIZE ERROR recognized-but-not-generated, overflow undetected.

**2026-07-23 state:**
- Scale/decimal-digit tracking through arithmetic store operations: **FIXED** (round 3's `storeNumericExpr`/`storeNumericByInfo`) — ROUNDED present routes through HALF_UP rounding to the target's declared decimal digits; absent, it truncates toward zero (matching real `cobc`, verified directly — e.g. `COMPUTE X = 2.345` into a 2-decimal target stores `2.34` without ROUNDED, not a display-time-rounded `2.35`). Applies uniformly to COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE, including multi-target GIVING and CORRESPONDING forms.
- `ON SIZE ERROR`: **FIXED** (round 1 cluster), and later corrected (round 38) so multi-target COMPUTE/arithmetic with `ON SIZE ERROR` applies COBOL's real per-target-independent store rule rather than an all-or-nothing one.
- **Still unconfirmed/open:** integer overflow detection specifically for COMP fields with >9 digits is not separately called out as fixed in the ledger — treat as still open rather than assume it's covered by the ROUNDED/truncation fix above.
- `DIVIDE ... GIVING ... REMAINDER` was found (round 9) to use BigDecimal's floor-division remainder instead of COBOL's own decimal-truncated-quotient remainder — **FIXED** as part of the same round.
- Real IEEE-754 COMP-1/COMP-2 codecs were built during rounds 15-40 (previously not separately called out in this section).

### 5.4 Case Class Nesting Issues — Largely unchanged, still OPEN

- Deep COBOL group hierarchies still produce deeply nested case classes; no flattening option was added across the whole campaign.
- **Default field values:** COBOL's real per-category INITIALIZE default rules (ALPHABETIC/ALPHANUMERIC → SPACES, NUMERIC/NUMERIC-EDITED → ZERO) were implemented for the `INITIALIZE` *statement* specifically (round 5, previously 100%-non-functional — it emitted `.copy()` on a plain `var`, a guaranteed compile error), later extended to `INITIALIZE ... REPLACING` into a REDEFINES-nested field. Whether a field's own *declaration-time* default (with no explicit VALUE clause and no INITIALIZE call) still incorrectly defaults `PIC X` to empty string rather than spaces, as originally reported, is **not directly confirmed either way** in the ledger even after 40 rounds — treat this specific sub-claim as unresolved rather than fixed.

### 5.5 Runtime Library — FIXED; far more heavily exercised than described

**2026-02-09 state:** runtime files existed but weren't consistently wired in; `FileIO.scala` was never instantiated; file definitions weren't mapped to file objects.

**2026-07-23 state:** this was actually **worse than the original description** before round 5 — the engine's own `convertToScala()` entry point never even invoked `parseEnvironmentDivision()`, so FILE-CONTROL/SELECT information never reached the generator *regardless* of what the DATA/PROCEDURE DIVISIONs declared, meaning every file OPEN/READ/WRITE the engine had ever claimed to support was silently broken. This is now **FIXED and oracle-verified** for LINE SEQUENTIAL files: file handles are declared once as object-scope `var`s (no more duplicate-declaration compile errors across successive OPENs), WRITE/READ resolve the correct FD-derived file name via new record↔file registries, and on-disk behavior (trailing-space stripping, fixed-width padding, `WRITE ... ADVANCING`'s actual deferred-terminator model) was reverse-engineered from real `cobc` output rather than guessed at.

`ORGANIZATION IS RELATIVE` file I/O then underwent a **full architectural rewrite in round 29** — the single most serious finding of the whole 40-round campaign: the original line-delimited-text storage model silently corrupted any binary field whose bytes happened to contain a `0x0A` (newline) byte, so it was replaced with a real fixed-width raw-byte-chunk model that all later file-I/O work builds on. Real RELATIVE KEY random access, START (round 26), REWRITE/DELETE (rounds 25, 27), OPEN I-O read-iterator initialization (round 25), and LINAGE (`WITH FOOTING AT`, `AT END-OF-PAGE` — rounds 32-34) are all real, oracle-verified implementations. **FILE STATUS lifecycle tracking** was added incrementally across rounds 38-40: OPEN/CLOSE/READ then WRITE/REWRITE/DELETE/START all now correctly report status codes for closed-file and wrong-access-mode conditions instead of crashing or silently misreporting, with the registered DECLARATIVES error handler correctly invoked on these paths (round 40).

The runtime library (`CobolFmt`, `CobolInspect`, `CobolUnstring`, byte-level codecs for packed/binary/zoned/EBCDIC, and real IEEE-754 COMP-1/COMP-2 codecs) is now exercised end-to-end by all 574 oracle-verified corpus programs. **Still OPEN:** `ORGANIZATION IS INDEXED` (true VSAM-style keyed access) remains genuinely unimplemented, and — unlike every other gap in this document — cannot be oracle-verified at all in this project's own sandbox, since the installed GnuCOBOL build has indexed-file support compiled out entirely (round 27).

---

## 6. Testing Infrastructure Gaps

> **Update 2026-07-23:** the `cobol-to-scala` engine package's own test suite grew
> substantially across the full 40-round campaign (see §6.1a/§6.2a below). Every other row
> in this section — frontend, backend API, integration/E2E, performance, security, fuzzing,
> CI/CD — is unchanged from February: still zero.

### 6.1 Coverage Summary (2026-02-09 baseline — see 6.1a for what changed)

| Component | Source Lines | Test Lines | Coverage |
|-----------|------------|-----------|----------|
| JS Parser/Generator | ~10,300 | 84 | <1% |
| Scala Prototype | ~2,500 | 257 | ~10% |
| React Frontend | ~90 files | 0 | 0% |
| Backend API | ~30 endpoints | 0 | 0% |
| **Total** | **~13,000+** | **~340** | **~2.6%** |

### 6.1a What changed by 2026-07-23: the engine package only

The `cobol-to-scala` package (the JS Parser/Generator row above) now has **~2,017
automated tests (898 unit + 1,119 oracle), 0 failing** (`npm test` inside
`Thyraa-COBOL-main/backend/packages/cobol-to-scala/`), up from ~379 at the start of this
campaign (and 879 at the round-14 checkpoint reported 2026-07-11) — including parser unit
tests, codec property/parity tests, generator tests, JCL/DCLGEN/SQL/CICS/BMS corpus tests, a
dedicated state-isolation regression suite (`tests/state-isolation.test.js`, added round 13),
and focused regression tests for each of the 241 total adversarial-round findings (110 in
rounds 1-14, 131 in rounds 15-40) fixed across the whole campaign, plus **45 honestly
documented `t.todo()` entries**, each individually traced to a specific, still-open gap, never
a silent pass. Critically, this package also now has a **live compiler-oracle harness**
(`tests/oracle/`) that compiles and runs every corpus program with real GnuCOBOL (`cobc -x`)
and diffs the generated Scala's compiled-and-run output against it byte-for-byte — **574
corpus programs** currently pass this way (563 `.cbl` clean under real GnuCOBOL + 11
`.cbl.txt` whose correct behavior is a nonzero cobc exit/compile rejection), up from 209 at
the round-14 checkpoint, re-verified from a live `cobc`/`scala-cli` run on every `npm test`
invocation, not a frozen fixture. The campaign's own 0-2-findings-for-two-consecutive-rounds
convergence bar was met exactly once, briefly, at rounds 36-37, before rounds 38-40
deliberately broadened the search and found bugs again at an increasing rate (6, 7, 8) —
so this is not adversarially exhausted, even after 40 rounds.

**This is a genuinely large, verified jump in test rigor for one package — but it does not
change any other row in §6.1's table.** React Frontend, Backend API, and every
integration/E2E/performance/security category below remain at their February baseline of
zero. Do not read "the engine has ~2,017 tests" as "the platform has meaningful test
coverage" — scorecard Test Coverage moved from 1/10 to 4/10 specifically because it's a large
local win inside a small fraction of the overall codebase, not a platform-wide one (see §1
scorecard notes), and running the campaign further from round 14 to round 40 did not move
that scorecard number any further, for the same reason.

### 6.2 Formal Test Framework (JavaScript) — FIXED for the engine package, unchanged elsewhere

The `cobol-to-scala` engine package now uses Node's built-in `node:test` runner with real
`assert`-based assertions (no more `console.log()`-and-eyeball-it tests) — this is a genuine
fix, not just a description update. **This has not been extended to any other JS package in
the repo** (the analysis backend, the frontend) — those remain exactly as described
originally: no formal test framework, no assertion library, no test configuration.

### 6.3 Missing Test Categories

| Test Type | 2026-02-09 status | 2026-07-23 status |
|-----------|--------|--------|
| Unit tests (parser, engine package) | 2 files, minimal | **FIXED for this package** — extensive `node:test` unit coverage across lexer/parser/AST modules |
| Unit tests (generator, engine package) | 1 file, minimal | **FIXED for this package** — extensive `node:test` unit coverage, plus per-round regression test files (`tests/round3-fixes.test.js` etc.) for every fixed finding across all 40 rounds |
| Unit tests (frontend) | None | **Still None.** Zero test files for 90+ React source files, unchanged. |
| Integration tests (engine, COBOL→Scala) | None | **FIXED for this package** — `oracleCompare()` is exactly this: real cobc-compiled-and-run output diffed against the generated-and-compiled Scala's own output, for 574 programs |
| E2E tests (COBOL → Scala, compiler-oracle-verified) | None | **FIXED for this package specifically** — see above. This is the single most significant testing improvement in the whole document: an actual real-compiler oracle, not a hand-written `.expected.txt`. |
| API integration tests | None | **Still None.** No change to the backend API test posture. |
| Performance/load tests | None | **Still None.** |
| Security tests (SAST/DAST) | None | **Still None.** |
| Fuzz testing | None | **Still None** for the platform generally. (The adversarial-refutation methodology used to harden the engine is a structured, targeted red-team process — deliberately authoring new COBOL programs to break specific constructs — not fuzzing in the input-mutation sense, and it doesn't substitute for one.) |

### 6.4 No CI/CD Test Automation — Still true, unchanged

No test runs in any pipeline because no pipeline exists (see Section 7 — unchanged since
2026-02-09). The engine package's ~2,017 tests and oracle harness are run manually
(`npm test`) and are not gated on any commit or PR automatically; nothing about this
campaign, even run to its full 40-round completion, added CI/CD wiring anywhere in the repo.

---

## 7. Infrastructure & DevOps Gaps

*Still true as of 2026-07-23 — no work occurred in this area between 2026-02-09 and this update (the engine campaign that ran through 2026-07-23 was scoped entirely to the conversion engine). Everything below is exactly as it was in the original analysis.*

### 7.1 Containerization: Not Implemented

| Artifact | Status |
|----------|--------|
| Dockerfile (frontend) | Missing |
| Dockerfile (backend) | Missing |
| docker-compose.yml | Missing |
| .dockerignore | Missing |

### 7.2 Orchestration: Not Implemented

| Artifact | Status |
|----------|--------|
| Kubernetes manifests | Missing |
| Helm charts | Missing |
| ConfigMaps / Secrets | Missing |
| Ingress configuration | Missing |

### 7.3 CI/CD: Not Implemented

| Artifact | Status |
|----------|--------|
| GitHub Actions workflows | Missing |
| Jenkinsfile | Missing |
| GitLab CI config | Missing |
| Automated test runs | Missing |
| Automated builds | Missing |
| Automated deployments | Missing |

### 7.4 Environment Management

- No `.env.example` documenting required variables
- No environment-specific configuration (dev/staging/prod)
- Localhost defaults used for all environments
- No startup validation that required config is present (fails silently)

### 7.5 Database Layer: Not Implemented

The architecture plans PostgreSQL for projects, results, and audit. **None of this exists:**
- No database connection code
- No ORM (Prisma, Sequelize, TypeORM)
- No migration system
- No schema definitions
- All state is in-memory or Redis cache only

### 7.6 SSL/TLS: Not Configured

- No HTTPS configuration
- No certificate management
- Backend runs plain HTTP only

### 7.7 Load Balancing: Not Configured

- No nginx / reverse proxy
- Single-server architecture only
- No horizontal scaling support

---

## 8. Observability & Monitoring Gaps

*Still true as of 2026-07-23 — no work occurred in this area between 2026-02-09 and this update (the engine campaign that ran through 2026-07-23 was scoped entirely to the conversion engine). Everything below is exactly as it was in the original analysis.*

### 8.1 Logging

**Current state:** 70+ `console.log`/`console.error` calls scattered through the codebase.

**Missing:**
- No structured logging framework (Winston, Pino)
- No log levels (debug/info/warn/error)
- No correlation IDs for request tracing
- No sensitive data masking
- No log rotation or aggregation

### 8.2 Metrics

**Missing entirely:**
- No Prometheus client
- No request latency tracking
- No error rate monitoring
- No queue depth monitoring
- No cache hit/miss rates
- No GitHub API quota tracking

### 8.3 Health Checks

**Current:** Basic `/health` endpoint returns `{ status: 'ok' }` with queue status.

**Missing:**
- No deep dependency checks (Redis connectivity, disk space)
- No liveness vs readiness distinction (required for Kubernetes)
- No downstream service health verification

### 8.4 Alerting & Dashboards

Not implemented. No Grafana, no PagerDuty, no alerting rules.

---

## 9. Frontend Gaps

*Still true as of 2026-07-23 — no frontend work occurred between 2026-02-09 and this update.*

### 9.1 Strengths

- React 18 + TypeScript + Vite (modern stack)
- shadcn/ui component library (70+ components)
- Tailwind CSS styling
- Monaco Editor for code editing
- React Context state management
- Basic error handling and loading states
- Toast notifications via Sonner

### 9.2 Gaps

| Gap | Severity | Details |
|-----|----------|---------|
| No authentication UI | Critical | No login page, no protected routes, no session management |
| No component tests | High | Zero test files for 90+ React source files |
| No error boundaries | High | One component crash takes down entire app |
| TypeScript strict mode off | Medium | `strict: false`, `noImplicitAny: false` — type safety undermined |
| No i18n support | Medium | All strings hardcoded in English |
| Accessibility partial | Medium | Some ARIA labels, but missing on major interactive components |
| No CSRF tokens | High | Frontend sends no CSRF tokens with API requests |
| `dangerouslySetInnerHTML` usage | Low | In chart.tsx for CSS injection (low risk but bad practice) |
| Debug code in production | Medium | `AnalysisProgress.tsx` has hardcoded localhost fetch |

### 9.3 Missing Frontend Features (vs Architecture Plan)

- Login / authentication page
- User profile / settings
- Project management dashboard
- Conversion workflow UI
- Code review interface
- Validation results page
- Admin / audit dashboard
- Real-time notifications
- Export (PDF, CSV)

---

## 10. Documentation Gaps

*Operational/ops-guide gaps below are still true as of 2026-07-23 — unchanged since 2026-02-09. What did change: several new, unusually rigorous engineering documents were added by the engine-hardening campaign (see 10.1), which is why the Documentation score moved 5 → 6; running the campaign on from round 14 to its round-40 completion added more such documents but did not move the score any further.*

### 10.1 What Exists (Good)

| Document | Quality |
|----------|---------|
| `README.md` (root) | Comprehensive project overview |
| `CONTRIBUTING.md` | PR process, priority areas |
| `docs/UNIFIED_PLATFORM_ARCHITECTURE.md` | Detailed 770-line architecture vision |
| `docs/CODEBASE_ANALYSIS.md` | Comparison of approaches |
| `cobol-reference/` (8 documents) | Excellent COBOL language reference |
| `examples/basic-conversion/` | Sample input/output |
| `docs/ADVERSARIAL_ROUNDS_REPORT.md` (new, 2026-07-11) | Rigorous 14-round verification campaign report (phase 1 only) — methodology, per-round findings, impact analysis, honest convergence assessment |
| `docs/PROGRESS_STATUS.md` (new, 2026-07-23) | Closing report for the full 40-round campaign — headline numbers, what got built in rounds 15-40, process lessons, and an honest "not safe to assume works" list |
| `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` (new 2026-07-11, truth-passed 2026-07-23) | Statement-by-statement capability audit with an explicit "what verified does not mean" section and Known Gaps list, now current through round 40 |
| `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md` (new 2026-07-11, grown through round 40) | 2,300+ line verification ledger — every finding/fix/program mapping across all 40 rounds, regenerated-on-every-run fixture guarantees |

### 10.2 What's Missing

| Document | Impact |
|----------|--------|
| **OpenAPI / Swagger spec** | Cannot integrate or test APIs systematically |
| **Deployment guide** | Cannot deploy to production |
| **Operational runbooks** | Cannot respond to incidents |
| **Database schema docs** | No persistence layer documented |
| **Security policy (SECURITY.md)** | No responsible disclosure process |
| **Changelog (CHANGELOG.md)** | No version history |
| **ADRs (Architecture Decision Records)** | Design rationale undocumented |
| **User guides with screenshots** | End users have no guidance |
| **.env.example** | Developers must guess required variables |
| **Troubleshooting guide** | Common issues undocumented |

---

## 11. Planned vs Actual Architecture

The architecture document (`docs/UNIFIED_PLATFORM_ARCHITECTURE.md`) describes a 6-phase, 12-18 week implementation plan. Current status:

### API Endpoints

| Planned Endpoint | Status |
|-----------------|--------|
| `POST /api/analyze` | Partial (works but no auth) |
| `GET /api/analyze/:jobId/result` | Implemented |
| `POST /api/convert/scala` | Basic implementation |
| `POST /api/convert/batch` | Basic implementation |
| `GET /api/convert/runtime` | Implemented |
| `POST /api/projects/` | Not implemented |
| `POST /api/projects/{id}/convert` | Not implemented |
| `POST /api/projects/{id}/validate` | Not implemented |
| `POST /api/ai/document` | Not implemented |
| `POST /api/ai/explain` | Not implemented |
| `POST /api/ai/extract-rules` | Not implemented |

### Architecture Layers

| Layer | Planned | Actual |
|-------|---------|--------|
| Presentation (React UI) | Full conversion workflow | Analysis only |
| Presentation (VS Code Extension) | Planned | Not started |
| Presentation (CLI) | Planned | Not started |
| API Gateway | Auth, rate limit, validation | Express with no middleware |
| Orchestration (Job Queue) | Bull + workflow engine | Bull only |
| Processing (Analysis Engine) | Full analysis | Partial |
| Processing (Conversion Engine) | Full COBOL support | Broad and oracle-verified as of 2026-07-23, after the full 40-round campaign (574 GnuCOBOL-verified programs; see §4/§5) — still short of "full": reference-modification codegen (the single largest remaining risk), `ORGANIZATION IS INDEXED`/VSAM, SORT/MERGE USING/GIVING, external CALL, `CALL BY REFERENCE` of GROUP+OCCURS into a non-recursive callee, CICS behavior, and SQL wire-in remain open |
| Processing (Validation Engine) | Dual-run comparison | Not started as a *product feature* — note the engine's own internal test harness (`tests/oracle/`) now does exactly this (real-cobc vs. generated-Scala dual-run comparison) for development/verification purposes, but this capability is not exposed to end users through any API or UI |
| AI Layer (Claude integration) | Explain, document, extract | Not started |
| Data Layer (PostgreSQL) | Full persistence | Not implemented |
| Data Layer (Redis) | Cache + queue | Queue only |

### Implementation Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Integration Foundation | ~30% |
| Phase 2 | Unified UI | ~20% |
| Phase 3 | AI Enhancement | Not started |
| Phase 4 | Validation Engine | Not started |
| Phase 5 | Enterprise Features | Not started |
| Phase 6 | Polish & Launch | Not started |

---

## 12. Remediation Roadmap

### Phase 1: Security Hardening (Weeks 1-3)

**Must-do before any deployment:**

- [ ] Remove debug telemetry code from `analysis.controller.js` and `AnalysisProgress.tsx`
- [ ] Add `helmet.js` for security headers
- [ ] Configure CORS with specific allowed origins
- [ ] Add `express.json({ limit: '10mb' })` request size limits
- [ ] Implement API key or JWT authentication on all endpoints
- [ ] Add CSRF token generation and validation
- [ ] Add `express-rate-limit` on all endpoints
- [ ] Validate and sanitize all input (URL, branch names, COBOL source)
- [ ] Add path traversal protection in file operations
- [ ] Create `.env.example` with required variables
- [ ] Add startup validation for required configuration

### Phase 2: Testing Foundation (Weeks 3-6)

*Updated 2026-07-23: the `cobol-to-scala` engine package (only) has completed most of
this phase for itself, across the full 40-round campaign — see §6. The frontend/backend-API
items remain untouched.*

- [x] Adopt a real test framework (replace console.log tests) — **done for the engine package** (`node:test`); frontend/backend API still untouched
- [x] Write unit tests for all parser modules — **done for the engine package** (extensive `node:test` coverage); no formal coverage-percentage target tracked
- [x] Write unit tests for all generator modules — **done for the engine package**, including a live compiler-oracle harness, which exceeds the original ask
- [x] Create E2E tests: COBOL input → Scala output → compilation check — **done and exceeded**: real `cobc`-vs-generated-Scala oracle comparison for 574 programs, not just a compile check
- [ ] Add API integration tests for all endpoints — still not done
- [ ] Add negative tests (malformed COBOL, oversized input, injection attempts) — the adversarial-refutation methodology is a targeted red-team process, not systematic negative/fuzz testing; still not done in that sense
- [ ] Set up test coverage reporting — no formal coverage percentage is tracked even for the engine package (pass/fail counts and oracle-equivalence are tracked instead)

### Phase 3: Core Parser Gaps (Weeks 6-10)

*Updated 2026-07-23: most items below are now done or substantially done, after the full
40-round campaign — see §4/§5 for full detail and remaining caveats on each.*

- [x] Implement COPY/REPLACE with recursive resolution — done, including nesting, OF/IN, pseudo-text/word REPLACING, cycle safety, plus standalone `REPLACE` (found unimplemented and fixed in round 40)
- [ ] Implement OCCURS DEPENDING ON in generator — still open; sized at a fixed max, not the live counter field (visible TODO marker)
- [~] Implement reference modification in generator — parser corruption bug fixed; actual substring read/write semantics still degrade to a visible `???`/placeholder almost everywhere (documented gap, not done, and now flagged as the single largest remaining risk in the engine after 40 rounds of searching)
- [x] Wire CALL BY REFERENCE/CONTENT/VALUE to generator — done for same-file multi-program CALL and for `PROGRAM-ID ... RECURSIVE` callees (real per-leaf GROUP+OCCURS aliasing, rounds 22/39); external/dynamic CALL and GROUP-with-OCCURS marshalling into an ordinary **non-recursive** callee remain open (the latter silently passes empty/default data rather than a visible TODO)
- [x] Add decimal scale tracking through arithmetic operations — done (ROUNDED/truncation semantics verified directly against `cobc`)
- [x] Implement SEARCH / SEARCH ALL — done, including VARYING and composite-key forms
- [x] Implement SORT / MERGE — done for the procedural (INPUT/OUTPUT PROCEDURE) form, including MERGE (round 18); the whole-file USING/GIVING form for both SORT and MERGE remains open
- [ ] Add parser error recovery and diagnostic reporting — still not done (two specific infinite-loop hangs were found and fixed across the campaign, rounds 12 and 40, which are narrower reliability fixes, not general recovery)
- [ ] Escape Scala reserved keywords in generated field names — still not done

### Phase 4: Infrastructure (Weeks 8-12)

- [ ] Create Dockerfiles for frontend and backend
- [ ] Create docker-compose.yml for local development
- [ ] Set up GitHub Actions CI/CD pipeline (lint, test, build, push)
- [ ] Add PostgreSQL with migration system (Prisma or similar)
- [ ] Implement structured logging (Winston or Pino)
- [ ] Add Prometheus metrics collection
- [ ] Create Kubernetes manifests and Helm charts
- [ ] Configure SSL/TLS and load balancing

### Phase 5: Feature Completion (Weeks 12-20)

- [ ] Implement authentication UI (login, session, protected routes)
- [ ] Implement RBAC and project-level permissions
- [ ] Build validation engine (dual-run comparison)
- [ ] Integrate AI layer (Claude API for explain, document, extract)
- [ ] Add CICS command generation
- [ ] Add dynamic SQL and cursor support
- [ ] Complete STRING/UNSTRING and INSPECT generation
- [ ] Add `ORGANIZATION IS INDEXED` (true VSAM-style keyed) file support — note: `ORGANIZATION IS RELATIVE` is now done (full storage-model rewrite, round 29; REWRITE/DELETE/START, rounds 25-27) and no longer part of this item; INDEXED also cannot be oracle-verified in this project's own sandbox (GnuCOBOL build has it compiled out)
- [ ] Create operational runbooks and deployment guides

### Phase 6: Enterprise Polish (Weeks 20-26)

- [ ] Security audit (SAST, DAST, penetration testing)
- [ ] Performance and load testing
- [ ] SOC 2 / GDPR compliance preparation
- [ ] Complete API documentation (OpenAPI/Swagger)
- [ ] User documentation with guides and screenshots
- [ ] Frontend component tests and accessibility audit
- [ ] Enable TypeScript strict mode
- [ ] Architecture Decision Records

---

## Estimated Effort to Enterprise Readiness

**Updated 2026-07-23.** Only the "Parser/generator gaps" row changes — the full 40-round
adversarial campaign (14 rounds reported 2026-07-11, then resumed and run to completion)
closed most of Phase 3's original punch list, and then some (see §4/§5, and the Phase 3
checklist above). The remaining engine work is now narrower and more specialized still
than it was at the round-14 checkpoint: `ORGANIZATION IS INDEXED`/VSAM (RELATIVE is now
done), SQL wire-in, CICS behavioral conversion, general GO TO webs, reserved-keyword
escaping, reference-modification semantics, and `CALL BY REFERENCE` of GROUP+OCCURS into a
non-recursive callee — real work, but less of it, and arguably harder-won given that the
campaign's own convergence bar was met only once (rounds 36-37) before broadening the
search found bugs again at an increasing rate through round 40 (see
`docs/PROGRESS_STATUS.md` and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`).
**Every other row is unchanged**, because no work occurred in those areas.

| Area | Estimated Effort (2026-02-09) | Estimated Effort (2026-07-23) |
|------|-----------------|-----------------|
| Security hardening | 3 weeks | 3 weeks — unchanged |
| Testing foundation | 4 weeks | 4 weeks for frontend/API/security tests — unchanged (the engine package's own testing foundation is now done, but that was a subset of this row, not the whole row) |
| Parser/generator gaps | 5 weeks | ~2-3 weeks — narrowed to `ORGANIZATION IS INDEXED`/VSAM, SQL wire-in, CICS behavioral conversion, general GO TO webs, reserved-keyword escaping, reference-modification semantics, and non-recursive GROUP+OCCURS CALL BY REFERENCE; IBM Enterprise COBOL dialect verification and closing the remaining Known Gaps would add more |
| Infrastructure/DevOps | 4 weeks | 4 weeks — unchanged |
| Feature completion | 8 weeks | 8 weeks — unchanged (this row is mostly platform features: auth UI, RBAC, AI layer — not conversion-engine correctness) |
| Enterprise polish | 6 weeks | 6 weeks — unchanged |
| **Total** | **~26 weeks (~6 months)** | **~23-24 weeks (~5.5 months)** — a modest reduction, concentrated entirely in one row, unchanged from the round-14 checkpoint's own estimate since the additional rounds 15-40 work narrowed *what specifically* remains more than it narrowed the effort number itself |

---

## Conclusion

**Updated 2026-07-23.** The cobol-to-scala platform has strong foundational design — a
well-thought-out architecture document, a modern React frontend, and comprehensive COBOL
language reference documentation. As of this update, it also has a conversion engine that
has been adversarially hardened across a full 40-round campaign against a real GnuCOBOL
compiler oracle (an initial 14 rounds reported 2026-07-11, resumed at the owner's request
and run to completion by 2026-07-23):
574 verified programs, ~2,017 tests with 0 failures, 241 root-cause bugs fixed (110 in
rounds 1-14, 131 in rounds 15-40; see the banner at the top of this document,
`docs/ADVERSARIAL_ROUNDS_REPORT.md`, `docs/PROGRESS_STATUS.md`, and
`docs/CAPABILITY_AUDIT_AND_ROADMAP.md`). That is real, verified progress on the single
hardest technical problem this platform has to solve. **The gap between the architectural
vision and the current implementation remains significant everywhere else** — security,
infrastructure, CI/CD, observability, and compliance are exactly as absent as they were on
2026-02-09, because no work touched them in this window.

**For enterprise use today, the platform is suitable only for:**
- Demonstrating the conversion concept, now on a substantially broader and more rigorously
  verified set of batch COBOL constructs than in February (see §4/§5) — still against a
  GnuCOBOL oracle, not IBM Enterprise COBOL, and — even after the full 40-round campaign —
  not adversarially exhausted (rounds 38-40 found bugs at an increasing rate right through
  the final round)
- Processing fixed-format COBOL with data structures, LINE SEQUENTIAL and RELATIVE file
  I/O, and the broad procedure-division statement set in §4.1 — still not
  `ORGANIZATION IS INDEXED`/VSAM files, CICS online logic, or SQL wired into the main
  generator path, and reference modification (a common construct) still degrades to a
  placeholder rather than real behavior
- Non-production, non-customer-facing use only — the security, auth, and infrastructure
  gaps below make any customer-facing or production deployment unsafe regardless of how
  correct the conversion engine itself is

**For enterprise use, the platform still requires (unchanged from 2026-02-09):**
- Complete security hardening (authentication, authorization, input validation)
- Platform-wide test coverage (frontend, API, security) with automated CI/CD — the engine
  package's own test suite is a real but narrow exception to this, not a platform-wide fix
- Containerized deployment with monitoring
- Database persistence and audit logging
- SOC 2 / GDPR / compliance readiness work of any kind

**And now requires less of (changed since 2026-02-09):**
- COBOL language coverage and Scala generation correctness for the batch/procedural
  constructs this campaign targeted — see §4/§5 for exactly what's fixed (including, since
  the round-14 checkpoint, RECURSIVE programs, a full RELATIVE file I/O rewrite, LINAGE,
  FILE STATUS lifecycle, and real IEEE-754 COMP-1/COMP-2 codecs) and what remains open
  (reference modification — the single largest remaining risk, `ORGANIZATION IS INDEXED`/
  VSAM, non-recursive GROUP+OCCURS CALL BY REFERENCE, SORT/MERGE USING/GIVING, external
  CALL, CICS behavior, SQL wire-in, IBM-dialect verification)

The remediation roadmap above provides a path from current state to enterprise readiness —
modestly shorter than in February, concentrated entirely in the parser/generator row, and
still gated primarily by the untouched security/infrastructure/compliance work — a
conclusion that running the campaign all the way from round 14 to its round-40 completion
did not change, because every remaining gate is a platform gap the campaign never touched.
