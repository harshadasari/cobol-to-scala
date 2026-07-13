       IDENTIFICATION DIVISION.
       PROGRAM-ID. H01NOWS.
      *
      * Adversarial (round 19): a program with NO WORKING-STORAGE
      * SECTION at all - DATA DIVISION is present but declares nothing.
      * Every statement in PROCEDURE DIVISION operates purely on
      * literals (DISPLAY of literal text, a literal-bounded PERFORM
      * TIMES loop, an IF comparing two literals) so nothing here ever
      * needs a data item to exist. Basic-but-possibly-never-tried
      * structural shape per round-18's g14 lesson (a paragraph-less
      * PROCEDURE DIVISION was dropped entirely for 17 rounds before
      * anyone tried it) - this probes whether field-registry/codegen
      * machinery implicitly assumes at least one WORKING-STORAGE item
      * exists.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "START".
           PERFORM 3 TIMES
               DISPLAY "LOOP-ITER"
           END-PERFORM.
           IF "ABC" = "ABC"
               DISPLAY "LITERAL-MATCH"
           END-IF.
           IF "ABC" = "XYZ"
               DISPLAY "SHOULD-NOT-PRINT"
           ELSE
               DISPLAY "LITERAL-MISMATCH"
           END-IF.
           DISPLAY "END".
           STOP RUN.
       END PROGRAM H01NOWS.
