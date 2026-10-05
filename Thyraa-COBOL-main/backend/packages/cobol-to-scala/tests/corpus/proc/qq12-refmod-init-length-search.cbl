      * qq12: INITIALIZE of a slice, FUNCTION LENGTH of ref-mod'd
      * operands (literal and runtime length), and SEARCH WHEN keyed on a
      * ref-mod'd operand.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ12.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-T    PIC X(10) VALUE "ABCDEFGHIJ".
       01  WS-L    PIC 9 VALUE 6.
       01  WS-LEN  PIC 99.
       01  WS-KEYS PIC X(8) VALUE "xxBBxxxx".
       01  WS-TABLE.
           05  WS-ROW OCCURS 3 INDEXED BY WS-IX.
               10  WS-CODE PIC X(2).
               10  WS-VAL  PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           INITIALIZE WS-T(3:4).
           DISPLAY "T=[" WS-T "]".
           DISPLAY "LEN1=" FUNCTION LENGTH(WS-T(2:5)).
           MOVE FUNCTION LENGTH(WS-T(2:WS-L)) TO WS-LEN.
           DISPLAY "LEN2=" WS-LEN.
           MOVE FUNCTION LENGTH(WS-T(4:)) TO WS-LEN.
           DISPLAY "LEN3=" WS-LEN.
           MOVE "AA" TO WS-CODE(1).
           MOVE 111 TO WS-VAL(1).
           MOVE "BB" TO WS-CODE(2).
           MOVE 222 TO WS-VAL(2).
           MOVE "CC" TO WS-CODE(3).
           MOVE 333 TO WS-VAL(3).
           SET WS-IX TO 1.
           SEARCH WS-ROW
               AT END DISPLAY "NOT FOUND"
               WHEN WS-CODE(WS-IX) = WS-KEYS(3:2)
                   DISPLAY "FOUND VAL=" WS-VAL(WS-IX)
           END-SEARCH.
           STOP RUN.
