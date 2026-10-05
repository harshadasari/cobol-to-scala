      * qq07: ref-mod as a STRING source, as an UNSTRING DELIMITED BY
      * operand, as the UNSTRING source and as an UNSTRING/STRING target.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ07.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC   PIC X(12) VALUE "HELLO WORLD!".
       01  WS-DELIM PIC X(4)  VALUE "A-B ".
       01  WS-LINE  PIC X(11) VALUE "ONE-TWO-SIX".
       01  WS-OUT   PIC X(20) VALUE "********************".
       01  WS-F1    PIC X(5).
       01  WS-F2    PIC X(5).
       01  WS-BUF   PIC X(12) VALUE "............".
       01  WS-S     PIC 99 VALUE 7.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING WS-SRC(1:5) DELIMITED BY SIZE
                  "/" DELIMITED BY SIZE
                  WS-SRC(WS-S:5) DELIMITED BY SIZE
               INTO WS-OUT.
           DISPLAY "OUT=[" WS-OUT "]".
           UNSTRING WS-LINE DELIMITED BY WS-DELIM(2:1)
               INTO WS-F1 WS-F2.
           DISPLAY "F1=[" WS-F1 "] F2=[" WS-F2 "]".
           UNSTRING WS-LINE(5:7) DELIMITED BY "-"
               INTO WS-F1 WS-F2.
           DISPLAY "G1=[" WS-F1 "] G2=[" WS-F2 "]".
           UNSTRING WS-LINE DELIMITED BY "-"
               INTO WS-BUF(2:3) WS-BUF(8:4).
           DISPLAY "BUF=[" WS-BUF "]".
           STRING "ab" DELIMITED BY SIZE INTO WS-BUF(10:3).
           DISPLAY "BUF=[" WS-BUF "]".
           STOP RUN.
