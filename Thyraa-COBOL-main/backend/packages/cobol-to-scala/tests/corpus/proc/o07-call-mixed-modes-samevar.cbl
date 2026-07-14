      * Adversarial (round 25): round-24 finding 3 (m10) documented a gap
      * for `CALL ... USING WS-X, WS-X` (the SAME variable passed BY
      * REFERENCE twice) - real cobc aliases both formal parameters to the
      * same storage. This checks the SAME caller variable passed through
      * TWO DIFFERENT call modes in one CALL - `USING WS-X, BY CONTENT
      * WS-X` - where the second occurrence should NOT alias the first
      * (BY CONTENT always passes a private copy), unlike m10's own
      * BY-REFERENCE/BY-REFERENCE case. Checks whether the engine's
      * `duplicateByReferenceCallArgNames` honest-decline detector (gated
      * specifically on BY REFERENCE duplicates) correctly stays silent
      * here (since only ONE of the two occurrences is actually BY
      * REFERENCE) rather than spuriously flagging a shape that doesn't
      * actually alias in real cobc, or missing a case that needs the
      * decline.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O07MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9(4) VALUE 100.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "O07SUB" USING WS-X, BY CONTENT WS-X.
           DISPLAY "MAIN X=" WS-X.
           STOP RUN.
       END PROGRAM O07MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. O07SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B.
       MAIN-PARA.
           DISPLAY "ENTER A=" LK-A " B=" LK-B.
           ADD 500 TO LK-A.
           DISPLAY "AFTER-ADD A=" LK-A " B=" LK-B.
           MOVE 999 TO LK-B.
           DISPLAY "AFTER-MOVE A=" LK-A " B=" LK-B.
           GOBACK.
       END PROGRAM O07SUB.
