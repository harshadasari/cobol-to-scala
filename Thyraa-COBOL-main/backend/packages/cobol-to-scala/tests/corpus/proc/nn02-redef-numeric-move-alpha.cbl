      * nn02 (round 38): minimal isolation of the compile crash found by
      * nn01's cross-round combo probe. A NUMERIC elementary item REDEFINES-
      * ing a GROUP (WS-NUM REDEFINES WS-GROUP PIC 9(4)) is a documented,
      * intentionally-declined shape (scala-generator.js's
      * elementaryOverGroupRedefinesLines, "itemBaseType !== 'String'"
      * branch - the getter is stubbed to a compiling `??? : Int`) - but
      * that decline never registers WS-NUM in the field registry, so a
      * later MOVE of WS-NUM into a plain alphanumeric target skips
      * renderVariableMoveSource's numeric-to-digit-text conversion entirely
      * (sourceInfo is null) and falls back to treating WS-NUM's raw Int-
      * typed accessor call as if it already were a String, feeding it
      * straight into CobolFmt.fitLeft(intExpr, width) - a hard Scala
      * COMPILE ERROR (Found: Int, Required: String), not the intended
      * honest `???`/no-op decline.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN02MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-A PIC 99 VALUE 12.
           05  WS-B PIC 99 VALUE 34.
       01  WS-NUM REDEFINES WS-GROUP PIC 9(4).
       01  WS-TARGET PIC X(10) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-NUM TO WS-TARGET.
           DISPLAY "TARGET=[" WS-TARGET "]".
           STOP RUN.
