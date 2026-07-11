       IDENTIFICATION DIVISION.
       PROGRAM-ID. A03MOVN.
      *
      * Adversarial: numeric-to-numeric MOVE truncation/padding across
      * digit counts, numeric-to-alphanumeric MOVE, MOVE SPACES to
      * numeric field.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC-5DIG         PIC 9(5) VALUE 12345.
       01  WS-TARGET-3DIG      PIC 9(3).
       01  WS-TARGET-8DIG      PIC 9(8).
       01  WS-SRC-DEC          PIC 9(3)V99 VALUE 123.456.
       01  WS-TARGET-DEC-SM    PIC 9(1)V9.
       01  WS-TARGET-DEC-LG    PIC 9(5)V9(4).
       01  WS-NUM-SRC          PIC 9(4) VALUE 7.
       01  WS-ALPHA-TARGET     PIC X(8).
       01  WS-NUMERIC-FIELD    PIC 9(5) VALUE 99999.
       01  WS-NEG-SRC          PIC S9(3) VALUE -7.
       01  WS-UNSIGNED-TARGET  PIC 9(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-SRC-5DIG TO WS-TARGET-3DIG
           DISPLAY 'TRUNC-HIGH=' WS-TARGET-3DIG

           MOVE WS-SRC-5DIG TO WS-TARGET-8DIG
           DISPLAY 'PAD-HIGH=' WS-TARGET-8DIG

           MOVE WS-SRC-DEC TO WS-TARGET-DEC-SM
           DISPLAY 'DEC-TRUNC=' WS-TARGET-DEC-SM

           MOVE WS-SRC-DEC TO WS-TARGET-DEC-LG
           DISPLAY 'DEC-PAD=' WS-TARGET-DEC-LG

           MOVE WS-NUM-SRC TO WS-ALPHA-TARGET
           DISPLAY 'NUM-TO-ALPHA=[' WS-ALPHA-TARGET ']'

           MOVE ZERO TO WS-NUMERIC-FIELD
           DISPLAY 'ZERO-TO-NUM=[' WS-NUMERIC-FIELD ']'

           MOVE WS-NEG-SRC TO WS-UNSIGNED-TARGET
           DISPLAY 'NEG-TO-UNSIGNED=[' WS-UNSIGNED-TARGET ']'

           STOP RUN.
