       IDENTIFICATION DIVISION.
       PROGRAM-ID. UNSTR03.
      *
      * Isolation follow-up to unstr02: DELIMITER IN alone, a single
      * UNSTRING statement in the paragraph (avoids the separate
      * multi-UNSTRING _parts collision so this runs to completion).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC              PIC X(10) VALUE 'AA,BB;CC'.
       01  WS-T1               PIC X(5).
       01  WS-D1               PIC X(1).
       01  WS-T2               PIC X(5).
       01  WS-D2               PIC X(1).
       01  WS-T3               PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           UNSTRING WS-SRC DELIMITED BY ',' OR ';'
               INTO WS-T1 DELIMITER IN WS-D1
                    WS-T2 DELIMITER IN WS-D2
                    WS-T3
           END-UNSTRING
           DISPLAY 'T1=' WS-T1
           DISPLAY 'D1=' WS-D1
           DISPLAY 'T2=' WS-T2
           DISPLAY 'D2=' WS-D2
           DISPLAY 'T3=' WS-T3
           STOP RUN.
