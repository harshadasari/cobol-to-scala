      * rr06: MOVE of a negative value into an UNSIGNED numeric item stores
      * the absolute value (cobc), from signed DISPLAY / COMP / COMP-3 /
      * SIGN SEPARATE sources, negative literals and through a group MOVE;
      * INITIALIZE ... REPLACING NUMERIC BY <negative> too (a group MOVE of
      * a NEGATIVE signed child into an unsigned one is invalid data in
      * cobc - COMPUTE and MOVE read it differently - so only positive
      * values go through the group here). Later
      * comparisons and arithmetic see the non-negative value. rr04 covers
      * the same rule for arithmetic stores. (Fuzzer class C.)
       IDENTIFICATION DIVISION.
       PROGRAM-ID. RR06.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  S6   PIC S9(6) VALUE -481.
       01  SDD  PIC S9(3)V9(2) VALUE -12.75.
       01  SC   PIC S9(4) COMP VALUE -37.
       01  SPK  PIC S9(5) COMP-3 VALUE -906.
       01  SE   PIC S9(3) SIGN IS LEADING SEPARATE VALUE -45.
       01  U2   PIC 9(2).
       01  U3   PIC 9(3).
       01  U4D  PIC 9(3)V9(1).
       01  UC   PIC 9(4) COMP.
       01  UPK  PIC 9(5) COMP-3.
       01  UB   PIC 9(1).
       01  X5   PIC X(5).
       01  G1.
           05 GS PIC S9(3) VALUE 123.
           05 GT PIC S9(2) VALUE 7.
       01  G2.
           05 HS PIC 9(3).
           05 HT PIC 9(2).
       01  SS   PIC S9(3).
       01  TOT  PIC S9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE S6 TO U2
           DISPLAY "1 " U2
           MOVE -536 TO U3
           DISPLAY "2 " U3
           MOVE -12.75 TO U4D
           DISPLAY "3 " U4D
           MOVE SDD TO U4D
           DISPLAY "4 " U4D
           MOVE SC TO UC
           DISPLAY "5 " UC
           MOVE SPK TO UPK
           DISPLAY "6 " UPK
           MOVE SE TO U3
           DISPLAY "7 " U3
           MOVE SC TO U2
           DISPLAY "8 " U2
           MOVE SPK TO UB
           DISPLAY "9 " UB
           MOVE SPK TO UC
           DISPLAY "10 " UC
           MOVE -1 TO UPK
           DISPLAY "11 " UPK
           MOVE -3 TO UC
           DISPLAY "12 " UC
           MOVE G1 TO G2
           COMPUTE TOT = HS + HT
           DISPLAY "13 " TOT
           MOVE S6 TO X5
           DISPLAY "14 [" X5 "]"
           MOVE U2 TO SS
           DISPLAY "15 " SS
           MOVE S6 TO SS
           MOVE SS TO U3
           DISPLAY "16 " U3
           INITIALIZE U3 REPLACING NUMERIC BY -5
           DISPLAY "17 " U3
           MOVE -0.5 TO U3
           DISPLAY "18 " U3
           MOVE SDD TO U2
           DISPLAY "19 " U2
           MOVE -536 TO U3
           IF U3 < 0
             DISPLAY "20 NEG"
           ELSE
             DISPLAY "20 NOTNEG"
           END-IF
           IF U3 = 536
             DISPLAY "21 U3 = 536"
           END-IF
           MOVE S6 TO U4D
           COMPUTE TOT = U4D + 1
           DISPLAY "22 " TOT
           STOP RUN.
