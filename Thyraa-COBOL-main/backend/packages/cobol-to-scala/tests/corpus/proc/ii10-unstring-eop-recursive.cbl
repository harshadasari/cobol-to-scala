      * ii10: UNSTRING's own ON OVERFLOW/NOT ON OVERFLOW clause (round-6
      * finding 6, compiler-verified) has never been combined with
      * rounds-21-24's RECURSIVE nested-local-def paragraph convention -
      * the companion probe to ii09's STRING version. UNSTRING triggers
      * ON OVERFLOW when its DELIMITED-BY-split source has MORE fields
      * than the INTO clause has receiving items (verified against
      * installed GnuCOBOL: "A,B,C,D,E,F" split by "," into only two
      * receiving items correctly reports OVERFLOW). This probes that
      * same shape from inside a RECURSIVE program's own base-case
      * nested-def activation.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "II10SUB" USING WS-START.
           STOP RUN.
       END PROGRAM II10MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. II10SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9.
       01  WS-SRC PIC X(11) VALUE "A,B,C,D,E,F".
       01  WS-A PIC X(3).
       01  WS-B PIC X(3).
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LK-N.
           IF LK-N = 0
               UNSTRING WS-SRC DELIMITED BY ","
                   INTO WS-A, WS-B
                   ON OVERFLOW
                       DISPLAY "OVERFLOW"
                   NOT ON OVERFLOW
                       DISPLAY "NO-OVERFLOW"
               END-UNSTRING
               DISPLAY "A=[" WS-A "] B=[" WS-B "]"
           ELSE
               SUBTRACT 1 FROM LK-N GIVING WS-NEXT
               CALL "II10SUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       END PROGRAM II10SUB.
