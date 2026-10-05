      * rr07: COMPUTE division keeps cobc's intermediate precision: a
      * quotient is TRUNCATED toward zero at max(scaleA - scaleB, 0) + 38
      * decimal places (libcob cob_decimal_div) and every other operation
      * is exact, so (1 / 3) * 3 is 0.999...9 -> 000.9 / +000.999 at the
      * store (Scala BigDecimal's own DECIMAL128 rounding gave 1.0 / 1.000).
      * ROUNDED / not-ROUNDED only differ at the final store. Default
      * dialect: -farithmetic-osvs (IBM-style) is a different rule.
      * Line 1 is the fuzzer's reduced reproducer (class D, which was the
      * class-C unsigned MOVE in disguise).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. RR07.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  N3   PIC 9(4)V9(1) VALUE 0.5.
       01  I1   PIC 9(4) VALUE 833.
       01  I2   PIC 9(4) VALUE 7.
       01  D1   PIC 9(3)V9(2) VALUE 2.5.
       01  R1   PIC 9(3)V9(1).
       01  R0   PIC 9(5).
       01  R3   PIC S9(3)V9(3).
       01  SR   PIC S9(4)V9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE -832 TO N3
           COMPUTE R1 = ((1 + N3) / 3)
           DISPLAY "1 " R1
           COMPUTE R1 = 10 / 3
           DISPLAY "2 " R1
           COMPUTE R1 ROUNDED = 10 / 3
           DISPLAY "3 " R1
           COMPUTE R0 = 10 / 3
           DISPLAY "4 " R0
           COMPUTE R0 ROUNDED = 17 / 3
           DISPLAY "5 " R0
           COMPUTE R1 = (I1 / I2) * I2
           DISPLAY "6 " R1
           COMPUTE R1 = (I1 / I2) * 3
           DISPLAY "7 " R1
           COMPUTE R3 = I1 / I2 + D1
           DISPLAY "8 " R3
           COMPUTE R1 = (I1 / 3) * 3
           DISPLAY "9 " R1
           COMPUTE R3 = 1 / 3 * 3
           DISPLAY "10 " R3
           COMPUTE R3 = (1 / 3) * 3
           DISPLAY "11 " R3
           COMPUTE R3 = 2 / 3 / 3 * 9
           DISPLAY "12 " R3
           COMPUTE R1 = (1 / 3) + (1 / 3) + (1 / 3)
           DISPLAY "13 " R1
           COMPUTE R1 = ((I1 / I2) / I2) * I2 * I2
           DISPLAY "14 " R1
           COMPUTE R0 = (I1 / I2) * I2
           DISPLAY "15 " R0
           COMPUTE R3 = 1 / 7 * 7
           DISPLAY "16 " R3
           COMPUTE SR = (I1 / I2) - 118
           DISPLAY "17 " SR
           COMPUTE R3 = 22 / 7 * 1000000
           DISPLAY "18 " R3
           COMPUTE R1 = 1 / 3 * 100000000000000000000
           DISPLAY "19 " R1
           COMPUTE R1 = 1 / 3 * 30
           DISPLAY "20 " R1
           COMPUTE R1 = I1 / I2 * I2 - (I2 * 100)
           DISPLAY "21 " R1
           COMPUTE R1 = 1000 / 3 / 3 / 3 / 3 / 3 / 3 / 3 / 3 / 3
           DISPLAY "22 " R1
           COMPUTE R3 ROUNDED = (I1 / I2) * 10 / 9
           DISPLAY "23 " R3
           COMPUTE R1 = 0.1 / 0.3 * 90
           DISPLAY "24 " R1
           COMPUTE R1 = 1 / 3 * 9 + 0.0001
           DISPLAY "25 " R1
           STOP RUN.
