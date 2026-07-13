      * Adversarial (round 21): INITIALIZE ... REPLACING (not bare
      * INITIALIZE) on a group that has BOTH an OCCURS table AND a
      * sibling 01-level REDEFINES over the whole thing. z03 tests
      * INITIALIZE REPLACING on a SUBSCRIPTED table element (no
      * REDEFINES anywhere); z04 tests bare INITIALIZE (no REPLACING at
      * all) on an ODO-bearing group. This combines REPLACING with
      * BOTH an (fixed-size) OCCURS table AND a REDEFINES alias in the
      * SAME INITIALIZE target, then reads the result back through the
      * REDEFINES alias too, to check the replacement is visible no
      * matter which alias observes the underlying bytes.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J08INITREPLREDEF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 2 TIMES.
               10  WS-NAME  PIC X(4) VALUE "XXXX".
               10  WS-AMT   PIC 9(3) VALUE 999.
       01  WS-TABLE-R REDEFINES WS-TABLE.
           05  WS-RAW PIC X(14).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAA" TO WS-NAME(1). MOVE 111 TO WS-AMT(1).
           MOVE "BBBB" TO WS-NAME(2). MOVE 222 TO WS-AMT(2).
           DISPLAY "RAW-BEFORE=[" WS-RAW "]".

           INITIALIZE WS-TABLE
               REPLACING ALPHANUMERIC DATA BY "Z"
                         NUMERIC DATA BY 7.

           DISPLAY "E1=" WS-NAME(1) "/" WS-AMT(1).
           DISPLAY "E2=" WS-NAME(2) "/" WS-AMT(2).
           DISPLAY "RAW-AFTER=[" WS-RAW "]".
           STOP RUN.
