       IDENTIFICATION DIVISION.
       PROGRAM-ID. S04DUALPRF.
      * Round-5 attack: the SAME paragraph is invoked both by a
      * nested inline PERFORM (from inside an IF, a la r09) AND by an
      * ordinary out-of-line top-level PERFORM later in the same
      * program, plus reached once more by natural fall-through.
      * Confirms one consistent, reusable generated method regardless
      * of call site shape.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CALLS            PIC 9(1) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MAIN-START".
           IF WS-CALLS = 0
               PERFORM 2000-SHARED
           END-IF.
           PERFORM 2000-SHARED.
           DISPLAY "CALLS=" WS-CALLS.
           STOP RUN.
       2000-SHARED.
           ADD 1 TO WS-CALLS.
           DISPLAY "SHARED-CALL-" WS-CALLS.
