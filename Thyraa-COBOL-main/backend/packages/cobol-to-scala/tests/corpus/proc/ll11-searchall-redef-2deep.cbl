      * ll11 (round 36): pressure-test on round-35 finding 4 (kk09)'s fix
      * for SEARCH ALL over an OCCURS-bearing GROUP child nested DIRECTLY
      * under a REDEFINES. kk09's own shape had WS-ENTRY (the OCCURS/
      * INDEXED BY table) as the IMMEDIATE child of WS-VIEW REDEFINES
      * WS-FLAT. Here the table is TWO LEVELS deep: WS-VIEW REDEFINES
      * WS-FLAT, WS-OUTER is WS-VIEW's plain (non-OCCURS) GROUP child, and
      * WS-ENTRY (the real OCCURS/ASCENDING KEY/INDEXED BY table) is
      * WS-OUTER's own child - does kk09's fix (declaring the INDEXED BY
      * var as a real working Int, table itself an honest decline) still
      * apply at this extra nesting depth, or does the OCCURS-bearing-
      * group-child guard it patched only cover the DIRECT-child case,
      * reproducing the original `Not found: wsIdx` crash one level
      * deeper?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL11SEARCHREDEF2.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FLAT PIC X(20) VALUE "01A02B03C04D05E".
       01  WS-VIEW REDEFINES WS-FLAT.
           05  WS-OUTER.
               10  WS-ENTRY OCCURS 5 TIMES
                   ASCENDING KEY IS WS-KEY
                   INDEXED BY WS-IDX.
                   15  WS-KEY  PIC 9(2).
                   15  WS-TAG  PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET WS-IDX TO 1.
           SEARCH ALL WS-ENTRY
               AT END
                   DISPLAY "NOTFOUND"
               WHEN WS-KEY(WS-IDX) = 3
                   DISPLAY "FOUND TAG=" WS-TAG(WS-IDX)
                       " AT IDX=" WS-IDX
           END-SEARCH.
           SET WS-IDX TO 1.
           SEARCH ALL WS-ENTRY
               AT END
                   DISPLAY "NOTFOUND KEY=9"
               WHEN WS-KEY(WS-IDX) = 9
                   DISPLAY "FOUND TAG=" WS-TAG(WS-IDX)
           END-SEARCH.
           STOP RUN.
