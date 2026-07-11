       IDENTIFICATION DIVISION.
       PROGRAM-ID. R13ADDCOR.
      *
      * Adversarial: ADD CORRESPONDING (not MOVE CORRESPONDING, which
      * the baseline corpus p13-corresponding.cbl already covers)
      * between two groups whose subordinate names only partially
      * overlap, INCLUDING a nested group-within-group whose name
      * matches on both sides (DTL-GROUP), so the matching must recurse
      * into that nested group and add its OWN matching children too,
      * not just top-level elementary items.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A.
           05  AMOUNT          PIC 9(5)     VALUE 100.
           05  DTL-GROUP.
               10  QTY         PIC 9(3)     VALUE 5.
               10  PRICE       PIC 9(3)V99  VALUE 500.25.
           05  A-ONLY-FIELD    PIC X(3)     VALUE 'AXX'.
       01  WS-B.
           05  AMOUNT          PIC 9(5)     VALUE 200.
           05  DTL-GROUP.
               10  QTY         PIC 9(3)     VALUE 1.
               10  PRICE       PIC 9(3)V99  VALUE 200.50.
           05  B-ONLY-FIELD    PIC X(3)     VALUE 'BXX'.
       PROCEDURE DIVISION.
       0000-MAIN.
           DISPLAY 'BEFORE-AMOUNT=' AMOUNT OF WS-B
           DISPLAY 'BEFORE-QTY=' QTY OF WS-B
           DISPLAY 'BEFORE-PRICE=' PRICE OF WS-B
           DISPLAY 'BEFORE-B-ONLY=' B-ONLY-FIELD
      *
           ADD CORRESPONDING WS-A TO WS-B
      *
           DISPLAY 'AFTER-AMOUNT=' AMOUNT OF WS-B
           DISPLAY 'AFTER-QTY=' QTY OF WS-B
           DISPLAY 'AFTER-PRICE=' PRICE OF WS-B
           DISPLAY 'AFTER-B-ONLY=' B-ONLY-FIELD
           DISPLAY 'AFTER-A-AMOUNT-UNCHANGED=' AMOUNT OF WS-A
           STOP RUN.
