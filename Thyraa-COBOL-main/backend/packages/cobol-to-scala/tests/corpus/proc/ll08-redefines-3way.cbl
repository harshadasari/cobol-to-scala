      * ll08 (round 36): pressure-test on round-35 finding 3 (kk08)'s
      * REDEFINES-of-an-OCCURS-table-by-a-differently-shaped-OCCURS-table
      * fix, but with a THIRD, differently-shaped view added (real cobc
      * requires every REDEFINES of a given level to name the SAME
      * original item - a "REDEFINES chain" where each level redefines its
      * immediate predecessor, e.g. WS-TOP REDEFINES WS-MID, is rejected at
      * COMPILE time by real cobc with "'WS-MID' is not the original
      * definition" - confirmed directly against installed GnuCOBOL while
      * building this probe). WS-BASE (flat PIC X(6)) is independently
      * REDEFINED by BOTH WS-MID (3 elements of width 2) AND WS-TOP (2
      * elements of width 3) - a 3-WAY view over the same 6 bytes. A write
      * through ANY view must be visible through EVERY other view.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL08.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-BASE PIC X(6) VALUE "AABBCC".
       01  WS-MID REDEFINES WS-BASE.
           05  WS-MID-TBL PIC X(2) OCCURS 3 TIMES.
       01  WS-TOP REDEFINES WS-BASE.
           05  WS-TOP-TBL PIC X(3) OCCURS 2 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BASE=[" WS-BASE "]".
           DISPLAY "MID1=[" WS-MID-TBL(1) "] MID2=[" WS-MID-TBL(2)
               "] MID3=[" WS-MID-TBL(3) "]".
           DISPLAY "TOP1=[" WS-TOP-TBL(1) "] TOP2=[" WS-TOP-TBL(2) "]".

           MOVE "XYZ" TO WS-TOP-TBL(1).
           DISPLAY "AFTER TOP1 MUTATE: BASE=[" WS-BASE "]".
           DISPLAY "MID1=[" WS-MID-TBL(1) "] MID2=[" WS-MID-TBL(2)
               "] MID3=[" WS-MID-TBL(3) "]".

           MOVE "QQ" TO WS-MID-TBL(3).
           DISPLAY "AFTER MID3 MUTATE: BASE=[" WS-BASE "]".
           DISPLAY "TOP1=[" WS-TOP-TBL(1) "] TOP2=[" WS-TOP-TBL(2) "]".
           STOP RUN.
