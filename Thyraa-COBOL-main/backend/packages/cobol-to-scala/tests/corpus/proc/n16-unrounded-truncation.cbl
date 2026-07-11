       IDENTIFICATION DIVISION.
       PROGRAM-ID. N16UNRND.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A           PIC S9(3)V999 VALUE 2.345.
       01 WS-B           PIC S9(3)V999 VALUE 2.344.
       01 WS-NEG         PIC S9(3)V999 VALUE -2.345.
       01 WS-R1          PIC S9(3)V99  VALUE 0.
       01 WS-R2          PIC S9(3)V99  VALUE 0.
       01 WS-R3          PIC S9(3)V99  VALUE 0.
       01 WS-R0          PIC S9(3)     VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-R1 = WS-A
           COMPUTE WS-R2 = WS-B
           COMPUTE WS-R3 = WS-NEG
           COMPUTE WS-R0 = WS-A
           DISPLAY "R1=" WS-R1
           DISPLAY "R2=" WS-R2
           DISPLAY "R3=" WS-R3
           DISPLAY "R0=" WS-R0
           STOP RUN.
