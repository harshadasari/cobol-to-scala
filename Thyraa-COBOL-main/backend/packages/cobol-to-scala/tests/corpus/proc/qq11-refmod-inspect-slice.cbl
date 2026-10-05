      * qq11: INSPECT on a reference-modified subject: REPLACING and
      * TALLYING and CONVERTING touch only the slice.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ11.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-T PIC X(12) VALUE "AABBAABBAABB".
       01  WS-C PIC 99 VALUE 0.
       01  WS-S PIC 99 VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-T(3:6) REPLACING ALL "A" BY "x".
           DISPLAY "T1=[" WS-T "]".
           INSPECT WS-T(WS-S:4) TALLYING WS-C FOR ALL "B".
           DISPLAY "COUNT=" WS-C.
           INSPECT WS-T(9:) REPLACING ALL "B" BY "y".
           DISPLAY "T2=[" WS-T "]".
           INSPECT WS-T(1:4) CONVERTING "AB" TO "12".
           DISPLAY "T3=[" WS-T "]".
           INSPECT WS-T(1:2) REPLACING LEADING "1" BY "0".
           DISPLAY "T4=[" WS-T "]".
           STOP RUN.
