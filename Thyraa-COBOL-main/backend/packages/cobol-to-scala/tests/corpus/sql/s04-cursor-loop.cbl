       IDENTIFICATION DIVISION.
       PROGRAM-ID. S04CUR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DEPT-NAME         PIC X(20).
       01  WS-DEPT-ID           PIC 9(4).
       01  WS-EOF-SW            PIC X(01).
       PROCEDURE DIVISION.
       0000-MAIN.
           EXEC SQL
               DECLARE DEPT-CURSOR CURSOR FOR
                   SELECT DEPT-NAME, DEPT-ID
                     FROM DEPT
                    WHERE ACTIVE = 1
           END-EXEC
           EXEC SQL
               OPEN DEPT-CURSOR
           END-EXEC
           EXEC SQL
               FETCH DEPT-CURSOR
                 INTO :WS-DEPT-NAME, :WS-DEPT-ID
           END-EXEC
           EXEC SQL
               CLOSE DEPT-CURSOR
           END-EXEC
           STOP RUN.
