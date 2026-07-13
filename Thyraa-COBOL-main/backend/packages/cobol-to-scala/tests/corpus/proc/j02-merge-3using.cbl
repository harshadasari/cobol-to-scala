      * Adversarial (round 21): MERGE ... USING with THREE input files
      * (round-18 g12/round-19 h05/round-20 i06 only ever tested
      * exactly TWO USING files) - checks the OUTPUT-PROCEDURE MERGE
      * codegen's per-USING-file open/drain loop generalizes past the
      * two-file case it was originally built and fixed against,
      * rather than having an off-by-one or hardcoded-pair assumption
      * buried in it somewhere.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J02MERGE3.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT MERGE-FILE ASSIGN TO "J02MERGEWORK".
           SELECT IN-FILE-1 ASSIGN TO "J02IN1"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-2 ASSIGN TO "J02IN2"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-3 ASSIGN TO "J02IN3"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT OUT-FILE ASSIGN TO "J02OUT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       SD  MERGE-FILE.
       01  MERGE-REC.
           05  M-KEY  PIC 9(3).
           05  M-VAL  PIC X(5).
       FD  IN-FILE-1.
       01  IN-REC-1.
           05  I1-KEY PIC 9(3).
           05  I1-VAL PIC X(5).
       FD  IN-FILE-2.
       01  IN-REC-2.
           05  I2-KEY PIC 9(3).
           05  I2-VAL PIC X(5).
       FD  IN-FILE-3.
       01  IN-REC-3.
           05  I3-KEY PIC 9(3).
           05  I3-VAL PIC X(5).
       FD  OUT-FILE.
       01  OUT-REC.
           05  O-KEY PIC 9(3).
           05  O-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-EOF PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT IN-FILE-1.
           WRITE IN-REC-1 FROM "010AAAAA".
           WRITE IN-REC-1 FROM "040DDDDD".
           CLOSE IN-FILE-1.
           OPEN OUTPUT IN-FILE-2.
           WRITE IN-REC-2 FROM "020BBBBB".
           WRITE IN-REC-2 FROM "050EEEEE".
           CLOSE IN-FILE-2.
           OPEN OUTPUT IN-FILE-3.
           WRITE IN-REC-3 FROM "030CCCCC".
           WRITE IN-REC-3 FROM "060FFFFF".
           CLOSE IN-FILE-3.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1 IN-FILE-2 IN-FILE-3
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       EMIT-PARA.
           OPEN OUTPUT OUT-FILE.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN MERGE-FILE AT END MOVE "Y" TO WS-EOF
               NOT AT END
                   DISPLAY "MERGED=" M-KEY " " M-VAL
                   MOVE M-KEY TO O-KEY
                   MOVE M-VAL TO O-VAL
                   WRITE OUT-REC
           END-PERFORM.
           CLOSE OUT-FILE.
