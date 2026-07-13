      * Adversarial (round 22): an intrinsic FUNCTION call used
      * DIRECTLY as a table subscript expression - "WS-ITEM(FUNCTION
      * MOD(WS-I, 5) + 1)" - not first stored into a helper variable and
      * then used as the subscript (the shape every prior corpus
      * FUNCTION-in-subscript-adjacent program, if any, would take).
      * FUNCTION MOD(7, 5) = 2, + 1 = 3, so WS-ITEM(3) = "CCCCC" is
      * expected.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K09FUNCSUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-ITEM PIC X(5) OCCURS 5 TIMES.
       01 WS-I PIC 9 VALUE 7.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAAA" TO WS-ITEM(1).
           MOVE "BBBBB" TO WS-ITEM(2).
           MOVE "CCCCC" TO WS-ITEM(3).
           MOVE "DDDDD" TO WS-ITEM(4).
           MOVE "EEEEE" TO WS-ITEM(5).
           DISPLAY "ITEM=" WS-ITEM(FUNCTION MOD(WS-I 5) + 1).
           STOP RUN.
