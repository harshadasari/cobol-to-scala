      * ee13: ALTER <para> TO PROCEED TO <para> - a genuinely different
      * candidate for the "feature collides with parser" question than
      * the RECURSIVE-nesting bug class (ALTER isn't recognized by this
      * parser/generator AT ALL - no 'ALTER' token anywhere in
      * parser/*.js or generator/*.js) - probes whether an entirely
      * unrecognized verb corrupts the surrounding parse (like round-21's
      * GO TO OF SECTION bug did before its own fix) or degrades cleanly.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE13ALTER.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-ALTER".
           ALTER JUMP-PARA TO PROCEED TO TARGET-TWO.
           PERFORM JUMP-PARA.
           DISPLAY "AFTER-PERFORM".
           STOP RUN.
       JUMP-PARA.
           GO TO TARGET-ONE.
       TARGET-ONE.
           DISPLAY "IN-TARGET-ONE".
       TARGET-TWO.
           DISPLAY "IN-TARGET-TWO".
