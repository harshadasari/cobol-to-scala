      * dd13: `PERFORM x OF SEC-A THRU y OF SEC-B` - a qualified THRU
      * range whose START and END paragraphs live in TWO DIFFERENT
      * sections (round-25 finding 3/o13 only ever tested a THRU range
      * whose start AND end are both in the SAME section) - inside a
      * RECURSIVE program's own nested-paragraph convention. Also
      * places an ORDINARY (non-THRU, unqualified) paragraph physically
      * between the two THRU endpoints in a THIRD section, to confirm
      * the THRU range's own nested nested-def duplication doesn't
      * accidentally skip over or duplicate that unrelated paragraph.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD13MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-N   PIC 9(2) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "DD13SUB" USING WS-START-N.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD13SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-N    PIC 9(2).
       LINKAGE SECTION.
       01  LS-N         PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           PERFORM 1000-START OF SEC-A THRU 2000-END OF SEC-B.
           IF LS-N > 0
               SUBTRACT 1 FROM LS-N
               COMPUTE WS-NEXT-N = LS-N
               CALL "DD13SUB" USING WS-NEXT-N
               ADD 1 TO LS-N
           END-IF.
           DISPLAY "EXIT N=" LS-N.
           GOBACK.
       SEC-A SECTION.
       1000-START.
           DISPLAY "SEC-A-1000 N=" LS-N.
       SEC-MID SECTION.
       1500-MIDDLE.
           DISPLAY "SEC-MID-1500 N=" LS-N.
       SEC-B SECTION.
       2000-END.
           DISPLAY "SEC-B-2000 N=" LS-N.
       END PROGRAM DD13SUB.
       END PROGRAM DD13MAIN.
