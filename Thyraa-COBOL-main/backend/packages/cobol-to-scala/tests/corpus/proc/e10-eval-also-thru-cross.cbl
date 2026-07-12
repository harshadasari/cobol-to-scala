       IDENTIFICATION DIVISION.
       PROGRAM-ID. E10.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9.
       01 WS-B PIC 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-A FROM 1 BY 1 UNTIL WS-A > 2
               PERFORM VARYING WS-B FROM 1 BY 1 UNTIL WS-B > 2
                   PERFORM SECA-P1 THRU SECB-P2
               END-PERFORM
           END-PERFORM.
           DISPLAY "DONE".
           STOP RUN.

       SECTION-A SECTION.
       SECA-P1.
           DISPLAY "ENTER A=" WS-A " B=" WS-B.
           EVALUATE WS-A ALSO WS-B
               WHEN 1 ALSO 1
                   DISPLAY "CASE-11"
               WHEN 1 ALSO ANY
                   DISPLAY "CASE-1X"
               WHEN ANY ALSO 2
                   DISPLAY "CASE-X2"
               WHEN OTHER
                   DISPLAY "CASE-OTHER"
           END-EVALUATE.
       SECA-P2.
           DISPLAY "IN SECA-P2".

       SECTION-B SECTION.
       SECB-P1.
           DISPLAY "IN SECB-P1".
       SECB-P2.
           DISPLAY "IN SECB-P2".
