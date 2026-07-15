      * dd04: INSPECT and STRING, executed in a helper paragraph on a
      * WORKING-STORAGE buffer, whose RESULT is then written into the
      * RECURSIVE program's own LINKAGE-aliased scalar parameter from
      * INSIDE that helper paragraph - reached via an ORDINARY
      * out-of-line PERFORM (call/return, not THRU) from the program's
      * own nested-def MAIN-PARA. Probes whether an ordinary (non-THRU)
      * out-of-line PERFORM's own nested-def call correctly closes over
      * the CURRENT activation's own getter/setter closure when the
      * write happens INSIDE a textually-distinct callee paragraph, not
      * the caller itself (every prior scalar RECURSIVE-writeback probe
      * - l12, m04 - writes directly in the SAME paragraph as the CALL).
      * (Note: an earlier version of this probe had STRING write
      * DIRECTLY into a LINKAGE-SECTION alphanumeric parameter inside a
      * RECURSIVE program - confirmed, via a minimal standalone repro,
      * to crash installed GnuCOBOL itself with SIGSEGV, a toolchain
      * limitation unrelated to this engine; STRING's target here is
      * ordinary WORKING-STORAGE instead, sidestepping that crash while
      * still exercising the cross-paragraph LINKAGE-write closure scope.)
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD04MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-N   PIC 9(2) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "DD04SUB" USING WS-START-N.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD04SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TAG       PIC X(10).
       01  WS-COUNT     PIC 9(2) VALUE 0.
       LINKAGE SECTION.
       01  LS-N         PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           PERFORM BUILD-TAG-PARA.
           PERFORM COUNT-AND-WRITE-PARA.
           IF LS-N > 1
               SUBTRACT 1 FROM LS-N
               CALL "DD04SUB" USING LS-N
           END-IF.
           DISPLAY "EXIT N=" LS-N " TAG=[" WS-TAG "]".
           GOBACK.
       BUILD-TAG-PARA.
           MOVE SPACES TO WS-TAG.
           STRING "N=" DELIMITED BY SIZE
                  LS-N DELIMITED BY SIZE
                  "-XX" DELIMITED BY SIZE
                  INTO WS-TAG.
       COUNT-AND-WRITE-PARA.
           MOVE 0 TO WS-COUNT.
           INSPECT WS-TAG TALLYING WS-COUNT FOR ALL "X".
           ADD WS-COUNT TO LS-N.
           SUBTRACT WS-COUNT FROM LS-N.
       END PROGRAM DD04SUB.
       END PROGRAM DD04MAIN.
