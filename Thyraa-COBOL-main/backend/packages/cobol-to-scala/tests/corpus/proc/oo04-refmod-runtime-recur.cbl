      * oo04 (round 39): round-38 finding 2 fixed BY REFERENCE writeback
      * for a ref-mod'd operand into a RECURSIVE callee, but nn04's own
      * ref-mod bounds were compile-time literals (WS-STR(3:4)). This
      * probe uses ref-modification bounds that are themselves VARIABLES
      * computed at runtime (WS-STR(WS-START:WS-LEN)), not literals - a
      * shape the round-38 fix's kk12-style "narrow, unambiguous" codegen
      * may or may not actually handle, since the start/length are not
      * known until runtime.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO04REFMODVAR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STR PIC X(10) VALUE "ABCDEFGHIJ".
       01  WS-START PIC 9 VALUE 3.
       01  WS-LEN PIC 9 VALUE 4.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE STR=[" WS-STR "]".
           CALL "OO04SUB" USING BY REFERENCE WS-STR(WS-START:WS-LEN).
           DISPLAY "AFTER STR=[" WS-STR "]".
           STOP RUN.
       END PROGRAM OO04REFMODVAR.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO04SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DEPTH PIC 9 VALUE 0.
       LINKAGE SECTION.
       01  LK-SLICE PIC X(4).
       PROCEDURE DIVISION USING LK-SLICE.
           DISPLAY "IN SUB SLICE=[" LK-SLICE "]".
           MOVE "ZZ" TO LK-SLICE(1:2).
           GOBACK.
       END PROGRAM OO04SUB.
