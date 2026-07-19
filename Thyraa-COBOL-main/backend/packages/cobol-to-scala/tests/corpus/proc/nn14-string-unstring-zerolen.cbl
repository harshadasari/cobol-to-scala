      * nn14 (round 38): zero-length segment edge cases for STRING and
      * UNSTRING - (1) a STRING source segment that is DELIMITED BY SPACE
      * but whose FIRST character is already a space (so it contributes
      * ZERO characters to the target, not merely "a short segment"),
      * mixed with normal non-empty segments before/after; (2) UNSTRING
      * with a LEADING delimiter (producing an empty FIRST destination
      * field) and CONSECUTIVE delimiters (producing an empty MIDDLE
      * destination field), checking both the destination contents and
      * TALLYING IN count.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN14ZEROLEN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-BLANK PIC X(5) VALUE SPACES.
       01  WS-TARGET PIC X(20) VALUE SPACES.
       01  WS-PTR PIC 9(2) VALUE 1.
       01  WS-SRC PIC X(10) VALUE ",A,,B,".
       01  WS-A PIC X(5) VALUE "XXXXX".
       01  WS-B PIC X(5) VALUE "XXXXX".
       01  WS-C PIC X(5) VALUE "XXXXX".
       01  WS-D PIC X(5) VALUE "XXXXX".
       01  WS-E PIC X(5) VALUE "XXXXX".
       01  WS-CNT PIC 9 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING "AB" DELIMITED BY SIZE
                  WS-BLANK DELIMITED BY SPACE
                  "CD" DELIMITED BY SIZE
               INTO WS-TARGET
               WITH POINTER WS-PTR.
           DISPLAY "TARGET=[" WS-TARGET "] PTR=" WS-PTR.

           UNSTRING WS-SRC DELIMITED BY ","
               INTO WS-A WS-B WS-C WS-D WS-E
               TALLYING IN WS-CNT.
           DISPLAY "A=[" WS-A "] B=[" WS-B "] C=[" WS-C
               "] D=[" WS-D "] E=[" WS-E "] CNT=" WS-CNT.
           STOP RUN.
