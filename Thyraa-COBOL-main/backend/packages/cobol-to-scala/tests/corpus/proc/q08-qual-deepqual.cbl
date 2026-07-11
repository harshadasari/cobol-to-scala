       IDENTIFICATION DIVISION.
       PROGRAM-ID. QUAL01.
      *
      * Round-4 attack: deep OF-qualification (identifier OF group OF
      * group) across two-level group nesting, and a qualified
      * *subscripted* reference (identifier OF group (subscript),
      * subscript trailing the whole qualified chain per GnuCOBOL's
      * accepted grammar) disambiguating a field name that is
      * deliberately duplicated across two otherwise-unrelated
      * top-level records.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-BIG.
           05  WS-MIDDLE.
               10  WS-LEAF     PIC X(4) VALUE 'WXYZ'.
       01  WS-BIG2.
           05  WS-MIDDLE2.
               10  WS-LEAF2    PIC X(4) VALUE SPACES.
       01  WS-DEPT-A.
           05  WS-TEAM         OCCURS 2 TIMES.
               10  WS-EMP-NAME PIC X(6).
       01  WS-DEPT-B.
           05  WS-TEAM         OCCURS 2 TIMES.
               10  WS-EMP-NAME PIC X(6).
       PROCEDURE DIVISION.
       0000-MAIN.
      *    Plain deep qualification, no subscripts, distinct names.
           MOVE WS-LEAF OF WS-MIDDLE OF WS-BIG
               TO WS-LEAF2 OF WS-MIDDLE2 OF WS-BIG2
           DISPLAY 'LEAF2=' WS-LEAF2 OF WS-MIDDLE2 OF WS-BIG2
      *
      *    Populate the two same-shaped, same-named-field records.
           MOVE 'ALICE ' TO WS-EMP-NAME OF WS-DEPT-A (1)
           MOVE 'BOB   ' TO WS-EMP-NAME OF WS-DEPT-A (2)
           MOVE 'CAROL ' TO WS-EMP-NAME OF WS-DEPT-B (1)
           MOVE 'DAVE  ' TO WS-EMP-NAME OF WS-DEPT-B (2)
      *
      *    Qualified subscripted cross-record MOVE: disambiguates the
      *    field name via OF and selects one occurrence of the OCCURS
      *    table via the trailing subscript, on both sides at once.
           MOVE WS-EMP-NAME OF WS-DEPT-A (1)
               TO WS-EMP-NAME OF WS-DEPT-B (2)
      *
           DISPLAY 'A-TEAM1=' WS-EMP-NAME OF WS-DEPT-A (1)
           DISPLAY 'A-TEAM2=' WS-EMP-NAME OF WS-DEPT-A (2)
           DISPLAY 'B-TEAM1=' WS-EMP-NAME OF WS-DEPT-B (1)
           DISPLAY 'B-TEAM2=' WS-EMP-NAME OF WS-DEPT-B (2)
      *
           STOP RUN.
