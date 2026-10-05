      * qq05: subscripted table element combined with reference
      * modification, T(i)(s:l), read and write, subscript computed.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TAB.
           05  WS-ELEM PIC X(8) OCCURS 3.
       01  WS-I PIC 9 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAAAAAA" TO WS-ELEM(1).
           MOVE "BBBBBBBB" TO WS-ELEM(2).
           MOVE "CCCCCCCC" TO WS-ELEM(3).
           MOVE "xy" TO WS-ELEM(2)(3:2).
           MOVE 3 TO WS-I.
           MOVE "12345" TO WS-ELEM(WS-I)(4:5).
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY "E" WS-I "=[" WS-ELEM(WS-I) "] MID=["
                   WS-ELEM(WS-I)(3:3) "]"
           END-PERFORM.
           MOVE WS-ELEM(2)(2:4) TO WS-ELEM(1)(5:4).
           DISPLAY "E1=[" WS-ELEM(1) "]".
           STOP RUN.
