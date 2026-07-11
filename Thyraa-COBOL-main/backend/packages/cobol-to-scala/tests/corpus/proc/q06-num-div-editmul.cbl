       IDENTIFICATION DIVISION.
       PROGRAM-ID. NUM02.
      *
      * Round-4 attack: DIVIDE ... REMAINDER where the quotient
      * receiver is a numeric-EDITED picture (not plain numeric, as
      * a11 already covers), and MULTIPLY chained through several
      * GIVING targets in sequence (each feeding the next).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DIVIDEND         PIC 9(5)  VALUE 17.
       01  WS-DIVISOR          PIC 9(5)  VALUE 5.
       01  WS-QUOT-EDIT        PIC ZZ,ZZ9.
       01  WS-REM              PIC 9(5).
       01  WS-NEG-DIVIDEND     PIC S9(5) VALUE -17.
       01  WS-NEG-QUOT-EDIT    PIC -(3)9.
       01  WS-NEG-REM          PIC S9(5).
       01  WS-M1               PIC 9(4)  VALUE 3.
       01  WS-M2               PIC 9(4)  VALUE 4.
       01  WS-M3               PIC 9(4)  VALUE 5.
       01  WS-R1               PIC 9(6).
       01  WS-R2               PIC 9(8).
       01  WS-R3               PIC 9(10).
       PROCEDURE DIVISION.
       0000-MAIN.
      *    DIVIDE ... REMAINDER with an edited quotient receiver.
           DIVIDE WS-DIVIDEND BY WS-DIVISOR
               GIVING WS-QUOT-EDIT REMAINDER WS-REM
           DISPLAY 'QUOT-EDIT=' WS-QUOT-EDIT
           DISPLAY 'REM=' WS-REM
      *
      *    Same, with a negative dividend and a sign-edited quotient.
           DIVIDE WS-NEG-DIVIDEND BY WS-DIVISOR
               GIVING WS-NEG-QUOT-EDIT REMAINDER WS-NEG-REM
           DISPLAY 'NEG-QUOT-EDIT=' WS-NEG-QUOT-EDIT
           DISPLAY 'NEG-REM=' WS-NEG-REM
      *
      *    MULTIPLY chained through GIVING targets: R1 = M1*M2,
      *    R2 = R1*M3, R3 = R2*M1 - each step's GIVING target feeds
      *    the next MULTIPLY as an operand.
           MULTIPLY WS-M1 BY WS-M2 GIVING WS-R1
           MULTIPLY WS-R1 BY WS-M3 GIVING WS-R2
           MULTIPLY WS-R2 BY WS-M1 GIVING WS-R3
           DISPLAY 'R1=' WS-R1
           DISPLAY 'R2=' WS-R2
           DISPLAY 'R3=' WS-R3
      *
           STOP RUN.
