       IDENTIFICATION DIVISION.
       PROGRAM-ID. S12EDOP88.
      * Round-5 attack: (1) a numeric-EDITED field de-edited via MOVE
      * into a plain numeric field, then used as an arithmetic
      * operand from that plain field (numeric-edited items are not
      * legal direct arithmetic operands per the standard - cobc
      * itself rejects that form - so the MOVE is the de-editing
      * step), and (2) an 88-level condition-name with multiple
      * discrete VALUEs plus a VALUE ... THRU range, tested both
      * positively and negated via NOT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-EDITED           PIC ZZ9.99 VALUE 12.50.
       01  WS-PLAIN            PIC S9(5)V99 VALUE 0.
       01  WS-RESULT           PIC S9(5)V99 VALUE 0.
       01  WS-CODE             PIC 9(2) VALUE 5.
           88  CODE-SPECIAL    VALUES 1, 3, 99.
           88  CODE-MIDRANGE   VALUES 10 THRU 20.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-EDITED TO WS-PLAIN.
           COMPUTE WS-RESULT = WS-PLAIN + 1.5.
           DISPLAY "RESULT=" WS-RESULT.
           IF CODE-SPECIAL
               DISPLAY "CODE-IS-SPECIAL"
           ELSE
               DISPLAY "CODE-NOT-SPECIAL"
           END-IF.
           IF NOT CODE-MIDRANGE
               DISPLAY "CODE-NOT-MIDRANGE"
           ELSE
               DISPLAY "CODE-IS-MIDRANGE"
           END-IF.
           MOVE 15 TO WS-CODE.
           IF CODE-MIDRANGE AND NOT CODE-SPECIAL
               DISPLAY "MIDRANGE-ONLY"
           END-IF.
           STOP RUN.
