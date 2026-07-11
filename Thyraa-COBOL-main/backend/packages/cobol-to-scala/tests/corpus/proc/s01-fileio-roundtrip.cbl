       IDENTIFICATION DIVISION.
       PROGRAM-ID. S01FILEIO.
      * Round-5 attack: WRITE/READ sequential file round-trip - no
      * prior round has exercised FILE-CONTROL/OPEN/WRITE/READ/CLOSE
      * at all. FD record-name (OUT-REC) deliberately differs from
      * the file-name (OUT-FILE), the overwhelmingly common COBOL
      * convention, to probe whether generated Scala's writer/reader
      * variable naming is keyed off the FILE name (as OPEN assigns
      * it) or the record name.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "s01round5.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(20).
       WORKING-STORAGE SECTION.
       01  WS-LINE             PIC X(20).
       01  WS-EOF-FLAG         PIC X(1) VALUE 'N'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           MOVE "FIRST LINE HERE" TO OUT-REC.
           WRITE OUT-REC.
           MOVE "SECOND LINE HERE" TO OUT-REC.
           WRITE OUT-REC.
           CLOSE OUT-FILE.

           OPEN INPUT OUT-FILE.
           PERFORM UNTIL WS-EOF-FLAG = 'Y'
               READ OUT-FILE INTO WS-LINE
                   AT END
                       MOVE 'Y' TO WS-EOF-FLAG
                   NOT AT END
                       DISPLAY "READ: " WS-LINE
               END-READ
           END-PERFORM.
           CLOSE OUT-FILE.
           DISPLAY "DONE".
           STOP RUN.
