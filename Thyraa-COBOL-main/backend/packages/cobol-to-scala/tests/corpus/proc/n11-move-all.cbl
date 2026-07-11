       IDENTIFICATION DIVISION.
       PROGRAM-ID. N11MOVAL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FILL        PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE ALL "AB" TO WS-FILL
           DISPLAY "[" WS-FILL "]"
           MOVE ALL "XYZ" TO WS-FILL
           DISPLAY "[" WS-FILL "]"
           STOP RUN.
