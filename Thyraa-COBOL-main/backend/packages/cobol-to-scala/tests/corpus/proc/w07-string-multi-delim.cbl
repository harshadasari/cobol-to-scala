       IDENTIFICATION DIVISION.
       PROGRAM-ID. W07.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC1   PIC X(10) VALUE "AAA,BBB;CC".
       01 WS-SRC2   PIC X(10) VALUE "XXX:YYY,ZZ".
       01 WS-OUT    PIC X(30).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING WS-SRC1 DELIMITED BY ","
                  " - "   DELIMITED BY SIZE
                  WS-SRC2 DELIMITED BY ":"
                  INTO WS-OUT.
           DISPLAY "OUT=[" WS-OUT "]".
           STOP RUN.
