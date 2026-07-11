      * Round-12 probe z07: INSPECT TALLYING on a SUBSCRIPTED field (a
      * table element, not a bare top-level identifier) - attacks whether
      * INSPECT's own operand resolution handles a subscripted reference at
      * all (every prior INSPECT corpus program uses a bare identifier).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z07INSPSUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-LINE OCCURS 3 TIMES PIC X(10).
       01  WS-COUNT-A  PIC 9(2) VALUE 0.
       01  WS-COUNT-B  PIC 9(2) VALUE 0.
       01  WS-I        PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AABACADAA " TO WS-LINE(1).
           MOVE "BBBBBBBBBB" TO WS-LINE(2).
           MOVE "ABABABABAB" TO WS-LINE(3).

           INSPECT WS-LINE(1) TALLYING WS-COUNT-A FOR ALL "A".
           DISPLAY "COUNT-A-ROW1=" WS-COUNT-A.

           MOVE 3 TO WS-I.
           INSPECT WS-LINE(WS-I) TALLYING WS-COUNT-B FOR ALL "AB".
           DISPLAY "COUNT-B-ROW3=" WS-COUNT-B.

           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY "LINE(" WS-I ")=" WS-LINE(WS-I)
           END-PERFORM.
           STOP RUN.
