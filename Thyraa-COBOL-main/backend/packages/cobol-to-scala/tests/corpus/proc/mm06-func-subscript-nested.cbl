      * mm06 (round 37): fresh-territory probe - a table subscript
      * expression that is itself a FUNCTION call containing nested
      * arithmetic (round-36 finding 2's own new parseFunctionArgument
      * chain feeding into a subscript position, not a COMPUTE): WS-TABLE
      * ( FUNCTION MOD(WS-I * 2, 3) + 1 ). Loops WS-I 1..3 so the subscript
      * value cycles through 3, 2, 1 - confirms both that the nested-
      * arithmetic FUNCTION argument parses/generates correctly here too,
      * and that the "+ 1" outside the FUNCTION call is applied to the
      * FUNCTION's own result before indexing.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM06.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I     PIC 9(1).
       01  WS-TABLE.
           05  WS-CELL PIC X(4) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "ZZZZ" TO WS-CELL(1).
           MOVE "ZZZZ" TO WS-CELL(2).
           MOVE "ZZZZ" TO WS-CELL(3).
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               MOVE "HERE" TO WS-CELL(FUNCTION MOD(WS-I * 2, 3) + 1)
               DISPLAY "I=" WS-I " SUBSCRIPT-FILLED"
           END-PERFORM.
           DISPLAY "CELL1=[" WS-CELL(1) "]".
           DISPLAY "CELL2=[" WS-CELL(2) "]".
           DISPLAY "CELL3=[" WS-CELL(3) "]".
           STOP RUN.
