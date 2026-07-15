      * ee06: COMP-2 fields read back from a RELATIVE file, then used in
      * ADD/SUBTRACT/MULTIPLY/DIVIDE (not just COMPUTE, which dd10 already
      * covers) - stresses the round-28 IEEE-754 double codec across the
      * full family of arithmetic verbs, not just COMPUTE.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE06COMP2ARITH.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "EE06REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID       PIC 9(3).
           05  REC-A        COMP-2.
           05  REC-B        COMP-2.
       WORKING-STORAGE SECTION.
       01  WS-RKEY        PIC 9(3) VALUE 0.
       01  WS-STATUS      PIC XX.
       01  WS-RESULT      COMP-2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 12.5 TO REC-A.
           MOVE 3.25 TO REC-B.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           ADD REC-A TO REC-B GIVING WS-RESULT.
           DISPLAY "ADD=" WS-RESULT.
           SUBTRACT REC-B FROM REC-A GIVING WS-RESULT.
           DISPLAY "SUB=" WS-RESULT.
           MULTIPLY REC-A BY REC-B GIVING WS-RESULT.
           DISPLAY "MUL=" WS-RESULT.
           DIVIDE REC-A BY REC-B GIVING WS-RESULT.
           DISPLAY "DIV=" WS-RESULT.
           CLOSE REL-FILE.
           STOP RUN.
