      * hh07: basic arithmetic/data-movement territory, dormant for many
      * rounds - a numeric-edited PICTURE (floating $, comma insertion,
      * decimal point) field declared directly in an FD record, MOVEd
      * into from an ordinary numeric WORKING-STORAGE field (an ordinary,
      * common MOVE-to-edited-item), written to a file, and read back.
      * Probes whether the edited field's own special insertion
      * characters ($, comma, decimal point) survive a file WRITE/READ
      * round trip byte-for-byte, or whether the byte-level/text-mode
      * record-plan machinery mistreats them as plain digits somewhere
      * along the way.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH07EDITFILE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "HH07REL.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-AMT     PIC $$$,$$9.99.
       WORKING-STORAGE SECTION.
       01  WS-STATUS       PIC XX.
       01  WS-NUM1         PIC 9(5)V99 VALUE 1234.56.
       01  WS-NUM2         PIC 9(5)V99 VALUE 7.05.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE WS-NUM1 TO REC-AMT.
           DISPLAY "WRITTEN1=[" REC-AMT "]".
           WRITE REL-REC.

           MOVE 2 TO REC-ID.
           MOVE WS-NUM2 TO REC-AMT.
           DISPLAY "WRITTEN2=[" REC-AMT "]".
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE
               AT END DISPLAY "READ1 AT END"
               NOT AT END
                   DISPLAY "READ1 ID=" REC-ID " AMT=[" REC-AMT "]"
           END-READ.
           READ REL-FILE
               AT END DISPLAY "READ2 AT END"
               NOT AT END
                   DISPLAY "READ2 ID=" REC-ID " AMT=[" REC-AMT "]"
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
