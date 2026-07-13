       IDENTIFICATION DIVISION.
       PROGRAM-ID. F13.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X(1) VALUE "2".
       01 WS-FLAG-NUM REDEFINES WS-FLAG PIC 9(1).
           88 FLAG-LOW VALUE 0 1.
           88 FLAG-MID VALUE 2 3.
           88 FLAG-HIGH VALUE 4 THRU 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE TRUE
               WHEN FLAG-LOW
                   DISPLAY "RESULT=LOW"
               WHEN FLAG-MID
                   DISPLAY "RESULT=MID"
               WHEN FLAG-HIGH
                   DISPLAY "RESULT=HIGH"
               WHEN OTHER
                   DISPLAY "RESULT=OTHER"
           END-EVALUATE.

           MOVE "7" TO WS-FLAG.
           EVALUATE TRUE
               WHEN FLAG-LOW
                   DISPLAY "RESULT2=LOW"
               WHEN FLAG-MID
                   DISPLAY "RESULT2=MID"
               WHEN FLAG-HIGH
                   DISPLAY "RESULT2=HIGH"
               WHEN OTHER
                   DISPLAY "RESULT2=OTHER"
           END-EVALUATE.

           MOVE 0 TO WS-FLAG-NUM.
           EVALUATE TRUE
               WHEN FLAG-LOW
                   DISPLAY "RESULT3=LOW"
               WHEN OTHER
                   DISPLAY "RESULT3=OTHER"
           END-EVALUATE.
           STOP RUN.
