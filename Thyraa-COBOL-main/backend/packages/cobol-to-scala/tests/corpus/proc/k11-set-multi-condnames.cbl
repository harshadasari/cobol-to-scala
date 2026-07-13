      * Adversarial (round 22): "SET condition-name-1, condition-name-2
      * TO TRUE" - a SINGLE SET statement naming TWO different 88-level
      * condition-names (on two different parent fields) at once. Round-
      * 1 finding 2 fixed SET condition-name TO TRUE for the single-name
      * form only (assign the parent field its own first declared
      * VALUE) - this checks the multi-target list form composes
      * correctly, both parents getting their own respective VALUE.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K11SETMULTI.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG-A PIC X VALUE "N".
           88 FLAG-A-ON VALUE "Y".
       01 WS-FLAG-B PIC X VALUE "N".
           88 FLAG-B-ON VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE A=" WS-FLAG-A " B=" WS-FLAG-B.
           SET FLAG-A-ON, FLAG-B-ON TO TRUE.
           DISPLAY "AFTER A=" WS-FLAG-A " B=" WS-FLAG-B.
           STOP RUN.
