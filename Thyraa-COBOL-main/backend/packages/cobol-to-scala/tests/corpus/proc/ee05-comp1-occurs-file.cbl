      * ee05: a COMP-1 field inside a fixed-size OCCURS table, as part of
      * an FD record written to a RELATIVE file - writeRecordPlan should
      * detect the non-DISPLAY table child (groupContainsNonDisplay) and
      * groupChildConstructorExpr always bails on ANY TABLE_REGISTRY
      * child, so this should degrade to the honest 'bytes-unsupported'
      * decline rather than silently mis-writing the floats.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE05COMP1OCCFILE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "EE05REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID       PIC 9(3).
           05  REC-VALS     COMP-1 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY        PIC 9(3) VALUE 0.
       01  WS-STATUS      PIC XX.
       01  WS-IDX         PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 1.5 TO REC-VALS(1).
           MOVE 2.5 TO REC-VALS(2).
           MOVE 3.5 TO REC-VALS(3).
           WRITE REL-REC.
           CLOSE REL-FILE.

           MOVE 0 TO REC-ID.
           MOVE 0.0 TO REC-VALS(1).
           MOVE 0.0 TO REC-VALS(2).
           MOVE 0.0 TO REC-VALS(3).
           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "ID=" REC-ID.
           PERFORM VARYING WS-IDX FROM 1 BY 1 UNTIL WS-IDX > 3
               DISPLAY "VAL(" WS-IDX ")=" REC-VALS(WS-IDX)
           END-PERFORM.
           CLOSE REL-FILE.
           STOP RUN.
