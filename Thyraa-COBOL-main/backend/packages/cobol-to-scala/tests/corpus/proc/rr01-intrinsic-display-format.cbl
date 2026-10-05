      * rr01: DISPLAY of a bare FUNCTION NUMVAL / NUMVAL-C / MOD result
      * uses cobc's value-sized intrinsic result field (9 digits when the
      * value fits 32 bits and scale < 10, else 20 digits, trailing
      * fractional zeros dropped, sign only when negative); FUNCTION MAX /
      * MIN return the winning argument in ITS OWN display format.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. RR01.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-S1   PIC X(10) VALUE "  5678".
       01  WS-S2   PIC X(10) VALUE "12.5".
       01  WS-S3   PIC X(10) VALUE "-3.75".
       01  WS-S4   PIC X(10) VALUE "5678  ".
       01  WS-S5   PIC X(12) VALUE "123456789012".
       01  WS-S6   PIC X(10) VALUE "1234-".
       01  WS-S7   PIC X(12) VALUE "1,234.50".
       01  WS-A    PIC 9(3)  VALUE 17.
       01  WS-B    PIC 9(5)  VALUE 17.
       01  WS-C    PIC S9(3) VALUE -17.
       01  WS-D    PIC 9(3)V99 VALUE 12.50.
       01  WS-E    PIC S9(3)V99 VALUE -3.25.
       01  WS-F    PIC 9(12) VALUE 123456789012.
       01  WS-N    PIC 9(3)  VALUE 5.
       01  WS-G    PIC S9(3) VALUE 17.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "N1=" FUNCTION NUMVAL(WS-S1) "|".
           DISPLAY "N2=" FUNCTION NUMVAL(WS-S2) "|".
           DISPLAY "N3=" FUNCTION NUMVAL(WS-S3) "|".
           DISPLAY "N4=" FUNCTION NUMVAL(WS-S4) "|".
           DISPLAY "N5=" FUNCTION NUMVAL(WS-S5) "|".
           DISPLAY "N6=" FUNCTION NUMVAL(WS-S6) "|".
           DISPLAY "N7=" FUNCTION NUMVAL("0") "|".
           DISPLAY "N8=" FUNCTION NUMVAL("-7") "|".
           DISPLAY "N9=" FUNCTION NUMVAL("0.001") "|".
           DISPLAY "N10=" FUNCTION NUMVAL("12.50") "|".
           DISPLAY "N11=" FUNCTION NUMVAL("2147483647") "|".
           DISPLAY "N12=" FUNCTION NUMVAL("4294967296") "|".
           DISPLAY "N13=" FUNCTION NUMVAL("-2147483648") "|".
           DISPLAY "N14=" FUNCTION NUMVAL("0.0000000001") "|".
           DISPLAY "N15=" FUNCTION NUMVAL("1234567890123456789012") "|".
           DISPLAY "C1=" FUNCTION NUMVAL-C(WS-S7) "|".
           DISPLAY "C2=" FUNCTION NUMVAL-C("-1,000") "|".
           DISPLAY "M1=" FUNCTION MOD(WS-A 5) "|".
           DISPLAY "M2=" FUNCTION MOD(WS-C 5) "|".
           DISPLAY "M3=" FUNCTION MOD(17 5) "|".
           DISPLAY "M4=" FUNCTION MOD(-17 5) "|".
           DISPLAY "M5=" FUNCTION MOD(WS-D 5) "|".
           DISPLAY "M6=" FUNCTION MOD(WS-E 5) "|".
           DISPLAY "M7=" FUNCTION MOD(WS-F 1000000) "|".
           DISPLAY "M8=" FUNCTION MOD(WS-F 1000000000000) "|".
           DISPLAY "X1=" FUNCTION MAX(WS-A WS-B) "|".
           DISPLAY "X2=" FUNCTION MAX(WS-B WS-A) "|".
           DISPLAY "X3=" FUNCTION MIN(WS-A WS-B) "|".
           DISPLAY "X4=" FUNCTION MAX(WS-D WS-E) "|".
           DISPLAY "X5=" FUNCTION MIN(WS-D WS-E) "|".
           DISPLAY "X6=" FUNCTION MIN(WS-C WS-A) "|".
           DISPLAY "X7=" FUNCTION MAX(WS-G WS-A) "|".
           DISPLAY "X8=" FUNCTION MAX(WS-A 100) "|".
           DISPLAY "X9=" FUNCTION MAX(WS-A 100.5) "|".
           DISPLAY "X10=" FUNCTION MAX(WS-N 2) "|".
           DISPLAY "X11=" FUNCTION MAX(3 9 4) "|".
           DISPLAY "X12=" FUNCTION MIN(-3 2) "|".
           DISPLAY "X13=" FUNCTION MAX(100.50 2) "|".
           DISPLAY "X14=" FUNCTION MAX(007 2) "|".
           DISPLAY "X15=" FUNCTION MAX(0.50 0.25) "|".
           STOP RUN.
