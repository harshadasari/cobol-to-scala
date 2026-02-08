# COBOL CICS and DB2 Reference

## Overview

CICS (Customer Information Control System) provides online transaction processing. DB2 provides relational database access. Both use embedded commands within COBOL programs that require preprocessing.

---

## DB2 Integration

### Embedded SQL Basics

SQL statements are embedded between EXEC SQL and END-EXEC:

```cobol
           EXEC SQL
               SELECT CUSTOMER_NAME,
                      ACCOUNT_BALANCE,
                      LAST_ACTIVITY_DATE
               INTO :WS-CUST-NAME,
                    :WS-ACCT-BALANCE,
                    :WS-LAST-ACTIVITY
               FROM CUSTOMER_MASTER
               WHERE CUSTOMER_ID = :WS-CUST-ID
           END-EXEC
```

### Required Declarations

```cobol
       WORKING-STORAGE SECTION.

      *--- SQL Communication Area (always required) ---
           EXEC SQL INCLUDE SQLCA END-EXEC.

      *--- Host variables for DB2 interaction ---
       01  WS-DB2-FIELDS.
           05  WS-CUST-ID          PIC S9(10) COMP-3.
           05  WS-CUST-NAME        PIC X(50).
           05  WS-ACCT-BALANCE     PIC S9(11)V99 COMP-3.
           05  WS-LAST-ACTIVITY    PIC X(10).

      *--- Indicator variables for NULL handling ---
       01  WS-INDICATORS.
           05  WS-CUST-NAME-IND    PIC S9(4) COMP.
           05  WS-BALANCE-IND      PIC S9(4) COMP.
           05  WS-ACTIVITY-IND     PIC S9(4) COMP.
```

### SQLCA Structure

```cobol
       01  SQLCA.
           05  SQLCAID         PIC X(8).
           05  SQLCABC         PIC S9(9) COMP-5.
           05  SQLCODE         PIC S9(9) COMP-5.
               88  SQL-SUCCESS     VALUE 0.
               88  SQL-NOT-FOUND   VALUE 100.
               88  SQL-DUP-KEY     VALUE -803.
           05  SQLERRM.
               49  SQLERRML    PIC S9(4) COMP-5.
               49  SQLERRMC    PIC X(70).
           05  SQLERRP         PIC X(8).
           05  SQLERRD         OCCURS 6 PIC S9(9) COMP-5.
           05  SQLWARN.
               10  SQLWARN0    PIC X.
               10  SQLWARN1    PIC X.
               10  SQLWARN2    PIC X.
               10  SQLWARN3    PIC X.
               10  SQLWARN4    PIC X.
               10  SQLWARN5    PIC X.
               10  SQLWARN6    PIC X.
               10  SQLWARN7    PIC X.
           05  SQLSTATE        PIC X(5).
```

### Common SQLCODE Values

| SQLCODE | Meaning |
|---------|---------|
| 0 | Successful execution |
| 100 | No rows found / end of cursor |
| -803 | Duplicate key on insert |
| -805 | Package not found |
| -811 | Multiple rows returned (single-row SELECT) |
| -818 | Timestamp mismatch |
| -904 | Resource unavailable |
| -911 | Deadlock or timeout |
| -913 | Deadlock |

---

## DB2 SQL Operations

### Single-Row SELECT

```cobol
       2100-GET-CUSTOMER.
           EXEC SQL
               SELECT CUST_NAME,
                      CUST_BALANCE,
                      CUST_STATUS
               INTO :WS-CUST-NAME,
                    :WS-CUST-BALANCE,
                    :WS-CUST-STATUS
               FROM CUSTOMER
               WHERE CUST_ID = :WS-CUST-ID
           END-EXEC

           EVALUATE SQLCODE
               WHEN 0
                   SET CUST-FOUND TO TRUE
               WHEN 100
                   SET CUST-NOT-FOUND TO TRUE
               WHEN OTHER
                   MOVE SQLCODE TO WS-SQL-ERROR
                   PERFORM 9100-SQL-ERROR
           END-EVALUATE.
```

### SELECT with NULL Indicators

```cobol
           EXEC SQL
               SELECT CUST_NAME,
                      MIDDLE_NAME,
                      PHONE_NUMBER
               INTO :WS-CUST-NAME,
                    :WS-MIDDLE-NAME :WS-MIDDLE-IND,
                    :WS-PHONE :WS-PHONE-IND
               FROM CUSTOMER
               WHERE CUST_ID = :WS-CUST-ID
           END-EXEC

           IF WS-MIDDLE-IND < 0
               MOVE SPACES TO WS-MIDDLE-NAME
           END-IF

           IF WS-PHONE-IND < 0
               MOVE "NO PHONE" TO WS-PHONE
           END-IF.
```

### INSERT

```cobol
       2200-INSERT-CUSTOMER.
           EXEC SQL
               INSERT INTO CUSTOMER
                   (CUST_ID,
                    CUST_NAME,
                    CUST_BALANCE,
                    OPEN_DATE,
                    CREATE_TS)
               VALUES
                   (:WS-CUST-ID,
                    :WS-CUST-NAME,
                    :WS-CUST-BALANCE,
                    CURRENT DATE,
                    CURRENT TIMESTAMP)
           END-EXEC

           IF SQLCODE = 0
               ADD 1 TO WS-INSERT-COUNT
           ELSE IF SQLCODE = -803
               SET DUPLICATE-CUSTOMER TO TRUE
           ELSE
               PERFORM 9100-SQL-ERROR
           END-IF.
```

### UPDATE

```cobol
       2300-UPDATE-BALANCE.
           EXEC SQL
               UPDATE ACCOUNT
               SET CURRENT_BALANCE = :WS-NEW-BALANCE,
                   LAST_UPDATE_TS = CURRENT TIMESTAMP
               WHERE ACCOUNT_ID = :WS-ACCOUNT-ID
           END-EXEC

           IF SQLCODE = 0
               MOVE SQLERRD(3) TO WS-ROWS-UPDATED
           ELSE IF SQLCODE = 100
               SET ACCOUNT-NOT-FOUND TO TRUE
           ELSE
               PERFORM 9100-SQL-ERROR
           END-IF.
```

### DELETE

```cobol
       2400-DELETE-TRANSACTION.
           EXEC SQL
               DELETE FROM TRANSACTION_HISTORY
               WHERE ACCOUNT_ID = :WS-ACCOUNT-ID
                 AND TRANS_DATE < :WS-CUTOFF-DATE
           END-EXEC

           MOVE SQLERRD(3) TO WS-ROWS-DELETED.
```

---

## Cursors

For multi-row result sets.

### Cursor Declaration

```cobol
       WORKING-STORAGE SECTION.
           EXEC SQL DECLARE CUST-CURSOR CURSOR FOR
               SELECT CUST_ID,
                      CUST_NAME,
                      CUST_BALANCE
               FROM CUSTOMER
               WHERE REGION_CODE = :WS-REGION
                 AND CUST_STATUS = 'A'
               ORDER BY CUST_NAME
           END-EXEC.
```

### Cursor Operations

```cobol
       2000-PROCESS-CUSTOMERS.
      *--- Open cursor ---
           EXEC SQL OPEN CUST-CURSOR END-EXEC
           IF SQLCODE NOT = 0
               PERFORM 9100-SQL-ERROR
           END-IF

      *--- Fetch loop ---
           PERFORM 2100-FETCH-CUSTOMER
           PERFORM UNTIL SQLCODE = 100
               PERFORM 2200-PROCESS-CUSTOMER
               PERFORM 2100-FETCH-CUSTOMER
           END-PERFORM

      *--- Close cursor ---
           EXEC SQL CLOSE CUST-CURSOR END-EXEC.

       2100-FETCH-CUSTOMER.
           EXEC SQL
               FETCH CUST-CURSOR
               INTO :WS-CUST-ID,
                    :WS-CUST-NAME,
                    :WS-CUST-BALANCE
           END-EXEC.
```

### Scrollable Cursor

```cobol
           EXEC SQL DECLARE SCROLL-CURSOR SCROLL CURSOR FOR
               SELECT * FROM CUSTOMER
               ORDER BY CUST_ID
           END-EXEC

      *--- Various fetch options ---
           EXEC SQL FETCH FIRST SCROLL-CURSOR INTO ... END-EXEC
           EXEC SQL FETCH LAST SCROLL-CURSOR INTO ... END-EXEC
           EXEC SQL FETCH NEXT SCROLL-CURSOR INTO ... END-EXEC
           EXEC SQL FETCH PRIOR SCROLL-CURSOR INTO ... END-EXEC
           EXEC SQL FETCH ABSOLUTE :WS-ROW-NUM
               SCROLL-CURSOR INTO ... END-EXEC
           EXEC SQL FETCH RELATIVE :WS-OFFSET
               SCROLL-CURSOR INTO ... END-EXEC
```

### Cursor with FOR UPDATE

```cobol
           EXEC SQL DECLARE UPD-CURSOR CURSOR FOR
               SELECT CUST_ID, CUST_BALANCE
               FROM CUSTOMER
               WHERE REGION_CODE = :WS-REGION
               FOR UPDATE OF CUST_BALANCE
           END-EXEC

      *--- Update current row ---
           EXEC SQL
               UPDATE CUSTOMER
               SET CUST_BALANCE = :WS-NEW-BALANCE
               WHERE CURRENT OF UPD-CURSOR
           END-EXEC
```

---

## Transaction Control

```cobol
      *--- Commit work ---
           EXEC SQL COMMIT END-EXEC

      *--- Rollback ---
           EXEC SQL ROLLBACK END-EXEC

      *--- Savepoint ---
           EXEC SQL SAVEPOINT SP1 END-EXEC

      *--- Rollback to savepoint ---
           EXEC SQL ROLLBACK TO SAVEPOINT SP1 END-EXEC
```

---

## CICS Integration

### CICS Command Basics

```cobol
           EXEC CICS command
               option(value)
               option(value)
               ...
               RESP(WS-RESP)
               RESP2(WS-RESP2)
           END-EXEC
```

### Common Response Codes

```cobol
       01  WS-CICS-RESPONSES.
           05  WS-RESP             PIC S9(08) COMP.
           05  WS-RESP2            PIC S9(08) COMP.

       01  DFHRESP-VALUES.
           05  DFHRESP-NORMAL      PIC S9(08) COMP VALUE 0.
           05  DFHRESP-ERROR       PIC S9(08) COMP VALUE 1.
           05  DFHRESP-NOTFND      PIC S9(08) COMP VALUE 13.
           05  DFHRESP-DUPKEY      PIC S9(08) COMP VALUE 14.
           05  DFHRESP-MAPFAIL     PIC S9(08) COMP VALUE 36.
```

---

## CICS File Operations

### READ

```cobol
       2100-READ-ACCOUNT.
           EXEC CICS READ
               FILE('ACCTFILE')
               INTO(WS-ACCOUNT-RECORD)
               RIDFLD(WS-ACCOUNT-KEY)
               RESP(WS-RESP)
               RESP2(WS-RESP2)
           END-EXEC

           EVALUATE WS-RESP
               WHEN DFHRESP(NORMAL)
                   SET RECORD-FOUND TO TRUE
               WHEN DFHRESP(NOTFND)
                   SET RECORD-NOT-FOUND TO TRUE
               WHEN OTHER
                   PERFORM 9100-CICS-ERROR
           END-EVALUATE.
```

### READ for UPDATE

```cobol
           EXEC CICS READ
               FILE('ACCTFILE')
               INTO(WS-ACCOUNT-RECORD)
               RIDFLD(WS-ACCOUNT-KEY)
               UPDATE
               RESP(WS-RESP)
           END-EXEC
```

### WRITE

```cobol
           EXEC CICS WRITE
               FILE('ACCTFILE')
               FROM(WS-ACCOUNT-RECORD)
               RIDFLD(WS-ACCOUNT-KEY)
               RESP(WS-RESP)
           END-EXEC
```

### REWRITE

```cobol
      *--- Must follow READ UPDATE ---
           EXEC CICS REWRITE
               FILE('ACCTFILE')
               FROM(WS-ACCOUNT-RECORD)
               RESP(WS-RESP)
           END-EXEC
```

### DELETE

```cobol
           EXEC CICS DELETE
               FILE('ACCTFILE')
               RIDFLD(WS-ACCOUNT-KEY)
               RESP(WS-RESP)
           END-EXEC
```

### STARTBR / READNEXT / ENDBR (Browse)

```cobol
       2200-BROWSE-ACCOUNTS.
      *--- Start browse ---
           EXEC CICS STARTBR
               FILE('ACCTFILE')
               RIDFLD(WS-START-KEY)
               GTEQ
               RESP(WS-RESP)
           END-EXEC

      *--- Read next loop ---
           PERFORM UNTIL WS-RESP NOT = DFHRESP(NORMAL)
               EXEC CICS READNEXT
                   FILE('ACCTFILE')
                   INTO(WS-ACCOUNT-RECORD)
                   RIDFLD(WS-ACCOUNT-KEY)
                   RESP(WS-RESP)
               END-EXEC

               IF WS-RESP = DFHRESP(NORMAL)
                   PERFORM 2210-PROCESS-ACCOUNT
               END-IF
           END-PERFORM

      *--- End browse ---
           EXEC CICS ENDBR
               FILE('ACCTFILE')
               RESP(WS-RESP)
           END-EXEC.
```

---

## CICS Screen Handling (BMS)

### SEND MAP

```cobol
           EXEC CICS SEND
               MAP('INQMAP1')
               MAPSET('INQSET1')
               FROM(INQMAP1O)
               ERASE
               CURSOR
               RESP(WS-RESP)
           END-EXEC
```

### RECEIVE MAP

```cobol
           EXEC CICS RECEIVE
               MAP('INQMAP1')
               MAPSET('INQSET1')
               INTO(INQMAP1I)
               RESP(WS-RESP)
           END-EXEC

           IF WS-RESP = DFHRESP(MAPFAIL)
               SET NO-DATA-ENTERED TO TRUE
           END-IF
```

### BMS Map Copybook Structure

```cobol
      *--- Generated symbolic map (input) ---
       01  INQMAP1I.
           05  FILLER                  PIC X(12).
           05  ACCTNOL                 PIC S9(4) COMP.
           05  ACCTNOF                 PIC X.
           05  FILLER REDEFINES ACCTNOF.
               10  ACCTNOA             PIC X.
           05  ACCTNOI                 PIC X(12).
           05  NAMEL                   PIC S9(4) COMP.
           05  NAMEF                   PIC X.
           05  FILLER REDEFINES NAMEF.
               10  NAMEA               PIC X.
           05  NAMEI                   PIC X(30).

      *--- Generated symbolic map (output) ---
       01  INQMAP1O REDEFINES INQMAP1I.
           05  FILLER                  PIC X(12).
           05  FILLER                  PIC X(02).
           05  FILLER                  PIC X.
           05  ACCTNOO                 PIC X(12).
           05  FILLER                  PIC X(02).
           05  FILLER                  PIC X.
           05  NAMEO                   PIC X(30).
```

---

## CICS Program Control

### LINK (Call subprogram)

```cobol
           EXEC CICS LINK
               PROGRAM('SUBPROG1')
               COMMAREA(WS-COMM-AREA)
               LENGTH(WS-COMM-LENGTH)
               RESP(WS-RESP)
           END-EXEC
```

### XCTL (Transfer control)

```cobol
           EXEC CICS XCTL
               PROGRAM('NEXTPROG')
               COMMAREA(WS-COMM-AREA)
               LENGTH(WS-COMM-LENGTH)
               RESP(WS-RESP)
           END-EXEC
```

### RETURN

```cobol
      *--- Return to CICS ---
           EXEC CICS RETURN END-EXEC

      *--- Return with transaction ---
           EXEC CICS RETURN
               TRANSID('INQ1')
               COMMAREA(WS-COMM-AREA)
               LENGTH(WS-COMM-LENGTH)
           END-EXEC
```

---

## CICS Communication Area

```cobol
       LINKAGE SECTION.
       01  DFHCOMMAREA             PIC X(500).

       PROCEDURE DIVISION.
      *--- Check if communication area passed ---
           IF EIBCALEN > 0
               MOVE DFHCOMMAREA TO WS-COMM-AREA
               PERFORM 2000-CONTINUE-CONVERSATION
           ELSE
               PERFORM 1000-FIRST-TIME
           END-IF.
```

---

## CICS Temporary Storage

### WRITEQ TS

```cobol
           EXEC CICS WRITEQ TS
               QUEUE('MYQUEUE ')
               FROM(WS-QUEUE-DATA)
               LENGTH(WS-DATA-LENGTH)
               ITEM(WS-ITEM-NUM)
               RESP(WS-RESP)
           END-EXEC
```

### READQ TS

```cobol
           EXEC CICS READQ TS
               QUEUE('MYQUEUE ')
               INTO(WS-QUEUE-DATA)
               LENGTH(WS-DATA-LENGTH)
               ITEM(WS-ITEM-NUM)
               RESP(WS-RESP)
           END-EXEC
```

### DELETEQ TS

```cobol
           EXEC CICS DELETEQ TS
               QUEUE('MYQUEUE ')
               RESP(WS-RESP)
           END-EXEC
```

---

## CICS Interval Control

### START

```cobol
           EXEC CICS START
               TRANSID('BTCH')
               FROM(WS-START-DATA)
               LENGTH(WS-DATA-LENGTH)
               INTERVAL(003000)
               RESP(WS-RESP)
           END-EXEC
```

### ASKTIME / FORMATTIME

```cobol
           EXEC CICS ASKTIME
               ABSTIME(WS-ABSTIME)
           END-EXEC

           EXEC CICS FORMATTIME
               ABSTIME(WS-ABSTIME)
               YYYYMMDD(WS-DATE-YYYYMMDD)
               TIME(WS-TIME-HHMMSS)
               DATESEP('/')
               TIMESEP(':')
           END-EXEC
```

---

## CICS Error Handling

### HANDLE CONDITION (Older Style)

```cobol
           EXEC CICS HANDLE CONDITION
               NOTFND(2500-NOT-FOUND)
               DUPKEY(2600-DUPLICATE)
               ERROR(9000-ERROR)
           END-EXEC
```

### RESP/RESP2 (Modern Style)

```cobol
           EXEC CICS READ
               FILE('ACCTFILE')
               INTO(WS-RECORD)
               RIDFLD(WS-KEY)
               RESP(WS-RESP)
               RESP2(WS-RESP2)
           END-EXEC

           EVALUATE WS-RESP
               WHEN DFHRESP(NORMAL)
                   CONTINUE
               WHEN DFHRESP(NOTFND)
                   PERFORM 2500-NOT-FOUND
               WHEN DFHRESP(DUPKEY)
                   PERFORM 2600-DUPLICATE
               WHEN OTHER
                   MOVE WS-RESP TO WS-ERROR-CODE
                   PERFORM 9000-ERROR
           END-EVALUATE
```

---

## Transpiler Considerations

### DB2 Transpilation Strategy

| COBOL/DB2 | Scala Consideration |
|-----------|---------------------|
| EXEC SQL | DSL or string interpolation |
| Host variables (:VAR) | Prepared statement parameters |
| SQLCODE | Try/Either pattern |
| Cursor | Iterator/Stream |
| COMMIT/ROLLBACK | Transaction boundary |
| Indicator variables | Option type |

### CICS Transpilation Strategy

| CICS Command | Scala/JVM Consideration |
|--------------|-------------------------|
| EXEC CICS READ | Database/cache lookup |
| EXEC CICS SEND MAP | REST response / HTML |
| EXEC CICS RECEIVE | REST request / form |
| EXEC CICS LINK | Method call |
| EXEC CICS RETURN | Return statement |
| COMMAREA | Session/context object |
| DFHRESP | Sealed trait hierarchy |

### Example: Scala Translation Pattern

```scala
// Original COBOL
// EXEC SQL SELECT ... INTO :WS-NAME WHERE ID = :WS-ID END-EXEC

// Possible Scala translation
def getCustomer(id: CustomerId): Either[SqlError, Customer] = {
  sql"SELECT name, balance FROM customer WHERE id = $id"
    .query[Customer]
    .option
    .transact(xa)
    .map {
      case Some(c) => Right(c)
      case None    => Left(SqlError.NotFound)
    }
}
```

### Preprocessing Requirements

Both DB2 and CICS require preprocessing before COBOL compilation:

```
Source.cbl → DB2 Precompiler → Modified.cbl + DBRM
Modified.cbl → CICS Translator → Final.cbl
Final.cbl → COBOL Compiler → Object
```

For transpilation, you need to either:
1. Parse the EXEC SQL/EXEC CICS blocks directly
2. Use the preprocessed output
3. Build equivalent preprocessing into your transpiler
