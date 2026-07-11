       IDENTIFICATION DIVISION.
       PROGRAM-ID. R13BDUPGN.
      *
      * Isolation follow-up for r13: two DIFFERENT 01-level records
      * each containing a nested group with the SAME subordinate
      * group name (DTL-GROUP), but using only plain MOVE of
      * individual elementary fields - no CORRESPONDING at all - to
      * see whether the case-class naming collision seen in r13 is
      * caused by ADD CORRESPONDING recursing into nested groups, or
      * is a more basic data-division code-generation bug (duplicate
      * group name across separate records) that has nothing to do
      * with CORRESPONDING.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A.
           05  AMOUNT          PIC 9(5)     VALUE 100.
           05  DTL-GROUP.
               10  QTY         PIC 9(3)     VALUE 5.
       01  WS-B.
           05  AMOUNT          PIC 9(5)     VALUE 200.
           05  DTL-GROUP.
               10  QTY         PIC 9(3)     VALUE 1.
       PROCEDURE DIVISION.
       0000-MAIN.
           DISPLAY 'A-AMOUNT=' AMOUNT OF WS-A
           DISPLAY 'A-QTY=' QTY OF WS-A
           DISPLAY 'B-AMOUNT=' AMOUNT OF WS-B
           DISPLAY 'B-QTY=' QTY OF WS-B
           MOVE QTY OF WS-A TO QTY OF WS-B
           DISPLAY 'B-QTY-AFTER=' QTY OF WS-B
           STOP RUN.
