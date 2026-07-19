      * kk09 (round 35): SEARCH ALL over a table declared UNDER a REDEFINES
      * (rather than directly under a plain group or 01-record) - WS-VIEW
      * REDEFINES the flat WS-FLAT text field, and WS-ENTRY (the ASCENDING-
      * KEY, INDEXED-BY table SEARCH ALL needs) is WS-VIEW's own child. No
      * existing corpus program combines SEARCH ALL with REDEFINES at all.
      * cobc compiles and runs this correctly (a binary search over the
      * REDEFINES'd view finds KEY=3's own TAG=C at index 3, and correctly
      * reports NOTFOUND for a KEY that doesn't exist).
      *
      * THE ENGINE'S BUG (DISHONEST - Scala COMPILE crash): the generated
      * Scala fails with `Not found: wsIdx` (WS-IDX's own INDEXED BY var is
      * never declared at all) plus a `() // SEARCH WS-ENTRY: no OCCURS/
      * INDEXED BY metadata found for this table` comment where the actual
      * SEARCH ALL body should be.
      *
      * ROOT CAUSE (traced to source): WS-VIEW REDEFINES WS-FLAT (an
      * elementary PIC X(20) target) routes through
      * `characterSlicedGroupRedefinesLines` (scala-generator.js), since
      * WS-FLAT is elementary/String-typed and WS-VIEW has real children.
      * That function's own `walk()` helper explicitly declines to recurse
      * into a child that is BOTH a group AND OCCURS-bearing (round-18
      * finding 7's own `!hasOccurs(child)` guard, added deliberately for a
      * DIFFERENT, narrower reason - see that finding's own doc comment,
      * which frames the consequence as "zero-width, honest limitation").
      * WS-ENTRY (`OCCURS 5 TIMES ASCENDING KEY IS WS-KEY INDEXED BY
      * WS-IDX`) hits exactly this guard and falls through to
      * `processLeaf`'s plain-elementary-sizing path instead, which reads
      * `child.pic.length` - `undefined` for a GROUP (WS-ENTRY has no `.pic`
      * of its own) - producing a silent ZERO-width slice for the whole
      * table AND, critically, never calling `tableRegistry.set(...)` for
      * WS-ENTRY at all (only the ordinary FIELD registry gets an entry,
      * via `registry.set(...)` a few lines below). `generateSearch`
      * (expression-gen.js) looks up SEARCH's own target table via
      * `lookupTable(tableName)` against that SAME `tableRegistry` - finding
      * nothing, it degrades to the visible `() // SEARCH ...: no OCCURS/
      * INDEXED BY metadata found` comment. But WS-IDX's own flat `var`
      * declaration ALSO depends on that same top-level `hasOccurs(item)`
      * walk (the OUTER record-walking loop in scala-generator.js, entirely
      * separate from `characterSlicedGroupRedefinesLines`'s own inner
      * walk) ever reaching WS-ENTRY with its OCCURS metadata intact - since
      * it never does here, `wsIdx` is never declared as a var anywhere in
      * the file, so `SET WS-IDX TO 1` (which DOES compile - SET doesn't
      * consult tableRegistry) produces a bare, undeclared-identifier
      * reference: a hard Scala COMPILE FAILURE, not merely the "honest,
      * zero-width limitation" round-18's own comment anticipated for this
      * class of shape. Every other REDEFINES-over-unsupported-group-shape
      * branch in this same file (lines ~1328, ~1730, ~1860, ~1892, ~1926)
      * emits a visible, COMPILING `??? TODO` marker instead of crashing -
      * this is the one straggler that still produces a raw, non-compiling
      * reference, the same crash-vs-decline distinction round-33 finding 2
      * (ii06) fixed for a different REDEFINES shape.
      *
      * LIKELY FIX: either (a) extend `characterSlicedGroupRedefinesLines`'s
      * `walk()`/`processLeaf()` to register OCCURS-bearing group children
      * into `tableRegistry` too (ideally with a real, working SEARCH/
      * SEARCH ALL implementation, mirroring how an ordinary top-level
      * table-of-groups already gets registered), or, at minimum, (b) make
      * `SET <index> TO ...`/any other reference to an index name whose
      * owning table never made it into `tableRegistry` degrade to a
      * visible, COMPILING marker (consistent with round-33 finding 2's own
      * crash-to-decline precedent) instead of leaving `wsIdx` completely
      * undeclared.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK09SEARCHREDEF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FLAT PIC X(20) VALUE "01A02B03C04D05E".
       01  WS-VIEW REDEFINES WS-FLAT.
           05  WS-ENTRY OCCURS 5 TIMES
               ASCENDING KEY IS WS-KEY
               INDEXED BY WS-IDX.
               10  WS-KEY  PIC 9(2).
               10  WS-TAG  PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET WS-IDX TO 1.
           SEARCH ALL WS-ENTRY
               AT END
                   DISPLAY "NOTFOUND"
               WHEN WS-KEY(WS-IDX) = 3
                   DISPLAY "FOUND TAG=" WS-TAG(WS-IDX)
                       " AT IDX=" WS-IDX
           END-SEARCH.
           SET WS-IDX TO 1.
           SEARCH ALL WS-ENTRY
               AT END
                   DISPLAY "NOTFOUND KEY=9"
               WHEN WS-KEY(WS-IDX) = 9
                   DISPLAY "FOUND TAG=" WS-TAG(WS-IDX)
           END-SEARCH.
           STOP RUN.
