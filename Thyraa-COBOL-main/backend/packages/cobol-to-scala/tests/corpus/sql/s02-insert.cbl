       IDENTIFICATION DIVISION.
       PROGRAM-ID. S02INS.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEW-ID            PIC X(10).
       01  WS-NEW-NAME          PIC X(30).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 'C0002' TO WS-NEW-ID
           MOVE 'ACME CORP' TO WS-NEW-NAME
           EXEC SQL
               INSERT INTO CUSTOMER (CUST_ID, CUST_NAME)
                   VALUES (:WS-NEW-ID, :WS-NEW-NAME)
           END-EXEC
           STOP RUN.
