      * Adversarial (round 22): MOVE/ADD CORRESPONDING where the two
      * groups have genuinely DIFFERENT field COUNTS, not just a
      * different order (j12) or a source superset matched by a target
      * with one extra unrelated field of roughly equal count (y16).
      * Case 1 (MOVE CORRESPONDING): source has 4 fields, target only 2
      * (a proper subset) - the source's own two non-matching fields
      * (FLD-A, FLD-D) must be silently ignored, not cause an error or
      * spurious extra assignment. Case 2 (ADD CORRESPONDING): source
      * has 2 fields, target has 3 (source is the proper subset this
      * time) - the target's own extra field (FLD-Z) must be left
      * completely untouched by the ADD.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K06CORRPART.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC1.
           05 FLD-A PIC 9(3) VALUE 10.
           05 FLD-B PIC 9(3) VALUE 20.
           05 FLD-C PIC 9(3) VALUE 30.
           05 FLD-D PIC 9(3) VALUE 40.
       01 WS-TGT1.
           05 FLD-B PIC 9(3) VALUE 0.
           05 FLD-C PIC 9(3) VALUE 0.
       01 WS-SRC2.
           05 FLD-X PIC 9(3) VALUE 5.
           05 FLD-Y PIC 9(3) VALUE 7.
       01 WS-TGT2.
           05 FLD-X PIC 9(3) VALUE 100.
           05 FLD-Y PIC 9(3) VALUE 200.
           05 FLD-Z PIC 9(3) VALUE 300.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE CORRESPONDING WS-SRC1 TO WS-TGT1.
           DISPLAY "B=" FLD-B OF WS-TGT1 " C=" FLD-C OF WS-TGT1.
           ADD CORRESPONDING WS-SRC2 TO WS-TGT2.
           DISPLAY "X=" FLD-X OF WS-TGT2
               " Y=" FLD-Y OF WS-TGT2
               " Z=" FLD-Z OF WS-TGT2.
           STOP RUN.
