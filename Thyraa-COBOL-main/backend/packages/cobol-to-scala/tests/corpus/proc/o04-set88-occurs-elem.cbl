      * Adversarial (round 25): every prior SET-condition-name-TO-TRUE/FALSE
      * corpus probe (round-12 finding 1, etc.) targets an UNSUBSCRIPTED
      * condition-name attached to a plain elementary item. This attaches
      * the level-88 to a child of an OCCURS table instead, then does
      * `SET WS-FLAG-OK(2) TO TRUE` - a subscripted condition-name
      * reference, legal COBOL requiring the same subscript as its parent
      * table element. Checks whether the generator's condition-name ->
      * parent-field write correctly threads the subscript through (writing
      * only row 2) or silently ignores it (writing something else, or
      * failing to compile against the table's own Vector-typed storage).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O04SET88OCCURS.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-FLAG PIC X OCCURS 3 TIMES.
               88 WS-FLAG-OK VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "N" TO WS-FLAG(1).
           MOVE "N" TO WS-FLAG(2).
           MOVE "N" TO WS-FLAG(3).
           SET WS-FLAG-OK(2) TO TRUE.
           DISPLAY "F1=" WS-FLAG(1) " F2=" WS-FLAG(2)
               " F3=" WS-FLAG(3).
           STOP RUN.
