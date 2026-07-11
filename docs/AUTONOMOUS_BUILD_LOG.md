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
