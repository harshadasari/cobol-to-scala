      * Round-12 probe z01: SEARCH ALL against composite-key tables, three
      * variant WHEN shapes:
      *  (a) key-PREFIX-only WHEN (only WS-K1 tested, table declares K1,K2;
      *      legal COBOL - a search on a leading prefix of the composite key)
      *  (b) WHEN conjuncts in NON-declaration order (WS-K2 tested before
      *      WS-K1, opposite of ASCENDING KEY IS WS-K1 WS-K2)
      *  (c) a 3-field composite key (K1,K2,K3) where the WHEN SKIPS the
      *      middle declared key (tests K1 and K3, not K2) with DUPLICATE K1
      *      values across rows - confirmed legal COBOL, standalone-probed
      *      against installed GnuCOBOL before writing this file (SKIPMID
      *      probe): cobc finds the true match among the K1-tied rows.
      * (A fourth shape - a residual conjunct on a genuinely NON-key field,
      * e.g. "AND WS-FLAG(WS-IDX) = 'Y'" - was also standalone-probed first
      * and is REJECTED by cobc itself ("invalid SEARCH ALL condition"), so
      * it is not attempted here; only (a)/(b)/(c), all confirmed compiling
      * and running cleanly under cobc, are used.)
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z01SRCHALL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 6 TIMES
               ASCENDING KEY IS WS-K1 WS-K2
               INDEXED BY WS-IDX.
               10  WS-K1    PIC 9(2).
               10  WS-K2    PIC 9(2).
               10  WS-VAL   PIC X(3).
       01  WS-FOUND         PIC X(4) VALUE "NON".
       01  WS-TABLE2.
           05  WS-ENTRY2 OCCURS 4 TIMES
               ASCENDING KEY IS WS-K1B WS-K2B WS-K3B
               INDEXED BY WS-IDX2.
               10  WS-K1B PIC 9(2).
               10  WS-K2B PIC 9(2).
               10  WS-K3B PIC 9(2).
               10  WS-VAL2 PIC X(3).
       01  WS-FOUND2        PIC X(4) VALUE "NON".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-K1(1). MOVE 1 TO WS-K2(1).
           MOVE "AAA" TO WS-VAL(1).
           MOVE 10 TO WS-K1(2). MOVE 5 TO WS-K2(2).
           MOVE "BBB" TO WS-VAL(2).
           MOVE 10 TO WS-K1(3). MOVE 9 TO WS-K2(3).
           MOVE "CCC" TO WS-VAL(3).
           MOVE 20 TO WS-K1(4). MOVE 2 TO WS-K2(4).
           MOVE "DDD" TO WS-VAL(4).
           MOVE 20 TO WS-K1(5). MOVE 7 TO WS-K2(5).
           MOVE "EEE" TO WS-VAL(5).
           MOVE 30 TO WS-K1(6). MOVE 3 TO WS-K2(6).
           MOVE "FFF" TO WS-VAL(6).

      * (a) prefix-only: only WS-K1 tested (table has K1,K2) - matches
      *     one of rows 1-3 (all K1=10); which one is a tie-break detail.
           MOVE "NONE" TO WS-FOUND.
           SEARCH ALL WS-ENTRY
               AT END
                   MOVE "NONE" TO WS-FOUND
               WHEN WS-K1(WS-IDX) = 10
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND
           END-SEARCH.
           DISPLAY "PREFIX-ONLY=" WS-FOUND.

      * (b) non-declaration order: WS-K2 tested before WS-K1 in the WHEN's
      *     AND-chain, opposite of the table's own ASCENDING KEY IS K1 K2
      *     order - must still resolve via the table's declared key order,
      *     not the WHEN's textual order. Expect row4 (K1=20,K2=2) = DDD.
           MOVE "NONE" TO WS-FOUND.
           SEARCH ALL WS-ENTRY
               AT END
                   MOVE "NONE" TO WS-FOUND
               WHEN WS-K2(WS-IDX) = 2 AND WS-K1(WS-IDX) = 20
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND
           END-SEARCH.
           DISPLAY "NONDECL-ORDER=" WS-FOUND.

      * (c) 3-field composite key K1B,K2B,K3B; WHEN tests K1B and K3B,
      *     SKIPPING K2B; rows 1-3 all share K1B=10 (a tie group) with
      *     different K3B values - only row 3 (K3B=9) should match.
           MOVE 10 TO WS-K1B(1). MOVE 1 TO WS-K2B(1).
           MOVE 5 TO WS-K3B(1). MOVE "AAA" TO WS-VAL2(1).
           MOVE 10 TO WS-K1B(2). MOVE 2 TO WS-K2B(2).
           MOVE 5 TO WS-K3B(2). MOVE "BBB" TO WS-VAL2(2).
           MOVE 10 TO WS-K1B(3). MOVE 2 TO WS-K2B(3).
           MOVE 9 TO WS-K3B(3). MOVE "CCC" TO WS-VAL2(3).
           MOVE 20 TO WS-K1B(4). MOVE 1 TO WS-K2B(4).
           MOVE 1 TO WS-K3B(4). MOVE "DDD" TO WS-VAL2(4).

           MOVE "NONE" TO WS-FOUND2.
           SEARCH ALL WS-ENTRY2
               AT END
                   MOVE "NONE" TO WS-FOUND2
               WHEN WS-K1B(WS-IDX2) = 10 AND WS-K3B(WS-IDX2) = 9
                   MOVE WS-VAL2(WS-IDX2) TO WS-FOUND2
           END-SEARCH.
           DISPLAY "SKIP-MIDDLE-KEY=" WS-FOUND2.
           STOP RUN.
