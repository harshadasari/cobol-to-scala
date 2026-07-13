       IDENTIFICATION DIVISION.
       PROGRAM-ID. G06MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-ROW OCCURS 3 TIMES.
               10  W-CODE PIC X(2).
               10  W-NUM  PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO W-CODE(1). MOVE 111 TO W-NUM(1).
           MOVE "BB" TO W-CODE(2). MOVE 222 TO W-NUM(2).
           MOVE "CC" TO W-CODE(3). MOVE 333 TO W-NUM(3).
           DISPLAY "BEFORE1=" W-CODE(1) " " W-NUM(1).
           CALL "G06SUB" USING BY VALUE WS-REC.
           DISPLAY "AFTER1=" W-CODE(1) " " W-NUM(1).
           STOP RUN.
       END PROGRAM G06MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. G06SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-GRP.
           05  LK-ROW OCCURS 3 TIMES.
               10  LK-CODE PIC X(2).
               10  LK-NUM  PIC 9(3).
       PROCEDURE DIVISION USING LK-GRP.
       SUB-PARA.
           DISPLAY "SUB-SEEN-1=" LK-CODE(1) " " LK-NUM(1).
           DISPLAY "SUB-SEEN-2=" LK-CODE(2) " " LK-NUM(2).
           MOVE "ZZ" TO LK-CODE(1).
           MOVE 999 TO LK-NUM(1).
           DISPLAY "SUB-AFTER-1=" LK-CODE(1) " " LK-NUM(1).
       END PROGRAM G06SUB.
