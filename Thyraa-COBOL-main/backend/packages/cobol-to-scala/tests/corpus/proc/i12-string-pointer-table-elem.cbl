       IDENTIFICATION DIVISION.
       PROGRAM-ID. I12STRPTRTAB.
      *
      * Adversarial (round 20): STRING ... WITH POINTER where the
      * pointer operand is itself a SUBSCRIPTED TABLE ELEMENT
      * (WS-PTRS(2)), not a plain scalar - checks that the pointer
      * read/writeback goes through the SAME subscripted element on
      * both sides, and that the other rows of the table are left
      * completely untouched.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-OUT PIC X(20) VALUE SPACES.
       01  WS-PTRS PIC 9(2) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1 TO WS-PTRS(1).
           MOVE 5 TO WS-PTRS(2).
           MOVE 1 TO WS-PTRS(3).
           STRING "AB" DELIMITED BY SIZE
                  "CD" DELIMITED BY SIZE
                  INTO WS-OUT
                  WITH POINTER WS-PTRS(2).
           DISPLAY "OUT=[" WS-OUT "]".
           DISPLAY "P1=" WS-PTRS(1).
           DISPLAY "P2=" WS-PTRS(2).
           DISPLAY "P3=" WS-PTRS(3).
           STOP RUN.
