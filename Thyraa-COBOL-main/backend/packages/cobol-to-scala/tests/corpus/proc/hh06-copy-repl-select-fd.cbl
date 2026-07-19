      * hh06: cc12 already exercises a COPY REPLACING copybook that
      * declares an FD record (with REPLACING substituting field-name
      * prefixes), but its SELECT/FILE-CONTROL entry is always written
      * directly in the source. This probes a copybook that declares
      * BOTH the FILE-CONTROL SELECT entry AND the FILE SECTION FD/01
      * record in ONE single COPY (spanning the DATA DIVISION/FILE
      * SECTION header itself), with REPLACING substituting the LOGICAL
      * FILE NAME token itself (":PFX:-FILE" -> "REL-FILE"), not just
      * field-name prefixes - a genuinely fresh combination of COPY
      * REPLACING with the file-I/O registries (FILE_STATUS_REGISTRY,
      * fileHandleVarNames, the generated case class) this round's own
      * task briefing specifically calls out as long-dormant.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH06COPYBOTH.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           COPY IOBOTH REPLACING ==:PFX:== BY ==REL==.
       WORKING-STORAGE SECTION.
       01  WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REL-ID.
           MOVE "AAAAA" TO REL-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE
               AT END DISPLAY "READ1 AT END"
               NOT AT END
                   DISPLAY "READ1 ID=" REL-ID " VAL=" REL-VAL
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
