       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y10SUBCRN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  REC-1.
           05  TOTALS.
               10  AMT-A    PIC 9(3)V99 VALUE 100.00.
               10  AMT-B    PIC 9(3)V99 VALUE 50.00.
           05  OTHER-1      PIC 9(3) VALUE 9.
       01  REC-2.
           05  TOTALS.
               10  AMT-A    PIC 9(3)V999 VALUE 33.333.
               10  AMT-B    PIC 9(3)V999 VALUE 12.111.
           05  OTHER-2      PIC 9(3) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           SUBTRACT CORRESPONDING REC-2 FROM REC-1 ROUNDED.
           DISPLAY "R1-TOT-A=" AMT-A OF REC-1
               " R1-TOT-B=" AMT-B OF REC-1
               " R1-OTHER=" OTHER-1.
           STOP RUN.
