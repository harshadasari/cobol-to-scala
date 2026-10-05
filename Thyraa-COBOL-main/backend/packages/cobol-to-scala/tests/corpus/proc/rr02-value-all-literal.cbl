      * rr02: VALUE ALL <literal> fills the whole item by repeating the
      * literal (truncating the last repetition); ALL <figurative> fills
      * the whole alphanumeric item; MOVE ALL <literal> shares the rule.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. RR02.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A   PIC X(5) VALUE ALL "*".
       01  WS-B   PIC X(5) VALUE ALL "AB".
       01  WS-C   PIC X(7) VALUE ALL "XYZ".
       01  WS-D   PIC 9(4) VALUE ALL "7".
       01  WS-E   PIC X(4) VALUE ALL SPACES.
       01  WS-F   PIC X(4) VALUE ALL ZEROS.
       01  WS-G   PIC X(4) VALUE ALL QUOTES.
       01  WS-F2  PIC X(4) VALUE ZEROS.
       01  WS-J   PIC X(4) VALUE ALL "9".
       01  WS-K   PIC 9(3) VALUE ALL ZEROS.
       01  WS-L   PIC X(3) VALUE ALL "ABCDEF".
       01  WS-N   PIC X(4) VALUE "*".
       01  WS-O   PIC S9(3) VALUE ALL "1".
       01  WS-P   PIC 9(3)V9 VALUE ALL "5".
       01  WS-Q   PIC S9(3) VALUE ALL "12".
       01  WS-GRP.
           05  WS-G1 PIC X(3) VALUE ALL "-".
           05  WS-G2 PIC X(3) VALUE ALL "=+".
       01  WS-Z   PIC X(5).
       01  WS-D2  PIC 9(4) VALUE 1.
       01  WS-E2  PIC 9(3)V9 VALUE 1.
       01  WS-GP  PIC X(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "A=" WS-A "|".
           DISPLAY "B=" WS-B "|".
           DISPLAY "C=" WS-C "|".
           DISPLAY "D=" WS-D "|".
           DISPLAY "E=" WS-E "|".
           DISPLAY "F=" WS-F "|" WS-F2 "|".
           DISPLAY "G=" WS-G "|".
           DISPLAY "J=" WS-J "|".
           DISPLAY "K=" WS-K "|".
           DISPLAY "L=" WS-L "|".
           DISPLAY "N=" WS-N "|".
           DISPLAY "O=" WS-O "|".
           DISPLAY "P=" WS-P "|".
           DISPLAY "Q=" WS-Q "|".
           DISPLAY "G1=" WS-G1 "|" WS-G2 "|".
           MOVE ALL "x" TO WS-Z.
           DISPLAY "Z1=" WS-Z "|".
           MOVE ALL "ab" TO WS-Z.
           DISPLAY "Z2=" WS-Z "|".
           MOVE ALL "abc" TO WS-Z.
           DISPLAY "Z3=" WS-Z "|".
           MOVE ALL ZEROS TO WS-Z.
           DISPLAY "Z4=" WS-Z "|".
           MOVE ALL QUOTES TO WS-Z.
           DISPLAY "Z5=" WS-Z "|".
           MOVE ALL SPACES TO WS-Z.
           DISPLAY "Z6=" WS-Z "|".
           MOVE ALL "9" TO WS-D2.
           DISPLAY "D2=" WS-D2 "|".
           MOVE ALL "12" TO WS-D2.
           DISPLAY "D3=" WS-D2 "|".
           MOVE ALL "3" TO WS-E2.
           DISPLAY "E2=" WS-E2 "|".
           MOVE ALL "*" TO WS-GP.
           DISPLAY "GP=" WS-GP "|".
           MOVE ALL "AB" TO WS-GP.
           DISPLAY "GP2=" WS-GP "|".
           STOP RUN.
