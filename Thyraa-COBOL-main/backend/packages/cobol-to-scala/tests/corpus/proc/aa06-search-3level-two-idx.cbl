       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1305.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 3 INDEXED BY IDX1.
               10  WS-ROW-KEY   PIC 9(2).
               10  WS-COL OCCURS 3 INDEXED BY IDX2.
                   15  WS-COL-KEY   PIC 9(2).
                   15  WS-CELL OCCURS 3 INDEXED BY IDX3 PIC 9(2).
       01  TARGET-COL          PIC 9(2) VALUE 22.
       01  TARGET-CELL         PIC 9(2) VALUE 83.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING IDX1 FROM 1 BY 1 UNTIL IDX1 > 3
               MOVE IDX1 TO WS-ROW-KEY(IDX1)
               PERFORM VARYING IDX2 FROM 1 BY 1 UNTIL IDX2 > 3
                   COMPUTE WS-COL-KEY(IDX1, IDX2) =
                       (IDX1 * 10) + IDX2
                   PERFORM VARYING IDX3 FROM 1 BY 1 UNTIL IDX3 > 3
                       COMPUTE WS-CELL(IDX1, IDX2, IDX3) =
                           (IDX1 * 30) + (IDX2 * 10) + IDX3
                   END-PERFORM
               END-PERFORM
           END-PERFORM.

           PERFORM VARYING IDX1 FROM 1 BY 1 UNTIL IDX1 > 3
               SET IDX2 TO 1
               SEARCH WS-COL VARYING IDX2
                   AT END
                       DISPLAY "ROW " IDX1 " COL NOT FOUND"
                   WHEN WS-COL-KEY(IDX1, IDX2) = TARGET-COL
                       SET IDX3 TO 1
                       SEARCH WS-CELL VARYING IDX3
                           AT END
                               DISPLAY "ROW " IDX1 " CELL NOT FOUND"
                           WHEN WS-CELL(IDX1, IDX2, IDX3) = TARGET-CELL
                               DISPLAY "FOUND ROW=" IDX1
                                   " COL=" IDX2 " CELL=" IDX3
                       END-SEARCH
               END-SEARCH
           END-PERFORM.
           STOP RUN.
