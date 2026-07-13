# Autonomous Build Log — COBOL-to-Scala Engine (Phases 1–4)

**Run start:** 2026-07-11 ~01:30 UTC · **Branch:** claude/analyze-codebase-pdPSZ · **Budget:** orchestrator ≤2M own tokens, 48h wall clock

## Open questions / blockers
_(none currently open - all prior pins resolved; see cycle entries. Tracked-OPEN roadmap items live in docs/CAPABILITY_AUDIT_AND_ROADMAP.md section 1.3 and tests/oracle/README.md known-gaps.)_

## Status snapshot (updated cycle 24)
- **Phases:** 1+2 oracle-verified deep; 3 MVP done (SQL wire-in OPEN); 4 scaffolding done
- **Tests:** 590/590, 118 oracle-gated corpus programs (started at 27 tests)
- **Refutation rounds:** 8 so far (11,16,15,16,6,6,8,4 findings - all fixed through r7; r8 fix in flight)

## Activity
### Cycle: Round 18 committed (2026-07-13 ~01:50 UTC)
Fourth feature-combination round. Most consequential finding of the resumed campaign: a PROCEDURE DIVISION beginning with a bare statement (no paragraph/section name) - ordinary, legal COBOL - was silently dropped in its ENTIRETY at the parser level (parseProcedureDivision produced zero paragraphs/sections). Never caught in 17 prior rounds since every corpus program to date happened to name its first paragraph. Fixed by synthesizing an implicit top-level paragraph the moment a statement arrives with none in scope; a companion gap (WRITE/REWRITE FROM a literal, not just an identifier) found and fixed while isolating this. Also: MERGE had ZERO generator support at all (contradicting the roadmap doc's oracle-equivalent claim, corrected) - now a real implementation reusing SORT's SD/buffer/cascade machinery. Plus 6 more: EVALUATE silently skipping a shared multi-WHEN body with a nested PERFORM THRU; STRING/UNSTRING diverging from cobc's live-aliasing semantics on self-referential subscripted elements (fixed via per-target restructuring); ADD/SUBTRACT CORRESPONDING ignoring both operands' subscripts (crash, fixed); OCCURS directly on a REDEFINES item mis-modeled as scalars (fixed); REDEFINES flat-accessor registration breaking past 3 nesting levels (fixed); and a general `.max(0)` defensive subscript-index guard (not special-cased) so any placeholder value can no longer crash the program as a table index. Independently verified 1055/1070 (15 honest todos - 11 pre-existing plus 4 new, hand-reconciled against the fix list exactly). Corpus 251 -> 265.

Process note: reviewed the fix agent's diffs carefully before trusting them, since it modified 7 PRE-EXISTING regression test files (unusual and higher-risk than adding new ones) - confirmed every change reflected a real, legitimate code-shape shift from the actual fixes (the .max(0) guard, UNSTRING's per-target restructuring), not a weakened assertion. Also independently confirmed the MERGE implementation's correctness reasoning (concatenate-then-stable-sort is provably equivalent to k-way merge when each input is already internally sorted) before accepting it as a "real fix" rather than an honest decline.

### Cycle: Round 17 committed (2026-07-13 ~00:15 UTC)
Third feature-combination round, tying round 15's high-water mark. 8 dishonest findings: INSPECT REPLACING crashing on a subscripted table element (fixed, routed through the shared subscripted-write helper); SEARCH ALL failing on 3+ dimension OCCURS tables (fixed, generalized key-subscript threading to any depth); EVALUATE TRUE unable to find 88-levels on a REDEFINES target (fixed, registered same as ordinary items); REDEFINES byte-slicing crash when SYNC is on the redefining item rather than the target - opposite direction from round 16's fix, same byte-accurate approach applied; and reference modification reaching 3 more operand positions (MOVE-to-numeric and DISPLAY get honest placeholders, now centralized into shared refModGapComment/refModStringPlaceholder/refModNumericPlaceholder helpers reused by rounds 15-16's own call sites with verified-unchanged output; FUNCTION LENGTH gets a genuine fix since its length operand is a compile-time constant in the common case). CALL BY CONTENT of a group-with-OCCURS table (the 8th finding) needed no code change - confirmed the round-13 honest-placeholder fix already applies uniformly regardless of CALL mode. Independently verified 1009/1020 (11 honest todos - 5 pre-existing plus 6 new, all precisely accounted for by hand-count against the fix list). Corpus 237 -> 251.

Process note: the original fix agent hit a mid-response server error after completing 7 of 8 fixes; rather than restart from scratch, I reviewed its diffs directly, confirmed 7 were sound, and dispatched a targeted continuation agent for just the 8th finding plus housekeeping (test file, ledger entry, full-suite run) - which itself then stopped waiting on its own "monitor" for the suite, so I tracked the real PID directly again, same lesson as round 16.

### Cycle: Round 16 committed (2026-07-12 ~22:55 UTC)
Second feature-combination round. 6 dishonest findings: elementary-over-group REDEFINES crash with a SYNC-padded target child (fixed via a new byte-accurate codec-based flat-view fallback, reusing case-class-gen.js's own codec dispatch); ref-mod as an IF/EVALUATE comparison operand and as a CALL argument (both crashed or silently passed wrong data before, now honest-decline placeholders matching round 15's established pattern); PERFORM THRU nested inside other control flow never got its wrapper method generated (fixed - statement-list collection now recurses to any depth); SEARCH/SEARCH ALL ignoring an OCCURS DEPENDING ON's live counter (silent wrong output, fixed); bare USAGE BINARY-LONG/CHAR/SHORT/DOUBLE with no PIC silently typed as string (fixed with correct implicit PIC/width/signedness). Independently verified 966/971 (5 honest todos, all precisely accounted for in the ledger - including one, e14, confirmed to be the pre-existing round-13 table-writeback gap, not a new bug). Corpus 223 -> 237.

Process note: the fix agent hit a session API limit mid-task (resets 9:40pm UTC) after completing all 6 fixes but before its own final suite run; I picked up independent verification myself once the reset had passed. Also hit a pgrep self-matching bug in my own wait-loop (`pgrep -f "node --test"` matched the wrapper script's own command line, causing a premature false-complete signal) - corrected by waiting on the exact PID directly.

### Cycle: Rounds resumed at owner's request — target round 40 (2026-07-12 ~18:15 UTC)
Owner instruction: continue adversarial rounds with Sonnet through round 40, then resume the wrap-up track. Model switched to Sonnet for this session (orchestrator + subagents both Sonnet now).

**Round 15 committed (`a485607`)**: first "feature-combination" round per the campaign's own resume plan. 8 dishonest findings (up from the 3-5/round plateau) — 3 SYNC-alignment bugs (group-VALUE inheritance offset drift, nested sub-group absolute-offset alignment, OCCURS-stride rounding), a COMP-5 truncation bug, two subscripted-row-MOVE generalizations (cross-table + multi-dimensional, both fixed for real), an OPEN-failure FILE STATUS mode-based fix, and a STRING+reference-modification crash fixed to an honest compiling decline (ref-mod itself stays out of scope per Known Gap #1). Independently verified 923/924 (1 honest todo by design, documented precisely in the ledger). Corpus 209 -> 223.

Process note: caught my own mistake mid-round — nested a shell `&` background inside a `run_in_background: true` Bash call, causing a premature "completed" notification when the wrapper script returned, not when the actual test process finished. Corrected by properly waiting on the real PID before trusting the result. Lesson: never combine shell-level `&` with the tool's own backgrounding.

### Cycle: RUN WRAP-UP — final state (2026-07-11 ~23:30 UTC)
**The run is wrapped.** Owner instruction: stop adversarial hunting at round 14, produce detailed reports, resume rounds in a later session.

**What shipped (honest summary):**
- All 4 roadmap phases built. Phases 1–2 (data layer + procedure logic) are the deep, adversarially-hardened core; Phase 3 (SQL→Doobie, JCL parsing) is a verified MVP whose SQL generator is NOT yet wired into the main pipeline; Phase 4 (CICS) is honest scaffolding, not behavioral conversion.
- 14 adversarial rounds, 110 dishonest findings fixed, corpus 48→209 oracle-verified programs, suite 879/879 green, 27 commits, all independently verified before push. ~22h wall clock of the 48h budget, orchestrator well under its 2M token cap.
- Full campaign report: `docs/ADVERSARIAL_ROUNDS_REPORT.md`. Capability roadmap truth-passed to match. Dashboard (`docs/PROGRESS_STATUS.md`) synced.

**What is explicitly NOT done:**
- NOT converged — plateau at 3–5 findings/round vs the 0–2 bar; round 15+ should be expected to find real bugs (resume plan in report §7).
- 16 documented Known Gaps (visible degradation, not silent bugs) plus roadmap-level opens: reference-modification codegen, REWRITE/DELETE/START, SORT USING/GIVING, external/dynamic CALL, SQL wire-in, JCL→sbt skeletons, CICS behavior, ODO dynamic sizing, general GO TO webs.

**Process lessons that paid off (keep for the resumed run):** never commit red + independent orchestrator re-verification (caught the round-13 state leak); explicit-path git adds while agents are in flight; completeness-critic audits (first one caught a real corpus-wiring hole); oracle fixtures live-recaptured every run.

### Cycle: Round 14 committed — hunting paused at 14 rounds by owner decision (2026-07-11 ~23:05 UTC)
- Independent full-suite verification of the round-14 fixes: **879 tests, 879 pass, 0 fail, 0 todo** (log: r14-verify.log). Committed as `062ce37` and pushed.
- Round 14 closed 4 dishonest findings: the sentence-scope PERIOD parser flaw (most general finding of the campaign — every unterminated conditional clause affected), qualified PERFORM THRU wrong-section resolution, INSPECT REPLACING cascade vs snapshot semantics, and dead SYNC alignment. 11 programs promoted (b1–b6, c1, c3, c4b, c5, c6); corpus now 209.
- Owner instruction received: stop at 14 rounds, proceed to wrap-up, produce detailed reports on the rounds; adversarial hunting will resume in a later session. NOT CONVERGED at 4 findings — round 15+ deferred, not concluded.
- Wrap-up begun: `docs/ADVERSARIAL_ROUNDS_REPORT.md` written (full 14-round campaign report: methodology, round-by-round narrative, impact analysis by bug class, top-10 blast-radius ranking, convergence analysis, Known Gaps, resume recommendations). PROGRESS_STATUS.md re-synced. Next: capability-roadmap truth-pass, then closing summary.


### 2026-07-11 21:50 — Cycle: round-13 committed (1469d23, 828/828, 198 programs); round-14 verdict + fix in flight
- Round-13 + state-leak fix committed after independent full-suite verification (828/0/0 - the leak fix also eliminated the 5 'flaky' todos, confirming the leak was their root cause, not scala-cli races). Dashboard synced (e47034a).
- Round-14 refutation: NOT CONVERGED at 4. Finding 3 is the most consequential in many rounds: parseStatementBlock treats a PERIOD as skip-and-continue, so ANY conditional clause without an explicit END-* terminator silently swallows all following statements in the paragraph (classic period-terminated COBOL style - affects IF, READ AT END, ON SIZE ERROR, ON OVERFLOW, INVALID KEY across the board). Also: qualified PERFORM THRU resolves wrong section on bare-name collision (a code comment admitted this but it was never in the Known Gaps doc), INSPECT REPLACING multi-clause cascades instead of snapshot-matching, SYNC alignment parsed but dead.
- Major positive: ALL 13 state-isolation probes clean - the round-13 leak class is confirmed closed by code audit + behavioral diffing against fresh-process baselines.
- Round-14 fix agent dispatched with sentence-scope fix prioritized and staged (full suite after that change alone before layering others, given its blast radius across the shared parsing path).
- Trend: 11,16,15,16,6,6,8,4,6,6,3,4,5,4. Wall ~20.5h/48h.

### 2026-07-11 20:55 — Cycle: round-13 self-verification caught a real cross-conversion state-leak bug
- User re-engaged mid-loop (asked status, then said keep hunting + wanted a dashboard file - both done: docs/PROGRESS_STATUS.md created and kept in sync).
- Round-13 fix agent's own verification run showed 1 fail + 5 todo (not clean). Orchestrator investigation (not the fix agent) found: the 1 failing unit test was NOT stale - it exposed a genuine bug. The round-13 DECLARATIVES two-pass registry fix left module-level handler-registry state unreset between separate convertToScala() calls in the same process: converting program A (with a DECLARATIVES handler for file IN-FILE) then program B (unrelated, also names a file IN-FILE, no handler) causes B to incorrectly call A's handler method, which doesn't exist in B's own generated code. Reproduced deterministically via direct two-call script.
- Hypothesis: this same leak, not scala-cli cache racing, likely explains the "flaky" x02/y04-y07 failures in the full-suite run (test files run many convertToScala calls in one process; order-dependent leakage would look exactly like this) - individually each passed clean.
- Did NOT commit red. Dispatched a targeted fix agent: locate the module-level registry, fix via per-call reset or (preferred) eliminate the module-level mutable state entirely; audit FIELD_REGISTRY/GROUP_REGISTRY/TABLE_REGISTRY/CALL_PROGRAM_REGISTRY for the same class of bug; add a cross-conversion isolation regression test; re-verify full suite to true 0/0/0 before commit.
- This is exactly the kind of bug the adversarial-loop methodology exists to catch - caught here by the orchestrator's own verification discipline (never commit on a subagent's say-so) rather than by an adversarial refuter, showing the layered verification is working as designed.

### 2026-07-11 20:40 — Cycles 28-31: rounds 10-11 committed; round-12 verdict + fix in flight
- Round-10 committed (a3724cf, 705/0/0, 156 programs): DECLARATIVES support, OPEN-failure FILE STATUS, byte-true LINE SEQUENTIAL WRITE (verified byte-exact vs cobc's packed bytes), ODO record WRITE, ADD/SUBTRACT CORRESPONDING ROUNDED, multi-target COMPUTE (never worked before - inverted parser break).
- Round-11 committed (1c78ba3, 747/0/0, 172 programs) after a second container restart survived: ODO group DISPLAY wiring, composite-key SEARCH ALL, subscripted INITIALIZE. 13 survivors locked in.
- Round-12 refutation: NOT CONVERGED at 4: (1) SEVERE parser infinite loop on 88-level WHEN SET TO FALSE (no-progress loop - new failure class); (2) round-11's own SEARCH ALL fix gaps on skipped-middle-key with tied rows; (3) CALL with fewer args than LINKAGE arity; (4) CALL OMITTED corrupts parse stream. Major positive: the 150-line everything-at-once integration program (SECTIONs+DECLARATIVES+file loop+composite SEARCH ALL+edited report+CALL group param+SORT) matched cobc byte-for-byte.
- Round-12 fix agent in flight (incl. parser no-progress-loop hardening audit + qualified-PERFORM bonus). Trend: 11,16,15,16,6,6,8,4,6,6,3,4. Wall ~20.5h/48h.

### 2026-07-11 16:10 — Cycles 25-27: rounds 8-9 committed; round-10 verdict + fix in flight
- Round-8 fixes committed (8c570c4, 633/0/0, 132 programs): group BY REFERENCE marshalling, NUMVAL comma mode, comparison padding, group VALUE slicing + 9 survivor promotions (nested CALL chains, cross-CALL file I/O).
- Round-9 fixes committed (3b254c8, 667/0/0, 144 programs): EVALUATE padding site, sign-preserving group marshalling, packed-aware VALUE slicing, subscripted-row MOVE, backward THRU fall-through, REMAINDER via stored quotient.
- Round-10 refutation: NOT CONVERGED at 6, but ALL 6 attacks on round-9 fixes survived (fixes generalize). New territory findings: DECLARATIVES entirely unparsed (handlers run unconditionally), OPEN failure crashes instead of FILE STATUS 35, LINE SEQUENTIAL WRITE renders display text while READ decodes packed bytes (model mismatch - corruption for COMP-3 in files), WRITE of ODO records (compile error), ADD CORRESPONDING ROUNDED ignored + token leak, multi-target COMPUTE (inverted parser break - never worked).
- Round-10 fix agent in flight. Trend: 11,16,15,16,6,6,8,4,6,6. Wall ~17h/48h; wrap-up planned by ~40h regardless of convergence.

### 2026-07-11 14:20 — Cycles 22-24: round-7 committed (23e74e2, verified 590/0/0); critic ALL-CLEAR; round-8 in fix
- Round-7 fixes committed after orchestrator-run verification (590/0/0; one stale unit assertion reconciled against the a06 oracle before commit). 118 corpus programs.
- Periodic completeness critic (independent, ran everything itself): NO BLOCKING findings. All 5 load-bearing claims reproduced exactly - incl. full re-capture of all 118 .oracle.txt from live cobc leaving the git tree byte-identical (fixture integrity proven). Advisories fixed in this entry: stale pinned blockers cleared, status snapshot updated, closing verification entry for 23e74e2 recorded (this entry), roadmap CALL/refmod gap placement to be folded into the final docs pass.
- Round-8 refutation: NOT CONVERGED at 4 dishonest (trend 16->6->6->8->4): group BY REFERENCE in CALL, NUMVAL under DECIMAL-POINT COMMA, unequal-width alphanumeric comparison padding, group-level VALUE clause slicing. 9 hard survivals incl. nested CALL chains, CALL-loop static semantics, cross-CALL file I/O, INSPECT per-operand scoping.
- Round-8 fix agent in flight (also promotes all 12 v-probes). Wall clock ~14.5h/48h; orchestrator spend well under budget.

### 2026-07-11 12:35 — Cycle 21: round-6 committed (68f762a); round-7 verdict + fix dispatched
- Round-6 fixes committed after independent verification (545/0/0, 104 corpus programs).
- Round-7 refutation: NOT CONVERGED - 8 dishonest findings, two of the silent-corruption class (bare READ with no AT END swallows the NEXT statement via empty-else indentation; SECTION anonymous leading blocks silently discarded - surfaced first in the realistic-batch-program test, confirming interaction-density hypothesis). Also: CALL entirely non-functional (comma parsing + no multi-program support), COMP-1/2 DISPLAY blank + Float arithmetic compile error, DECIMAL-POINT IS COMMA unimplemented, COMP-3 subscripts, MOVE group->elementary. 4 survivals incl. nested copybooks and COPY REPLACING via options.
- Trend: 11, 16, 15, 16, 6, 6, 8 - plateaued rather than dried; each round still yields real product hardening. ~35h wall clock remains; loop continues.
- Round-7 fix agent dispatched (multi-program CALL support is the big feature item; BY REFERENCE via return-tuple reassignment).

### 2026-07-11 11:35 — Cycles 19-20: round-5 committed (eded5a3); round-6 verdict + fix dispatched
- Round-5 fixes committed and pushed after independent suite verification (511/0/0): file I/O end-to-end (ENVIRONMENT DIVISION finally wired into main API), INITIALIZE, group DISPLAY, ACCEPT date sources, edited-source MOVE de-editing, THRU-across-sections. 93 corpus programs.
- Round-6 refutation: NOT CONVERGED - 6 dishonest across 3 of 12 programs (trend: 11 -> 16 -> 15 -> 16 -> 6 -> 6, and increasingly narrow corners): WRITE ADVANCING ignored (live path never reads it; a correct handler was dead code), quoted digit-content literals ("10") render as Int breaking every FILE STATUS comparison (systemic), STRING ON OVERFLOW dropped + unguarded copy crash, UNSTRING ON OVERFLOW not parsed (statement-stream corruption class). 7 hard survivals to be locked into the corpus (multi-file, WRITE FROM, empty-file read, FD REDEFINES, OCCURS VALUE, level-77, BLANK WHEN ZERO COMP-3).
- Round-6 fix agent dispatched (also promotes the 7 survivors). SORT USING/GIVING remains documented-TODO.

### 2026-07-11 10:20 — Cycles 17-18: container restart survived; round-4 committed (852a711); round-5 verdict
- Container restarted mid-round-4 verification; toolchain and working tree survived; orchestrator re-ran the full suite itself (472/0/0) and committed+pushed round-4 fixes (SECTION cluster, UNSTRING cluster, figurative comparisons, INSPECT BEFORE/AFTER, qualified reads, VARYING AFTER). 79 corpus programs.
- Round-5 refutation: NOT CONVERGED but strongly converging - dishonest findings 11 -> 16 -> 15(13) -> 16(13) -> 6. New failure area is the never-exercised I/O/environment layer: main API never parses ENVIRONMENT DIVISION (all file OPEN/WRITE/READ broken - roadmap overclaimed), INITIALIZE 100% non-functional, DISPLAY of bare groups, ACCEPT FROM date sources type-broken, edited-source MOVE crash, THRU-across-sections collision. 6 hard survivals incl. unary/exponent precedence and negative division sign rules.
- Round-5 fix agent dispatched. Convergence bar remains 0-2 dishonest; next round decides wrap-up.

### 2026-07-11 09:10 — Cycles 14-16: round-3 fixed+committed (99089c3); round-4 NOT CONVERGED
- Round-3 fixes committed after orchestrator-caught regression (r11/r11b BigDecimal double-wrap - fix agent had mislabeled it 'pre-existing'; targeted agent fixed type-aware operand coercion). 63 corpus programs hard-pass; suite 424/0/0.
- Docs/demo committed (cdac11d): runnable end-to-end demo verified EQUIVALENT; truth-passed roadmap; engine README.
- Round-4 refutation: NOT CONVERGED - 13 new dishonest findings. Clusters: SECTION-based programs fundamentally broken (no section methods, paragraph-name collisions, unreachable entry point - highest real-world severity); UNSTRING (POINTER/ALL/DELIMITER IN/scope collision); figurative constants in comparisons; INSPECT BEFORE-AFTER; qualified+subscripted reads; DIVIDE into edited receiver; VARYING AFTER final value. 4 attack programs survived (indexes, 3-subject ALSO EVALUATE, S9(18) boundary, STRING BY field).
- Round-4 fix agent dispatched with all 16 repro programs. Loop-until-dry continues; convergence bar 0-2 dishonest.

### 2026-07-11 ~06:20 — Cycle 13: Phase 4 + Phase 2b fix wave landed (379/379); docs+demo wrap-up pass

- Since cycle 12's dispatch, both in-flight agents landed and were verified green before commit (per this log's own convention — no committing red):
  - **f69f703 (Phase 4 groundwork):** CICS command classifier (`parser/cics-parser.js`), BMS map parser with symbolic-map layout derivation (`parser/bms-parser.js`), and an honest `???`-bodied service-skeleton generator (`generator/cics-gen.js`) — request/response DTOs, abstract repository traits, LINK/XCTL stubs, every unclassified command surfaced as a comment, nothing silently dropped. New CICS/BMS corpus (2 programs + 1 BMS map) with compile-checked expected-skeleton assertions. Explicitly scoped as scaffolding, not a behavioral CICS converter.
  - **49caa1f (Phase 2b fix wave):** all 14 root-cause findings from the Phase 2 adversarial refutation (cycle 10) fixed — NUMVAL internal-whitespace crash, `SET condition-name TO TRUE`, EVALUATE expression/full-condition subject collapse, recursive-PERFORM paragraph naming, `WITH TEST AFTER` invalid Scala 3 (do-while removed), duplicate nested group-name collisions, `LENGTH` of a GROUP, `MAX`/`MIN` on `BigDecimal`, `SEARCH ... VARYING`, index-name `DISPLAY` format, multi-key mixed-direction `SORT`, `RELEASE`/`RETURN` name-vs-position matching, `UNSTRING ... COUNT IN`. All 20 refuter programs (r01-r14 incl. `*b`/`*c` bisection variants) promoted permanently into `tests/corpus/proc/`. `tests/oracle/README.md`'s known-gaps table refreshed to the current, accurate inventory (48 corpus programs, 19 data + 29 proc, both subsets 0/N todo).
  - Full suite independently reverified at 379/379/0 (0 fail, 0 skip, 0 todo) after both landed.
- **This entry's own work (docs + demo only, per explicit mandate — `generator/`, `parser/`, and existing tests were not touched):**
  - Rewrote the status sections of `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` (Parts 1 and 2) to the true current state with no optimistic rounding: every "done" claim now names its exact verification method (oracle-equivalent program counts, compile-verified-against-real-doobie, compile-checked-skeleton, etc.) and every remaining gap is marked **OPEN** inline, including ones not previously written down (see below). Added a "Verification record" subsection: 48 oracle-gated corpus programs, 3 adversarial refutation rounds (round 1: 12 programs/11 diverged, round 2: 20 programs/16 diverged, round 3: OPEN/pending), 379 tests, and an explicit "what 'verified' does not mean" paragraph.
  - Built `demo/convert-demo.sh` + `demo/README.md` + `demo/demoacct.cbl` + `demo/copybooks/CUSTOMER.cpy` + `demo/convert.mjs`: a from-scratch, runnable, end-to-end demo (COPY expansion + COMP-3 + COMPUTE ROUNDED) that converts via plain `node`, shows the generated Scala, compiles+runs both `cobc` and `scala-cli`, diffs stdout, and prints EQUIVALENT/DIVERGED. Ran it end-to-end against this checkout's toolchain: **verdict EQUIVALENT**, byte-identical stdout between real GnuCOBOL and the generated Scala.
  - Created `Thyraa-COBOL-main/backend/packages/cobol-to-scala/README.md` (previously absent): what the package does, the oracle-verification story as the product differentiator, how to run the tests, corpus layout, the full `convertToScala` options table (`copybooks`/`format`/`charset`/`embedRuntime`/`generateMain`/`packageName`/`objectName`), and an honest per-area capability table cross-linked to the roadmap doc.
  - **New gap found and disclosed while fact-checking the docs, not fixed (out of scope for this pass):** COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE without a ROUNDED clause never truncates to the target field's declared decimal digits at assignment time (`renderAssignment` in `generator/expression-gen.js` stores the raw arithmetic result; only `DISPLAY`-time formatting via `CobolFmt.num`, which always rounds `HALF_UP`, fixes the digit count). Reproduced directly against installed `cobc`: `COMPUTE X = 2.345` into a 2-decimal COMP-3 field with no ROUNDED prints `2.34` under real GnuCOBOL, `2.35` (wrong — same as the ROUNDED case) under the generated Scala. Not caught by the existing 48-program corpus because no corpus case has a truncation-vs-rounding-discriminating final digit. Flagged in the roadmap doc's section 1.3 and Verification record as an OPEN item for the next fix wave / round-3 refuter to pick up — not fixed here since this pass does not touch `generator/`.
  - Full suite reverified 379/379/0 after this pass (docs/demo changes only, cannot affect test outcomes, but reran as a sanity check anyway).
- Not yet done, tracked forward: round-3 adversarial refutation (pending — see Verification record), the newly-found COMPUTE-truncation gap, SQL wire-in to the main generator, JCL flow diagrams/sbt skeletons, OCCURS DEPENDING ON dynamic parse/format, general inter-paragraph GO TO.

### 2026-07-11 05:45 — Cycle 12: Phase 3 SQL landed green (257/257); Phase 2b + Phase 4 dispatched
- SQL agent completed after resume nudge: EXEC SQL -> typed Doobie (SELECT INTO/INSERT/UPDATE/DELETE/cursors-as-materialized-List with SQLCODE 100/WHENEVER/indicator vars as Option guards), compile-verified against REAL doobie-core 1.0.0-RC5 from Maven Central. Compat exports restored -> transient red from 5a9605e resolved. Committed 015c02f, pushed. Suite 257/257/0 verified in full before commit.
- Dispatched: (a) Phase 2b fix agent - all 14 refuted proc gaps (NUMVAL crash, SET TO TRUE, EVALUATE expr-subject, recursive PERFORM, WITH TEST AFTER, duplicate nested group names, LENGTH(group), MAX/MIN BigDecimal, SEARCH VARYING, index DISPLAY format, multi-key SORT, RELEASE FROM/RETURN INTO, UNSTRING COUNT IN) + promotion of the 20 refuter programs into corpus/proc/ + stale README refresh. (b) Phase 4 groundwork - CICS command classifier, BMS map parser with symbolic-map layout derivation, honest ???-bodied service skeleton generator, CICS/BMS corpus + compile-checked tests (new files only).
- Remaining Phase 3 gap tracked: sbt/pipeline skeletons from JCL (may fold into final wrap-up); SQL wire-in to main generator TODO'd in sql-gen.js header.
- Wall clock ~4.3h of 48h.

### 2026-07-11 05:20 — Cycle 11: Phase 1b landed (all 12 adversarial programs pass); commit hygiene incident
- Phase 1b agent: a01-a12 all hard-pass the oracle; zero regressions across all 28 corpus programs; 22 new unit tests; safeNodeString coverage-honesty fixed; two justified minimal parser fixes (subscript arithmetic was dropped at PARSE time; Condition.subject never attached). Suite was 225/225 at agent completion.
- Orchestrator error: committed 5a9605e with `git add generator/` while the SQL agent was mid-rewrite of sql-gen.js -> pushed commit is transiently red (import mismatch). Recovery: SQL agent finishes green, then verify+commit. Blocker pinned above.
- In flight: Phase 3 SQL agent. Queue: Phase 2b fix wave (14 refuter findings) next - generator/ is otherwise free.

### 2026-07-11 05:00 — Cycle 10: Phase 2 refuted (14 silent gaps); Phase 3 SQL dispatched
- Phase 2 refuter: REFUTED - findings pinned above. 4 hard attacks survived (SEARCH ALL descending/dup-keys, SORT dup stability, backward GO TO in THRU range). It also independently re-verified all 16 corpus programs pass at pinned commit.
- Dispatched Phase 3 SQL agent (disjoint files: sql-parser.js, sql-gen.js, tests/corpus/sql/): EXEC SQL -> typed Doobie (SELECT INTO/INSERT/UPDATE/cursor->stream, indicator vars, WHENEVER/SQLCODE -> Either), string-level expected fragments + scala-cli compile check with real doobie dep.
- In flight: Phase 1b hardening (11 data edge cases + safeNodeString ordering), Phase 3 SQL.
- Queue: Phase 2b fix wave (14 findings) behind Phase 1b; then re-refutation of both; JCL flow-diagram/skeleton gap and stale README with it.

### 2026-07-11 04:30 — Cycle 9: Phase 2 proc corpus fully oracle-equivalent; Phase 1b + Phase 2 refuter dispatched
- Phase 2 generator agent complete: ALL 9 proc programs pass oracleCompare as hard assertions (SEARCH/SEARCH ALL with real binary search, SORT/RELEASE/RETURN with SD work-file modeling, MOVE CORRESPONDING, GO TO DEPENDING ON via nested defs in THRU ranges, full intrinsics, VARYING..AFTER, STRING/UNSTRING/INSPECT, EVALUATE rewrite). Fixed 4 pre-existing dead-code bugs. Known-unsupported forms carry explicit TODOs itemized in tests/oracle/README.md. CRITIC BLOCKING #1 RESOLVED - proc/ now oracle-gated.
- Suite 179/0/0 verified independently; committed 01c2fdb, pushed.
- Dispatched: (a) Phase 1b hardening agent - all 11 refuted edge cases (MOVE semantics/JUSTIFIED/group MOVE, arithmetic subscripts, ON SIZE ERROR, 88-level conditions, Z-suppression/BLANK WHEN ZERO, REDEFINES-over-table) + critic blocking #2 (safeNodeString TODO ordering) + promotion of the 12 adversarial programs into the corpus; (b) Phase 2 adversarial refuter - 10-14 new proc edge programs (scratchpad only).
- Wall clock ~3h of 48h. Orchestrator spend est. ~80k of 2M.

### 2026-07-11 04:00 — Cycle 8: completeness critic report - claims verified, 2 blocking gaps
- Critic verified: 170/0/0 reproduced independently; REDEFINES lazy views, ASCII 0x70 zoned scheme, 16/16 expected-vs-oracle all genuine; no out-of-scope work; no weakened assertions (one legitimate compiler-driven value correction); ODO deviation honestly disclosed; commit messages accurately worded.
- Critic BLOCKING findings pinned above: proc/ corpus invisible to equivalence testing (7/9 broken in reality) and safeNodeString silent-garbage path for FunctionCall. Both merge into the Phase 2 agent's active mandate + the queued Phase 1b hardening wave.
- Also noted for Phase 3 backlog: SQL->Doobie untouched; JCL flow diagrams/pipeline skeletons not done (lineage JSON only). Phase 4 untouched (correctly tracked).
- In flight: Phase 2 generator (p10-p18 oracle equivalence is exactly its brief).

### 2026-07-11 03:45 — Cycle 7: Phase 1 REFUTED by adversarial corpus - status corrected
- Phase 1 refuter verdict: REFUTED (11/12 new programs diverge; only ROUNDED semantics survived). Finding clusters:
  A) MOVE semantics: no fixed-width truncate/pad, JUSTIFIED RIGHT no-op, numeric->alpha and numeric->edited MOVE don't compile, group MOVE references undeclared identifiers.
  B) Arithmetic subscripts silently dropped: WS-T(WS-I + 1) renders as WS-T(WS-I) - silent wrong data, worst class.
  C) ON SIZE ERROR unimplemented (branches print unconditionally); DIVIDE REMAINDER emits double-BigDecimal wrap compile error.
  D) 88-level condition names in IF/EVALUATE produce empty conditions (compile fail); EVALUATE TRUE arms dropped.
  E) Edited pictures: all-Z suppression keeps anchored 0; BLANK WHEN ZERO ignored.
  F) REDEFINES over OCCURS table: nonsensical divide/modulo accessor template, compile fail.
- Response plan: single Phase 1b hardening agent gets all repro JSONs (scratchpad/phase1-refutation/), promotes the 12 programs into tests/corpus/data/ as oracle-gated cases, fixes A-F, flips todos to assertions. Dispatches when Phase 2 generator agent (same files) completes.
- Milestone language in cycle 6 stands corrected: 7/7 was real but NOT generalizable; docs updated to reflect honest state.
- In flight: Phase 2 generator (p10-p18), completeness critic.

### 2026-07-11 03:25 — Cycle 6: PHASE 1 MILESTONE - 7/7 data programs oracle-equivalent
- Corpus-pass agent complete: field registry for all WORKING-STORAGE depths, multi-dim OCCURS subscripts with .updated() writes, PERFORM bodies fixed, REDEFINES arithmetic view accessors, edited-picture MOVE formatting char-verified vs cobc, CobolFmt DISPLAY helper, decimal-aware DIVIDE. All p01-p07 match real compiler output exactly.
- Codec hardening complete: all 7 refutation findings fixed in JS+Scala; cobc re-verification 22/22 previously-wrong bytes now match; 301-case parity fuzz clean.
- Suite: 170 pass / 0 fail / 0 todo (verified independently by orchestrator).
- Committed as 010aaa4 (byte-level I/O + hardened codecs + oracle suite) and 9251931 (procedure gen + parser Phase 2). Pushed.
- Dispatched next wave: (a) Phase 2 generator - SEARCH/SORT/RELEASE/RETURN/CORRESPONDING/GO-TO-DEPENDING/intrinsics generation targeting p10-p18 oracle equivalence; (b) Phase 1 adversarial refuter - 8-12 NEW edge-case programs (MOVE truncation semantics, group MOVE, JUSTIFIED, nested table boundaries, REDEFINES cross-view writes, zero-iteration loops) vs oracle; (c) completeness critic - scope/claims/test-integrity audit incl. the ODO deviation question.
- Orchestrator token spend: low (~60k of 2M est). Wall clock: ~2h of 48h.

### 2026-07-11 03:00 — Cycle 5: JCL/DCLGEN committed; parser Phase 2 landed
- JCL + DCLGEN parsers committed (b677aae): structural JCL (PROC expansion, referbacks, DISP-aware dataset lineage), DCLGEN column<->host mapping, 32 tests. Corpus reconciliation caught a real SYSOUT=&SYM substitution bug before it shipped.
- Parser agent complete: inline PERFORM n TIMES fixed; FUNCTION intrinsic FunctionCall AST; SEARCH/SEARCH ALL/SORT/MERGE/RELEASE/RETURN statements; UnknownStatement anti-pollution (unknown verbs no longer corrupt neighboring statements). Corpus p10/p11/p12/p15/p16 parse with exact statement counts, zero unknowns. Known residual: other unimplemented verbs (GENERATE, ALTER...) still lack keyword treatment - documented.
- Suite at ~156 pass/0 fail before hardening churn; oracle todos dropped 7 -> 3 (corpus-pass agent progressing live).
- Commits for parser + generator + codec-hardening work held until both in-flight agents land and full suite is green (no committing red).
- Next dispatch when corpus-pass lands: Phase 2 GENERATOR for the new AST nodes (SEARCH -> indexWhere/find, SORT -> sortBy, RELEASE/RETURN, FunctionCall -> Scala stdlib, MOVE CORRESPONDING expansion) targeting oracle passes on corpus/proc/.
- In flight: corpus-pass generator fixes, codec hardening.

### 2026-07-11 02:35 — Cycle 4: second refutation in; Phase 3 pipelined
- Compiler-bytes refuter: VERDICT REFUTED. 46 compiler-verified value/type pairs. Two real bugs: (1) ASCII zoned sign scheme wrong - GnuCOBOL native ASCII uses zone-nibble swap (neg digit d -> 0x70+d), not translated EBCDIC letter overpunch; (2) COMP-5 is host-native little-endian, codecs treat it as big-endian -> silent corruption (32767 decodes as -129). SURVIVED: COMP-3 (13 variants), big-endian COMP/COMP-4 incl. all width thresholds, SIGN SEPARATE, unsigned zoned, EBCDIC sign scheme (-fsign=EBCDIC), full cp037 table (0 mismatches vs Python stdlib cp037). Report: tests/oracle/codec-refutation.md.
- Consolidated codec-hardening queue now has 7 findings (2 compiler-verified + 5 robustness). Dispatches when codec-integration agent frees runtime/CobolCodecs.scala.
- Dispatched Phase 3 groundwork agent (new files only): real JCL parser (steps/DD/PROC expansion/dataset lineage) + DCLGEN parser + synthetic JCL/DCLGEN corpus with hand-derived expected JSON.
- In flight: corpus-pass generator fixes, codec integration, parser Phase 2, JCL/DCLGEN.

### 2026-07-11 02:20 — Cycle 3: corpus committed; codec refutation #1 in
- Corpus + oracle harness committed (b55156d, 56 files) and pushed. Corpus agent independently confirmed the harness's oracle outputs byte-identical to its own expected outputs.
- Parser bugs discovered by corpus agent -> dedicated parser agent dispatched (exclusive owner of parser/): inline PERFORM n TIMES misparse, FUNCTION intrinsics AST, SEARCH/SEARCH ALL/SORT/MERGE/RELEASE/RETURN parsing, unknown-statement pollution fix. Roadmap corrections: MOVE CORRESPONDING and GO TO DEPENDING ON already parse.
- Codec fuzz refuter: VERDICT REFUTED. Happy path clean (35,256 property cases, 290 JS<->Scala parity cases, cp037 tables identical) but 5 robustness defects: (1) binaryDecode unguarded >8-byte buffers, silent JS/Scala divergence; (2) zonedDecode empty+signSeparate JS-returns-0 vs Scala-crash; (3) inconsistent exception types on empty buffer; (4) packedDecode invalid-BCD-nibble check is dead code - garbage decodes to plausible numbers in BOTH langs (silent data corruption class); (5) JS toBigInt accepts Number with silent precision loss >2^53.
- Plan: consolidated codec-hardening agent once codec-integration agent + compiler-bytes refuter complete (avoids CobolCodecs.scala edit conflicts, folds in all findings). Codecs NOT marked done.
- In flight: corpus-pass generator fixes, codec integration, parser Phase 2, compiler-bytes refuter.

### 2026-07-11 02:15 — Cycle 2: oracle live, Phase 1 work queue identified
- Toolchain agent: GnuCOBOL 4.0 + scala-cli 1.9.1 installed and verified (oracle path LIVE, no dual-derivation fallback needed). docs/toolchain-status.md.
- Codec agent: byte-level codecs landed (43 tests; JS<->Scala parity verified; cp037 diffed vs unicode.org). Committed 1cae2a7, pushed. 2 adversarial refuters now running (compiler-bytes lens + fuzz/parity lens).
- Oracle harness agent: tests/oracle/ harness complete and stable. All 16 corpus programs compile+run under cobc; ALL 16 expected.txt match real compiler output (0 mismatches - corpus derivations validated). 7/7 data programs currently fail COBOL-vs-Scala equivalence with 5 precisely-characterized generator gaps (top-level elementary items undeclared; subscripts dropped; PERFORM VARYING bodies empty; duplicate loop vars; multi-dim subscripts).
- Dispatched: (a) corpus-pass agent fixing the 5 gaps against the oracle loop (scala-generator/method-gen/expression-gen); (b) codec-integration agent wiring byte-level parse/format + REDEFINES views + round-trip property tests (case-class-gen/layout/runtime). Disjoint file sets.
- Tests: 70/70 at last commit. In flight: 4 agents.

### 2026-07-11 01:30 — Cycle 1: kickoff
- Verified clean tree at f5f35f5; toolchain probe: java ✓, node ✓, cobc ✗, scala-cli ✗.
- Dispatched 3 parallel Sonnet agents:
  1. **Toolchain**: install GnuCOBOL (oracle) + scala-cli; report to docs/toolchain-status.md.
  2. **Codecs**: byte-level COMP-3/binary/zoned-overpunch/EBCDIC-cp037 codecs (JS reference impl + Scala runtime + node:test suite). New files only.
  3. **Corpus**: synthetic COBOL corpus (7 Phase-1 data programs + 9 Phase-2 procedure programs) with carefully derived expected outputs, under tests/corpus/.
- Next: on agent completion — verify codec tests, cross-check corpus expected outputs against oracle (if cobc installed) or dispatch independent second derivation, then integrate codecs into case-class-gen.
