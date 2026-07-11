       IDENTIFICATION DIVISION.
       PROGRAM-ID. S05REDMOVE.
      * Round-5 attack: MOVE between two REDEFINES views that are
      * DIFFERENT 01-level records occupying the same storage - not
      * just a nested-group REDEFINES read (n06) but an explicit MOVE
      * that writes through one record's own child field and expects
      * the sibling record (REDEFINES of the first) to observe the
      * change through its own differently-named/shaped children.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  REC-A.
           05  A-FIELD-1       PIC X(4) VALUE "WXYZ".
           05  A-FIELD-2       PIC 9(4) VALUE 1234.
       01  REC-B REDEFINES REC-A.
           05  B-COMBINED      PIC X(8).
       01  WS-TARGET           PIC X(8) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "INITIAL B-COMBINED=" B-COMBINED.
           MOVE "ABCD" TO A-FIELD-1.
           MOVE 9999 TO A-FIELD-2.
           DISPLAY "AFTER-MOVE B-COMBINED=" B-COMBINED.
           MOVE B-COMBINED TO WS-TARGET.
           DISPLAY "WS-TARGET=" WS-TARGET.
           MOVE "12345678" TO B-COMBINED.
           DISPLAY "A-FIELD-1=" A-FIELD-1 " A-FIELD-2=" A-FIELD-2.
           STOP RUN.
