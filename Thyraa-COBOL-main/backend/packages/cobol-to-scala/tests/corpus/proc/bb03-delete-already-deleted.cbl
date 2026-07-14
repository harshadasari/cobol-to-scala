      * Adversarial (round 26): generateDeleteStatement guards on
      * `posVar > 0` and decrements posVar on a successful delete - a
      * SECOND DELETE issued immediately after the first, with no
      * intervening READ, therefore either targets the WRONG record (if
      * posVar was still > 0) or silently no-ops (if it dropped to 0)
      * with FILE STATUS left stale rather than set to cobc's real error
      * code for "no valid previous READ" (44). This exercises exactly
      * that: DELETE the first of 3 records, then immediately DELETE AGAIN
      * with no READ in between, checking both WS-STATUS after the second
      * DELETE and which records actually survive on reread.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB03DELDEL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB03FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(3) VALUE 0.
       01 WS-STATUS PIC XX.
       01 WS-EOF    PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL. WRITE SOME-REC.
           MOVE 2 TO REC-ID. MOVE "BBBBB" TO REC-VAL. WRITE SOME-REC.
           MOVE 3 TO REC-ID. MOVE "CCCCC" TO REC-VAL. WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           DELETE SOME-FILE.
           DISPLAY "AFTER-DELETE-1 STATUS=" WS-STATUS.
           DELETE SOME-FILE.
           DISPLAY "AFTER-DELETE-2 STATUS=" WS-STATUS.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           PERFORM 3 TIMES
             IF WS-EOF NOT = "Y"
               READ SOME-FILE
                 AT END MOVE "Y" TO WS-EOF
                 NOT AT END DISPLAY "SURV ID=" REC-ID " V=" REC-VAL
               END-READ
             END-IF
           END-PERFORM.
           CLOSE SOME-FILE.
           STOP RUN.
