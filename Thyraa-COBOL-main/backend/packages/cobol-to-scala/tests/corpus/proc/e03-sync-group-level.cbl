       IDENTIFICATION DIVISION.
       PROGRAM-ID. E03.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-OUTER.
           05  W-LEAD PIC X(1) VALUE "X".
           05  W-GRP SYNCHRONIZED.
               10  F1 PIC X(1) VALUE "A".
               10  F2 PIC S9(4) COMP VALUE 258.
               10  F3 PIC X(1) VALUE "Z".
           05  W-TAIL PIC X(1) VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "LEN=" FUNCTION LENGTH(WS-OUTER).
           DISPLAY "LEAD=" W-LEAD.
           DISPLAY "F2=" F2.
           DISPLAY "TAIL=" W-TAIL.
           STOP RUN.
