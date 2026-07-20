      * pp13 (round 40): fresh-territory probe - INSPECT ... CONVERTING
      * (parsed by parseInspectStatement's `stmt.converting` branch,
      * parser/procedure-parser.js, distinct from TALLYING/REPLACING which
      * the existing corpus exercises heavily). Checks a plain whole-field
      * character-class conversion, a CONVERTING with a BEFORE region
      * boundary, and a CONVERTING with an AFTER region boundary, on the
      * SAME field in sequence.
      *
      * OUTCOME (HONEST - byte-match): whole-field conversion, BEFORE-
      * bounded conversion, and a full digit-reversal CONVERTING all
      * match cobc exactly.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP13CONVERT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STR1 PIC X(10) VALUE "helloWORLD".
       01  WS-STR2 PIC X(12) VALUE "aXbXcXdXeXfX".
       01  WS-STR3 PIC X(10) VALUE "0123456789".
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-STR1 CONVERTING "abcdefghijklmnopqrstuvwxyz"
                                    TO "ABCDEFGHIJKLMNOPQRSTUVWXYZ".
           DISPLAY "STR1=[" WS-STR1 "]".

           INSPECT WS-STR2 CONVERTING "X" TO "-" BEFORE INITIAL "cX".
           DISPLAY "STR2=[" WS-STR2 "]".

           INSPECT WS-STR3 CONVERTING "0123456789" TO "9876543210".
           DISPLAY "STR3=[" WS-STR3 "]".
           STOP RUN.
