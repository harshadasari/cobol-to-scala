      * kk12 (round 35): MOVE CORRESPONDING between two 01-groups where the
      * SOURCE group has a REDEFINES sibling introducing an alternate,
      * differently-named view (GROUP-A's A-VIEW REDEFINES A-FIELD1,
      * exposing A-VIEW-SUB), and the TARGET group happens to have its OWN
      * plain field also named A-VIEW-SUB - combined with `OF`-qualified
      * DISPLAY references to disambiguate the resulting name collision. No
      * existing corpus program combines MOVE CORRESPONDING with REDEFINES
      * at all.
      *
      * cobc's real semantics (verified): MOVE CORRESPONDING GROUP-A TO
      * GROUP-B moves A-FIELD1 and A-FIELD2 (present, identically named, in
      * both groups) but does NOT move anything into GROUP-B's own
      * A-VIEW-SUB - a data item introduced via a REDEFINES branch does not
      * participate in CORRESPONDING's own name-matching at all, so
      * GROUP-B's A-VIEW-SUB is left at its own initial VALUE (SPACES),
      * completely untouched by the MOVE CORRESPONDING.
      *
      * THE ENGINE'S BUG (DISHONEST - Scala COMPILE crash): the generated
      * Scala fails with `Not found: aViewSub` on the VERY FIRST statement
      * of the program (`DISPLAY ... A-VIEW-SUB OF GROUP-A ...`, executed
      * BEFORE the MOVE CORRESPONDING even runs) - this is a pure
      * qualified-identifier-resolution crash, not a MOVE CORRESPONDING
      * semantics bug per se. Because GROUP-A's own A-VIEW-SUB (nested
      * under A-VIEW REDEFINES A-FIELD1) and GROUP-B's own plain A-VIEW-SUB
      * share the identical bare name, this record layout gets promoted to
      * the byte-accurate case-class model (GroupA/GroupB/AView case
      * classes visible in the generated Scala) with disambiguating
      * PREFIXED flat-var names for the ordinary top-level fields -
      * `groupAAField1`/`groupAAField2` for GROUP-A, `groupBAField1`/
      * `groupBAViewSub`/`groupBAField2` for GROUP-B - but GROUP-A's OWN
      * A-VIEW-SUB (the REDEFINES-nested one) never receives ANY flat-var
      * declaration under EITHER its prefixed (`groupAAViewSub`) or its
      * bare (`aViewSub`) name; the REDEFINES-nested child appears to fall
      * out of whatever collision-avoidance renaming pass produces the
      * `groupB*`-prefixed siblings. The `A-VIEW-SUB OF GROUP-A` qualified
      * reference in PROCEDURE DIVISION code is nonetheless resolved to the
      * bare, unprefixed `aViewSub` identifier - which was never declared
      * anywhere in the file - producing a dangling reference and a hard
      * compile failure before a single line of output can print.
      *
      * LIKELY FIX: the working-storage duplicate-field-name disambiguation
      * pass (scala-generator.js - whatever renames a same-named field
      * across sibling 01-records to `<groupCamel><FieldCamel>`) needs to
      * be extended to also reach fields introduced via a REDEFINES's own
      * nested children (currently handled by a separate code path,
      * `redefinesAccessorLines`/`characterSlicedGroupRedefinesLines`,
      * which is not integrated with the collision-renaming logic at all)
      * so that GROUP-A's own A-VIEW-SUB gets a real, findable accessor
      * under whatever name the `OF GROUP-A` qualifier resolution actually
      * expects, instead of silently never declaring one.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK12MOVECORRREDEF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  GROUP-A.
           05  A-FIELD1 PIC 9(3) VALUE 123.
           05  A-VIEW REDEFINES A-FIELD1.
               10  A-VIEW-SUB PIC X(3).
           05  A-FIELD2 PIC X(3) VALUE "XYZ".
       01  GROUP-B.
           05  A-FIELD1 PIC 9(3) VALUE 0.
           05  A-VIEW-SUB PIC X(3) VALUE SPACES.
           05  A-FIELD2 PIC X(3) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "A-VIEW-SUB=[" A-VIEW-SUB OF GROUP-A "]".
           MOVE CORRESPONDING GROUP-A TO GROUP-B.
           DISPLAY "B-FIELD1=[" A-FIELD1 OF GROUP-B "]".
           DISPLAY "B-VIEWSUB=[" A-VIEW-SUB OF GROUP-B "]".
           DISPLAY "B-FIELD2=[" A-FIELD2 OF GROUP-B "]".
           STOP RUN.
