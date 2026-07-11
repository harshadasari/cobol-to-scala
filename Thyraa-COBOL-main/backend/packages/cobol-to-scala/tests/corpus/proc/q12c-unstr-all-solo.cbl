       IDENTIFICATION DIVISION.
       PROGRAM-ID. UNSTR04.
      *
      * Isolation follow-up to unstr02: DELIMITED BY ALL alone, a
      * single UNSTRING statement (avoids the multi-UNSTRING _parts
      * collision so this runs to completion under the generated
      * Scala too).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC              PIC X(10) VALUE 'A,,B,,,C'.
       01  WS-T1               PIC X(5).
       01  WS-T2               PIC X(5).
       01  WS-T3               PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           UNSTRING WS-SRC DELIMITED BY ALL ','
               INTO WS-T1 WS-T2 WS-T3
           END-UNSTRING
           DISPLAY 'T1=' WS-T1
           DISPLAY 'T2=' WS-T2
           DISPLAY 'T3=' WS-T3
           STOP RUN.
