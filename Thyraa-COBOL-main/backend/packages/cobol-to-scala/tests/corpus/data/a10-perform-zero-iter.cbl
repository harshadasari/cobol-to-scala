       IDENTIFICATION DIVISION.
       PROGRAM-ID. A10PERF.
      *
      * Adversarial: PERFORM VARYING with the UNTIL condition already
      * true before the first iteration (should run zero times, per
      * COBOL's test-before semantics), nested IF/EVALUATE with
      * 88-level condition names.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I                PIC 9(3) VALUE 10.
       01  WS-COUNT            PIC 9(3) VALUE 0.
       01  WS-STATUS-CODE      PIC 9(2) VALUE 5.
           88  WS-STATUS-OK           VALUE 1.
           88  WS-STATUS-WARN         VALUE 2 THRU 4.
           88  WS-STATUS-ERROR        VALUE 5 THRU 9.
       01  WS-FLAG             PIC X VALUE 'Y'.
           88  WS-FLAG-YES            VALUE 'Y'.
           88  WS-FLAG-NO             VALUE 'N'.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM VARYING WS-I FROM 10 BY 1 UNTIL WS-I > 5
               ADD 1 TO WS-COUNT
           END-PERFORM
           DISPLAY 'ZERO-ITER-COUNT=' WS-COUNT
           DISPLAY 'I-AFTER=' WS-I

           IF WS-STATUS-ERROR
               IF WS-FLAG-YES
                   DISPLAY 'NESTED-ERROR-YES'
               ELSE
                   DISPLAY 'NESTED-ERROR-NO'
               END-IF
           ELSE
               DISPLAY 'NESTED-NOT-ERROR'
           END-IF

           EVALUATE TRUE
               WHEN WS-STATUS-OK
                   DISPLAY 'EVAL-OK'
               WHEN WS-STATUS-WARN
                   DISPLAY 'EVAL-WARN'
               WHEN WS-STATUS-ERROR
                   DISPLAY 'EVAL-ERROR'
               WHEN OTHER
                   DISPLAY 'EVAL-OTHER'
           END-EVALUATE

           STOP RUN.
