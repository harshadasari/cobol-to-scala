       IDENTIFICATION DIVISION.
       PROGRAM-ID. IDX01.
      *
      * Round-4 attack: OCCURS INDEXED BY with SET index UP BY / DOWN
      * BY, SET index-name TO another index-name, and index-name
      * comparison in IF conditions.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY        OCCURS 6 TIMES
                                INDEXED BY WS-IX WS-IY.
               10  WS-VAL      PIC 9(2).
       PROCEDURE DIVISION.
       0000-MAIN.
           SET WS-IX TO 1
           MOVE 10 TO WS-VAL(WS-IX)
           SET WS-IX TO 2
           MOVE 20 TO WS-VAL(WS-IX)
           SET WS-IX TO 3
           MOVE 30 TO WS-VAL(WS-IX)
           SET WS-IX TO 4
           MOVE 40 TO WS-VAL(WS-IX)
           SET WS-IX TO 5
           MOVE 50 TO WS-VAL(WS-IX)
           SET WS-IX TO 6
           MOVE 60 TO WS-VAL(WS-IX)
      *
           SET WS-IX TO 1
           SET WS-IX UP BY 2
           DISPLAY 'IX-AFTER-UP2=' WS-IX
           DISPLAY 'VAL-AT-IX=' WS-VAL(WS-IX)
      *
           SET WS-IX UP BY 3
           DISPLAY 'IX-AFTER-UP3=' WS-IX
           DISPLAY 'VAL-AT-IX=' WS-VAL(WS-IX)
      *
           SET WS-IX DOWN BY 4
           DISPLAY 'IX-AFTER-DOWN4=' WS-IX
           DISPLAY 'VAL-AT-IX=' WS-VAL(WS-IX)
      *
      *    SET index-name TO another index-name.
           SET WS-IY TO WS-IX
           DISPLAY 'IY-AFTER-SET-FROM-IX=' WS-IY
      *
      *    Independence check: bumping IY must not affect IX.
           SET WS-IY UP BY 1
           DISPLAY 'IY-AFTER-UP1=' WS-IY
           DISPLAY 'IX-STILL=' WS-IX
      *
      *    Index-name comparisons in IF conditions.
           IF WS-IX < WS-IY
               DISPLAY 'IX-LESS-THAN-IY=TRUE'
           ELSE
               DISPLAY 'IX-LESS-THAN-IY=FALSE'
           END-IF
      *
           IF WS-IY = WS-IX + 1
               DISPLAY 'IY-EQUALS-IX-PLUS-1=TRUE'
           ELSE
               DISPLAY 'IY-EQUALS-IX-PLUS-1=FALSE'
           END-IF
      *
           IF WS-IX = 2
               DISPLAY 'IX-IS-2=TRUE'
           ELSE
               DISPLAY 'IX-IS-2=FALSE'
           END-IF
      *
           STOP RUN.
