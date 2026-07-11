       IDENTIFICATION DIVISION.
       PROGRAM-ID. W01.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-LONG      PIC X(6) VALUE "AB    ".
       01 WS-SHORT     PIC X(2) VALUE "AB".
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE WS-LONG
               WHEN "AB"
                   DISPLAY "MATCHED-LITERAL"
               WHEN OTHER
                   DISPLAY "NO-MATCH-LITERAL"
           END-EVALUATE.
           EVALUATE WS-LONG
               WHEN WS-SHORT
                   DISPLAY "MATCHED-FIELD"
               WHEN OTHER
                   DISPLAY "NO-MATCH-FIELD"
           END-EVALUATE.
           STOP RUN.
