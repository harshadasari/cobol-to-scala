       IDENTIFICATION DIVISION.
       PROGRAM-ID. T06FDREDEF.
      * Round-6 attack: an FD record REDEFINES another FD record (a
      * different view over the same physical file buffer) - all
      * prior REDEFINES corpus coverage (n06/s05) is on WORKING-STORAGE
      * records, never a FILE SECTION record.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT DATA-FILE ASSIGN TO "t06fdredef.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  DATA-FILE.
       01  REC-AS-TEXT         PIC X(10).
       01  REC-AS-FIELDS REDEFINES REC-AS-TEXT.
           05  REC-CODE        PIC X(3).
           05  REC-VALUE       PIC 9(7).
       WORKING-STORAGE SECTION.
       01  WS-EOF-FLAG         PIC X(1) VALUE 'N'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT DATA-FILE.
           MOVE "ABC0001234" TO REC-AS-TEXT.
           WRITE REC-AS-TEXT.
           CLOSE DATA-FILE.

           OPEN INPUT DATA-FILE.
           READ DATA-FILE
               AT END
                   DISPLAY "UNEXPECTED-EOF"
               NOT AT END
                   DISPLAY "TEXT=[" REC-AS-TEXT "]"
                   DISPLAY "CODE=[" REC-CODE "]"
                   DISPLAY "VALUE=" REC-VALUE
           END-READ.
           CLOSE DATA-FILE.
           STOP RUN.
