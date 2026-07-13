       IDENTIFICATION DIVISION.
       PROGRAM-ID. F12.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 2 INDEXED BY IDX1.
               10  WS-COL OCCURS 2 INDEXED BY IDX2.
                   15  WS-CELL OCCURS 4 ASCENDING KEY WS-CELL-KEY
                       INDEXED BY IDX3.
                       20  WS-CELL-KEY PIC 9(2).
                       20  WS-CELL-VAL PIC 9(2).
       01  I PIC 9 VALUE 1.
       01  J PIC 9 VALUE 1.
       01  K PIC 9 VALUE 1.
       01  TARGET-KEY PIC 9(2) VALUE 35.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING I FROM 1 BY 1 UNTIL I > 2
               PERFORM VARYING J FROM 1 BY 1 UNTIL J > 2
                   PERFORM VARYING K FROM 1 BY 1 UNTIL K > 4
                       COMPUTE WS-CELL-KEY(I, J, K) =
                           (I * 10) + (K * 5)
                       COMPUTE WS-CELL-VAL(I, J, K) =
                           (I * 100) + (J * 10) + K
                   END-PERFORM
               END-PERFORM
           END-PERFORM.

           SET IDX1 TO 2.
           SET IDX2 TO 1.
           SET IDX3 TO 1.
           SEARCH ALL WS-CELL
               AT END
                   DISPLAY "NOT FOUND"
               WHEN WS-CELL-KEY(IDX1, IDX2, IDX3) = TARGET-KEY
                   DISPLAY "FOUND VAL=" WS-CELL-VAL(IDX1, IDX2, IDX3)
                   DISPLAY "AT K=" IDX3
           END-SEARCH.
           STOP RUN.
