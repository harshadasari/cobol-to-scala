       IDENTIFICATION DIVISION.
       PROGRAM-ID. S09UNARYPW.
      * Round-5 attack: COMPUTE with chained unary minus and a
      * parenthesized exponent - operator precedence/associativity
      * edge no prior round's COMPUTE corpus combined together.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A                PIC S9(4) VALUE 2.
       01  WS-B                PIC S9(4) VALUE 3.
       01  WS-C                PIC S9(4) VALUE 1.
       01  WS-R1               PIC S9(6) VALUE 0.
       01  WS-R2               PIC S9(6) VALUE 0.
       01  WS-R3               PIC S9(6) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-R1 = - WS-A ** (WS-B - WS-C).
           COMPUTE WS-R2 = - ( - WS-A) + WS-B ** 2.
           COMPUTE WS-R3 = - ( - WS-A) * WS-B.
           DISPLAY "R1=" WS-R1.
           DISPLAY "R2=" WS-R2.
           DISPLAY "R3=" WS-R3.
           STOP RUN.
