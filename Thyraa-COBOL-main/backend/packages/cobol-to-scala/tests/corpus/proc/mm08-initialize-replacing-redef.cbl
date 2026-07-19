      * mm08 (round 37): fresh-territory probe - INITIALIZE ... REPLACING
      * targeting a field that lives UNDER a REDEFINES (not the group
      * itself, one specific nested child): WS-FLAT PIC X(6) is REDEFINED
      * by WS-VIEW's two PIC X(3) children WS-SUB1/WS-SUB2. INITIALIZE
      * WS-SUB1 REPLACING ALPHANUMERIC DATA BY "QQQ" must both set
      * WS-SUB1 itself AND be visible through WS-FLAT (shared storage) -
      * and must leave WS-SUB2 (and the rest of WS-FLAT) untouched.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM08.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FLAT PIC X(6) VALUE "ABCDEF".
       01  WS-VIEW REDEFINES WS-FLAT.
           05  WS-SUB1 PIC X(3).
           05  WS-SUB2 PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE FLAT=[" WS-FLAT "] SUB1=[" WS-SUB1
               "] SUB2=[" WS-SUB2 "]".
           INITIALIZE WS-SUB1 REPLACING ALPHANUMERIC DATA BY "QQQ".
           DISPLAY "AFTER1 FLAT=[" WS-FLAT "] SUB1=[" WS-SUB1
               "] SUB2=[" WS-SUB2 "]".
           MOVE "ABCDEF" TO WS-FLAT.
           INITIALIZE WS-SUB2 REPLACING ALPHANUMERIC DATA BY "ZZZ".
           DISPLAY "AFTER2 FLAT=[" WS-FLAT "] SUB1=[" WS-SUB1
               "] SUB2=[" WS-SUB2 "]".
           STOP RUN.
