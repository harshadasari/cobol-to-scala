       IDENTIFICATION DIVISION.
       PROGRAM-ID. E09.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT DATA-FILE ASSIGN TO "E09DATA.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-DATA.
           SELECT BAD-FILE ASSIGN TO "E09NOSUCH.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-BAD.
       DATA DIVISION.
       FILE SECTION.
       FD  DATA-FILE.
       01  DATA-REC.
           05  D-K1  PIC 9(2).
           05  D-K2  PIC 9(2).
           05  D-VAL PIC X(4).
       FD  BAD-FILE.
       01  BAD-REC PIC X(8).
       WORKING-STORAGE SECTION.
       01  FS-DATA PIC XX.
       01  FS-BAD PIC XX.
       01  WS-EOF PIC X VALUE "N".
       01  WS-COUNT PIC 9(2) VALUE 0.
       01  TARGET-K1 PIC 9(2) VALUE 2.
       01  TARGET-K2 PIC 9(2) VALUE 1.
       01  WS-TABLE.
           05  WS-ROW OCCURS 5 TIMES
               ASCENDING KEY IS ROW-K1 ROW-K2
               INDEXED BY IDX.
               10  ROW-K1  PIC 9(2).
               10  ROW-K2  PIC 9(2).
               10  ROW-VAL PIC X(4).
       PROCEDURE DIVISION.
       DECLARATIVES.
       BAD-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON BAD-FILE.
       BAD-HANDLER-PARA.
           DISPLAY "BAD HANDLER FIRED FS=" FS-BAD.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           OPEN OUTPUT DATA-FILE.
           MOVE 1 TO D-K1. MOVE 3 TO D-K2. MOVE "ROWA" TO D-VAL.
           WRITE DATA-REC.
           MOVE 2 TO D-K1. MOVE 1 TO D-K2. MOVE "ROWB" TO D-VAL.
           WRITE DATA-REC.
           MOVE 2 TO D-K1. MOVE 2 TO D-K2. MOVE "ROWC" TO D-VAL.
           WRITE DATA-REC.
           MOVE 3 TO D-K1. MOVE 5 TO D-K2. MOVE "ROWD" TO D-VAL.
           WRITE DATA-REC.
           MOVE 4 TO D-K1. MOVE 1 TO D-K2. MOVE "ROWE" TO D-VAL.
           WRITE DATA-REC.
           CLOSE DATA-FILE.

           OPEN INPUT DATA-FILE.
           PERFORM UNTIL WS-EOF = "Y"
               READ DATA-FILE
                   AT END MOVE "Y" TO WS-EOF
                   NOT AT END
                       ADD 1 TO WS-COUNT
                       MOVE D-K1 TO ROW-K1(WS-COUNT)
                       MOVE D-K2 TO ROW-K2(WS-COUNT)
                       MOVE D-VAL TO ROW-VAL(WS-COUNT)
               END-READ
           END-PERFORM.
           CLOSE DATA-FILE.

           OPEN INPUT BAD-FILE.
           DISPLAY "AFTER BAD OPEN FS=" FS-BAD.

           SET IDX TO 1.
           SEARCH ALL WS-ROW
               AT END
                   DISPLAY "TARGET NOT FOUND"
               WHEN ROW-K1(IDX) = TARGET-K1 AND ROW-K2(IDX) = TARGET-K2
                   DISPLAY "FOUND VAL=" ROW-VAL(IDX) " AT IDX=" IDX
           END-SEARCH.

           MOVE 3 TO TARGET-K1.
           MOVE 9 TO TARGET-K2.
           SET IDX TO 1.
           SEARCH ALL WS-ROW
               AT END
                   DISPLAY "TARGET NOT FOUND"
               WHEN ROW-K1(IDX) = TARGET-K1 AND ROW-K2(IDX) = TARGET-K2
                   DISPLAY "FOUND VAL=" ROW-VAL(IDX) " AT IDX=" IDX
           END-SEARCH.

           STOP RUN.
