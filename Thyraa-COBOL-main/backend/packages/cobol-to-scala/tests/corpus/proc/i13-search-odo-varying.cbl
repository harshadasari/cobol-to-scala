       IDENTIFICATION DIVISION.
       PROGRAM-ID. I13SEARCHODOVAR.
      *
      * Adversarial (round 20): SEARCH (linear, not SEARCH ALL) over an
      * OCCURS ... DEPENDING ON table, with an EXPLICIT VARYING clause
      * naming the table's own INDEXED BY index - e13 exercises the
      * same ODO-aware SEARCH bound (round-16 finding 5) via the
      * IMPLICIT default index only (no VARYING keyword at all); this
      * checks the bound still holds when VARYING is spelled out
      * explicitly.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-COUNT PIC 9(2) VALUE 3.
           05  WS-ROW OCCURS 1 TO 5 TIMES
                   DEPENDING ON WS-COUNT
                   INDEXED BY IDX.
               10  R-CODE PIC X(2).
               10  R-NUM  PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO R-CODE(1). MOVE 111 TO R-NUM(1).
           MOVE "BB" TO R-CODE(2). MOVE 222 TO R-NUM(2).
           MOVE "CC" TO R-CODE(3). MOVE 333 TO R-NUM(3).
           MOVE "DD" TO R-CODE(4). MOVE 444 TO R-NUM(4).
           MOVE "EE" TO R-CODE(5). MOVE 555 TO R-NUM(5).

           SET IDX TO 1.
           SEARCH WS-ROW VARYING IDX
               AT END DISPLAY "SEARCH1: NOT FOUND"
               WHEN R-CODE(IDX) = "CC"
                   DISPLAY "SEARCH1: FOUND AT " IDX
           END-SEARCH.

           SET IDX TO 1.
           SEARCH WS-ROW VARYING IDX
               AT END DISPLAY "SEARCH2: NOT FOUND (DD BEYOND WS-COUNT)"
               WHEN R-CODE(IDX) = "DD"
                   DISPLAY "SEARCH2: FOUND AT " IDX
           END-SEARCH.

           MOVE 5 TO WS-COUNT.
           SET IDX TO 1.
           SEARCH WS-ROW VARYING IDX
               AT END DISPLAY "SEARCH3: NOT FOUND"
               WHEN R-CODE(IDX) = "DD"
                   DISPLAY "SEARCH3: FOUND AT " IDX
           END-SEARCH.
           STOP RUN.
