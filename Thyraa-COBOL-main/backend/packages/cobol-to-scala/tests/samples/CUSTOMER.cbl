       IDENTIFICATION DIVISION.
       PROGRAM-ID. CUSTMAINT.
       AUTHOR. THYRAA.
      *
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT CUSTOMER-FILE ASSIGN TO 'CUSTFILE'
               ORGANIZATION IS INDEXED
               ACCESS MODE IS DYNAMIC
               RECORD KEY IS CUST-ID
               FILE STATUS IS WS-FILE-STATUS.
      *
       DATA DIVISION.
       FILE SECTION.
       FD  CUSTOMER-FILE.
       01  CUSTOMER-RECORD.
           05  CUST-ID              PIC 9(10).
           05  CUST-NAME            PIC X(50).
           05  CUST-ADDRESS.
               10  CUST-STREET      PIC X(30).
               10  CUST-CITY        PIC X(20).
               10  CUST-STATE       PIC X(02).
               10  CUST-ZIP         PIC 9(05).
           05  CUST-BALANCE         PIC S9(11)V99 COMP-3.
           05  CUST-CREDIT-LIMIT    PIC S9(09)V99 COMP-3.
           05  CUST-STATUS          PIC X(01).
               88  CUST-ACTIVE          VALUE 'A'.
               88  CUST-SUSPENDED       VALUE 'S'.
               88  CUST-CLOSED          VALUE 'C'.
           05  CUST-TYPE            PIC X(02).
               88  CUST-RETAIL          VALUE 'RT'.
               88  CUST-WHOLESALE       VALUE 'WS'.
               88  CUST-CORPORATE       VALUE 'CO'.
           05  CUST-OPEN-DATE       PIC 9(08).
           05  CUST-LAST-PURCHASE   PIC 9(08).
      *
       WORKING-STORAGE SECTION.
       01  WS-FILE-STATUS           PIC X(02).
           88  WS-FILE-OK               VALUE '00'.
           88  WS-FILE-EOF              VALUE '10'.
           88  WS-FILE-NOT-FOUND        VALUE '23'.
       01  WS-EOF-FLAG              PIC X(01) VALUE 'N'.
           88  WS-EOF                   VALUE 'Y'.
       01  WS-COUNTERS.
           05  WS-READ-COUNT        PIC 9(07) VALUE ZEROS.
           05  WS-UPDATE-COUNT      PIC 9(07) VALUE ZEROS.
           05  WS-ERROR-COUNT       PIC 9(05) VALUE ZEROS.
       01  WS-WORK-AREAS.
           05  WS-NEW-BALANCE       PIC S9(11)V99.
           05  WS-TRANSACTION-AMT   PIC S9(09)V99.
      *
       PROCEDURE DIVISION.
       0000-MAIN-PARAGRAPH.
           PERFORM 1000-INITIALIZE
           PERFORM 2000-PROCESS-RECORDS
               UNTIL WS-EOF
           PERFORM 9000-FINALIZE
           STOP RUN.
      *
       1000-INITIALIZE.
           OPEN I-O CUSTOMER-FILE
           IF NOT WS-FILE-OK
               DISPLAY 'ERROR OPENING FILE: ' WS-FILE-STATUS
               MOVE 'Y' TO WS-EOF-FLAG
           END-IF.
      *
       2000-PROCESS-RECORDS.
           READ CUSTOMER-FILE NEXT
               AT END
                   SET WS-EOF TO TRUE
               NOT AT END
                   ADD 1 TO WS-READ-COUNT
                   PERFORM 3000-PROCESS-CUSTOMER
           END-READ.
      *
       3000-PROCESS-CUSTOMER.
           EVALUATE TRUE
               WHEN CUST-ACTIVE
                   PERFORM 3100-ACTIVE-CUSTOMER
               WHEN CUST-SUSPENDED
                   PERFORM 3200-SUSPENDED-CUSTOMER
               WHEN CUST-CLOSED
                   PERFORM 3300-CLOSED-CUSTOMER
               WHEN OTHER
                   ADD 1 TO WS-ERROR-COUNT
           END-EVALUATE.
      *
       3100-ACTIVE-CUSTOMER.
           IF CUST-BALANCE > CUST-CREDIT-LIMIT
               MOVE 'S' TO CUST-STATUS
               REWRITE CUSTOMER-RECORD
               ADD 1 TO WS-UPDATE-COUNT
           END-IF.
      *
       3200-SUSPENDED-CUSTOMER.
           IF CUST-BALANCE <= 0
               MOVE 'A' TO CUST-STATUS
               REWRITE CUSTOMER-RECORD
               ADD 1 TO WS-UPDATE-COUNT
           END-IF.
      *
       3300-CLOSED-CUSTOMER.
           CONTINUE.
      *
       9000-FINALIZE.
           CLOSE CUSTOMER-FILE
           DISPLAY 'RECORDS READ: ' WS-READ-COUNT
           DISPLAY 'RECORDS UPDATED: ' WS-UPDATE-COUNT
           DISPLAY 'ERRORS: ' WS-ERROR-COUNT.
