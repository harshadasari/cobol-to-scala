       IDENTIFICATION DIVISION.
       PROGRAM-ID. P18STRING.
      *
      * Phase 2 corpus target (already partly supported): STRING,
      * UNSTRING, and INSPECT (TALLYING / REPLACING / CONVERTING).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FIRST            PIC X(10) VALUE 'JOHN'.
       01  WS-LAST             PIC X(10) VALUE 'SMITH'.
       01  WS-FULL             PIC X(21) VALUE SPACES.
       01  WS-PTR              PIC 9(2) VALUE 1.
       01  WS-CSV              PIC X(20) VALUE 'AAA,BBB,CCCCC'.
       01  WS-F1               PIC X(5).
       01  WS-F2               PIC X(5).
       01  WS-F3               PIC X(5).
       01  WS-CNT              PIC 9(1) VALUE 0.
       01  WS-WORD             PIC X(11) VALUE 'MISSISSIPPI'.
       01  WS-COUNT-S          PIC 9(2) VALUE 0.
       01  WS-CONVERT-SRC      PIC X(11) VALUE 'hello world'.
       PROCEDURE DIVISION.
       0000-MAIN.
           STRING WS-FIRST DELIMITED BY SPACE
                  ' ' DELIMITED BY SIZE
                  WS-LAST DELIMITED BY SPACE
                  INTO WS-FULL
                  WITH POINTER WS-PTR
           END-STRING
           DISPLAY 'FULL=' WS-FULL
           DISPLAY 'PTR-AFTER=' WS-PTR
      *
           UNSTRING WS-CSV DELIMITED BY ','
               INTO WS-F1 WS-F2 WS-F3
               TALLYING IN WS-CNT
           END-UNSTRING
           DISPLAY 'F1=' WS-F1
           DISPLAY 'F2=' WS-F2
           DISPLAY 'F3=' WS-F3
           DISPLAY 'FIELD-COUNT=' WS-CNT
      *
           INSPECT WS-WORD TALLYING WS-COUNT-S FOR ALL 'S'
           DISPLAY 'COUNT-S=' WS-COUNT-S
      *
           INSPECT WS-WORD REPLACING ALL 'S' BY 'Z'
           DISPLAY 'WORD-AFTER-REPLACE=' WS-WORD
      *
           INSPECT WS-CONVERT-SRC CONVERTING 'aeiou' TO 'AEIOU'
           DISPLAY 'CONVERTED=' WS-CONVERT-SRC
           STOP RUN.
