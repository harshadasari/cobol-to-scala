      * ee01: a group-level VALUE clause spanning a COMP-1 (float) child -
      * does cobc byte-reinterpret the VALUE text's own bytes as the
      * child's native 4-byte float storage (the same convention already
      * verified for COMP-3/BINARY children, round-9/15), and does this
      * engine's defaultElementaryValueWithInheritance correctly handle it
      * (isNonDisplay check currently omits COMP-1/COMP-2 entirely)?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE01GRPVALCOMP1.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP VALUE "AB1234CD".
           05  WS-PREFIX   PIC XX.
           05  WS-FLOAT    COMP-1.
           05  WS-SUFFIX   PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "PREFIX=" WS-PREFIX.
           DISPLAY "FLOAT=" WS-FLOAT.
           DISPLAY "SUFFIX=" WS-SUFFIX.
           STOP RUN.
