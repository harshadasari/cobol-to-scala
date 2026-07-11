       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y08CSUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ELEM  OCCURS 5 TIMES PIC 9(4)V99.
       01  WS-A         PIC 9(4)V99.
       01  WS-B         PIC 9(4)V9.
       01  WS-I         PIC 9 VALUE 2.
       01  WS-J         PIC 9 VALUE 4.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-ELEM(WS-I) WS-ELEM(WS-J) WS-A ROUNDED =
               10.125.
           DISPLAY "ELEM2=" WS-ELEM(2) " ELEM4=" WS-ELEM(4)
               " A=" WS-A.
           COMPUTE WS-A ROUNDED WS-B = 3 / 7.
           DISPLAY "A=" WS-A " B=" WS-B.
           STOP RUN.
