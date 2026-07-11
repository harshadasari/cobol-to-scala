       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1312.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A                PIC 9(3) VALUE 5.
       01  WS-B                PIC 9(3) VALUE 7.
       01  WS-SUM              PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "PART1"
      * THIS IS A COMMENT LINE IN THE MIDDLE OF A STATEMENT
               " PART2".
           COMPUTE WS-SUM =
      * ANOTHER COMMENT LINE, RIGHT INSIDE THE ARITHMETIC EXPRESSION
               WS-A + WS-B.
           DISPLAY "SUM=" WS-SUM.
           STOP RUN.
