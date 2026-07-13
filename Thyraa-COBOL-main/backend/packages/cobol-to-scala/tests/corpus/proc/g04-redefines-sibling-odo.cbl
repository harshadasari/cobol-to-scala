       IDENTIFICATION DIVISION.
       PROGRAM-ID. G04.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-HEAD PIC X(4) VALUE "HEAD".
           05  WS-HEAD-ALT REDEFINES WS-HEAD.
               10  WS-HEAD-N1 PIC X(2).
               10  WS-HEAD-N2 PIC X(2).
           05  WS-COUNT PIC 9(2) VALUE 3.
           05  WS-ROW OCCURS 1 TO 5 TIMES DEPENDING ON WS-COUNT.
               10  R-CODE PIC X(2).
               10  R-NUM  PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO R-CODE(1). MOVE 111 TO R-NUM(1).
           MOVE "BB" TO R-CODE(2). MOVE 222 TO R-NUM(2).
           MOVE "CC" TO R-CODE(3). MOVE 333 TO R-NUM(3).
           DISPLAY "N1=[" WS-HEAD-N1 "]".
           DISPLAY "N2=[" WS-HEAD-N2 "]".
           DISPLAY "R2=" R-CODE(2) " " R-NUM(2).
           MOVE "ZZ" TO WS-HEAD-N2.
           DISPLAY "HEAD-AFTER=[" WS-HEAD "]".
           DISPLAY "COUNT=" WS-COUNT.
           STOP RUN.
