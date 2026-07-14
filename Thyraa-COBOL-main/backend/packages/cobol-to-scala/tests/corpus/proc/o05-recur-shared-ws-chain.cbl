      * Adversarial (round 25): round-21 finding 2 (j10) established that a
      * RECURSIVE program's own WORKING-STORAGE is genuinely STATIC/SHARED
      * across recursive activations in real cobc (confirmed against
      * installed GnuCOBOL) - and deliberately left as an unconditional
      * shared module var, NOT given per-activation freshness, since
      * "that sharing is cobc's own confirmed, deliberate behavior to
      * preserve, not a bug." j10 only ever WRITES its own WS-NEXT-alike
      * variable ONCE per activation (computed before the recursive CALL)
      * and READS it back only once (the LINKAGE getter/setter closure
      * mechanism folds the deepest write back through each level). This
      * probe chains the SAME shared WORKING-STORAGE variable through THREE
      * SUCCESSIVE levels of SELF-recursion (not spread across three
      * different mutually-recursive PROGRAM-IDs like l04) - each level
      * writes WS-NEXT (computed from ITS OWN LS-N) right before recursing,
      * and the base case writes directly into LS-N (aliased, via the
      * getter/setter closure mechanism, to the SAME shared WS-NEXT storage
      * the very next level up used as its own CALL argument) - checking
      * whether the generated Scala's own aliasing chain correctly
      * reproduces cobc's real (surprising) "leak" all the way up two
      * levels, not just the single level j10 exercises.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O05MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "O05SUB" USING WS-N.
           DISPLAY "MAIN N AFTER=" WS-N.
           STOP RUN.
       END PROGRAM O05MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. O05SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9(2).
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "O05SUB" USING WS-NEXT
               DISPLAY "BACK N=" LS-N " WSNEXT=" WS-NEXT
           ELSE
               MOVE 99 TO LS-N
           END-IF.
           DISPLAY "EXIT  N=" LS-N.
           GOBACK.
       END PROGRAM O05SUB.
