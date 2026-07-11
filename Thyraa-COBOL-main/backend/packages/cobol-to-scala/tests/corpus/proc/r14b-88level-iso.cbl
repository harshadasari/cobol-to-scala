       IDENTIFICATION DIVISION.
       PROGRAM-ID. R14B88LV.
      *
      * Isolation follow-up for r14: 88-level condition-name only
      * (SET ... TO TRUE, tested by plain IF and by EVALUATE TRUE),
      * with the SEARCH-in-loop and edited-field-move attack surfaces
      * removed, to confirm the 88-level handling alone is what broke
      * r14's compile.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS           PIC X(1) VALUE 'A'.
           88  WS-STATUS-ACTIVE    VALUE 'A'.
           88  WS-STATUS-CLOSED    VALUE 'C'.
       PROCEDURE DIVISION.
       0000-MAIN.
           SET WS-STATUS-ACTIVE TO TRUE
           IF WS-STATUS-ACTIVE
               DISPLAY 'IF-CHECK=ACTIVE'
           ELSE
               DISPLAY 'IF-CHECK=NOT-ACTIVE'
           END-IF
           EVALUATE TRUE
               WHEN WS-STATUS-ACTIVE
                   DISPLAY 'EVAL-CHECK=ACTIVE'
               WHEN WS-STATUS-CLOSED
                   DISPLAY 'EVAL-CHECK=CLOSED'
               WHEN OTHER
                   DISPLAY 'EVAL-CHECK=UNKNOWN'
           END-EVALUATE
      *
           SET WS-STATUS-CLOSED TO TRUE
           IF WS-STATUS-CLOSED
               DISPLAY 'IF-CHECK-2=CLOSED'
           ELSE
               DISPLAY 'IF-CHECK-2=NOT-CLOSED'
           END-IF
           STOP RUN.
