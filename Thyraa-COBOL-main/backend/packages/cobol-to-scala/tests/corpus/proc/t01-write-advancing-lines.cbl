       IDENTIFICATION DIVISION.
       PROGRAM-ID. T01ADVLINES.
      * Round-6 attack: WRITE ... AFTER ADVANCING n LINES to a
      * sequential file - no prior corpus program exercises ADVANCING
      * on a file WRITE at all (only DISPLAY's WITH NO ADVANCING was
      * tested). ADVANCING n LINES should insert (n-1) blank lines
      * before the record, each one becoming its own physical record
      * when the file is re-read (LINE SEQUENTIAL has no other notion
      * of a "blank line" than an empty text line).
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "t01adv.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-LINE             PIC X(10).
       01  WS-EOF-FLAG         PIC X(1) VALUE 'N'.
       01  WS-LINE-NUM         PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           MOVE "LINE-ONE" TO OUT-REC.
           WRITE OUT-REC AFTER ADVANCING 1 LINE.
           MOVE "LINE-TWO" TO OUT-REC.
           WRITE OUT-REC AFTER ADVANCING 3 LINES.
           CLOSE OUT-FILE.

           OPEN INPUT OUT-FILE.
           PERFORM UNTIL WS-EOF-FLAG = 'Y'
               READ OUT-FILE INTO WS-LINE
                   AT END
                       MOVE 'Y' TO WS-EOF-FLAG
                   NOT AT END
                       ADD 1 TO WS-LINE-NUM
                       DISPLAY "REC" WS-LINE-NUM ": [" WS-LINE "]"
               END-READ
           END-PERFORM.
           CLOSE OUT-FILE.
           DISPLAY "TOTAL-RECS=" WS-LINE-NUM.
           STOP RUN.
