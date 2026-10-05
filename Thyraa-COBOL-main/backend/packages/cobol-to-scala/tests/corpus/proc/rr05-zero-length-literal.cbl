      * rr05: cobc treats a zero-length alphanumeric literal "" as ONE
      * SPACE everywhere ("a SPACE will be assumed"): comparisons, MOVE,
      * DISPLAY, STRING, UNSTRING, INSPECT, EVALUATE, FUNCTION LENGTH.
      * Also: a PIC X item with no VALUE starts as SPACES, so comparing it
      * with SPACES / "" / another blank item is TRUE before any write.
      * (Fuzzer class A, first fuzzer run.)
       IDENTIFICATION DIVISION.
       PROGRAM-ID. RR05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  A2   PIC X(2) VALUE SPACES.
       01  A3   PIC X(3) VALUE "ab".
       01  A4   PIC X(4) VALUE "xyzw".
       01  A5   PIC X(5) VALUE SPACES.
       01  A6   PIC X(5) VALUE "q".
       01  A7   PIC X(5) VALUE "x".
       01  N1   PIC 9(2) VALUE 0.
       01  Z    PIC X VALUE "".
       01  Z3   PIC X(3) VALUE "".
       01  U1   PIC X(4).
       01  U2   PIC X(2).
       01  U3   PIC X(3).
       01  SRC  PIC X(7) VALUE "a b,c d".
       01  P1   PIC X(4) VALUE "....".
       01  P2   PIC X(4) VALUE "....".
       01  P3   PIC X(4) VALUE "....".
       01  CNT  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF A2 = ""
             DISPLAY "1 A2=blank TRUE"
           ELSE
             DISPLAY "1 false"
           END-IF
           IF A2 NOT = ""
             DISPLAY "2 TRUE"
           ELSE
             DISPLAY "2 false"
           END-IF
           IF A3 = ""
             DISPLAY "3 TRUE"
           ELSE
             DISPLAY "3 false"
           END-IF
           IF A3 > ""
             DISPLAY "4 A3 > '' TRUE"
           ELSE
             DISPLAY "4 false"
           END-IF
           IF "" = A2
             DISPLAY "5 reversed TRUE"
           ELSE
             DISPLAY "5 false"
           END-IF
           MOVE "" TO A4
           DISPLAY "7 [" A4 "]"
           MOVE "ab" TO A5
           MOVE "" TO A5
           DISPLAY "8 [" A5 "]"
           DISPLAY "9 [" "" "]"
           DISPLAY "10 [" Z "][" Z3 "]"
           STRING "a" "" "b" DELIMITED BY SIZE INTO A6
           DISPLAY "11 [" A6 "]"
           STRING "a" "" DELIMITED BY "" INTO A7
           DISPLAY "12 [" A7 "]"
           MOVE 5 TO N1
           IF A3 = "ab" AND A3 NOT = ""
             DISPLAY "14 TRUE"
           END-IF
           EVALUATE A2
             WHEN ""
               DISPLAY "15 when '' TRUE"
             WHEN OTHER
               DISPLAY "15 other"
           END-EVALUATE
           INSPECT SRC TALLYING CNT FOR ALL ""
           DISPLAY "16 CNT=" CNT
           UNSTRING SRC DELIMITED BY "" INTO P1 P2 P3
           DISPLAY "17 [" P1 "][" P2 "][" P3 "]"
           INSPECT SRC REPLACING ALL "" BY "_"
           DISPLAY "18 [" SRC "]"
           DISPLAY "19 " FUNCTION LENGTH("") " " FUNCTION LENGTH('')
           IF U1 = SPACES
             DISPLAY "20 U1 = SPACES TRUE"
           ELSE
             DISPLAY "20 false"
           END-IF
           IF U1 = ""
             DISPLAY "21 U1 = '' TRUE"
           ELSE
             DISPLAY "21 false"
           END-IF
           IF U1 = " "
             DISPLAY "22 U1 = ' ' TRUE"
           ELSE
             DISPLAY "22 false"
           END-IF
           IF U1 = U2
             DISPLAY "23 U1 = U2 TRUE"
           ELSE
             DISPLAY "23 false"
           END-IF
           IF U3 NOT = ""
             DISPLAY "24 false"
           ELSE
             DISPLAY "24 U3 NOT = '' is FALSE"
           END-IF
           MOVE U1 TO A5
           DISPLAY "25 [" A5 "]"
           STOP RUN.
