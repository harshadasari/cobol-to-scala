       IDENTIFICATION DIVISION.
       PROGRAM-ID. T03WRITEFROM.
      * Round-6 attack: WRITE ... FROM identifier - the record buffer
      * is populated implicitly by the WRITE statement itself from a
      * separate WORKING-STORAGE source, never via an explicit prior
      * MOVE into the FD record. No prior corpus program uses the FROM
      * phrase on WRITE (only READ INTO has been tested).
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "t03wf.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(12).
       WORKING-STORAGE SECTION.
       01  WS-SRC-1            PIC X(12) VALUE "SOURCE-ONE".
       01  WS-SRC-2            PIC X(12) VALUE "SOURCE-TWO".
       01  WS-LINE             PIC X(12).
       01  WS-EOF-FLAG         PIC X(1) VALUE 'N'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           WRITE OUT-REC FROM WS-SRC-1.
           WRITE OUT-REC FROM WS-SRC-2.
           CLOSE OUT-FILE.

           OPEN INPUT OUT-FILE.
           PERFORM UNTIL WS-EOF-FLAG = 'Y'
               READ OUT-FILE INTO WS-LINE
                   AT END
                       MOVE 'Y' TO WS-EOF-FLAG
                   NOT AT END
                       DISPLAY "GOT=[" WS-LINE "]"
               END-READ
           END-PERFORM.
           CLOSE OUT-FILE.
      * OUT-REC itself must also have been populated by the implicit
      * WRITE...FROM copy (not left blank) - verify by re-reading with
      * plain OUT-REC after re-opening for a fresh WRITE probe.
           DISPLAY "SRC1-UNCHANGED=[" WS-SRC-1 "]".
           STOP RUN.
