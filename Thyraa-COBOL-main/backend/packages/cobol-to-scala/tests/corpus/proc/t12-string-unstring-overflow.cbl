       IDENTIFICATION DIVISION.
       PROGRAM-ID. T12OVERFLOW.
      * Round-6 attack: STRING ... ON OVERFLOW (target too small to
      * hold all concatenated segments) and UNSTRING ... ON OVERFLOW
      * (more delimited fields than receiving targets) - neither
      * OVERFLOW clause is exercised by any prior corpus program (all
      * prior STRING/UNSTRING programs use targets sized to fit).
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SMALL-TARGET     PIC X(6).
       01  WS-SRC1             PIC X(5) VALUE "HELLO".
       01  WS-SRC2             PIC X(5) VALUE "WORLD".
       01  WS-UNSTR-SRC        PIC X(20) VALUE "AA,BB,CC,DD,EE".
       01  WS-U1               PIC X(4).
       01  WS-U2               PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE SPACES TO WS-SMALL-TARGET.
           STRING WS-SRC1 DELIMITED BY SIZE
                  WS-SRC2 DELIMITED BY SIZE
                  INTO WS-SMALL-TARGET
               ON OVERFLOW
                   DISPLAY "STRING-OVERFLOWED"
               NOT ON OVERFLOW
                   DISPLAY "STRING-FIT-OK"
           END-STRING.
           DISPLAY "TARGET=[" WS-SMALL-TARGET "]".

           UNSTRING WS-UNSTR-SRC DELIMITED BY ","
               INTO WS-U1 WS-U2
               ON OVERFLOW
                   DISPLAY "UNSTRING-OVERFLOWED"
               NOT ON OVERFLOW
                   DISPLAY "UNSTRING-FIT-OK"
           END-UNSTRING.
           DISPLAY "U1=[" WS-U1 "]".
           DISPLAY "U2=[" WS-U2 "]".
           STOP RUN.
