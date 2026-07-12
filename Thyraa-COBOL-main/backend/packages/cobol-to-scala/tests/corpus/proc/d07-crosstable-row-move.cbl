       IDENTIFICATION DIVISION.
       PROGRAM-ID. D07.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE-A.
           05 WS-ROW-A OCCURS 3 TIMES.
               10 A-CODE PIC X(3).
               10 A-NUM  PIC 9(3).
       01 WS-TABLE-B.
           05 WS-ROW-B OCCURS 3 TIMES.
               10 B-CODE PIC X(3).
               10 B-NUM  PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO A-CODE(1).
           MOVE 111 TO A-NUM(1).
           MOVE "ZZZ" TO B-CODE(2).
           MOVE 999 TO B-NUM(2).
           MOVE WS-ROW-A(1) TO WS-ROW-B(2).
           DISPLAY "B2-CODE=" B-CODE(2) " B2-NUM=" B-NUM(2).
           DISPLAY "A1-CODE=" A-CODE(1) " A1-NUM=" A-NUM(1).
           STOP RUN.
