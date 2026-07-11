# `@thyraa/cobol-to-scala`

A real lexer -> parser -> AST -> Scala 3 generator pipeline for COBOL. This is
the conversion engine at the heart of the repo (see the repo root
`docs/CAPABILITY_AUDIT_AND_ROADMAP.md` for the full staged plan and honest
gap list this package is measured against, and `docs/AUTONOMOUS_BUILD_LOG.md`
for how it got to its current state).

## What it does today

Given COBOL source (plus, optionally, a map of copybook name -> source text),
`convertToScala()` produces compilable Scala 3: case classes for record
layouts with byte-accurate `parse`/`format` companions, `enum`s for
level-88 condition names, and `def`s for paragraphs with COBOL's control-flow
and arithmetic/string semantics translated statement-by-statement.

Concretely, in source terms:

- **Lexer** (`parser/lexer.js`) - fixed & free format, sequence/indicator
  columns, continuations, string/hex literals, PIC-aware tokenization.
- **Data Division** (`parser/data-division-parser.js`) - WORKING-STORAGE/
  FILE/LINKAGE/LOCAL-STORAGE, levels 01-49/66/77/88, PIC (`9 X A S V P Z *
  + - $ , . B 0 / CR DB` with repetition), USAGE (DISPLAY through COMP-5,
  BINARY, PACKED-DECIMAL, INDEX, POINTER), OCCURS (fixed + DEPENDING ON +
  INDEXED BY + KEY), REDEFINES, RENAMES, VALUE, SIGN, SYNC, JUSTIFIED, BLANK
  WHEN ZERO, FILLER, FD entries.
- **Copybooks** (`parser/copybook-resolver.js`) - COPY, `COPY ... OF/IN
  <library>`, REPLACING (pseudo-text and word forms), nested and
  cycle-safe, wired through `options.copybooks`. Standalone copybook
  fragments (no DATA DIVISION header) parse directly too.
- **Procedure Division** (`parser/procedure-parser.js`) - PERFORM
  (inline/thru/times/until/varying), IF/EVALUATE (TRUE/FALSE/ANY/ranges/NOT),
  GO TO (incl. DEPENDING ON), MOVE (incl. CORRESPONDING), INITIALIZE, SET,
  COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE, STRING/UNSTRING/INSPECT, SEARCH/
  SEARCH ALL, SORT/MERGE/RELEASE/RETURN, file I/O verbs, CALL, ACCEPT/
  DISPLAY, intrinsic FUNCTIONs, EXEC SQL/EXEC CICS (captured structurally).
- **JCL / DCLGEN / SQL / CICS / BMS** (`parser/jcl-parser.js`,
  `parser/dclgen-parser.js`, `parser/sql-parser.js`, `parser/cics-parser.js`,
  `parser/bms-parser.js`) - structural parsers for the rest of a mainframe
  estate; see the capability table below for what each one's *generator*
  side actually produces (parsing something is not the same claim as
  generating a behavioral conversion of it).
- **Generator** (`generator/`) - case classes + byte-level codecs
  (`generator/codecs.js`, `runtime/CobolCodecs.scala`: packed decimal,
  binary big/little-endian, zoned decimal with every sign scheme, EBCDIC
  cp037), paragraph methods with a CFG-aware PERFORM-THRU scheme (see
  capability table), expression/condition translation, Doobie SQL
  generation, and an honest CICS/BMS service-skeleton generator.

## The oracle-verification story (the actual differentiator)

Anyone can generate Scala that *looks* plausible for a COBOL snippet. The
thing this package does differently is **check its own output against a real
COBOL compiler**, automatically, every run:

- [GnuCOBOL](https://gnucobol.sourceforge.io/) (`cobc`) compiles and runs
  every `.cbl` program under `tests/corpus/`, so the ground truth is "what a
  real compiler's runtime actually did," not a hand-written guess about
  COBOL semantics.
- [scala-cli](https://scala-cli.virtuslab.org/) compiles and runs the Scala
  this package's own `convertToScala()` generates from that *same* source.
- `tests/oracle/harness.js`'s `oracleCompare()` runs both and diffs their
  stdout. A mismatch is never silently accepted or weakened into a softer
  assertion - it fails the test (or, while a gap is still open, surfaces as
  a `t.todo(...)` naming the exact construct and diff, which shows up in the
  test report so it can't be quietly forgotten).

This is why the claims in the capability table below can be stated
precisely instead of aspirationally: they are "N/N programs produce
byte-identical stdout to a real compiler," not "the generator has code that
handles this construct."

On top of straightforward corpus coverage, this package has been through
**adversarial refutation rounds**: a dedicated pass whose only job is to
write new programs designed to break the generator (edge cases in MOVE
truncation, arithmetic subscripts, ON SIZE ERROR, 88-levels, SEARCH VARYING,
multi-key SORT, etc.) and run them against the same compiler oracle. Two
rounds have run so far (round 1: 12 data-layer programs, 11 diverged; round
2: 20 procedure-layer programs, 16 diverged) and every finding from both was
root-caused and fixed, with the refuting programs promoted permanently into
the corpus so they can never silently regress. See
`tests/oracle/README.md` for the itemized finding -> fix -> program mapping,
and `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`'s "Verification record" section
for the running total. A third adversarial round is planned but had not run
as of this writing - treat the corpus as "hardened against two attack
passes," not "hardened against all possible attacks."

The oracle only verifies what's actually installed: if `cobc`/`scala-cli`
aren't on `PATH`, the relevant tests report `t.skip(...)` with an
explanation rather than failing outright or silently passing.

## Running the tests

```bash
npm test                                              # whole package suite
node --test tests/oracle/oracle.test.js               # just the oracle harness
node --test --test-name-pattern="oracle compare" tests/oracle/oracle.test.js
```

Requires `cobc` (GnuCOBOL) and `scala-cli` on `PATH` for the oracle-gated
tests to actually verify anything (otherwise they skip). See the repo root
`docs/toolchain-status.md` for exact install commands used in this project's
own sandboxed environment, and `demo/README.md` (repo root) for a minimal
runnable example outside the test suite.

## Corpus layout

```
tests/corpus/
  data/    19 programs - Phase 1 (record layouts, PIC/USAGE/OCCURS/REDEFINES,
           byte-level codecs). p01-p07 are the baseline corpus; a01-a12 are
           the Phase 1 adversarial-refutation programs, promoted in.
  proc/    29 programs - Phase 2 (procedure statements: SEARCH/SORT/
           CORRESPONDING/GO TO DEPENDING/intrinsics/STRING-UNSTRING-INSPECT/
           EVALUATE/...). p10-p18 are the baseline corpus; r01-r14 (incl.
           *b/*c bisection variants) are the Phase 2 adversarial-refutation
           programs, promoted in.
  sql/     5 programs - Phase 3 EXEC SQL -> Doobie (compile-verified against
           real doobie-core; excluded from the cobc sweep since plain
           GnuCOBOL can't compile embedded SQL without a precompiler).
  jcl/     3 job streams - Phase 3 structural JCL parsing + dataset lineage.
  dclgen/  2 DCLGEN members - Phase 3 DB2 column <-> host-variable binding.
  cics/    2 programs + 1 BMS map - Phase 4 CICS command classification +
           BMS-driven skeleton generation.
```

`tests/oracle/README.md` is the live, authoritative account of what passes
today (regenerated finding-by-finding as the generator changes) - read it
before trusting any capability claim in a doc, this one included.

## Options

`convertToScala(source, options)` / `parseCobol(source, options)`:

| Option | Default | Meaning |
|---|---|---|
| `copybooks` | `{}` | Map of copybook name (or filename) -> source text. When non-empty, COPY statements are expanded before parsing (`parser/copybook-resolver.js`); lookup is case-insensitive and tolerant of `.cpy`/`.cob`/`.cbl`/`.copy` extensions. |
| `format` | auto-detected | `'fixed'` \| `'free'` column format. |
| `charset` | `'ascii'` | `'ascii'` \| `'ebcdic'`. Drives PIC X/A string codecs **and** the `codePage` passed to zoned-decimal (DISPLAY numeric) codecs in every generated record's `parse`/`format`. `'ascii'` is a lossless 1:1 byte<->Latin-1 mapping; `'ebcdic'` uses a full cp037 table. See the capability table's EBCDIC row for what is and isn't exercised end-to-end at this setting. |
| `embedRuntime` | `true` | `true` inlines the `CobolCodecs` runtime object source directly into the generated file, so a single `scala-cli run Foo.scala` is self-contained (what the demo and the test suite both do). `false` instead emits `import com.thyraa.cobol.runtime.CobolCodecs`, for callers who compile `runtime/` once and share it across many generated files. |
| `generateMain` | `false` | Emit an `@main def run(): Unit` entry point that calls the translated main paragraph - needed to actually run the generated file with `scala-cli run`/`scala-cli compile`. |
| `packageName` | `'com.example.cobol'` | Scala `package` declaration for the generated file. |
| `objectName` | derived from `PROGRAM-ID` | Override the generated `object` name. |
| `useDoobie` / `useCatsEffect` | `false` | Reserved for the SQL-generation path (`generator/sql-gen.js`); see the capability table - not yet wired into the main generator's own option surface. |

## Honest capability table

"Oracle-equivalent" below means: converted with this package's own
`convertToScala()`, compiled with `scala-cli`, and its stdout matched real
`cobc` output byte-for-byte, for every program in the named corpus subset -
see `tests/oracle/README.md` for the exact, currently-passing count (it
changes; this table is a snapshot of shape, not of the live number).

| Area | Status | Notes |
|---|---|---|
| Data layout (PIC/USAGE/OCCURS/REDEFINES/copybooks) | Oracle-equivalent | `tests/corpus/data/`, incl. 12 adversarial-refutation programs. Byte-level codecs (COMP-3, COMP/COMP-4/COMP-5, zoned incl. all sign schemes, EBCDIC cp037) are compiler-verified, hardened after 2 refutation rounds. |
| OCCURS ... DEPENDING ON | Partial (OPEN) | Sized at a fixed max for round-trip stability; `parse`/`format` don't honor the live counter field. Every such field carries a visible `// TODO(ODO)` marker - see `generator/case-class-gen.js`. |
| EBCDIC | Partial | PIC X/A string fields and DISPLAY-numeric (zoned) fields both route through `options.charset: 'ebcdic'` end-to-end, but only strings have an oracle-adjacent generated-Scala round-trip test (`tests/roundtrip.test.js`'s `strings-ebcdic` case); numeric-field EBCDIC behavior (sign-nibble scheme under cp037) is verified at the codec unit-test level (`tests/codecs.test.js`), not through a generated-class round trip with `charset: 'ebcdic'` and a numeric field together. Treat "EBCDIC works for numerics" as codec-level proven, not generator-integration proven. |
| Procedure statements (SEARCH/SORT/CORRESPONDING/GO TO DEPENDING/intrinsics/STRING/UNSTRING/INSPECT/EVALUATE) | Oracle-equivalent | `tests/corpus/proc/`, 29/29 incl. 20 adversarial-refutation programs (14 root-cause findings, all fixed - see `tests/oracle/README.md`'s finding table). |
| Paragraph control flow / PERFORM THRU / GO TO | Partial by design | Implemented as a CFG-aware scheme scoped to PERFORM-THRU ranges: paragraphs in a THRU range become nested local `def`s so GO TO within that range and natural fallthrough both resolve correctly (`generator/method-gen.js#generatePerformThruMethod`). **General inter-paragraph GO TO outside any THRU range (an arbitrary paragraph-to-paragraph GO TO web) is not attempted** - each paragraph is still also generated as an independent top-level method for the non-THRU PERFORM case, which does not reproduce arbitrary GO TO webs between top-level paragraphs. |
| EXEC SQL -> Doobie | Compile-verified, not wired in | `generator/sql-gen.js` covers SELECT INTO/INSERT/UPDATE/DELETE/cursors-as-streams/SQLCODE/WHENEVER/indicator variables, compile-checked against real `doobie-core` from Maven Central. It is a standalone entry point (`generateSqlProgram`) - **not yet spliced into `generator/scala-generator.js`'s main generation path** (see the file's own "Wire-in TODO" header). |
| JCL / dataset lineage | Structural parse + lineage JSON only | `parser/jcl-parser.js` gives steps/DD/PROC expansion/referbacks and `buildDatasetFlow()` gives a per-dataset read/write JSON graph. **No sbt/pipeline skeleton generation and no rendered flow diagrams** (Mermaid/Graphviz/etc.) exist - only the structured JSON. |
| DCLGEN | Parsed | Column <-> host-variable binding, feeds SQL host-variable typing. |
| EXEC CICS / BMS | Honest skeleton generator only, not a behavioral converter | `generator/cics-gen.js` classifies CICS commands and, together with `parser/bms-parser.js`'s BMS map layouts, emits a Scala service-endpoint *skeleton*: request/response DTOs, abstract repository traits, LINK/XCTL call stubs. Every method whose real behavior isn't translated has a body of exactly `???` with the original `EXEC CICS ...` command in a comment - it is scaffolding for a human to fill in, never a plausible-looking fake translation. |
| Coverage honesty rule | Enforced | Every construct the generator can't translate emits a visible `??? /* TODO: ... */` marker (or, for SQL, `// TODO(sql-gen): ...`) carrying the original construct - never silent guessed output. `generator/expression-gen.js`'s `safeNodeString`/dispatch fallback is the enforcement point. |

For the staged roadmap this table is measured against (what's done, what's
explicitly OPEN, and why), see the repo root
`docs/CAPABILITY_AUDIT_AND_ROADMAP.md`. For the day-by-day narrative of how
each of these claims was built and re-verified (including the two
refutation rounds), see `docs/AUTONOMOUS_BUILD_LOG.md`.
