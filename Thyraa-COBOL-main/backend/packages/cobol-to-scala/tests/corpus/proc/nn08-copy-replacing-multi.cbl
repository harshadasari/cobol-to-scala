      * nn08 (round 38): COPY REPLACING with TWO simultaneous pseudo-text
      * pairs in the SAME COPY statement (every prior REPLACING corpus
      * program - u09/i04/k03/l03/hh06/cc12 - uses exactly ONE pair) - also
      * checks that the two replacements are applied in a single left-to-
      * right scan rather than iteratively (the second pair's own BY-text
      * happens to contain digits that would look like a match for the
      * first pair's operand if replacement were naively re-scanned after
      * the first substitution).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN08COPY.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY NN08CPY REPLACING ==:PFX:== BY ==CUST==
                              ==:DEFVAL:== BY =="PFX-DEFAULT"==.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "ID=" CUST-ID " NAME=[" CUST-NAME "]".
           MOVE 42 TO CUST-ID.
           DISPLAY "ID=" CUST-ID " NAME=[" CUST-NAME "]".
           STOP RUN.
