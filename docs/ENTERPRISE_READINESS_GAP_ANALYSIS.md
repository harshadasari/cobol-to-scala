# Enterprise Readiness Gap Analysis

**Date:** 2026-02-18 (original)
**Updated 2026-07-23 (engine assessment only)**
**Scope:** Full codebase analysis of the COBOL-to-Scala conversion platform
**Assessment:** Current state vs. enterprise-grade production requirements

> **Update banner (2026-07-23, campaign complete):** Between the original 2026-02-18 assessment and today, the **COBOL→Scala conversion engine** (`Thyraa-COBOL-main/backend/packages/cobol-to-scala/`) went through an autonomous adversarial-verification campaign in two phases: an initial **14 rounds**, reported on 2026-07-11 (corpus grown to 209 programs, 879/879 tests, 110 bugs fixed), then — at the owner's explicit request — **resumed and run to completion at round 40**. Across the full campaign, the oracle-verified program corpus grew from 48 to **574 programs** (563 `.cbl` clean under real GnuCOBOL + 11 `.cbl.txt` whose correct behavior is a nonzero cobc exit/compile rejection), the automated test count grew to **~2,017 tests** (898 unit + 1,119 oracle) with **0 failures**, and **241 total silent-divergence bugs** (110 in rounds 1-14, 131 in rounds 15-40) were found and fixed at root cause, each checked against a real GnuCOBOL (`cobc`) compiler oracle byte-for-byte. The campaign's own convergence bar (0-2 findings for two consecutive rounds) was met exactly once, briefly, at rounds 36-37, before rounds 38-40 deliberately broadened the search and found bugs again at an *increasing* rate (6, 7, 8) — including two previously entirely-unimplemented statements (`REPLACE`, `PROGRAM-ID ... INITIAL`) discovered as late as round 40, so this is **not** "adversarially exhausted." Section 11 (Conversion Engine Maturity) below has been rewritten to reflect the full 40-round end state — it is now dramatically stronger than in February, though real open gaps remain (SQL/CICS wiring, reference modification, `ORGANIZATION IS INDEXED`/VSAM, non-recursive GROUP+OCCURS CALL BY REFERENCE, GO TO webs, OCCURS DEPENDING ON, and more).
>
> **This campaign was engine-only.** It did not touch authentication, CI/CD, containerization, observability, compliance, the frontend, or the API surface. **Every other section in this document (1–10, 12) is unchanged from February and remains accurate as of 2026-07-23** — those gaps are still open and are now the sole gating blockers to production readiness, since the conversion core is no longer the weakest link.
>
> For full detail on the campaign methodology and results, see `docs/ADVERSARIAL_ROUNDS_REPORT.md` (original 14-round report), `docs/PROGRESS_STATUS.md` (closing report for the full 40-round campaign), and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` (statement-level capability audit + roadmap, truth-passed through round 40). For the companion platform-gap scorecard, see `docs/ENTERPRISE_GAP_ANALYSIS.md`.

---

## Executive Summary

The COBOL-to-Scala platform is a well-architected early-stage MVP with strong documentation and a clear vision. As of the original analysis, **significant gaps existed across 12 critical areas** before it could be considered enterprise-ready. As of 2026-07-23, one of those 12 areas — conversion engine maturity (Section 11) — has been substantially closed by a full 40-round adversarial-verification campaign (see banner above). **The other 11 areas are unchanged.** The most urgent remaining gaps are in **security, testing infrastructure (platform-side), CI/CD, observability, and deployment infrastructure**. Below is a prioritized breakdown.

---

## 1. SECURITY (Critical)

*Still true as of 2026-07-23 — the engine hardening campaign, even run to its full 40-round completion, made no security-relevant changes.*

### 1.1 No Authentication or Authorization
- **Gap:** All API endpoints (`/api/analyze`, `/api/convert/*`) are completely open with zero authentication.
- **Impact:** Any network-reachable actor can submit arbitrary COBOL code for processing, clear caches, or query job results.
- **Enterprise Need:** OAuth 2.0 / OIDC integration, API key management, JWT token validation, role-based access control (RBAC).

### 1.2 Unrestricted CORS
- **Gap:** `app.use(cors())` in `server.js:12` allows requests from **all origins** with no restrictions.
- **Impact:** Opens the API to cross-site request abuse from any domain.
- **Enterprise Need:** Whitelist-based CORS with configurable allowed origins.

### 1.3 No Rate Limiting
- **Gap:** No rate limiting middleware on any endpoint. The `/api/convert/batch` endpoint accepts unbounded file arrays.
- **Impact:** A single client can exhaust server resources, causing denial of service.
- **Enterprise Need:** Per-client rate limiting (e.g., `express-rate-limit`), request body size limits, batch size caps.

### 1.4 No Input Sanitization Beyond Basic Checks
- **Gap:** Controller validation is minimal — only checks if `source` field exists (`conversion.controller.js:12`). No size limits, no content validation, no malicious payload detection.
- **Impact:** Potential for resource exhaustion via extremely large payloads or crafted inputs that cause parser hangs.
- **Enterprise Need:** Request body size limits, input content validation, timeout per conversion.

### 1.5 No HTTPS/TLS Configuration
- **Gap:** Server listens on plain HTTP. No TLS termination or certificate management.
- **Impact:** All data (including source code) transmitted in cleartext.
- **Enterprise Need:** TLS termination (via reverse proxy or native), certificate management, HSTS headers.

### 1.6 Security Headers Missing
- **Gap:** No helmet.js or equivalent security headers (X-Content-Type-Options, X-Frame-Options, CSP, etc.).
- **Enterprise Need:** Standard security header middleware.

### 1.7 Secrets Management
- **Gap:** Secrets (GITHUB_TOKEN, REDIS_PASSWORD) managed via `.env` files — no vault integration, no rotation policy, no audit trail.
- **Enterprise Need:** HashiCorp Vault / AWS Secrets Manager integration, automatic rotation, audit logging.

### 1.8 Dependency Vulnerability Scanning
- **Gap:** No `npm audit` in any automated workflow. No Dependabot/Snyk/Renovate configured.
- **Enterprise Need:** Automated dependency scanning in CI, SLA for patching critical CVEs.

---

## 2. TESTING (Critical)

> **Update (2026-07-23):** 2.1 below described the conversion engine's own test suite (`parser.test.js`) as of February and is now **stale for that one package** — see the correction note under 2.1. 2.2's broader claim about platform-level test coverage (API, controller, cache, queue, worker pool, batch processor, frontend) is **still accurate**: confirmed by search, there are zero test files outside `Thyraa-COBOL-main/backend/packages/cobol-to-scala/` anywhere in the repo as of 2026-07-23.

### 2.1 No Real Test Framework
- **Gap (as of 2026-02-18):** Tests use manual `console.log` output with hardcoded "PASSED" strings (`parser.test.js`). No assertion library, no test runner framework (Jest, Vitest, Mocha).
- **Impact:** Tests never actually fail — they always print "PASSED" regardless of output correctness.
- **Correction (2026-07-23):** This has been fixed **inside the conversion engine package only** (`packages/cobol-to-scala/`). The console.log("PASSED") pattern was replaced with Node's built-in `node:test` runner and real assertions; the suite has since grown to **~2,017 tests (898 unit + 1,119 oracle), 0 failing**, plus **45 honestly documented `t.todo()` entries** (`npm test` in that package) — up from 879 tests at the round-14 checkpoint reported 2026-07-11 — including parser unit tests, codec property/parity tests, generator tests, an oracle-comparison harness against real GnuCOBOL, and per-finding regression tests from the full 40-round adversarial campaign (see Section 11, `docs/ADVERSARIAL_ROUNDS_REPORT.md` for rounds 1-14, and `docs/PROGRESS_STATUS.md` for the closing report). No other package or the frontend was touched — the fix is scoped entirely to the conversion engine.
- **Enterprise Need (still open platform-wide):** Proper test framework with assertions and exit code-based pass/fail for the API/server layer and frontend, which still have no test files at all.

### 2.2 Minimal Test Coverage
- **Gap — still true as of 2026-07-23:** The conversion engine's own coverage is no longer minimal (~2,017 tests, 574 oracle-verified COBOL programs — see Section 11), but every other area listed below remains at zero:
  - API endpoints (integration tests)
  - Controller logic
  - Cache service
  - Queue manager
  - Worker pool
  - Batch processor
  - Frontend components
  - Error handling paths
  - Edge cases (empty input, malformed COBOL, huge files) — partially addressed for the conversion engine only, via the adversarial-refutation corpus
- **Enterprise Need:** >80% code coverage target, unit + integration + E2E test suites, extended to the API/server/frontend layers that still have none.

### 2.3 No Test Coverage Reporting
- **Gap:** No coverage tool configured (Istanbul/c8/nyc).
- **Enterprise Need:** Coverage reports in CI, coverage thresholds enforced on PRs.

### 2.4 No Contract/API Testing
- **Gap:** No OpenAPI spec, no Pact/contract tests, no API schema validation tests.
- **Enterprise Need:** Contract tests to prevent breaking API changes.

### 2.5 No Performance/Load Testing
- **Gap — still true as of 2026-07-23:** No benchmarks, no load tests, no stress tests for the conversion engine or the API layer. The full 40-round adversarial campaign (Section 11) verified **correctness** (byte-for-byte output equivalence against a real compiler oracle) exclusively — it produced no throughput/latency benchmarks, no capacity model, and no load testing of any kind.
- **Enterprise Need:** Performance baselines, regression detection, capacity planning data.

---

## 3. CI/CD PIPELINE (Critical)

*Still true as of 2026-07-23 — the adversarial campaign ran as a manual/local research effort across all 40 rounds (see `docs/ADVERSARIAL_ROUNDS_REPORT.md` and `docs/PROGRESS_STATUS.md`), not through any CI pipeline; no pipeline was added.*

### 3.1 No CI/CD Configuration
- **Gap:** No `.github/workflows/`, no GitHub Actions, no Jenkins, no GitLab CI — zero automation.
- **Impact:** All builds, tests, and deployments are manual. No automated quality gates.
- **Enterprise Need:**
  - Automated build on every PR
  - Automated test execution with pass/fail gating
  - Linting and code quality checks
  - Dependency vulnerability scanning
  - Automated deployment to staging/production
  - Build artifact management

### 3.2 No Code Quality Gates
- **Gap:** No enforced linting on commit/push. ESLint is configured but not enforced.
- **Enterprise Need:** Pre-commit hooks (Husky), CI-enforced lint, Prettier formatting.

### 3.3 No Release Management
- **Gap:** No versioning strategy, no changelog generation, no release tagging, no semantic versioning.
- **Enterprise Need:** SemVer, automated changelog, tagged releases, rollback procedures.

---

## 4. OBSERVABILITY & MONITORING (High)

*Still true as of 2026-07-23 — no logging, metrics, tracing, or health-check changes were made.*

### 4.1 No Structured Logging
- **Gap:** All logging is `console.log/error/warn` — unstructured, no log levels, no correlation IDs, no contextual metadata.
- **Impact:** Logs are unsearchable, un-aggregatable, and useless for debugging production issues.
- **Enterprise Need:** Structured JSON logging (Winston/Pino), log levels, request correlation IDs, centralized log aggregation (ELK/Datadog/Splunk).

### 4.2 No Application Performance Monitoring (APM)
- **Gap:** No metrics collection, no request latency tracking, no throughput measurement, no resource utilization monitoring.
- **Enterprise Need:** APM integration (New Relic, Datadog, Prometheus + Grafana), SLA/SLO dashboards.

### 4.3 No Error Tracking
- **Gap:** Errors are logged to console and returned to client. No centralized error tracking.
- **Enterprise Need:** Sentry/Rollbar/Bugsnag integration, error alerting, error grouping, trend analysis.

### 4.4 No Distributed Tracing
- **Gap:** No OpenTelemetry, no trace propagation across services/workers.
- **Enterprise Need:** End-to-end trace visibility for multi-step conversion pipelines.

### 4.5 Rudimentary Health Check
- **Gap:** Health endpoint (`/health`) only returns `{ status: 'ok' }` — doesn't check Redis connectivity, disk space, memory, or downstream dependencies.
- **Enterprise Need:** Deep health checks with dependency status, readiness vs. liveness probes.

---

## 5. CONTAINERIZATION & DEPLOYMENT (High)

*Still true as of 2026-07-23 — no Docker, orchestration, or deployment work was done.*

### 5.1 No Docker Support
- **Gap:** No Dockerfile, no docker-compose.yml, no container configuration.
- **Impact:** No reproducible builds, no isolated environments, manual dependency management.
- **Enterprise Need:** Multi-stage Dockerfiles, docker-compose for local dev, distroless/minimal production images.

### 5.2 No Kubernetes/Orchestration Configuration
- **Gap:** No k8s manifests, no Helm charts, no Terraform/Pulumi infrastructure-as-code.
- **Enterprise Need:** Kubernetes deployment specs, HPA, resource limits, pod disruption budgets.

### 5.3 No Environment Parity
- **Gap:** No mechanism to guarantee dev/staging/prod environment consistency.
- **Enterprise Need:** Environment-specific configs, feature flags, infrastructure-as-code.

### 5.4 No Production Deployment Documentation
- **Gap:** Only local development setup documented. No production deployment guide.
- **Enterprise Need:** Runbook for production deployment, scaling guide, disaster recovery.

---

## 6. DATA PERSISTENCE & STATE MANAGEMENT (High)

*Still true as of 2026-07-23 — no database, backup, or retention-policy work was done.*

### 6.1 No Database
- **Gap:** No persistent storage for conversion history, user sessions, audit trails, or job results. Everything is in-memory or Redis cache with TTL expiry.
- **Impact:** Server restart loses all state. No historical data for auditing or analytics.
- **Enterprise Need:** PostgreSQL/similar for persistent data, migration framework (Knex/Prisma/TypeORM).

### 6.2 No Data Backup & Recovery
- **Gap:** Redis is the only data store and has no backup configuration.
- **Enterprise Need:** Automated backups, point-in-time recovery, disaster recovery testing.

### 6.3 No Data Retention Policy
- **Gap:** Cached data lives until TTL expiry (1 hour default) with no configurable retention.
- **Enterprise Need:** Configurable data retention, automated cleanup, compliance with data regulations.

---

## 7. SCALABILITY & RELIABILITY (High)

*Still true as of 2026-07-23 — the campaign, even run to its full 40-round completion, hardened per-program conversion correctness, not the running service's scaling, failover, or backpressure behavior.*

### 7.1 Single-Instance Architecture
- **Gap:** Application runs as a single Node.js process. No clustering, no horizontal scaling, no load balancing.
- **Impact:** Single point of failure. Limited to single-server throughput.
- **Enterprise Need:** Cluster mode or multi-instance deployment behind load balancer, sticky sessions if needed.

### 7.2 No Graceful Degradation Strategy
- **Gap:** While Redis unavailability is handled, other failure modes (GitHub API down, out of memory, parser crash) have no fallback strategy.
- **Enterprise Need:** Circuit breakers, bulkheads, graceful degradation for all dependencies.

### 7.3 No Backpressure Handling
- **Gap:** The batch endpoint (`/api/convert/batch`) processes all files synchronously with no concurrency limit or backpressure.
- **Impact:** Large batch requests can exhaust memory and CPU, blocking all other requests.
- **Enterprise Need:** Concurrency limits, request queuing, backpressure signaling.

### 7.4 No Request Timeout
- **Gap:** No per-request timeout. A single malformed COBOL file that causes a parser hang will block the worker indefinitely.
- **Enterprise Need:** Per-request and per-conversion timeouts, watchdog timers.

---

## 8. API DESIGN & DOCUMENTATION (Medium)

*Still true as of 2026-07-23 — no API surface changes were made; the conversion engine's SQL generator remains unwired into the pipeline (Section 11), so the API's shape is unaffected either way.*

### 8.1 No OpenAPI/Swagger Specification
- **Gap:** API is documented in markdown only. No machine-readable API spec.
- **Enterprise Need:** OpenAPI 3.0 spec, Swagger UI, auto-generated client SDKs.

### 8.2 No API Versioning
- **Gap:** Endpoints are unversioned (`/api/convert/scala`). Any breaking change affects all consumers.
- **Enterprise Need:** URL-based (`/v1/api/...`) or header-based API versioning with deprecation policy.

### 8.3 Inconsistent Error Response Format
- **Gap:** Error responses vary between `{ error: message }` and Express default errors. No standard error envelope.
- **Enterprise Need:** Standardized error format (RFC 7807 Problem Details), error codes catalog.

### 8.4 No Pagination
- **Gap:** Batch results and analysis results are returned as unbounded arrays.
- **Enterprise Need:** Cursor or offset-based pagination for large result sets.

---

## 9. COMPLIANCE & GOVERNANCE (Medium)

*Still true as of 2026-07-23 — no audit logging, data classification, or compliance-framework work was done. Note: correctness verification (Section 11) is not compliance evidence — it demonstrates output-fidelity for 574 test programs, not an auditable control framework.*

### 9.1 No Audit Logging
- **Gap:** No record of who converted what, when, or the outcome. No access logs beyond what Express outputs.
- **Enterprise Need:** Immutable audit trail for all operations (who, what, when, outcome), tamper-proof storage.

### 9.2 No Data Classification
- **Gap:** COBOL source code submitted for conversion may contain business logic, PII, or financial data. No classification or handling framework.
- **Enterprise Need:** Data classification policy, PII detection/masking, data handling procedures per classification level.

### 9.3 No Compliance Framework Alignment
- **Gap:** No SOC 2, ISO 27001, GDPR, or industry-specific compliance considerations.
- **Enterprise Need:** Compliance mapping, evidence collection, regular audits.

### 9.4 MIT License — Enterprise Considerations
- **Gap:** MIT license is permissive but may need legal review for enterprise adoption, particularly regarding warranty/liability and intellectual property of converted code.
- **Enterprise Need:** License compatibility review, contributor license agreements (CLA).

---

## 10. FRONTEND ENTERPRISE GAPS (Medium)

*Still true as of 2026-07-23 — the campaign, even run to its full 40-round completion, made no frontend changes.*

### 10.1 No Frontend Testing
- **Gap:** Zero React component tests, no E2E tests (Playwright/Cypress), no visual regression tests.
- **Enterprise Need:** Component unit tests, integration tests, E2E test suite.

### 10.2 No Accessibility (a11y) Compliance
- **Gap:** No WCAG 2.1 compliance verification, no ARIA labels review, no accessibility testing tools configured.
- **Enterprise Need:** WCAG 2.1 AA compliance, automated a11y testing (axe-core), screen reader support.

### 10.3 No Internationalization (i18n)
- **Gap:** All strings are hardcoded in English. No i18n framework.
- **Enterprise Need:** i18n framework (react-intl/i18next), externalized strings, RTL support.

### 10.4 No Content Security Policy
- **Gap:** Monaco Editor loads code dynamically. No CSP headers configured to control script execution.
- **Enterprise Need:** Strict CSP policy, nonce-based script loading.

---

## 11. CONVERSION ENGINE MATURITY (Substantially Improved — Real Gaps Remain)

> **Rewritten 2026-07-11, truth-passed 2026-07-23 for the completed 40-round campaign.** This section described the conversion engine as of 2026-02-18, before an autonomous adversarial-verification campaign hardened it in two phases: an initial 14 rounds (reported 2026-07-11), then — at the owner's explicit request — resumed and run to completion at round 40 (by 2026-07-23). The February assessment (thin coverage, several silent-correctness bugs, no validation framework) is now **stale** for this section specifically. Full detail: `docs/ADVERSARIAL_ROUNDS_REPORT.md` (original 14-round campaign narrative), `docs/PROGRESS_STATUS.md` (closing report for the full campaign), and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` (statement-by-statement audit + `tests/oracle/README.md` finding tables, both current through round 40). This section does **not** change the overall enterprise-readiness verdict — see the banner at the top of this document and Sections 1–10/12, which are unaffected.

### 11.1 Known Bugs (Documented, 2026-02-18) — FIXED
The three bugs originally logged here were root-caused and fixed as part of the campaign, not merely patched around:
- "Record length calculation shows 0 instead of computed values" — was a field-name mismatch between parser (`item.pic`) and generator (`item.picture`); fixed via a shared `generator/layout.js` with byte counts hand-verified against real COBOL PIC/USAGE combinations (e.g. `S9(13)V99 COMP-3` → 8 bytes).
- "Complex expressions render as `[object Object]`" — was expression/condition converters matching AST node-type names the parser never actually emitted; fixed so real AST shapes are handled, and any genuinely unhandled construct now emits a visible `??? /* TODO */` marker rather than a silent stringified object.
- "Over-engineered data structures for simple fields" — addressed via the byte-accurate case-class generator (`generator/case-class-gen.js`) with real `parse`/`format` companions per field's actual USAGE/PIC.

These fixes are locked in by regression tests, not just narrative claims: ~2,017 automated tests (898 unit + 1,119 oracle) pass with 0 failures (`npm test` in `Thyraa-COBOL-main/backend/packages/cobol-to-scala/`), and 574 oracle-verified COBOL programs (up from 48 in February, and from 209 at the round-14 checkpoint) produce byte-identical stdout to real GnuCOBOL (`cobc`), or correctly fail to compile for the 11 deliberately-invalid probes.

### 11.2 Limited COBOL Dialect Support — STILL OPEN, clarified
- **Gap — still true as of 2026-07-23:** No explicit support for vendor-specific COBOL dialects. The verification oracle used throughout the campaign is **GnuCOBOL**, not IBM Enterprise COBOL — a different, though closely compatible, dialect/implementation. Nothing in the campaign, even run to its full 40-round completion, has been verified against IBM Enterprise COBOL or Micro Focus.
- **Enterprise Need:** Dialect configuration, vendor-specific extensions, dialect detection, and — for enterprises running IBM z/OS COBOL — a real IBM Enterprise COBOL oracle to re-verify the corpus against, since GnuCOBOL compatibility does not guarantee IBM compatibility.

### 11.3 No Conversion Validation Framework — LARGELY BUILT
- **2026-02-18 gap:** No automated verification that converted Scala code is semantically equivalent to original COBOL.
- **2026-07-23 status:** A real dual-run validation framework now exists and has been exercised at scale: for each of 574 corpus programs, `oracleCompare()` compiles and runs the program under real `cobc`, generates and compiles the corresponding Scala, and diffs stdout byte-for-byte — with 45 honestly documented `t.todo()` entries, each individually traced to a specific, named, still-open gap. This was stress-tested by the full 40-round campaign of adversarial refutation (programs deliberately written to break the generator): **241 real silent-divergence bugs were found and fixed this way across the whole campaign** (110 in the initial 14 rounds, trend 11, 16, 15, 16, 6, 6, 8, 4, 6, 6, 3, 4, 5, 4; then 131 more across rounds 15-40, trend 8, 6, 8, 8, 4, 2, 3, 4, 4, 5, 6, 8, 8, 4, 8, 4, 3, 5, 3, 2, 5, 2, 0, 6, 7, 8). The campaign's own 0-2-findings-for-two-consecutive-rounds convergence bar, missed throughout rounds 1-14, was finally met — but only once, briefly, at rounds 36-37 — before rounds 38-40 deliberately broadened the search into cross-round feature combinations and fresh territory, and immediately found bugs again at an *increasing* rate (6, 7, 8), including two entirely unimplemented statements (`REPLACE`, `PROGRAM-ID ... INITIAL`) discovered 39-40 rounds in. Hunting was originally paused at round 14 by owner decision (~22h into a 48h budget), not because the engine had converged — and indeed it had not: resuming through round 40 kept finding real, previously-unknown bugs the whole way. **Read "40 rounds, 0-2 recently" the same way "14 rounds" was originally read: strong evidence for this specific ~574-program corpus, not a claim that arbitrary new COBOL won't surface more.**
- **What this framework does *not* yet cover, honestly:** it validates the 574 specific corpus programs against GnuCOBOL, not "all COBOL" or IBM Enterprise COBOL (see 11.2); it does not include property-based or formal-verification techniques beyond the roundtrip byte-parity tests in `tests/roundtrip.test.js`; and it has no live dashboard (see 11.4).
- **Enterprise Need (narrowed, not closed):** Extend the corpus with real-world-shaped programs beyond the current 574 (a full VSAM maintenance job, a multi-cursor DB2 batch program — see `docs/PROGRESS_STATUS.md`'s recommended next steps), and add an IBM Enterprise COBOL oracle run for enterprises that require it.

### 11.4 No Conversion Metrics/Reporting — STILL OPEN
- **Gap — still true as of 2026-07-23:** There is no live conversion-analytics dashboard, no per-conversion success/failure tracking in the running product, and no complexity/quality scoring surfaced to end users. The campaign produced detailed *static* reports (`docs/ADVERSARIAL_ROUNDS_REPORT.md`, `docs/PROGRESS_STATUS.md`, `tests/oracle/README.md` finding tables) documenting test/program counts and bug trends across all 40 rounds, but these are engineering artifacts checked into the repo, not a product feature.
- **Enterprise Need:** Conversion analytics dashboard, success/failure tracking, quality scoring, surfaced through the actual product (not just docs).

### 11.5 Remaining Open Engine Gaps (honest inventory, 2026-07-23, after the full 40-round campaign)
Even with the above improvements — which now include, beyond what existed at the round-14 checkpoint, real `PROGRAM-ID ... RECURSIVE` support, a full `ORGANIZATION IS RELATIVE` file I/O storage-model rewrite (round 29, the single most serious finding of the whole campaign — the prior model silently corrupted binary data containing a newline byte), real LINAGE and FILE STATUS lifecycle support, and real IEEE-754 COMP-1/COMP-2 codecs — the following are confirmed still open in the engine (see `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` Part 1.3, `docs/PROGRESS_STATUS.md`, and `tests/oracle/README.md`'s Known Gaps for full detail), in the closing report's own risk order:
- **Reference modification** (COBOL's `field(start:length)` substring syntax) — **the single largest remaining risk in the whole engine.** It still degrades to a visible, compiling `???`/placeholder almost everywhere (a handful of narrow carve-outs exist: literal-length `FUNCTION LENGTH`, STRING's own segment source). Since ref-mod is extremely common in production COBOL (date/key parsing, fixed-width record slicing), this is the top item to check for before trusting a converted program's output.
- **`ORGANIZATION IS INDEXED`** (true VSAM-style keyed access) files remain genuinely unimplemented, and — unlike every other gap in this document — this project's own installed GnuCOBOL build has indexed-file support compiled out entirely, so this gap **cannot be oracle-verified in this sandbox at all**, even if a fix were attempted (round 27). (`ORGANIZATION IS RELATIVE` is, by contrast, now fully implemented and oracle-verified — see above.)
- **`CALL BY REFERENCE`/`CONTENT` of a GROUP containing an OCCURS table, into an ordinary (non-recursive) subprogram** — compiles and runs with no crash, but the callee silently sees a default/empty table instead of the caller's real data, with only a source-comment marker, not a runtime signal. (The identical shape into a `RECURSIVE` callee has real, working per-leaf aliasing since rounds 22/39.) This is a genuine exception to the engine's usual "never silent" rule, flagged explicitly by the round-40 completeness audit as a good next target.
- **SQL generator not wired into the main pipeline** — `generator/sql-gen.js` produces compile-verified Doobie code standalone, but it is not yet spliced into `generator/scala-generator.js`'s own output path.
- **CICS support is scaffolding only** — `generator/cics-gen.js` produces an honest service-skeleton (DTOs, repository traits, `???`-bodied stubs), not a behavioral translation.
- **`SORT`/`MERGE ... USING/GIVING`** (the whole-file form without an input/output procedure) is a visible TODO marker for both statements; the procedure-based SORT/MERGE/RELEASE/RETURN form is built and oracle-verified.
- **External/dynamic `CALL`** to a subprogram not defined in the same source file emits a visible TODO marker; same-file multi-`PROGRAM-ID` CALL interop and `RECURSIVE`-program CALL semantics are built and oracle-verified.
- **OCCURS DEPENDING ON** tables are sized at a fixed maximum for `parse`/`format`, not the live counter field; every occurrence carries a `// TODO(ODO)` marker.
- **General inter-paragraph GO TO webs** (outside a `PERFORM ... THRU` range) are unsupported by design — a genuinely hard problem across the whole COBOL-modernization industry, not unique to this engine.
- **JCL → sbt/pipeline skeletons are not generated** — JCL structural parsing and dataset-lineage JSON exist, but no rendered flow diagrams or sbt scaffolding are produced from that lineage yet.
- Nearly all of these surface honestly: the engine's cross-cutting rule is that every unhandled construct surfaces as a `??? /* TODO */` marker or an explicit comment rather than silently-wrong output — **with one confirmed exception**, the non-recursive GROUP+OCCURS `CALL BY REFERENCE` gap above, which is the one place the closing report flags as genuinely silent rather than honestly declined.

---

## 12. OPERATIONAL READINESS (Medium)

*Still true as of 2026-07-23 — no runbooks, capacity planning, or backup/restore work was done. Note on 12.2: the campaign's 574-program corpus and ~2,017 tests (even at its full 40-round completion) measure conversion **correctness**, not throughput or resource usage — they are not a substitute for the capacity benchmarks this section calls for.*

### 12.1 No Runbooks or Playbooks
- **Gap:** No documented procedures for incident response, on-call, or common operational tasks.
- **Enterprise Need:** Runbooks for common issues, escalation procedures, on-call rotation.

### 12.2 No Capacity Planning
- **Gap:** No benchmarks on how many lines of COBOL can be converted per second, memory requirements per conversion, or concurrent request limits.
- **Enterprise Need:** Capacity models, resource planning data, scaling triggers.

### 12.3 No Backup/Restore Procedures
- **Gap:** No documented or automated backup and restore procedures.
- **Enterprise Need:** RTO/RPO targets, automated backup verification, restore testing.

---

## Priority Matrix

> Updated 2026-07-23: rows are unchanged from February except "Real Test Framework & Coverage" (scoped down to the platform layer, since the engine's own test framework is fixed) and "Conversion Validation Framework" (marked done, moved out of the active blocker list — see Section 11.3). Running the campaign on from its round-14 checkpoint to round 40 strengthened the engine further but did not change this matrix again. All other rows, including P0/P1 security and infrastructure items, are unchanged and remain the actual gating blockers.

| Priority | Category | Effort | Business Impact |
|----------|----------|--------|-----------------|
| P0 - Blocker | Authentication & Authorization | High | Cannot deploy without access control |
| P0 - Blocker | CI/CD Pipeline | Medium | Cannot maintain quality at scale |
| P0 - Blocker | Platform Test Framework & Coverage (API/controller/frontend — engine-side is done, see 2.1/11.1) | Medium | Cannot verify correctness outside the conversion engine |
| P1 - Critical | Rate Limiting & Input Validation | Low | DoS prevention |
| P1 - Critical | Structured Logging & Monitoring | Medium | Cannot debug production issues |
| P1 - Critical | Docker Containerization | Medium | Cannot deploy reproducibly |
| P1 - Critical | HTTPS/TLS & Security Headers | Low | Data in transit protection |
| P2 - High | Database for Persistence | High | Cannot audit or analyze usage |
| P2 - High | API Versioning & OpenAPI Spec | Medium | Cannot evolve API safely |
| P2 - High | Error Tracking (Sentry) | Low | Cannot detect production issues |
| P2 - High | Horizontal Scaling | High | Cannot handle enterprise load |
| P3 - Medium | Audit Logging & Compliance | High | Regulatory requirements |
| P3 - Medium | Frontend Testing | Medium | UI quality assurance |
| P3 - Medium | Accessibility Compliance | Medium | Legal/regulatory requirement |
| ~~P3 - Medium~~ **DONE (2026-07-11, campaign completed 2026-07-23)** | ~~Conversion Validation Framework~~ — built and oracle-verified (574 programs, ~2,017 tests, after the full 40-round campaign); remaining work is extending corpus breadth and an IBM Enterprise COBOL oracle run, not building the framework itself | — | Core product quality — no longer the blocking risk it was in February |
| P4 - Low | i18n Support | Medium | Global enterprise reach |
| P4 - Low | Multi-dialect COBOL Support (IBM Enterprise COBOL/Micro Focus — GnuCOBOL-verified only, see 11.2) | High | Broader market coverage |

---

## Recommended Immediate Actions (Next 30 Days)

> Updated 2026-07-23: item 3 is narrowed below — it is done for the conversion engine package but still open everywhere else. All other items are unchanged and still the recommended next actions.

1. **Add authentication middleware** — JWT/OAuth 2.0 on all API routes
2. **Set up CI/CD** — GitHub Actions with build, lint, test, security scan
3. **Replace console.log tests with Vitest/Jest + assertion-based test suite** — done for `packages/cobol-to-scala/` (now `node:test`, ~2,017 tests across 898 unit + 1,119 oracle, see Section 2.1/11.1); still needed for the API/controller layer and the frontend, which remain untested
4. **Add `helmet.js`** and configure CORS whitelist
5. **Add `express-rate-limit`** and request body size limits
6. **Create Dockerfile** and `docker-compose.yml` for reproducible development
7. **Integrate structured logging** via Pino or Winston
8. **Add request timeouts** and batch size caps to conversion endpoints
9. **Implement a basic health check** that verifies Redis and GitHub API connectivity
10. **Set up `npm audit`** and Dependabot for dependency vulnerability scanning

---

## Conclusion

**Original (2026-02-18):** The platform has a **solid architectural foundation** and **excellent documentation** that positions it well for enterprise evolution. The conversion engine core (lexer, parser, generator) demonstrates strong domain understanding. However, **the application is currently at prototype/demo maturity** and requires substantial investment across security, testing, observability, and infrastructure to meet enterprise production standards. The gaps identified are all addressable and common for early-stage products transitioning to enterprise readiness.

**Updated (2026-07-23, campaign run to completion):** The conversion engine assessment above is no longer accurate on its own — an autonomous adversarial-verification campaign, run in two phases (an initial 14 rounds reported 2026-07-11, then resumed at the owner's explicit request and run all the way to round 40 by 2026-07-23), has moved the engine from "demonstrates strong domain understanding" to "574 COBOL programs oracle-verified byte-for-byte against a real compiler, ~2,017 tests passing with 0 failures, 241 root-cause bugs fixed (110 in rounds 1-14, 131 in rounds 15-40)," with the remaining engine gaps now specific and enumerated (Section 11.5) rather than systemic — though, per the campaign's own honest assessment, not adversarially exhausted even after 40 rounds (rounds 38-40 found bugs at an increasing rate right through the final round). **This does not change the platform's overall enterprise-readiness verdict.** The campaign was scoped entirely to the conversion engine and touched no authentication, CI/CD, containerization, observability, compliance, database, or frontend concern — Sections 1–10 and 12 are unchanged and remain the actual gating blockers to production, and running the campaign on from round 14 to round 40 did not change that in any way. In short: the product's technical core is now demonstrably more trustworthy than it was even at the round-14 checkpoint, but the platform wrapped around it is still at the same prototype/demo maturity described in February. See `docs/ENTERPRISE_GAP_ANALYSIS.md` for the companion scorecard tracking the same platform gaps from a different angle, and `docs/ADVERSARIAL_ROUNDS_REPORT.md` (rounds 1-14), `docs/PROGRESS_STATUS.md` (closing report for the full campaign), and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` for the full engine-hardening record.
