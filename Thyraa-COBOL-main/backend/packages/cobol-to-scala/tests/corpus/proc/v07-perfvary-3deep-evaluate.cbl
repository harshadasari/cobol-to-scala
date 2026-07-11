       IDENTIFICATION DIVISION.
       PROGRAM-ID. V07A.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-I        PIC 9(2) VALUE 0.
       01 WS-J        PIC 9(2) VALUE 0.
       01 WS-K        PIC 9(2) VALUE 0.
       01 WS-TOTAL    PIC 9(6) VALUE 0.
       01 WS-CLASS    PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 2
             AFTER WS-J FROM 1 BY 1 UNTIL WS-J > 2
             AFTER WS-K FROM 1 BY 1 UNTIL WS-K > 2
               COMPUTE WS-TOTAL = WS-TOTAL + (WS-I * 100) +
                                  (WS-J * 10) + WS-K
           END-PERFORM.
           DISPLAY "TOTAL=" WS-TOTAL " I=" WS-I " J=" WS-J " K=" WS-K.
           CALL "V07B" USING BY REFERENCE WS-TOTAL BY REFERENCE WS-CLASS.
           DISPLAY "CLASS=" WS-CLASS.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. V07B.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-TOTAL    PIC 9(6).
       01 LK-CLASS    PIC X(1).
       PROCEDURE DIVISION USING LK-TOTAL LK-CLASS.
       B-PARA.
           EVALUATE TRUE
               WHEN LK-TOTAL < 1000
                   MOVE "S" TO LK-CLASS
               WHEN LK-TOTAL < 5000
                   MOVE "M" TO LK-CLASS
               WHEN OTHER
                   MOVE "L" TO LK-CLASS
           END-EVALUATE.
           GOBACK.
       END PROGRAM V07B.
       END PROGRAM V07A.
