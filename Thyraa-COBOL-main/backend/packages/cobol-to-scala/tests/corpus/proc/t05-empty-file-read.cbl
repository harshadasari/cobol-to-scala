       IDENTIFICATION DIVISION.
       PROGRAM-ID. T05EMPTYFILE.
      * Round-6 attack: reading a file that was OPENed OUTPUT and
      * CLOSEd again with zero WRITE statements (a genuinely empty
      * file on disk), then OPENed INPUT and READ - the very first
      * READ must hit AT END immediately. No prior corpus program
      * exercises the zero-record case.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT EMPTY-FILE ASSIGN TO "t05empty.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  EMPTY-FILE.
       01  EMPTY-REC           PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-EOF-FLAG         PIC X(1) VALUE 'N'.
       01  WS-READ-COUNT       PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT EMPTY-FILE.
           CLOSE EMPTY-FILE.

           OPEN INPUT EMPTY-FILE.
           READ EMPTY-FILE
               AT END
                   DISPLAY "FIRST-READ-AT-END"
               NOT AT END
                   ADD 1 TO WS-READ-COUNT
                   DISPLAY "UNEXPECTED-RECORD"
           END-READ.
           CLOSE EMPTY-FILE.
           DISPLAY "READ-COUNT=" WS-READ-COUNT.
           STOP RUN.
