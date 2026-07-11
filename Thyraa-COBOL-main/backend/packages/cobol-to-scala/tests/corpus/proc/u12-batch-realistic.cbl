       IDENTIFICATION DIVISION.
       PROGRAM-ID. U12BATCH.
      * Realistic-shape batch program: writes its own input, then reads it
      * back line by line, accumulates per-region totals into a table, and
      * prints an edited summary report. Combines file I/O, table
      * accumulation, edited PICTUREs, SECTION structure and an 88-level
      * status check - the "everything at once" integration shape.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SALES-FILE ASSIGN TO "u12sales.dat"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-FS.
       DATA DIVISION.
       FILE SECTION.
       FD  SALES-FILE.
       01  SALES-REC.
           05 SR-REGION   PIC 9(1).
           05 SR-AMOUNT   PIC 9(5)V99.
       WORKING-STORAGE SECTION.
       01  WS-FS              PIC XX.
           88  WS-FS-OK       VALUE "00".
           88  WS-FS-EOF      VALUE "10".
       01  WS-TABLE.
           05  WS-REGION-TOTAL OCCURS 3 TIMES PIC 9(7)V99 VALUE 0.
       01  WS-IDX              PIC 9(1).
       01  WS-REPORT-LINE      PIC ZZZZ9.99.
       01  WS-GRAND-TOTAL      PIC 9(8)V99 VALUE 0.
       01  WS-REC-COUNT        PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
           PERFORM 1000-BUILD-INPUT.
           PERFORM 2000-PROCESS-FILE.
           PERFORM 3000-PRINT-REPORT.
           STOP RUN.

       1000-BUILD-INPUT SECTION.
           OPEN OUTPUT SALES-FILE.
           MOVE 1 TO SR-REGION.
           MOVE 100.50 TO SR-AMOUNT.
           WRITE SALES-REC.
           MOVE 2 TO SR-REGION.
           MOVE 250.25 TO SR-AMOUNT.
           WRITE SALES-REC.
           MOVE 1 TO SR-REGION.
           MOVE 75.00 TO SR-AMOUNT.
           WRITE SALES-REC.
           MOVE 3 TO SR-REGION.
           MOVE 400.00 TO SR-AMOUNT.
           WRITE SALES-REC.
           CLOSE SALES-FILE.

       2000-PROCESS-FILE SECTION.
           OPEN INPUT SALES-FILE.
           PERFORM UNTIL WS-FS-EOF
               READ SALES-FILE
                   AT END SET WS-FS-EOF TO TRUE
                   NOT AT END PERFORM 2100-ACCUMULATE
               END-READ
           END-PERFORM.
           CLOSE SALES-FILE.

       2100-ACCUMULATE.
           MOVE SR-REGION TO WS-IDX.
           ADD SR-AMOUNT TO WS-REGION-TOTAL(WS-IDX).
           ADD SR-AMOUNT TO WS-GRAND-TOTAL.
           ADD 1 TO WS-REC-COUNT.

       3000-PRINT-REPORT SECTION.
           PERFORM VARYING WS-IDX FROM 1 BY 1 UNTIL WS-IDX > 3
               MOVE WS-REGION-TOTAL(WS-IDX) TO WS-REPORT-LINE
               DISPLAY "REGION " WS-IDX " TOTAL=" WS-REPORT-LINE
           END-PERFORM.
           MOVE WS-GRAND-TOTAL TO WS-REPORT-LINE.
           DISPLAY "GRAND TOTAL=" WS-REPORT-LINE.
           DISPLAY "RECORDS=" WS-REC-COUNT.
