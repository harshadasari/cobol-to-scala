      * Adversarial (round 25): every prior ON SIZE ERROR corpus probe
      * writes its handler's own recovery value into a DIFFERENT variable
      * than the COMPUTE's own target, or simply leaves the target alone.
      * Real COBOL guarantees the target of a COMPUTE that raises SIZE
      * ERROR is left COMPLETELY UNCHANGED (its original, pre-COMPUTE value)
      * UNLESS the ON SIZE ERROR imperative statements themselves explicitly
      * set it - so a handler that reads/writes the SAME field the failed
      * COMPUTE targeted must see that ORIGINAL untouched value, not a
      * partially-applied or garbage intermediate result. This does
      * `COMPUTE WS-X = WS-X * 100000 ON SIZE ERROR ADD 1 TO WS-X` where
      * WS-X starts already large enough that the multiply overflows its
      * own PICTURE - checking the generated Scala preserves WS-X's
      * original value across the failed COMPUTE before the handler's own
      * self-referential ADD runs.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O09SIZEERR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9(4) VALUE 9000.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE X=" WS-X.
           COMPUTE WS-X = WS-X * 100000
               ON SIZE ERROR
                   ADD 1 TO WS-X
           END-COMPUTE.
           DISPLAY "AFTER  X=" WS-X.
           STOP RUN.
