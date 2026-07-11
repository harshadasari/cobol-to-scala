       IDENTIFICATION DIVISION.
       PROGRAM-ID. N07STRNM.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-QTY         PIC 9(3) VALUE 42.
       01 WS-NAME        PIC X(5) VALUE "HELLO".
       01 WS-OUT         PIC X(30).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING "QTY=" WS-QTY " LEN="
               FUNCTION LENGTH(WS-NAME) " LIT=" 7
               DELIMITED BY SIZE INTO WS-OUT
           DISPLAY "[" WS-OUT "]"
           STOP RUN.
