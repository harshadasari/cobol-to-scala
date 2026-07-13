       IDENTIFICATION DIVISION.
       PROGRAM-ID. H03FDONLY.
      *
      * Adversarial (round 19): DATA DIVISION with only an FD (FILE
      * SECTION) and NO WORKING-STORAGE SECTION at all - the FD's own
      * 01-level record is the ONLY data item in the entire program,
      * used both as the WRITE source and the READ target. Basic-but-
      * possibly-never-tried structural shape: does field-registry
      * construction assume WORKING-STORAGE exists, or degrade for a
      * FILE-SECTION-only record?
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "H03OUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC PIC X(20).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           MOVE "HELLO-FD-ONLY" TO OUT-REC.
           WRITE OUT-REC.
           CLOSE OUT-FILE.
           OPEN INPUT OUT-FILE.
           READ OUT-FILE
               AT END
                   DISPLAY "UNEXPECTED-EOF"
           END-READ.
           DISPLAY "READ-BACK=" OUT-REC.
           CLOSE OUT-FILE.
           STOP RUN.
       END PROGRAM H03FDONLY.
