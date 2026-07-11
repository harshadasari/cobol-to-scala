       IDENTIFICATION DIVISION.
       PROGRAM-ID. V06-INSPECT-COMBINED.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-STR       PIC X(20) VALUE "AABBCCAABBCCXYAABBCC".
       01 WS-CNT-A     PIC 9(4) VALUE 0.
       01 WS-CNT-B     PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-STR TALLYING WS-CNT-A FOR ALL "A"
                                    WS-CNT-B FOR ALL "B"
                       BEFORE INITIAL "XY".
           DISPLAY "CNT-A=" WS-CNT-A " CNT-B=" WS-CNT-B.
           INSPECT WS-STR REPLACING ALL "A" BY "1"
                       AFTER INITIAL "XY".
           DISPLAY "STR=" WS-STR.
           STOP RUN.
