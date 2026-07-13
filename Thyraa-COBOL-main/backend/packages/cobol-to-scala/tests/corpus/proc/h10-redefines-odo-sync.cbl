       IDENTIFICATION DIVISION.
       PROGRAM-ID. H10RDOSNC.
      *
      * Adversarial (round 19): REDEFINES + OCCURS DEPENDING ON + SYNC
      * all combined within the SAME enclosing 01 record (REDEFINES of
      * a variable-length/ODO item itself is invalid COBOL - confirmed
      * by real cobc, "cannot be variable length" - so this combines a
      * REDEFINES of a FIXED sibling with an ODO table whose row ALSO
      * carries a SYNC-aligned binary child, all under one WS-REC).
      * No prior d/e/f/g probe combines all three: g04 combines
      * REDEFINES with a sibling ODO table but never SYNC; e01-e03/f06/
      * f07/g05 combine SYNC+REDEFINES but never an ODO table too.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-HEAD         PIC X(4) VALUE "HEAD".
           05  WS-HEAD-ALT REDEFINES WS-HEAD.
               10  WS-HEAD-N1  PIC X(2).
               10  WS-HEAD-N2  PIC X(2).
           05  WS-CNT          PIC 9(1) VALUE 2.
           05  WS-ROW OCCURS 1 TO 4 TIMES DEPENDING ON WS-CNT.
               10  R-LEAD      PIC X(1).
               10  R-NUM       PIC S9(4) COMP SYNC.
               10  R-TAIL      PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "A" TO R-LEAD(1).
           MOVE 111 TO R-NUM(1).
           MOVE "B" TO R-TAIL(1).
           MOVE "C" TO R-LEAD(2).
           MOVE 222 TO R-NUM(2).
           MOVE "D" TO R-TAIL(2).
           DISPLAY "N1=[" WS-HEAD-N1 "]".
           DISPLAY "N2=[" WS-HEAD-N2 "]".
           DISPLAY "ROW1-NUM=" R-NUM(1).
           DISPLAY "ROW2-NUM=" R-NUM(2).
           MOVE "ZZ" TO WS-HEAD-N2.
           DISPLAY "HEAD-AFTER=[" WS-HEAD "]".
           DISPLAY "CNT=" WS-CNT.
           STOP RUN.
       END PROGRAM H10RDOSNC.
