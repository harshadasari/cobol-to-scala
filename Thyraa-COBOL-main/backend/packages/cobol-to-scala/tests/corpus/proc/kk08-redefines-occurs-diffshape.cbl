      * kk08 (round 35): REDEFINES of an OCCURS table by a DIFFERENTLY-
      * SHAPED OCCURS table - same total byte width (8 bytes either way),
      * but a different element COUNT and a different element WIDTH:
      * WS-TABLE-A is 4 elements of PIC X(2), WS-TABLE-B (REDEFINES
      * WS-TABLE-A) is 2 elements of PIC X(4). Every existing REDEFINES-
      * over-OCCURS corpus program (bb11, g04, n06, etc.) redefines a table
      * by either a plain flat item of the SAME total width, or another
      * table sharing the SAME per-element shape - this is the first probe
      * where the REDEFINING item is ITSELF a table with genuinely
      * different element boundaries than the table it redefines. cobc
      * accepts this (with a "should not have OCCURS clause" warning on
      * the ORIGINAL definition) and correctly reinterprets the shared
      * bytes across the differing element boundaries in both directions
      * (writing through WS-TABLE-B(1) correctly splices across what were
      * WS-TABLE-A(1)/WS-TABLE-A(2)'s own two elements).
      *
      * THE ENGINE'S BUG (DISHONEST - Scala COMPILE crash): the generated
      * Scala declares `wsTableA: Vector[String]` (correct) but then
      * declares the redefiner as a plain SCALAR alias -
      *   def wsTableB: String = wsTableA
      *   def wsTableB_=(v: String): Unit = wsTableA = v
      * - i.e. whatever REDEFINES-of-elementary-by-elementary codegen path
      * produced this treated WS-TABLE-B as if it had no OCCURS clause of
      * its own at all, aliasing the ENTIRE base table as one opaque
      * "value". Meanwhile the SEPARATE table-element-access codegen path
      * (used for `WS-TABLE-B(1)`/`WS-TABLE-B(2)` in PROCEDURE DIVISION)
      * independently assumes ANY OCCURS-declared name gets Vector-indexed
      * syntax regardless of what the variable-declaration site actually
      * produced, emitting `wsTableB(0)` / `wsTableB.updated(0, "WX")` -
      * genuinely different, incompatible types (`String` vs an indexable/
      * updatable collection) for the identical identifier. This is a hard
      * type mismatch at Scala compile time ("Found: (v: String), Required:
      * Vector[String]"; "value padTo is not a member of Char"), not merely
      * a wrong runtime value.
      *
      * LIKELY FIX: the REDEFINES-of-elementary-item codegen path in
      * scala-generator.js (likely `redefinesAccessorLines`'s own no-
      * children/elementary-alias branch, or wherever a REDEFINES target
      * with NO real children gets its `def foo: T = target` / `def
      * foo_=(v: T): Unit = target = v` alias emitted) needs to check
      * whether the REDEFINING item ITSELF carries an OCCURS clause before
      * choosing a plain scalar alias - when it does, this needs the SAME
      * kind of per-element character-slicing treatment
      * characterSlicedGroupRedefinesLines already uses for a GROUP
      * redefiner's own OCCURS children (round-18 finding 7's own `walk`/
      * `processLeaf` helpers), just applied to WS-TABLE-B's OWN element
      * boundaries (4 bytes each, 2 elements) instead of WS-TABLE-A's (2
      * bytes each, 4 elements) - not a bare same-type-as-target alias.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK08REDEFTBL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-TABLE-A OCCURS 4 TIMES PIC X(2).
           05  WS-TABLE-B REDEFINES WS-TABLE-A OCCURS 2 TIMES PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO WS-TABLE-A(1).
           MOVE "BB" TO WS-TABLE-A(2).
           MOVE "CC" TO WS-TABLE-A(3).
           MOVE "DD" TO WS-TABLE-A(4).
           DISPLAY "B1=[" WS-TABLE-B(1) "]".
           DISPLAY "B2=[" WS-TABLE-B(2) "]".
           MOVE "WXYZ" TO WS-TABLE-B(1).
           DISPLAY "A1=[" WS-TABLE-A(1) "]".
           DISPLAY "A2=[" WS-TABLE-A(2) "]".
           DISPLAY "A3=[" WS-TABLE-A(3) "]".
           DISPLAY "A4=[" WS-TABLE-A(4) "]".
           STOP RUN.
