      * oo14 (round 39): fresh-territory probe - STRING with an INTO
      * target that is ITSELF a table (OCCURS) element, subscripted by a
      * variable (not a literal). Also exercises WITH POINTER against the
      * same subscripted target, and a second STRING into a DIFFERENT
      * element of the same table to confirm no cross-element bleed.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO14STRINGTBL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-IDX PIC 9 VALUE 1.
       01  WS-PTR PIC 9(2) VALUE 1.
       01  WS-TABLE.
           05  WS-ITEM OCCURS 3 TIMES PIC X(10) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING "AB" DELIMITED BY SIZE
                  "CD" DELIMITED BY SIZE
               INTO WS-ITEM(WS-IDX)
               WITH POINTER WS-PTR.
           DISPLAY "ITEM1=[" WS-ITEM(1) "] PTR=" WS-PTR.
           MOVE 2 TO WS-IDX.
           MOVE 1 TO WS-PTR.
           STRING "XYZ" DELIMITED BY SIZE
               INTO WS-ITEM(WS-IDX)
               WITH POINTER WS-PTR.
           DISPLAY "ITEM2=[" WS-ITEM(2) "] PTR=" WS-PTR.
           DISPLAY "ITEM1-STILL=[" WS-ITEM(1) "]".
           DISPLAY "ITEM3-UNTOUCHED=[" WS-ITEM(3) "]".
           STOP RUN.
