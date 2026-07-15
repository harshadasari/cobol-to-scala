      * ee03: COMP-1/COMP-2 combined with REDEFINES - a group WITH a
      * COMP-1 child is REDEFINED by a second group with different named
      * children (group-over-group REDEFINES, groupOverGroupRedefinesLines)
      * - flattenRedefinesLeaves/flattenRedefinesLeavesBytes both bail on
      * a 'legacy'-codec (Float/Double) child, so this should hit the
      * honest todoStubRedefinesLines decline, not silently wrong output.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE03COMP1REDEF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A.
           05  WS-A1   PIC XX      VALUE "HI".
           05  WS-A2   COMP-1      VALUE 3.5.
       01  WS-B REDEFINES WS-A.
           05  WS-B1   PIC X(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "A1=" WS-A1.
           DISPLAY "A2=" WS-A2.
           DISPLAY "B1=" WS-B1.
           STOP RUN.
