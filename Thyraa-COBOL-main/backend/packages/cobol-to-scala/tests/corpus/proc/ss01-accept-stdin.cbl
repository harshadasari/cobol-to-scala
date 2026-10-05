      * ss01: ACCEPT from stdin. The harness feeds ss01-accept-stdin.stdin.txt
      * to BOTH cobc and the generated Scala. Alphanumeric target (padded),
      * numeric target, an over-long line into a short PIC X (truncated),
      * and a numeric used in arithmetic afterwards.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SS01.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NAME   PIC X(10).
       01  WS-QTY    PIC 9(4).
       01  WS-SHORT  PIC X(5).
       01  WS-TOTAL  PIC 9(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           ACCEPT WS-NAME.
           ACCEPT WS-QTY.
           ACCEPT WS-SHORT.
           DISPLAY "NAME=[" WS-NAME "]".
           DISPLAY "QTY=[" WS-QTY "]".
           DISPLAY "SHORT=[" WS-SHORT "]".
           COMPUTE WS-TOTAL = WS-QTY * 3.
           DISPLAY "TOTAL=[" WS-TOTAL "]".
           STOP RUN.
