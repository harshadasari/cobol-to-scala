       IDENTIFICATION DIVISION.
       PROGRAM-ID. H08NEGSUB.
      *
      * Adversarial (round 19): a genuinely NEGATIVE, LITERAL (not
      * placeholder-derived) subscript accessing a table
      * (WS-VAL(WS-NEG) where WS-NEG is a signed numeric field VALUE
      * -1). Round-18 finding 8 (g03) added a defensive `.max(0)` clamp
      * to every DYNAMIC subscript index specifically to stop a
      * round-17 ref-mod placeholder's derived 0-subscript from
      * crashing - but that repro's "negative" case was really COBOL
      * subscript 0 (Scala index -1), never a genuinely negative COBOL
      * subscript computed from ordinary (non-ref-mod, non-placeholder)
      * arithmetic. This probes real cobc's own behavior for a WS field
      * legitimately holding -1 used as a subscript, and whether the
      * `.max(0)` guard now silently produces a DIFFERENT (but still
      * wrong, still clamped-to-index-0) value than cobc's own runtime
      * behavior for that same input, since cobc has no SSRANGE
      * checking by default either.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEG              PIC S9(2) VALUE -1.
       01  WS-VAL-TABLE.
           05  WS-VAL          PIC X(3) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-VAL(1).
           MOVE "BBB" TO WS-VAL(2).
           MOVE "CCC" TO WS-VAL(3).
           DISPLAY "NEG=" WS-VAL(WS-NEG).
           STOP RUN.
       END PROGRAM H08NEGSUB.
