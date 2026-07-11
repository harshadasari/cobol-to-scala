       IDENTIFICATION DIVISION.
       PROGRAM-ID. A05GRP.
      *
      * Adversarial: group MOVE is byte-wise (no data-type conversion,
      * no de-editing) vs elementary MOVE of the same underlying data
      * which DOES convert. Source group has a COMP-3 field; moving
      * the group copies raw packed bytes into the target group's
      * DISPLAY-typed field of the same size, producing garbage if
      * read as DISPLAY - this is intentional/correct COBOL behavior
      * and a common conversion-engine trap.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC-GROUP.
           05  WS-SRC-NUM      PIC S9(4) COMP-3 VALUE 1234.
           05  WS-SRC-TEXT     PIC X(5) VALUE 'HELLO'.
       01  WS-DST-GROUP.
           05  WS-DST-NUM      PIC S9(4) COMP-3.
           05  WS-DST-TEXT     PIC X(5).
       01  WS-ELEM-DST-NUM     PIC S9(4) COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-SRC-GROUP TO WS-DST-GROUP
           DISPLAY 'GROUP-NUM=' WS-DST-NUM
           DISPLAY 'GROUP-TEXT=[' WS-DST-TEXT ']'

           MOVE WS-SRC-NUM TO WS-ELEM-DST-NUM
           DISPLAY 'ELEM-NUM=' WS-ELEM-DST-NUM

           STOP RUN.
