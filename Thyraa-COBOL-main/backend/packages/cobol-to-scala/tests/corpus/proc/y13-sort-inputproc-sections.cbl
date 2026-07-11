       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y13SRTIP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "SORTWK1".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-KEY     PIC 9(3).
           05  SORT-VAL     PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-I             PIC 9(3).
       01  WS-EOF           PIC X VALUE 'N'.
       01  WS-INIT-FLAG     PIC X(6) VALUE "NOINIT".
       01  WS-DATA.
           05  WS-ENTRY OCCURS 4 TIMES.
               10  WS-K     PIC 9(3).
               10  WS-V     PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 300 TO WS-K(1). MOVE "CCCCC" TO WS-V(1).
           MOVE 100 TO WS-K(2). MOVE "AAAAA" TO WS-V(2).
           MOVE 400 TO WS-K(3). MOVE "DDDDD" TO WS-V(3).
           MOVE 200 TO WS-K(4). MOVE "BBBBB" TO WS-V(4).

           SORT SORT-FILE ON ASCENDING KEY SORT-KEY
               INPUT PROCEDURE IS FEED-SECTION
               OUTPUT PROCEDURE IS DRAIN-SECTION.
           DISPLAY "SORT-DONE FLAG=" WS-INIT-FLAG.
           STOP RUN.

       INIT-SECTION SECTION.
       INIT-MAIN.
           MOVE "INITOK" TO WS-INIT-FLAG.
           DISPLAY "INIT-SECTION-RAN".

       FEED-SECTION SECTION.
       FEED-MAIN.
           PERFORM INIT-SECTION.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               MOVE WS-K(WS-I) TO SORT-KEY
               MOVE WS-V(WS-I) TO SORT-VAL
               RELEASE SORT-REC
           END-PERFORM.

       DRAIN-SECTION SECTION.
       DRAIN-MAIN.
           PERFORM DRAIN-ONE UNTIL WS-EOF = 'Y'.
           DISPLAY "DRAIN-DONE".
       DRAIN-ONE.
           RETURN SORT-FILE
               AT END
                   MOVE 'Y' TO WS-EOF
               NOT AT END
                   DISPLAY "REC=" SORT-KEY " " SORT-VAL.
