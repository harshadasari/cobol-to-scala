       IDENTIFICATION DIVISION.
       PROGRAM-ID. UNSTR02.
      *
      * Round-4 attack: UNSTRING DELIMITED BY ALL (consecutive
      * delimiters must collapse into a single logical delimiter, no
      * empty fields between them), DELIMITED BY <d1> OR <d2> (distinct
      * multi-delimiter alternation), and DELIMITER IN (the receiving
      * field that captures which literal delimiter actually matched
      * at each field boundary).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC1             PIC X(10) VALUE 'A,,B,,,C'.
       01  WS-T1A              PIC X(5).
       01  WS-T2A              PIC X(5).
       01  WS-T3A              PIC X(5).
       01  WS-SRC2             PIC X(10) VALUE 'AA,BB;CC'.
       01  WS-T1B              PIC X(5).
       01  WS-D1B              PIC X(1).
       01  WS-T2B              PIC X(5).
       01  WS-D2B              PIC X(1).
       01  WS-T3B              PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
      *    Sub-test A: DELIMITED BY ALL "," must collapse the double
      *    and triple comma runs to single logical delimiters.
           UNSTRING WS-SRC1 DELIMITED BY ALL ','
               INTO WS-T1A WS-T2A WS-T3A
           END-UNSTRING
           DISPLAY 'A-T1=' WS-T1A
           DISPLAY 'A-T2=' WS-T2A
           DISPLAY 'A-T3=' WS-T3A
      *
      *    Sub-test B: DELIMITED BY "," OR ";" with DELIMITER IN
      *    capturing which literal delimiter matched at each boundary.
           UNSTRING WS-SRC2 DELIMITED BY ',' OR ';'
               INTO WS-T1B DELIMITER IN WS-D1B
                    WS-T2B DELIMITER IN WS-D2B
                    WS-T3B
           END-UNSTRING
           DISPLAY 'B-T1=' WS-T1B
           DISPLAY 'B-D1=' WS-D1B
           DISPLAY 'B-T2=' WS-T2B
           DISPLAY 'B-D2=' WS-D2B
           DISPLAY 'B-T3=' WS-T3B
      *
           STOP RUN.
