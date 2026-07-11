      * Round-12 probe z06: STRING and UNSTRING each used TWICE in a row,
      * sharing the SAME WITH POINTER identifier across both consecutive
      * statements (no reset between them) - the second statement must
      * resume exactly where the first left the pointer, not restart at 1.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z06PTRCHN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TARGET   PIC X(20) VALUE SPACES.
       01  WS-PTR      PIC 9(3) VALUE 1.
       01  WS-SRC      PIC X(20) VALUE "AA:BB:CC:DD".
       01  WS-UPTR     PIC 9(3) VALUE 1.
       01  WS-F1       PIC X(5).
       01  WS-F2       PIC X(5).
       01  WS-F3       PIC X(5).
       01  WS-F4       PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING "HELLO" DELIMITED BY SIZE
                  " " DELIMITED BY SIZE
               INTO WS-TARGET
               WITH POINTER WS-PTR
           END-STRING.
           STRING "WORLD" DELIMITED BY SIZE
                  "!" DELIMITED BY SIZE
               INTO WS-TARGET
               WITH POINTER WS-PTR
           END-STRING.
           DISPLAY "TARGET=[" WS-TARGET "]" " PTR=" WS-PTR.

           UNSTRING WS-SRC DELIMITED BY ":"
               INTO WS-F1 WS-F2
               WITH POINTER WS-UPTR
           END-UNSTRING.
           UNSTRING WS-SRC DELIMITED BY ":"
               INTO WS-F3 WS-F4
               WITH POINTER WS-UPTR
           END-UNSTRING.
           DISPLAY "F1=[" WS-F1 "] F2=[" WS-F2 "] F3=[" WS-F3
               "] F4=[" WS-F4 "] UPTR=" WS-UPTR.
           STOP RUN.
