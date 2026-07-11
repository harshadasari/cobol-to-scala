       IDENTIFICATION DIVISION.
       PROGRAM-ID. N05RELTY.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-STATUS      PIC X(1) VALUE "0".
       01 WS-EDITED      PIC ZZ9.
       01 WS-N           PIC 9(3) VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 5 TO WS-EDITED
           IF WS-STATUS = 0
               DISPLAY "STATUS-IS-ZERO"
           ELSE
               DISPLAY "STATUS-NOT-ZERO"
           END-IF
           IF WS-EDITED = WS-N
               DISPLAY "EDITED-EQUALS-N"
           ELSE
               DISPLAY "EDITED-NOT-EQUALS-N"
           END-IF
           STOP RUN.
