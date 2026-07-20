      * pp09b (round 40): isolation follow-up for pp09's own finding - a
      * MINIMAL, non-cyclic repro. pp09's own PP09PB calls "PP09MAIN"
      * (the top-level, first-declared PROGRAM-ID, whose OWN PROCEDURE
      * DIVISION has NO USING clause at all) WITH one argument - legal
      * COBOL (a callee that doesn't declare a USING parameter simply
      * ignores any extra actual argument a caller supplies; cobc raises
      * no error for the argument-count mismatch itself). This engine's
      * cross-program CALL_PROGRAM_REGISTRY (generateMultiProgramScala,
      * generator/scala-generator.js) records each callee's own declared
      * `paramCount` (usingNames.length) correctly, but generateCall's
      * ordinary (non-RECURSIVE) argument-construction path
      * (generator/expression-gen.js) builds `argExprs` from the CALLER's
      * own statement.using list and passes ALL of them to
      * `<Target>.entry(...)` regardless of the callee's OWN registered
      * paramCount - never truncating (or padding) to match. Calling a
      * declared-zero-param subprogram with one argument is therefore a
      * hard Scala COMPILE crash ("too many arguments for method entry"),
      * not the honest no-op cobc itself performs for the ignored extra
      * argument.
      *
      * OUTCOME (DISHONEST - confirmed exactly as hypothesized): cobc
      * runs fine (`BEFORE`/`IN SUB (NO USING DECLARED)`/`AFTER`, exit 0).
      * The generated Scala fails to COMPILE at all: "too many arguments
      * for method entry in object Pp09bsub: (): Unit" at
      * `Pp09bsub.entry(wsN)`. This is a general bug, not specific to
      * pp09's own "calling back into the main program" shape - it
      * applies to ANY CALL passing more actual USING arguments than the
      * target's own declared PROCEDURE DIVISION USING clause. Suggested
      * fix: in generateCall's ordinary (non-`target.recursive`) path
      * (generator/expression-gen.js, where `argExprs`/`callExpr` are
      * built), truncate `argExprs` to `target.paramCount` entries before
      * joining them into the `entry(...)` call - matching cobc's own
      * "extra arguments are simply ignored" semantics, symmetric to how
      * `generateEntryMethod`'s own `_arg0: T = <default>`-style
      * parameters already handle the OPPOSITE case (fewer actual
      * arguments than declared params).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP09BMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-N PIC 9 VALUE 5.
       PROCEDURE DIVISION.
           DISPLAY "BEFORE".
           CALL "PP09BSUB" USING WS-N.
           DISPLAY "AFTER".
           STOP RUN.
       END PROGRAM PP09BMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP09BSUB.
       PROCEDURE DIVISION.
           DISPLAY "IN SUB (NO USING DECLARED)".
           GOBACK.
       END PROGRAM PP09BSUB.
