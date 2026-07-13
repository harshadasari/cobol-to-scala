       IDENTIFICATION DIVISION.
       PROGRAM-ID. G05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP.
           05  G-LEAD    PIC X(1) VALUE "L".
           05  G-SHORT   PIC S9(4) COMP SYNC VALUE 7.
           05  G-MID     PIC X(1) VALUE "M".
           05  G-LONG    PIC S9(15) COMP SYNC VALUE 123456789.
           05  G-TAIL    PIC X(1) VALUE "T".
       01  WS-LEN        PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-LEN = FUNCTION LENGTH(WS-GRP).
           DISPLAY "LEN=" WS-LEN.
           DISPLAY "LEAD=" G-LEAD.
           DISPLAY "SHORT=" G-SHORT.
           DISPLAY "MID=" G-MID.
           DISPLAY "LONG=" G-LONG.
           DISPLAY "TAIL=" G-TAIL.
           STOP RUN.
