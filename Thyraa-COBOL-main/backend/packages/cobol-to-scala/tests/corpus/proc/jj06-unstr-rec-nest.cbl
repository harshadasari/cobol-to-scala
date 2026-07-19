      * jj06: the "feature vs RECURSIVE nesting" bug class (rounds 21-29)
      * has now been confirmed against PERFORM THRU, qualified GO TO,
      * SORT/MERGE, DECLARATIVES, EXIT SECTION and STRING's own ON
      * OVERFLOW (ii09). This probes UNSTRING's own ON OVERFLOW/TALLYING
      * clauses specifically when the UNSTRING statement itself lives
      * inside a RECURSIVE program's nested-def paragraph, itself
      * reached via an EVALUATE branch inside a PERFORM, inside the
      * RECURSIVE entry paragraph (deeper syntactic nesting than any
      * prior probe of this bug class).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ06MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "JJ06SUB" USING WS-START.
           STOP RUN.
       END PROGRAM JJ06MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ06SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9.
       01  WS-SRC PIC X(11) VALUE "AA-BB-CC-DD".
       01  WS-T1 PIC X(5).
       01  WS-T2 PIC X(5).
       01  WS-TALLY PIC 9(2) VALUE 0.
       01  WS-I PIC 9 VALUE 1.
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LK-N.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 1
               EVALUATE LK-N
                   WHEN 0
                       MOVE SPACES TO WS-T1
                       MOVE SPACES TO WS-T2
                       UNSTRING WS-SRC DELIMITED BY "-"
                           INTO WS-T1 WS-T2
                           TALLYING IN WS-TALLY
                           ON OVERFLOW
                               DISPLAY "OVERFLOW"
                           NOT ON OVERFLOW
                               DISPLAY "NO-OVERFLOW"
                       END-UNSTRING
                       DISPLAY "T1=[" WS-T1 "] T2=[" WS-T2 "]"
                       DISPLAY "TALLY=" WS-TALLY
                   WHEN OTHER
                       SUBTRACT 1 FROM LK-N GIVING WS-NEXT
                       CALL "JJ06SUB" USING WS-NEXT
               END-EVALUATE
           END-PERFORM.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       END PROGRAM JJ06SUB.
