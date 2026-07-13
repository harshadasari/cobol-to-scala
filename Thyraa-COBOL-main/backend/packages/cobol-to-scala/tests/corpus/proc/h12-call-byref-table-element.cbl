       IDENTIFICATION DIVISION.
       PROGRAM-ID. H12CBRMAIN.
      *
      * Adversarial (round 19): CALL ... USING BY REFERENCE of a SINGLE
      * SUBSCRIPTED ELEMENT of an OCCURS table (WS-TABLE(2)), not the
      * whole table/group. Round-13 finding 1/round-17 finding 5's
      * known gap is specifically about a GROUP CONTAINING an OCCURS
      * table passed whole - a single already-subscripted table element
      * is an ordinary SCALAR argument (no group-with-OCCURS marshalling
      * involved at all). Checks whether the callee's mutation of that
      * one element is correctly written back into the caller's table
      * at the SAME subscripted position (not the whole table, not
      * position 1 always).
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-VAL PIC X(5) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAAA" TO WS-VAL(1).
           MOVE "BBBBB" TO WS-VAL(2).
           MOVE "CCCCC" TO WS-VAL(3).
           CALL "H12CBRSUB" USING BY REFERENCE WS-VAL(2).
           DISPLAY "ROW1=" WS-VAL(1).
           DISPLAY "ROW2=" WS-VAL(2).
           DISPLAY "ROW3=" WS-VAL(3).
           STOP RUN.
       END PROGRAM H12CBRMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. H12CBRSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-VAL PIC X(5).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-PARA.
           DISPLAY "SUB-SAW=" LK-VAL.
           MOVE "ZZZZZ" TO LK-VAL.
       END PROGRAM H12CBRSUB.
