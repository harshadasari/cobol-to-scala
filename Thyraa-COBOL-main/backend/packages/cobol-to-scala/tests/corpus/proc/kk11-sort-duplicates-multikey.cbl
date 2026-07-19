      * kk11 (round 35): SORT WITH DUPLICATES IN ORDER combined with
      * MULTIPLE sort keys (ASCENDING KEY SORT-KEY1, DESCENDING KEY
      * SORT-KEY2) - r05/ii11 already exercise DUPLICATES with a SINGLE
      * key, and h04/r06 already exercise multi-key ASCENDING+DESCENDING
      * SORT without DUPLICATES, but no existing corpus program combines
      * both: duplicate PRIMARY keys (SORT-KEY1=200 appears three times)
      * broken by a SECONDARY DESCENDING key (SORT-KEY2), with a tie on
      * BOTH keys at once (rows 1/5: KEY1=200, KEY2=010) resolved by
      * DUPLICATES IN ORDER's own stability (RELEASE order preserved: A1
      * before A3).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK11SRTDUPMULTI.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "KK11SORT.DAT".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-KEY1 PIC 9(3).
           05  SORT-KEY2 PIC 9(3).
           05  SORT-TAG  PIC X(4).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       01  WS-EOF PIC X VALUE 'N'.
       01  WS-TABLE.
           05  WS-ROW OCCURS 7 TIMES.
               10 WS-K1 PIC 9(3).
               10 WS-K2 PIC 9(3).
               10 WS-TAG PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 200 TO WS-K1(1). MOVE 010 TO WS-K2(1).
           MOVE 'A1' TO WS-TAG(1).
           MOVE 100 TO WS-K1(2). MOVE 020 TO WS-K2(2).
           MOVE 'B1' TO WS-TAG(2).
           MOVE 200 TO WS-K1(3). MOVE 005 TO WS-K2(3).
           MOVE 'A2' TO WS-TAG(3).
           MOVE 100 TO WS-K1(4). MOVE 020 TO WS-K2(4).
           MOVE 'B2' TO WS-TAG(4).
           MOVE 200 TO WS-K1(5). MOVE 010 TO WS-K2(5).
           MOVE 'A3' TO WS-TAG(5).
           MOVE 300 TO WS-K1(6). MOVE 001 TO WS-K2(6).
           MOVE 'C1' TO WS-TAG(6).
           MOVE 100 TO WS-K1(7). MOVE 020 TO WS-K2(7).
           MOVE 'B3' TO WS-TAG(7).
           SORT SORT-FILE
               ON ASCENDING KEY SORT-KEY1
               ON DESCENDING KEY SORT-KEY2
               WITH DUPLICATES IN ORDER
               INPUT PROCEDURE 1000-RELEASE-RECORDS
               OUTPUT PROCEDURE 2000-RETURN-RECORDS.
           STOP RUN.
       1000-RELEASE-RECORDS.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 7
               MOVE WS-K1(WS-I) TO SORT-KEY1
               MOVE WS-K2(WS-I) TO SORT-KEY2
               MOVE WS-TAG(WS-I) TO SORT-TAG
               RELEASE SORT-REC
           END-PERFORM.
       2000-RETURN-RECORDS.
           PERFORM UNTIL WS-EOF = 'Y'
               RETURN SORT-FILE
                   AT END MOVE 'Y' TO WS-EOF
                   NOT AT END
                       DISPLAY "SORTED K1=" SORT-KEY1 " K2=" SORT-KEY2
                           " TAG=" SORT-TAG
               END-RETURN
           END-PERFORM.
