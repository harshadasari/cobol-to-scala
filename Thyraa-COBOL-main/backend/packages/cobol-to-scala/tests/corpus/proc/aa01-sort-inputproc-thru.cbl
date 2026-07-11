       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1308.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT WORK-FILE ASSIGN TO "SORTWK1".
       DATA DIVISION.
       FILE SECTION.
       SD  WORK-FILE.
       01  WORK-REC.
           05  WR-KEY   PIC 9(2).
           05  WR-SEQ   PIC 9(2).
       WORKING-STORAGE SECTION.
       01  WS-I         PIC 9(2) VALUE 0.
       01  WS-EOF-FLAG  PIC X(1) VALUE "N".
           88  SORT-EOF          VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SORT WORK-FILE ASCENDING KEY WR-KEY
               WITH DUPLICATES IN ORDER
               INPUT PROCEDURE IS 1000-FILL THRU 1000-FILL-EXIT
               OUTPUT PROCEDURE IS 2000-PRINT.
           STOP RUN.

       1000-FILL.
           PERFORM 3000-A THRU 3000-C.
       1000-FILL-EXIT.
           EXIT.

       2000-PRINT.
           PERFORM UNTIL SORT-EOF
               RETURN WORK-FILE
                   AT END
                       SET SORT-EOF TO TRUE
                   NOT AT END
                       DISPLAY "KEY=" WR-KEY " SEQ=" WR-SEQ
               END-RETURN
           END-PERFORM.

       3000-A.
           MOVE 20 TO WR-KEY.
           MOVE 1 TO WR-SEQ.
           RELEASE WORK-REC.
           MOVE 10 TO WR-KEY.
           MOVE 1 TO WR-SEQ.
           RELEASE WORK-REC.
       3000-B.
           MOVE 20 TO WR-KEY.
           MOVE 2 TO WR-SEQ.
           RELEASE WORK-REC.
           MOVE 10 TO WR-KEY.
           MOVE 2 TO WR-SEQ.
           RELEASE WORK-REC.
       3000-C.
           MOVE 20 TO WR-KEY.
           MOVE 3 TO WR-SEQ.
           RELEASE WORK-REC.
