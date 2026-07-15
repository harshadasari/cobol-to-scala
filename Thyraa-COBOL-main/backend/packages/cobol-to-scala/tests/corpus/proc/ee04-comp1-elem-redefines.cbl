      * ee04: elementary REDEFINES between a COMP (binary int) field and a
      * COMP-1 (float) field sharing the same storage - does this engine's
      * "elementary REDEFINES: direct alias onto the target's storage"
      * codegen (scala-generator.js ~line 1166) correctly byte-reinterpret,
      * or does it just alias the SAME Scala value under the target's own
      * type (silently wrong for a differing-type elementary REDEFINES)?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE04ELEMREDEF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-INT      PIC S9(9) COMP VALUE 1078530011.
       01  WS-FLOAT    REDEFINES WS-INT COMP-1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "INT=" WS-INT.
           DISPLAY "FLOAT=" WS-FLOAT.
           MOVE 3.5 TO WS-FLOAT.
           DISPLAY "FLOAT2=" WS-FLOAT.
           DISPLAY "INT2=" WS-INT.
           STOP RUN.
