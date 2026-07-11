       IDENTIFICATION DIVISION.
       PROGRAM-ID. S01SEL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CUST-ID           PIC X(10).
       01  WS-CUST-NAME         PIC X(30).
       01  WS-CUST-BALANCE      PIC S9(7)V99 COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 'C0001' TO WS-CUST-ID
           EXEC SQL
               SELECT CUST-NAME, CUST-BALANCE
                 INTO :WS-CUST-NAME, :WS-CUST-BALANCE
                 FROM CUSTOMER
                WHERE CUST-ID = :WS-CUST-ID
           END-EXEC
           STOP RUN.
