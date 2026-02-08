# Common Enterprise COBOL Patterns

## Overview

This document covers the most common patterns found in enterprise COBOL applications, particularly in banking, insurance, and financial services. Understanding these patterns is essential for accurate transpilation.

---

## Pattern 1: Batch Processing Master/Transaction Update

The classic batch pattern: read transactions, update master file.

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BATCHUPD.
      *================================================================
      * DAILY ACCOUNT UPDATE - MASTER/TRANSACTION MATCHING
      * Processes sorted transactions against account master
      *================================================================

       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT TRANS-FILE ASSIGN TO TRANSIN
               FILE STATUS IS WS-TRANS-ST.
           SELECT OLD-MASTER ASSIGN TO OLDMAST
               FILE STATUS IS WS-OLD-ST.
           SELECT NEW-MASTER ASSIGN TO NEWMAST
               FILE STATUS IS WS-NEW-ST.
           SELECT EXCEPTION-FILE ASSIGN TO EXCPOUT
               FILE STATUS IS WS-EXCP-ST.

       DATA DIVISION.
       FILE SECTION.
       FD  TRANS-FILE
           BLOCK CONTAINS 0 RECORDS
           RECORD CONTAINS 100 CHARACTERS.
       01  TRANS-RECORD.
           05  TR-ACCOUNT-KEY      PIC X(12).
           05  TR-TRANS-TYPE       PIC X(02).
               88  TR-DEPOSIT          VALUE "DP".
               88  TR-WITHDRAWAL       VALUE "WD".
               88  TR-INTEREST         VALUE "IN".
               88  TR-FEE              VALUE "FE".
           05  TR-AMOUNT           PIC S9(11)V99 COMP-3.
           05  TR-TRANS-DATE       PIC 9(08).
           05  TR-DESCRIPTION      PIC X(30).
           05  FILLER              PIC X(41).

       FD  OLD-MASTER
           BLOCK CONTAINS 0 RECORDS
           RECORD CONTAINS 500 CHARACTERS.
       01  OLD-MASTER-REC.
           05  OM-ACCOUNT-KEY      PIC X(12).
           05  OM-ACCOUNT-DATA     PIC X(488).

       FD  NEW-MASTER
           BLOCK CONTAINS 0 RECORDS
           RECORD CONTAINS 500 CHARACTERS.
       01  NEW-MASTER-REC          PIC X(500).

       FD  EXCEPTION-FILE
           RECORD CONTAINS 150 CHARACTERS.
       01  EXCEPTION-REC           PIC X(150).

       WORKING-STORAGE SECTION.
       01  WS-FILE-STATUS.
           05  WS-TRANS-ST         PIC XX.
           05  WS-OLD-ST           PIC XX.
           05  WS-NEW-ST           PIC XX.
           05  WS-EXCP-ST          PIC XX.

       01  WS-MASTER-WORK.
           05  WS-ACCOUNT-KEY      PIC X(12).
           05  WS-CUSTOMER-NAME    PIC X(50).
           05  WS-ACCOUNT-TYPE     PIC X(02).
           05  WS-STATUS           PIC X(01).
           05  WS-CURRENT-BALANCE  PIC S9(11)V99 COMP-3.
           05  WS-AVAILABLE-BAL    PIC S9(11)V99 COMP-3.
           05  WS-LAST-TRANS-DATE  PIC 9(08).
           05  WS-TRANS-COUNT      PIC 9(05) COMP-3.
           05  FILLER              PIC X(420).

       01  WS-FLAGS.
           05  WS-TRANS-EOF        PIC X VALUE "N".
               88  END-OF-TRANS        VALUE "Y".
           05  WS-MAST-EOF         PIC X VALUE "N".
               88  END-OF-MASTER       VALUE "Y".

       01  WS-COUNTERS.
           05  WS-TRANS-READ       PIC 9(09) COMP VALUE 0.
           05  WS-MAST-READ        PIC 9(09) COMP VALUE 0.
           05  WS-MAST-WRITTEN     PIC 9(09) COMP VALUE 0.
           05  WS-TRANS-APPLIED    PIC 9(09) COMP VALUE 0.
           05  WS-EXCEPTIONS       PIC 9(09) COMP VALUE 0.

       01  WS-HIGH-VALUES          PIC X(12) VALUE HIGH-VALUES.

       PROCEDURE DIVISION.
      *================================================================
       0000-MAIN SECTION.
      *================================================================
           PERFORM 1000-INITIALIZE
           PERFORM 2000-PROCESS UNTIL END-OF-TRANS AND END-OF-MASTER
           PERFORM 9000-TERMINATE
           STOP RUN.

      *================================================================
       1000-INITIALIZE SECTION.
      *================================================================
           OPEN INPUT  TRANS-FILE
                       OLD-MASTER
                OUTPUT NEW-MASTER
                       EXCEPTION-FILE

           PERFORM 1100-READ-TRANS
           PERFORM 1200-READ-MASTER.

       1100-READ-TRANS.
           READ TRANS-FILE
               AT END
                   SET END-OF-TRANS TO TRUE
                   MOVE HIGH-VALUES TO TR-ACCOUNT-KEY
               NOT AT END
                   ADD 1 TO WS-TRANS-READ
           END-READ.

       1200-READ-MASTER.
           READ OLD-MASTER INTO WS-MASTER-WORK
               AT END
                   SET END-OF-MASTER TO TRUE
                   MOVE HIGH-VALUES TO WS-ACCOUNT-KEY
               NOT AT END
                   ADD 1 TO WS-MAST-READ
           END-READ.

      *================================================================
       2000-PROCESS SECTION.
      *================================================================
      *--- Three-way comparison for matching ---
           EVALUATE TRUE
               WHEN TR-ACCOUNT-KEY < WS-ACCOUNT-KEY
      *            Transaction with no master - exception
                   PERFORM 2100-UNMATCHED-TRANS
               WHEN TR-ACCOUNT-KEY = WS-ACCOUNT-KEY
      *            Match - apply transaction
                   PERFORM 2200-MATCHED-TRANS
               WHEN TR-ACCOUNT-KEY > WS-ACCOUNT-KEY
      *            Master with no transactions - copy forward
                   PERFORM 2300-UNMATCHED-MASTER
           END-EVALUATE.

       2100-UNMATCHED-TRANS.
           MOVE TR-ACCOUNT-KEY TO EXCEPTION-REC(1:12)
           MOVE "NO MASTER RECORD" TO EXCEPTION-REC(13:20)
           MOVE TRANS-RECORD TO EXCEPTION-REC(33:100)
           WRITE EXCEPTION-REC
           ADD 1 TO WS-EXCEPTIONS
           PERFORM 1100-READ-TRANS.

       2200-MATCHED-TRANS.
      *--- Apply transaction to master ---
           EVALUATE TRUE
               WHEN TR-DEPOSIT
                   ADD TR-AMOUNT TO WS-CURRENT-BALANCE
                   ADD TR-AMOUNT TO WS-AVAILABLE-BAL
               WHEN TR-WITHDRAWAL
                   SUBTRACT TR-AMOUNT FROM WS-CURRENT-BALANCE
                   SUBTRACT TR-AMOUNT FROM WS-AVAILABLE-BAL
               WHEN TR-INTEREST
                   ADD TR-AMOUNT TO WS-CURRENT-BALANCE
                   ADD TR-AMOUNT TO WS-AVAILABLE-BAL
               WHEN TR-FEE
                   SUBTRACT TR-AMOUNT FROM WS-CURRENT-BALANCE
                   SUBTRACT TR-AMOUNT FROM WS-AVAILABLE-BAL
           END-EVALUATE
           MOVE TR-TRANS-DATE TO WS-LAST-TRANS-DATE
           ADD 1 TO WS-TRANS-COUNT
           ADD 1 TO WS-TRANS-APPLIED
           PERFORM 1100-READ-TRANS.

       2300-UNMATCHED-MASTER.
      *--- Write master and read next ---
           MOVE WS-MASTER-WORK TO NEW-MASTER-REC
           WRITE NEW-MASTER-REC
           ADD 1 TO WS-MAST-WRITTEN
           PERFORM 1200-READ-MASTER.

      *================================================================
       9000-TERMINATE SECTION.
      *================================================================
           DISPLAY "TRANSACTIONS READ:    " WS-TRANS-READ
           DISPLAY "TRANSACTIONS APPLIED: " WS-TRANS-APPLIED
           DISPLAY "MASTERS READ:         " WS-MAST-READ
           DISPLAY "MASTERS WRITTEN:      " WS-MAST-WRITTEN
           DISPLAY "EXCEPTIONS:           " WS-EXCEPTIONS

           CLOSE TRANS-FILE
                 OLD-MASTER
                 NEW-MASTER
                 EXCEPTION-FILE

           IF WS-EXCEPTIONS > 0
               MOVE 4 TO RETURN-CODE
           ELSE
               MOVE 0 TO RETURN-CODE
           END-IF.
```

---

## Pattern 2: Report Generation with Control Breaks

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. RPTGEN01.
      *================================================================
      * ACCOUNT BALANCE REPORT WITH CONTROL BREAKS
      * Breaks on: Region, Branch, Account Type
      *================================================================

       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INPUT-FILE ASSIGN TO INFILE
               FILE STATUS IS WS-IN-ST.
           SELECT REPORT-FILE ASSIGN TO RPTFILE
               FILE STATUS IS WS-RPT-ST.

       DATA DIVISION.
       FILE SECTION.
       FD  INPUT-FILE
           RECORD CONTAINS 200 CHARACTERS.
       01  INPUT-REC.
           05  IN-REGION           PIC X(02).
           05  IN-BRANCH           PIC X(04).
           05  IN-ACCT-TYPE        PIC X(02).
           05  IN-ACCOUNT          PIC X(12).
           05  IN-CUST-NAME        PIC X(50).
           05  IN-BALANCE          PIC S9(11)V99 COMP-3.
           05  FILLER              PIC X(123).

       FD  REPORT-FILE
           RECORD CONTAINS 133 CHARACTERS.
       01  REPORT-LINE             PIC X(133).

       WORKING-STORAGE SECTION.
       01  WS-FILE-STATUS.
           05  WS-IN-ST            PIC XX.
           05  WS-RPT-ST           PIC XX.

       01  WS-EOF-FLAG             PIC X VALUE "N".
           88  END-OF-FILE             VALUE "Y".

      *--- Control break save areas ---
       01  WS-SAVE-KEYS.
           05  WS-SAVE-REGION      PIC X(02).
           05  WS-SAVE-BRANCH      PIC X(04).
           05  WS-SAVE-TYPE        PIC X(02).

      *--- Accumulators ---
       01  WS-TOTALS.
           05  WS-TYPE-COUNT       PIC 9(07) COMP-3 VALUE 0.
           05  WS-TYPE-BALANCE     PIC S9(13)V99 COMP-3 VALUE 0.
           05  WS-BRANCH-COUNT     PIC 9(07) COMP-3 VALUE 0.
           05  WS-BRANCH-BALANCE   PIC S9(13)V99 COMP-3 VALUE 0.
           05  WS-REGION-COUNT     PIC 9(07) COMP-3 VALUE 0.
           05  WS-REGION-BALANCE   PIC S9(13)V99 COMP-3 VALUE 0.
           05  WS-GRAND-COUNT      PIC 9(09) COMP-3 VALUE 0.
           05  WS-GRAND-BALANCE    PIC S9(15)V99 COMP-3 VALUE 0.

       01  WS-LINE-COUNT           PIC 99 VALUE 99.
       01  WS-PAGE-COUNT           PIC 9(05) VALUE 0.
       01  WS-LINES-PER-PAGE       PIC 99 VALUE 55.

      *--- Report lines ---
       01  WS-HEADER-1.
           05  FILLER              PIC X(50) VALUE
               "ACCOUNT BALANCE REPORT".
           05  FILLER              PIC X(50) VALUE SPACES.
           05  FILLER              PIC X(06) VALUE "PAGE: ".
           05  WS-H1-PAGE          PIC Z,ZZ9.
           05  FILLER              PIC X(22) VALUE SPACES.

       01  WS-HEADER-2.
           05  FILLER              PIC X(02) VALUE SPACES.
           05  FILLER              PIC X(06) VALUE "REGION".
           05  FILLER              PIC X(02) VALUE SPACES.
           05  FILLER              PIC X(06) VALUE "BRANCH".
           05  FILLER              PIC X(02) VALUE SPACES.
           05  FILLER              PIC X(04) VALUE "TYPE".
           05  FILLER              PIC X(02) VALUE SPACES.
           05  FILLER              PIC X(12) VALUE "ACCOUNT".
           05  FILLER              PIC X(02) VALUE SPACES.
           05  FILLER              PIC X(30) VALUE "CUSTOMER NAME".
           05  FILLER              PIC X(02) VALUE SPACES.
           05  FILLER              PIC X(18) VALUE "BALANCE".
           05  FILLER              PIC X(45) VALUE SPACES.

       01  WS-DETAIL-LINE.
           05  FILLER              PIC X(02) VALUE SPACES.
           05  WS-DL-REGION        PIC X(06).
           05  FILLER              PIC X(02) VALUE SPACES.
           05  WS-DL-BRANCH        PIC X(06).
           05  FILLER              PIC X(02) VALUE SPACES.
           05  WS-DL-TYPE          PIC X(04).
           05  FILLER              PIC X(02) VALUE SPACES.
           05  WS-DL-ACCOUNT       PIC X(12).
           05  FILLER              PIC X(02) VALUE SPACES.
           05  WS-DL-NAME          PIC X(30).
           05  FILLER              PIC X(02) VALUE SPACES.
           05  WS-DL-BALANCE       PIC $$$,$$$,$$$,$$9.99-.
           05  FILLER              PIC X(45) VALUE SPACES.

       01  WS-TYPE-TOTAL-LINE.
           05  FILLER              PIC X(20) VALUE SPACES.
           05  FILLER              PIC X(20) VALUE
               "*** TYPE TOTAL:".
           05  WS-TT-COUNT         PIC ZZZ,ZZ9.
           05  FILLER              PIC X(10) VALUE " ACCOUNTS ".
           05  WS-TT-BALANCE       PIC $$$,$$$,$$$,$$9.99-.
           05  FILLER              PIC X(58) VALUE SPACES.

       01  WS-BRANCH-TOTAL-LINE.
           05  FILLER              PIC X(15) VALUE SPACES.
           05  FILLER              PIC X(20) VALUE
               "** BRANCH TOTAL:".
           05  WS-BT-COUNT         PIC ZZZ,ZZ9.
           05  FILLER              PIC X(10) VALUE " ACCOUNTS ".
           05  WS-BT-BALANCE       PIC $$$,$$$,$$$,$$9.99-.
           05  FILLER              PIC X(63) VALUE SPACES.

       01  WS-REGION-TOTAL-LINE.
           05  FILLER              PIC X(10) VALUE SPACES.
           05  FILLER              PIC X(20) VALUE
               "* REGION TOTAL:".
           05  WS-RT-COUNT         PIC ZZZ,ZZ9.
           05  FILLER              PIC X(10) VALUE " ACCOUNTS ".
           05  WS-RT-BALANCE       PIC $$$,$$$,$$$,$$9.99-.
           05  FILLER              PIC X(68) VALUE SPACES.

       01  WS-GRAND-TOTAL-LINE.
           05  FILLER              PIC X(05) VALUE SPACES.
           05  FILLER              PIC X(20) VALUE
               "GRAND TOTAL:".
           05  WS-GT-COUNT         PIC Z,ZZZ,ZZ9.
           05  FILLER              PIC X(10) VALUE " ACCOUNTS ".
           05  WS-GT-BALANCE       PIC $$$$,$$$,$$$,$$9.99-.
           05  FILLER              PIC X(69) VALUE SPACES.

       PROCEDURE DIVISION.
      *================================================================
       0000-MAIN SECTION.
      *================================================================
           PERFORM 1000-INITIALIZE
           PERFORM 1100-READ-INPUT
           IF NOT END-OF-FILE
               PERFORM 1500-INIT-SAVE-KEYS
               PERFORM 2000-PROCESS UNTIL END-OF-FILE
               PERFORM 3100-TYPE-BREAK
               PERFORM 3200-BRANCH-BREAK
               PERFORM 3300-REGION-BREAK
           END-IF
           PERFORM 9000-TERMINATE
           STOP RUN.

       1000-INITIALIZE.
           OPEN INPUT  INPUT-FILE
                OUTPUT REPORT-FILE.

       1100-READ-INPUT.
           READ INPUT-FILE
               AT END
                   SET END-OF-FILE TO TRUE
           END-READ.

       1500-INIT-SAVE-KEYS.
           MOVE IN-REGION TO WS-SAVE-REGION
           MOVE IN-BRANCH TO WS-SAVE-BRANCH
           MOVE IN-ACCT-TYPE TO WS-SAVE-TYPE.

      *================================================================
       2000-PROCESS SECTION.
      *================================================================
      *--- Check for control breaks (highest to lowest) ---
           IF IN-REGION NOT = WS-SAVE-REGION
               PERFORM 3100-TYPE-BREAK
               PERFORM 3200-BRANCH-BREAK
               PERFORM 3300-REGION-BREAK
               MOVE IN-REGION TO WS-SAVE-REGION
               MOVE IN-BRANCH TO WS-SAVE-BRANCH
               MOVE IN-ACCT-TYPE TO WS-SAVE-TYPE
           ELSE IF IN-BRANCH NOT = WS-SAVE-BRANCH
               PERFORM 3100-TYPE-BREAK
               PERFORM 3200-BRANCH-BREAK
               MOVE IN-BRANCH TO WS-SAVE-BRANCH
               MOVE IN-ACCT-TYPE TO WS-SAVE-TYPE
           ELSE IF IN-ACCT-TYPE NOT = WS-SAVE-TYPE
               PERFORM 3100-TYPE-BREAK
               MOVE IN-ACCT-TYPE TO WS-SAVE-TYPE
           END-IF

           PERFORM 2500-PRINT-DETAIL
           PERFORM 1100-READ-INPUT.

       2500-PRINT-DETAIL.
           IF WS-LINE-COUNT >= WS-LINES-PER-PAGE
               PERFORM 2600-PRINT-HEADERS
           END-IF
           MOVE IN-REGION TO WS-DL-REGION
           MOVE IN-BRANCH TO WS-DL-BRANCH
           MOVE IN-ACCT-TYPE TO WS-DL-TYPE
           MOVE IN-ACCOUNT TO WS-DL-ACCOUNT
           MOVE IN-CUST-NAME TO WS-DL-NAME
           MOVE IN-BALANCE TO WS-DL-BALANCE
           WRITE REPORT-LINE FROM WS-DETAIL-LINE
           ADD 1 TO WS-LINE-COUNT

      *--- Accumulate ---
           ADD 1 TO WS-TYPE-COUNT
           ADD IN-BALANCE TO WS-TYPE-BALANCE.

       2600-PRINT-HEADERS.
           ADD 1 TO WS-PAGE-COUNT
           MOVE WS-PAGE-COUNT TO WS-H1-PAGE
           WRITE REPORT-LINE FROM WS-HEADER-1 AFTER PAGE
           WRITE REPORT-LINE FROM WS-HEADER-2 AFTER 2
           MOVE SPACES TO REPORT-LINE
           WRITE REPORT-LINE AFTER 1
           MOVE 4 TO WS-LINE-COUNT.

      *================================================================
       3100-TYPE-BREAK.
      *================================================================
           MOVE WS-TYPE-COUNT TO WS-TT-COUNT
           MOVE WS-TYPE-BALANCE TO WS-TT-BALANCE
           WRITE REPORT-LINE FROM WS-TYPE-TOTAL-LINE AFTER 1
           ADD 1 TO WS-LINE-COUNT

           ADD WS-TYPE-COUNT TO WS-BRANCH-COUNT
           ADD WS-TYPE-BALANCE TO WS-BRANCH-BALANCE
           MOVE 0 TO WS-TYPE-COUNT
           MOVE 0 TO WS-TYPE-BALANCE.

       3200-BRANCH-BREAK.
           MOVE WS-BRANCH-COUNT TO WS-BT-COUNT
           MOVE WS-BRANCH-BALANCE TO WS-BT-BALANCE
           WRITE REPORT-LINE FROM WS-BRANCH-TOTAL-LINE AFTER 1
           ADD 1 TO WS-LINE-COUNT

           ADD WS-BRANCH-COUNT TO WS-REGION-COUNT
           ADD WS-BRANCH-BALANCE TO WS-REGION-BALANCE
           MOVE 0 TO WS-BRANCH-COUNT
           MOVE 0 TO WS-BRANCH-BALANCE.

       3300-REGION-BREAK.
           MOVE WS-REGION-COUNT TO WS-RT-COUNT
           MOVE WS-REGION-BALANCE TO WS-RT-BALANCE
           WRITE REPORT-LINE FROM WS-REGION-TOTAL-LINE AFTER 1
           ADD 2 TO WS-LINE-COUNT

           ADD WS-REGION-COUNT TO WS-GRAND-COUNT
           ADD WS-REGION-BALANCE TO WS-GRAND-BALANCE
           MOVE 0 TO WS-REGION-COUNT
           MOVE 0 TO WS-REGION-BALANCE.

      *================================================================
       9000-TERMINATE SECTION.
      *================================================================
           MOVE WS-GRAND-COUNT TO WS-GT-COUNT
           MOVE WS-GRAND-BALANCE TO WS-GT-BALANCE
           WRITE REPORT-LINE FROM WS-GRAND-TOTAL-LINE AFTER 2

           CLOSE INPUT-FILE REPORT-FILE.
```

---

## Pattern 3: Table-Driven Processing

```cobol
       WORKING-STORAGE SECTION.
      *================================================================
      * TRANSACTION CODE TABLE - Loaded from file or hardcoded
      *================================================================
       01  WS-TRANS-CODE-TABLE.
           05  WS-TC-ENTRY OCCURS 50 TIMES
               ASCENDING KEY IS WS-TC-CODE
               INDEXED BY TC-IDX.
               10  WS-TC-CODE          PIC X(04).
               10  WS-TC-DESCRIPTION   PIC X(30).
               10  WS-TC-TYPE          PIC X(01).
                   88  TC-DEBIT            VALUE "D".
                   88  TC-CREDIT           VALUE "C".
               10  WS-TC-GL-ACCOUNT    PIC X(10).
               10  WS-TC-VALID         PIC X(01).
                   88  TC-IS-VALID         VALUE "Y".
                   88  TC-NOT-VALID        VALUE "N".

       01  WS-TABLE-SIZE             PIC 99 VALUE 0.
       01  WS-SEARCH-CODE            PIC X(04).
       01  WS-FOUND-FLAG             PIC X VALUE "N".
           88  CODE-FOUND                VALUE "Y".
           88  CODE-NOT-FOUND            VALUE "N".

       PROCEDURE DIVISION.
      *================================================================
       1000-LOAD-TABLE.
      *--- Load from inline values ---
           INITIALIZE WS-TRANS-CODE-TABLE
           MOVE 1 TO WS-TABLE-SIZE

           MOVE "DPCK" TO WS-TC-CODE(1)
           MOVE "DEPOSIT - CHECK" TO WS-TC-DESCRIPTION(1)
           MOVE "C" TO WS-TC-TYPE(1)
           MOVE "1001001000" TO WS-TC-GL-ACCOUNT(1)
           MOVE "Y" TO WS-TC-VALID(1)

           ADD 1 TO WS-TABLE-SIZE
           MOVE "DPCA" TO WS-TC-CODE(2)
           MOVE "DEPOSIT - CASH" TO WS-TC-DESCRIPTION(2)
           MOVE "C" TO WS-TC-TYPE(2)
           MOVE "1001002000" TO WS-TC-GL-ACCOUNT(2)
           MOVE "Y" TO WS-TC-VALID(2)

           ADD 1 TO WS-TABLE-SIZE
           MOVE "WDCA" TO WS-TC-CODE(3)
           MOVE "WITHDRAWAL - CASH" TO WS-TC-DESCRIPTION(3)
           MOVE "D" TO WS-TC-TYPE(3)
           MOVE "1001002000" TO WS-TC-GL-ACCOUNT(3)
           MOVE "Y" TO WS-TC-VALID(3)

      *--- Continue for all codes... ---
           .

      *================================================================
       2000-LOOKUP-CODE.
      *================================================================
      *--- Binary search on sorted table ---
           SET CODE-NOT-FOUND TO TRUE
           SEARCH ALL WS-TC-ENTRY
               AT END
                   CONTINUE
               WHEN WS-TC-CODE(TC-IDX) = WS-SEARCH-CODE
                   SET CODE-FOUND TO TRUE
           END-SEARCH.

      *================================================================
       2100-SEQUENTIAL-SEARCH.
      *================================================================
      *--- Sequential search example ---
           SET CODE-NOT-FOUND TO TRUE
           SET TC-IDX TO 1
           SEARCH WS-TC-ENTRY
               AT END
                   CONTINUE
               WHEN WS-TC-CODE(TC-IDX) = WS-SEARCH-CODE
                   SET CODE-FOUND TO TRUE
           END-SEARCH.

      *================================================================
       2200-INLINE-SEARCH.
      *================================================================
      *--- Manual search with PERFORM ---
           SET CODE-NOT-FOUND TO TRUE
           PERFORM VARYING TC-IDX FROM 1 BY 1
               UNTIL TC-IDX > WS-TABLE-SIZE
               OR CODE-FOUND
               IF WS-TC-CODE(TC-IDX) = WS-SEARCH-CODE
                   SET CODE-FOUND TO TRUE
               END-IF
           END-PERFORM.
```

---

## Pattern 4: Validation and Error Handling

```cobol
       WORKING-STORAGE SECTION.
      *================================================================
      * ERROR HANDLING FRAMEWORK
      *================================================================
       01  WS-ERROR-TABLE.
           05  WS-ERROR-COUNT      PIC 99 VALUE 0.
           05  WS-ERROR-ENTRY OCCURS 20 TIMES.
               10  WS-ERR-FIELD    PIC X(20).
               10  WS-ERR-CODE     PIC X(04).
               10  WS-ERR-MESSAGE  PIC X(50).

       01  WS-VALIDATION-FLAGS.
           05  WS-VALID-RECORD     PIC X VALUE "Y".
               88  RECORD-IS-VALID     VALUE "Y".
               88  RECORD-HAS-ERRORS   VALUE "N".

       PROCEDURE DIVISION.
      *================================================================
       3000-VALIDATE-TRANSACTION SECTION.
      *================================================================
           MOVE 0 TO WS-ERROR-COUNT
           SET RECORD-IS-VALID TO TRUE

           PERFORM 3100-VALIDATE-ACCOUNT
           PERFORM 3200-VALIDATE-AMOUNT
           PERFORM 3300-VALIDATE-DATE
           PERFORM 3400-VALIDATE-TYPE

           IF WS-ERROR-COUNT > 0
               SET RECORD-HAS-ERRORS TO TRUE
           END-IF.

       3100-VALIDATE-ACCOUNT.
           IF TR-ACCOUNT = SPACES OR LOW-VALUES
               PERFORM 3900-ADD-ERROR-ACCT-BLANK
           ELSE
               IF TR-ACCOUNT NOT NUMERIC
                   PERFORM 3900-ADD-ERROR-ACCT-FORMAT
               END-IF
           END-IF.

       3200-VALIDATE-AMOUNT.
           IF TR-AMOUNT = 0
               PERFORM 3900-ADD-ERROR-AMT-ZERO
           END-IF
           IF TR-AMOUNT < -999999999.99 OR
              TR-AMOUNT > 999999999.99
               PERFORM 3900-ADD-ERROR-AMT-RANGE
           END-IF.

       3300-VALIDATE-DATE.
           IF TR-DATE NOT NUMERIC
               PERFORM 3900-ADD-ERROR-DATE-FORMAT
           ELSE
               IF TR-DATE(5:2) < "01" OR TR-DATE(5:2) > "12"
                   PERFORM 3900-ADD-ERROR-DATE-MONTH
               END-IF
               IF TR-DATE(7:2) < "01" OR TR-DATE(7:2) > "31"
                   PERFORM 3900-ADD-ERROR-DATE-DAY
               END-IF
           END-IF.

       3400-VALIDATE-TYPE.
           IF NOT (TR-DEPOSIT OR TR-WITHDRAWAL OR
                   TR-INTEREST OR TR-FEE)
               PERFORM 3900-ADD-ERROR-INVALID-TYPE
           END-IF.

      *--- Error addition helper paragraphs ---
       3900-ADD-ERROR-ACCT-BLANK.
           ADD 1 TO WS-ERROR-COUNT
           MOVE "ACCOUNT" TO WS-ERR-FIELD(WS-ERROR-COUNT)
           MOVE "E001" TO WS-ERR-CODE(WS-ERROR-COUNT)
           MOVE "ACCOUNT NUMBER IS BLANK"
               TO WS-ERR-MESSAGE(WS-ERROR-COUNT).

       3900-ADD-ERROR-ACCT-FORMAT.
           ADD 1 TO WS-ERROR-COUNT
           MOVE "ACCOUNT" TO WS-ERR-FIELD(WS-ERROR-COUNT)
           MOVE "E002" TO WS-ERR-CODE(WS-ERROR-COUNT)
           MOVE "ACCOUNT NUMBER MUST BE NUMERIC"
               TO WS-ERR-MESSAGE(WS-ERROR-COUNT).

       3900-ADD-ERROR-AMT-ZERO.
           ADD 1 TO WS-ERROR-COUNT
           MOVE "AMOUNT" TO WS-ERR-FIELD(WS-ERROR-COUNT)
           MOVE "E010" TO WS-ERR-CODE(WS-ERROR-COUNT)
           MOVE "AMOUNT CANNOT BE ZERO"
               TO WS-ERR-MESSAGE(WS-ERROR-COUNT).

       3900-ADD-ERROR-AMT-RANGE.
           ADD 1 TO WS-ERROR-COUNT
           MOVE "AMOUNT" TO WS-ERR-FIELD(WS-ERROR-COUNT)
           MOVE "E011" TO WS-ERR-CODE(WS-ERROR-COUNT)
           MOVE "AMOUNT OUT OF VALID RANGE"
               TO WS-ERR-MESSAGE(WS-ERROR-COUNT).

       3900-ADD-ERROR-DATE-FORMAT.
           ADD 1 TO WS-ERROR-COUNT
           MOVE "DATE" TO WS-ERR-FIELD(WS-ERROR-COUNT)
           MOVE "E020" TO WS-ERR-CODE(WS-ERROR-COUNT)
           MOVE "DATE MUST BE NUMERIC YYYYMMDD"
               TO WS-ERR-MESSAGE(WS-ERROR-COUNT).

       3900-ADD-ERROR-DATE-MONTH.
           ADD 1 TO WS-ERROR-COUNT
           MOVE "DATE" TO WS-ERR-FIELD(WS-ERROR-COUNT)
           MOVE "E021" TO WS-ERR-CODE(WS-ERROR-COUNT)
           MOVE "MONTH MUST BE 01-12"
               TO WS-ERR-MESSAGE(WS-ERROR-COUNT).

       3900-ADD-ERROR-DATE-DAY.
           ADD 1 TO WS-ERROR-COUNT
           MOVE "DATE" TO WS-ERR-FIELD(WS-ERROR-COUNT)
           MOVE "E022" TO WS-ERR-CODE(WS-ERROR-COUNT)
           MOVE "DAY MUST BE 01-31"
               TO WS-ERR-MESSAGE(WS-ERROR-COUNT).

       3900-ADD-ERROR-INVALID-TYPE.
           ADD 1 TO WS-ERROR-COUNT
           MOVE "TYPE" TO WS-ERR-FIELD(WS-ERROR-COUNT)
           MOVE "E030" TO WS-ERR-CODE(WS-ERROR-COUNT)
           MOVE "INVALID TRANSACTION TYPE"
               TO WS-ERR-MESSAGE(WS-ERROR-COUNT).
```

---

## Pattern 5: CICS Pseudo-Conversational Program

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. INQPROG.
      *================================================================
      * ACCOUNT INQUIRY - PSEUDO-CONVERSATIONAL CICS PROGRAM
      *================================================================

       DATA DIVISION.
       WORKING-STORAGE SECTION.
           COPY DFHAID.
           COPY DFHBMSCA.

       01  WS-COMMAREA.
           05  WS-COMM-STATE       PIC X(01).
               88  STATE-INITIAL       VALUE "I".
               88  STATE-ACCOUNT       VALUE "A".
               88  STATE-DETAIL        VALUE "D".
           05  WS-COMM-ACCOUNT     PIC X(12).
           05  WS-COMM-MESSAGE     PIC X(50).

       01  WS-RESPONSE             PIC S9(08) COMP.
       01  WS-RESPONSE2            PIC S9(08) COMP.

           COPY INQMAP.

       01  WS-ACCOUNT-RECORD.
           05  WS-ACCT-KEY         PIC X(12).
           05  WS-ACCT-NAME        PIC X(50).
           05  WS-ACCT-BALANCE     PIC S9(11)V99 COMP-3.
           05  WS-ACCT-STATUS      PIC X(01).
           05  WS-ACCT-TYPE        PIC X(02).

       LINKAGE SECTION.
       01  DFHCOMMAREA             PIC X(63).

       PROCEDURE DIVISION.
      *================================================================
       0000-MAIN SECTION.
      *================================================================
           EVALUATE TRUE

               WHEN EIBCALEN = 0
      *            First time entry - show initial screen
                   PERFORM 1000-INITIAL-ENTRY

               WHEN EIBAID = DFHCLEAR
      *            Clear key - end program
                   PERFORM 9000-END-PROGRAM

               WHEN EIBAID = DFHPF3
      *            PF3 - end program
                   PERFORM 9000-END-PROGRAM

               WHEN EIBAID = DFHENTER
      *            Enter key - process based on state
                   MOVE DFHCOMMAREA TO WS-COMMAREA
                   PERFORM 2000-PROCESS-ENTER

               WHEN OTHER
      *            Invalid key
                   MOVE DFHCOMMAREA TO WS-COMMAREA
                   MOVE "INVALID KEY PRESSED" TO WS-COMM-MESSAGE
                   PERFORM 8000-SEND-MAP

           END-EVALUATE

           PERFORM 9500-RETURN-TRANS.

      *================================================================
       1000-INITIAL-ENTRY SECTION.
      *================================================================
           SET STATE-INITIAL TO TRUE
           MOVE SPACES TO WS-COMM-MESSAGE
           MOVE SPACES TO WS-COMM-ACCOUNT
           PERFORM 8100-SEND-ERASE.

      *================================================================
       2000-PROCESS-ENTER SECTION.
      *================================================================
           EVALUATE TRUE
               WHEN STATE-INITIAL
                   PERFORM 2100-GET-ACCOUNT-INPUT
               WHEN STATE-ACCOUNT
                   PERFORM 2200-PROCESS-ACCOUNT
               WHEN STATE-DETAIL
                   PERFORM 2300-PROCESS-DETAIL
           END-EVALUATE.

       2100-GET-ACCOUNT-INPUT.
           EXEC CICS RECEIVE
               MAP('INQMAP1')
               MAPSET('INQSET1')
               INTO(INQMAP1I)
               RESP(WS-RESPONSE)
           END-EXEC

           IF WS-RESPONSE = DFHRESP(MAPFAIL)
               MOVE "PLEASE ENTER ACCOUNT NUMBER"
                   TO WS-COMM-MESSAGE
               PERFORM 8000-SEND-MAP
           ELSE
               MOVE ACCTNOI TO WS-COMM-ACCOUNT
               PERFORM 3000-READ-ACCOUNT
           END-IF.

       2200-PROCESS-ACCOUNT.
           CONTINUE.

       2300-PROCESS-DETAIL.
           CONTINUE.

      *================================================================
       3000-READ-ACCOUNT SECTION.
      *================================================================
           EXEC CICS READ
               FILE('ACCTFILE')
               INTO(WS-ACCOUNT-RECORD)
               RIDFLD(WS-COMM-ACCOUNT)
               RESP(WS-RESPONSE)
           END-EXEC

           EVALUATE WS-RESPONSE
               WHEN DFHRESP(NORMAL)
                   SET STATE-ACCOUNT TO TRUE
                   PERFORM 3100-DISPLAY-ACCOUNT
               WHEN DFHRESP(NOTFND)
                   MOVE "ACCOUNT NOT FOUND" TO WS-COMM-MESSAGE
                   PERFORM 8000-SEND-MAP
               WHEN OTHER
                   MOVE "ERROR READING ACCOUNT FILE"
                       TO WS-COMM-MESSAGE
                   PERFORM 8000-SEND-MAP
           END-EVALUATE.

       3100-DISPLAY-ACCOUNT.
           MOVE WS-ACCT-KEY TO ACCTNOO
           MOVE WS-ACCT-NAME TO NAMEO
           MOVE WS-ACCT-BALANCE TO BALANCEO
           MOVE WS-ACCT-STATUS TO STATUSO
           MOVE SPACES TO WS-COMM-MESSAGE
           PERFORM 8000-SEND-MAP.

      *================================================================
       8000-SEND-MAP SECTION.
      *================================================================
           MOVE WS-COMM-MESSAGE TO MESSAGEO
           EXEC CICS SEND
               MAP('INQMAP1')
               MAPSET('INQSET1')
               FROM(INQMAP1O)
               CURSOR
               RESP(WS-RESPONSE)
           END-EXEC.

       8100-SEND-ERASE.
           MOVE LOW-VALUES TO INQMAP1O
           MOVE -1 TO ACCTNOL
           EXEC CICS SEND
               MAP('INQMAP1')
               MAPSET('INQSET1')
               FROM(INQMAP1O)
               ERASE
               CURSOR
               RESP(WS-RESPONSE)
           END-EXEC.

      *================================================================
       9000-END-PROGRAM SECTION.
      *================================================================
           EXEC CICS SEND CONTROL
               ERASE
               FREEKB
           END-EXEC
           EXEC CICS RETURN END-EXEC.

       9500-RETURN-TRANS.
           EXEC CICS RETURN
               TRANSID('INQ1')
               COMMAREA(WS-COMMAREA)
               LENGTH(LENGTH OF WS-COMMAREA)
           END-EXEC.
```

---

## Pattern 6: DB2 Batch with Commit Frequency

```cobol
       WORKING-STORAGE SECTION.
       01  WS-COMMIT-FREQ          PIC 9(05) VALUE 1000.
       01  WS-COMMIT-COUNT         PIC 9(09) VALUE 0.
       01  WS-TOTAL-PROCESSED      PIC 9(09) VALUE 0.

           EXEC SQL INCLUDE SQLCA END-EXEC.

       PROCEDURE DIVISION.
      *================================================================
       2000-PROCESS-LOOP SECTION.
      *================================================================
           PERFORM UNTIL END-OF-FILE
               PERFORM 2100-PROCESS-RECORD
               ADD 1 TO WS-TOTAL-PROCESSED
               ADD 1 TO WS-COMMIT-COUNT

               IF WS-COMMIT-COUNT >= WS-COMMIT-FREQ
                   PERFORM 2900-COMMIT-WORK
                   MOVE 0 TO WS-COMMIT-COUNT
               END-IF

               PERFORM 1100-READ-INPUT
           END-PERFORM

      *--- Final commit for remaining records ---
           IF WS-COMMIT-COUNT > 0
               PERFORM 2900-COMMIT-WORK
           END-IF.

       2100-PROCESS-RECORD.
           EXEC SQL
               UPDATE ACCOUNT
               SET INTEREST_ACCRUED = INTEREST_ACCRUED +
                   (CURRENT_BALANCE * :WS-DAILY-RATE)
               WHERE ACCOUNT_ID = :WS-ACCOUNT-ID
           END-EXEC

           IF SQLCODE NOT = 0
               PERFORM 9100-SQL-ERROR
           END-IF.

       2900-COMMIT-WORK.
           EXEC SQL COMMIT END-EXEC
           DISPLAY "COMMITTED: " WS-TOTAL-PROCESSED " RECORDS".

       9100-SQL-ERROR.
           DISPLAY "SQL ERROR: " SQLCODE
           DISPLAY "SQLERRMC: " SQLERRMC
           EXEC SQL ROLLBACK END-EXEC
           MOVE 16 TO RETURN-CODE
           STOP RUN.
```

---

## Transpiler Pattern Mapping

### Control Breaks to Scala

```scala
// COBOL control break pattern
case class BreakAccumulator(
  typeTotal: BigDecimal = 0,
  branchTotal: BigDecimal = 0,
  regionTotal: BigDecimal = 0,
  grandTotal: BigDecimal = 0
)

def processWithBreaks(records: Iterator[Record]): Unit = {
  records.foldLeft((None: Option[Record], BreakAccumulator())) {
    case ((prev, acc), current) =>
      val newAcc = prev match {
        case Some(p) if p.region != current.region =>
          printRegionTotal(acc)
          acc.copy(regionTotal = 0, branchTotal = 0, typeTotal = 0)
        case Some(p) if p.branch != current.branch =>
          printBranchTotal(acc)
          acc.copy(branchTotal = 0, typeTotal = 0)
        case _ => acc
      }
      (Some(current), processRecord(current, newAcc))
  }
}
```

### Validation Pattern to Scala

```scala
sealed trait ValidationError
case class BlankField(field: String) extends ValidationError
case class InvalidFormat(field: String, expected: String) extends ValidationError
case class OutOfRange(field: String, min: Any, max: Any) extends ValidationError

def validateTransaction(tx: Transaction): ValidatedNel[ValidationError, Transaction] = {
  (validateAccount(tx.account),
   validateAmount(tx.amount),
   validateDate(tx.date),
   validateType(tx.txType))
    .mapN((_, _, _, _) => tx)
}
```

### Pseudo-Conversational to REST

```scala
// CICS pseudo-conversational maps to REST + session
sealed trait State
case object Initial extends State
case class AccountEntered(accountId: String) extends State
case class DetailView(accountId: String, detail: AccountDetail) extends State

def handleRequest(
  session: Session,
  request: Request
): (Session, Response) = {
  session.state match {
    case Initial =>
      val accountId = request.getParam("account")
      val account = accountService.lookup(accountId)
      (session.copy(state = AccountEntered(accountId)),
       AccountResponse(account))
    case AccountEntered(id) =>
      // ... handle next state
  }
}
```
