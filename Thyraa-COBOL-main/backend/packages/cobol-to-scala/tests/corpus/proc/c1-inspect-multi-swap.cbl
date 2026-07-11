       IDENTIFICATION DIVISION.
       PROGRAM-ID. INSPMULTI.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STR PIC X(8) VALUE "AAAABBBB".
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-STR REPLACING ALL "A" BY "B"
                                     ALL "B" BY "A".
           DISPLAY "STR=[" WS-STR "]".
           STOP RUN.
