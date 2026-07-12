       IDENTIFICATION DIVISION.
       PROGRAM-ID. E05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       01 WS-FLAG PIC X(1) VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-SRC(1:3) = "ABC"
               DISPLAY "MATCH1=YES"
           ELSE
               DISPLAY "MATCH1=NO"
           END-IF.
           IF WS-SRC(4:3) = "XYZ"
               DISPLAY "MATCH2=YES"
           ELSE
               DISPLAY "MATCH2=NO"
           END-IF.
           IF WS-SRC(8:3) > "AAA"
               MOVE "Y" TO WS-FLAG
           END-IF.
           DISPLAY "FLAG=" WS-FLAG.
           STOP RUN.
