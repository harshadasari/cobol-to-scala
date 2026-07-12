       IDENTIFICATION DIVISION.
       PROGRAM-ID. D08.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-OUTER OCCURS 2 TIMES.
               10 WS-INNER OCCURS 2 TIMES.
                   15 IN-CODE PIC X(2).
                   15 IN-NUM  PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO IN-CODE(1,1).
           MOVE 11 TO IN-NUM(1,1).
           MOVE "ZZ" TO IN-CODE(2,2).
           MOVE 99 TO IN-NUM(2,2).
           MOVE WS-INNER(1,1) TO WS-INNER(2,2).
           DISPLAY "OUT22=" IN-CODE(2,2) " " IN-NUM(2,2).
           DISPLAY "OUT11=" IN-CODE(1,1) " " IN-NUM(1,1).
           STOP RUN.
