       IDENTIFICATION DIVISION.
       PROGRAM-ID. A04JUST.
      *
      * Adversarial: alphanumeric truncation right (default, extra
      * chars on the right dropped) vs JUSTIFIED RIGHT (extra chars
      * on the LEFT dropped, right-aligned with left padding).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC              PIC X(10) VALUE 'ABCDEFGHIJ'.
       01  WS-TARGET-DEFAULT   PIC X(5).
       01  WS-TARGET-JUST      PIC X(5) JUSTIFIED RIGHT.
       01  WS-SHORT-SRC        PIC X(3) VALUE 'XY'.
       01  WS-TARGET-JUST-PAD  PIC X(6) JUSTIFIED RIGHT.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-SRC TO WS-TARGET-DEFAULT
           DISPLAY 'DEFAULT=[' WS-TARGET-DEFAULT ']'

           MOVE WS-SRC TO WS-TARGET-JUST
           DISPLAY 'JUSTIFIED=[' WS-TARGET-JUST ']'

           MOVE WS-SHORT-SRC TO WS-TARGET-JUST-PAD
           DISPLAY 'JUST-PAD=[' WS-TARGET-JUST-PAD ']'

           STOP RUN.
