       IDENTIFICATION DIVISION.
       PROGRAM-ID. N02EXITPA.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG        PIC 9(1) VALUE 1.
       01 WS-A           PIC 9(2) VALUE 0.
       01 WS-B           PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM SUB-PARA
           DISPLAY "WS-A=" WS-A " WS-B=" WS-B
           STOP RUN.
       SUB-PARA.
           ADD 1 TO WS-A
           IF WS-FLAG = 1
               EXIT PARAGRAPH
           END-IF
           ADD 1 TO WS-B.
