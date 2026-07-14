      * Adversarial (round 25): companion to o11 - round-24 finding 4 (m08)
      * fixed a plain elementary FD field's own pre-first-I/O default to
      * LOW-VALUES, but never tried an OCCURS table nested inside an FD
      * record. Checks whether `buildFieldRegistry`'s `isFileSection`
      * threading correctly propagates the low-values default into EVERY
      * element of a repeated (Vector-typed) FD child too, not just a
      * single flat scalar.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O12FDOCCURS.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "O12NOSUCHFILE"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-HEADER PIC X(3).
           05 REC-ITEM   PIC X(2) OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       DECLARATIVES.
       ERR-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       ERR-PARA.
           DISPLAY "ERROR-HANDLER-FIRED STATUS=" WS-STATUS.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY "BEFORE-OPEN HDR=[" REC-HEADER "]".
           DISPLAY "BEFORE-OPEN I1=[" REC-ITEM(1) "] I2=["
               REC-ITEM(2) "] I3=[" REC-ITEM(3) "]".
           OPEN INPUT SOME-FILE.
           DISPLAY "AFTER-OPEN HDR=[" REC-HEADER "]".
           STOP RUN.
