       IDENTIFICATION DIVISION.
       PROGRAM-ID. EVALFIG1.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FIELD1  PIC X(8) VALUE SPACES.
       01 WS-FIELD2  PIC X(8) VALUE "AB".
       01 WS-FIELD3  PIC X(3) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE WS-FIELD1
               WHEN SPACES
                   DISPLAY "FIELD1 IS SPACES"
               WHEN OTHER
                   DISPLAY "FIELD1 NOT SPACES"
           END-EVALUATE.
           EVALUATE WS-FIELD2
               WHEN SPACES
                   DISPLAY "FIELD2 IS SPACES"
               WHEN OTHER
                   DISPLAY "FIELD2 NOT SPACES"
           END-EVALUATE.
           MOVE "AB" TO WS-FIELD3.
           EVALUATE SPACES
               WHEN WS-FIELD3
                   DISPLAY "SPACES EQ FIELD3"
               WHEN OTHER
                   DISPLAY "SPACES NEQ FIELD3"
           END-EVALUATE.
           STOP RUN.
