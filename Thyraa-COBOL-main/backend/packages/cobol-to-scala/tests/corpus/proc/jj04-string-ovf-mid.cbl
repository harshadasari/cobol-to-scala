       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ04STROVF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TARGET PIC X(6).
       01  WS-PTR PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE SPACES TO WS-TARGET.
           MOVE 1 TO WS-PTR.
           STRING "ABC" DELIMITED BY SIZE
                  "DEFGHIJ" DELIMITED BY SIZE
                  "XYZ" DELIMITED BY SIZE
               INTO WS-TARGET
               WITH POINTER WS-PTR
               ON OVERFLOW
                   DISPLAY "OVERFLOW"
               NOT ON OVERFLOW
                   DISPLAY "NO-OVERFLOW"
           END-STRING.
           DISPLAY "TARGET=[" WS-TARGET "]".
           DISPLAY "PTR=" WS-PTR.
           STOP RUN.
