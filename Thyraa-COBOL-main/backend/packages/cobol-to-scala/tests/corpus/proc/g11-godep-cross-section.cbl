       IDENTIFICATION DIVISION.
       PROGRAM-ID. G11.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SEL PIC 9(1) VALUE 3.
       PROCEDURE DIVISION.
       SECT-ONE SECTION.
       ONE-START.
           DISPLAY "ONE-START".
           GO TO ONE-A ONE-B TWO-A DEPENDING ON WS-SEL.
           DISPLAY "ONE-START-FALLTHROUGH".
       ONE-A.
           DISPLAY "ONE-A".
           GO TO END-PARA.
       ONE-B.
           DISPLAY "ONE-B".
           GO TO END-PARA.
       SECT-TWO SECTION.
       TWO-A.
           DISPLAY "TWO-A".
           GO TO END-PARA.
       TWO-B.
           DISPLAY "TWO-B".
       SECT-THREE SECTION.
       END-PARA.
           DISPLAY "END-PARA".
           STOP RUN.
