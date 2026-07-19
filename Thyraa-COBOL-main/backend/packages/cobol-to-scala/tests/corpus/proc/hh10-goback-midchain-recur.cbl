      * hh10: round-28/29 (ee09/ee10) fixed EXIT SECTION/EXIT PARAGRAPH's
      * own bare `return` cascading incorrectly through a RECURSIVE
      * program's nested-local-def paragraph chain - but GOBACK compiles
      * to that SAME bare `return` (generateGoback) and has never been
      * pressure-tested in the shape that would expose an analogous bug:
      * every pre-existing RECURSIVE corpus program's own GOBACK sits at
      * the very END of the program's own last paragraph (where a bare
      * `return` and "correctly terminate this activation" are
      * indistinguishable, since nothing follows it anyway). This fires
      * GOBACK from the MIDDLE of a paragraph, checked BEFORE making any
      * deeper recursive CALL (deliberately - checking AFTER the nested
      * CALL returns runs into a SEPARATE, genuine cobc entanglement:
      * WS-NEXT-DEPTH is shared WORKING-STORAGE and LS-DEPTH is a live
      * BY REFERENCE alias of it, so a deeper activation's own read of
      * the SAME cell after a further nested COMPUTE would silently
      * change what "LS-DEPTH = 1" means retroactively - confirmed via a
      * direct cobc probe, not a bug in the checked-first ordering used
      * here), with TWO more paragraphs (reached only by natural
      * top-to-bottom fall-through, not GO TO/PERFORM) physically
      * following it in the same program - those two paragraphs must NOT
      * run for the activation that GOBACKs early, but must still run
      * normally for the shallower activation once the deeper CALL
      * returns.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "HH10SUB" USING WS-START-DEPTH.
           STOP RUN.
       END PROGRAM HH10MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH10SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       PARA-A.
           DISPLAY "A DEPTH=" LS-DEPTH.
           IF LS-DEPTH = 1
               DISPLAY "EARLY-GOBACK DEPTH=" LS-DEPTH
               GOBACK
           END-IF.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "HH10SUB" USING WS-NEXT-DEPTH
           END-IF.
       PARA-B.
           DISPLAY "B DEPTH=" LS-DEPTH.
       PARA-C.
           DISPLAY "C DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM HH10SUB.
