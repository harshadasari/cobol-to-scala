# Thyraa: COBOL → Scala Complete Conversion
## 10-20 Hour Sprint - Enterprise Grade

---

## Scope: Complete COBOL to Scala Conversion

### DATA DIVISION (Full)
- [x] Level numbers (01-49, 66, 77, 88)
- [x] PIC clauses (X, 9, A, S, V, P)
- [x] COMP types (COMP, COMP-1, COMP-2, COMP-3, COMP-5)
- [x] OCCURS (fixed, DEPENDING ON, INDEXED BY)
- [x] REDEFINES
- [x] VALUE clauses
- [x] COPY REPLACING

### PROCEDURE DIVISION (Full)
- [x] PERFORM (simple, TIMES, UNTIL, VARYING, THRU)
- [x] IF/ELSE/END-IF
- [x] EVALUATE/WHEN/END-EVALUATE
- [x] MOVE (simple, CORRESPONDING)
- [x] COMPUTE
- [x] ADD/SUBTRACT/MULTIPLY/DIVIDE
- [x] STRING/UNSTRING
- [x] INSPECT
- [x] File I/O (OPEN, CLOSE, READ, WRITE, REWRITE, DELETE)
- [x] CALL/USING
- [x] GO TO (converted to structured)
- [x] STOP RUN/GOBACK

### Database (DB2)
- [x] EXEC SQL blocks
- [x] Host variables
- [x] Cursors
- [x] SQLCODE handling

### Output: Scala 3
- [x] Case classes from records
- [x] Enums from level 88
- [x] Methods from paragraphs
- [x] Sealed traits from REDEFINES
- [x] Pattern matching from EVALUATE
- [x] For-comprehensions from PERFORM VARYING
- [x] Runtime library for COBOL types

---

## Parallel Workstreams (5 Agents)

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
│                                                                 │
│  AGENT 2: Scala Code Generator                                  │
│  ─────────────────────────────                                  │
│  • Convert all statement types to Scala                         │
│  • Control flow mapping                                         │
│  • Expression conversion                                        │
│  Hours: 4-5                                                     │
│                                                                 │
│  AGENT 3: Runtime Library                                       │
│  ─────────────────────────────                                  │
│  • COBOL types (PackedDecimal, FixedString)                     │
│  • File I/O abstractions                                        │
│  • DB2/JDBC adapter                                             │
│  Hours: 3-4                                                     │
│                                                                 │
│  AGENT 4: Integration + API                                     │
│  ─────────────────────────────                                  │
│  • Integrate into Thyraa backend                                │
│  • REST API endpoints                                           │
│  • Connect frontend                                             │
│  Hours: 3-4                                                     │
│                                                                 │
│  AGENT 5: Testing + Samples                                     │
│  ─────────────────────────────                                  │
│  • Create test COBOL programs                                   │
│  • Verify conversions                                           │
│  • Sample enterprise programs                                   │
│  Hours: 2-3                                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure (In Thyraa)

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
