       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y15PUCOMP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-N              PIC 9(2) VALUE 0.
       01  WS-STATE          PIC X(1) VALUE "R".
           88  IS-RUNNING         VALUE "R".
           88  IS-STOPPED         VALUE "S".
       01  WS-FLAG           PIC X(1) VALUE "N".
           88  IS-FORCED          VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM UNTIL IS-STOPPED OR (WS-N > 3 AND NOT IS-FORCED)
               ADD 1 TO WS-N
               DISPLAY "TICK=" WS-N
               IF WS-N = 2
                   MOVE "Y" TO WS-FLAG
               END-IF
               IF WS-N = 5
                   MOVE "S" TO WS-STATE
               END-IF
           END-PERFORM.
           DISPLAY "FINAL-N=" WS-N " STATE=" WS-STATE.
           STOP RUN.
