      * ee10: two DIFFERENT sections, each declaring a paragraph with the
      * SAME bare name (COMMON-PARA), disambiguated via qualified PERFORM
      * ... OF <section> - all INSIDE a RECURSIVE program. Round-12/21
      * already made qualified PERFORM/GO TO route through the
      * collision-aware paragraphMethodName/resolveParagraphMethodName
      * resolver, and generateProgramFlowLinesNested (the RECURSIVE
      * nested-local-def convention) appears to reuse the exact same
      * resolver - this probes whether that reuse is actually correct
      * inside the RECURSIVE nested-def scope specifically, a shape no
      * prior round's 5 "feature vs RECURSIVE nesting" probes covered.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "EE10SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE10SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-SECTION SECTION.
       MAIN-START.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           PERFORM COMMON-PARA OF SECTION-ONE.
           PERFORM COMMON-PARA OF SECTION-TWO.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "EE10SUB" USING WS-NEXT-DEPTH
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       SECTION-ONE SECTION.
       COMMON-PARA.
           DISPLAY "IN-SECTION-ONE DEPTH=" LS-DEPTH.
       SECTION-TWO SECTION.
       COMMON-PARA.
           DISPLAY "IN-SECTION-TWO DEPTH=" LS-DEPTH.
       END PROGRAM EE10SUB.
       END PROGRAM EE10MAIN.
