      * nn01 (round 38): cross-round feature interaction probe - combines
      * round-32/33/34's LINAGE/AT END-OF-PAGE counting, round-21/22's
      * RECURSIVE program with shared WORKING-STORAGE and a BY REFERENCE
      * LINKAGE parameter, and round-8's group-level REDEFINES, all in one
      * program: NN01SUB is RECURSIVE, decrementing LK-DEPTH (BY REFERENCE)
      * on each self-CALL, WRITEs a LINAGE-governed record on every
      * activation (checking AT END-OF-PAGE/NOT AT END-OF-PAGE), and reads
      * its own recursion depth back out through a group REDEFINES view
      * (WS-DATE-NUM REDEFINES WS-DATE-GROUP) on every activation - none of
      * these three features individually is new, but no prior round
      * combined all three in one program.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN01MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH PIC 9(2) VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "NN01SUB" USING BY REFERENCE WS-START-DEPTH.
           DISPLAY "MAIN AFTER DEPTH=" WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN01SUB IS RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "NN01OUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE LINAGE IS 3 LINES.
       01  PRINT-REC PIC X(20).
       WORKING-STORAGE SECTION.
       01  WS-DATE-GROUP.
           05  WS-YY PIC 99.
           05  WS-MM PIC 99.
       01  WS-DATE-NUM REDEFINES WS-DATE-GROUP PIC 9(4).
       LINKAGE SECTION.
       01  LK-DEPTH PIC 9(2).
       PROCEDURE DIVISION USING LK-DEPTH.
       SUB-MAIN.
           IF LK-DEPTH = 5
               OPEN OUTPUT PRINT-FILE
           END-IF
           MOVE 20 TO WS-YY
           MOVE LK-DEPTH TO WS-MM
           MOVE WS-DATE-NUM TO PRINT-REC
           WRITE PRINT-REC
               AT END-OF-PAGE
                   DISPLAY "EOP DEPTH=" LK-DEPTH " DATE=" WS-DATE-NUM
               NOT AT END-OF-PAGE
                   DISPLAY "NOTEOP DEPTH=" LK-DEPTH " DATE=" WS-DATE-NUM
           END-WRITE
           IF LK-DEPTH > 0
               SUBTRACT 1 FROM LK-DEPTH
               CALL "NN01SUB" USING BY REFERENCE LK-DEPTH
           ELSE
               CLOSE PRINT-FILE
           END-IF.
       END PROGRAM NN01SUB.

       END PROGRAM NN01MAIN.
