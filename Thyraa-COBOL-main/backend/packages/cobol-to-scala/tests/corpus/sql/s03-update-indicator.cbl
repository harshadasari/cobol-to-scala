       IDENTIFICATION DIVISION.
       PROGRAM-ID. S03UPD.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-EMP-ID            PIC X(6).
       01  WS-SALARY            PIC S9(7)V99 COMP-3.
       01  WS-SALARY-IND        PIC S9(4) COMP.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 'E0001' TO WS-EMP-ID
           MOVE 0 TO WS-SALARY-IND
           EXEC SQL
               UPDATE EMP
                  SET SALARY = :WS-SALARY:WS-SALARY-IND
                WHERE EMP-ID = :WS-EMP-ID
           END-EXEC
           STOP RUN.
