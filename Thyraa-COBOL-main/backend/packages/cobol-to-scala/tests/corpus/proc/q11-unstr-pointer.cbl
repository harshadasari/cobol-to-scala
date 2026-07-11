       IDENTIFICATION DIVISION.
       PROGRAM-ID. UNSTR01.
      *
      * Round-4 attack: UNSTRING WITH POINTER - must start scanning
      * the source at the pointer's initial value (not position 1),
      * and update the pointer to one-past the last character
      * consumed when done.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC              PIC X(20) VALUE 'AAA BBB CCC DDD EEE'.
       01  WS-PTR              PIC 9(2)  VALUE 5.
       01  WS-T1               PIC X(5).
       01  WS-T2               PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           UNSTRING WS-SRC DELIMITED BY SPACE
               INTO WS-T1 WS-T2
               WITH POINTER WS-PTR
           END-UNSTRING
           DISPLAY 'T1=' WS-T1
           DISPLAY 'T2=' WS-T2
           DISPLAY 'PTR-AFTER=' WS-PTR
           STOP RUN.
