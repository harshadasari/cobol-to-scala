# COBOL to Scala Transpiler Considerations

## Overview

This document covers the key technical challenges and strategies for building a COBOL-to-Scala transpiler.

---

## Parsing Challenges

### 1. Fixed vs Free Format

```
Traditional Fixed Format (columns matter):
1-6    : Sequence numbers (ignore)
7      : Indicator (* = comment, - = continuation, D = debug)
8-11   : Area A (divisions, sections, paragraphs, 01/77 levels)
12-72  : Area B (statements, subordinate data items)
73-80  : Identification (ignore)

Free Format (COBOL 2002+):
>>SOURCE FORMAT IS FREE
No column restrictions
```

**Strategy**: Detect format from source, normalize to AST.

### 2. Continuation Lines

```cobol
       01  WS-LONG-MESSAGE        PIC X(100) VALUE "THIS IS A V
      -    "ERY LONG MESSAGE THAT CONTINUES ACROSS MULTIPLE LIN
      -    "ES IN THE SOURCE CODE".
```

**Strategy**: Pre-process to join continuation lines before parsing.

### 3. Statement Termination

```cobol
      *--- Old style (period terminates all) ---
           IF A = B
               MOVE C TO D
               PERFORM 1000-PROCESS.

      *--- Modern style (explicit scope terminators) ---
           IF A = B
               MOVE C TO D
               PERFORM 1000-PROCESS
           END-IF.
```

**Strategy**: Track scope via both periods and END-* terminators.

### 4. COPY and REPLACING

```cobol
       COPY LAYOUT REPLACING ==:PREFIX:== BY ==WS-==.
```

**Strategy**:
1. Resolve copybook path
2. Apply text substitution (not AST-level)
3. Parse the result
4. Track original source locations for error messages

---

## Data Type Mapping

### Numeric Types

| COBOL | Bytes | Scala Recommended | Notes |
|-------|-------|-------------------|-------|
| `PIC 9(n)` n<=4 DISPLAY | n | `Int` or `String` | Display format, 1 byte/digit |
| `PIC 9(n)` n<=9 DISPLAY | n | `Int` or `String` | |
| `PIC 9(n)` n<=18 DISPLAY | n | `Long` or `String` | |
| `PIC 9(n)V9(m)` DISPLAY | n+m | `BigDecimal` | Implied decimal |
| `PIC S9(n) COMP` | 2,4,8 | `Short`, `Int`, `Long` | Binary, signed |
| `PIC 9(n) COMP` | 2,4,8 | `Int`, `Long` | Binary, unsigned (still signed in JVM) |
| `PIC S9(n)V9(m) COMP-3` | (n+m+1)/2 | `BigDecimal` | Packed decimal |
| `COMP-1` | 4 | `Float` | Single precision |
| `COMP-2` | 8 | `Double` | Double precision |

### Decimal Precision Handling

```scala
// COBOL: PIC S9(11)V99 COMP-3
// Must preserve exact decimal semantics

case class CobolDecimal(
  value: BigDecimal,
  intDigits: Int,    // 11
  decDigits: Int,    // 2
  signed: Boolean    // true
) {
  def cobolValue: BigDecimal =
    value.setScale(decDigits, RoundingMode.DOWN)
}
```

### Alphanumeric Types

| COBOL | Scala | Notes |
|-------|-------|-------|
| `PIC X(n)` | `String` | Right-padded with spaces |
| `PIC A(n)` | `String` | Alphabetic only |
| `PIC 9(n)` (as display) | `String` | Numeric characters |

**Important**: COBOL strings are fixed-length, space-padded. Consider:

```scala
case class FixedString(value: String, length: Int) {
  def cobolValue: String = value.padTo(length, ' ').take(length)
}
```

---

## Record/Group Structure Mapping

### Option 1: Case Classes (Recommended)

```cobol
       01  CUSTOMER-RECORD.
           05  CUST-ID             PIC 9(10).
           05  CUST-NAME.
               10  CUST-FIRST      PIC X(20).
               10  CUST-LAST       PIC X(30).
           05  CUST-BALANCE        PIC S9(11)V99 COMP-3.
```

```scala
case class CustomerRecord(
  custId: Long,
  custName: CustName,
  custBalance: BigDecimal
)

case class CustName(
  custFirst: String,
  custLast: String
)
```

### Option 2: Flat Structure with Lenses

```scala
case class CustomerRecord(
  custId: Long,
  custFirst: String,
  custLast: String,
  custBalance: BigDecimal
) {
  def custName: String = s"$custFirst$custLast"
}
```

### REDEFINES Handling

```cobol
       01  WS-DATE             PIC 9(08).
       01  WS-DATE-PARTS REDEFINES WS-DATE.
           05  WS-YEAR         PIC 9(04).
           05  WS-MONTH        PIC 9(02).
           05  WS-DAY          PIC 9(02).
```

**Strategy Options**:

1. **Union Type / Sealed Trait**:
```scala
sealed trait DateView
case class DateNumeric(value: Int) extends DateView
case class DateParts(year: Int, month: Int, day: Int) extends DateView
```

2. **Byte Array with Views**:
```scala
class DateField(private val bytes: Array[Byte]) {
  def asNumeric: Int = new String(bytes).toInt
  def year: Int = new String(bytes, 0, 4).toInt
  def month: Int = new String(bytes, 4, 2).toInt
  def day: Int = new String(bytes, 6, 2).toInt
}
```

3. **Computed Properties**:
```scala
case class DateField(value: Int) {
  def year: Int = value / 10000
  def month: Int = (value / 100) % 100
  def day: Int = value % 100
}
```

---

## Level 88 Condition Names

```cobol
       01  WS-STATUS           PIC X(01).
           88  STATUS-ACTIVE       VALUE "A".
           88  STATUS-INACTIVE     VALUE "I".
           88  STATUS-CLOSED       VALUE "C".
           88  STATUS-VALID        VALUE "A" "I" "C".
```

### Option 1: Boolean Methods

```scala
case class StatusField(value: Char) {
  def isStatusActive: Boolean = value == 'A'
  def isStatusInactive: Boolean = value == 'I'
  def isStatusClosed: Boolean = value == 'C'
  def isStatusValid: Boolean = Set('A', 'I', 'C').contains(value)

  def setStatusActive(): StatusField = copy(value = 'A')
}
```

### Option 2: Enum with Mapping

```scala
sealed trait Status
object Status {
  case object Active extends Status
  case object Inactive extends Status
  case object Closed extends Status

  def fromChar(c: Char): Option[Status] = c match {
    case 'A' => Some(Active)
    case 'I' => Some(Inactive)
    case 'C' => Some(Closed)
    case _   => None
  }
}
```

---

## PERFORM Statement Mapping

### Simple PERFORM

```cobol
           PERFORM 1000-PROCESS
```
```scala
process1000()
```

### PERFORM TIMES

```cobol
           PERFORM 1000-PROCESS 10 TIMES
```
```scala
(1 to 10).foreach(_ => process1000())
```

### PERFORM UNTIL

```cobol
           PERFORM 1000-PROCESS UNTIL WS-EOF = "Y"
```
```scala
while (wsEof != "Y") {
  process1000()
}
```

### PERFORM WITH TEST AFTER

```cobol
           PERFORM 1000-PROCESS
               WITH TEST AFTER
               UNTIL WS-DONE = "Y"
```
```scala
do {
  process1000()
} while (wsDone != "Y")
```

### PERFORM VARYING

```cobol
           PERFORM 1000-PROCESS
               VARYING WS-I FROM 1 BY 1
               UNTIL WS-I > 100
```
```scala
for (wsI <- 1 to 100) {
  process1000(wsI)
}
```

### Nested PERFORM VARYING

```cobol
           PERFORM 1000-PROCESS
               VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 10
               AFTER WS-J FROM 1 BY 1 UNTIL WS-J > 10
```
```scala
for {
  wsI <- 1 to 10
  wsJ <- 1 to 10
} {
  process1000(wsI, wsJ)
}
```

### PERFORM THRU

```cobol
           PERFORM 1000-START THRU 1000-END
```

**Challenge**: THRU implies executing all paragraphs in between. Options:

1. Inline all paragraphs into single method
2. Create wrapper method calling sequence
3. Use labeled blocks if control flow is simple

---

## GO TO Handling

```cobol
           IF WS-ERROR = "Y"
               GO TO 9999-ABORT
           END-IF
```

**Strategies**:

1. **Exception-based**:
```scala
if (wsError == "Y") throw AbortException()
```

2. **Early return with Either**:
```scala
if (wsError == "Y") return Left(AbortError)
```

3. **State machine**:
```scala
var nextParagraph: String = "2000-NEXT"
if (wsError == "Y") nextParagraph = "9999-ABORT"
```

4. **Control flow analysis**: If GO TO only jumps forward, restructure as nested conditionals.

---

## File I/O Mapping

### Sequential File Reading

```cobol
           OPEN INPUT TRANS-FILE
           READ TRANS-FILE
               AT END SET END-OF-FILE TO TRUE
           END-READ
           CLOSE TRANS-FILE
```

```scala
// Option 1: Iterator-based
val records = Source.fromFile("trans.dat")
  .getLines()
  .map(parseTransRecord)

// Option 2: Stream-based
def readRecords(path: Path): fs2.Stream[IO, TransRecord] =
  fs2.io.file.Files[IO]
    .readAll(path)
    .through(parseRecords)
```

### Indexed File (VSAM)

```scala
// Indexed files need a key-value store abstraction
trait IndexedFile[K, V] {
  def read(key: K): Option[V]
  def write(key: K, value: V): Unit
  def delete(key: K): Unit
  def startBrowse(fromKey: K): Iterator[V]
}

// Implementation could use:
// - Database table
// - In-memory TreeMap
// - LevelDB/RocksDB
```

### File Status Mapping

```scala
sealed trait FileStatus
case object Success extends FileStatus
case object EndOfFile extends FileStatus
case object RecordNotFound extends FileStatus
case class IOError(code: String) extends FileStatus

def readRecord(): Either[FileStatus, Record] = ...
```

---

## DB2/SQL Mapping

### Embedded SQL

```cobol
           EXEC SQL
               SELECT CUST_NAME, BALANCE
               INTO :WS-NAME, :WS-BALANCE
               FROM CUSTOMER
               WHERE CUST_ID = :WS-ID
           END-EXEC
```

```scala
// Option 1: JDBC
val stmt = conn.prepareStatement(
  "SELECT CUST_NAME, BALANCE FROM CUSTOMER WHERE CUST_ID = ?"
)
stmt.setLong(1, wsId)
val rs = stmt.executeQuery()
if (rs.next()) {
  wsName = rs.getString(1)
  wsBalance = rs.getBigDecimal(2)
}

// Option 2: Doobie
sql"SELECT cust_name, balance FROM customer WHERE cust_id = $wsId"
  .query[(String, BigDecimal)]
  .option
  .transact(xa)

// Option 3: Slick
customers.filter(_.id === wsId).result.headOption
```

### SQLCODE Handling

```scala
// Map SQLCODE to sealed trait
sealed trait SqlResult[+A]
case class SqlSuccess[A](value: A) extends SqlResult[A]
case object SqlNotFound extends SqlResult[Nothing]
case class SqlError(code: Int, message: String) extends SqlResult[Nothing]
```

### Cursor Mapping

```cobol
           EXEC SQL DECLARE C1 CURSOR FOR
               SELECT * FROM CUSTOMER
           END-EXEC
           EXEC SQL OPEN C1 END-EXEC
           EXEC SQL FETCH C1 INTO :WS-REC END-EXEC
           EXEC SQL CLOSE C1 END-EXEC
```

```scala
// Cursors map naturally to iterators/streams
def fetchCustomers(): Iterator[Customer] = {
  val stmt = conn.prepareStatement("SELECT * FROM CUSTOMER")
  val rs = stmt.executeQuery()
  new Iterator[Customer] {
    def hasNext: Boolean = rs.next()
    def next(): Customer = parseCustomer(rs)
  }
}

// Or with fs2/ZIO streams for resource safety
def fetchCustomers: Stream[IO, Customer] =
  Stream.resource(openConnection).flatMap { conn =>
    Stream.fromIterator(executeQuery(conn))
  }
```

---

## CICS Mapping

### Pseudo-Conversational to Stateless

```cobol
      * CICS programs store state in COMMAREA between interactions
       01  DFHCOMMAREA.
           05  COMM-STATE    PIC X.
           05  COMM-DATA     PIC X(100).
```

```scala
// Map to session/state management
case class SessionState(
  state: String,
  data: Map[String, String]
)

// REST endpoint example
def handleRequest(
  request: Request,
  session: SessionState
): (Response, SessionState) = {
  session.state match {
    case "INITIAL" => handleInitial(request)
    case "ACCOUNT" => handleAccount(request, session)
    case _ => (ErrorResponse("Invalid state"), session)
  }
}
```

### CICS Commands

| CICS | Scala/HTTP Equivalent |
|------|----------------------|
| SEND MAP | Return HTML/JSON response |
| RECEIVE MAP | Parse request body/form |
| READ FILE | Database/cache read |
| WRITE FILE | Database/cache write |
| LINK PROGRAM | Method/service call |
| XCTL | Redirect/forward |
| RETURN TRANSID | Return with session |

---

## State Management

COBOL programs have mutable state in WORKING-STORAGE. Options:

### Option 1: Mutable Variables (Direct Translation)

```scala
object Program {
  var wsCounter: Int = 0
  var wsBalance: BigDecimal = BigDecimal(0)
  var wsEofFlag: Boolean = false

  def process(): Unit = {
    // mutate state directly
  }
}
```

**Pros**: Direct mapping, easy to verify correctness
**Cons**: Not idiomatic Scala, hard to test, not thread-safe

### Option 2: State Monad

```scala
case class ProgramState(
  counter: Int,
  balance: BigDecimal,
  eofFlag: Boolean
)

type ProgramOp[A] = State[ProgramState, A]

def process: ProgramOp[Unit] = for {
  _ <- modify[ProgramState](s => s.copy(counter = s.counter + 1))
  balance <- gets[ProgramState, BigDecimal](_.balance)
  // ...
} yield ()
```

**Pros**: Functional, testable, composable
**Cons**: Significant restructuring, learning curve

### Option 3: Class with Private Mutable State

```scala
class CobolProgram {
  private var wsCounter: Int = 0
  private var wsBalance: BigDecimal = BigDecimal(0)

  def run(input: Input): Output = {
    wsCounter = 0
    wsBalance = BigDecimal(0)
    // process...
    Output(wsCounter, wsBalance)
  }
}
```

**Pros**: Encapsulated mutation, thread-safe per instance
**Cons**: Still mutable internally

---

## MOVE Statement Semantics

COBOL MOVE has complex semantics based on types:

```scala
object CobolMove {
  // Numeric to numeric: with possible truncation/padding
  def moveNumeric(
    source: BigDecimal,
    targetPic: PicClause
  ): BigDecimal = {
    source.setScale(targetPic.decimalPlaces, RoundingMode.DOWN)
  }

  // Alpha to alpha: left-justified, space-padded
  def moveAlpha(source: String, targetLength: Int): String = {
    source.take(targetLength).padTo(targetLength, ' ')
  }

  // Numeric to alpha: right-justified
  def moveNumericToAlpha(
    source: BigDecimal,
    targetLength: Int
  ): String = {
    source.toString.reverse.padTo(targetLength, ' ').reverse
  }
}
```

---

## Reference Modification

```cobol
           MOVE WS-STRING(5:10) TO WS-SUBSTR
```

```scala
// Direct mapping (1-based to 0-based indexing)
val wsSubstr = wsString.substring(4, 14)  // positions 5-14

// Or with safety
def refMod(s: String, start: Int, length: Int): String = {
  val zeroStart = start - 1  // Convert to 0-based
  s.slice(zeroStart, zeroStart + length).padTo(length, ' ')
}
```

---

## Intrinsic Functions

| COBOL | Scala |
|-------|-------|
| `FUNCTION UPPER-CASE(x)` | `x.toUpperCase` |
| `FUNCTION LOWER-CASE(x)` | `x.toLowerCase` |
| `FUNCTION LENGTH(x)` | `x.length` |
| `FUNCTION TRIM(x)` | `x.trim` |
| `FUNCTION REVERSE(x)` | `x.reverse` |
| `FUNCTION ABS(x)` | `x.abs` |
| `FUNCTION MAX(a b c)` | `Seq(a, b, c).max` |
| `FUNCTION MIN(a b c)` | `Seq(a, b, c).min` |
| `FUNCTION MOD(a b)` | `a % b` |
| `FUNCTION INTEGER(x)` | `x.toInt` |
| `FUNCTION CURRENT-DATE` | `LocalDateTime.now()` |

---

## Testing Strategy

### 1. Record Comparison Tests

```scala
class CobolTranspilerTest extends AnyFunSuite {
  test("balance calculation matches COBOL") {
    // Run both COBOL and Scala with same input
    val cobolResult = runCobolProgram("BALANCE", input)
    val scalaResult = BalanceProgram.run(input)

    assert(scalaResult.balance == cobolResult.balance)
  }
}
```

### 2. Golden File Testing

```scala
test("output matches expected") {
  val output = program.run(testInput)
  val expected = loadGoldenFile("expected-output.txt")
  assert(output == expected)
}
```

### 3. Byte-Level Verification

For files with binary data (COMP-3), verify byte-level compatibility:

```scala
test("COMP-3 encoding matches") {
  val cobolBytes = readCobolOutput("output.dat")
  val scalaBytes = program.run(input).toBytes
  assert(cobolBytes.sameElements(scalaBytes))
}
```

---

## Transpilation Phases

```
1. LEXICAL ANALYSIS
   - Handle column positions (fixed format)
   - Join continuation lines
   - Identify tokens

2. PREPROCESSING
   - Resolve COPY statements
   - Apply REPLACING
   - Handle conditional compilation

3. PARSING
   - Build AST for all four divisions
   - Validate syntax

4. SEMANTIC ANALYSIS
   - Resolve data references
   - Type checking
   - Build symbol table

5. TRANSFORMATION
   - Convert control structures
   - Map data types
   - Handle special constructs (REDEFINES, OCCURS)

6. CODE GENERATION
   - Generate Scala source
   - Format output
   - Generate imports

7. POST-PROCESSING
   - Add runtime library references
   - Generate build files
```
