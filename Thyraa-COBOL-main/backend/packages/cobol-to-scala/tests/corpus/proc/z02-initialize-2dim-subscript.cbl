      * Round-12 probe z02: INITIALIZE of a subscripted element inside a
      * TWO-dimensional (nested OCCURS-within-OCCURS) table - attacks
      * whether the round-11 y17 subscript fix generalizes past a single
      * subscript dimension to a genuine row/col addressed element.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z02INIT2D.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-MATRIX.
           05  WS-ROW OCCURS 3 TIMES.
               10  WS-COL OCCURS 3 TIMES.
                   15  WS-CELL PIC 9(3) VALUE 0.
                   15  WS-TAG  PIC X(2) VALUE "ZZ".
       01  WS-I PIC 9 VALUE 1.
       01  WS-J PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 3
                   COMPUTE WS-CELL(WS-I, WS-J) =
                       (WS-I * 100) + WS-J
                   STRING WS-I DELIMITED BY SIZE
                       WS-J DELIMITED BY SIZE
                       INTO WS-TAG(WS-I, WS-J)
               END-PERFORM
           END-PERFORM.

           INITIALIZE WS-COL(2, 2).

           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 3
                   DISPLAY "CELL(" WS-I "," WS-J ")="
                       WS-CELL(WS-I, WS-J) "/" WS-TAG(WS-I, WS-J)
               END-PERFORM
           END-PERFORM.
           STOP RUN.
