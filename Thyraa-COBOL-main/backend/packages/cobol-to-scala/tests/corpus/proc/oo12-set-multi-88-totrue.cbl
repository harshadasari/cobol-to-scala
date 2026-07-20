      * oo12 (round 39): fresh-territory probe - SET ... TO TRUE naming
      * MULTIPLE 88-level condition-names (belonging to two DIFFERENT
      * parent fields) in a single statement (`SET COND-A COND-B TO
      * TRUE`), rather than one at a time. Round 33 (z11) already covers
      * SET ... TO FALSE for one condition name; this checks the
      * multi-name variant of TO TRUE specifically.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO12SETMULTI.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS-A PIC X VALUE "N".
           88  STATUS-A-YES VALUE "Y".
           88  STATUS-A-NO VALUE "N".
       01  WS-STATUS-B PIC 9 VALUE 0.
           88  STATUS-B-ACTIVE VALUE 1.
           88  STATUS-B-INACTIVE VALUE 0.
       01  WS-STATUS-C PIC XXX VALUE "OFF".
           88  STATUS-C-ON VALUE "ON ".
           88  STATUS-C-OFF VALUE "OFF".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE A=" WS-STATUS-A " B=" WS-STATUS-B
               " C=[" WS-STATUS-C "]".
           SET STATUS-A-YES STATUS-B-ACTIVE STATUS-C-ON TO TRUE.
           DISPLAY "AFTER A=" WS-STATUS-A " B=" WS-STATUS-B
               " C=[" WS-STATUS-C "]".
           IF STATUS-A-YES AND STATUS-B-ACTIVE AND STATUS-C-ON
               DISPLAY "ALL-TRUE"
           ELSE
               DISPLAY "NOT-ALL-TRUE"
           END-IF.
           STOP RUN.
