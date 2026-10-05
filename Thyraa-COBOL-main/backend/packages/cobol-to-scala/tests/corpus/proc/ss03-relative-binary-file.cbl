      * ss03: writes a RELATIVE file whose records carry COMP-3 and COMP
      * (binary) fields, including values whose bytes contain 0x0A (a
      * newline) - the round-29 corruption class. The program does NOT read
      * the file back or display the packed data, so stdout parity cannot
      * see a corrupted file; the written-file byte comparison can.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SS03.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "SS03REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS DYNAMIC
               RELATIVE KEY IS WS-KEY
               FILE STATUS IS FS-REL.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  R-ID            PIC 9(4).
           05  R-PACKED        PIC S9(7)V99 COMP-3.
           05  R-BIN           PIC 9(4) COMP.
           05  R-BIN2          PIC S9(9) COMP.
           05  R-NAME          PIC X(6).
       WORKING-STORAGE SECTION.
       01  FS-REL              PIC X(2).
       01  WS-KEY              PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-KEY.
           MOVE 1 TO R-ID.
           MOVE 1234567.89 TO R-PACKED.
           MOVE 10 TO R-BIN.
           MOVE 2570 TO R-BIN2.
           MOVE "NEWLN" TO R-NAME.
           WRITE REL-REC.
           MOVE 3 TO WS-KEY.
           MOVE 2 TO R-ID.
           MOVE -0.10 TO R-PACKED.
           MOVE 2570 TO R-BIN.
           MOVE -10 TO R-BIN2.
           MOVE "SPARSE" TO R-NAME.
           WRITE REL-REC.
           MOVE 2 TO WS-KEY.
           MOVE 3 TO R-ID.
           MOVE 0 TO R-PACKED.
           MOVE 0 TO R-BIN.
           MOVE 168430090 TO R-BIN2.
           MOVE "ZERO" TO R-NAME.
           WRITE REL-REC.
           CLOSE REL-FILE.
           DISPLAY "WROTE FS=" FS-REL.
           STOP RUN.
