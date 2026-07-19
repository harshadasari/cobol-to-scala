      * jj07: replaces an originally-planned COMPUTE ON SIZE ERROR +
      * RECURSIVE probe, which hit a real GnuCOBOL toolchain bug in this
      * sandbox (a missing `cob_decimal` C type in the generated .l2.h
      * header, reproducible even with trivial non-overflowing
      * arithmetic and no ON SIZE ERROR clause needed to trigger it -
      * see round-34 notes; not usable as an oracle-verified probe).
      * Fresh direction instead: SEARCH ALL (a binary search against an
      * INDEXED-by, ASCENDING KEY table) has never been combined with
      * the RECURSIVE nested-local-def paragraph convention - this
      * probes it inside a RECURSIVE program's base-case activation.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ07MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "JJ07SUB" USING WS-START.
           STOP RUN.
       END PROGRAM JJ07MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ07SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9.
       01  TBL-AREA.
           05  TBL-ROW OCCURS 5 TIMES
               ASCENDING KEY IS ROW-KEY
               INDEXED BY ROW-IDX.
               10  ROW-KEY PIC 9(2).
               10  ROW-VAL PIC X(4).
       01  WS-FOUND PIC X(4).
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LK-N.
           IF LK-N = 0
               MOVE 10 TO ROW-KEY(1)
               MOVE "TEN " TO ROW-VAL(1)
               MOVE 20 TO ROW-KEY(2)
               MOVE "TWTY" TO ROW-VAL(2)
               MOVE 30 TO ROW-KEY(3)
               MOVE "THTY" TO ROW-VAL(3)
               MOVE 40 TO ROW-KEY(4)
               MOVE "FRTY" TO ROW-VAL(4)
               MOVE 50 TO ROW-KEY(5)
               MOVE "FFTY" TO ROW-VAL(5)
               MOVE SPACES TO WS-FOUND
               SEARCH ALL TBL-ROW
                   WHEN ROW-KEY(ROW-IDX) = 30
                       MOVE ROW-VAL(ROW-IDX) TO WS-FOUND
               END-SEARCH
               DISPLAY "FOUND=[" WS-FOUND "]"
               MOVE SPACES TO WS-FOUND
               SEARCH ALL TBL-ROW
                   AT END
                       MOVE "NONE" TO WS-FOUND
                   WHEN ROW-KEY(ROW-IDX) = 99
                       MOVE ROW-VAL(ROW-IDX) TO WS-FOUND
               END-SEARCH
               DISPLAY "MISSING=[" WS-FOUND "]"
           ELSE
               SUBTRACT 1 FROM LK-N GIVING WS-NEXT
               CALL "JJ07SUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       END PROGRAM JJ07SUB.
