      * qq04: reference modification of a GROUP item addresses the group's
      * flat character storage across its children (alphanumeric and
      * unsigned numeric), both read and write.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ04.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-NAME PIC X(6) VALUE "SMITH".
           05  WS-AGE  PIC 9(3) VALUE 042.
           05  WS-CITY PIC X(5) VALUE "OSLO".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "REC=[" WS-REC "]".
           DISPLAY "ACROSS=[" WS-REC(5:6) "]".
           DISPLAY "AGE=[" WS-REC(7:3) "]".
           MOVE "ZZ" TO WS-REC(5:2).
           DISPLAY "NAME=[" WS-NAME "] AGE=" WS-AGE.
           MOVE "9" TO WS-REC(9:1).
           DISPLAY "NAME=[" WS-NAME "] AGE=" WS-AGE
               " CITY=[" WS-CITY "]".
           MOVE "BERGE" TO WS-REC(10:5).
           DISPLAY "REC=[" WS-REC "]".
           STOP RUN.
