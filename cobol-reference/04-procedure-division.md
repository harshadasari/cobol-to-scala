# COBOL Procedure Division Reference

## Overview

The PROCEDURE DIVISION contains all executable code. Understanding its structure and statements is critical for transpilation.

---

## Structure

### Sections and Paragraphs

```cobol
       PROCEDURE DIVISION.

      *--- Sections contain paragraphs ---
       1000-INITIALIZE SECTION.
       1000-INIT.
           statement-1
           statement-2.
       1000-EXIT.
           EXIT.

      *--- Paragraphs can exist without sections ---
       2000-PROCESS.
           statement-1
           statement-2.

       2100-PROCESS-RECORD.
           statement-1.
```

### PROCEDURE DIVISION Header Variants

```cobol
      *--- Simple ---
       PROCEDURE DIVISION.

      *--- With parameters (called program) ---
       PROCEDURE DIVISION USING WS-PARM-1 WS-PARM-2.

      *--- With return value ---
       PROCEDURE DIVISION USING WS-INPUT
                          RETURNING WS-OUTPUT.

      *--- With BY REFERENCE/VALUE/CONTENT ---
       PROCEDURE DIVISION USING BY REFERENCE LK-RECORD
                                BY VALUE LK-FLAG
                                BY CONTENT LK-CONST.
```

---

## PERFORM Statement (Critical)

PERFORM is COBOL's primary control flow mechanism.

### Simple PERFORM

```cobol
           PERFORM 1000-INITIALIZE
           PERFORM 2000-PROCESS
           PERFORM 9000-TERMINATE
```

### PERFORM TIMES

```cobol
           PERFORM 2000-PROCESS 10 TIMES

           PERFORM 2000-PROCESS WS-LOOP-COUNT TIMES
```

### PERFORM UNTIL

```cobol
      *--- Test before (default) ---
           PERFORM 2000-PROCESS UNTIL END-OF-FILE

      *--- Test after (do-while equivalent) ---
           PERFORM 2000-PROCESS
               WITH TEST AFTER
               UNTIL WS-RESPONSE = "N"

      *--- Complex condition ---
           PERFORM 2000-PROCESS
               UNTIL END-OF-FILE
               OR WS-ERROR-COUNT > 100
```

### PERFORM VARYING (For Loop)

```cobol
      *--- Simple varying ---
           PERFORM 2000-PROCESS
               VARYING WS-INDEX FROM 1 BY 1
               UNTIL WS-INDEX > 100

      *--- Nested varying ---
           PERFORM 2500-PROCESS-CELL
               VARYING WS-ROW FROM 1 BY 1 UNTIL WS-ROW > 10
               AFTER WS-COL FROM 1 BY 1 UNTIL WS-COL > 10

      *--- With TEST AFTER ---
           PERFORM 2000-PROCESS
               WITH TEST AFTER
               VARYING WS-I FROM 0 BY 1
               UNTIL WS-I >= WS-MAX
```

### PERFORM THRU

```cobol
           PERFORM 1000-INIT THRU 1000-EXIT

           PERFORM 2000-PROCESS THRU 2999-PROCESS-EXIT
               UNTIL END-OF-FILE
```

### Inline PERFORM

```cobol
           PERFORM UNTIL END-OF-FILE
               READ INPUT-FILE
                   AT END
                       SET END-OF-FILE TO TRUE
                   NOT AT END
                       ADD 1 TO WS-RECORD-COUNT
                       PERFORM 2000-PROCESS-RECORD
               END-READ
           END-PERFORM

           PERFORM VARYING WS-I FROM 1 BY 1
               UNTIL WS-I > WS-TABLE-SIZE
               IF WS-TABLE-KEY(WS-I) = WS-SEARCH-KEY
                   MOVE WS-TABLE-DATA(WS-I) TO WS-RESULT
                   SET FOUND TO TRUE
               END-IF
           END-PERFORM
```

### Transpiler Mapping for PERFORM

| COBOL PERFORM | Scala Equivalent |
|---------------|------------------|
| PERFORM para | `para()` (method call) |
| PERFORM para TIMES n | `(1 to n).foreach(_ => para())` |
| PERFORM para UNTIL cond | `while(!cond) { para() }` |
| PERFORM para WITH TEST AFTER UNTIL cond | `do { para() } while(!cond)` |
| PERFORM VARYING i FROM a BY b UNTIL i > c | `for(i <- a to c by b) {...}` |
| Inline PERFORM | Block or local method |

---

## EVALUATE Statement (Switch/Case)

### Basic EVALUATE

```cobol
           EVALUATE WS-TRANSACTION-TYPE
               WHEN "DP"
                   PERFORM 2100-DEPOSIT
               WHEN "WD"
                   PERFORM 2200-WITHDRAWAL
               WHEN "XF"
                   PERFORM 2300-TRANSFER
               WHEN "PY"
                   PERFORM 2400-PAYMENT
               WHEN OTHER
                   PERFORM 2900-INVALID-TYPE
           END-EVALUATE
```

### EVALUATE TRUE (Multiple Conditions)

```cobol
           EVALUATE TRUE
               WHEN WS-BALANCE > 100000
                   MOVE "PLATINUM" TO WS-TIER
               WHEN WS-BALANCE > 50000
                   MOVE "GOLD" TO WS-TIER
               WHEN WS-BALANCE > 10000
                   MOVE "SILVER" TO WS-TIER
               WHEN WS-BALANCE > 0
                   MOVE "BRONZE" TO WS-TIER
               WHEN OTHER
                   MOVE "BASIC" TO WS-TIER
           END-EVALUATE
```

### EVALUATE with Multiple Subjects

```cobol
           EVALUATE WS-FILE-STATUS ALSO WS-OPERATION
               WHEN "00" ALSO "READ"
                   CONTINUE
               WHEN "00" ALSO "WRITE"
                   ADD 1 TO WS-WRITE-COUNT
               WHEN "10" ALSO ANY
                   SET END-OF-FILE TO TRUE
               WHEN "23" ALSO "READ"
                   SET RECORD-NOT-FOUND TO TRUE
               WHEN OTHER
                   PERFORM 9100-FILE-ERROR
           END-EVALUATE
```

### EVALUATE with THRU

```cobol
           EVALUATE WS-SCORE
               WHEN 90 THRU 100
                   MOVE "A" TO WS-GRADE
               WHEN 80 THRU 89
                   MOVE "B" TO WS-GRADE
               WHEN 70 THRU 79
                   MOVE "C" TO WS-GRADE
               WHEN 60 THRU 69
                   MOVE "D" TO WS-GRADE
               WHEN OTHER
                   MOVE "F" TO WS-GRADE
           END-EVALUATE
```

### Complex EVALUATE

```cobol
           EVALUATE TRUE ALSO TRUE
               WHEN WS-ACCOUNT-TYPE = "CHK"
               ALSO WS-BALANCE < 0
                   PERFORM 3100-APPLY-OVERDRAFT-FEE

               WHEN WS-ACCOUNT-TYPE = "SAV"
               ALSO WS-BALANCE < WS-MIN-BALANCE
                   PERFORM 3200-APPLY-LOW-BALANCE-FEE

               WHEN WS-ACCOUNT-TYPE = "CD"
               ALSO WS-EARLY-WITHDRAWAL = "Y"
                   PERFORM 3300-APPLY-EARLY-WD-PENALTY

               WHEN OTHER
                   CONTINUE
           END-EVALUATE
```

---

## IF Statement

### Basic IF

```cobol
           IF WS-AMOUNT > 0
               PERFORM 2100-CREDIT-ACCOUNT
           END-IF

           IF WS-STATUS = "A"
               PERFORM 2000-PROCESS-ACTIVE
           ELSE
               PERFORM 2500-PROCESS-INACTIVE
           END-IF
```

### Nested IF

```cobol
           IF WS-CUSTOMER-TYPE = "RETAIL"
               IF WS-ACCOUNT-AGE > 5
                   IF WS-BALANCE > 50000
                       MOVE "VIP" TO WS-SERVICE-LEVEL
                   ELSE
                       MOVE "STANDARD" TO WS-SERVICE-LEVEL
                   END-IF
               ELSE
                   MOVE "NEW" TO WS-SERVICE-LEVEL
               END-IF
           ELSE
               MOVE "COMMERCIAL" TO WS-SERVICE-LEVEL
           END-IF
```

### IF with Complex Conditions

```cobol
           IF (WS-TRANS-TYPE = "DP" OR "CR")
               AND WS-AMOUNT > 0
               AND WS-STATUS = "A"
               PERFORM 2100-PROCESS-CREDIT
           END-IF

           IF WS-BALANCE NOT < 0
               AND (WS-HOLD-FLAG = "N"
                    OR WS-OVERRIDE = "Y")
               PERFORM 2200-ALLOW-TRANSACTION
           END-IF
```

### IF with 88-Level Conditions

```cobol
      *--- Using condition names ---
           IF ACCT-ACTIVE
               IF BALANCE-POSITIVE
                   PERFORM 2100-PROCESS-NORMAL
               ELSE IF BALANCE-ZERO
                   PERFORM 2200-PROCESS-ZERO-BAL
               ELSE
                   PERFORM 2300-PROCESS-OVERDRAWN
               END-IF
           END-IF
```

### Condition Operators

| COBOL | Meaning | Scala |
|-------|---------|-------|
| `=` or `EQUAL TO` | Equals | `==` |
| `>` or `GREATER THAN` | Greater | `>` |
| `<` or `LESS THAN` | Less | `<` |
| `>=` or `NOT <` | Greater or equal | `>=` |
| `<=` or `NOT >` | Less or equal | `<=` |
| `NOT =` | Not equal | `!=` |
| `AND` | Logical and | `&&` |
| `OR` | Logical or | `||` |
| `NOT` | Logical not | `!` |

### Class Conditions

```cobol
           IF WS-FIELD IS NUMERIC
               PERFORM 2100-PROCESS-NUMBER
           END-IF

           IF WS-NAME IS ALPHABETIC
               PERFORM 2200-PROCESS-NAME
           END-IF

           IF WS-FIELD IS ALPHABETIC-LOWER
               PERFORM 2300-PROCESS
           END-IF

           IF WS-FIELD IS ALPHABETIC-UPPER
               PERFORM 2400-PROCESS
           END-IF
```

### Sign Conditions

```cobol
           IF WS-AMOUNT IS POSITIVE
               PERFORM 2100-CREDIT
           ELSE IF WS-AMOUNT IS NEGATIVE
               PERFORM 2200-DEBIT
           ELSE
               DISPLAY "ZERO AMOUNT"
           END-IF
```

---

## MOVE Statement

### Simple MOVE

```cobol
           MOVE WS-INPUT TO WS-OUTPUT
           MOVE "ACTIVE" TO WS-STATUS
           MOVE 0 TO WS-COUNTER
           MOVE SPACES TO WS-BUFFER
           MOVE ZEROS TO WS-AMOUNT
           MOVE HIGH-VALUES TO WS-END-KEY
```

### MOVE CORRESPONDING

```cobol
           MOVE CORRESPONDING INPUT-RECORD TO OUTPUT-RECORD

      *--- Moves fields with matching names ---
      *    INPUT-RECORD.CUSTOMER-ID -> OUTPUT-RECORD.CUSTOMER-ID
      *    INPUT-RECORD.AMOUNT -> OUTPUT-RECORD.AMOUNT
      *    (only if both exist with same name)
```

### MOVE to Multiple Targets

```cobol
           MOVE 0 TO WS-COUNT-1
                     WS-COUNT-2
                     WS-COUNT-3
                     WS-TOTAL

           MOVE SPACES TO WS-LINE-1
                          WS-LINE-2
                          WS-LINE-3
```

### MOVE with Implicit Conversion

```cobol
      *--- Numeric to numeric (different formats) ---
           MOVE WS-COMP3-AMT TO WS-DISPLAY-AMT

      *--- Numeric to edited ---
           MOVE WS-BALANCE TO WS-BALANCE-EDIT

      *--- Alpha to alpha (padding/truncation) ---
           MOVE WS-SHORT-NAME TO WS-LONG-NAME
```

### MOVE Reference Modification

```cobol
           MOVE WS-FULL-STRING(1:10) TO WS-FIRST-TEN
           MOVE WS-FULL-STRING(11:5) TO WS-MIDDLE-FIVE
           MOVE WS-DATE(1:4) TO WS-YEAR
           MOVE WS-DATE(5:2) TO WS-MONTH
           MOVE WS-DATE(7:2) TO WS-DAY
```

---

## COMPUTE Statement

### Basic COMPUTE

```cobol
           COMPUTE WS-RESULT = WS-A + WS-B

           COMPUTE WS-TOTAL = WS-PRICE * WS-QUANTITY

           COMPUTE WS-AVERAGE = WS-SUM / WS-COUNT

           COMPUTE WS-POWER = WS-BASE ** WS-EXPONENT
```

### Complex Expressions

```cobol
           COMPUTE WS-NET-PAY =
               WS-GROSS-PAY
               - WS-FED-TAX
               - WS-STATE-TAX
               - WS-FICA
               - WS-INSURANCE
               + WS-REIMBURSEMENT

           COMPUTE WS-COMPOUND =
               WS-PRINCIPAL *
               ((1 + WS-RATE / WS-PERIODS) ** (WS-PERIODS * WS-YEARS))

           COMPUTE WS-DISCOUNT-PRICE ROUNDED =
               WS-ORIGINAL-PRICE * (1 - WS-DISCOUNT-RATE)
```

### COMPUTE with ROUNDED and ON SIZE ERROR

```cobol
           COMPUTE WS-RESULT ROUNDED =
               WS-DIVIDEND / WS-DIVISOR
               ON SIZE ERROR
                   MOVE 999999999 TO WS-RESULT
                   SET OVERFLOW-ERROR TO TRUE
               NOT ON SIZE ERROR
                   CONTINUE
           END-COMPUTE
```

### Arithmetic Operators

| Operator | Meaning |
|----------|---------|
| `+` | Addition |
| `-` | Subtraction |
| `*` | Multiplication |
| `/` | Division |
| `**` | Exponentiation |

### Alternative Arithmetic Verbs

```cobol
           ADD WS-A TO WS-B              *> WS-B = WS-B + WS-A
           ADD WS-A WS-B GIVING WS-C     *> WS-C = WS-A + WS-B

           SUBTRACT WS-A FROM WS-B       *> WS-B = WS-B - WS-A
           SUBTRACT WS-A FROM WS-B
               GIVING WS-C               *> WS-C = WS-B - WS-A

           MULTIPLY WS-A BY WS-B         *> WS-B = WS-A * WS-B
           MULTIPLY WS-A BY WS-B
               GIVING WS-C               *> WS-C = WS-A * WS-B

           DIVIDE WS-A INTO WS-B         *> WS-B = WS-B / WS-A
           DIVIDE WS-A INTO WS-B
               GIVING WS-C               *> WS-C = WS-B / WS-A
           DIVIDE WS-A INTO WS-B
               GIVING WS-C
               REMAINDER WS-R            *> Also get remainder
```

---

## STRING Statement

Concatenates strings.

```cobol
           STRING
               WS-FIRST-NAME DELIMITED BY SPACE
               " " DELIMITED BY SIZE
               WS-MIDDLE-INIT DELIMITED BY SPACE
               ". " DELIMITED BY SIZE
               WS-LAST-NAME DELIMITED BY SPACE
               INTO WS-FULL-NAME
               WITH POINTER WS-PTR
               ON OVERFLOW
                   SET NAME-OVERFLOW TO TRUE
           END-STRING
```

### STRING Examples

```cobol
      *--- Build address line ---
           MOVE 1 TO WS-PTR
           STRING
               WS-STREET DELIMITED BY "  "
               ", " DELIMITED BY SIZE
               WS-CITY DELIMITED BY "  "
               ", " DELIMITED BY SIZE
               WS-STATE DELIMITED BY SIZE
               " " DELIMITED BY SIZE
               WS-ZIP DELIMITED BY SIZE
               INTO WS-ADDRESS-LINE
               WITH POINTER WS-PTR
           END-STRING

      *--- Build error message ---
           STRING
               "ERROR: " DELIMITED BY SIZE
               WS-ERROR-CODE DELIMITED BY SIZE
               " - " DELIMITED BY SIZE
               WS-ERROR-DESC DELIMITED BY "  "
               " AT " DELIMITED BY SIZE
               WS-TIMESTAMP DELIMITED BY SIZE
               INTO WS-ERROR-MESSAGE
           END-STRING
```

---

## UNSTRING Statement

Parses/splits strings.

```cobol
           UNSTRING WS-INPUT-LINE
               DELIMITED BY "," OR SPACES
               INTO WS-FIELD-1
                    WS-FIELD-2
                    WS-FIELD-3
                    WS-FIELD-4
               WITH POINTER WS-PTR
               TALLYING IN WS-FIELD-COUNT
               ON OVERFLOW
                   SET PARSE-ERROR TO TRUE
           END-UNSTRING
```

### UNSTRING Examples

```cobol
      *--- Parse CSV record ---
           UNSTRING WS-CSV-RECORD
               DELIMITED BY ","
               INTO WS-ACCOUNT-NO  COUNT IN WS-CNT-1
                    WS-CUST-NAME   COUNT IN WS-CNT-2
                    WS-BALANCE     COUNT IN WS-CNT-3
                    WS-STATUS      COUNT IN WS-CNT-4
               TALLYING IN WS-FIELDS-FOUND
           END-UNSTRING

      *--- Parse date (MM/DD/YYYY) ---
           UNSTRING WS-DATE-STRING
               DELIMITED BY "/"
               INTO WS-MONTH
                    WS-DAY
                    WS-YEAR
           END-UNSTRING

      *--- Parse with delimiter capture ---
           UNSTRING WS-PHONE
               DELIMITED BY "-" OR "(" OR ")" OR " "
               INTO WS-AREA     DELIMITER IN WS-DLM-1
                    WS-EXCHANGE DELIMITER IN WS-DLM-2
                    WS-NUMBER   DELIMITER IN WS-DLM-3
           END-UNSTRING
```

---

## INSPECT Statement

Character manipulation and counting.

### INSPECT TALLYING

```cobol
      *--- Count occurrences ---
           MOVE 0 TO WS-COUNT
           INSPECT WS-STRING TALLYING
               WS-COUNT FOR ALL "A"

           INSPECT WS-STRING TALLYING
               WS-COUNT FOR LEADING SPACES

           INSPECT WS-STRING TALLYING
               WS-COUNT FOR CHARACTERS BEFORE INITIAL "."
```

### INSPECT REPLACING

```cobol
      *--- Replace characters ---
           INSPECT WS-STRING REPLACING
               ALL "," BY "."

           INSPECT WS-STRING REPLACING
               LEADING ZEROS BY SPACES

           INSPECT WS-STRING REPLACING
               FIRST "ERROR" BY "WARN "

           INSPECT WS-STRING REPLACING
               ALL SPACES BY LOW-VALUES
```

### INSPECT CONVERTING

```cobol
      *--- Convert case ---
           INSPECT WS-STRING CONVERTING
               "abcdefghijklmnopqrstuvwxyz"
               TO "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

      *--- Simple character mapping ---
           INSPECT WS-STRING CONVERTING
               "0123456789"
               TO "XXXXXXXXXX"
```

---

## CALL Statement

Inter-program communication.

### Static CALL

```cobol
           CALL "SUBPROG1" USING WS-INPUT-AREA
                                 WS-OUTPUT-AREA
           END-CALL

           IF RETURN-CODE NOT = 0
               PERFORM 9100-HANDLE-CALL-ERROR
           END-IF
```

### Dynamic CALL

```cobol
           MOVE "SUBPROG1" TO WS-PROGRAM-NAME
           CALL WS-PROGRAM-NAME USING WS-PARM-AREA
               ON EXCEPTION
                   DISPLAY "PROGRAM NOT FOUND: " WS-PROGRAM-NAME
                   MOVE 16 TO RETURN-CODE
               NOT ON EXCEPTION
                   CONTINUE
           END-CALL
```

### CALL with BY REFERENCE/CONTENT/VALUE

```cobol
           CALL "CALCULATE" USING
               BY REFERENCE WS-MODIFIABLE-AREA
               BY CONTENT WS-READ-ONLY-DATA
               BY VALUE WS-NUMERIC-FLAG
           END-CALL
```

### CALL with RETURNING

```cobol
           CALL "GETVALUE" USING WS-KEY
               RETURNING WS-RESULT
           END-CALL
```

### CANCEL Statement

```cobol
      *--- Release program from memory ---
           CANCEL "SUBPROG1"
           CANCEL WS-PROGRAM-NAME
```

---

## SEARCH Statement

Table lookup operations.

### Sequential SEARCH

```cobol
           SET TBL-IDX TO 1
           SEARCH WS-TABLE-ENTRY
               AT END
                   SET NOT-FOUND TO TRUE
                   MOVE ZEROS TO WS-RESULT
               WHEN WS-TABLE-KEY(TBL-IDX) = WS-SEARCH-KEY
                   SET FOUND TO TRUE
                   MOVE WS-TABLE-VALUE(TBL-IDX) TO WS-RESULT
           END-SEARCH
```

### Binary SEARCH (SEARCH ALL)

```cobol
      *--- Table must have ASCENDING/DESCENDING KEY ---
           SEARCH ALL WS-SORTED-TABLE
               AT END
                   SET NOT-FOUND TO TRUE
               WHEN WS-SORT-KEY(TBL-IDX) = WS-SEARCH-KEY
                   MOVE WS-SORT-DATA(TBL-IDX) TO WS-RESULT
           END-SEARCH
```

---

## SORT and MERGE

### SORT with Files

```cobol
           SORT SORT-WORK-FILE
               ON ASCENDING KEY SORT-ACCOUNT
               ON DESCENDING KEY SORT-DATE
               USING INPUT-FILE
               GIVING OUTPUT-FILE
```

### SORT with Procedures

```cobol
           SORT SORT-WORK-FILE
               ON ASCENDING KEY SORT-KEY
               INPUT PROCEDURE IS 1000-SELECT-RECORDS
               OUTPUT PROCEDURE IS 2000-PROCESS-SORTED
```

### RELEASE and RETURN

```cobol
       1000-SELECT-RECORDS SECTION.
           PERFORM UNTIL END-OF-INPUT
               READ INPUT-FILE
                   AT END SET END-OF-INPUT TO TRUE
               END-READ
               IF NOT END-OF-INPUT
                   IF INPUT-STATUS = "A"
                       MOVE INPUT-REC TO SORT-REC
                       RELEASE SORT-REC
                   END-IF
               END-IF
           END-PERFORM.

       2000-PROCESS-SORTED SECTION.
           PERFORM UNTIL END-OF-SORT
               RETURN SORT-WORK-FILE
                   AT END SET END-OF-SORT TO TRUE
               END-RETURN
               IF NOT END-OF-SORT
                   PERFORM 2100-WRITE-OUTPUT
               END-IF
           END-PERFORM.
```

---

## GO TO Statement

```cobol
      *--- Unconditional ---
           GO TO 9999-ABORT-PROGRAM

      *--- Conditional (deprecated style) ---
           GO TO 1000-PROCESS
                 2000-ERROR
                 3000-END
               DEPENDING ON WS-SWITCH

      *--- ALTER (very deprecated) ---
           ALTER SWITCH-PARA TO PROCEED TO 2000-NEW-TARGET
```

**Transpiler Note**: GO TO complicates control flow analysis. May need to convert to structured constructs.

---

## EXIT Statement

```cobol
      *--- Exit from performed paragraph ---
       1000-EXIT.
           EXIT.

      *--- Exit from inline PERFORM ---
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 100
               IF WS-TABLE(WS-I) = WS-TARGET
                   SET FOUND TO TRUE
                   EXIT PERFORM
               END-IF
           END-PERFORM

      *--- Exit PERFORM with cycle (continue) ---
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 100
               IF WS-SKIP-FLAG(WS-I) = "Y"
                   EXIT PERFORM CYCLE
               END-IF
               PERFORM 2000-PROCESS-ITEM
           END-PERFORM

      *--- Exit paragraph ---
           IF ERROR-FOUND
               EXIT PARAGRAPH
           END-IF

      *--- Exit section ---
           IF FATAL-ERROR
               EXIT SECTION
           END-IF
```

---

## STOP and GOBACK

```cobol
      *--- End program execution ---
           STOP RUN

      *--- Return to caller (preferred for subprograms) ---
           GOBACK

      *--- Set return code before ending ---
           MOVE 0 TO RETURN-CODE
           GOBACK

           MOVE 16 TO RETURN-CODE
           STOP RUN
```

---

## INITIALIZE Statement

```cobol
      *--- Initialize all fields to default ---
           INITIALIZE WS-RECORD

      *--- Selective initialization ---
           INITIALIZE WS-RECORD
               REPLACING NUMERIC BY ZEROS
                         ALPHANUMERIC BY SPACES

      *--- With specific values ---
           INITIALIZE WS-RECORD
               REPLACING NUMERIC BY 999
                         ALPHANUMERIC BY ALL "*"

      *--- Exclude FILLER ---
           INITIALIZE WS-RECORD WITH FILLER
```

---

## ACCEPT and DISPLAY

```cobol
      *--- Get current date/time ---
           ACCEPT WS-CURRENT-DATE FROM DATE YYYYMMDD
           ACCEPT WS-CURRENT-TIME FROM TIME
           ACCEPT WS-DAY-OF-WEEK FROM DAY-OF-WEEK

      *--- Get environment variable ---
           ACCEPT WS-ENV-VALUE FROM ENVIRONMENT "ENVVAR"

      *--- Get command line argument ---
           ACCEPT WS-PARM FROM COMMAND-LINE

      *--- Display output ---
           DISPLAY "PROCESSING STARTED"
           DISPLAY "RECORDS: " WS-REC-COUNT
           DISPLAY WS-ERROR-MESSAGE UPON SYSERR
```

---

## SET Statement

```cobol
      *--- Set 88-level conditions ---
           SET END-OF-FILE TO TRUE
           SET ACCT-ACTIVE TO TRUE

      *--- Set index ---
           SET TBL-IDX TO 1
           SET TBL-IDX UP BY 1
           SET TBL-IDX DOWN BY 1

      *--- Set pointer ---
           SET ADDRESS OF LINKAGE-RECORD TO WS-PTR
           SET WS-PTR TO ADDRESS OF WS-BUFFER

      *--- Set to ON/OFF (switches) ---
           SET WS-DEBUG-MODE TO ON
```

---

## Intrinsic Functions

```cobol
      *--- String functions ---
           MOVE FUNCTION UPPER-CASE(WS-INPUT) TO WS-OUTPUT
           MOVE FUNCTION LOWER-CASE(WS-INPUT) TO WS-OUTPUT
           MOVE FUNCTION REVERSE(WS-STRING) TO WS-REVERSED
           MOVE FUNCTION LENGTH(WS-STRING) TO WS-LEN
           MOVE FUNCTION TRIM(WS-STRING TRAILING) TO WS-TRIMMED

      *--- Numeric functions ---
           COMPUTE WS-RESULT = FUNCTION ABS(WS-VALUE)
           COMPUTE WS-RESULT = FUNCTION MAX(WS-A WS-B WS-C)
           COMPUTE WS-RESULT = FUNCTION MIN(WS-A WS-B WS-C)
           COMPUTE WS-RESULT = FUNCTION MOD(WS-NUM WS-DIV)
           COMPUTE WS-RESULT = FUNCTION INTEGER(WS-DECIMAL)
           COMPUTE WS-RESULT = FUNCTION SQRT(WS-VALUE)

      *--- Date functions ---
           COMPUTE WS-DAYS = FUNCTION INTEGER-OF-DATE(WS-DATE)
           COMPUTE WS-DATE = FUNCTION DATE-OF-INTEGER(WS-DAYS)
           MOVE FUNCTION CURRENT-DATE TO WS-TIMESTAMP

      *--- Financial functions ---
           COMPUTE WS-RESULT = FUNCTION ANNUITY(WS-RATE WS-PERIODS)
           COMPUTE WS-RESULT = FUNCTION PRESENT-VALUE
                                   (WS-RATE WS-AMOUNT WS-PERIODS)

      *--- Random ---
           COMPUTE WS-RANDOM = FUNCTION RANDOM
           COMPUTE WS-RANDOM = FUNCTION RANDOM(WS-SEED)

      *--- Ordinal ---
           COMPUTE WS-POS = FUNCTION ORD(WS-CHAR)
           MOVE FUNCTION CHAR(WS-POS) TO WS-CHAR
```
