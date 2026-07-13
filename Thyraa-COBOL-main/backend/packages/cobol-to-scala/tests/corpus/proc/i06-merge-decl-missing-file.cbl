       IDENTIFICATION DIVISION.
       PROGRAM-ID. I06MERGEMISS.
      *
      * Adversarial (round 20): MERGE ... USING combined with a
      * DECLARATIVES-guarded error handler ON one of the USING files,
      * where that USING file DOES NOT EXIST on disk at all (an OPEN
      * failure, not just an empty file). Round-18/19 (g12/h09) both
      * verified MERGE against USING files that open successfully;
      * this checks whether a MERGE-internal USING-file open failure
      * either (a) invokes the registered DECLARATIVES handler the way
      * an explicit OPEN statement's failure does elsewhere in this
      * engine, or (b) crashes, neither of which matches real cobc's
      * own behavior here (confirmed against installed GnuCOBOL: the
      * DECLARATIVES handler is NOT invoked for a MERGE's own internal
      * file access at all - MERGE silently treats the missing file as
      * contributing zero records and merges the remaining USING
      * file(s) normally, with no error, no crash, no handler call).
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "I06IN1"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-2 ASSIGN TO "I06NOSUCHFILE"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT MERGE-FILE ASSIGN TO "I06SORTWK".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1 PIC X(6).
       FD  IN-FILE-2.
       01  IN-REC-2 PIC X(6).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05 M-KEY PIC 9(3).
           05 M-TAG PIC X(3).
       PROCEDURE DIVISION.
       DECLARATIVES.
       FILE2-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON IN-FILE-2.
       FILE2-ERR-PARA.
           DISPLAY "HANDLER: IN-FILE-2 ERROR".
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY "MAIN-START".
           OPEN OUTPUT IN-FILE-1.
           WRITE IN-REC-1 FROM "010AAA".
           WRITE IN-REC-1 FROM "020BBB".
           CLOSE IN-FILE-1.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1 IN-FILE-2
               OUTPUT PROCEDURE IS EMIT-PARA.
           DISPLAY "MAIN-END".
           STOP RUN.
       EMIT-PARA.
           RETURN MERGE-FILE AT END GO TO EMIT-DONE.
           DISPLAY "MERGED=" M-KEY " " M-TAG.
           GO TO EMIT-PARA.
       EMIT-DONE.
           EXIT.
