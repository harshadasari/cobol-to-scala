       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1311.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-A            PIC X(3).
           05  WS-B            PIC X(3).
           05  WS-C            PIC X(3).
       66  WS-AB RENAMES WS-A THRU WS-B.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-A.
           MOVE "BBB" TO WS-B.
           MOVE "CCC" TO WS-C.
           DISPLAY "AB=[" WS-AB "]".
           MOVE "XXXXXX" TO WS-AB.
           DISPLAY "A=[" WS-A "] B=[" WS-B "] C=[" WS-C "]".
           STOP RUN.
