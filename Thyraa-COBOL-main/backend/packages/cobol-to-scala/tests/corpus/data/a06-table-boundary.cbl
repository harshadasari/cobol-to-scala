       IDENTIFICATION DIVISION.
       PROGRAM-ID. A06TBL.
      *
      * Adversarial: nested OCCURS at boundaries, subscript arithmetic
      * WS-T(WS-I + 1), first/last element access.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I                PIC 9(2) VALUE 1.
       01  WS-OUTER-TABLE.
           05  WS-OUTER OCCURS 3 TIMES.
               10  WS-INNER OCCURS 4 TIMES PIC 9(3).
       01  WS-FLAT-TABLE.
           05  WS-T OCCURS 5 TIMES PIC S9(4) COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 111 TO WS-INNER(1,1)
           MOVE 999 TO WS-INNER(3,4)
           MOVE 555 TO WS-INNER(2,2)
           DISPLAY 'FIRST=' WS-INNER(1,1)
           DISPLAY 'LAST=' WS-INNER(3,4)
           DISPLAY 'MID=' WS-INNER(2,2)

           MOVE 10 TO WS-T(1)
           MOVE 20 TO WS-T(2)
           MOVE 30 TO WS-T(3)
           MOVE 40 TO WS-T(4)
           MOVE 50 TO WS-T(5)
           MOVE 1 TO WS-I
           DISPLAY 'T-I-PLUS-1=' WS-T(WS-I + 1)
           MOVE 3 TO WS-I
           DISPLAY 'T-I-PLUS-1-MID=' WS-T(WS-I + 1)
           MOVE 4 TO WS-I
           DISPLAY 'T-I-PLUS-1-LAST=' WS-T(WS-I + 1)

           STOP RUN.
