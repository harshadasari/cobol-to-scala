       IDENTIFICATION DIVISION.
       PROGRAM-ID. A12MVCH.
      *
      * Adversarial: alphanumeric-to-numeric-edited MOVE chain,
      * MOVE of a numeric literal with more decimal digits than the
      * target (rounding is NOT applied on MOVE - it truncates),
      * and numeric MOVE where target has fewer integer digits than
      * a negative source (sign correctness under truncation).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC-NEG-BIG      PIC S9(6) VALUE -123456.
       01  WS-TARGET-3         PIC S9(3).
       01  WS-DEC-SRC          PIC S9(2)V9(4) VALUE 12.9999.
       01  WS-DEC-TARGET-TRUNC PIC S9(2)V9(1).
       01  WS-ZERO-SRC         PIC S9(3) VALUE 0.
       01  WS-ZERO-EDIT-TARGET PIC ----9.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-SRC-NEG-BIG TO WS-TARGET-3
           DISPLAY 'NEG-TRUNC-3=' WS-TARGET-3

           MOVE WS-DEC-SRC TO WS-DEC-TARGET-TRUNC
           DISPLAY 'DEC-TRUNC-NOT-ROUND=' WS-DEC-TARGET-TRUNC

           MOVE WS-ZERO-SRC TO WS-ZERO-EDIT-TARGET
           DISPLAY 'ZERO-SIGNED-EDIT=[' WS-ZERO-EDIT-TARGET ']'

           STOP RUN.
