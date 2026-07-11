       IDENTIFICATION DIVISION.
       PROGRAM-ID. V08-UNEQUAL-COMPARE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SHORT     PIC X(3) VALUE "AB ".
       01 WS-LONG      PIC X(6) VALUE "AB    ".
       01 WS-SHORT2    PIC X(2) VALUE "AB".
       01 WS-V99       PIC 9(3)V99 VALUE 12.50.
       01 WS-V9        PIC 9(3)V9  VALUE 12.5.
       01 WS-V999      PIC 9(3)V999 VALUE 12.500.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-SHORT = WS-LONG
               DISPLAY "SHORT=LONG: EQUAL"
           ELSE
               DISPLAY "SHORT=LONG: NOTEQUAL"
           END-IF.
           IF WS-SHORT2 = WS-LONG
               DISPLAY "SHORT2=LONG: EQUAL"
           ELSE
               DISPLAY "SHORT2=LONG: NOTEQUAL"
           END-IF.
           IF WS-V99 = WS-V9
               DISPLAY "V99=V9: EQUAL"
           ELSE
               DISPLAY "V99=V9: NOTEQUAL"
           END-IF.
           IF WS-V999 = WS-V9
               DISPLAY "V999=V9: EQUAL"
           ELSE
               DISPLAY "V999=V9: NOTEQUAL"
           END-IF.
           IF WS-V99 > WS-V9
               DISPLAY "V99>V9: TRUE"
           ELSE
               DISPLAY "V99>V9: FALSE"
           END-IF.
           STOP RUN.
