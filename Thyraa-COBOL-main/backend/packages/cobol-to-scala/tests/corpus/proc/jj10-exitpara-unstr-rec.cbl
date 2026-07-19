      * jj10: combines round-29 finding 1's EXIT PARAGRAPH-inside-
      * RECURSIVE-nested-def fix (scala.util.boundary-based) with
      * UNSTRING's own ON OVERFLOW clause - a paragraph inside a
      * RECURSIVE program that conditionally EXITs PARAGRAPH partway
      * through (driven by a LINKAGE flag, so both the EXIT and the
      * normal fall-through path are exercised across the program's two
      * top-level calls), where the code both before and after the EXIT
      * includes an UNSTRING statement with ON OVERFLOW/NOT ON OVERFLOW
      * branches - probes whether the boundary-break early-exit still
      * leaves the SECOND UNSTRING (meant to be skipped on the EXIT
      * path) correctly un-executed, and whether normal fall-through (no
      * EXIT) still runs both UNSTRINGs.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9.
       01  WS-FLAG PIC 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 2 TO WS-START.
           MOVE 1 TO WS-FLAG.
           CALL "JJ10SUB" USING WS-START WS-FLAG.
           MOVE 2 TO WS-START.
           MOVE 0 TO WS-FLAG.
           CALL "JJ10SUB" USING WS-START WS-FLAG.
           STOP RUN.
       END PROGRAM JJ10MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ10SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9.
       01  WS-SRC PIC X(9) VALUE "AA-BB-CC-".
       01  WS-T1 PIC X(4).
       01  WS-T2 PIC X(4).
       LINKAGE SECTION.
       01  LK-N PIC 9.
       01  LK-EXIT-FLAG PIC 9.
       PROCEDURE DIVISION USING LK-N LK-EXIT-FLAG.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LK-N " FLAG=" LK-EXIT-FLAG.
           IF LK-N = 0
               PERFORM BASE-PARA
           ELSE
               SUBTRACT 1 FROM LK-N GIVING WS-NEXT
               CALL "JJ10SUB" USING WS-NEXT LK-EXIT-FLAG
           END-IF.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       BASE-PARA.
           MOVE SPACES TO WS-T1.
           MOVE SPACES TO WS-T2.
           UNSTRING WS-SRC DELIMITED BY "-"
               INTO WS-T1 WS-T2
               ON OVERFLOW
                   DISPLAY "OVERFLOW-1"
               NOT ON OVERFLOW
                   DISPLAY "NO-OVERFLOW-1"
           END-UNSTRING.
           DISPLAY "T1=[" WS-T1 "] T2=[" WS-T2 "]".
           IF LK-EXIT-FLAG = 1
               EXIT PARAGRAPH
           END-IF.
           MOVE SPACES TO WS-T1.
           MOVE SPACES TO WS-T2.
           UNSTRING WS-SRC DELIMITED BY "-"
               INTO WS-T1 WS-T2
               ON OVERFLOW
                   DISPLAY "OVERFLOW-2"
               NOT ON OVERFLOW
                   DISPLAY "NO-OVERFLOW-2"
           END-UNSTRING.
           DISPLAY "T1B=[" WS-T1 "] T2B=[" WS-T2 "]".
       END PROGRAM JJ10SUB.
