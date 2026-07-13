       IDENTIFICATION DIVISION.
       PROGRAM-ID. H09DMCMAIN.
      *
      * Adversarial (round 19): triple combination - DECLARATIVES
      * (file-status error handling) + MERGE (round-18 finding 2's new
      * OUTPUT-PROCEDURE-only support) + CALL to a same-source
      * subprogram, all in one program. MERGE's own OUTPUT PROCEDURE
      * (EMIT-PARA) both fires a DECLARATIVES-guarded file OPEN and
      * calls a subprogram per merged record - none of round-18's g07/
      * g12/g13/g14 combine MERGE with either DECLARATIVES or CALL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "H09IN1.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-2 ASSIGN TO "H09IN2.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT OUT-FILE ASSIGN TO "H09OUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-OUT-STATUS.
           SELECT MERGE-FILE ASSIGN TO "SORTWKD".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1            PIC X(6).
       FD  IN-FILE-2.
       01  IN-REC-2            PIC X(6).
       FD  OUT-FILE.
       01  OUT-REC             PIC X(6).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05  M-KEY           PIC 9(3).
           05  M-TAG           PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-OUT-STATUS       PIC XX VALUE "00".
       01  WS-EOF              PIC X VALUE 'N'.
       01  WS-COUNT            PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       DECLARATIVES.
       OUT-FILE-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON OUT-FILE.
       OUT-FILE-ERR.
           DISPLAY "OUT-FILE-ERROR-STATUS=" WS-OUT-STATUS.
       END DECLARATIVES.
       MAIN-PARA SECTION.
       MAIN-START.
           OPEN OUTPUT IN-FILE-1.
           WRITE IN-REC-1 FROM "010AAA".
           WRITE IN-REC-1 FROM "030CCC".
           CLOSE IN-FILE-1.

           OPEN OUTPUT IN-FILE-2.
           WRITE IN-REC-2 FROM "020BBB".
           WRITE IN-REC-2 FROM "040DDD".
           CLOSE IN-FILE-2.

           MERGE MERGE-FILE
               ASCENDING KEY M-KEY
               USING IN-FILE-1 IN-FILE-2
               OUTPUT PROCEDURE IS EMIT-PARA.

           DISPLAY "COUNT=" WS-COUNT.
           STOP RUN.
      *
       EMIT-PARA SECTION.
       EMIT-START.
           OPEN OUTPUT OUT-FILE.
           MOVE 'N' TO WS-EOF
           PERFORM UNTIL WS-EOF = 'Y'
               RETURN MERGE-FILE
                   AT END
                       MOVE 'Y' TO WS-EOF
                   NOT AT END
                       ADD 1 TO WS-COUNT
                       MOVE MERGE-REC TO OUT-REC
                       WRITE OUT-REC
                       CALL "H09DMCSUB" USING M-KEY M-TAG
               END-RETURN
           END-PERFORM.
           CLOSE OUT-FILE.
       END PROGRAM H09DMCMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. H09DMCSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-KEY              PIC 9(3).
       01  LK-TAG              PIC X(3).
       PROCEDURE DIVISION USING LK-KEY LK-TAG.
       SUB-PARA.
           DISPLAY "SUB-SAW=" LK-KEY " " LK-TAG.
       END PROGRAM H09DMCSUB.
