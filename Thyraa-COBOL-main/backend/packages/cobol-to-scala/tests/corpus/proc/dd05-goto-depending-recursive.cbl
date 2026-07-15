      * dd05: GO TO ... DEPENDING ON, with multiple comma-separated
      * targets, landing on paragraphs INSIDE a RECURSIVE program's own
      * nested-def paragraph convention. Combines round-22 finding 2's
      * comma-list GO TO DEPENDING ON fix with round-21 finding 2's
      * RECURSIVE nested-def convention - a combination no prior round
      * exercised (k02's own DEPENDING ON test is not RECURSIVE; every
      * RECURSIVE corpus program's own GO TO usage, if any, is not
      * DEPENDING ON with multiple targets).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD05MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-N   PIC 9(2) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "DD05SUB" USING WS-START-N.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD05SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-N    PIC 9(2).
       01  WS-SEL       PIC 9(2).
       LINKAGE SECTION.
       01  LS-N         PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           COMPUTE WS-SEL = LS-N + 1.
           GO TO PATH-ZERO, PATH-ONE, PATH-TWO DEPENDING ON WS-SEL.
           DISPLAY "SHOULD-NEVER-PRINT N=" LS-N.
       PATH-ZERO.
           DISPLAY "PATH-ZERO N=" LS-N.
           GO TO WRAP-UP.
       PATH-ONE.
           DISPLAY "PATH-ONE N=" LS-N.
           GO TO WRAP-UP.
       PATH-TWO.
           DISPLAY "PATH-TWO N=" LS-N.
           SUBTRACT 1 FROM LS-N.
           COMPUTE WS-NEXT-N = LS-N.
           CALL "DD05SUB" USING WS-NEXT-N.
           ADD 1 TO LS-N.
       WRAP-UP.
           DISPLAY "EXIT N=" LS-N.
           GOBACK.
       END PROGRAM DD05SUB.
       END PROGRAM DD05MAIN.
