       IDENTIFICATION DIVISION.
       PROGRAM-ID. STR01.
      *
      * Round-4 attack: STRING ... DELIMITED BY <identifier> (a
      * non-literal, field-valued delimiter, including a
      * multi-character one) mixed with DELIMITED BY SIZE sources,
      * plus WITH POINTER tracking across all of it.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DELIM            PIC X(3)  VALUE '###'.
       01  WS-A                PIC X(15) VALUE 'HELLO###WORLD12'.
       01  WS-B                PIC X(5)  VALUE 'DONE!'.
       01  WS-TARGET           PIC X(25) VALUE SPACES.
       01  WS-PTR              PIC 9(2)  VALUE 1.
       PROCEDURE DIVISION.
       0000-MAIN.
           STRING WS-A DELIMITED BY WS-DELIM
                  '-' DELIMITED BY SIZE
                  WS-B DELIMITED BY SIZE
                  INTO WS-TARGET
                  WITH POINTER WS-PTR
           END-STRING
           DISPLAY 'TARGET=' WS-TARGET
           DISPLAY 'PTR-AFTER=' WS-PTR
           STOP RUN.
