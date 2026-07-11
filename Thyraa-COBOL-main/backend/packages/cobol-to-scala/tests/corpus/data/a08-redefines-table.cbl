       IDENTIFICATION DIVISION.
       PROGRAM-ID. A08REDT.
      *
      * Adversarial: REDEFINES over a table - write through the table
      * view, read through a flat alphanumeric view, and vice versa.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FLAT-VIEW        PIC X(12).
       01  WS-TABLE-VIEW REDEFINES WS-FLAT-VIEW.
           05  WS-CHUNK OCCURS 3 TIMES PIC X(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 'AAAABBBBCCCC' TO WS-FLAT-VIEW
           DISPLAY 'CHUNK1=[' WS-CHUNK(1) ']'
           DISPLAY 'CHUNK2=[' WS-CHUNK(2) ']'
           DISPLAY 'CHUNK3=[' WS-CHUNK(3) ']'

           MOVE 'ZZZZ' TO WS-CHUNK(2)
           DISPLAY 'FLAT-AFTER=[' WS-FLAT-VIEW ']'

           MOVE 'WWWW' TO WS-CHUNK(1)
           MOVE 'YYYY' TO WS-CHUNK(3)
           DISPLAY 'FLAT-AFTER-2=[' WS-FLAT-VIEW ']'

           STOP RUN.
