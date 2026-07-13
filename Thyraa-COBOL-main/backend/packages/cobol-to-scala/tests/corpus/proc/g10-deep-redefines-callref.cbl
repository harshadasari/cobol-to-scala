       IDENTIFICATION DIVISION.
       PROGRAM-ID. G10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-L1.
           05  WS-L2.
               10  WS-L3.
                   15  WS-L4.
                       20  WS-CODE PIC X(4) VALUE "ABCD".
                       20  WS-NUM  PIC 9(4) VALUE 1234.
       01  WS-ALT REDEFINES WS-L1.
           05  WS-ALT-L2.
               10  WS-ALT-L3.
                   15  WS-ALT-L4.
                       20  WS-ALT-FLAT PIC X(8).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE=" WS-ALT-FLAT.
           CALL "G10SUB" USING BY REFERENCE WS-L1.
           DISPLAY "AFTER-CODE=" WS-CODE.
           DISPLAY "AFTER-NUM=" WS-NUM.
           DISPLAY "AFTER-FLAT=" WS-ALT-FLAT.
           STOP RUN.
       END PROGRAM G10MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. G10SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-L1.
           05  LK-L2.
               10  LK-L3.
                   15  LK-L4.
                       20  LK-CODE PIC X(4).
                       20  LK-NUM  PIC 9(4).
       PROCEDURE DIVISION USING LK-L1.
       SUB-PARA.
           DISPLAY "SUB-SEES-CODE=" LK-CODE.
           DISPLAY "SUB-SEES-NUM=" LK-NUM.
           MOVE "ZZZZ" TO LK-CODE.
           MOVE 9999 TO LK-NUM.
       END PROGRAM G10SUB.
