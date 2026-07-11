       IDENTIFICATION DIVISION.
       PROGRAM-ID. RENREDEF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-A       PIC X(3).
           05  WS-B       PIC X(3).
           05  WS-B-NUM REDEFINES WS-B PIC 9(3).
           05  WS-C       PIC X(3).
       66  WS-BC RENAMES WS-B THRU WS-C.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-A.
           MOVE "123" TO WS-B.
           MOVE "CCC" TO WS-C.
           DISPLAY "BC=[" WS-BC "]".
           DISPLAY "BNUM=" WS-B-NUM.
           MOVE "XXXXXX" TO WS-BC.
           DISPLAY "A=[" WS-A "] B=[" WS-B "] C=[" WS-C "]".
           STOP RUN.
