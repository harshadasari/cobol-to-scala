       IDENTIFICATION DIVISION.
       PROGRAM-ID. TRANSPROC.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
           EXEC SQL INCLUDE SQLCA END-EXEC.
       01  WS-TRANSACTION.
           05  WS-TRANS-ID          PIC 9(12).
           05  WS-TRANS-DATE        PIC 9(08).
           05  WS-TRANS-AMOUNT      PIC S9(11)V99 COMP-3.
           05  WS-TRANS-TYPE        PIC X(02).
               88  TRANS-DEBIT          VALUE 'DB'.
               88  TRANS-CREDIT         VALUE 'CR'.
       01  WS-ACCOUNT.
           05  WS-ACCT-ID           PIC 9(10).
           05  WS-ACCT-BALANCE      PIC S9(13)V99 COMP-3.
       01  SQLCODE-DISPLAY          PIC -9(04).
      *
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM 1000-FETCH-TRANSACTION
           IF SQLCODE = 0
               PERFORM 2000-UPDATE-BALANCE
               IF SQLCODE = 0
                   EXEC SQL COMMIT END-EXEC
               ELSE
                   EXEC SQL ROLLBACK END-EXEC
               END-IF
           END-IF
           GOBACK.
      *
       1000-FETCH-TRANSACTION.
           EXEC SQL
               SELECT TRANS_ID, TRANS_DATE, TRANS_AMOUNT, TRANS_TYPE
               INTO :WS-TRANS-ID, :WS-TRANS-DATE,
                    :WS-TRANS-AMOUNT, :WS-TRANS-TYPE
               FROM TRANSACTIONS
               WHERE TRANS_STATUS = 'P'
               FETCH FIRST 1 ROW ONLY
           END-EXEC.
      *
       2000-UPDATE-BALANCE.
           EXEC SQL
               SELECT ACCT_BALANCE
               INTO :WS-ACCT-BALANCE
               FROM ACCOUNTS
               WHERE ACCT_ID = :WS-ACCT-ID
               FOR UPDATE
           END-EXEC
           IF SQLCODE = 0
               EVALUATE TRUE
                   WHEN TRANS-DEBIT
                       SUBTRACT WS-TRANS-AMOUNT FROM WS-ACCT-BALANCE
                   WHEN TRANS-CREDIT
                       ADD WS-TRANS-AMOUNT TO WS-ACCT-BALANCE
               END-EVALUATE
               EXEC SQL
                   UPDATE ACCOUNTS
                   SET ACCT_BALANCE = :WS-ACCT-BALANCE
                   WHERE ACCT_ID = :WS-ACCT-ID
               END-EXEC
           END-IF.
