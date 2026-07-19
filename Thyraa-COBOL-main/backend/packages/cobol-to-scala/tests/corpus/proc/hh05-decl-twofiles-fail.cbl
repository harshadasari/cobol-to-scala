      * hh05: round-23 confirmed multiple DECLARATIVES SECTIONS is
      * invalid COBOL, and aa04 already checks TWO SECTIONS in one
      * DECLARATIVES that both reference the SAME file (mode-level vs
      * file-level precedence). This probes the untested combination: a
      * SINGLE DECLARATIVES with TWO USE clauses for TWO DIFFERENT files,
      * where BOTH files actually fail (a missing file on OPEN INPUT) in
      * the same paragraph sequence - does each file's own registered
      * handler fire independently, in the right order, reading the
      * right FILE STATUS field each time (not cross-wired to the other
      * file's handler or status)?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH05TWOFILE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "HH05NOSUCH-A.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-A.
           SELECT FILE-B ASSIGN TO "HH05NOSUCH-B.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-B.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A   PIC X(10).
       FD  FILE-B.
       01  REC-B   PIC X(10).
       WORKING-STORAGE SECTION.
       01  FS-A    PIC XX.
       01  FS-B    PIC XX.
       PROCEDURE DIVISION.
       DECLARATIVES.
       FILE-A-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON FILE-A.
       FILE-A-HANDLER-PARA.
           DISPLAY "A-HANDLER FIRED FS-A=" FS-A.
       FILE-B-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON FILE-B.
       FILE-B-HANDLER-PARA.
           DISPLAY "B-HANDLER FIRED FS-B=" FS-B.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           OPEN INPUT FILE-A.
           DISPLAY "AFTER-OPEN-A FS-A=" FS-A.
           OPEN INPUT FILE-B.
           DISPLAY "AFTER-OPEN-B FS-B=" FS-B.
           STOP RUN.
