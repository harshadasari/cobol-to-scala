      * qq01: reference modification with literal start/length (read),
      * the open-ended (start:) form, and MOVE of a slice into fields
      * both shorter and longer than the slice.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ01.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC   PIC X(12) VALUE "ABCDEFGHIJKL".
       01  WS-SHORT PIC X(2)  VALUE "..".
       01  WS-LONG  PIC X(8)  VALUE "++++++++".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "A=[" WS-SRC(1:3) "]".
           DISPLAY "B=[" WS-SRC(5:4) "]".
           DISPLAY "C=[" WS-SRC(12:1) "]".
           DISPLAY "D=[" WS-SRC(9:) "]".
           DISPLAY "E=[" WS-SRC(1:) "]".
           MOVE WS-SRC(3:5) TO WS-SHORT.
           DISPLAY "SHORT=[" WS-SHORT "]".
           MOVE WS-SRC(3:5) TO WS-LONG.
           DISPLAY "LONG=[" WS-LONG "]".
           STOP RUN.
