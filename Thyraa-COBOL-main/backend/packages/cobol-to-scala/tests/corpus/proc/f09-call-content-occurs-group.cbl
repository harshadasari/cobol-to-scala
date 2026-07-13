       IDENTIFICATION DIVISION.
       PROGRAM-ID. F09-MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-COUNT  PIC 9(2) VALUE 3.
           05 WS-ITEM   PIC X(4) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAA" TO WS-ITEM(1).
           MOVE "BBBB" TO WS-ITEM(2).
           MOVE "CCCC" TO WS-ITEM(3).
           DISPLAY "BEFORE1=" WS-ITEM(1) " 2=" WS-ITEM(2)
               " 3=" WS-ITEM(3).
           CALL "F09SUB" USING BY CONTENT WS-REC.
           DISPLAY "AFTER1=" WS-ITEM(1) " 2=" WS-ITEM(2)
               " 3=" WS-ITEM(3).
           DISPLAY "COUNT=" WS-COUNT.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. F09SUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-REC.
           05 LK-COUNT PIC 9(2).
           05 LK-ITEM  PIC X(4) OCCURS 3 TIMES.
       PROCEDURE DIVISION USING LK-REC.
       SUB-PARA.
           DISPLAY "SUB-SEEN-1=" LK-ITEM(1) " 2=" LK-ITEM(2)
               " 3=" LK-ITEM(3).
           MOVE "ZZZZ" TO LK-ITEM(1).
           MOVE 99 TO LK-COUNT.
           DISPLAY "SUB-AFTER-1=" LK-ITEM(1).
           GOBACK.
       END PROGRAM F09SUB.
       END PROGRAM F09-MAIN.
