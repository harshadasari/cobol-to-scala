       IDENTIFICATION DIVISION.
       PROGRAM-ID. FIG01.
      *
      * Round-4 attack: MOVE HIGH-VALUES/LOW-VALUES to an alphanumeric
      * field and comparisons against those figurative constants, plus
      * MOVE ZEROES/ZEROS into numeric-EDITED fields (zero-suppressed
      * and floating-currency pictures).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-HV               PIC X(5).
       01  WS-LV               PIC X(5).
       01  WS-PLAIN            PIC X(5) VALUE 'ABCDE'.
       01  WS-EDITED           PIC ZZ,ZZ9.99.
       01  WS-EDITED2          PIC $$$,$$9.99-.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE HIGH-VALUES TO WS-HV
           MOVE LOW-VALUES TO WS-LV
      *
           IF WS-HV = HIGH-VALUES
               DISPLAY 'HV-EQ-HIGH=TRUE'
           ELSE
               DISPLAY 'HV-EQ-HIGH=FALSE'
           END-IF
      *
           IF WS-PLAIN < HIGH-VALUES
               DISPLAY 'PLAIN-LT-HIGH=TRUE'
           ELSE
               DISPLAY 'PLAIN-LT-HIGH=FALSE'
           END-IF
      *
           IF WS-LV = LOW-VALUES
               DISPLAY 'LV-EQ-LOW=TRUE'
           ELSE
               DISPLAY 'LV-EQ-LOW=FALSE'
           END-IF
      *
           IF WS-PLAIN > LOW-VALUES
               DISPLAY 'PLAIN-GT-LOW=TRUE'
           ELSE
               DISPLAY 'PLAIN-GT-LOW=FALSE'
           END-IF
      *
           IF HIGH-VALUES > LOW-VALUES
               DISPLAY 'HIGH-GT-LOW=TRUE'
           ELSE
               DISPLAY 'HIGH-GT-LOW=FALSE'
           END-IF
      *
           MOVE ZEROES TO WS-EDITED
           DISPLAY 'EDITED-ZEROES=' WS-EDITED
      *
           MOVE ZEROS TO WS-EDITED2
           DISPLAY 'EDITED2-ZEROS=' WS-EDITED2
      *
           STOP RUN.
