# Thyraa: COBOL → Scala Complete Conversion
## 10-20 Hour Sprint - Enterprise Grade

**Originally authored:** 2026-02-08 (this plan was written *before* any of the conversion engine below existed)
**Status updated:** 2026-07-11

---

## STATUS AS OF 2026-07-11

This plan was the pre-work sprint outline. Five months later, an autonomous
14-round adversarial-verification campaign actually built and hardened the
COBOL→Scala conversion engine at
`Thyraa-COBOL-main/backend/packages/cobol-to-scala/`. The headline numbers:

- **209 oracle-verified COBOL programs** (grown from a 48-program baseline)
- **879/879 automated tests passing** (0 failing, 0 skipped, 0 todo)
- **110 silent-divergence bugs found and fixed** across 14 adversarial rounds
- Verified against a **real GnuCOBOL (`cobc`) compiler oracle** — generated
  Scala's stdout diffed byte-for-byte against actual compiled COBOL output,
  not against hand-written expectations
- All 4 roadmap phases were built: (1) data layer + byte-level codecs
  (packed decimal/COMP-3, binary, zoned, EBCDIC), (2) full procedure-division
  logic (PERFORM in all forms, IF/EVALUATE, SEARCH/SEARCH ALL, SORT,
  STRING/UNSTRING/INSPECT, arithmetic with ROUNDED, MOVE incl. CORRESPONDING,
  file I/O, DECLARATIVES, multi-program CALL, SECTIONs), (3) EXEC SQL →
  Doobie codegen + JCL structural parsing (MVP; **not wired into the main
  pipeline**), (4) CICS/BMS scaffolding (classifier + honest `???` skeleton
  generator, **not a behavioral CICS converter**).

**Bottom line:** the *conversion engine itself* now far exceeds this sprint
plan's original bar, and — unlike what this plan called for — its
correctness is actually proven against a real compiler rather than merely
asserted. But this campaign was **engine-only**. Everything in this plan
that was about the surrounding "enterprise grade" product — REST API
integration, frontend wiring, auth, deployment/packaging, CI — was out of
scope for the campaign and **remains unbuilt**. See the annotations inline
below (✅ DONE / 🟡 PARTIAL / ⬜ NOT STARTED / OUT OF SCOPE) for item-by-item
detail, and:

- `docs/ADVERSARIAL_ROUNDS_REPORT.md` — full 14-round campaign report
  (methodology, round-by-round findings, impact analysis, resume plan)
- `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` — statement-by-statement audit of
  what the engine handles today and the staged roadmap for what's left
- `docs/PROGRESS_STATUS.md` — current run status and pointers to every
  other artifact (test ledger, build log, demo)

Also note: the engine did **not** converge — adversarial finding-counts
plateaued at 3–5 bugs/round (against the campaign's own 0–2 convergence
bar) — and hunting was paused at round 14 by owner decision, not because
the engine is exhaustively bug-free. Treat "verified" as "survived 14
rounds against a real-compiler oracle on 209 specific programs," not
"proven correct for all COBOL."

---

## Scope: Complete COBOL to Scala Conversion

### DATA DIVISION (Full)
- [x] Level numbers (01-49, 66, 77, 88) — ✅ DONE: oracle-verified.
- [x] PIC clauses (X, 9, A, S, V, P) — ✅ DONE: PIC-aware lexer/parser, byte-accurate lengths, oracle-verified.
- [x] COMP types (COMP, COMP-1, COMP-2, COMP-3, COMP-5) — 🟡 PARTIAL: COMP/COMP-3/COMP-5/binary have real byte-level codecs and are oracle-verified; COMP-1/COMP-2 (Float/Double) are still display-string placeholder logic, not real byte codecs (see `CAPABILITY_AUDIT_AND_ROADMAP.md` Phase 1).
- [x] OCCURS (fixed, DEPENDING ON, INDEXED BY) — 🟡 PARTIAL: fixed OCCURS + INDEXED BY + KEY are oracle-verified; OCCURS DEPENDING ON parses and generates code but `parse`/`format` are sized at a fixed maximum (not the live counter field) — every occurrence carries a visible `// TODO(ODO)` marker rather than a silent guess. Dynamic sizing remains OPEN.
- [x] REDEFINES — ✅ DONE (mostly): built as lazy read-only accessor views (not sealed traits — see Output section below) with REDEFINES-safe storage lengths, oracle-verified. One narrow shape — REDEFINES of a group-with-OCCURS by another group-with-OCCURS — is a `???`-stub view rather than a true accessor (round 13, documented known gap).
- [x] VALUE clauses — ✅ DONE.
- [x] COPY REPLACING — ✅ DONE: `parser/copybook-resolver.js` handles OF/IN, REPLACING pseudo-text & word forms, nesting, and is cycle-safe.

### PROCEDURE DIVISION (Full)
- [x] PERFORM (simple, TIMES, UNTIL, VARYING, THRU) — ✅ DONE: all forms, incl. multi-level VARYING...AFTER nesting and WITH TEST AFTER/BEFORE, oracle-verified.
- [x] IF/ELSE/END-IF — ✅ DONE.
- [x] EVALUATE/WHEN/END-EVALUATE — ✅ DONE: incl. TRUE/FALSE/ANY/ranges/NOT/arithmetic-expression subjects.
- [x] MOVE (simple, CORRESPONDING) — ✅ DONE: incl. multi-target and figurative constants.
- [x] COMPUTE — ✅ DONE: precedence, `**`, ROUNDED, and correct truncation-vs-rounding store semantics (round-3 fix) verified directly against `cobc`.
- [x] ADD/SUBTRACT/MULTIPLY/DIVIDE — ✅ DONE: incl. CORRESPONDING, INTO/GIVING/REMAINDER, ROUNDED.
- [x] STRING/UNSTRING — ✅ DONE: incl. COUNT IN.
- [x] INSPECT — ✅ DONE: TALLYING/REPLACING/CONVERTING incl. correct multi-clause REPLACING snapshot semantics (round 14 fix).
- [x] File I/O (OPEN, CLOSE, READ, WRITE, REWRITE, DELETE) — 🟡 PARTIAL: OPEN/CLOSE/READ/WRITE for LINE SEQUENTIAL files are oracle-verified. REWRITE, DELETE, START, and any non-LINE-SEQUENTIAL organization (INDEXED, RELATIVE) remain unimplemented comment-only stubs.
- [x] CALL/USING — 🟡 PARTIAL: BY REFERENCE/CONTENT/VALUE and full same-file multi-`PROGRAM-ID` interop are oracle-verified (round 7). A genuinely external or dynamic-name subprogram not defined in the same source emits a visible TODO marker rather than converting.
- [x] GO TO (converted to structured) — 🟡 PARTIAL: GO TO DEPENDING ON is oracle-verified; qualified `PERFORM x OF/IN section` (incl. THRU across sections) resolves correctly (rounds 12/14). General inter-paragraph GO TO webs outside a PERFORM-THRU range were deliberately **not attempted** — a disclosed scope boundary, not an oversight (see roadmap Phase 2).
- [x] STOP RUN/GOBACK — ✅ DONE.

### Database (DB2)
- [x] EXEC SQL blocks — 🟡 PARTIAL: `sql-parser.js` extracts and classifies EXEC SQL blocks; typed Doobie code generation exists and is compile-verified against real `doobie-core`, but is **not yet wired into the main generator's output path** (`generator/scala-generator.js`) — see `CAPABILITY_AUDIT_AND_ROADMAP.md` Phase 3.
- [x] Host variables — 🟡 PARTIAL: parsed and typed via DCLGEN binding (`parser/dclgen-parser.js`); same wire-in caveat as above.
- [x] Cursors — 🟡 PARTIAL: generated as materialized streams in the standalone Doobie generator; same wire-in caveat.
- [x] SQLCODE handling — 🟡 PARTIAL: SQLCODE 100 / WHENEVER / indicator-variables-as-`Option` handled in the standalone generator; same wire-in caveat.

### Output: Scala 3
- [x] Case classes from records — ✅ DONE: byte-accurate `recordLength`/`parse`/`format` companions.
- [x] Enums from level 88 — ✅ DONE.
- [x] Methods from paragraphs — ✅ DONE: incl. a CFG-aware PERFORM-THRU scheme (nested local `def`s so sibling fallthrough within a THRU range is reproduced).
- [x] Sealed traits from REDEFINES — 🟡 PARTIAL / built differently than planned: REDEFINES was implemented as **lazy read-only accessor views** (`lazy val` views over shared storage), not sealed traits. No `sealed trait` codegen exists in `generator/`. Functionally oracle-verified for the common case; this is a deliberate design divergence from the original plan, not a gap.
- [x] Pattern matching from EVALUATE — ✅ DONE.
- [x] For-comprehensions from PERFORM VARYING — 🟡 PARTIAL / built differently than planned: PERFORM VARYING (incl. multi-level AFTER nesting) is generated as nested `while` loops (`generator/method-gen.js#generateVaryingNest`) that precisely reproduce COBOL's real VARYING/AFTER/TEST BEFORE-AFTER algorithm, not as `for`-comprehensions. Oracle-verified; a deliberate divergence, not a gap.
- [x] Runtime library for COBOL types — ✅ DONE: packed decimal/binary/zoned/EBCDIC codecs, `CobolFmt` rounding/truncation helpers, file-I/O abstractions.

---

## Parallel Workstreams (5 Agents)

> **Status:** this section described the *planned* team structure before work started. What actually happened diverged substantially: engine work was carried out by a single autonomous 14-round adversarial-verification campaign (subagent-per-round, not persistent per-workstream agents), and Agent 4 (Integration + API) and the frontend-connection portion of the plan were **never executed** — see STATUS section at top.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARALLEL DEVELOPMENT                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AGENT 1: Parser Enhancement                                    │
│  ─────────────────────────────                                  │
│  • Full PROCEDURE DIVISION parser                               │
│  • All statement types                                          │
│  • EXEC SQL/CICS blocks                                         │
│  Hours: 4-5                                                     │
│  ✅ DONE — far exceeded scope; see STATUS section and            │
│     CAPABILITY_AUDIT_AND_ROADMAP.md                              │
│                                                                 │
│  AGENT 2: Scala Code Generator                                  │
│  ─────────────────────────────                                  │
│  • Convert all statement types to Scala                         │
│  • Control flow mapping                                         │
│  • Expression conversion                                        │
│  Hours: 4-5                                                     │
│  ✅ DONE — oracle-verified, 190 corpus/proc programs              │
│                                                                 │
│  AGENT 3: Runtime Library                                       │
│  ─────────────────────────────                                  │
│  • COBOL types (PackedDecimal, FixedString)                     │
│  • File I/O abstractions                                        │
│  • DB2/JDBC adapter                                             │
│  Hours: 3-4                                                     │
│  🟡 PARTIAL — COBOL types + file I/O done; DB2 adapter exists    │
│     as standalone Doobie codegen, not wired into the runtime     │
│     the generator actually emits                                │
│                                                                 │
│  AGENT 4: Integration + API                                     │
│  ─────────────────────────────                                  │
│  • Integrate into Thyraa backend                                │
│  • REST API endpoints                                           │
│  • Connect frontend                                              │
│  Hours: 3-4                                                     │
│  ⬜ NOT STARTED / OUT OF SCOPE — the campaign was engine-only;    │
│     no REST API wiring or frontend connection work was done      │
│                                                                 │
│  AGENT 5: Testing + Samples                                     │
│  ─────────────────────────────                                  │
│  • Create test COBOL programs                                   │
│  • Verify conversions                                           │
│  • Sample enterprise programs                                   │
│  Hours: 2-3                                                     │
│  ✅ DONE — far exceeded scope: 209 oracle-verified programs,      │
│     879/879 tests, 14 rounds of adversarial-refutation samples   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure (In Thyraa)

> **Status:** ✅ substantially matches reality. The real package lives at
> `Thyraa-COBOL-main/backend/packages/cobol-to-scala/` (~9,500 lines) with
> the same broad shape (`parser/`, `generator/`, `tests/`) sketched below,
> though the actual file set is considerably larger (e.g. separate
> `sql-parser.js`, `dclgen-parser.js`, `jcl-parser.js`, `cics-parser.js`,
> `bms-parser.js`, `copybook-resolver.js` on the parser side; `sql-gen.js`,
> `cics-gen.js`, `codecs.js`, `layout.js`, `file-io-gen.js` on the generator
> side; no persisted `runtime/*.scala` files — runtime helpers are emitted
> inline/embeddable rather than as static files). No standalone
> `db-adapter.scala` — DB2 access is the not-yet-wired Doobie generator.

```
Thyraa-COBOL-main/
└── backend/
    └── packages/
        └── cobol-to-scala/           # NEW PACKAGE
            ├── index.js              # Main entry
            ├── parser/
            │   ├── lexer.js          # Enhanced lexer
            │   ├── tokens.js         # Token definitions
            │   ├── ast.js            # AST types
            │   ├── data-division-parser.js
            │   ├── procedure-parser.js
            │   └── sql-parser.js
            ├── generator/
            │   ├── scala-generator.js
            │   ├── case-class-gen.js
            │   ├── enum-gen.js
            │   ├── method-gen.js
            │   └── expression-gen.js
            ├── runtime/
            │   ├── cobol-types.scala
            │   ├── file-io.scala
            │   └── db-adapter.scala
            └── tests/
                ├── samples/
                └── generator.test.js
```

---

## Conversion Examples

> **Status:** these were illustrative examples written before the engine
> existed. The general shapes (case classes from records, pattern matching
> from EVALUATE, etc.) hold up ✅, but exact generated output today differs
> in real, oracle-driven ways from these hand-sketched snippets — e.g. enums
> carry byte-accurate codec companions, file I/O uses the actual
> `CobolFile`/codec runtime rather than a bare `Using.resource` sketch, and
> the EXEC SQL example is generated in the **standalone, not-yet-wired**
> Doobie path (see Database section above). Treat these as directionally
> correct illustrations, not as current golden output.

### COBOL Record → Scala Case Class
```cobol
01  CUSTOMER-RECORD.
    05  CUST-ID          PIC 9(10).
    05  CUST-NAME        PIC X(50).
    05  CUST-BALANCE     PIC S9(11)V99 COMP-3.
    05  CUST-STATUS      PIC X(01).
        88  ACTIVE           VALUE "A".
        88  CLOSED           VALUE "C".
```
↓
```scala
enum CustStatus(val code: Char):
  case Active extends CustStatus('A')
  case Closed extends CustStatus('C')

case class CustomerRecord(
  custId: Long,
  custName: String,
  custBalance: BigDecimal,
  custStatus: CustStatus
)
```

### COBOL PERFORM → Scala
```cobol
PERFORM 1000-PROCESS-RECORDS
    UNTIL END-OF-FILE = "Y"
```
↓
```scala
while (endOfFile != "Y") {
  processRecords()
}
```

### COBOL EVALUATE → Scala Pattern Match
```cobol
EVALUATE TRUE
    WHEN STATUS-ACTIVE
        PERFORM 2000-ACTIVE-LOGIC
    WHEN STATUS-CLOSED
        PERFORM 3000-CLOSED-LOGIC
    WHEN OTHER
        PERFORM 9000-ERROR
END-EVALUATE
```
↓
```scala
status match {
  case CustStatus.Active => activeLogic()
  case CustStatus.Closed => closedLogic()
  case _ => errorHandler()
}
```

### COBOL File I/O → Scala
```cobol
OPEN INPUT CUSTOMER-FILE
READ CUSTOMER-FILE INTO WS-CUSTOMER
    AT END SET END-OF-FILE TO TRUE
END-READ
CLOSE CUSTOMER-FILE
```
↓
```scala
Using.resource(CobolFile.openInput("CUSTOMER-FILE")) { file =>
  file.readInto[Customer]() match {
    case Some(customer) => // process
    case None => endOfFile = true
  }
}
```

### COBOL EXEC SQL → Scala
```cobol
EXEC SQL
    SELECT CUST_NAME, BALANCE
    INTO :WS-NAME, :WS-BALANCE
    FROM CUSTOMER
    WHERE CUST_ID = :WS-ID
END-EXEC
```
↓
```scala
sql"SELECT cust_name, balance FROM customer WHERE cust_id = $wsId"
  .query[(String, BigDecimal)]
  .option
  .transact(xa)
```

---

## Start Building Now

> **Status (2026-07-11):** the building described by this plan happened —
> and went considerably further than this document's original 10-20 hour
> scope on the conversion-engine side (209 oracle-verified programs, 879
> passing tests, 14 adversarial rounds, 110 bugs fixed). What did not happen
> is the "enterprise grade" surrounding product this plan's title promised:
> no REST API integration, no frontend wiring, no auth, no deployment/CI
> packaging. See the STATUS section at the top of this document, and
> `docs/ADVERSARIAL_ROUNDS_REPORT.md`, `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`,
> and `docs/PROGRESS_STATUS.md` for the full current picture.
