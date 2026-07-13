       IDENTIFICATION DIVISION.
       PROGRAM-ID. G01.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DELIMSRC     PIC X(10) VALUE "AAA-BBB-CC".
       01  WS-LINE         PIC X(20) VALUE "ONE-TWO-THREE-FOUR".
       01  WS-F1           PIC X(10).
       01  WS-F2           PIC X(10).
       01  WS-F3           PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           UNSTRING WS-LINE DELIMITED BY WS-DELIMSRC(4:1)
               INTO WS-F1 WS-F2 WS-F3.
           DISPLAY "F1=[" WS-F1 "]".
           DISPLAY "F2=[" WS-F2 "]".
           DISPLAY "F3=[" WS-F3 "]".
           STOP RUN.
