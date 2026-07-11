       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y14EVALSO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS         PIC X(1) VALUE "A".
           88  STATUS-ACTIVE      VALUE "A".
           88  STATUS-INACTIVE    VALUE "I".
       01  WS-CODE           PIC 9(2) VALUE 10.
       01  WS-I              PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               EVALUATE WS-I
               WHEN 1
                   MOVE "A" TO WS-STATUS
                   MOVE 10 TO WS-CODE
               WHEN 2
                   MOVE "I" TO WS-STATUS
                   MOVE 20 TO WS-CODE
               WHEN 3
                   MOVE "A" TO WS-STATUS
                   MOVE 99 TO WS-CODE
               WHEN 4
                   MOVE "X" TO WS-STATUS
                   MOVE 20 TO WS-CODE
               END-EVALUATE

               EVALUATE TRUE ALSO WS-CODE
                   WHEN STATUS-ACTIVE ALSO 10
                       DISPLAY WS-I ": ACTIVE-AND-10"
                   WHEN STATUS-INACTIVE ALSO 20
                       DISPLAY WS-I ": INACTIVE-AND-20"
                   WHEN STATUS-ACTIVE ALSO ANY
                       DISPLAY WS-I ": ACTIVE-ANY-CODE"
                   WHEN OTHER
                       DISPLAY WS-I ": OTHER-CASE"
               END-EVALUATE
           END-PERFORM.
           STOP RUN.
