      * Adversarial (round 23): isolates the root cause behind l04's
      * compile failure to its simplest possible form. Every existing
      * RECURSIVE-with-LINKAGE-writeback corpus program (j10, k01, k04,
      * k12) only ever computes a NEW value into a separate
      * WORKING-STORAGE variable and passes THAT onward - none of them
      * assign directly to the LINKAGE parameter identifier itself
      * within the SAME activation (`SUBTRACT 1 FROM LS-N`, here, is
      * exactly that: a plain read-modify-write of LS-N in place,
      * before immediately re-CALLing with the now-updated LS-N). This
      * is the single self-recursive case (no mutual/GROUP LINKAGE
      * involved at all) - if this alone fails to compile the same way
      * l04 does, it confirms the getter/setter LOCAL-def convention
      * generateRecursiveEntryMethod relies on (see its own doc
      * comment, generator/scala-generator.js: "Scala's own getter/
      * setter assignment sugar... lets every reference... read/write
      * straight through") was never actually exercised with a real
      * write anywhere in this campaign - not a mutual-recursion-
      * specific or GROUP-LINKAGE-specific defect, but a defect in the
      * fix's own core mechanism.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L12MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "L12SUB" USING WS-N.
           DISPLAY "MAIN N AFTER=" WS-N.
           STOP RUN.
       END PROGRAM L12MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. L12SUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           IF LS-N > 0
               SUBTRACT 1 FROM LS-N
               CALL "L12SUB" USING LS-N
           END-IF.
           DISPLAY "EXIT  N=" LS-N.
           GOBACK.
       END PROGRAM L12SUB.
