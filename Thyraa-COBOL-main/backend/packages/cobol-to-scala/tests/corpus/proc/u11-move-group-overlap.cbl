       IDENTIFICATION DIVISION.
       PROGRAM-ID. U11OVL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-GROUP.
          05 WS-A PIC X(4) VALUE "ABCD".
          05 WS-B PIC X(4) VALUE "WXYZ".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-GROUP TO WS-A.
           DISPLAY "A=[" WS-A "] B=[" WS-B "]".
           STOP RUN.
