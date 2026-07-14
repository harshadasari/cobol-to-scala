      * Adversarial (round 25): `SET index-name UP/DOWN BY` is already
      * exercised by q03/w04, but never inside a RECURSIVE program, and
      * never against a WORKING-STORAGE index-name that (per round-21
      * finding 2/j10) is genuinely SHARED/static across recursive
      * activations. Each self-recursive activation does `SET WS-IDX UP BY
      * 1` against the SAME shared index, then DISPLAYs the table element
      * it now points to - checking whether the shared-WORKING-STORAGE
      * model (confirmed correct for a plain scalar in j10) also holds for
      * an index-name specifically (SET's own "index" codegen branch,
      * generateSet's `statement.setType === 'index'` case).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O06MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "O06SUB" USING WS-N.
           STOP RUN.
       END PROGRAM O06MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. O06SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-ITEM PIC X(2) OCCURS 5 TIMES
               INDEXED BY WS-IDX.
       01 WS-NEXT PIC 9(2).
       01 WS-INIT-DONE PIC X VALUE "N".
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           IF WS-INIT-DONE = "N"
               SET WS-IDX TO 1
               MOVE "Z0" TO WS-ITEM(WS-IDX)
               SET WS-IDX TO 2
               MOVE "Z1" TO WS-ITEM(WS-IDX)
               SET WS-IDX TO 3
               MOVE "Z2" TO WS-ITEM(WS-IDX)
               SET WS-IDX TO 4
               MOVE "Z3" TO WS-ITEM(WS-IDX)
               SET WS-IDX TO 5
               MOVE "Z4" TO WS-ITEM(WS-IDX)
               SET WS-IDX TO 1
               MOVE "Y" TO WS-INIT-DONE
           END-IF.
           SET WS-IDX UP BY 1.
           DISPLAY "ENTER N=" LS-N " ITEM=" WS-ITEM(WS-IDX).
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "O06SUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT  N=" LS-N " ITEM=" WS-ITEM(WS-IDX).
           GOBACK.
       END PROGRAM O06SUB.
