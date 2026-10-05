# Partner Brief: a deterministic COBOL engine and a compiler-checked equivalence corpus

**Status:** discussion material for the demand test (step 4 of `ACTION_PLAN_2026-10.md`). Grounded in `VIABILITY_REPORT_2026-10.md` and `CORPUS_COVERAGE.md`. The owner holds these conversations personally; nothing here has been tested with a partner yet.

## The one-page version (for the partner)

**What exists.** A deterministic, rule-based COBOL translator (same input, same output, no LLM anywhere in the translation path) and, more importantly, the evidence harness built around it. Its language semantics are continuously differential-tested against a reference compiler (GnuCOBOL 4.0-early-dev, default dialect) on an adversarially grown corpus of 574 programs. Each program is compiled and run by the real compiler, the translated output is run, and standard output is compared byte for byte.

**How the corpus was built.** A 40-round method: in each round an AI "refuter" wrote 10-18 deliberately hostile COBOL programs, the real compiler established ground truth, every genuine divergence was fixed at root cause, independently re-verified, and kept as a permanent regression. 241 real defects were found and fixed this way. About 2,017 automated tests currently pass with no failures; 45 known open gaps are registered as visible `t.todo` entries, not silent passes.

**What it demonstrably catches.** Byte-level semantic errors that "it compiles" and sampled output checks miss: packed-decimal (COMP-3) handling, REDEFINES overlays, ROUNDED behaviour, field truncation, binary and zoned-decimal layouts, and file-record handling. Example: in round 29 the harness caught a silent binary-corruption bug (record data containing a newline byte was corrupted on write). That is the class of failure practitioners describe in real migrations (a REDEFINES'd packed field read as an ordinary number and written corrupted to the database).

**What it does NOT do (read this before anything else).**
- The reference is GnuCOBOL, **not IBM Enterprise COBOL**. The two are documented to disagree in money-relevant ways (intermediate arithmetic precision, binary truncation defaults, sign display, sort tie order, EBCDIC). No IBM calibration has been done yet.
- Parity means **stdout of self-contained programs**. Not CICS, DB2, VSAM/indexed files, JCL, IMS, files left on disk, or EBCDIC data at rest. This is language-semantics evidence, not system-level or production-data equivalence.
- Known open engine gaps: reference modification (`field(start:length)`) is being fixed and has been the largest silent-wrong-output risk; INDEXED files are unimplemented; several statements are stubs or approximations (full list in `CORPUS_COVERAGE.md` section 7).
- The corpus was written by an AI refuter with no coverage guarantee, and the last rounds still found bugs. It is not adversarially exhausted.
- The only output language today is Scala 3. There is no Java emitter and no target-neutral IR yet. No platform layer (auth, CI/CD, UI) exists.

**The ask.** One question:

> **Would you pay for a deterministic engine plus a compiler-checked equivalence corpus as a component of your pipeline, and in what target language?**

The market context behind the question (from the viability report): translation itself is now free or bundled (AWS made its deterministic COBOL-to-Java step free in March 2026), and the buying question has moved to "can anyone prove the translation is right". Testing is reported by AWS to consume more than 50% of migration project duration. We think the corpus and harness may be worth more than the translator. We do not yet know whether anyone agrees.

## Discussion guide (8-10 questions)

Aim for stories and numbers, not opinions. Politeness shows up as praise without specifics; demand shows up as a named person, a named project, and a next step.

1. **Today's verification.** For your last COBOL migration, how did you decide a program was "equivalent"? Who signed it off, and on what evidence? (Listen for: dual run, regression test replay, manual review, unit tests generated per program.)
2. **Cost of testing.** What share of project time and budget went to testing and sign-off? Does the ">50% of duration" figure match your experience? Which part hurt most: test data creation, environment, execution, or sign-off?
3. **Where it failed.** Name a defect that reached late-stage testing or production. Was it a language-semantics defect (packed decimal, rounding, truncation, REDEFINES) or a data/environment one? How would you have caught it earlier?
4. **Reproducible corpus and sign-off.** If a shared, versioned corpus of compiler-checked programs existed, with per-feature coverage and a published list of known divergences, would it change what your auditors or client's risk team accept? Or do they only accept production-data dual runs?
5. **Which compiler is the reference?** Is a GnuCOBOL oracle credible to you? What would you require instead (IBM Enterprise COBOL on z/OS, IBM COBOL for Linux x86, Micro Focus)? Would you supply the IBM-side runs yourselves?
6. **Target language.** What do you emit today and what do your clients ask for: Java, C#, Scala, COBOL-on-cloud, something else? Is a Scala output ever a requirement, or only Java? (We expect Java; we want to hear it or be corrected.)
7. **Run it on your COBOL.** Would you run our harness against your own COBOL samples, on your infrastructure, and share the pass/fail and divergence list? What would you need first (a Docker image, a Java adapter, an NDA, a security review)?
8. **Plug it into your translator.** If your pipeline is LLM-based or uses another deterministic engine, would you use the corpus as an external correctness gate? What would the adapter need to look like?
9. **Buying shape.** Which could you actually buy: a component/OEM license embedded in your toolchain, an open-core model (open corpus, paid engine or enterprise features), or services (we run the equivalence campaign for a client program)? Who signs, and what is a plausible budget line?
10. **What would make you walk away?** What coverage gap (indexed files, CICS, DB2, JCL) makes this irrelevant to you today, and would a partner of yours cover it?

## Target list and rationale

Role titles only; no contact names are given or implied. Ask for an introduction to the owner of the listed role.

| Group | Targets | Why (from the report) | Roles to approach |
|---|---|---|---|
| Systems integrators | Kyndryl, DXC, Accenture, TCS, Infosys, Wipro | The 2026 buyer is a channel, not a direct enterprise licence. Money is flowing to multi-year services programs (e.g. Kyndryl's 2026 financial-sector deals). They run agent factories and carry the sign-off risk. | Mainframe modernization practice lead; head of testing / quality engineering; delivery assurance lead |
| Hyperscaler partner programs | AWS Transform partner team, Google Cloud mainframe partners, IBM Bob ecosystem | AWS translation is free; Google's "Dual Run" is still in preview; IBM Bob routes work through LLMs and says LLM output needs validation. All three lack a published reference-compiler corpus. Partner programs decide what third-party components plug in. | Partner solutions architect for mainframe; ISV / technology partner manager; mainframe modernization product manager |
| Specialist vendors | mLogica, Heirloom, Mechanical Orchard, TSRI, Astadia/Amdocs | Deterministic specialists survived and repositioned around "proof before cutover" (mLogica: "evidenced, governed, and safely put into production"). They may already have private harnesses; they are the most informed critics and possible component buyers. | CTO or chief architect; head of verification / QA; partnerships lead |
| Bank platform teams | Morgan Stanley, Capital One, Deutsche Bank | Known to run Scala/Java estates, so the only place a Scala target has a plausible buyer. Postings say "Java/Scala", which is the signal to probe. | Head of mainframe/legacy platform engineering; engineering manager for a Scala/Java platform; model-risk or software-assurance lead |

Priority order for the first ten conversations: two SIs, two hyperscaler partner teams, two specialist vendors (including one that "has a harness already"), and two or three banks.

## Scoring sheet (one row per conversation)

Score each 0 (none), 1 (polite interest), 2 (specific interest), 3 (committed next step).

| Date | Org / role | Pain evidence (named defect or cost figure) 0-3 | Would pay as a component 0-3 | Would run harness on own COBOL 0-3 | Target language stated | Buying shape (OEM / open-core / services) | Named next step and date | Notes / objections |
|---|---|---|---|---|---|---|---|---|

Signal strength guide: a conversation with total of 7 or more and a named next step is a real signal. Praise with no figures, no named person and no next step is scored 0 or 1 regardless of tone.

**Success criterion (from the plan):** at least two partners willing to run the harness on their own COBOL, and an answer on Java vs Scala. Kill-criterion proposal (not yet confirmed by the owner): if by April 2027 no partner has run the harness on their own code and no design partner has committed, stop product investment and preserve the engine and corpus as an open or licensable asset.

## What we will NOT claim in these conversations

> - We do **not** say the translation "proves equivalence", "matches the mainframe", "is complete", or "is production-ready".
> - We do **not** say it behaves like IBM Enterprise COBOL. The reference is GnuCOBOL 4.0-early-dev, default dialect; no IBM calibration exists yet.
> - We do **not** say it validates a system. Parity is stdout of self-contained programs; no CICS, DB2, VSAM/indexed, JCL, IMS, file contents, or EBCDIC data at rest.
> - We do **not** say the corpus is exhaustive. It is AI-authored, has no coverage guarantee, and late rounds still found bugs (rounds 38-40 found 6, 7 and 8 bugs).
> - We do **not** say reference modification, indexed files, or the other listed gaps are handled unless a re-run of the suite shows it.
> - We do **not** say Scala is what the market wants; the evidence says Java is the mainstream target and we are asking.
> - We do **not** quote market-size figures or vendor customer counts as our own findings; most rest on search snippets and self-reported vendor numbers (see "Confidence and gaps" in the viability report).
> - The only claim we make: **deterministic, auditable translation whose language semantics are continuously differential-tested against a reference compiler (GnuCOBOL 4.0-early-dev, default dialect) on an adversarially grown corpus of 574 programs; no LLM in the translation path.**
