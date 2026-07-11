       IDENTIFICATION DIVISION.
       PROGRAM-ID. P04OCCURS.
      *
      * Phase 1 corpus: fixed OCCURS table, nested OCCURS, subscripted
      * access, PERFORM VARYING loop summing.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I                PIC 9(2).
       01  WS-J                PIC 9(2).
       01  WS-QTY-TOTAL        PIC 9(5).
       01  WS-MATRIX-TOTAL     PIC 9(5).
       01  WS-LINE-ITEMS.
           05  WS-ITEM         OCCURS 5 TIMES.
               10  WS-QTY      PIC 9(3).
               10  WS-PRICE    PIC 9(3)V99.
       01  WS-MATRIX.
           05  WS-ROW          OCCURS 3 TIMES.
               10  WS-COL      OCCURS 4 TIMES PIC 9(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 10 TO WS-QTY(1)
           MOVE 20 TO WS-QTY(2)
           MOVE 30 TO WS-QTY(3)
           MOVE 40 TO WS-QTY(4)
           MOVE 50 TO WS-QTY(5)
           MOVE 1.50 TO WS-PRICE(1)
           MOVE 2.00 TO WS-PRICE(2)
           MOVE 2.50 TO WS-PRICE(3)
           MOVE 3.00 TO WS-PRICE(4)
           MOVE 3.50 TO WS-PRICE(5)
           MOVE 0 TO WS-QTY-TOTAL
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 5
               ADD WS-QTY(WS-I) TO WS-QTY-TOTAL
           END-PERFORM
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 4
                   COMPUTE WS-COL(WS-I, WS-J) = (WS-I * 10) + WS-J
               END-PERFORM
           END-PERFORM
           MOVE 0 TO WS-MATRIX-TOTAL
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 4
                   ADD WS-COL(WS-I, WS-J) TO WS-MATRIX-TOTAL
               END-PERFORM
           END-PERFORM
           DISPLAY 'QTY1=' WS-QTY(1)
           DISPLAY 'QTY5=' WS-QTY(5)
           DISPLAY 'PRICE3=' WS-PRICE(3)
           DISPLAY 'QTY-TOTAL=' WS-QTY-TOTAL
           DISPLAY 'MATRIX-1-1=' WS-COL(1, 1)
           DISPLAY 'MATRIX-2-3=' WS-COL(2, 3)
           DISPLAY 'MATRIX-3-4=' WS-COL(3, 4)
           DISPLAY 'MATRIX-TOTAL=' WS-MATRIX-TOTAL
           STOP RUN.
