      * ll04 (round 36): fresh-territory probe - EVALUATE with multiple WHEN
      * clauses sharing ONE body (WHEN A WHEN B <body>) inside a paragraph
      * belonging to a RECURSIVE program, called at several different
      * recursion depths so different WHEN branches (and the shared-body
      * branch) all fire across the SAME call chain.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL04MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DEPTH PIC 9(1) VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "LL04SUB" USING BY CONTENT WS-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL04SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TAG PIC X(10).
       LINKAGE SECTION.
       01  LK-DEPTH PIC 9(1).
       PROCEDURE DIVISION USING LK-DEPTH.
       SUB-MAIN.
           PERFORM CLASSIFY-DEPTH.
           DISPLAY "DEPTH=" LK-DEPTH " TAG=" WS-TAG.
           IF LK-DEPTH > 1
               SUBTRACT 1 FROM LK-DEPTH
               CALL "LL04SUB" USING BY CONTENT LK-DEPTH
           END-IF.

       CLASSIFY-DEPTH.
           EVALUATE LK-DEPTH
               WHEN 5
               WHEN 4
                   MOVE "HIGH" TO WS-TAG
               WHEN 3
                   MOVE "MID" TO WS-TAG
               WHEN 2
               WHEN 1
                   MOVE "LOW" TO WS-TAG
               WHEN OTHER
                   MOVE "UNKNOWN" TO WS-TAG
           END-EVALUATE.
       END PROGRAM LL04SUB.

       END PROGRAM LL04MAIN.
