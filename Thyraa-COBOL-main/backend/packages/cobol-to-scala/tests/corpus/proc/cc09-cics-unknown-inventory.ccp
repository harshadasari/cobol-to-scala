      * cc09: probes the roadmap's own CICS "coverage honesty" claim -
      * "Every CICS command the parser saw but didn't turn into a
      * method is still surfaced as a comment in an 'other CICS
      * commands observed' inventory - never silently dropped" - by
      * combining a command this parser explicitly models but doesn't
      * turn into its own method section (GETMAIN) with a command
      * this parser has NO opinion about at all (STARTBR/ENDBR file
      * browsing, and DELAY - neither is in cics-parser.js's own
      * KNOWN_COMMANDS set), to see whether the genuinely-unknown ones
      * still make it into the inventory (classified UNKNOWN) rather
      * than vanishing.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC09CICS.
       ENVIRONMENT DIVISION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-PTR             PIC S9(8) COMP.
       01  WS-RIDFLD          PIC 9(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           EXEC CICS READ FILE('CUSTFILE')
               INTO(WS-PTR)
               RIDFLD(WS-RIDFLD)
           END-EXEC.
           EXEC CICS GETMAIN LENGTH(100)
               SET(WS-PTR)
           END-EXEC.
           EXEC CICS STARTBR FILE('CUSTFILE')
               RIDFLD(WS-RIDFLD)
           END-EXEC.
           EXEC CICS READNEXT FILE('CUSTFILE')
               INTO(WS-PTR)
               RIDFLD(WS-RIDFLD)
           END-EXEC.
           EXEC CICS ENDBR FILE('CUSTFILE')
           END-EXEC.
           EXEC CICS DELAY INTERVAL(5)
           END-EXEC.
           EXEC CICS RETURN
           END-EXEC.
