      * ii12: EVALUATE with a table-ELEMENT subject (a subscripted
      * reference, WS-CODE(WS-I)) combined with a keyed RANDOM-access
      * READ against a RELATIVE file on the SAME loop iteration - a
      * fresh combination of two independently-supported features
      * (subscripted EVALUATE subjects, and rounds-25-32's RANDOM-access
      * RELATIVE file I/O) that no known-gap or prior round entry
      * documents as ever having been tried together.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II12EVALTBL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "II12REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-VAL     PIC 9(4).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       01  WS-CODES.
           05  WS-CODE OCCURS 3 TIMES PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "B" TO WS-CODE(1).
           MOVE "A" TO WS-CODE(2).
           MOVE "C" TO WS-CODE(3).

           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY. MOVE 100 TO REC-VAL.
           WRITE REL-REC INVALID KEY DISPLAY "W1 FAIL".
           MOVE 2 TO WS-RKEY. MOVE 200 TO REC-VAL.
           WRITE REL-REC INVALID KEY DISPLAY "W2 FAIL".
           MOVE 3 TO WS-RKEY. MOVE 300 TO REC-VAL.
           WRITE REL-REC INVALID KEY DISPLAY "W3 FAIL".
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               MOVE WS-I TO WS-RKEY
               READ REL-FILE
                   INVALID KEY DISPLAY "READ" WS-I " INVALID"
                   NOT INVALID KEY
                       DISPLAY "READ" WS-I " VAL=" REC-VAL
               END-READ
               EVALUATE WS-CODE(WS-I)
                   WHEN "A"
                       DISPLAY "  CODE-A AT " WS-I
                   WHEN "B"
                       DISPLAY "  CODE-B AT " WS-I
                   WHEN OTHER
                       DISPLAY "  CODE-OTHER AT " WS-I
               END-EVALUATE
           END-PERFORM.
           CLOSE REL-FILE.
           STOP RUN.
