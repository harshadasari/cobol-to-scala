      * Adversarial (round 25): round-12/14 taught `PERFORM x OF secA THRU
      * y OF secB` to resolve through the collision-aware
      * `resolveParagraphMethodName` resolver - but every corpus program
      * exercising that qualifier (z12/b3) is an ORDINARY (non-recursive)
      * program, where every paragraph compiles to a top-level Scala method.
      * Round-21's RECURSIVE convention (`generateRecursiveEntryMethod`)
      * instead nests EVERY paragraph as a local `def` *inside* entry()
      * itself (`generateProgramFlowLinesNested`) - a completely different
      * codegen path from the ordinary top-level-method convention the
      * qualifier resolver was built/tested against. This checks a
      * RECURSIVE program with two SECTIONS, each declaring a paragraph
      * named 1000-PARA (genuinely ambiguous, forcing qualification), doing
      * `PERFORM 1000-PARA OF SEC-A THRU 2000-PARA OF SEC-A` from inside its
      * own self-recursive body - confirming the qualifier still resolves
      * correctly to the right nested `def`, not a stale/duplicate-name
      * collision, when paragraphs live as local defs rather than top-level
      * methods.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O13MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "O13SUB" USING WS-N.
           STOP RUN.
       END PROGRAM O13MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. O13SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9(2).
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-SECTION SECTION.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LS-N.
           PERFORM 1000-PARA OF SEC-A THRU 2000-PARA OF SEC-A.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "O13SUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT  N=" LS-N.
           GOBACK.
       SEC-A SECTION.
       1000-PARA.
           DISPLAY "SECA-1000 N=" LS-N.
       2000-PARA.
           DISPLAY "SECA-2000 N=" LS-N.
       SEC-B SECTION.
       1000-PARA.
           DISPLAY "SECB-1000 N=" LS-N.
       END PROGRAM O13SUB.
