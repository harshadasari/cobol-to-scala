       IDENTIFICATION DIVISION.
       PROGRAM-ID. RENCALL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-A       PIC X(3).
           05  WS-B       PIC X(3).
           05  WS-C       PIC X(3).
       66  WS-AB RENAMES WS-A THRU WS-B.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-A.
           MOVE "BBB" TO WS-B.
           MOVE "CCC" TO WS-C.
           DISPLAY "BEFORE AB=[" WS-AB "]".
           CALL "SUB1" USING BY REFERENCE WS-AB.
           DISPLAY "AFTER A=[" WS-A "] B=[" WS-B "] C=[" WS-C "]".
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. SUB1.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-AB PIC X(6).
       PROCEDURE DIVISION USING LK-AB.
       SUB-PARA.
           DISPLAY "IN-SUB LK-AB=[" LK-AB "]".
           MOVE "ZZZZZZ" TO LK-AB.
           GOBACK.
       END PROGRAM SUB1.
       END PROGRAM RENCALL.
