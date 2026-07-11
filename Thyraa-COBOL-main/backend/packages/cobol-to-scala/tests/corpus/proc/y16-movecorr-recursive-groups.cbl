       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y16MVCORR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  SOURCE-REC.
           05  ADDR-INFO.
               10  STREET     PIC X(8) VALUE "MAINST  ".
               10  CITY       PIC X(6) VALUE "AUSTIN".
           05  AMOUNT         PIC 9(4) VALUE 1234.
       01  TARGET-REC.
           05  ADDR-INFO.
               10  STREET     PIC X(8) VALUE SPACES.
               10  CITY       PIC X(6) VALUE SPACES.
           05  AMOUNT         PIC 9(4) VALUE 0.
           05  EXTRA          PIC X(4) VALUE "KEEP".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE CORRESPONDING SOURCE-REC TO TARGET-REC.
           DISPLAY "T-STREET=[" STREET OF TARGET-REC "]"
               " T-CITY=[" CITY OF TARGET-REC "]"
               " T-AMOUNT=" AMOUNT OF TARGET-REC
               " T-EXTRA=[" EXTRA "]".
           STOP RUN.
