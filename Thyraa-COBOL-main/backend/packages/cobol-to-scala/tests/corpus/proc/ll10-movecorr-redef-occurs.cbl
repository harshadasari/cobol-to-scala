      * ll10 (round 36): pressure-test on round-35 finding 5 (kk12)'s
      * MOVE-CORRESPONDING + qualified-REDEFINES-field-name-collision fix,
      * generalized from a SCALAR collision (kk12's own A-VIEW-SUB PIC X(3))
      * to an OCCURS-TABLE collision: GROUP-A's REDEFINES-nested A-ITEMS is
      * itself an OCCURS 3 TIMES table (not a scalar), colliding by bare
      * name with GROUP-B's own plain OCCURS 3 TIMES A-ITEMS table.
      *
      * cobc's real semantics (verified): a REDEFINES-nested item never
      * participates in MOVE CORRESPONDING's own name-matching, so GROUP-B's
      * own A-ITEMS table is left completely untouched (still its own
      * initial VALUE) - only A-FIELD1/A-FIELD2 (identically named,
      * present in both groups, NOT under any REDEFINES) get moved.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL10.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  GROUP-A.
           05  A-FIELD1 PIC X(6) VALUE "ABCDEF".
           05  A-VIEW REDEFINES A-FIELD1.
               10  A-ITEMS PIC X(2) OCCURS 3 TIMES.
           05  A-FIELD2 PIC X(3) VALUE "PPP".
       01  GROUP-B.
           05  A-FIELD1 PIC X(6) VALUE SPACES.
           05  A-ITEMS PIC X(2) OCCURS 3 TIMES.
           05  A-FIELD2 PIC X(3) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "ZZ" TO A-ITEMS OF GROUP-B (1).
           MOVE "ZZ" TO A-ITEMS OF GROUP-B (2).
           MOVE "ZZ" TO A-ITEMS OF GROUP-B (3).
           DISPLAY "A-ITEMS OF A=[" A-ITEMS OF GROUP-A (1) "]["
               A-ITEMS OF GROUP-A (2) "][" A-ITEMS OF GROUP-A (3) "]".
           MOVE CORRESPONDING GROUP-A TO GROUP-B.
           DISPLAY "B-FIELD1=[" A-FIELD1 OF GROUP-B "]".
           DISPLAY "B-ITEMS=[" A-ITEMS OF GROUP-B (1) "]["
               A-ITEMS OF GROUP-B (2) "][" A-ITEMS OF GROUP-B (3) "]".
           DISPLAY "B-FIELD2=[" A-FIELD2 OF GROUP-B "]".
           STOP RUN.
