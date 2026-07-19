      * ll06 (round 36): fresh-territory probe - PERFORM ... VARYING with
      * THREE nested index variables (VARYING ... AFTER ... AFTER), each
      * with a different step/bound, writing into a 3-dimensional table to
      * confirm the innermost-varies-fastest nesting order and each loop's
      * own termination test are both correct.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL06.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(1).
       01  WS-J PIC 9(1).
       01  WS-K PIC 9(1).
       01  WS-COUNT PIC 9(3) VALUE 0.
       01  WS-TABLE.
           05  WS-CELL OCCURS 3 TIMES.
               10  WS-CELL-ROW OCCURS 2 TIMES.
                   15  WS-CELL-VAL PIC 9(3) OCCURS 2 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               AFTER WS-J FROM 1 BY 1 UNTIL WS-J > 2
               AFTER WS-K FROM 2 BY -1 UNTIL WS-K < 1
                   ADD 1 TO WS-COUNT
                   MOVE WS-COUNT TO WS-CELL-VAL(WS-I, WS-J, WS-K)
                   DISPLAY "I=" WS-I " J=" WS-J " K=" WS-K
                       " N=" WS-COUNT
           END-PERFORM.
           DISPLAY "TOTAL=" WS-COUNT.
           DISPLAY "CELL(2,1,2)=" WS-CELL-VAL(2, 1, 2).
           DISPLAY "CELL(3,2,1)=" WS-CELL-VAL(3, 2, 1).
           STOP RUN.
