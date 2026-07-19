      * ll05 (round 36): fresh-territory probe - a single STRING statement
      * with THREE source phrases whose DELIMITED BY clauses are mixed:
      * DELIMITED BY SIZE (fixed-width copy of the whole sending field),
      * DELIMITED BY a DATA-NAME (a delimiter value stored in a variable,
      * not a literal), and DELIMITED BY SIZE again, all writing into the
      * SAME target with a WITH POINTER clause threading the position
      * across all three phrases.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FIRST   PIC X(5) VALUE "AB   ".
       01  WS-SECOND  PIC X(8) VALUE "CDEF#GHI".
       01  WS-DELIM   PIC X(1) VALUE "#".
       01  WS-THIRD   PIC X(4) VALUE "WXYZ".
       01  WS-TARGET  PIC X(30) VALUE SPACES.
       01  WS-PTR     PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING WS-FIRST DELIMITED BY SIZE
                  WS-SECOND DELIMITED BY WS-DELIM
                  WS-THIRD DELIMITED BY SIZE
                  INTO WS-TARGET
                  WITH POINTER WS-PTR
           END-STRING.
           DISPLAY "TARGET=[" WS-TARGET "]".
           DISPLAY "PTR=" WS-PTR.
           STOP RUN.
