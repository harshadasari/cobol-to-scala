       IDENTIFICATION DIVISION.
       PROGRAM-ID. G08.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE   PIC X(1).
       01  WS-TOTAL  PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           MOVE "B" TO WS-CODE.
           EVALUATE WS-CODE
               WHEN "A" WHEN "B" WHEN "C"
                   DISPLAY "GROUP-ABC-BEFORE"
                   PERFORM STEP-ONE THRU STEP-THREE
                   DISPLAY "GROUP-ABC-AFTER"
               WHEN "X" WHEN "Y"
                   DISPLAY "GROUP-XY"
               WHEN OTHER
                   DISPLAY "GROUP-OTHER"
           END-EVALUATE.
           DISPLAY "TOTAL=" WS-TOTAL.
           STOP RUN.
       STEP-ONE.
           ADD 10 TO WS-TOTAL.
           DISPLAY "STEP-ONE".
       STEP-TWO.
           ADD 20 TO WS-TOTAL.
           DISPLAY "STEP-TWO".
       STEP-THREE.
           ADD 30 TO WS-TOTAL.
           DISPLAY "STEP-THREE".
