      * Adversarial (round 26): round-22's REDEFINES-over-OCCURS work and
      * round-24's FD LOW-VALUES-default fix (an FD record's own field
      * with no VALUE clause defaults to LOW-VALUES, not spaces, until a
      * successful OPEN+READ/WRITE touches it) have never been exercised
      * TOGETHER - a REDEFINES target that is itself an OCCURS table,
      * displayed BEFORE the first successful READ, on an FD record.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB11REDEF.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB11FILE.DAT"
               ORGANIZATION IS SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-FLAT   PIC X(10).
           05 REC-TABLE REDEFINES REC-FLAT.
              10 REC-ELEM PIC X(2) OCCURS 5 TIMES.
       WORKING-STORAGE SECTION.
       01 WS-I PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-OPEN FLAT=[" REC-FLAT "]".
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 5
               DISPLAY "BEFORE-OPEN ELEM(" WS-I ")=[" REC-ELEM(WS-I) "]"
           END-PERFORM.

           OPEN OUTPUT SOME-FILE.
           MOVE "XYXYXYXYXY" TO REC-FLAT.
           WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           DISPLAY "AFTER-READ FLAT=[" REC-FLAT "]".
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 5
               DISPLAY "AFTER-READ ELEM(" WS-I ")=[" REC-ELEM(WS-I) "]"
           END-PERFORM.
           CLOSE SOME-FILE.
           STOP RUN.
