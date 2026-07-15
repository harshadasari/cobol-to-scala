      * ee02: a group-level VALUE clause spanning a COMP-2 (double, 8-byte)
      * child - same byte-reinterpretation question as ee01, but for the
      * wider 8-byte double codec.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE02GRPVALCOMP2.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP VALUE "AB12345678CD".
           05  WS-PREFIX   PIC XX.
           05  WS-DBL      COMP-2.
           05  WS-SUFFIX   PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "PREFIX=" WS-PREFIX.
           DISPLAY "DBL=" WS-DBL.
           DISPLAY "SUFFIX=" WS-SUFFIX.
           STOP RUN.
