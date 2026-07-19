      * jj09: fresh combination, long dormant per the round-34 brief - a
      * subprogram receiving a file-record-shaped LINKAGE SECTION group
      * parameter, writing into its subfields via ordinary MOVE (BY
      * REFERENCE is the default CALL...USING passing mode, so the
      * writeback should be visible to the caller once the CALL
      * returns), and the CALLER then using that written-back value to
      * WRITE a RELATIVE-organization file record. Probes whether
      * round-25-33's RELATIVE-file WRITE codegen correctly picks up a
      * record whose fields were populated through a BY REFERENCE
      * subprogram writeback rather than a direct MOVE in the same
      * paragraph.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ09MAIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "JJ09REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(3).
           05  REC-NAME    PIC X(8).
           05  REC-AMT     PIC S9(5)V99.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-BUILD.
           05  BLD-ID      PIC 9(3).
           05  BLD-NAME    PIC X(8).
           05  BLD-AMT     PIC S9(5)V99.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.

           MOVE 0 TO BLD-ID.
           MOVE SPACES TO BLD-NAME.
           MOVE 0 TO BLD-AMT.
           CALL "JJ09FILL" USING BLD-ID BLD-NAME BLD-AMT.
           MOVE BLD-ID TO REC-ID.
           MOVE BLD-NAME TO REC-NAME.
           MOVE BLD-AMT TO REC-AMT.
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS
               " ID=" REC-ID " NAME=[" REC-NAME "] AMT=" REC-AMT.

           MOVE 0 TO BLD-ID.
           MOVE SPACES TO BLD-NAME.
           MOVE 0 TO BLD-AMT.
           CALL "JJ09FILL" USING BLD-ID BLD-NAME BLD-AMT.
           MOVE BLD-ID TO REC-ID.
           MOVE BLD-NAME TO REC-NAME.
           MOVE BLD-AMT TO REC-AMT.
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS
               " ID=" REC-ID " NAME=[" REC-NAME "] AMT=" REC-AMT.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS
               " ID=" REC-ID " NAME=[" REC-NAME "] AMT=" REC-AMT.
           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS
               " ID=" REC-ID " NAME=[" REC-NAME "] AMT=" REC-AMT.
           CLOSE REL-FILE.
           STOP RUN.
       END PROGRAM JJ09MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ09FILL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CALLS PIC 9 VALUE 0.
       LINKAGE SECTION.
       01  LK-ID   PIC 9(3).
       01  LK-NAME PIC X(8).
       01  LK-AMT  PIC S9(5)V99.
       PROCEDURE DIVISION USING LK-ID LK-NAME LK-AMT.
       MAIN-ENTRY.
           ADD 1 TO WS-CALLS.
           IF WS-CALLS = 1
               MOVE 101 TO LK-ID
               MOVE "ALPHA" TO LK-NAME
               MOVE 123.45 TO LK-AMT
           ELSE
               MOVE 202 TO LK-ID
               MOVE "BETA" TO LK-NAME
               MOVE -67.89 TO LK-AMT
           END-IF.
           GOBACK.
       END PROGRAM JJ09FILL.
