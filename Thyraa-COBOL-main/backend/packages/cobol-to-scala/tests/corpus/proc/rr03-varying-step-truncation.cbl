      * rr03: PERFORM VARYING stores the stepped index with normal
      * arithmetic-store truncation to its PICTURE (PIC 9 wraps 9 -> 0),
      * so an UNTIL above the PIC range never fires; WC is a safety
      * counter that stops every loop deterministically. Covers inline
      * and out-of-line forms, negative BY, signed, decimal, TEST AFTER
      * and AFTER inner indices.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. RR03.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I   PIC 9.
       01  WS-J   PIC 9.
       01  WS-S   PIC S9.
       01  WS-D   PIC 9V9.
       01  WS-C   PIC 99 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "T1".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-I FROM 8 BY 1 UNTIL WS-I > 12
              ADD 1 TO WS-C
              DISPLAY "I=" WS-I
              IF WS-C > 6 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T1 END I=" WS-I " C=" WS-C.
           DISPLAY "T2".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-I FROM 8 BY 3 UNTIL WS-I > 12
              ADD 1 TO WS-C
              DISPLAY "I=" WS-I
              IF WS-C > 6 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T2 END I=" WS-I " C=" WS-C.
           DISPLAY "T3".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-I FROM 3 BY -2 UNTIL WS-I < 0
              ADD 1 TO WS-C
              DISPLAY "I=" WS-I
              IF WS-C > 6 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T3 END I=" WS-I " C=" WS-C.
           DISPLAY "T4".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-S FROM 7 BY 1 UNTIL WS-S > 9
              ADD 1 TO WS-C
              DISPLAY "S=" WS-S
              IF WS-C > 6 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T4 END S=" WS-S " C=" WS-C.
           DISPLAY "T5".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-S FROM -7 BY -1 UNTIL WS-S < -9
              ADD 1 TO WS-C
              DISPLAY "S=" WS-S
              IF WS-C > 6 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T5 END S=" WS-S " C=" WS-C.
           DISPLAY "T6".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-D FROM 8.5 BY 0.7 UNTIL WS-D > 12
              ADD 1 TO WS-C
              DISPLAY "D=" WS-D
              IF WS-C > 6 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T6 END D=" WS-D " C=" WS-C.
           DISPLAY "T7".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-D FROM 0.5 BY 0.25 UNTIL WS-D > 1.2
              ADD 1 TO WS-C
              DISPLAY "D=" WS-D
              IF WS-C > 6 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T7 END D=" WS-D " C=" WS-C.
           DISPLAY "T8 AFTER".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 2
              AFTER WS-J FROM 8 BY 1 UNTIL WS-J > 10
              ADD 1 TO WS-C
              DISPLAY "I=" WS-I " J=" WS-J
              IF WS-C > 8 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T8 END I=" WS-I " J=" WS-J " C=" WS-C.
           DISPLAY "T9 TEST AFTER".
           MOVE 0 TO WS-C.
           PERFORM WITH TEST AFTER
              VARYING WS-I FROM 8 BY 1 UNTIL WS-I > 12
              ADD 1 TO WS-C
              DISPLAY "I=" WS-I
              IF WS-C > 5 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T9 END I=" WS-I " C=" WS-C.
           DISPLAY "T10 BY VARIABLE".
           MOVE 0 TO WS-C.
           MOVE 4 TO WS-J.
           PERFORM VARYING WS-I FROM 5 BY WS-J UNTIL WS-I > 12
              ADD 1 TO WS-C
              DISPLAY "I=" WS-I
              IF WS-C > 5 THEN EXIT PERFORM END-IF
           END-PERFORM.
           DISPLAY "T10 END I=" WS-I " C=" WS-C.
           DISPLAY "T11 OUT-OF-LINE".
           MOVE 0 TO WS-C.
           PERFORM BODY-PARA VARYING WS-I FROM 7 BY 2
              UNTIL WS-I > 11 OR WS-C > 5.
           DISPLAY "T11 END I=" WS-I " C=" WS-C.
           DISPLAY "T12 NORMAL".
           MOVE 0 TO WS-C.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
              ADD 1 TO WS-C
              DISPLAY "I=" WS-I
           END-PERFORM.
           DISPLAY "T12 END I=" WS-I " C=" WS-C.
           STOP RUN.
       BODY-PARA.
           ADD 1 TO WS-C.
           DISPLAY "I=" WS-I.
