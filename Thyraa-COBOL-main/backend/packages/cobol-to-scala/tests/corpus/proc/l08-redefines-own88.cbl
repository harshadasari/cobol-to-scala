      * Adversarial (round 23): every corpus REDEFINES program to date
      * attaches its own level-88 condition-names to the ORIGINAL
      * (base) item being redefined, never to the REDEFINING item
      * itself. This attaches TWO condition-names directly to
      * WS-REDEF (the REDEFINES item, a numeric view over the same
      * storage WS-BASE, an alphanumeric byte, already occupies) - a
      * legal, if unusual, COBOL shape: a condition-name's scope is
      * always its own immediately-enclosing data item, regardless of
      * whether that item is a REDEFINES target or an ordinary one.
      * Checks that WS-REDEF-ONE/WS-REDEF-TWO correctly read through
      * whatever storage-aliasing mechanism this engine uses for
      * REDEFINES, reacting to a MOVE into the BASE item (WS-BASE) the
      * same way a real condition-name on a redefining item must.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L08REDEF88.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-BASE PIC X VALUE "1".
       01 WS-REDEF REDEFINES WS-BASE PIC 9.
           88 WS-REDEF-ZERO VALUE 0.
           88 WS-REDEF-ONE  VALUE 1.
           88 WS-REDEF-TWO  VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "REDEF=" WS-REDEF.
           IF WS-REDEF-ONE
               DISPLAY "IS-ONE"
           END-IF.
           IF WS-REDEF-TWO
               DISPLAY "NOT-TWO-YET-WRONG"
           END-IF.
           MOVE "2" TO WS-BASE.
           DISPLAY "REDEF=" WS-REDEF.
           IF WS-REDEF-TWO
               DISPLAY "IS-TWO"
           END-IF.
           IF WS-REDEF-ONE
               DISPLAY "NOT-ONE-ANYMORE-WRONG"
           END-IF.
           STOP RUN.
