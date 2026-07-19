      * ll12 (round 36): pressure-test on round-35 finding 4 (kk09)'s fix
      * for SEARCH ALL over an OCCURS-bearing GROUP child nested under a
      * REDEFINES - kk09's own two SEARCH ALL statements were both directly
      * in the main paragraph, unconditionally executed once each. Here the
      * IDENTICAL REDEFINES/table shape is instead SEARCHed from INSIDE a
      * PERFORM VARYING loop (three iterations, a different target key each
      * time) - does the SEARCH ALL still degrade the SAME honest way (or
      * crash) once it's nested inside a loop body rather than a flat
      * paragraph?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL12SEARCHREDEFLOOP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FLAT PIC X(20) VALUE "01A02B03C04D05E".
       01  WS-VIEW REDEFINES WS-FLAT.
           05  WS-ENTRY OCCURS 5 TIMES
               ASCENDING KEY IS WS-KEY
               INDEXED BY WS-IDX.
               10  WS-KEY  PIC 9(2).
               10  WS-TAG  PIC X(1).
       01  WS-SEARCH-KEY PIC 9(2).
       01  WS-LOOP       PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-LOOP FROM 1 BY 1 UNTIL WS-LOOP > 3
               EVALUATE WS-LOOP
                   WHEN 1
                       MOVE 1 TO WS-SEARCH-KEY
                   WHEN 2
                       MOVE 3 TO WS-SEARCH-KEY
                   WHEN 3
                       MOVE 9 TO WS-SEARCH-KEY
               END-EVALUATE
               SET WS-IDX TO 1
               SEARCH ALL WS-ENTRY
                   AT END
                       DISPLAY "LOOP=" WS-LOOP " NOTFOUND KEY="
                           WS-SEARCH-KEY
                   WHEN WS-KEY(WS-IDX) = WS-SEARCH-KEY
                       DISPLAY "LOOP=" WS-LOOP " FOUND TAG="
                           WS-TAG(WS-IDX) " AT IDX=" WS-IDX
               END-SEARCH
           END-PERFORM.
           STOP RUN.
