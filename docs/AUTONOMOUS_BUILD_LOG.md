# Autonomous Build Log — COBOL-to-Scala Engine (Phases 1–4)

**Run start:** 2026-07-11 ~01:30 UTC · **Branch:** claude/analyze-codebase-pdPSZ · **Budget:** orchestrator ≤2M own tokens, 48h wall clock

## Open questions / blockers
- **PHASE 2 REFUTED (queued fix):** 16/20 new adversarial proc programs diverge, 14 root causes, ALL silent (no TODO markers): NUMVAL crash on '+  12.5', 88-level conditions unimplemented (confirms Phase 1b mandate), EVALUATE expression-subject collapse, recursive PERFORM emits 1000Recurse(), WITH TEST AFTER invalid Scala, duplicate nested group names collide in codegen, LENGTH of group, MAX over BigDecimal, SEARCH VARYING ignored, index-name DISPLAY format, multi-key mixed-direction SORT, RELEASE FROM / RETURN INTO no-ops, UNSTRING COUNT IN dropped. Repros: scratchpad/phase2-refutation/. Baseline 9 corpus programs re-confirmed passing (pinned to 01c2fdb). Also: stale known-gaps table in tests/oracle/README.md must be refreshed. Fix wave dispatches when Phase 1b agent frees generator/.
- **CRITIC BLOCKING #2:** safeNodeString checks node.name before its TODO fallback, so unhandled FunctionCall nodes render as bare identifiers (silent garbage; FUNCTION MOD(17,5) emits wsModPos = 0). Violates the coverage-honesty rule. Must reorder: unknown statement/expression types -> visible ??? TODO marker.
- **PHASE 1 STATUS CORRECTED: NOT DONE.** Adversarial refuter (12 new edge-case programs vs compiler oracle) REFUTED the Phase 1 milestone: 11/12 diverge. The 7-program corpus was a narrow slice. Fix wave queued behind the in-flight Phase 2 generator agent (same files). Full repros preserved in scratchpad/phase1-refutation/.

## Status snapshot
- **Phase:** 1 (data-layer truth) — in progress
- **Tests:** 27/27 passing at run start
- **Orchestrator token spend:** minimal (cycle 1)

## Activity

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
