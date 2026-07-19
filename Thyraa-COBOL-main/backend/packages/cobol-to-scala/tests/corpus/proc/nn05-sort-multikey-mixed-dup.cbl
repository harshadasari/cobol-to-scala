      * nn05 (round 38): SORT with THREE keys mixed ASCENDING/DESCENDING,
      * WITH DUPLICATES IN ORDER, via INPUT PROCEDURE/OUTPUT PROCEDURE
      * (RELEASE/RETURN) - stress test on the key-comparison codegen for
      * more than 2 keys with mixed directions plus genuine duplicate keys.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN05SORT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "NN05WK1".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-K1 PIC 9(2).
           05  SORT-K2 PIC 9(2).
           05  SORT-K3 PIC 9(2).
           05  SORT-TAG PIC X(4).
       WORKING-STORAGE SECTION.
       01  WS-IDX PIC 9 VALUE 1.
       01  WS-DATA.
           05  FILLER OCCURS 6 TIMES INDEXED BY WS-I.
               10  WS-D1 PIC 9(2).
               10  WS-D2 PIC 9(2).
               10  WS-D3 PIC 9(2).
               10  WS-DTAG PIC X(4).
       01  WS-EOF PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-D1(1). MOVE 5 TO WS-D2(1). MOVE 1 TO WS-D3(1).
           MOVE "AAA1" TO WS-DTAG(1).
           MOVE 10 TO WS-D1(2). MOVE 5 TO WS-D2(2). MOVE 2 TO WS-D3(2).
           MOVE "AAA2" TO WS-DTAG(2).
           MOVE 10 TO WS-D1(3). MOVE 1 TO WS-D2(3). MOVE 9 TO WS-D3(3).
           MOVE "BBB1" TO WS-DTAG(3).
           MOVE 20 TO WS-D1(4). MOVE 5 TO WS-D2(4). MOVE 1 TO WS-D3(4).
           MOVE "CCC1" TO WS-DTAG(4).
           MOVE 10 TO WS-D1(5). MOVE 5 TO WS-D2(5). MOVE 1 TO WS-D3(5).
           MOVE "AAA3" TO WS-DTAG(5).
           MOVE 5 TO WS-D1(6). MOVE 9 TO WS-D2(6). MOVE 9 TO WS-D3(6).
           MOVE "DDD1" TO WS-DTAG(6).
           SORT SORT-FILE
               ASCENDING KEY SORT-K1
               DESCENDING KEY SORT-K2
               ASCENDING KEY SORT-K3
               WITH DUPLICATES IN ORDER
               INPUT PROCEDURE IS FEED-SORT
               OUTPUT PROCEDURE IS SHOW-SORT.
           STOP RUN.
       FEED-SORT.
           PERFORM VARYING WS-IDX FROM 1 BY 1 UNTIL WS-IDX > 6
               MOVE WS-D1(WS-IDX) TO SORT-K1
               MOVE WS-D2(WS-IDX) TO SORT-K2
               MOVE WS-D3(WS-IDX) TO SORT-K3
               MOVE WS-DTAG(WS-IDX) TO SORT-TAG
               RELEASE SORT-REC
           END-PERFORM.
       SHOW-SORT.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN SORT-FILE AT END MOVE "Y" TO WS-EOF
               NOT AT END
                   DISPLAY "K1=" SORT-K1 " K2=" SORT-K2
                       " K3=" SORT-K3 " TAG=" SORT-TAG
               END-RETURN
           END-PERFORM.
