      * qq03: ref-mod write into the middle of a field - sources
      * shorter than the slice (space-padded), longer (truncated), exact,
      * a figurative constant, a numeric field, and a runtime length.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ03.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-T   PIC X(12) VALUE "ABCDEFGHIJKL".
       01  WS-N   PIC 9(3)  VALUE 42.
       01  WS-S   PIC 99 VALUE 7.
       01  WS-L   PIC 99 VALUE 4.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "XY" TO WS-T(3:5).
           DISPLAY "SHORT=[" WS-T "]".
           MOVE "ABCDEFGHIJKL" TO WS-T.
           MOVE "123456789" TO WS-T(3:4).
           DISPLAY "LONG =[" WS-T "]".
           MOVE "ABCDEFGHIJKL" TO WS-T.
           MOVE "WXYZ" TO WS-T(9:4).
           DISPLAY "EXACT=[" WS-T "]".
           MOVE SPACES TO WS-T(2:3).
           DISPLAY "SPACE=[" WS-T "]".
           MOVE ZEROS TO WS-T(WS-S:WS-L).
           DISPLAY "ZERO =[" WS-T "]".
           MOVE WS-N TO WS-T(1:3).
           DISPLAY "NUM  =[" WS-T "]".
           MOVE "q" TO WS-T(WS-S + 1:WS-L - 2).
           DISPLAY "RT   =[" WS-T "]".
           MOVE "TAIL" TO WS-T(9:).
           DISPLAY "OPEN =[" WS-T "]".
           STOP RUN.
