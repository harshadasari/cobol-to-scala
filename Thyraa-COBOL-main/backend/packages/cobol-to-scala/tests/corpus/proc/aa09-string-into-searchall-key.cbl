       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1310.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 5 ASCENDING KEY IS WS-KEY
               INDEXED BY WS-IDX.
               10  WS-KEY      PIC X(6).
               10  WS-VAL      PIC 9(3).
       01  WS-PART1            PIC X(3) VALUE "AB".
       01  WS-PART2            PIC X(3) VALUE "099".
       01  WS-SEARCH-KEY       PIC X(6).
       01  WS-FOUND-VAL        PIC 9(3).
       01  WS-FOUND-FLAG       PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AB001 " TO WS-KEY(1).  MOVE 10 TO WS-VAL(1).
           MOVE "AB050 " TO WS-KEY(2).  MOVE 20 TO WS-VAL(2).
           MOVE "AB099 " TO WS-KEY(3).  MOVE 30 TO WS-VAL(3).
           MOVE "AB150 " TO WS-KEY(4).  MOVE 40 TO WS-VAL(4).
           MOVE "ZZ999 " TO WS-KEY(5).  MOVE 50 TO WS-VAL(5).

           STRING WS-PART1 DELIMITED BY SPACE
                  WS-PART2 DELIMITED BY SIZE
                  INTO WS-SEARCH-KEY.

           MOVE "NO " TO WS-FOUND-FLAG.
           MOVE 0 TO WS-FOUND-VAL.
           SEARCH ALL WS-ENTRY
               AT END
                   MOVE "NO " TO WS-FOUND-FLAG
               WHEN WS-KEY(WS-IDX) = WS-SEARCH-KEY
                   MOVE "YES" TO WS-FOUND-FLAG
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND-VAL
           END-SEARCH.
           DISPLAY "SEARCH-KEY=[" WS-SEARCH-KEY "]"
               " FLAG=" WS-FOUND-FLAG " VAL=" WS-FOUND-VAL.
           STOP RUN.
