       IDENTIFICATION DIVISION.
       PROGRAM-ID. S07INITREP.
      * Round-5 attack: INITIALIZE on a group containing FILLER, an
      * OCCURS table, and a REDEFINES sibling, using the REPLACING
      * clause to override the default-initial value for one
      * category (ALPHANUMERIC) while leaving NUMERIC fields at their
      * usual zero.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-NAME         PIC X(5) VALUE "NAMEX".
           05  FILLER          PIC X(2) VALUE "ZZ".
           05  WS-AMOUNT       PIC 9(4) VALUE 9999.
           05  WS-TABLE OCCURS 3 TIMES.
               10  WS-ITEM     PIC X(3) VALUE "OLD".
       01  WS-ALT REDEFINES WS-GROUP.
           05  WS-ALT-BYTES    PIC X(16).
       PROCEDURE DIVISION.
       MAIN-PARA.
           INITIALIZE WS-GROUP
               REPLACING ALPHANUMERIC DATA BY "Q".
           DISPLAY "NAME=[" WS-NAME "]".
           DISPLAY "AMOUNT=" WS-AMOUNT.
           DISPLAY "ITEM1=[" WS-ITEM(1) "]".
           DISPLAY "ITEM2=[" WS-ITEM(2) "]".
           DISPLAY "ITEM3=[" WS-ITEM(3) "]".
           STOP RUN.
