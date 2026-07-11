       IDENTIFICATION DIVISION.
       PROGRAM-ID. U05FS88.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IO-FILE ASSIGN TO "u05io.dat"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD IO-FILE.
       01 IO-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-STATUS    PIC XX.
          88 WS-OK        VALUE "00".
          88 WS-EOF       VALUE "10".
       01 WS-COUNT PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT IO-FILE.
           MOVE "ALPHA" TO IO-REC.
           WRITE IO-REC.
           MOVE "BRAVO" TO IO-REC.
           WRITE IO-REC.
           MOVE "CHARLIE" TO IO-REC.
           WRITE IO-REC.
           CLOSE IO-FILE.

           OPEN INPUT IO-FILE.
           PERFORM UNTIL WS-EOF
               READ IO-FILE
                   AT END SET WS-EOF TO TRUE
                   NOT AT END
                       ADD 1 TO WS-COUNT
                       DISPLAY "REC=" IO-REC
               END-READ
           END-PERFORM.
           CLOSE IO-FILE.
           DISPLAY "COUNT=" WS-COUNT.
           STOP RUN.
