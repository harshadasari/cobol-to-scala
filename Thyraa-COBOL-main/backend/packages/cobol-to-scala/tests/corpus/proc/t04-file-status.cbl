       IDENTIFICATION DIVISION.
       PROGRAM-ID. T04FILESTAT.
      * Round-6 attack: SELECT ... FILE STATUS IS WS-STATUS, checked
      * after OPEN/WRITE/READ/CLOSE. No prior corpus program declares
      * or checks a FILE STATUS field at all. "00" expected after each
      * successful op, "10" expected on the AT-END READ past the last
      * record.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "t04fs.dat"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-FILE-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(8).
       WORKING-STORAGE SECTION.
       01  WS-FILE-STATUS      PIC X(2).
       01  WS-LINE             PIC X(8).
       01  WS-EOF-FLAG         PIC X(1) VALUE 'N'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           DISPLAY "OPEN-OUT-STATUS=" WS-FILE-STATUS.
           MOVE "REC-0001" TO OUT-REC.
           WRITE OUT-REC.
           DISPLAY "WRITE-1-STATUS=" WS-FILE-STATUS.
           MOVE "REC-0002" TO OUT-REC.
           WRITE OUT-REC.
           DISPLAY "WRITE-2-STATUS=" WS-FILE-STATUS.
           CLOSE OUT-FILE.
           DISPLAY "CLOSE-STATUS=" WS-FILE-STATUS.

           OPEN INPUT OUT-FILE.
           DISPLAY "OPEN-IN-STATUS=" WS-FILE-STATUS.
           PERFORM UNTIL WS-EOF-FLAG = 'Y'
               READ OUT-FILE INTO WS-LINE
               DISPLAY "READ-STATUS=" WS-FILE-STATUS
               IF WS-FILE-STATUS = "10"
                   MOVE 'Y' TO WS-EOF-FLAG
               ELSE
                   DISPLAY "LINE=[" WS-LINE "]"
               END-IF
           END-PERFORM.
           CLOSE OUT-FILE.
           STOP RUN.
