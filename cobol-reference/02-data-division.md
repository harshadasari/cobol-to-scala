# COBOL Data Division Deep Dive

## Overview

The DATA DIVISION is where all data structures are defined. COBOL is unique in that data layout is **explicit** - every byte is accounted for.

---

## Level Numbers

Level numbers define hierarchy and special purposes.

### Hierarchy Levels (01-49)

```cobol
       01  CUSTOMER-RECORD.                        <- Group level (top)
           05  CUST-ID                 PIC 9(10).  <- Elementary or group
           05  CUST-NAME.                          <- Group item
               10  CUST-FIRST-NAME     PIC X(25). <- Elementary
               10  CUST-MIDDLE-INIT    PIC X(01). <- Elementary
               10  CUST-LAST-NAME      PIC X(30). <- Elementary
           05  CUST-ADDRESS.                       <- Group item
               10  CUST-STREET         PIC X(50).
               10  CUST-CITY           PIC X(30).
               10  CUST-STATE          PIC XX.
               10  CUST-ZIP.                       <- Nested group
                   15  CUST-ZIP-5      PIC 9(05).
                   15  CUST-ZIP-4      PIC 9(04).
           05  CUST-PHONE-COUNT        PIC 9(02).
           05  CUST-PHONES OCCURS 5 TIMES.
               10  CUST-PHONE-TYPE     PIC X(01).
               10  CUST-PHONE-NUM      PIC 9(10).
```

### Special Level Numbers

| Level | Purpose | Example |
|-------|---------|---------|
| **01** | Record level, top of hierarchy | `01 RECORD-NAME.` |
| **02-49** | Subordinate items | `05 FIELD-NAME PIC X.` |
| **66** | RENAMES clause (alternative grouping) | `66 ALT-NAME RENAMES A THRU C.` |
| **77** | Independent elementary item | `77 COUNTER PIC 9(5).` |
| **88** | Condition name (boolean) | `88 IS-ACTIVE VALUE "A".` |

### Level 66 - RENAMES

Creates alternative groupings of existing data.

```cobol
       01  DATE-RECORD.
           05  DATE-YEAR       PIC 9(04).
           05  DATE-MONTH      PIC 9(02).
           05  DATE-DAY        PIC 9(02).
       66  DATE-YYYYMM RENAMES DATE-YEAR THRU DATE-MONTH.
       66  DATE-FULL   RENAMES DATE-YEAR THRU DATE-DAY.
```

### Level 77 - Independent Items

```cobol
       77  WS-COUNTER          PIC 9(09) VALUE 0.
       77  WS-TEMP-STRING      PIC X(100).
       77  WS-CALC-RESULT      PIC S9(15)V99 COMP-3.
```

### Level 88 - Condition Names (Critical for Transpiler)

```cobol
       01  WS-ACCOUNT-STATUS   PIC X(01).
           88  ACCT-ACTIVE         VALUE "A".
           88  ACCT-CLOSED         VALUE "C".
           88  ACCT-SUSPENDED      VALUE "S".
           88  ACCT-PENDING        VALUE "P".
           88  ACCT-VALID          VALUE "A" "C" "S" "P".
           88  ACCT-CAN-TRANSACT   VALUE "A" "P".

       01  WS-BALANCE          PIC S9(13)V99.
           88  BALANCE-POSITIVE    VALUE 0.01 THRU 99999999999.99.
           88  BALANCE-NEGATIVE    VALUE -99999999999.99 THRU -0.01.
           88  BALANCE-ZERO        VALUE 0.

       01  WS-MONTH            PIC 9(02).
           88  QUARTER-1           VALUE 01 THRU 03.
           88  QUARTER-2           VALUE 04 THRU 06.
           88  QUARTER-3           VALUE 07 THRU 09.
           88  QUARTER-4           VALUE 10 THRU 12.
           88  VALID-MONTH         VALUE 01 THRU 12.
```

**Scala Mapping Consideration**: Level 88s become boolean methods or pattern matching.

```scala
// Possible Scala representation
def isAcctActive: Boolean = accountStatus == 'A'
def isAcctValid: Boolean = Set('A','C','S','P').contains(accountStatus)
def isQuarter1: Boolean = month >= 1 && month <= 3
```

---

## PICTURE (PIC) Clause

Defines the data type, size, and editing format.

### Basic Character Types

| Symbol | Meaning | Example | Storage |
|--------|---------|---------|---------|
| `9` | Numeric digit | `PIC 9(5)` | 5 bytes display |
| `X` | Any character | `PIC X(10)` | 10 bytes |
| `A` | Alphabetic only | `PIC A(20)` | 20 bytes |
| `S` | Sign | `PIC S9(5)` | Signed numeric |
| `V` | Implied decimal | `PIC 9(5)V99` | 7 digits, 2 decimal |
| `P` | Assumed decimal scaling | `PIC 9(3)PP` | Multiply by 100 |

### Repetition Notation

```cobol
      * These are equivalent:
       05  FIELD-A    PIC 9(5).
       05  FIELD-B    PIC 99999.

      * These are equivalent:
       05  FIELD-C    PIC X(10).
       05  FIELD-D    PIC XXXXXXXXXX.

      * Mixed notation:
       05  FIELD-E    PIC 9(5)V9(2).    *> 5 integers, 2 decimals
       05  FIELD-F    PIC S9(7)V99.     *> Signed, 7.2
```

### Edited Pictures (for Display/Reports)

```cobol
      *--- Numeric Editing ---
       05  WS-AMOUNT-EDIT    PIC $$$,$$$,$$9.99-.
       05  WS-AMOUNT-EDIT2   PIC $Z,ZZZ,ZZ9.99CR.
       05  WS-PERCENT-EDIT   PIC ZZ9.99%.
       05  WS-DATE-EDIT      PIC 9(4)/99/99.
       05  WS-SSN-EDIT       PIC 999-99-9999.
       05  WS-PHONE-EDIT     PIC (999) 999-9999.

      *--- Insertion Characters ---
       05  WS-WITH-SLASH     PIC 99/99/9999.    *> Date format
       05  WS-WITH-COMMA     PIC 999,999,999.   *> Thousands sep
       05  WS-WITH-PERIOD    PIC 9(5).9(2).     *> Decimal point
       05  WS-WITH-ZERO      PIC 9990999.       *> Insert zero
       05  WS-WITH-BLANK     PIC 999B999B9999.  *> Insert space
```

### Editing Symbols Reference

| Symbol | Meaning | Example Result |
|--------|---------|----------------|
| `Z` | Zero suppress | `ZZZ9` → "  45" |
| `*` | Check protect | `***9` → "**45" |
| `$` | Floating dollar | `$$$$9` → "  $45" |
| `+` | Floating plus | `++++9` → "  +45" |
| `-` | Floating minus | `----9` → "  -45" or "  45" |
| `CR` | Credit (if negative) | `9(5)CR` → "00045CR" or "00045  " |
| `DB` | Debit (if negative) | `9(5)DB` → "00045DB" or "00045  " |
| `.` | Decimal point | `999.99` → "045.67" |
| `,` | Thousands separator | `9,999` → "1,234" |
| `/` | Slash insertion | `99/99` → "12/31" |
| `B` | Blank insertion | `999B999` → "123 456" |
| `0` | Zero insertion | `9990999` → "1230456" |

---

## USAGE Clause (COMP Types)

Defines internal storage representation. **Critical for byte-accurate transpilation**.

### USAGE Types

```cobol
       01  WS-USAGE-EXAMPLES.
      *--- DISPLAY (default) - one byte per digit ---
           05  WS-DISPLAY       PIC 9(5) USAGE DISPLAY.
               *> 5 bytes: "12345" stored as x'F1F2F3F4F5'

      *--- COMP/COMP-4/BINARY - binary integer ---
           05  WS-COMP          PIC 9(4) COMP.
               *> 2 bytes: stored as binary halfword
           05  WS-COMP-LARGE    PIC 9(9) COMP.
               *> 4 bytes: stored as binary fullword
           05  WS-COMP-HUGE     PIC 9(18) COMP.
               *> 8 bytes: stored as binary doubleword

      *--- COMP-1 - single precision float ---
           05  WS-COMP-1        COMP-1.
               *> 4 bytes: IEEE 754 single (or HFP on mainframe)

      *--- COMP-2 - double precision float ---
           05  WS-COMP-2        COMP-2.
               *> 8 bytes: IEEE 754 double (or HFP on mainframe)

      *--- COMP-3/PACKED-DECIMAL - packed decimal ---
           05  WS-COMP-3        PIC S9(7)V99 COMP-3.
               *> 5 bytes: (7+2+1)/2 = 5 bytes packed
               *> Each byte holds 2 digits, last nibble is sign

      *--- COMP-5 - native binary (may exceed PIC) ---
           05  WS-COMP-5        PIC 9(4) COMP-5.
               *> 2 bytes: can hold 0-65535 despite PIC 9(4)
```

### COMP-3 (PACKED-DECIMAL) Storage Calculation

```
Formula: CEIL((digits + 1) / 2) bytes

PIC 9(5) COMP-3     -> (5+1)/2 = 3 bytes
PIC S9(7)V99 COMP-3 -> (9+1)/2 = 5 bytes
PIC S9(15) COMP-3   -> (15+1)/2 = 8 bytes

Sign nibble values:
C = positive
D = negative
F = unsigned positive
```

### BINARY/COMP Storage Sizes

| PIC Digits | Bytes | Scala Type |
|------------|-------|------------|
| 1-4 | 2 (halfword) | Short |
| 5-9 | 4 (fullword) | Int |
| 10-18 | 8 (doubleword) | Long |

### Transpiler Mapping Table

| COBOL USAGE | Bytes | Scala Type | Notes |
|-------------|-------|------------|-------|
| DISPLAY (numeric) | 1/digit | String or BigDecimal | EBCDIC or ASCII |
| DISPLAY (alpha) | 1/char | String | |
| COMP/BINARY | 2,4,8 | Short, Int, Long | |
| COMP-1 | 4 | Float | |
| COMP-2 | 8 | Double | |
| COMP-3 | varies | BigDecimal | Packed decimal |
| COMP-5 | 2,4,8 | Short, Int, Long | Native binary |

---

## VALUE Clause

Initializes data items.

```cobol
       01  WS-CONSTANTS.
           05  WS-COMPANY-NAME     PIC X(30) VALUE "ACME CORPORATION".
           05  WS-MAX-RETRIES      PIC 9(02) VALUE 03.
           05  WS-TAX-RATE         PIC V9(4) VALUE .0825.
           05  WS-INIT-DATE        PIC 9(08) VALUE 20240101.

      *--- Figurative Constants ---
           05  WS-BLANK-FIELD      PIC X(50) VALUE SPACES.
           05  WS-ZERO-AMOUNT      PIC 9(10) VALUE ZEROS.
           05  WS-HIGH-KEY         PIC X(10) VALUE HIGH-VALUES.
           05  WS-LOW-KEY          PIC X(10) VALUE LOW-VALUES.
           05  WS-QUOTES           PIC X(01) VALUE QUOTE.
           05  WS-NULL-PTR         PIC X(04) VALUE NULL.

      *--- ALL literal ---
           05  WS-DASHES           PIC X(80) VALUE ALL "-".
           05  WS-STARS            PIC X(50) VALUE ALL "*".
           05  WS-PATTERN          PIC X(20) VALUE ALL "AB".
```

### Figurative Constants Reference

| Constant | Value | Hex (EBCDIC) |
|----------|-------|--------------|
| SPACE/SPACES | ' ' | x'40' |
| ZERO/ZEROS/ZEROES | '0' | x'F0' |
| HIGH-VALUE/HIGH-VALUES | Maximum | x'FF' |
| LOW-VALUE/LOW-VALUES | Minimum | x'00' |
| QUOTE/QUOTES | '"' or "'" | x'7F' or x'7D' |
| NULL/NULLS | Null pointer | x'00000000' |

---

## OCCURS Clause (Arrays)

Defines repeating data structures.

### Fixed OCCURS

```cobol
       01  WS-MONTHLY-TOTALS.
           05  WS-MONTH-TOTAL  PIC S9(11)V99 COMP-3
               OCCURS 12 TIMES.

       01  WS-TRANSACTION-TABLE.
           05  WS-TRANS-ENTRY  OCCURS 100 TIMES.
               10  WS-TRANS-CODE    PIC X(02).
               10  WS-TRANS-DESC    PIC X(30).
               10  WS-TRANS-AMOUNT  PIC S9(9)V99 COMP-3.

      *--- Multi-dimensional ---
       01  WS-MATRIX.
           05  WS-ROW OCCURS 10 TIMES.
               10  WS-COLUMN OCCURS 10 TIMES.
                   15  WS-CELL      PIC S9(5)V99 COMP-3.
```

### OCCURS DEPENDING ON (Variable Length)

```cobol
       01  WS-MAX-ITEMS          PIC 9(03) VALUE 100.
       01  WS-ACTUAL-COUNT       PIC 9(03) VALUE 0.

       01  WS-VARIABLE-TABLE.
           05  WS-ITEM-COUNT     PIC 9(03).
           05  WS-ITEMS OCCURS 1 TO 100 TIMES
               DEPENDING ON WS-ITEM-COUNT.
               10  WS-ITEM-CODE  PIC X(10).
               10  WS-ITEM-QTY   PIC 9(05).
               10  WS-ITEM-PRICE PIC 9(7)V99.
```

### INDEXED BY

```cobol
       01  WS-CUSTOMER-TABLE.
           05  WS-CUST-ENTRY OCCURS 1000 TIMES
               ASCENDING KEY IS WS-CUST-ID
               INDEXED BY CUST-IDX.
               10  WS-CUST-ID       PIC 9(10).
               10  WS-CUST-NAME     PIC X(50).
               10  WS-CUST-BALANCE  PIC S9(11)V99 COMP-3.
```

### Accessing OCCURS Data

```cobol
      *--- Subscript notation (1-based) ---
           MOVE WS-MONTH-TOTAL(3) TO WS-OUTPUT
           MOVE WS-TRANS-CODE(I) TO WS-WORK
           MOVE WS-CELL(ROW-NUM, COL-NUM) TO WS-RESULT

      *--- Index notation ---
           SET CUST-IDX TO 1
           SEARCH WS-CUST-ENTRY
               AT END
                   SET NOT-FOUND TO TRUE
               WHEN WS-CUST-ID(CUST-IDX) = WS-SEARCH-ID
                   MOVE WS-CUST-NAME(CUST-IDX) TO WS-OUTPUT
           END-SEARCH
```

---

## REDEFINES Clause

Allows same memory location to be viewed as different structures.

### Basic REDEFINES

```cobol
       01  WS-DATE-NUMERIC       PIC 9(08).
       01  WS-DATE-PARTS REDEFINES WS-DATE-NUMERIC.
           05  WS-DATE-YYYY      PIC 9(04).
           05  WS-DATE-MM        PIC 9(02).
           05  WS-DATE-DD        PIC 9(02).

       01  WS-AMOUNT-DISPLAY     PIC 9(09)V99.
       01  WS-AMOUNT-COMP REDEFINES WS-AMOUNT-DISPLAY
                                 PIC S9(09)V99 COMP-3.
```

### Union-Style REDEFINES

```cobol
       01  WS-TRANSACTION-RECORD.
           05  WS-TRANS-TYPE     PIC X(02).
           05  WS-TRANS-DATA     PIC X(198).

       01  WS-DEPOSIT-TRANS REDEFINES WS-TRANSACTION-RECORD.
           05  FILLER            PIC X(02).
           05  DEP-ACCOUNT       PIC 9(10).
           05  DEP-AMOUNT        PIC S9(11)V99 COMP-3.
           05  DEP-DATE          PIC 9(08).
           05  DEP-BRANCH        PIC X(05).
           05  FILLER            PIC X(166).

       01  WS-WITHDRAWAL-TRANS REDEFINES WS-TRANSACTION-RECORD.
           05  FILLER            PIC X(02).
           05  WDR-ACCOUNT       PIC 9(10).
           05  WDR-AMOUNT        PIC S9(11)V99 COMP-3.
           05  WDR-DATE          PIC 9(08).
           05  WDR-ATM-ID        PIC X(10).
           05  FILLER            PIC X(161).
```

### REDEFINES Rules for Transpiler

1. REDEFINES must immediately follow the item being redefined
2. Cannot REDEFINES an item with OCCURS
3. Redefined item cannot be larger than original
4. Level numbers must match
5. Multiple REDEFINES of same item allowed

---

## FILLER

Anonymous placeholder that occupies space but has no name.

```cobol
       01  WS-REPORT-LINE.
           05  FILLER            PIC X(05) VALUE SPACES.
           05  RPT-ACCOUNT       PIC X(10).
           05  FILLER            PIC X(03) VALUE SPACES.
           05  RPT-NAME          PIC X(30).
           05  FILLER            PIC X(03) VALUE SPACES.
           05  RPT-BALANCE       PIC $$$,$$$,$$9.99-.
           05  FILLER            PIC X(60) VALUE SPACES.
```

**Note**: In older COBOL, all FILLERs were truly anonymous. Modern COBOL (1985+) allows named FILLER for documentation:

```cobol
       05  FILLER               PIC X(03) VALUE SPACES.
      *OR
       05                       PIC X(03) VALUE SPACES.
```

---

## SYNCHRONIZED Clause

Aligns data on word boundaries for performance.

```cobol
       01  WS-ALIGNED-RECORD.
           05  WS-CODE           PIC X(03).
           05  WS-BINARY-FIELD   PIC S9(09) COMP SYNC.
           05  WS-ANOTHER-CODE   PIC X(02).
           05  WS-DOUBLE-FIELD   COMP-2 SYNC.
```

**Transpiler Note**: SYNC may introduce slack bytes. Calculate actual record size carefully.

---

## JUSTIFIED Clause

Controls right or left justification for alphanumeric.

```cobol
       05  WS-LEFT-JUST         PIC X(20).              *> Default left
       05  WS-RIGHT-JUST        PIC X(20) JUSTIFIED RIGHT.
       05  WS-RIGHT-JUST-ALT    PIC X(20) JUST RIGHT.
```

---

## BLANK WHEN ZERO

Displays spaces instead of zeros for edited fields.

```cobol
       05  WS-AMOUNT-EDIT  PIC $$$,$$$,$$9.99 BLANK WHEN ZERO.
       *> When value is 0, displays spaces instead of "$         0.00"
```

---

## SIGN Clause

Controls sign position for signed display numerics.

```cobol
       05  WS-AMOUNT-A   PIC S9(9)V99 SIGN IS LEADING.
       05  WS-AMOUNT-B   PIC S9(9)V99 SIGN IS TRAILING.
       05  WS-AMOUNT-C   PIC S9(9)V99 SIGN IS LEADING SEPARATE.
       05  WS-AMOUNT-D   PIC S9(9)V99 SIGN IS TRAILING SEPARATE.
```

| SIGN Clause | Storage | Example (negative 123) |
|-------------|---------|------------------------|
| TRAILING (default) | Embedded in last byte | "12M" (EBCDIC) |
| LEADING | Embedded in first byte | "J23" (EBCDIC) |
| TRAILING SEPARATE | Extra byte at end | "123-" |
| LEADING SEPARATE | Extra byte at front | "-123" |

---

## Complex Enterprise Example

```cobol
       01  POLICY-MASTER-RECORD.
           05  PM-KEY.
               10  PM-COMPANY-CODE      PIC 9(03).
               10  PM-POLICY-NUMBER     PIC X(12).
           05  PM-STATUS                PIC X(01).
               88  PM-ACTIVE                VALUE "A".
               88  PM-LAPSED                VALUE "L".
               88  PM-CANCELLED             VALUE "C".
               88  PM-PAID-UP               VALUE "P".
               88  PM-VALID-STATUS          VALUE "A" "L" "C" "P".
           05  PM-POLICY-TYPE           PIC X(03).
               88  PM-TERM-LIFE             VALUE "TRM".
               88  PM-WHOLE-LIFE            VALUE "WHL".
               88  PM-UNIVERSAL             VALUE "UNI".
               88  PM-VARIABLE              VALUE "VAR".
           05  PM-EFFECTIVE-DATE.
               10  PM-EFF-YYYY          PIC 9(04).
               10  PM-EFF-MM            PIC 9(02).
               10  PM-EFF-DD            PIC 9(02).
           05  PM-EFFECTIVE-DATE-N REDEFINES PM-EFFECTIVE-DATE
                                        PIC 9(08).
           05  PM-FACE-AMOUNT           PIC S9(11)V99 COMP-3.
           05  PM-PREMIUM-AMOUNT        PIC S9(07)V99 COMP-3.
           05  PM-PREMIUM-FREQ          PIC X(01).
               88  PM-MONTHLY               VALUE "M".
               88  PM-QUARTERLY             VALUE "Q".
               88  PM-SEMI-ANNUAL           VALUE "S".
               88  PM-ANNUAL                VALUE "A".
           05  PM-INSURED-INFO.
               10  PM-INSURED-NAME      PIC X(50).
               10  PM-INSURED-DOB       PIC 9(08).
               10  PM-INSURED-SSN       PIC 9(09).
               10  PM-INSURED-GENDER    PIC X(01).
                   88  PM-MALE              VALUE "M".
                   88  PM-FEMALE            VALUE "F".
               10  PM-INSURED-SMOKER    PIC X(01).
                   88  PM-SMOKER            VALUE "Y".
                   88  PM-NON-SMOKER        VALUE "N".
           05  PM-BENEFICIARY-COUNT     PIC 9(02).
           05  PM-BENEFICIARIES OCCURS 1 TO 10 TIMES
               DEPENDING ON PM-BENEFICIARY-COUNT
               INDEXED BY PM-BEN-IDX.
               10  PM-BEN-NAME          PIC X(50).
               10  PM-BEN-RELATIONSHIP  PIC X(02).
               10  PM-BEN-PERCENTAGE    PIC 9(03)V99 COMP-3.
               10  PM-BEN-SSN           PIC 9(09).
           05  PM-RIDER-FLAGS.
               10  PM-WAIVER-PREMIUM    PIC X(01).
                   88  PM-WP-YES            VALUE "Y".
                   88  PM-WP-NO             VALUE "N".
               10  PM-ACCIDENTAL-DEATH  PIC X(01).
                   88  PM-AD-YES            VALUE "Y".
                   88  PM-AD-NO             VALUE "N".
               10  PM-CHILD-RIDER       PIC X(01).
                   88  PM-CR-YES            VALUE "Y".
                   88  PM-CR-NO             VALUE "N".
           05  PM-LAST-ACTIVITY-DATE    PIC 9(08).
           05  PM-CASH-VALUE            PIC S9(11)V99 COMP-3.
           05  PM-LOAN-AMOUNT           PIC S9(11)V99 COMP-3.
           05  FILLER                   PIC X(50).
```
