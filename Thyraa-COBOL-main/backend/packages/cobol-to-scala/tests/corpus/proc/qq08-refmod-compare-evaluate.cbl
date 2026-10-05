      * qq08: ref-mod operands in IF / EVALUATE: alphanumeric comparison
      * with space padding, runtime length, SPACES, class test.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. QQ08.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE PIC X(10) VALUE "AB  CD12  ".
       01  WS-L    PIC 9 VALUE 2.
       01  WS-N    PIC 9(4) VALUE 1234.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-CODE(1:2) = "AB"
               DISPLAY "T1 YES"
           ELSE
               DISPLAY "T1 NO"
           END-IF.
           IF WS-CODE(1:4) = "AB"
               DISPLAY "T2 YES"
           ELSE
               DISPLAY "T2 NO"
           END-IF.
           IF WS-CODE(3:2) = SPACES
               DISPLAY "T3 YES"
           ELSE
               DISPLAY "T3 NO"
           END-IF.
           IF WS-CODE(5:WS-L) > "CC"
               DISPLAY "T4 GT"
           ELSE
               DISPLAY "T4 NOT GT"
           END-IF.
           IF WS-CODE(7:2) IS NUMERIC
               DISPLAY "T5 NUMERIC"
           END-IF.
           IF WS-N(2:2) = "23"
               DISPLAY "T6 YES"
           END-IF.
           IF WS-CODE(1:1) NOT = WS-CODE(5:1)
               DISPLAY "T7 DIFF"
           END-IF.
           EVALUATE WS-CODE(5:2)
               WHEN "AB"
                   DISPLAY "E=AB"
               WHEN "CD"
                   DISPLAY "E=CD"
               WHEN OTHER
                   DISPLAY "E=OTHER"
           END-EVALUATE.
           EVALUATE TRUE
               WHEN WS-CODE(1:WS-L) = "AB" AND WS-CODE(7:2) = "12"
                   DISPLAY "E2=BOTH"
               WHEN OTHER
                   DISPLAY "E2=NO"
           END-EVALUATE.
           STOP RUN.
