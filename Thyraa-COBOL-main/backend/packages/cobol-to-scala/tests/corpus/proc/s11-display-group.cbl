       IDENTIFICATION DIVISION.
       PROGRAM-ID. S11DISPGRP.
      * Round-5 attack: DISPLAY of a whole group item (raw
      * concatenated storage, no separators), DISPLAY mixing an
      * alphanumeric literal/numeric field/edited field on one
      * statement, and DISPLAY ... WITH NO ADVANCING chained across
      * two statements onto one physical output line.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-TAG          PIC X(3) VALUE "ABC".
           05  WS-NUM          PIC 9(3) VALUE 42.
       01  WS-EDITED           PIC ZZ9.99 VALUE 7.5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-GROUP.
           DISPLAY "MIX=" WS-TAG " " WS-NUM " " WS-EDITED.
           DISPLAY "NOADV-1-" WITH NO ADVANCING.
           DISPLAY "NOADV-2".
           STOP RUN.
