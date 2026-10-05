      * qq02: start and length computed at runtime (variables and
      * +/- arithmetic expressions), including a loop walking the field
      * one character at a time.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ02.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC PIC X(10) VALUE "0123456789".
       01  WS-I   PIC 99 VALUE 0.
       01  WS-S   PIC 99 VALUE 4.
       01  WS-L   PIC 99 VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "V=[" WS-SRC(WS-S:WS-L) "]".
           DISPLAY "P=[" WS-SRC(WS-S + 2:WS-L - 1) "]".
           DISPLAY "M=[" WS-SRC(WS-S - 3:WS-L + 1) "]".
           DISPLAY "O=[" WS-SRC(WS-S + 3:) "]".
           PERFORM VARYING WS-I FROM 1 BY 3 UNTIL WS-I > 10
               DISPLAY "I=" WS-I " [" WS-SRC(WS-I:1) "]"
           END-PERFORM.
           MOVE 10 TO WS-S.
           MOVE 1 TO WS-L.
           DISPLAY "LAST=[" WS-SRC(WS-S:WS-L) "]".
           STOP RUN.
