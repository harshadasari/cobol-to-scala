# COBOL Modernization — Market Analysis & Strategic Verdict

**Date:** 2026-07-11
**Question answered:** Is the business market real for a COBOL-to-modern-language conversion product, and is COBOL→Scala the right first wedge?
**Method:** Multi-angle web research (60+ searches across market sizing, workforce, competition, AI disruption, buyer behavior), with every major claim provenance-graded. This document deliberately separates **verified facts** from **industry folklore**, because this market runs on recycled statistics.

---

## 1. Executive Summary

- **The pain is real and durable.** Banking, insurance, and government genuinely run mission-critical COBOL; the modernization market is a genuine multi-billion-dollar category growing 10–17% per year.
- **The famous statistics are mostly folklore.** "800 billion lines of COBOL," "95% of ATM swipes," "average COBOL developer is 55" — all trace to small, old, or vendor-commissioned surveys. Use them only with attribution.
- **Full COBOL→X conversion is a crowded, capital-intensive battlefield** (IBM, AWS, Google, every major SI, plus AI startups that raised $250M+ in 18 months). A small team cannot win the "convert my bank" deal directly.
- **Nobody offers COBOL→Scala** — it is genuine white space, but the research strongly suggests it is white because buyers ask for Java, not because incumbents overlooked it.
- **The open, defensible wedge is verification and understanding**: behavioral-equivalence testing, record-layout truth, copybook-first analysis, documentation generation. Even skeptics agree nobody has closed this gap, and it is where >50% of project cost sits.
- **Recommendation:** keep the COBOL→Scala engine as the differentiated core (it exercises every hard part of the problem), but architect for multi-target output (Java next) and lead the pitch with **provable equivalence + analysis**, not "conversion."

---

## 2. Market Size (provenance-graded)

| Claim | Figure | Source | Grade |
|---|---|---|---|
| Mainframe modernization market, 2025→2030 | $8.39B → $13.34B, 9.7% CAGR | MarketsandMarkets (2025) | Analyst primary, conservative scope |
| Mainframe modernization market, 2026 | $9.01B (Straits) vs $20.85B (Research and Markets) | Two research houses, same year | Definitions differ 2.3x — treat as a range |
| Mainframe modernization *services*, 2026→2033 | $22.1B → $50.7B, 12.6% CAGR | OpenPR/services-only cut | Low-tier source; definitional overlap warning |
| Application modernization (superset), 2025→2034 | $26.4B → $92.1B | Fortune Business Insights | Analyst primary |
| Consensus band | Legacy modernization ≈ $25–30B (2025), 14.9–17.6% CAGR | Multi-firm aggregation | Best working number |

**Honest take:** "mainframe-specific modernization is roughly $9–21B in 2026 depending on definition, growing ~10–15%/yr; the broader legacy-modernization category is ~$25–30B heading to $50–90B by the early 2030s." Large enterprises are ~75% of spend; SME is the fastest-growing segment.

### Lines-of-COBOL provenance chain (know this before quoting numbers)

1. **1997:** DataPro survey of **421 respondents** → "200B lines" → mislabeled "Gartner 1997" after Gartner acquired DataPro.
2. **2017:** Reuters "COBOL blues" graphic → "220B lines, 43% of banking systems, 95% of ATM swipes, $3T/day" — compiled from industry estimates, methodology unpublished; became the canonical citation.
3. **2021:** Open Mainframe Project independently lands at **~250B lines** — the best sanity-check number.
4. **2022:** Micro Focus/Vanson Bourne survey (n=1,104, self-reported, vendor-commissioned) → **775–850B lines** — a 3x outlier; always attribute it as a vendor survey.
5. The "30 billion COBOL transactions/day" stat is a mutated **1998 IBM statement about CICS transactions**, not COBOL.

**Defensible statement for pitch decks:** "Independent estimates place 220–250 billion lines of COBOL in production (Reuters 2017; Open Mainframe Project 2021); a 2022 vendor-commissioned survey suggests up to 800 billion."

---

## 3. Demand Signals — Workforce

| Claim | Reality after tracing |
|---|---|
| "Average COBOL dev is 55" | Folklore pedigree: 2012 Computerworld survey (n=357) found half of shops averaged **45+**; a 2014 Micro Focus soundbite said 55; a 2020 Micro Focus survey said ~50. No rigorous demographic study says 55. |
| "Workforce is collapsing" | **Counter-evidence:** BMC's 2025 survey (n>1,000) found **66% of mainframe respondents are millennial/Gen Z** (vs 37% in 2018). The workforce is renewing, though COBOL-specific depth is thinner. |
| "10% retire every year" | No primary source found. Vendor-blog folklore. |
| Salary explosion | **Not happening.** Salary.com: COBOL programmer ≈ $81.5K (June 2026), essentially flat 2023→2025. ZipRecruiter $48–67/hr. Niche seniors reach $125–160K. Steady demand, not a gold rush. |
| Skills gap is real | Forrester/Rocket 2024 (n=309): 38% cite talent shortage as a top modernization challenge; Futurum 2024: 61% report a persistent skills gap; Kyndryl 2025: 70% can't find multi-skilled talent. |

**Verified anchor cases (government):**
- **IRS Individual Master File:** COBOL/assembler, ~60 years old, ~$2B spent on modernization through 2024, target FY2028 — then **paused in March 2025** (GAO-25-107611).
- **SSA:** 60M+ lines of COBOL; DOGE's 2025 plan to rewrite it "in months" was widely called "pure folly"; a prior 5-year COBOL→Java attempt failed. No completed migration reported as of mid-2026.
- **NJ unemployment (April 2020):** the canonical "COBOL crisis" story; nuance: the actual bottleneck was largely the web front-end, not the mainframe.

---

## 4. Competition (as of mid-2026)

| Player | Approach | Target language | Notes |
|---|---|---|---|
| IBM watsonx Code Assistant for Z | GenAI refactor/transform/validate on Z; agentic since v2.6–2.8 | **Java** | Enterprise pricing, opaque |
| AWS Blu Age + AWS Transform | Deterministic refactor + agentic AI (GA May 2025); Dec 2025 added automated test generation | **Java**/Spring | Only public pricing: **$0.103/LOC** after 120K free |
| Google Cloud (Dual Run, Mainframe Rewrite, G4) | Assessment + Gemini rewrite + **parallel-run diffing** (Dual Run) | Java, C# | Dual Run = validation-first thinking |
| Microsoft/Azure | Partner-led + open-source agentic CAMF | Java Quarkus, C# | |
| Rocket Software (ex-Micro Focus AMC, $2.275B acquisition, May 2024) | Replatform — COBOL stays COBOL | none | The "lowest-risk" pitch; 10,000+ customers |
| Heirloom, TSRI, CloudFrame, Astadia (Amdocs), Modern Systems | Deterministic transpilers/factories | Java, C#, C++ | TSRI claims 2M LOC/hour |
| Mechanical Orchard ($74M+, GV-backed) | Behavior-based incremental rewrite, not translation | modern stack | Imogen platform, Thoughtworks channel |
| Code Metal ($125M Series B, $1.25B valuation, Feb 2026) | **Verifiable** AI translation | Rust/C++ (defense) | The valuation is for *verification*, not translation |
| Bloop (YC), Swimm, CoreStory ($32M), Kodesage ($6.6M), Zengines | Understanding/documentation/data-lineage wedges | n/a | The proven small-team entry pattern |

**Two structural facts:**
1. **No vendor targets Scala.** Java is near-universal; C# distant second.
2. **The Feb 23, 2026 Anthropic event:** a Claude Code COBOL-modernization playbook erased ~$31B of IBM market value in a day (worst since 2000). Analysts called the selloff overdone — but it marks the market's belief that **raw translation is commoditizing**. Value is migrating to verification, testing, and domain understanding.

---

## 5. Buyer Behavior

- **Services-led market:** 74% of enterprises rely on third-party providers (Kyndryl 2025, n=500). Tools get bought *by SIs* or embedded in engagements far more than directly by enterprises.
- **Deal sizes:** rehost ~$600K; automated refactor ~$2.2M; full rearchitect ~$4M+; large programs $10–60M+. Cost-per-LOC: $0.25–$2.30 converted (tooling alone as low as ~$0.10).
- **Testing is >50% of project time/cost.** The #1 cited failure cause is undocumented business logic; the #2 is inadequate equivalence validation before cutover.
- **Failure-rate folklore:** the only mainframe-specific figure with methodology is Advanced 2020 (74% "started but failed to complete," n=400, vendor survey). Kyndryl 2025 counter-claims 2–3x ROI. Both are vendor-sponsored; direction: **large programs disappoint often; incremental approaches are winning** (80% of enterprises changed strategy toward incremental in the past year).
- **Cautionary tales:** TSB 2018 (£48.65M fine, ~£330M cost), Canada Phoenix (~$5.1B remediation), US DOL terminating state UI modernization grants (May 2025).
- **Verified AI-era success:** Deluxe Corp completed its full mainframe exit using agentic AI tooling (Claude/OpenAI/GitHub) — CIO 100 award, May 2026, ~$2T/yr payments processed.

---

## 6. Scala: Differentiator or Mistake?

**Evidence for Scala:**
- Genuine white space — zero competitors.
- Real, sticky enterprise Scala estates in finance: **Morgan Stanley** (Optimus, ~21M lines, one of the world's largest Scala codebases), JPMorgan, Goldman, Barclays, UBS, Citi, ING. Scala tops JetBrains' 2025 highest-paid-language list.
- Spark data engineering keeps Scala alive in every large bank's data platform — and mainframe offload pipelines (Kafka + Spark) are exactly where COBOL batch logic lands.

**Evidence against Scala-first:**
- Buyers ask for Java. Every deterministic converter and every hyperscaler converged on Java for hiring-pool and risk reasons.
- The Scala talent pool is niche and aging: ~2% primary-language share (JetBrains 2025), 44% of teams see decline vs 9% growth, ~5% newcomers.
- "Escape a rare-skills language" is the buyer's stated goal; landing in another rare-skills language undercuts the pitch for the mainstream buyer.

**Resolution — the honest strategic frame:**
1. **Scala is a viable niche wedge, not a mass-market wedge.** The addressable Scala-native buyer is the ~dozen global banks with large existing Scala platforms who want COBOL batch/data logic landed beside Spark. That's a real but thin market — enough for first design partners, not for the whole company.
2. **The engine work is 95% target-agnostic.** Lexing, copybook expansion, record layout, PIC semantics, control-flow analysis, equivalence testing — all of it is identical for Java output. Build the core once, add a Java emitter when the first mainstream buyer appears.
3. **Lead with verification.** The one thing every research angle agreed on: *the first platform that demonstrates provable behavioral equivalence between COBOL and converted code changes the compliance conversation for the whole market.* Google built Dual Run for this; AWS added test generation; Code Metal raised at $1.25B on it. For a small team, byte-accurate record layouts + characterization-test generation + parallel-run diffing is the credible, defensible core.

---

## 7. Verdict

**Is the market safe/real? Yes** — the spend, the workforce gap, and the regulatory pressure are real and a decade-durable.

**Can a small team win selling full conversion? No** — not head-on against IBM/AWS/Google/SIs plus $250M+ of fresh AI-startup capital.

**Where can this project win?**
1. **Copybook-first analysis and record-layout truth** (what this repo's engine now does correctly — byte-accurate lengths are the foundation everything else builds on).
2. **Equivalence verification:** generate characterization tests from COBOL semantics; parse/format round-trip proofs; parallel-run diffing. This is the under-served, highest-value layer.
3. **Scala output as the differentiated niche** for Spark-heavy financial-services data platforms, with Java as the planned second target for the mainstream.
4. **Distribution through SIs and mid-market** (credit unions, regional banks, state agencies) that hyperscaler sales motions ignore.

**Bottom line for this repository:** keep building COBOL→Scala — but position the product as *"the engine that understands COBOL record layouts and proves the conversion is right,"* not *"a converter."* That is the gap the giants have left open.

---

*Primary sources are cited inline throughout the research registers; key ones: MarketsandMarkets 2025, Straits Research 2026, Kyndryl State of Mainframe Modernization 2025 (n=500), BMC 20th Annual Mainframe Survey 2025 (n>1,000), Forrester/Rocket 2024 (n=309), Vanson Bourne/Micro Focus 2022 (n=1,104), GAO-25-107611, Reuters "COBOL blues" 2017, COBSOLETE fact-checks 2020–21, CNBC/Forbes/Bloomberg coverage of the Feb 2026 Anthropic–IBM event, funding announcements via BusinessWire/TechCrunch/SiliconANGLE 2024–2026.*
