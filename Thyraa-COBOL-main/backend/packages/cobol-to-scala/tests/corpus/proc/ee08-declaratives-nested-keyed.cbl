      * ee08: a DECLARATIVES handler (registered ON FILE-A) that, once
      * fired by a keyed I/O failure, itself performs ANOTHER keyed I/O
      * operation (on a DIFFERENT file, FILE-B) that ALSO fails and has
      * its OWN registered DECLARATIVES handler - dd09 only ever tested a
      * single handler invocation per triggering statement; this tests
      * whether the generated dispatch correctly handles a handler that
      * itself calls into another handler ("recursion within the handler
      * dispatch", not RECURSIVE-program call-stack recursion).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE08DECLNEST.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "EE08A.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-A
               FILE STATUS IS WS-STATUS-A.
           SELECT FILE-B ASSIGN TO "EE08B.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-B
               FILE STATUS IS WS-STATUS-B.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A.
           05  A-ID    PIC 9(3).
           05  A-VAL   PIC X(5).
       FD  FILE-B.
       01  REC-B.
           05  B-ID    PIC 9(3).
           05  B-VAL   PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY-A     PIC 9(4).
       01  WS-STATUS-A   PIC X(2).
       01  WS-RKEY-B     PIC 9(4).
       01  WS-STATUS-B   PIC X(2).
       PROCEDURE DIVISION.
       DECLARATIVES.
       FILE-A-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON FILE-A.
       FILE-A-HANDLER.
           DISPLAY "HANDLER-A ST=" WS-STATUS-A.
           MOVE 99 TO WS-RKEY-B.
           READ FILE-B.
           DISPLAY "AFTER-INNER-READ ST-B=" WS-STATUS-B.
       FILE-B-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON FILE-B.
       FILE-B-HANDLER.
           DISPLAY "HANDLER-B ST=" WS-STATUS-B.
       END DECLARATIVES.
       MAIN-PARA SECTION.
       MAIN-PARA-START.
           OPEN OUTPUT FILE-A.
           MOVE 1 TO WS-RKEY-A. MOVE 1 TO A-ID. MOVE "ONE  " TO A-VAL.
           WRITE REC-A.
           CLOSE FILE-A.

           OPEN OUTPUT FILE-B.
           MOVE 1 TO WS-RKEY-B. MOVE 1 TO B-ID. MOVE "BEE  " TO B-VAL.
           WRITE REC-B.
           CLOSE FILE-B.

           OPEN I-O FILE-A.
           OPEN I-O FILE-B.

      * Duplicate-key WRITE on FILE-A - no INVALID KEY clause - real
      * cobc must fire FILE-A-HANDLER (ST-A=22), which then itself
      * performs a keyed READ on FILE-B for a never-written key (99) -
      * that ALSO fails (ST-B=23) and should fire FILE-B-HANDLER.
           MOVE 1 TO WS-RKEY-A. MOVE 1 TO A-ID. MOVE "DUPE!" TO A-VAL.
           WRITE REC-A.
           DISPLAY "AFTER-OUTER-WRITE ST-A=" WS-STATUS-A.

           CLOSE FILE-A.
           CLOSE FILE-B.
           STOP RUN.
