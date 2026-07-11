       IDENTIFICATION DIVISION.
       PROGRAM-ID. V09-MOVEALL-OCCURS.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-ELEM  PIC X(5) OCCURS 3 TIMES.
       01 WS-I         PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAAA" TO WS-ELEM(1).
           MOVE "BBBBB" TO WS-ELEM(2).
           MOVE "CCCCC" TO WS-ELEM(3).
           MOVE ALL "*" TO WS-ELEM(2).
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY "ELEM(" WS-I ")=" WS-ELEM(WS-I)
           END-PERFORM.
           STOP RUN.
