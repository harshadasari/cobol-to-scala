       IDENTIFICATION DIVISION.
       PROGRAM-ID. R09NESTPF.
      *
      * Adversarial: PERFORM of a paragraph nested inside a PERFORM of
      * that SAME paragraph (self-referential PERFORM), bounded to
      * depth 3 by an IF guard so it terminates regardless of which
      * semantics a given engine implements. Real COBOL runtimes
      * (GnuCOBOL included) maintain an explicit perform-return stack,
      * so this behaves like ordinary recursion: each nested PERFORM
      * call gets its own return point, and unwinding runs the
      * "after the nested PERFORM" statements once per stack frame,
      * in LIFO order. A transpiler that lowers PERFORM into inlined
      * statement blocks (rather than real function calls) cannot
      * represent this at all.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DEPTH            PIC 9(2) VALUE 0.
       01  WS-X                PIC 9(4) VALUE 0.
       01  WS-CALLS            PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM 1000-RECURSE
           DISPLAY 'FINAL-DEPTH=' WS-DEPTH
           DISPLAY 'FINAL-X=' WS-X
           DISPLAY 'FINAL-CALLS=' WS-CALLS
           STOP RUN.
      *
       1000-RECURSE.
           ADD 1 TO WS-CALLS
           ADD 1 TO WS-DEPTH
           ADD 1 TO WS-X
           IF WS-DEPTH < 3
               PERFORM 1000-RECURSE
           END-IF
           ADD 100 TO WS-X
           SUBTRACT 1 FROM WS-DEPTH.
