      * ff09: A COMP-1 (Float) field used as a SORT KEY - round-28/29
      * built a real IEEE-754 byte codec for COMP-1/COMP-2 file-record
      * fields, but every SORT corpus program to date sorts on
      * DISPLAY/COMP-3/binary numeric keys only. SORT key comparison in
      * real COBOL compares the field's actual numeric value; this
      * checks the generated Scala's SORT-key comparator does the same
      * for a Float-typed key (not, say, a byte-wise/string comparison
      * of the field's internal binary representation, which would
      * silently produce nonsense ordering), including negative values.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF09SORTF.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "FF09IN.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT SORT-FILE ASSIGN TO "FF09SRT.DAT".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE.
       01  IN-REC.
           05  IN-ID           PIC 9(2).
           05  IN-VAL          PIC S9(3)V99.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-ID         PIC 9(2).
           05  SORT-KEY-F      COMP-1.
       WORKING-STORAGE SECTION.
       01  WS-EOF              PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT IN-FILE.
           MOVE 1 TO IN-ID.
           MOVE 30.5 TO IN-VAL.
           WRITE IN-REC.
           MOVE 2 TO IN-ID.
           MOVE -12.25 TO IN-VAL.
           WRITE IN-REC.
           MOVE 3 TO IN-ID.
           MOVE 7.0 TO IN-VAL.
           WRITE IN-REC.
           MOVE 4 TO IN-ID.
           MOVE -0.12 TO IN-VAL.
           WRITE IN-REC.
           MOVE 5 TO IN-ID.
           MOVE 99.75 TO IN-VAL.
           WRITE IN-REC.
           CLOSE IN-FILE.

           SORT SORT-FILE ON ASCENDING KEY SORT-KEY-F
               INPUT PROCEDURE IS LOAD-SORT
               OUTPUT PROCEDURE IS UNLOAD-SORT.
           STOP RUN.

       LOAD-SORT.
           OPEN INPUT IN-FILE.
           PERFORM UNTIL WS-EOF = "Y"
               READ IN-FILE
                   AT END MOVE "Y" TO WS-EOF
                   NOT AT END
                       MOVE IN-ID TO SORT-ID
                       MOVE IN-VAL TO SORT-KEY-F
                       RELEASE SORT-REC
               END-READ
           END-PERFORM.
           CLOSE IN-FILE.

       UNLOAD-SORT.
           PERFORM UNTIL 1 = 2
               RETURN SORT-FILE
                   AT END EXIT PERFORM
               END-RETURN
               DISPLAY "SORTED ID=" SORT-ID " KEY=" SORT-KEY-F
           END-PERFORM.
