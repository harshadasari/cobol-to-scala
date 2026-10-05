      * qq10: reference modification on a RECURSIVE program's LINKAGE
      * leaves (scalar and a group's leaf), read and write; the callee's
      * writes land back in the caller's storage.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ10.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC X(8) VALUE "12345678".
       01  WS-G.
           05  WS-N   PIC 9(2) VALUE 5.
           05  WS-TAG PIC X(6) VALUE "ABCDEF".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "QQ10SUB" USING BY REFERENCE WS-A WS-G.
           DISPLAY "A=[" WS-A "]".
           DISPLAY "N=" WS-N " TAG=[" WS-TAG "]".
           STOP RUN.
       END PROGRAM QQ10.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ10SUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-A PIC X(8).
       01  LK-G.
           05  LK-N   PIC 9(2).
           05  LK-TAG PIC X(6).
       PROCEDURE DIVISION USING LK-A LK-G.
           DISPLAY "READ A=[" LK-A(3:4) "] TAG=[" LK-TAG(2:3) "]".
           MOVE "xx" TO LK-A(2:2).
           MOVE LK-A(7:2) TO LK-A(1:2).
           MOVE "-+" TO LK-TAG(5:2).
           MOVE "9" TO LK-N(2:1).
           GOBACK.
       END PROGRAM QQ10SUB.
