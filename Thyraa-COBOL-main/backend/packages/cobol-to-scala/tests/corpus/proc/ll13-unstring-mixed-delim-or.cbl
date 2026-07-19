      * ll13 (round 36): fresh-territory probe - UNSTRING with a single
      * DELIMITED BY clause that OR-combines a DATA-NAME delimiter
      * (WS-DELIM, holding "#") with a LITERAL delimiter ("," ) in the SAME
      * statement, plus TALLYING IN, to confirm both delimiter kinds are
      * recognized together (not just one or the other).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL13.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC   PIC X(20) VALUE "AA#BB,CC#DD".
       01  WS-DELIM PIC X(1)  VALUE "#".
       01  WS-A     PIC X(5).
       01  WS-B     PIC X(5).
       01  WS-C     PIC X(5).
       01  WS-D     PIC X(5).
       01  WS-CNT   PIC 9(1) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           UNSTRING WS-SRC DELIMITED BY WS-DELIM OR ","
               INTO WS-A WS-B WS-C WS-D
               TALLYING IN WS-CNT
           END-UNSTRING.
           DISPLAY "A=[" WS-A "]".
           DISPLAY "B=[" WS-B "]".
           DISPLAY "C=[" WS-C "]".
           DISPLAY "D=[" WS-D "]".
           DISPLAY "CNT=" WS-CNT.
           STOP RUN.
