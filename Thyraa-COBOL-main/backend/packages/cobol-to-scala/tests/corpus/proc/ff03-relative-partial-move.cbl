      * ff03: REWRITE of a RELATIVE-file record after a MOVE that fills
      * only PART of the record buffer, not the whole thing first -
      * stresses whether the untouched trailing field's PRE-EXISTING
      * bytes (from the original READ) are correctly preserved through
      * round-29's new fixed-width byte-record model, or whether the
      * gap-fill/placeholder machinery (gapFillExpr/relativeGapFillLiteral)
      * or the record-text-building path (plainRecordTextExpr) instead
      * blanks/corrupts the field that was never explicitly MOVEd this
      * time around.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF03PARTMV.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "FF03REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(3).
           05  REC-NAME    PIC X(10).
           05  REC-TAIL    PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE "ORIGINAL" TO REC-NAME.
           MOVE "ZZZZZ" TO REC-TAIL.
           WRITE REL-REC.
           DISPLAY "WRITE ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           READ REL-FILE.
           DISPLAY "BEFORE ID=" REC-ID " NAME=" REC-NAME
               " TAIL=" REC-TAIL.
      * Only REC-NAME is MOVEd here - REC-ID and REC-TAIL are left
      * exactly as READ populated them, not re-established.
           MOVE "CHANGED" TO REC-NAME.
           REWRITE REL-REC.
           DISPLAY "REWRITE ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "AFTER ID=" REC-ID " NAME=" REC-NAME
               " TAIL=" REC-TAIL.
           CLOSE REL-FILE.
           STOP RUN.
