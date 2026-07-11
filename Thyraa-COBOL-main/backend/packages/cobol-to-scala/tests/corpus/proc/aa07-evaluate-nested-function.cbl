       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1306.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NAME             PIC X(20) VALUE "  hello  ".
       01  WS-OTHER            PIC X(20) VALUE "  world  ".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY FUNCTION UPPER-CASE(FUNCTION TRIM(WS-NAME)).

           EVALUATE FUNCTION UPPER-CASE(FUNCTION TRIM(WS-NAME))
               WHEN "HELLO"
                   DISPLAY "MATCHED HELLO"
               WHEN OTHER
                   DISPLAY "NO MATCH 1"
           END-EVALUATE.

           EVALUATE FUNCTION UPPER-CASE(FUNCTION TRIM(WS-OTHER))
               WHEN "HELLO"
                   DISPLAY "MATCHED HELLO"
               WHEN OTHER
                   DISPLAY "NO MATCH 2"
           END-EVALUATE.

           STOP RUN.
