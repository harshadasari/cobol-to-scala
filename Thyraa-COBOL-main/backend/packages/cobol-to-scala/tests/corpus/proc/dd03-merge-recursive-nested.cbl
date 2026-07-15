      * dd03: MERGE's own OUTPUT PROCEDURE (not SORT's - round-27
      * finding 5/cc10 only exercised SORT specifically) inside a
      * RECURSIVE program's own nested-paragraph convention, called at
      * three different recursion depths. collectSortMergeThruEndpoints
      * (generator/method-gen.js) already scans for BOTH SortStatement
      * and MergeStatement nodes, so this is expected to already be
      * fixed by round-27's own repair - this program exists to
      * PROACTIVELY confirm that, and to check that MERGE's two USING
      * input files (ordinary FDs, not release/return SD-only state)
      * don't introduce a DIFFERENT collision of their own when reused
      * across multiple recursive activations of the same program.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD03MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "DD03SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD03SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT MERGE-FILE ASSIGN TO "DD03MERGEWORK".
           SELECT IN-FILE-1 ASSIGN TO "DD03IN1"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-2 ASSIGN TO "DD03IN2"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       SD  MERGE-FILE.
       01  MERGE-REC.
           05  M-KEY  PIC 9(3).
           05  M-VAL  PIC X(5).
       FD  IN-FILE-1.
       01  IN-REC-1.
           05  I1-KEY PIC 9(3).
           05  I1-VAL PIC X(5).
       FD  IN-FILE-2.
       01  IN-REC-2.
           05  I2-KEY PIC 9(3).
           05  I2-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-EOF          PIC X.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           IF LS-DEPTH = 0
               OPEN OUTPUT IN-FILE-1
               WRITE IN-REC-1 FROM "010AAAAA"
               WRITE IN-REC-1 FROM "030CCCCC"
               CLOSE IN-FILE-1
               OPEN OUTPUT IN-FILE-2
               WRITE IN-REC-2 FROM "020BBBBB"
               WRITE IN-REC-2 FROM "040DDDDD"
               CLOSE IN-FILE-2
           END-IF.
           MOVE "N" TO WS-EOF.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1 IN-FILE-2
               OUTPUT PROCEDURE IS EMIT-PARA.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "DD03SUB" USING WS-NEXT-DEPTH
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       EMIT-PARA.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN MERGE-FILE AT END MOVE "Y" TO WS-EOF
               NOT AT END
                   DISPLAY "MERGED DEPTH=" LS-DEPTH " " M-KEY " " M-VAL
           END-PERFORM.
       END PROGRAM DD03SUB.
       END PROGRAM DD03MAIN.
