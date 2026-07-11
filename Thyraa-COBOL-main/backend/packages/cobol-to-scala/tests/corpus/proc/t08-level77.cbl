       IDENTIFICATION DIVISION.
       PROGRAM-ID. T08LEVEL77.
      * Round-6 attack: level-77 items in WORKING-STORAGE (independent
      * elementary items, not part of any 01 group) - no prior corpus
      * program declares one at all. Mix numeric/alphanumeric 77s and
      * exercise them in arithmetic, MOVE, and DISPLAY.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       77  WS-COUNTER          PIC 9(4) VALUE 0.
       77  WS-NAME             PIC X(10) VALUE "STANDALONE".
       77  WS-TOTAL            PIC S9(5)V99 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD 10 TO WS-COUNTER.
           ADD 5 TO WS-COUNTER.
           DISPLAY "COUNTER=" WS-COUNTER.
           DISPLAY "NAME=[" WS-NAME "]".
           COMPUTE WS-TOTAL = WS-COUNTER * 1.5.
           DISPLAY "TOTAL=" WS-TOTAL.
           MOVE "REASSIGNED" TO WS-NAME.
           DISPLAY "NAME2=[" WS-NAME "]".
           STOP RUN.
