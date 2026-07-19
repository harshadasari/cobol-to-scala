      * ll09 (round 36): pressure-test on round-35 finding 5 (kk12)'s
      * MOVE-CORRESPONDING + qualified-REDEFINES-field-name-collision fix -
      * kk12 only had a TWO-way bare-name collision (GROUP-A's REDEFINES-
      * nested A-VIEW-SUB vs GROUP-B's plain A-VIEW-SUB). Here the SAME
      * bare name (A-VIEW-SUB) is shared across THREE different 01-groups -
      * GROUP-A (REDEFINES-nested, the MOVE CORRESPONDING source),
      * GROUP-B and GROUP-C (both plain, both MOVE CORRESPONDING targets) -
      * to verify the qualified-name disambiguation and MOVE CORRESPONDING
      * name-matching both still work when there are three colliding
      * declarations, not just two.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL09.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  GROUP-A.
           05  A-FIELD1 PIC 9(3) VALUE 111.
           05  A-VIEW REDEFINES A-FIELD1.
               10  A-VIEW-SUB PIC X(3).
           05  A-FIELD2 PIC X(3) VALUE "PPP".
       01  GROUP-B.
           05  A-FIELD1 PIC 9(3) VALUE 0.
           05  A-VIEW-SUB PIC X(3) VALUE SPACES.
           05  A-FIELD2 PIC X(3) VALUE SPACES.
       01  GROUP-C.
           05  A-FIELD1 PIC 9(3) VALUE 0.
           05  A-VIEW-SUB PIC X(3) VALUE SPACES.
           05  A-FIELD2 PIC X(3) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "A-VIEW-SUB OF A=[" A-VIEW-SUB OF GROUP-A "]".
           DISPLAY "A-VIEW-SUB OF B=[" A-VIEW-SUB OF GROUP-B "]".
           DISPLAY "A-VIEW-SUB OF C=[" A-VIEW-SUB OF GROUP-C "]".
           MOVE CORRESPONDING GROUP-A TO GROUP-B.
           MOVE CORRESPONDING GROUP-A TO GROUP-C.
           DISPLAY "B-FIELD1=[" A-FIELD1 OF GROUP-B "]".
           DISPLAY "B-VIEWSUB=[" A-VIEW-SUB OF GROUP-B "]".
           DISPLAY "B-FIELD2=[" A-FIELD2 OF GROUP-B "]".
           DISPLAY "C-FIELD1=[" A-FIELD1 OF GROUP-C "]".
           DISPLAY "C-VIEWSUB=[" A-VIEW-SUB OF GROUP-C "]".
           DISPLAY "C-FIELD2=[" A-FIELD2 OF GROUP-C "]".
           STOP RUN.
