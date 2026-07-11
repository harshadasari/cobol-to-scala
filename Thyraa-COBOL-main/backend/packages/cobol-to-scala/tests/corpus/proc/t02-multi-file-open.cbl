       IDENTIFICATION DIVISION.
       PROGRAM-ID. T02MULTIFILE.
      * Round-6 attack: three files open simultaneously (two input,
      * one output) - no prior corpus program has more than one SELECT
      * clause at all. Reads two input files in lockstep, writes a
      * merged record to a third, then re-reads the merged file to
      * verify. Probes whether generated Scala's per-file handle
      * registry (readers/writers/iterators) correctly keeps three
      * independent file states alive at once instead of colliding on
      * a single shared variable name.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-A ASSIGN TO "t02a.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-B ASSIGN TO "t02b.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT OUT-FILE  ASSIGN TO "t02out.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-A.
       01  REC-A               PIC X(5).
       FD  IN-FILE-B.
       01  REC-B               PIC X(5).
       FD  OUT-FILE.
       01  REC-OUT             PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-EOF-A            PIC X VALUE 'N'.
       01  WS-COUNT            PIC 9(2) VALUE 0.
       01  WS-MERGED           PIC X(10).
       01  WS-EOF-OUT          PIC X VALUE 'N'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT IN-FILE-A.
           MOVE "AAAAA" TO REC-A.
           WRITE REC-A.
           MOVE "BBBBB" TO REC-A.
           WRITE REC-A.
           CLOSE IN-FILE-A.

           OPEN OUTPUT IN-FILE-B.
           MOVE "11111" TO REC-B.
           WRITE REC-B.
           MOVE "22222" TO REC-B.
           WRITE REC-B.
           CLOSE IN-FILE-B.

           OPEN INPUT IN-FILE-A.
           OPEN INPUT IN-FILE-B.
           OPEN OUTPUT OUT-FILE.
           PERFORM UNTIL WS-EOF-A = 'Y'
               READ IN-FILE-A
                   AT END
                       MOVE 'Y' TO WS-EOF-A
                   NOT AT END
                       READ IN-FILE-B
                           AT END
                               DISPLAY "UNEXPECTED-B-EOF"
                       END-READ
                       STRING REC-A DELIMITED BY SIZE
                              REC-B DELIMITED BY SIZE
                              INTO REC-OUT
                       WRITE REC-OUT
                       ADD 1 TO WS-COUNT
               END-READ
           END-PERFORM.
           CLOSE IN-FILE-A.
           CLOSE IN-FILE-B.
           CLOSE OUT-FILE.
           DISPLAY "MERGED-COUNT=" WS-COUNT.

           OPEN INPUT OUT-FILE.
           PERFORM UNTIL WS-EOF-OUT = 'Y'
               READ OUT-FILE INTO WS-MERGED
                   AT END
                       MOVE 'Y' TO WS-EOF-OUT
                   NOT AT END
                       DISPLAY "OUT=[" WS-MERGED "]"
               END-READ
           END-PERFORM.
           CLOSE OUT-FILE.
           STOP RUN.
