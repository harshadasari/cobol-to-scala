       IDENTIFICATION DIVISION.
       PROGRAM-ID. H14STR3AL.
      *
      * Adversarial (round 19): STRING with THREE segments, where the
      * DESTINATION is itself one of the subscripted table elements
      * used as a SOURCE segment elsewhere in the SAME STRING (three-
      * way self-referential aliasing) - round-18's g09 only tested a
      * ONE-segment aliasing case for STRING (its own note: "STRING's
      * own same-source-read-twice-different-target shape (unaffected,
      * not aliased)"). Real cobc's STRING evaluates every source
      * operand BEFORE any target write happens (unlike UNSTRING, which
      * g09 found writes live/incrementally) - this probes whether the
      * generator's own snapshot-based STRING model already matches
      * that (freezing all three sources up front) now that the target
      * itself is one of the same table's rows.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW PIC X(4) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO WS-ROW(1).
           MOVE "BB" TO WS-ROW(2).
           MOVE "CC" TO WS-ROW(3).
           STRING WS-ROW(1) DELIMITED BY SIZE
                  WS-ROW(2) DELIMITED BY SIZE
                  WS-ROW(3) DELIMITED BY SIZE
               INTO WS-ROW(2).
           DISPLAY "ROW1=[" WS-ROW(1) "]".
           DISPLAY "ROW2=[" WS-ROW(2) "]".
           DISPLAY "ROW3=[" WS-ROW(3) "]".
           STOP RUN.
       END PROGRAM H14STR3AL.
