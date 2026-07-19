      * jj13: further pressure-tests round-33 finding 3's STRING pointer
      * fix (ii09) - the WITH POINTER value starts ALREADY out of range
      * (10, past the target's own width+1 of 6) BEFORE any character of
      * ANY segment is processed at all, across two segments. Real cobc
      * (verified first): OVERFLOW fires immediately, the target is left
      * completely untouched, and the pointer itself is unchanged (still
      * 10) - zero characters written from either segment. Probes
      * whether the engine's per-segment written-counter still correctly
      * computes zero across both segments in this fully-degenerate
      * "already out of bounds from the start" case, rather than adding
      * some stray nonzero amount.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ13STRPTR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TARGET PIC X(5) VALUE "ZZZZZ".
       01  WS-PTR PIC 9(2) VALUE 10.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING "AB" DELIMITED BY SIZE
                  "CD" DELIMITED BY SIZE
               INTO WS-TARGET
               WITH POINTER WS-PTR
               ON OVERFLOW
                   DISPLAY "OVERFLOW"
               NOT ON OVERFLOW
                   DISPLAY "NO-OVERFLOW"
           END-STRING.
           DISPLAY "TARGET=[" WS-TARGET "]".
           DISPLAY "PTR=" WS-PTR.
           STOP RUN.
