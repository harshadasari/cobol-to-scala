      * Round-12 probe z05: "everything at once" integration test.
      * SECTION-structured batch job: DECLARATIVES error handler (triggered
      * for real via a deliberate first-open-before-create), a self-seeded
      * input file read loop, a SORT with INPUT/OUTPUT PROCEDURE sections,
      * a multi-key (composite) SEARCH ALL lookup, an edited-numeric report
      * write, a CALL to a contained subprogram with a GROUP parameter
      * (which itself uses GOBACK), and a final read-back of the report file.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z05BATCH.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "Z05IN.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-IN-STATUS.
           SELECT SORT-FILE ASSIGN TO "Z05SORTWK".
           SELECT RPT-FILE ASSIGN TO "Z05OUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-RPT-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE.
       01  IN-REC.
           05  IN-CODE   PIC 9(2).
           05  IN-SUB    PIC 9(2).
           05  IN-NAME   PIC X(6).
           05  IN-AMT    PIC 9(4)V99.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-CODE PIC 9(2).
           05  SORT-SUB  PIC 9(2).
           05  SORT-NAME PIC X(6).
           05  SORT-AMT  PIC 9(4)V99.
       FD  RPT-FILE.
       01  RPT-REC.
           05  RPT-CODE   PIC 9(2).
           05  RPT-FILL1  PIC X VALUE SPACE.
           05  RPT-NAME   PIC X(6).
           05  RPT-FILL2  PIC X VALUE SPACE.
           05  RPT-DESC   PIC X(8).
           05  RPT-FILL3  PIC X VALUE SPACE.
           05  RPT-RESULT PIC ZZZ9.99.
       WORKING-STORAGE SECTION.
       01  WS-IN-STATUS       PIC XX.
       01  WS-RPT-STATUS      PIC XX.
       01  WS-EOF             PIC X VALUE "N".
       01  WS-EOF2            PIC X VALUE "N".
       01  WS-EOF3            PIC X VALUE "N".
       01  WS-LOOKUP.
           05  WS-LK-ENTRY OCCURS 4 TIMES
               ASCENDING KEY IS WS-LK-CODE WS-LK-SUB
               INDEXED BY WS-LK-IDX.
               10  WS-LK-CODE PIC 9(2).
               10  WS-LK-SUB  PIC 9(2).
               10  WS-LK-DESC PIC X(8).
       01  WS-FOUND-DESC      PIC X(8).
       01  WS-TOTAL           PIC 9(6)V99 VALUE 0.
       01  WS-TOTAL-ED        PIC ZZZZZ9.99.
       01  WS-PARM-GROUP.
           05  WS-PARM-AMT    PIC 9(4)V99.
           05  WS-PARM-RESULT PIC 9(4)V99.
       PROCEDURE DIVISION.
       DECLARATIVES.
       IN-FILE-ERROR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON IN-FILE.
       IN-ERR-PARA.
           DISPLAY "IN-FILE ERROR HANDLER FIRED STATUS=" WS-IN-STATUS.
       END DECLARATIVES.
       CTL-SECTION SECTION.
       MAIN-PARA.
           PERFORM INIT-PARA.
           PERFORM CREATE-INPUT-PARA.
           OPEN OUTPUT RPT-FILE.
      * FD/FILE SECTION VALUE clauses are not applied at runtime by this
      * compiler (confirmed via a standalone probe) - explicitly space-fill
      * the separator fillers once, since they are never MOVEd to otherwise.
           MOVE SPACE TO RPT-FILL1.
           MOVE SPACE TO RPT-FILL2.
           MOVE SPACE TO RPT-FILL3.
           SORT SORT-FILE
               ON ASCENDING KEY SORT-CODE SORT-SUB
               INPUT PROCEDURE IS READ-INPUT-SECTION
               OUTPUT PROCEDURE IS WRITE-REPORT-SECTION.
           CLOSE RPT-FILE.
           PERFORM TERM-PARA.
           STOP RUN.

       INIT-SECTION SECTION.
       INIT-PARA.
           MOVE 10 TO WS-LK-CODE(1). MOVE 1 TO WS-LK-SUB(1).
           MOVE "ALPHA   " TO WS-LK-DESC(1).
           MOVE 10 TO WS-LK-CODE(2). MOVE 2 TO WS-LK-SUB(2).
           MOVE "BETA    " TO WS-LK-DESC(2).
           MOVE 20 TO WS-LK-CODE(3). MOVE 1 TO WS-LK-SUB(3).
           MOVE "GAMMA   " TO WS-LK-DESC(3).
           MOVE 30 TO WS-LK-CODE(4). MOVE 1 TO WS-LK-SUB(4).
           MOVE "DELTA   " TO WS-LK-DESC(4).
           MOVE 0 TO WS-TOTAL.

       CREATE-INPUT-SECTION SECTION.
       CREATE-INPUT-PARA.
           OPEN INPUT IN-FILE.
           DISPLAY "FIRST-OPEN STATUS=" WS-IN-STATUS.
           IF WS-IN-STATUS NOT = "00"
               OPEN OUTPUT IN-FILE
               MOVE 10 TO IN-CODE
               MOVE 1 TO IN-SUB
               MOVE "ALPHA " TO IN-NAME
               MOVE 100.00 TO IN-AMT
               WRITE IN-REC
               MOVE 10 TO IN-CODE
               MOVE 2 TO IN-SUB
               MOVE "BETA  " TO IN-NAME
               MOVE 75.50 TO IN-AMT
               WRITE IN-REC
               MOVE 20 TO IN-CODE
               MOVE 1 TO IN-SUB
               MOVE "GAMMA " TO IN-NAME
               MOVE 300.00 TO IN-AMT
               WRITE IN-REC
               MOVE 30 TO IN-CODE
               MOVE 1 TO IN-SUB
               MOVE "DELTA " TO IN-NAME
               MOVE 50.00 TO IN-AMT
               WRITE IN-REC
               MOVE 40 TO IN-CODE
               MOVE 1 TO IN-SUB
               MOVE "ZETA  " TO IN-NAME
               MOVE 25.00 TO IN-AMT
               WRITE IN-REC
               MOVE 5 TO IN-CODE
               MOVE 9 TO IN-SUB
               MOVE "ETA   " TO IN-NAME
               MOVE 10.00 TO IN-AMT
               WRITE IN-REC
               CLOSE IN-FILE
           ELSE
               CLOSE IN-FILE
           END-IF.

       READ-INPUT-SECTION SECTION.
       READ-INPUT-PARA.
           OPEN INPUT IN-FILE.
           PERFORM UNTIL WS-EOF = "Y"
               READ IN-FILE
                   AT END
                       MOVE "Y" TO WS-EOF
                   NOT AT END
                       MOVE IN-CODE TO SORT-CODE
                       MOVE IN-SUB  TO SORT-SUB
                       MOVE IN-NAME TO SORT-NAME
                       MOVE IN-AMT  TO SORT-AMT
                       RELEASE SORT-REC
               END-READ
           END-PERFORM.
           CLOSE IN-FILE.

       WRITE-REPORT-SECTION SECTION.
       WRITE-REPORT-PARA.
           PERFORM UNTIL WS-EOF2 = "Y"
               RETURN SORT-FILE
                   AT END
                       MOVE "Y" TO WS-EOF2
                   NOT AT END
                       PERFORM LOOKUP-PARA
                       MOVE SORT-AMT TO WS-PARM-AMT
                       CALL "ZCALC" USING WS-PARM-GROUP
                       ADD WS-PARM-RESULT TO WS-TOTAL
                       MOVE SORT-CODE TO RPT-CODE
                       MOVE SORT-NAME TO RPT-NAME
                       MOVE WS-FOUND-DESC TO RPT-DESC
                       MOVE WS-PARM-RESULT TO RPT-RESULT
                       WRITE RPT-REC
               END-RETURN
           END-PERFORM.

       LOOKUP-PARA.
           MOVE "NOTFOUND" TO WS-FOUND-DESC.
           SEARCH ALL WS-LK-ENTRY
               AT END
                   MOVE "NOTFOUND" TO WS-FOUND-DESC
               WHEN WS-LK-CODE(WS-LK-IDX) = SORT-CODE
                    AND WS-LK-SUB(WS-LK-IDX) = SORT-SUB
                   MOVE WS-LK-DESC(WS-LK-IDX) TO WS-FOUND-DESC
           END-SEARCH.

       TERM-SECTION SECTION.
       TERM-PARA.
           OPEN INPUT RPT-FILE.
           DISPLAY "RPT-OPEN-INPUT-STATUS=" WS-RPT-STATUS.
           PERFORM UNTIL WS-EOF3 = "Y"
               READ RPT-FILE
                   AT END
                       MOVE "Y" TO WS-EOF3
                   NOT AT END
                       DISPLAY "RPT:" RPT-CODE " " RPT-NAME " "
                           RPT-DESC " " RPT-RESULT
               END-READ
           END-PERFORM.
           CLOSE RPT-FILE.
           MOVE WS-TOTAL TO WS-TOTAL-ED.
           DISPLAY "TOTAL=" WS-TOTAL-ED.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. ZCALC.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-RATE  PIC 9V99 VALUE 1.05.
       LINKAGE SECTION.
       01  LK-PARM.
           05  LK-AMT     PIC 9(4)V99.
           05  LK-RESULT  PIC 9(4)V99.
       PROCEDURE DIVISION USING LK-PARM.
       CALC-PARA.
           COMPUTE LK-RESULT = LK-AMT * WS-RATE.
           GOBACK.
       END PROGRAM ZCALC.
       END PROGRAM Z05BATCH.
