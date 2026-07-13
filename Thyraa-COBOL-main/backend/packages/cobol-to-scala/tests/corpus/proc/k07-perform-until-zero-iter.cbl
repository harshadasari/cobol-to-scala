      * Adversarial (round 22): a plain PERFORM UNTIL (implicit WITH
      * TEST BEFORE) whose condition is ALREADY TRUE before the first
      * iteration - the body must run ZERO times. Contrasted directly,
      * same shape, with PERFORM WITH TEST AFTER UNTIL starting from the
      * identical already-true condition - TEST AFTER's own semantics
      * mandate at least ONE iteration regardless. No prior corpus
      * program isolates this exact before-vs-after zero/one-iteration
      * contrast starting from an already-true condition (y15/r07 etc.
      * exercise TEST AFTER's timing but not this specific zero-vs-one
      * starting-condition edge).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K07ZEROITER.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9 VALUE 5.
       01 WS-M PIC 9 VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-LOOP-START".
           PERFORM UNTIL WS-N > 3
               DISPLAY "BEFORE-TICK N=" WS-N
               ADD 1 TO WS-N
           END-PERFORM.
           DISPLAY "AFTER-BEFORE-LOOP N=" WS-N.

           DISPLAY "AFTER-LOOP-START".
           PERFORM WITH TEST AFTER UNTIL WS-M > 3
               DISPLAY "AFTER-TICK M=" WS-M
               ADD 1 TO WS-M
           END-PERFORM.
           DISPLAY "AFTER-AFTER-LOOP M=" WS-M.
           STOP RUN.
