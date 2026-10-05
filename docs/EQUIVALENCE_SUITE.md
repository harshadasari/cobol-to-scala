# The COBOL Semantic-Equivalence Suite

**Status:** positioning document (step 8 of `ACTION_PLAN_2026-10.md`). Describes what exists today and what a Java/C# adapter would need; it does not announce a released product. Facts are taken from `docs/CORPUS_COVERAGE.md`, `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` and the harness source (`Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/harness.js` and `oracle.test.js`).

**Claim, and its limits.** A reproducible corpus of 574 COBOL programs whose language semantics are differential-tested against a reference compiler (GnuCOBOL 4.0-early-dev, default dialect), grown adversarially over 40 rounds. It is **not** IBM Enterprise COBOL, and parity means **stdout of self-contained programs**. It does not prove equivalence, and it is not a statement about the mainframe.

## 1. What it is

| Part | What it is |
|---|---|
| Corpus | 574 programs under `tests/corpus/` |
| Oracle | The real compiler: `cobc` compiles and runs each program; its stdout is the ground truth |
| Harness | `runCobol`, `runScala`, `oracleCompare`, plus helpers, in `tests/oracle/harness.js` |
| Driver | `tests/oracle/oracle.test.js`, run by `node --test` |

Composition of the 574 (per `CORPUS_COVERAGE.md`):

| Group | Files | Check |
|---|---:|---|
| `data/` `.cbl` | 19 | stdout diff against live `cobc` output (COMP-3, binary, zoned, OCCURS, REDEFINES, editing, rounding, truncation) |
| `proc/` `.cbl` | 539 | stdout diff against live `cobc` output (procedure-division probes, the bulk of the adversarial rounds) |
| `sql/` `.cbl` | 5 | no `cobc` oracle (EXEC SQL is not compilable by plain cobc); golden-file and compile-verified generation checks only |
| `proc/` `.cbl.txt` | 11 | negative probes: `cobc` must reject (or abort) the program exactly as recorded in a `.expect.json` sidecar; executed by the suite, and a change in cobc's behaviour fails |
| **Total** | **574** | 563 `.cbl` + 11 `.cbl.txt` |

So 558 programs have a live cobc stdout oracle (19 + 539). The "563" figure counts the 5 SQL programs, which have none. Be exact about this when quoting numbers.

**Feature coverage** is enumerated from the corpus itself in `docs/CORPUS_COVERAGE.md`, program counts per feature, with examples, and a section of what is not covered. Examples of what is exercised: COMP-3, COMP/COMP-5, zoned with sign overpunch, COMP-1/COMP-2, OCCURS (fixed, ODO, nested), REDEFINES/RENAMES, ROUNDED and ON SIZE ERROR, all arithmetic verbs, PERFORM variants, EVALUATE ALSO, STRING/UNSTRING/INSPECT, SEARCH/SEARCH ALL, SORT/MERGE procedures, LINE SEQUENTIAL and RELATIVE file I/O (REWRITE, DELETE, START, LINAGE, FILE STATUS), DECLARATIVES, RECURSIVE programs, CALL by reference/content/value within one source file, COPY/REPLACING. Reference modification is present in the corpus (19 programs) but registered as `t.todo`.

## 2. How it was grown

- **Adversarial rounds.** 40 rounds. In each, an AI refuter wrote 10-18 hostile programs designed to break the translator; `cobc` established ground truth; every genuine divergence was fixed at root cause, independently re-verified, and the probe stays in the corpus as a permanent regression. The corpus grew from 48 programs to 209 (round 14) to 574 (round 40). 241 real defects were fixed (110 in rounds 1-14, 131 in rounds 15-40).
- **Live fixtures.** Each `*.oracle.txt` is re-captured from `cobc` on every run, so expectations are never hand-maintained. An optional `*.expected.txt` is diffed against live cobc output as a check on the corpus itself.
- **Honest `t.todo`.** A program that does not yet match is registered as a visible, non-failing `t.todo(...)` with the exact mismatch reason, never silently dropped or weakened. Round-40 state: about 2,017 tests (898 unit, 1,119 oracle-harness), 0 failures, 45 `t.todo` entries, each tied to a named open gap.
- **What it caught.** Example: round 29 found that the RELATIVE-file storage model silently corrupted binary data containing a newline byte. Only byte-level differential testing finds this class.
- **Not exhausted.** The convergence bar (0-2 findings for two consecutive rounds) was met once; rounds 38-40 then found 6, 7 and 8 bugs, including two entirely unimplemented statements. The corpus reflects what 40 rounds could think to probe, not a bound on remaining defects.

## 3. Why it is target-language-neutral

The suite has two sides that compare outputs:

1. **The COBOL side**: `.cbl` sources, optional `.copybooks.json` sidecars, and `runCobol`, which only invokes `cobc`. It knows nothing about any translator.
2. **The translated side**: whatever a translator emits, executed somewhere, producing stdout.

Everything on side 1, and the comparison rule, is independent of the target. In the current code, only these pieces are Scala-specific:

| Piece | What it does today | What a Java/C# adapter replaces |
|---|---|---|
| `convertToScala(source, { generateMain: true, copybooks })` call inside `oracleCompare` | Calls this repo's translator in-process | A call (in-process, CLI, or API) to the other translator, passing COBOL source and copybooks, returning target source |
| `runScala(source, opts)` | Writes `Main.scala`, runs `scala-cli run`, 120 s timeout, strips the `JAVA_TOOL_OPTIONS` banner and ANSI codes, detects compile failure by scanning stderr for `Error compiling` / `[error]` / `error:` | Write target source, build and run with `javac`/`java`, `dotnet`, etc.; return `{phase, stdout, stderr, exitCode, timedOut}`; define its own compile-failure detection |
| `warmupScala`, `inspectToolchain` | Warm the Scala dependency cache; check the toolchain is present and pinned | Equivalent toolchain checks for the target |
| The `//> using scala 3.7.3` pin and `JAVA_TOOL_OPTIONS` filtering | Sandbox-specific | Not needed |

Unchanged for any target: `runCobol`, `normalizeOutput`, `lineDiff`, the corpus and sidecar conventions, the pass/todo/fail scoring, and the `cobc` capture sweep. Phase-wise, `oracle.test.js` runs the comparison over `tests/corpus/data/` and `tests/corpus/proc/`; swapping in another translator is a change to the adapter plus one import.

Note: nothing has been run with a Java or C# adapter yet. This is a description of the seam, not a demonstrated port.

## 4. Who would use it, and how

| User | Use | What they get |
|---|---|---|
| LLM-based pipeline (IBM Bob, AWS Transform Reimagine path, SI agent factories) | External correctness gate: run each translation through the corpus, count mismatches by feature | A reference-compiler check that does not depend on the model grading its own output |
| Deterministic vendor | Regression suite and gap finder | 574 programs of byte-level probes, with a coverage list to compare against their own |
| Bank or insurer platform team | Acceptance gate on a vendor's output | A reproducible, versioned pass/todo/fail record to attach to sign-off, with declared scope and limits |
| Auditor or model-risk team | Evidence artifact | A coverage list, a known-gaps list, and a rerunnable procedure |

It is evidence about language semantics. It does not replace dual-running on production data, which is the acceptance bar practitioners describe.

## 5. How to run it against your own translator

**Interface today.** The harness is a Node.js (ESM) library plus a `node:test` suite. There is no standalone CLI. Prerequisites: Node, `cobc` on PATH (the corpus was developed against `cobc (GnuCOBOL) 4.0-early-dev.0`), and the toolchain for your target. The repo's own run is `npm test`, which is `node --test 'tests/**/*.test.js'`, run from `Thyraa-COBOL-main/backend/packages/cobol-to-scala`. See `docs/toolchain-status.md` for the exact versions used.

**Inputs.**
- A COBOL file path (`.cbl`, fixed format).
- Optional `<base>.copybooks.json`: `{"NAME": "copybook text", ...}`. The same text is written as `<NAME>.cpy` in cobc's scratch directory with `-I`, and passed to the translator as `convertOptions.copybooks`, so both sides resolve `COPY` identically.
- Optional `<base>.expected.txt`: hand-authored expected stdout, diffed against live cobc output (a mismatch fails and the message asks whether the expectation or the program is wrong).
- Adapter options: per-phase timeouts (cobc default 10 s, Scala default 120 s).

**What happens per program.**
1. `runCobol`: copy source to an OS-temp scratch directory, `cobc -x -o <exe> <src>` (default dialect, no `-std` flag), run the executable. Returns `{phase: 'compile'|'run', stdout, stderr, exitCode, timedOut}`. The scratch directory is deleted afterwards unless `keepTmp` is set. A live `<base>.oracle.txt` is rewritten from the result.
2. Translate and run the target (this is the part you replace).
3. `oracleCompare` accepts only if both sides have `phase 'run'`, `exitCode 0` and no timeout; then it compares `normalizeOutput(stdout)` on each side. `normalizeOutput` converts CRLF to LF, strips trailing spaces/tabs per line and trailing blank lines. Written files are then compared as well (see below); stderr and timing are not.
4. Result: `{cobolResult, scalaResult, scalaSource, conversionError, match, diff}`. A translator exception becomes `match: false` with the stack in `diff`; a mismatch yields a per-line diff.

**Scoring.**

| Outcome | Meaning | Runner effect |
|---|---|---|
| **pass** | Both sides ran cleanly and normalized stdout is byte-identical | test passes |
| **todo** | Mismatch, translator exception, target failed to build, or target exited nonzero; the reason string is recorded (`t.todo`) | non-failing, listed as a work-queue item; this is a known-unsupported marker, not a pass |
| **fail** | The corpus itself is broken: cobc fails to compile or exits nonzero on a `.cbl`, or live cobc output differs from a present `.expected.txt` | test fails, runner exits nonzero |
| **toolchain fail** | `cobc` missing or not the pinned version, or `scala-cli` missing | the test `oracle toolchain present and pinned` FAILS and the heavy tests skip; only `ORACLE_ALLOW_SKIP=1` makes it a skip |

**Exit codes.** There is no harness-specific exit code. `node --test` exits 0 when there are no failing tests (todo and skip do not fail) and nonzero otherwise. A green run therefore means "no corpus breakage"; read the todo count to see how much the translator does not yet match. Treat any unexplained change in the todo count as a signal to investigate.

**Switches and scripts (run from `Thyraa-COBOL-main/backend/packages/cobol-to-scala`).**

| Command / env | Effect |
|---|---|
| `npm run oracle` | The full oracle suite (about an hour; run it detached). |
| `ORACLE_COBC_VERSION=<v>` | The pinned reference compiler version (default `4.0-early-dev.0`, defined once as `PINNED_COBC_VERSION` in `harness.js`). |
| `ORACLE_ALLOW_SKIP=1` | Only way to turn a missing/wrong toolchain into a skip. Without it the test `oracle toolchain present and pinned (...)` FAILS (cobc missing, cobc version not the pin, or scala-cli missing) and the heavy tests skip, so a run can never be green because the oracle did not run. |
| `npm run oracle:dialect` (`ORACLE_DIALECT=ibm` or `ibm-strict`) | In addition to the default capture, runs cobc with `-std=<dialect>` over every program and reports per program whether cobc's own stdout/exit status differs ("dialect-sensitive"); summary diagnostic plus JSON at `ORACLE_DIALECT_REPORT` (default `<tmpdir>/oracle-dialect-<dialect>.json`). Diagnostics only, never changes a verdict. `ORACLE_SKIP_SCALA=1` (set by the script) skips the translator comparison. |
| `npm run golden` / `npm run golden:update` | Golden-snapshot gate (section 5.1). |
| `npm run oracle:fuzz -- --seed S --count N` | Seeded grammar-based program generator (section 5.2); not part of the default suite. |

**Sidecars next to a corpus program.** `<base>.copybooks.json` (above); `<base>.stdin.txt` is fed to stdin of BOTH cobc and the translated program (and used when capturing `.oracle.txt`); for the negative probes `<base>.cbl.txt` + `<base>.expect.json` = `{"outcome": "compile-error" | "exit-nonzero", "exitCode": 1, "stderrIncludes": ["..."], "stdout": "..."}` where `stdout` (exit-nonzero only) is the exact output before the abort. The probe passes only if cobc still behaves that way; any change FAILS (never todo).

**Written-file parity.** Each side runs in its own empty scratch directory. After the run the set of created files (by name, recursively) and their bytes are compared; a mismatch is reported with the first differing offset and the lengths, and classified with the stdout result (a mismatch is a todo). RELATIVE files (detected from `ORGANIZATION IS RELATIVE` on a literal `ASSIGN TO`) are compared as logical record images (same live slot numbers, same record bytes) because cobc writes an 8-byte header per slot and the Scala runtime does not. `tests/oracle/file-parity-ledger.json` lists corpus programs whose stdout matches but whose written files are known to differ; they pass with a per-run diagnostic, a program not in the ledger with a file mismatch is a todo, and an entry whose files now match fails as stale.

### 5.1 Golden snapshots

`tests/golden/<corpus path>.scala` is what `convertToScala(source, {generateMain: true, copybooks})` emits for every corpus `.cbl`. `tests/golden/golden.test.js` regenerates in memory (about a second, no cobc/scala-cli) and fails on any difference. An engine change that alters generated output must update the golden on purpose: `npm run golden:update`, review `git diff tests/golden`, commit with the engine change. The golden says "the output changed", not "the output is wrong"; correctness is still decided by the cobc oracle.

### 5.2 Grammar-based generator

`tests/oracle/fuzz.js`: seeded (no LLM) programs over PIC 9(n)/S9(n)V9(m)/X(n) items with MOVE, COMPUTE/ADD/SUBTRACT (ROUNDED, SIZE ERROR), IF, PERFORM VARYING and DISPLAY, each run through `oracleCompare`. Mismatches are classified by signature and delta-reduced to minimal reproducers. `--print` shows programs without running anything; the same `--seed`/`--index` always regenerates the same program.

**Known harness limitations.** The Scala compile-failure test is a stderr heuristic. The `.cbl.txt` probes check cobc's behaviour only; they do not check that a translator also rejects them, so a new adapter must wire that itself. Stdin is a single text blob fed to both sides.

## 6. Honest limits

- **Reference compiler.** GnuCOBOL 4.0-early-dev (an early 4.0 build, not 3.2 stable), default dialect. Not IBM Enterprise COBOL. Documented divergence classes: intermediate arithmetic precision (one reported case: 100 on IBM, 188 under GnuCOBOL), binary truncation defaults (TRUNC), sign display and sign-nibble conventions, SORT tie order, EBCDIC collating, and GnuCOBOL being more permissive than IBM in places (so a program can pass here and fail on z/OS). The suite cannot detect any of these. See `docs/ORACLE_DIVERGENCE_REGISTER.md` where available, and the calibration step in `ACTION_PLAN_2026-10.md`.
- **Dialect.** Pass/todo is decided on the default dialect only. The opt-in `ORACLE_DIALECT=ibm` run reports which programs' cobc output changes under `-std=ibm` (diagnostics only); `-std=mf` is not exercised.
- **Stdout plus written files.** The set of files each side creates and their contents are compared (LINE SEQUENTIAL/SEQUENTIAL byte for byte; RELATIVE files as logical record images, because cobc and the Scala runtime use different physical slot layouts). Return codes beyond the harness check, abends and stderr are not compared. Programs with known file-image divergences are recorded in `tests/oracle/file-parity-ledger.json` (visible on every run, ratcheted).
- **Scope.** Self-contained batch-style programs. No CICS, DB2, VSAM/indexed (the installed build has indexed support compiled out), JCL, IMS, MQ, or EBCDIC at rest. Fixed-format source only.
- **No coverage guarantee.** The corpus is authored by an AI refuter. Features never exercised are listed in `CORPUS_COVERAGE.md` section 7 (for example LOCAL-STORAGE, PIC A, class conditions, OPEN EXTEND, most intrinsic functions: only 8 distinct functions appear).
- **Programs without a cobc stdout oracle.** The 11 `.cbl.txt` probes are checked against cobc's own recorded rejection/abort (not stdout-compared against a translation) and the 5 `sql/` programs get golden/compile checks only.
- **Gaps in the translator the suite reveals.** Reference modification (19 `t.todo` programs), INDEXED files, group-with-OCCURS CALL, and others per `CAPABILITY_AUDIT_AND_ROADMAP.md` section 1.3. The corpus is not adversarially exhausted.
- **Repeatability.** The oracle runs on a specific toolchain (cobc 4.0-early-dev, scala-cli 1.9.1 / Scala 3.7.3, Ubuntu 24.04). Other cobc versions may produce different `.oracle.txt` and have not been tested.
- **Packaging.** Today the suite lives inside this repository and is wired to the in-repo translator. It is not yet a standalone package with a CLI; that is work, not a given.

## 7. Licensing and packaging options (to discuss, not decisions)

| Option | Shape | Questions to resolve |
|---|---|---|
| Open-core | Corpus and harness open; engine and enterprise features (reports, adapters, support) paid | Is an open corpus a credibility asset or a giveaway? Who maintains contributions? |
| Component / OEM licence | Suite licensed to SIs, hyperscaler teams and vendors for embedding in their pipelines | Per-seat, per-pipeline, or annual? Does the licensee get updates as new rounds are run? |
| Dual licence | Open for research and non-commercial use; commercial licence for use as an acceptance gate or in a paid product | Which copyleft or source-available licence; how to enforce |
| Services | Run the equivalence campaign on a client's COBOL and deliver a report | Sells hours, not a product; depends on IBM-calibrated evidence to be credible to a bank |
| Preserve as open asset | Release engine and corpus openly if the demand test fails (the proposed April 2027 kill criterion) | Decide timing and licence ahead of time |

Next evidence needed before choosing: the partner conversations in `PARTNER_BRIEF.md`, especially whether anyone will run the harness on their own COBOL and which target language they ask for.
