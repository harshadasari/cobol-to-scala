      * ff14: A signed DISPLAY (zoned-decimal, PIC S9(3)V99) field
      * written to a LINE SEQUENTIAL file and read back - isolated from
      * ff09 (COMP-1 SORT KEY), which incidentally surfaced this same
      * crash upstream of ever reaching its own SORT-key comparison.
      * Real cobc's LINE SEQUENTIAL text encoding of a NEGATIVE zoned-
      * decimal DISPLAY field overpunches the sign into the last digit's
      * own zone nibble (e.g. -0.12 -> the ASCII bytes "00001" with the
      * final "2" replaced by the overpunched character "r", NOT a
      * literal "-" character) - this is completely standard, default
      * (SIGN IS TRAILING, not SEPARATE) zoned-decimal representation,
      * exercised for POSITIVE, NEGATIVE, and ZERO values here.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF14LSSIGN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REC-FILE ASSIGN TO "FF14LS.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  REC-FILE.
       01  FF-REC.
           05  FF-ID       PIC 9(2).
           05  FF-VAL      PIC S9(3)V99.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REC-FILE.
           MOVE 1 TO FF-ID.
           MOVE 12.34 TO FF-VAL.
           WRITE FF-REC.
           MOVE 2 TO FF-ID.
           MOVE -0.12 TO FF-VAL.
           WRITE FF-REC.
           MOVE 3 TO FF-ID.
           MOVE 0 TO FF-VAL.
           WRITE FF-REC.
           MOVE 4 TO FF-ID.
           MOVE -99.99 TO FF-VAL.
           WRITE FF-REC.
           CLOSE REC-FILE.

           OPEN INPUT REC-FILE.
           PERFORM 4 TIMES
               READ REC-FILE
                   AT END DISPLAY "UNEXPECTED-AT-END"
                   NOT AT END
                       DISPLAY "ID=" FF-ID " VAL=" FF-VAL
               END-READ
           END-PERFORM.
           CLOSE REC-FILE.
           STOP RUN.
