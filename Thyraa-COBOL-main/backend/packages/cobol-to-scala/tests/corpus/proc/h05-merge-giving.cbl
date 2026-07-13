       IDENTIFICATION DIVISION.
       PROGRAM-ID. H05MRGGIV.
      *
      * Adversarial (round 19): MERGE ... GIVING <file> (whole-file
      * form, no OUTPUT PROCEDURE at all) - round-18 finding 2 (g12)
      * only implemented MERGE's OUTPUT-PROCEDURE form; GIVING is
      * documented as a known TODO (mirroring the pre-existing
      * SORT ... USING/GIVING gap, round-6 t09). This probe verifies
      * the GIVING form degrades HONESTLY (a visible, compiling marker)
      * rather than silently producing wrong output now that MERGE
      * itself has real generator support.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "H05IN1.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-2 ASSIGN TO "H05IN2.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT OUT-FILE ASSIGN TO "H05OUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT MERGE-FILE ASSIGN TO "SORTWKM".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1            PIC X(6).
       FD  IN-FILE-2.
       01  IN-REC-2            PIC X(6).
       FD  OUT-FILE.
       01  OUT-REC             PIC X(6).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05  M-KEY           PIC 9(3).
           05  M-TAG           PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-EOF              PIC X VALUE 'N'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT IN-FILE-1.
           WRITE IN-REC-1 FROM "010AAA".
           WRITE IN-REC-1 FROM "030CCC".
           CLOSE IN-FILE-1.

           OPEN OUTPUT IN-FILE-2.
           WRITE IN-REC-2 FROM "020BBB".
           WRITE IN-REC-2 FROM "040DDD".
           CLOSE IN-FILE-2.

           MERGE MERGE-FILE
               ASCENDING KEY M-KEY
               USING IN-FILE-1 IN-FILE-2
               GIVING OUT-FILE.

           OPEN INPUT OUT-FILE.
           MOVE 'N' TO WS-EOF
           PERFORM UNTIL WS-EOF = 'Y'
               READ OUT-FILE
                   AT END
                       MOVE 'Y' TO WS-EOF
                   NOT AT END
                       DISPLAY 'MERGED=' OUT-REC
               END-READ
           END-PERFORM.
           CLOSE OUT-FILE.
           STOP RUN.
       END PROGRAM H05MRGGIV.
