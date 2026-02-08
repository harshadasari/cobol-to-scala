       IDENTIFICATION DIVISION.
       PROGRAM-ID. SIMPLE-TEST.

       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  CUSTOMER-RECORD.
           05  CUST-ID             PIC 9(10).
           05  CUST-NAME           PIC X(50).
           05  CUST-BALANCE        PIC S9(9)V99 COMP-3.
           05  CUST-STATUS         PIC X(01).
               88  STATUS-ACTIVE       VALUE "A".
               88  STATUS-CLOSED       VALUE "C".

       01  WS-TOTAL                PIC S9(11)V99 COMP-3.
       01  WS-COUNT                PIC 9(05).

       PROCEDURE DIVISION.
       MAIN-PROCESS.
           DISPLAY "Starting Customer Processing"
           MOVE ZERO TO WS-TOTAL
           MOVE ZERO TO WS-COUNT
           PERFORM PROCESS-CUSTOMER
           DISPLAY "Total: " WS-TOTAL
           DISPLAY "Count: " WS-COUNT
           STOP RUN.

       PROCESS-CUSTOMER.
           ADD 1 TO WS-COUNT
           ADD CUST-BALANCE TO WS-TOTAL.
