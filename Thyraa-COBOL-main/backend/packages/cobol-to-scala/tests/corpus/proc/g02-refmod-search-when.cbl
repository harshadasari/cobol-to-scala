       IDENTIFICATION DIVISION.
       PROGRAM-ID. G02.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-KEYSRC       PIC X(10) VALUE "XXBBYYCCZZ".
       01  WS-TABLE.
           05  WS-ROW OCCURS 4 INDEXED BY WS-IDX.
               10  WS-CODE  PIC X(2).
               10  WS-VAL   PIC 9(3).
       01  WS-FOUND        PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO WS-CODE(1).
           MOVE 111 TO WS-VAL(1).
           MOVE "BB" TO WS-CODE(2).
           MOVE 222 TO WS-VAL(2).
           MOVE "CC" TO WS-CODE(3).
           MOVE 333 TO WS-VAL(3).
           MOVE "DD" TO WS-CODE(4).
           MOVE 444 TO WS-VAL(4).
           SEARCH WS-ROW
               AT END DISPLAY "NOT FOUND"
               WHEN WS-CODE(WS-IDX) = WS-KEYSRC(3:2)
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND
           END-SEARCH.
           DISPLAY "FOUND=" WS-FOUND.
           STOP RUN.
