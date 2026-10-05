# Action Plan — October 2026 (post-viability-report)

**Grounding document:** `docs/VIABILITY_REPORT_2026-10.md` ("Keep the Engine, Rethink the Product").
**Owner decision 2026-10-05:** execute the report's ordered steps autonomously; the merge/PR (report step 1) is explicitly deferred by the owner and not part of this plan.
**Operating rule:** every action below must trace to a numbered report step. If a proposed task does not, it is out of scope for this plan.

## Verdict being acted on
Yes, conditionally. The deterministic engine + compiler-oracle + adversarial corpus is the rare asset; the Scala-only "conversion product" framing is not. Value lies in **verification evidence**, not translation. Claims must be precise: "differentially tested against a reference compiler (GnuCOBOL)", never "proves equivalence" or "matches the mainframe".

## Ordered steps and status

| # | Report step | Status | Acceptance signal | Notes |
|---|---|---|---|---|
| 1 | Merge branch to `main`, delete stale `tests/output/TransProc.scala` | **Deferred by owner** (merge). Fixture deletion folded into step 2's hygiene. | — | Owner said "don't worry about being merged". |
| 2 | **Fix reference modification** (`field(start:length)`) before any external demo | In progress | Existing `*refmod*` corpus programs flip from `t.todo` to byte-for-byte pass; new `qq*` corpus added; 0 failures; whole-suite todo count DROPS (baseline 45) | Biggest silent-wrong-output risk. Writes must route through `assignExpr` (round-39 lesson). |
| 3 | **Calibrate the oracle vs IBM COBOL**; publish GnuCOBOL-vs-IBM divergence register with exact version + `-std` flags | In progress (what is possible without an IBM compiler) | `docs/ORACLE_DIVERGENCE_REGISTER.md` exists; harness `cobc` invocation + dialect documented; list of corpus programs whose real cobc output changes under `-std=ibm` | **Finding:** harness runs `cobc -x` with NO `-std` flag — default dialect, not IBM mode. True calibration needs IBM COBOL for Linux on x86 or a z/OS trial = **owner procurement decision**. |
| 4 | Demand test: ten structured partner conversations (SIs, hyperscaler teams, specialist vendors, bank platform teams) before any platform code | Prep only (humans must hold the conversations) | `docs/PARTNER_BRIEF.md` with the one question (would you pay for engine + corpus as a component, and in what language?) and a target list | Agent cannot hold these conversations; owner action. |
| 5 | Decide target language explicitly: (a) Java via a target-neutral IR, or (b) narrow to Scala-running banks | Prep only (design, no refactor) | `docs/TARGET_NEUTRAL_IR_DESIGN.md`: inventory of ~848 Scala-emitting sites, proposed IR, migration path, effort estimate | Decision depends on step 4 answers; do NOT start the emitter rewrite unilaterally. |
| 6 | Rewrite positioning to precise claims; publish corpus feature-coverage list | **Done 2026-10-05** | No doc says "proves"/"matches the mainframe"/"complete"; `docs/CORPUS_COVERAGE.md` exists | Applies to README, docs/, demo/. |
| 7 | Extend the oracle: compare written files/record images (EBCDIC-aware), add grammar-based program generation beside the LLM refuter | Not started | Harness diffs output files, not just stdout; coverage report by language feature | Stdout-only parity misses the round-29 bug class. |
| 8 | Position corpus + harness as a standalone product | Not started | Harness README framing it as a target-neutral equivalence suite | Most portable asset. |
| 9 | Set a time-box / kill criterion | Proposed | Owner confirms a dated decision point | Proposal: if by **April 2027** no partner has run the harness on their own COBOL and no design partner has committed, stop product investment and preserve engine + corpus as an open/licensable asset. |

## Explicit "do not" list (from the report)
- Do **not** build the platform layer (auth, CI/CD, containers, UI) beyond what step-4 partners need to run the harness.
- Do **not** run a 41st adversarial round for its own sake until reference modification is fixed and IBM calibration says which divergence classes to hunt.
- Do **not** wire EXEC SQL or build CICS behavioral conversion until a partner asks.

## Verification discipline (unchanged from the campaign)
Never trust an agent's self-reported "done"; independently re-run. Use the split unit-suite / oracle-suite approach (the environment interrupts long single runs). Treat any unexplained change in the honest-todo count as a signal to investigate. Never commit red.
