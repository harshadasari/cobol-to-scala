       IDENTIFICATION DIVISION.
       PROGRAM-ID. INSP01.
      *
      * Round-4 attack: INSPECT TALLYING/REPLACING/CONVERTING with the
      * BEFORE INITIAL / AFTER INITIAL phrase, plus REPLACING FIRST /
      * LEADING (no BEFORE/AFTER) and CONVERTING a full alphabet as
      * baseline sanity checks.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CNT              PIC 9(4).
       01  WS-S1               PIC X(10).
       01  WS-S2               PIC X(10).
       01  WS-S3               PIC X(10).
       01  WS-S4               PIC X(10).
       01  WS-S6               PIC X(10).
       01  WS-S7               PIC X(12).
       01  WS-ALPHA-FROM       PIC X(26)
                                VALUE 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.
       01  WS-ALPHA-TO         PIC X(26)
                                VALUE 'NOPQRSTUVWXYZABCDEFGHIJKLM'.
       01  WS-MSG              PIC X(10) VALUE 'HELLO'.
       PROCEDURE DIVISION.
       0000-MAIN.
      *    Test 1: TALLYING FOR ALL ... BEFORE INITIAL
           MOVE 0 TO WS-CNT
           MOVE 'AAZAAAAZAA' TO WS-S1
           INSPECT WS-S1 TALLYING WS-CNT FOR ALL 'A' BEFORE INITIAL 'Z'
           DISPLAY 'T1-CNT=' WS-CNT
      *
      *    Test 2: TALLYING FOR ALL ... AFTER INITIAL
           MOVE 0 TO WS-CNT
           MOVE 'AAZAAAAZAA' TO WS-S1
           INSPECT WS-S1 TALLYING WS-CNT FOR ALL 'A' AFTER INITIAL 'Z'
           DISPLAY 'T2-CNT=' WS-CNT
      *
      *    Test 3: TALLYING FOR CHARACTERS BEFORE INITIAL
           MOVE 0 TO WS-CNT
           MOVE 'AAZAAAAZAA' TO WS-S1
           INSPECT WS-S1 TALLYING WS-CNT FOR CHARACTERS
               BEFORE INITIAL 'Z'
           DISPLAY 'T3-CNT=' WS-CNT
      *
      *    Test 4: REPLACING ALL ... AFTER INITIAL
           MOVE 'AAZAAAAZAA' TO WS-S2
           INSPECT WS-S2 REPLACING ALL 'A' BY 'X' AFTER INITIAL 'Z'
           DISPLAY 'T4-S2=' WS-S2
      *
      *    Test 5: REPLACING ALL ... BEFORE INITIAL
           MOVE 'AAZAAAAZAA' TO WS-S3
           INSPECT WS-S3 REPLACING ALL 'A' BY 'X' BEFORE INITIAL 'Z'
           DISPLAY 'T5-S3=' WS-S3
      *
      *    Test 6: REPLACING FIRST (no before/after) baseline
           MOVE 'AABAABAAB1' TO WS-S4
           INSPECT WS-S4 REPLACING FIRST 'A' BY 'Q'
           DISPLAY 'T6-S4=' WS-S4
      *
      *    Test 7: REPLACING LEADING (no before/after) baseline
           MOVE 'AAABAABAAB' TO WS-S6
           INSPECT WS-S6 REPLACING LEADING 'A' BY 'Q'
           DISPLAY 'T7-S6=' WS-S6
      *
      *    Test 8: CONVERTING full alphabet (no before/after) baseline
           INSPECT WS-MSG CONVERTING WS-ALPHA-FROM TO WS-ALPHA-TO
           DISPLAY 'T8-MSG=' WS-MSG
      *
      *    Test 9: CONVERTING ... AFTER INITIAL
           MOVE 'ABABZABAB12' TO WS-S7
           INSPECT WS-S7 CONVERTING 'AB' TO 'XY' AFTER INITIAL 'Z'
           DISPLAY 'T9-S7=' WS-S7
      *
           STOP RUN.
