      * Round-12 probe z03: INITIALIZE ... REPLACING on a SUBSCRIPTED table
      * element - attacks whether the subscript-targeting fix (y17) composes
      * correctly with the REPLACING <category> BY <value> clause (round-5
      * finding 4), which only touches leaves whose CATEGORY is named.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z03INITREP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 3 TIMES.
               10  WS-NAME  PIC X(6) VALUE "XXXXXX".
               10  WS-AMT   PIC 9(4) VALUE 9999.
               10  WS-CODE  PIC X(3) VALUE "QQQ".
       01  WS-I PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAAAA" TO WS-NAME(1). MOVE 111 TO WS-AMT(1).
           MOVE "A01" TO WS-CODE(1).
           MOVE "BBBBBB" TO WS-NAME(2). MOVE 222 TO WS-AMT(2).
           MOVE "B02" TO WS-CODE(2).
           MOVE "CCCCCC" TO WS-NAME(3). MOVE 333 TO WS-AMT(3).
           MOVE "C03" TO WS-CODE(3).

           INITIALIZE WS-ENTRY(WS-I)
               REPLACING NUMERIC DATA BY 55
                         ALPHANUMERIC DATA BY "Q".

           DISPLAY "E1=" WS-NAME(1) "/" WS-AMT(1) "/" WS-CODE(1).
           DISPLAY "E2=" WS-NAME(2) "/" WS-AMT(2) "/" WS-CODE(2).
           DISPLAY "E3=" WS-NAME(3) "/" WS-AMT(3) "/" WS-CODE(3).
           STOP RUN.
