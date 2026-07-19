      * mm13 (round 37): fresh-territory probe - PERFORM VARYING's own
      * UNTIL bound is a FUNCTION call whose argument is itself a nested
      * arithmetic expression (round-36 finding 2's own new
      * parseFunctionArgument chain feeding a loop-termination test, not a
      * COMPUTE or a subscript): UNTIL WS-I > FUNCTION MOD(WS-N * 2, 5) + 2.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM13.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(1).
       01  WS-N PIC 9(2) VALUE 6.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1
               UNTIL WS-I > FUNCTION MOD(WS-N * 2, 5) + 2
                   DISPLAY "I=" WS-I
           END-PERFORM.
           DISPLAY "FINAL I=" WS-I.
           STOP RUN.
