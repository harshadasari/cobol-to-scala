      * nn11 (round 38): PERFORM ... THRU nested THREE levels deep, all
      * physically consecutive (round-20's i10 only goes two levels deep -
      * outer B..C containing one inner D..E PERFORM). Here PARA-A performs
      * PARA-B THRU PARA-F; PARA-B (first paragraph of that range) performs
      * a nested PARA-C THRU PARA-E; PARA-C (first paragraph of THAT range)
      * performs a further-nested PARA-D THRU PARA-D (a single-paragraph
      * "range"). Expect heavy multiple-execution via ordinary fallthrough
      * once each inner PERFORM returns, at every level - a genuinely
      * tricky triple-nested cascade no prior corpus program's THRU
      * nesting goes this deep.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN11THRU3.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-D-COUNT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       PARA-A.
           DISPLAY "IN-A-BEFORE".
           PERFORM PARA-B THRU PARA-F.
           DISPLAY "IN-A-AFTER".
           STOP RUN.
       PARA-B.
           DISPLAY "IN-B".
           PERFORM PARA-C THRU PARA-E.
       PARA-C.
           DISPLAY "IN-C".
           PERFORM PARA-D THRU PARA-D.
       PARA-D.
           DISPLAY "IN-D".
           ADD 1 TO WS-D-COUNT.
           DISPLAY "D-COUNT=" WS-D-COUNT.
       PARA-E.
           DISPLAY "IN-E".
       PARA-F.
           DISPLAY "IN-F".
