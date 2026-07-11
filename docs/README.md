# Documentation

Documentation for the COBOL-to-Scala conversion platform.

> **Status (2026-07-11):** The conversion **engine** has been hardened through a 14-round
> autonomous adversarial-verification campaign — **209 COBOL programs verified byte-for-byte
> against real GnuCOBOL**, **879/879 automated tests passing**, **110 silent-divergence bugs
> fixed**. The campaign was **engine-only**: the surrounding platform (UI, API, auth, deployment,
> CI/CD, observability, compliance) was intentionally out of scope and remains unbuilt. Docs below
> are grouped by whether they describe **current verified state** or **earlier planning/vision**.

---

## 📊 Current state (2026-07 — start here)

- **[Adversarial Rounds Report](ADVERSARIAL_ROUNDS_REPORT.md)** — the full 14-round verification
  campaign: methodology, round-by-round narrative, all 110 bugs by class, the 10 most consequential
  findings, convergence analysis, and the resume plan. *The definitive account of what the engine
  does and how it was proven.*
- **[Progress Status](PROGRESS_STATUS.md)** — the live dashboard: what's completed, what's pending,
  headline numbers.
- **[Capability Audit & Coverage Roadmap](CAPABILITY_AUDIT_AND_ROADMAP.md)** — statement-by-statement
  audit of what the engine actually does today, the full Known Gaps list, and the staged plan to full
  COBOL coverage. *(Companion: the enterprise-readiness analyses below.)*
- **[Autonomous Build Log](AUTONOMOUS_BUILD_LOG.md)** — cycle-by-cycle activity log of the build run.
- **[Toolchain Status](toolchain-status.md)** — the verification toolchain (GnuCOBOL `cobc` +
  `scala-cli`) and how the compiler-oracle harness runs.
- **Verification ledger** — `../Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md`
  — every finding → fix → corpus program, round by round.

## 🧭 Strategy & market

- **[Market Analysis — COBOL Modernization](MARKET_ANALYSIS_COBOL_MODERNIZATION.md)** — is the market
  real, is COBOL→Scala the right wedge; verified facts separated from industry folklore.

## 🏗️ Architecture & analysis

- **[Unified Platform Architecture](UNIFIED_PLATFORM_ARCHITECTURE.md)** — system architecture and
  product vision. *Annotated 2026-07 with built-vs-vision status per component.*
- **[Codebase Analysis](CODEBASE_ANALYSIS.md)** — engine structure and a comparison with a peer
  project. *Updated 2026-07.*

## 🔐 Enterprise readiness (platform gaps — still open)

- **[Enterprise Gap Analysis](ENTERPRISE_GAP_ANALYSIS.md)** — 10-dimension scorecard. *Updated 2026-07:
  engine dimensions improved; platform dimensions (security, infra, CI/CD, observability, compliance)
  unchanged and still gating.*
- **[Enterprise Readiness Gap Analysis](ENTERPRISE_READINESS_GAP_ANALYSIS.md)** — readiness vs
  production requirements across ~12 areas. *Updated 2026-07 (engine assessment only).*

## 📅 Earlier planning docs (historical — annotated with current status)

- **[MVP Sprint Plan](MVP_SPRINT_PLAN.md)** — the original "10–20 hours to working product" plan,
  now annotated with what actually shipped.
- **[Focused Sprint Plan](SPRINT_PLAN_FOCUSED.md)** — detailed task breakdown, annotated with current
  status.

## 📖 Reference & guides

- **[Main README](../README.md)** — quick start and overview
- **[COBOL Reference](../cobol-reference/)** — program structure, data division, copybooks, procedure
  division, file handling, CICS/DB2, enterprise patterns, transpiler considerations
- **[Runnable demo](../demo/)** — `convert-demo.sh` + `demo/README.md`: COBOL in → verified-equivalent
  Scala out

---

## 🎯 Where to start

**Want to know what the engine actually does today?**
1. [Adversarial Rounds Report](ADVERSARIAL_ROUNDS_REPORT.md) (what's proven)
2. [Capability Audit & Coverage Roadmap](CAPABILITY_AUDIT_AND_ROADMAP.md) (what's covered, what's not)
3. [Progress Status](PROGRESS_STATUS.md) (the dashboard)

**Assessing production readiness?**
1. [Enterprise Gap Analysis](ENTERPRISE_GAP_ANALYSIS.md) (the scorecard — note the engine-only caveat)
2. [Capability Audit](CAPABILITY_AUDIT_AND_ROADMAP.md) §1.3 (Known Gaps)

**Working on the engine?**
1. [Capability Audit & Coverage Roadmap](CAPABILITY_AUDIT_AND_ROADMAP.md)
2. The verification ledger: `../Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md`
3. [Toolchain Status](toolchain-status.md) — how to run the oracle harness

---

## 🔗 External resources

- [Scala 3 Documentation](https://docs.scala-lang.org/scala3/)
- [GnuCOBOL](https://gnucobol.sourceforge.io/) — the reference compiler used as the verification oracle
- [Enterprise COBOL Guide](https://www.ibm.com/docs/en/cobol-zos/6.4)

---

**Questions?** Open an issue or start a discussion on GitHub.
