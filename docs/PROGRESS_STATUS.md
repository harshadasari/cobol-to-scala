# COBOL-to-Scala Autonomous Build — Progress Status

**Last updated:** 2026-07-13 ~03:45 UTC (rounds resumed at your request — target: round 40, past halfway)
**Branch:** `claude/analyze-codebase-pdPSZ` — all work below is **committed and pushed**
**Status:** 🟢 Running — round 20 complete and committed (293 verified programs, 1127/1149 tests, 22 honest todos by design). Round 21 in progress. Target: continue to round 40, then resume the wrap-up track (final completeness critic, docs truth-pass, final report).

### Round 20 headline
Sixth feature-combination round, and the lowest finding count since resuming (**2 dishonest bugs**, continuing the downward trend 8→6→8→8→4→2) — though not yet at the 0-2-for-two-consecutive-rounds convergence bar. 11 of 14 probes passed cleanly, further confirming basic structural shapes are solid. The 2 real findings: a paragraph literally named `EXIT` (or `CONTINUE`) truncated its own body, because the lexer tokenizes these as reserved verb keywords rather than identifiers, so the parser dispatched to a bare EXIT statement instead of recognizing genuine paragraph-name position (fixed with a narrowly-scoped guard that leaves the far more common `SOME-EXIT. EXIT.` mid-body idiom untouched); and MERGE's own internal per-file open wrongly invoked a DECLARATIVES error handler on a missing USING file, something real cobc never does for its own internal file access (fixed with a MERGE-specific open with no DECLARATIVES dispatch at all). 14 new corpus programs (`i01`-`i14`) promoted; corpus now 293.

### Round 19 headline
Fifth feature-combination round, and the first to explicitly probe basic-but-possibly-never-tried structural shapes per round 18's lesson — 7 clean passes confirmed those are solid (no WORKING-STORAGE, empty PROCEDURE DIVISION, FD-only records, multiple SD descriptions all work correctly). Found **4 dishonest bugs**: MERGE silently losing all field data when a USING file's record was a flat (non-group) field, not the group shape round 18's own implementation happened to test (fixed for real, reusing the same scatter convention MOVE already uses); CALL of a single subscripted table element crashing because the subscript was dropped entirely (fixed for real); and two narrower, more judgment-call findings handled with visible honest markers rather than large refactors — a GO TO escaping an active PERFORM range (real COBOL never returns; this engine's method-call PERFORM model can't express that without a disproportionate control-flow rewrite) and a literal negative/zero subscript getting the same defensive clamp as a dynamic one, but now with a visible marker instead of silent clamping (deliberately not chasing cobc's own undefined out-of-bounds memory-read behavior). 14 new corpus programs (`h01`-`h14`) promoted; corpus now 279.

### Round 18 headline
Fourth feature-combination round, and the most consequential single finding of the whole resumed campaign: a `PROCEDURE DIVISION` whose very first line is a plain statement rather than a paragraph/section name — completely ordinary, legal COBOL, an unnamed "main body" — was silently dropped **at the parser level**, producing zero paragraphs and an entirely empty generated program. This had never been caught in 17 prior rounds because every corpus program up to now happened to declare an explicit paragraph name. Fixed by synthesizing an implicit top-level paragraph. The same round also found `MERGE` had **zero generator support at all** despite the roadmap doc claiming it was oracle-equivalent (now implemented for real, reusing SORT's own machinery), plus 6 more bugs: EVALUATE silently skipping a shared multi-WHEN body containing a nested PERFORM THRU; STRING/UNSTRING diverging from cobc's live-aliasing semantics when the same subscripted element is both source and destination; ADD/SUBTRACT CORRESPONDING ignoring subscripts on both operands (hard crash); OCCURS directly on a REDEFINES item mis-modeled as scalars; a REDEFINES flat-accessor never registered past 3 nesting levels; and a subscript-guard fix (`.max(0)`, applied generally, not special-cased) preventing any placeholder value from crashing the program when used as a table index. 14 new corpus programs (`g01`-`g14`) promoted; corpus now 265.

### Round 17 headline
Third feature-combination round, matching round 15's high-water mark. Found **8 dishonest findings**, several in genuinely new territory: INSPECT REPLACING crashing on a subscripted table-row element (fixed — routed through the same subscripted-write helper other statements use); SEARCH ALL failing on 3+ dimension nested OCCURS tables (fixed — generalized the key-subscript threading to any depth); EVALUATE TRUE unable to find 88-level condition names declared on a REDEFINES target (fixed — now registered the same as an ordinary item's); a REDEFINES byte-slicing bug causing an actual runtime out-of-bounds crash when SYNC was on the *redefining* item rather than the target (fixed — same byte-accurate approach as round 16, opposite direction); and reference modification reaching three more previously-untested spots (MOVE-to-numeric, DISPLAY, FUNCTION LENGTH) — the first two get an honest placeholder (now centralized into shared helpers rather than copy-pasted per call site), FUNCTION LENGTH is a genuine fix since its length operand is a compile-time constant in the common case. 14 new corpus programs (`f01`-`f14`) promoted; corpus now 251.

### Round 16 headline
Second feature-combination round. Found **6 dishonest findings**: an elementary-over-group REDEFINES crash when the target had a SYNC-padded child (fixed with a new byte-accurate codec-based flat-view fallback); reference modification used as an IF/EVALUATE comparison operand and as a CALL argument — both now degrade to a visible, honest placeholder instead of crashing or silently passing the wrong value; a PERFORM ... THRU nested inside other control-flow constructs never got its wrapper method generated (fixed by recursing into every nested statement list); SEARCH/SEARCH ALL over an OCCURS DEPENDING ON table ignored the live counter and over-scanned (silent wrong output, now fixed); and a bare USAGE BINARY-LONG/CHAR/SHORT/DOUBLE item with no PIC clause was silently treated as a string (arithmetic acted like concatenation) — now correctly typed. 14 new corpus programs (`e01`-`e14`) promoted; corpus now 237.

### Round 15 headline
The first feature-combination round per the campaign's own resume plan. Found **8 dishonest findings**: 3 related SYNC-alignment bugs (group-VALUE inheritance, nested sub-group absolute offset, OCCURS-stride rounding), a COMP-5 truncation bug, two subscripted-row-MOVE bugs (cross-table and multi-dimensional — both fixed for real), an OPEN-failure FILE STATUS code bug, and a STRING+reference-modification crash (fixed to an honest compiling decline). 14 new corpus programs (`d01`-`d14`) promoted; corpus now 223.

---

## 1. What this run is

You asked whether Fable, running autonomously with subagents, could take this COBOL→Scala conversion engine from "looks complete but silently produces wrong output" to something genuinely verified against real COBOL semantics — across all 4 roadmap phases — over your 2-day window. This is that run.

**The core method (repeated every round):**
1. An adversarial subagent writes 10–14 new, deliberately hostile COBOL programs targeting whatever hasn't been tested yet, compiles each with the *real* GnuCOBOL compiler, and runs `oracleCompare()` — diffing GnuCOBOL's actual output against the generated Scala's actual output.
2. Every mismatch is triaged **HONEST** (a documented, visible gap) or **DISHONEST** (silent wrong output, a crash, or an infinite loop on a claimed-supported feature).
3. A fix subagent closes every dishonest finding, and the winning adversarial programs are **permanently promoted** into the test corpus with the compiler's real output captured as the pass/fail oracle.
4. I (the orchestrator) independently re-run the full suite myself before ever committing — nothing gets marked "done" on a subagent's say-so alone.
5. Repeat until a round finds 0–2 dishonest bugs (convergence) or you call it — **you called it at round 14**.

---

## 2. What's completed

### ⭐ NEW: the full campaign report
**`docs/ADVERSARIAL_ROUNDS_REPORT.md`** — the detailed report you asked for on all 14 rounds: methodology, round-by-round narrative, bug-impact analysis by category, the 10 most consequential bugs ranked by real-world blast radius, the convergence-trend analysis (and an honest statement that it did *not* converge — you paused it), the full Known Gaps list, and concrete recommendations for when you resume rounds later.

### The 4 roadmap phases (all built)
| Phase | What it covers | State |
|---|---|---|
| **1 — Data layer** | Lexer/parser fixes, COBOL PIC/COMP/COMP-3 byte-level codecs (packed decimal, binary, zoned, EBCDIC), copybook expansion, record layouts | ✅ Built + hardened across 14 refutation rounds |
| **2 — Procedure logic** | Full statement set: PERFORM (all forms), IF/EVALUATE, SEARCH/SEARCH ALL, SORT, STRING/UNSTRING/INSPECT, arithmetic with ROUNDED, MOVE (incl. CORRESPONDING), file I/O, DECLARATIVES, multi-program CALL | ✅ Built + hardened |
| **3 — SQL/JCL** | EXEC SQL → typed Doobie code (compile-verified against the real doobie library), JCL job-step parsing | ✅ MVP done; **SQL generator not yet wired into the main code path** |
| **4 — CICS** | CICS command classification, BMS screen-map parsing, service-skeleton generation | ✅ Scaffolding done (intentionally not a full behavioral CICS runtime) |

### The verification record (the actual proof of correctness)
- **209 real COBOL test programs**, each compiled with genuine GnuCOBOL and diffed byte-for-byte against the generated Scala's output
- **879 automated tests, all passing** (879/879, 0 fail, 0 todo — independently verified before the round-14 commit)
- **14 completed adversarial rounds** — dishonest-bug counts per round: `11, 16, 15, 16, 6, 6, 8, 4, 6, 6, 3, 4, 5, 4` = **110 real bugs found and fixed**
- **Round 14 (final round of this run) — committed**: 4 bugs fixed, the biggest being a **general parser flaw**: a period after an unterminated IF/READ AT END/ON SIZE ERROR silently swallowed every following statement into the wrong scope — ordinary period-terminated COBOL style, not an edge case. Also fixed: qualified `PERFORM ... THRU` resolving the wrong section, INSPECT REPLACING multi-clause cascading, and dead SYNC alignment (now matches cobc record layouts byte-for-byte).
- **26 commits**, each independently verified green before being pushed (never committed red)

### Notable bugs this process caught (top of the list — full ranking in the report)
- A **parser infinite loop** on valid COBOL (`88-level ... WHEN SET TO FALSE`) — would have hung forever on real customer code
- File WRITE and READ using two *incompatible* byte encodings for the same record — silent data corruption for packed-decimal (money) fields
- The round-14 **sentence-scope period bug** — silently mis-scoped statements in any old-style COBOL without END-IF/END-READ
- A cross-conversion **state leak** — converting two programs in one process let program A's error handler contaminate program B
- Bare `READ file.` silently swallowing the next statement — unbounded damage by construction
- Multi-target `COMPUTE A B C = expr` never worked at all; `SEARCH ALL` returning false matches on multi-key tables; `"10"` literals typed as Int breaking `FILE STATUS = "10"`

---

## 3. What's pending

### Wrap-up phase (in progress right now)
- ✅ Round 14 committed + pushed (879/879 green)
- ✅ `docs/ADVERSARIAL_ROUNDS_REPORT.md` written
- ⏳ Truth-pass on `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` (bring every claim in line with the round-14 state)
- ⏳ Final closing summary in `docs/AUTONOMOUS_BUILD_LOG.md`

### Paused (resumable whenever you want)
- **Adversarial rounds 15+** — the campaign had NOT converged (plateau at 3–5 bugs/round vs the 0–2 bar). The report's §7 has a concrete plan for where round 15 should aim: feature-combination probes (DECLARATIVES × CALL × file I/O in one program, SYNC × nested groups × OCCURS), plus the cheapest Known-Gap promotions first.

### Documented, intentional gaps (visible degradation, not silent bugs)
Full 16-item list with precise scope in the report §6. Highlights: reference modification codegen, REWRITE/DELETE/START, SORT USING/GIVING, external/dynamic CALL, SQL wire-in, JCL→sbt skeletons, CICS behavioral conversion, OCCURS DEPENDING ON dynamic sizing, general inter-paragraph GO TO.

---

## 4. Where to look for more detail

| What | Where |
|---|---|
| ⭐ **Full 14-round campaign report (impact, analysis, recommendations)** | `docs/ADVERSARIAL_ROUNDS_REPORT.md` |
| Complete verification ledger (every round, every finding, every fix) | `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md` |
| Full autonomous run activity log (every cycle) | `docs/AUTONOMOUS_BUILD_LOG.md` |
| Phase-by-phase capability roadmap | `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` |
| Runnable demo (COBOL in → verified-equivalent Scala out) | `demo/convert-demo.sh` + `demo/README.md` |
| Market analysis (why this matters commercially) | `docs/MARKET_ANALYSIS_COBOL_MODERNIZATION.md` |
