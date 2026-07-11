# COBOL-to-Scala Autonomous Build — Progress Status

**Last updated:** 2026-07-11 ~20:15 UTC (run started ~01:30 UTC — **~19 hours elapsed** of the 2-day window)
**Branch:** `claude/analyze-codebase-pdPSZ` — all work below is **committed and pushed**
**Orchestrator token budget:** well under the 2M cap (orchestrator only dispatches/reviews; all coding happens in delegated Sonnet subagents whose tokens don't count against it)
**Status:** 🟢 Running — round 13 found 5 more genuine bugs (fix in progress); 187 verified programs committed so far

---

## 1. What this run is

You asked whether Fable, running autonomously with subagents, could take this COBOL→Scala conversion engine from "looks complete but silently produces wrong output" to something genuinely verified against real COBOL semantics — across all 4 roadmap phases — over your 2-day window. This is that run.

**The core method (repeats every round):**
1. An adversarial subagent writes 10–14 new, deliberately hostile COBOL programs targeting whatever hasn't been tested yet, compiles each with the *real* GnuCOBOL compiler, and runs `oracleCompare()` — diffing GnuCOBOL's actual output against the generated Scala's actual output.
2. Every mismatch is triaged **HONEST** (a documented, visible gap) or **DISHONEST** (silent wrong output, a crash, or an infinite loop on a claimed-supported feature).
3. A fix subagent closes every dishonest finding, and the winning adversarial programs are **permanently promoted** into the test corpus with the compiler's real output captured as the pass/fail oracle.
4. I (the orchestrator) independently re-run the full suite myself before ever committing — nothing gets marked "done" on a subagent's say-so alone.
5. Repeat until a round finds 0–2 dishonest bugs (convergence) or time/budget runs out.

This is expensive on purpose: it's the only way to catch the class of bug that *looks* fine (compiles, runs, prints something plausible) but is quietly wrong — which is exactly what made the original codebase's fixes unreliable before this run started.

---

## 2. What's completed

### The 4 roadmap phases (all built)
| Phase | What it covers | State |
|---|---|---|
| **1 — Data layer** | Lexer/parser fixes, COBOL PIC/COMP/COMP-3 byte-level codecs (packed decimal, binary, zoned, EBCDIC), copybook expansion, record layouts | ✅ Built + hardened across 12 refutation rounds |
| **2 — Procedure logic** | Full statement set: PERFORM (all forms), IF/EVALUATE, SEARCH/SEARCH ALL, SORT, STRING/UNSTRING/INSPECT, arithmetic (COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE with ROUNDED), MOVE (incl. CORRESPONDING), file I/O, DECLARATIVES/error handling, multi-program CALL | ✅ Built + hardened |
| **3 — SQL/JCL** | EXEC SQL → typed Doobie code (compile-verified against the real doobie library), JCL job-step parsing | ✅ MVP done; **SQL generator not yet wired into the main code path** (still stands alone) |
| **4 — CICS** | CICS command classification, BMS screen-map parsing, service-skeleton generation | ✅ Scaffolding done (intentionally not a full behavioral CICS runtime — see roadmap doc) |

### The verification record (the actual proof of correctness)
- **187 real COBOL test programs**, each compiled with genuine GnuCOBOL and diffed byte-for-byte against the generated Scala's output
- **790 automated tests**, all passing
- **12 completed adversarial rounds** — dishonest-bug counts per round: `11, 16, 15, 16, 6, 6, 8, 4, 6, 6, 3, 4`
- **Round 13 in progress**: found 5 more genuine bugs by testing *combinations* of previously-tested features rather than single features (expected, since single-feature bugs are increasingly scarce). Most notable: DECLARATIVES error-handler registries were only wired up *after* generating the handler bodies themselves — meaning a handler that retries its own failed operation, or one handler triggering another, silently couldn't fire. Fix in progress.
- **28 commits**, each independently verified green before being pushed (never committed red)

### Notable bugs this process actually caught
These are the kind of thing that would have shipped silently broken without this process:
- A **parser infinite loop** on a rare-but-valid COBOL clause (`88-level ... WHEN SET TO FALSE`) — would have hung forever on real customer code
- `ADD CORRESPONDING`/`SUBTRACT CORRESPONDING` silently ignoring `ROUNDED`
- Multi-target `COMPUTE A B C = expr` never worked at all (inverted logic bug in the original parser)
- File WRITE and READ using two *different, incompatible* byte encodings for the same record — silent data corruption for any packed-decimal field written to a file
- `SEARCH ALL` (binary search) returning false matches/non-matches on multi-key tables
- Numeric literals that looked like digits (e.g. `"10"`) being silently typed as integers instead of strings, breaking common patterns like `IF FILE-STATUS = "10"`
- Group-level `CALL BY REFERENCE` silently dropping the sign off negative packed-decimal fields crossing a subroutine boundary

Full details of every finding and fix are in `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md` (869 lines — the complete verification ledger).

---

## 3. What's still pending / open

### Actively in progress right now
- **Round 13** adversarial hunting just dispatched — looking for whatever's left after 12 rounds

### Documented, intentional gaps (not bugs — known and clearly marked)
These are real COBOL features the engine doesn't fully handle yet. Each one degrades **visibly** (a clear `???` marker or documented skip) rather than silently producing wrong output:
- **Reference modification** (`field(start:length)` substring syntax) — parses correctly now, but read/write codegen is a visible placeholder, not real substring logic
- **Bare unqualified PERFORM/GO TO into an ambiguous paragraph name** — round 12 fixed the *qualified* form (`PERFORM x OF section-y`); the rare bare-ambiguous case remains
- **GO TO into the middle of a fall-through chain that must keep cascading** — a narrow control-flow corner
- **REWRITE / DELETE / START** file operations — stubbed, not implemented
- **SORT USING/GIVING** (file-to-file sort without an input/output procedure) — documented TODO
- **External/dynamic CALL** (calling a program not present in the same source) — visible TODO marker
- **SQL generator wiring** — Doobie code generation works and is tested, but isn't yet spliced into the main COBOL→Scala pipeline
- **JCL → sbt/pipeline skeleton generation** — JCL parsing works; generating actual build skeletons from it does not yet
- **CICS behavioral conversion** — only scaffolding/classification, not a working CICS runtime translation
- **OCCURS DEPENDING ON dynamic parse/format** — sized at a fixed maximum rather than truly dynamic

### Where this goes next
Round 13 is running now. The dishonest-finding trend (6→6→3→4) suggests we're close to diminishing returns but hasn't flattened to zero yet — each round still finds 3-4 genuine bugs. I'll keep running rounds, verifying, committing, and pushing after each one, and will update this file at the next natural checkpoint.

---

## 4. Where to look for more detail

| What | Where |
|---|---|
| Full phase-by-phase capability roadmap | `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` |
| Complete verification ledger (every round, every finding, every fix) | `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md` |
| Full autonomous run activity log (every cycle) | `docs/AUTONOMOUS_BUILD_LOG.md` |
| Runnable demo (COBOL in → verified-equivalent Scala out) | `demo/convert-demo.sh` + `demo/README.md` |
| Market analysis (why this matters commercially) | `docs/MARKET_ANALYSIS_COBOL_MODERNIZATION.md` |
