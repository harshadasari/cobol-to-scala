       IDENTIFICATION DIVISION.
       PROGRAM-ID. H13SRTDDC.
      *
      * Adversarial (round 19): SORT ... WITH DUPLICATES IN ORDER
      * combined with an OUTPUT PROCEDURE that itself performs real
      * file I/O guarded by a DECLARATIVES error handler. Round-9/r05
      * already tests DUPLICATES IN ORDER with a plain (RETURN-into-
      * table) OUTPUT PROCEDURE; round-18's g07 combines DECLARATIVES
      * with a SORT OUTPUT PROCEDURE but WITHOUT the DUPLICATES phrase.
      * No prior probe combines all three: DUPLICATES stability +
      * OUTPUT-PROCEDURE file I/O + a DECLARATIVES handler guarding
      * that I/O.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "SORTWKH13".
           SELECT OUT-FILE ASSIGN TO "H13OUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-OUT-STATUS.
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-KEY        PIC 9(3).
           05  SORT-NAME       PIC X(4).
       FD  OUT-FILE.
       01  OUT-REC             PIC X(9).
       WORKING-STORAGE SECTION.
       01  WS-OUT-STATUS       PIC XX VALUE "00".
       01  WS-I                PIC 9(2).
       01  WS-EOF              PIC X VALUE 'N'.
       01  WS-SRC-TABLE.
           05  WS-SRC-ENTRY    OCCURS 5 TIMES.
               10  WS-SRC-KEY  PIC 9(3).
               10  WS-SRC-NAME PIC X(4).
       PROCEDURE DIVISION.
       DECLARATIVES.
       OUT-FILE-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON OUT-FILE.
       OUT-FILE-ERR.
           DISPLAY "OUT-FILE-ERROR-STATUS=" WS-OUT-STATUS.
       END DECLARATIVES.
       MAIN-PARA SECTION.
       MAIN-START.
           MOVE 200 TO WS-SRC-KEY(1)
           MOVE 'A1' TO WS-SRC-NAME(1)
           MOVE 100 TO WS-SRC-KEY(2)
           MOVE 'B1' TO WS-SRC-NAME(2)
           MOVE 200 TO WS-SRC-KEY(3)
           MOVE 'A2' TO WS-SRC-NAME(3)
           MOVE 100 TO WS-SRC-KEY(4)
           MOVE 'B2' TO WS-SRC-NAME(4)
           MOVE 200 TO WS-SRC-KEY(5)
           MOVE 'A3' TO WS-SRC-NAME(5)

           SORT SORT-FILE ON ASCENDING KEY SORT-KEY
               WITH DUPLICATES IN ORDER
               INPUT PROCEDURE 1000-RELEASE-RECORDS
               OUTPUT PROCEDURE 2000-EMIT-RECORDS.
           STOP RUN.
      *
       1000-RELEASE-RECORDS.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 5
               MOVE WS-SRC-KEY(WS-I) TO SORT-KEY
               MOVE WS-SRC-NAME(WS-I) TO SORT-NAME
               RELEASE SORT-REC
           END-PERFORM.
      *
       2000-EMIT-RECORDS SECTION.
       2000-START.
           OPEN OUTPUT OUT-FILE.
           MOVE 'N' TO WS-EOF
           PERFORM UNTIL WS-EOF = 'Y'
               RETURN SORT-FILE
                   AT END
                       MOVE 'Y' TO WS-EOF
                   NOT AT END
                       MOVE SORT-REC TO OUT-REC
                       WRITE OUT-REC
                       DISPLAY "EMITTED=" OUT-REC
               END-RETURN
           END-PERFORM.
           CLOSE OUT-FILE.
       END PROGRAM H13SRTDDC.
