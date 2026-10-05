      * qq06: ref-mod over PIC 9 DISPLAY fields: the slice is the digit
      * CHARACTERS (alphanumeric), usable as text, via FUNCTION NUMVAL,
      * MOVEd to numeric fields, and as a write target.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ06.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DATE PIC 9(8) VALUE 20261005.
       01  WS-YEAR PIC 9(4).
       01  WS-MM   PIC 99.
       01  WS-DEC  PIC 9(3)V99 VALUE 123.45.
       01  WS-SUM  PIC 9(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "Y=[" WS-DATE(1:4) "] M=[" WS-DATE(5:2)
               "] D=[" WS-DATE(7:2) "]".
           MOVE WS-DATE(1:4) TO WS-YEAR.
           MOVE WS-DATE(5:2) TO WS-MM.
           DISPLAY "YEAR=" WS-YEAR " MM=" WS-MM.
           COMPUTE WS-SUM = FUNCTION NUMVAL(WS-DATE(5:4)) + 1.
           DISPLAY "SUM=" WS-SUM.
           DISPLAY "DEC=[" WS-DEC(1:3) "|" WS-DEC(4:2) "]".
           MOVE "07" TO WS-DATE(5:2).
           DISPLAY "DATE=" WS-DATE.
           MOVE "99" TO WS-DEC(4:2).
           DISPLAY "DEC=" WS-DEC.
           STOP RUN.
