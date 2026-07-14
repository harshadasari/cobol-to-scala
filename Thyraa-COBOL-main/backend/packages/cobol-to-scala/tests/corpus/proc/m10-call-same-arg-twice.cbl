      * Adversarial (round 24): CALL BY REFERENCE where the SAME caller
      * variable is passed as TWO DIFFERENT USING arguments to the SAME
      * CALL - aliasing at the call-ARGUMENT level (two distinct formal
      * LINKAGE parameters both bound to one physical actual argument),
      * distinct from every recursive-aliasing probe above (which alias one
      * parameter across nested CALL activations, not two parameters within
      * ONE activation). Real cobc passes the address of WS-X for both
      * LK-A and LK-B, so LK-A and LK-B are the SAME storage for the whole
      * call - writing through one must be immediately visible through the
      * other. Checks whether this generator's BY-REFERENCE marshalling
      * models that as true aliasing or as two independently scattered/
      * gathered copies (which would diverge the instant one is written).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9(4) VALUE 100.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M10SUB" USING WS-X, WS-X.
           DISPLAY "MAIN X=" WS-X.
           STOP RUN.
       END PROGRAM M10MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M10SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B.
       MAIN-PARA.
           DISPLAY "ENTER A=" LK-A " B=" LK-B.
           ADD 500 TO LK-A.
           DISPLAY "AFTER-ADD A=" LK-A " B=" LK-B.
           MOVE 999 TO LK-B.
           DISPLAY "AFTER-MOVE A=" LK-A " B=" LK-B.
           GOBACK.
       END PROGRAM M10SUB.
