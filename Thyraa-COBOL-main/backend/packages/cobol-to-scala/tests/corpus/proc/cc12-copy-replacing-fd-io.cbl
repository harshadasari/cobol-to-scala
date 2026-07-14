      * cc12: a COPY REPLACING copybook that itself declares an FD
      * record (not just a WORKING-STORAGE structure, the only shape
      * every prior COPY-REPLACING corpus program - i03/i04/j05/u09/
      * u10 - exercises), used with OPEN I-O + REWRITE. Probes whether
      * the FD record's own downstream registries (GROUP_REGISTRY,
      * the generated case class, FILE STATUS wiring) still get built
      * correctly when the FD's own text arrives through a REPLACING
      * token substitution rather than being written directly in the
      * source.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC12COPY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "RELFILE.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       COPY IOFDCOPY REPLACING ==:PFX:== BY ==REL==.
       WORKING-STORAGE SECTION.
       01  WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-LOGIC.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REL-ID.
           MOVE "AAAAA" TO REL-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           READ REL-FILE
               AT END DISPLAY "READ1 AT END"
               NOT AT END
                   DISPLAY "READ1 ID=" REL-ID " VAL=" REL-VAL
           END-READ.
           MOVE "ZZZZZ" TO REL-VAL.
           REWRITE REL-REC.
           DISPLAY "AFTER-REWRITE STATUS=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE
               AT END DISPLAY "READ2 AT END"
               NOT AT END
                   DISPLAY "READ2 ID=" REL-ID " VAL=" REL-VAL
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
