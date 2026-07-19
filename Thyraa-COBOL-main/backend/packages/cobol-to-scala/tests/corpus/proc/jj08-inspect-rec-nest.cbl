      * jj08: probes INSPECT TALLYING/REPLACING when it lives inside an
      * EVALUATE branch, itself inside a RECURSIVE program's nested-def
      * base-case paragraph (same deep-nesting shape as jj06/jj07,
      * different feature not previously combined with RECURSIVE).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ08MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "JJ08SUB" USING WS-START.
           STOP RUN.
       END PROGRAM JJ08MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ08SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9.
       01  WS-TXT PIC X(12) VALUE "AABBAABBAABB".
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
                       INSPECT WS-TXT TALLYING WS-TALLY FOR ALL "AA"
                       DISPLAY "TALLY=" WS-TALLY
                       INSPECT WS-TXT REPLACING ALL "AA" BY "XY"
                       DISPLAY "TXT=[" WS-TXT "]"
                   WHEN OTHER
                       SUBTRACT 1 FROM LK-N GIVING WS-NEXT
                       CALL "JJ08SUB" USING WS-NEXT
               END-EVALUATE
           END-PERFORM.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       END PROGRAM JJ08SUB.
