      * Adversarial (round 23): extends l06's two-index triangular
      * PERFORM ... VARYING ... AFTER to THREE nested indices (VARYING
      * ... AFTER ... AFTER ...), each inner UNTIL bound depending on
      * the CURRENT value of the index one level up (WS-J's own limit
      * depends on WS-I, WS-K's own limit depends on WS-J) - a doubly-
      * staggered ("triangular-inside-triangular") iteration space no
      * prior corpus program exercises (existing multi-AFTER PERFORM
      * programs all use fixed, mutually-independent inner bounds).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L13PERFTRIPLE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-I PIC 9.
       01 WS-J PIC 9.
       01 WS-K PIC 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               AFTER WS-J FROM 1 BY 1 UNTIL WS-J > WS-I
               AFTER WS-K FROM 1 BY 1 UNTIL WS-K > WS-J
                   DISPLAY "I=" WS-I " J=" WS-J " K=" WS-K
           END-PERFORM.
           DISPLAY "DONE I=" WS-I " J=" WS-J " K=" WS-K.
           STOP RUN.
