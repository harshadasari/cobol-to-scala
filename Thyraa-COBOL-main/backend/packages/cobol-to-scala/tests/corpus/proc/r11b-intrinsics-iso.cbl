       IDENTIFICATION DIVISION.
       PROGRAM-ID. R11BINTIS.
      *
      * Isolation follow-up for r11: same NUMVAL-with-embedded-spaces,
      * MOD sign combinations, and nested UPPER-CASE-inside-NUMVAL
      * cases, with the FUNCTION LENGTH(group-item) attack surface
      * removed (that one is independently confirmed broken via
      * r11's "Not found: wsGroup" compile error), to see how the
      * remaining intrinsics fare on their own.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NUMVAL-SRC2      PIC X(12)   VALUE ' +  12.5 '.
       01  WS-NUMVAL-RESULT2   PIC S9(3)V99.
       01  WS-MOD-A            PIC S9(3).
       01  WS-MOD-B            PIC S9(3).
       01  WS-MIXED            PIC X(10)   VALUE '  -45.6  '.
       01  WS-NESTED-RESULT    PIC S9(3)V9.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE FUNCTION NUMVAL(WS-NUMVAL-SRC2) TO WS-NUMVAL-RESULT2
           DISPLAY 'NUMVAL-RESULT2=' WS-NUMVAL-RESULT2
      *
           COMPUTE WS-MOD-A = FUNCTION MOD(7, -3)
           DISPLAY 'MOD-A=' WS-MOD-A
      *
           COMPUTE WS-MOD-B = FUNCTION MOD(-7, -3)
           DISPLAY 'MOD-B=' WS-MOD-B
      *
           COMPUTE WS-NESTED-RESULT =
               FUNCTION NUMVAL(FUNCTION UPPER-CASE(WS-MIXED))
           DISPLAY 'NESTED-RESULT=' WS-NESTED-RESULT
           STOP RUN.
