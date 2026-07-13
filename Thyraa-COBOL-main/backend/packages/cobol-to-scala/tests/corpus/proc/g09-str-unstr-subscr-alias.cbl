       IDENTIFICATION DIVISION.
       PROGRAM-ID. G09.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 3 TIMES.
               10  R-FIELD PIC X(10).
       01  WS-PTR PIC 9(3) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AB-CD-EF"  TO R-FIELD(1).
           MOVE SPACES     TO R-FIELD(2).
           MOVE "XY"       TO R-FIELD(3).
           STRING R-FIELD(3) DELIMITED BY SIZE
                  "-"       DELIMITED BY SIZE
                  R-FIELD(3) DELIMITED BY SIZE
                  INTO R-FIELD(2).
           DISPLAY "ROW2=[" R-FIELD(2) "]".
           UNSTRING R-FIELD(1) DELIMITED BY "-"
                  INTO R-FIELD(1) R-FIELD(3)
                  WITH POINTER WS-PTR.
           DISPLAY "ROW1=[" R-FIELD(1) "]".
           DISPLAY "ROW3=[" R-FIELD(3) "]".
           DISPLAY "PTR=" WS-PTR.
           STOP RUN.
