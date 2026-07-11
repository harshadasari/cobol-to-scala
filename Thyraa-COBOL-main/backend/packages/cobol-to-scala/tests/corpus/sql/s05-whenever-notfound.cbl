       IDENTIFICATION DIVISION.
       PROGRAM-ID. S05WHN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CUST-ID           PIC X(10).
       01  WS-CUST-NAME         PIC X(30).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 'C9999' TO WS-CUST-ID
           EXEC SQL
               WHENEVER NOT FOUND GOTO 9999-NOT-FOUND
           END-EXEC
           EXEC SQL
               SELECT CUST-NAME
                 INTO :WS-CUST-NAME
                 FROM CUSTOMER
                WHERE CUST-ID = :WS-CUST-ID
           END-EXEC
           STOP RUN.
       9999-NOT-FOUND.
           DISPLAY 'CUSTOMER NOT FOUND'
           STOP RUN.
