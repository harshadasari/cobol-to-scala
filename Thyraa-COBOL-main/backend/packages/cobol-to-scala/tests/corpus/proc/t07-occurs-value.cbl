       IDENTIFICATION DIVISION.
       PROGRAM-ID. T07OCCVALUE.
      * Round-6 attack: VALUE clause directly on an OCCURS elementary
      * item (legal COBOL - every occurrence is initialized to the
      * same value) and on an OCCURS group's child items. No prior
      * corpus program declares VALUE alongside OCCURS on the item
      * that itself repeats.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNTERS.
           05  WS-COUNT OCCURS 4 TIMES PIC 9(3) VALUE ZERO.
       01  WS-FLAGS.
           05  WS-FLAG  OCCURS 3 TIMES PIC X(1) VALUE 'N'.
       01  WS-I                PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               DISPLAY "COUNT(" WS-I ")=" WS-COUNT(WS-I)
           END-PERFORM.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY "FLAG(" WS-I ")=[" WS-FLAG(WS-I) "]"
           END-PERFORM.
           ADD 5 TO WS-COUNT(2).
           MOVE 'Y' TO WS-FLAG(1).
           DISPLAY "AFTER-COUNT(2)=" WS-COUNT(2).
           DISPLAY "AFTER-FLAG(1)=[" WS-FLAG(1) "]".
           DISPLAY "UNCHANGED-COUNT(1)=" WS-COUNT(1).
           STOP RUN.
