      * qq09: ref-mod as a CALL argument. BY REFERENCE aliases the
      * slice: the callee's write lands back in exactly those bytes of the
      * caller's field; BY CONTENT passes a copy.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ09.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-BUF PIC X(12) VALUE "abcdefghijkl".
       01  WS-S   PIC 99 VALUE 4.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE=[" WS-BUF "]".
           CALL "QQ09SUB" USING BY REFERENCE WS-BUF(3:4).
           DISPLAY "AFTER1=[" WS-BUF "]".
           CALL "QQ09SUB" USING BY REFERENCE WS-BUF(WS-S + 5:4).
           DISPLAY "AFTER2=[" WS-BUF "]".
           CALL "QQ09SUB" USING BY CONTENT WS-BUF(1:4).
           DISPLAY "AFTER3=[" WS-BUF "]".
           STOP RUN.
       END PROGRAM QQ09.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ09SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LS-ARG PIC X(4).
       PROCEDURE DIVISION USING LS-ARG.
           DISPLAY "IN SUB=[" LS-ARG "]".
           MOVE "<--" TO LS-ARG(2:3).
           GOBACK.
       END PROGRAM QQ09SUB.
