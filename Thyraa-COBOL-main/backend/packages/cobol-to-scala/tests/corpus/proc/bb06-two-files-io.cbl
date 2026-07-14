      * Adversarial (round 26): TWO separate files simultaneously OPEN I-O
      * in the same program - each gets its OWN bufVar/posVar (per-file
      * names via toBufVarName/toPosVarName), so this checks there is no
      * cross-contamination: interleaved READ/REWRITE on FILE-A and
      * FILE-B must not let one file's buffer/position leak into the
      * other's.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB06TWOIO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "BB06A.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY-A
               FILE STATUS IS WS-STATUS-A.
           SELECT FILE-B ASSIGN TO "BB06B.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY-B
               FILE STATUS IS WS-STATUS-B.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A.
           05 A-ID  PIC 9(3).
           05 A-VAL PIC X(5).
       FD  FILE-B.
       01  REC-B.
           05 B-ID  PIC 9(3).
           05 B-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY-A   PIC 9(3) VALUE 0.
       01 WS-STATUS-A PIC XX.
       01 WS-RKEY-B   PIC 9(3) VALUE 0.
       01 WS-STATUS-B PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT FILE-A.
           MOVE 1 TO A-ID. MOVE "AAAAA" TO A-VAL. WRITE REC-A.
           CLOSE FILE-A.
           OPEN OUTPUT FILE-B.
           MOVE 1 TO B-ID. MOVE "11111" TO B-VAL. WRITE REC-B.
           CLOSE FILE-B.

           OPEN I-O FILE-A.
           OPEN I-O FILE-B.
           READ FILE-A.
           READ FILE-B.
           DISPLAY "READ-A VAL=" A-VAL.
           DISPLAY "READ-B VAL=" B-VAL.
           MOVE "ZZZZZ" TO A-VAL.
           REWRITE REC-A.
           MOVE "99999" TO B-VAL.
           REWRITE REC-B.
           DISPLAY "STATUS-A=" WS-STATUS-A " STATUS-B=" WS-STATUS-B.
           CLOSE FILE-A.
           CLOSE FILE-B.

           OPEN INPUT FILE-A.
           READ FILE-A.
           DISPLAY "FINAL-A VAL=" A-VAL.
           CLOSE FILE-A.
           OPEN INPUT FILE-B.
           READ FILE-B.
           DISPLAY "FINAL-B VAL=" B-VAL.
           CLOSE FILE-B.
           STOP RUN.
