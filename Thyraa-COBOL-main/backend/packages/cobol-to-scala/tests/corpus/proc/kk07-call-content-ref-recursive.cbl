      * kk07 (round 35): CALL ... BY CONTENT mixed with BY REFERENCE in the
      * SAME CALL statement, to a RECURSIVE program that re-CALLs itself
      * with the same mixed-mode argument list at each level. BY CONTENT
      * (a caller's own value should never be modified by the callee, even
      * across several levels of recursion) and BY REFERENCE (the callee's
      * mutations should accumulate back through every level to the ORIGINAL
      * caller) have each been exercised separately many times in this
      * corpus (e14/f09/i14/o07/v03 for BY CONTENT; countless *recursive*
      * programs for BY REFERENCE-style LINKAGE aliasing) but never
      * TOGETHER in the same CALL to a RECURSIVE-declared program - see
      * kk13 (this same round) for the identical mixed-mode CALL to a
      * NON-recursive callee, confirming the bug below is specific to the
      * RECURSIVE entry-point convention, not BY CONTENT/BY REFERENCE
      * mixing in general.
      *
      * cobc's real semantics (verified): a BY CONTENT argument gets a
      * fresh, independent copy at EACH level of the recursive CALL chain -
      * mutations inside one activation are invisible both to its own
      * caller AND to anything it calls further. LK-DEPTH (also passed BY
      * CONTENT at each recursive re-call) correctly decrements once per
      * level (3, 2, 1) and the recursion terminates normally after 3
      * levels. LK-REF (BY REFERENCE) is truly shared with the top-level
      * WS-REF-ARG and accumulates all three +10 additions (100 -> 130).
      *
      * THE ENGINE'S BUG (DISHONEST - crash): `generateRecursiveEntryMethod`
      * (scala-generator.js, round-21/22's own per-call-activation LINKAGE
      * aliasing convention) models EVERY LINKAGE parameter - BY CONTENT or
      * BY REFERENCE alike - as a `(_get, _set)` closure pair threaded
      * through `entry(...)`, with `def lkFoo: T = _get()` / `def lkFoo_=(v:
      * T): Unit = _set(v)` local aliases. For a BY REFERENCE parameter this
      * is correct (the setter really does write back to the shared
      * source). For a BY CONTENT parameter, `generateCall`'s own argument-
      * building code passes a real getter but a NO-OP setter
      * (`(_: Int) => ()`) for the content-mode slot - meaning any
      * `lkFoo_=(...)` a callee performs (e.g. `SUBTRACT 1 FROM LK-DEPTH`)
      * is silently DISCARDED, and the getter still always resolves back to
      * the UNCHANGED original source value. This breaks the basic
      * within-activation invariant that a WRITE should be visible to a
      * SUBSEQUENT READ in the SAME callee invocation: LK-CONTENT's ADD 10
      * has no visible effect at all (DISPLAY always shows the original
      * value), and - far more seriously - LK-DEPTH's SUBTRACT 1 also has no
      * effect, so the guard `IF LK-DEPTH > 1` NEVER becomes false. The
      * program recurses UNBOUNDED, crashing with a genuine
      * java.lang.StackOverflowError (confirmed via scala-cli - the
      * generated Scala compiles cleanly, but the process crashes at
      * runtime with alternating `Kk07sub$.lkContent$1` /
      * `Kk07sub$.subMain$1$$anonfun$1` stack frames, thousands deep, and
      * before crashing prints DEPTH=3 CONTENT=100 forever - never 2 or 1 -
      * with only REF (the true BY-REFERENCE var) incrementing correctly
      * call after call).
      *
      * LIKELY FIX: a BY CONTENT parameter passed into a RECURSIVE-program's
      * own `entry(...)` should NOT be modeled as a get/set closure pair
      * back to the (unwritable) caller's source at all - it needs its own
      * REAL, independently-mutable local variable, seeded ONCE from the
      * caller's value at call time (a genuine snapshot copy, mirroring how
      * a non-recursive callee's BY CONTENT parameter already behaves per
      * kk13's own passing control case), with reads/writes inside the
      * callee's own activation going straight to that local copy instead of
      * indirecting through `_get`/`_set` at all. The fix likely needs to
      * distinguish BY CONTENT from BY REFERENCE at the `entry(...)` call
      * site itself (generateCall's own per-argument mode, expression-gen.js)
      * rather than only at the value-vs-discard choice of the setter, since
      * the CURRENT closure-based representation cannot express "write
      * visible to me, not to my caller" at all - only "write visible to
      * everyone" (real setter) or "write visible to no one, including
      * myself" (no-op setter), and this bug is the second of those two.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK07MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CONTENT-ARG   PIC 9(3) VALUE 100.
       01  WS-REF-ARG       PIC 9(3) VALUE 100.
       01  WS-DEPTH         PIC 9(1) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE CONTENT=" WS-CONTENT-ARG " REF=" WS-REF-ARG.
           CALL "KK07SUB" USING BY CONTENT WS-CONTENT-ARG
                                BY REFERENCE WS-REF-ARG
                                BY CONTENT WS-DEPTH.
           DISPLAY "AFTER  CONTENT=" WS-CONTENT-ARG " REF=" WS-REF-ARG.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK07SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-LOCAL-COUNT PIC 9(3) VALUE 0.
       LINKAGE SECTION.
       01  LK-CONTENT PIC 9(3).
       01  LK-REF     PIC 9(3).
       01  LK-DEPTH   PIC 9(1).
       PROCEDURE DIVISION USING LK-CONTENT LK-REF LK-DEPTH.
       SUB-MAIN.
           ADD 1 TO WS-LOCAL-COUNT.
           ADD 10 TO LK-CONTENT.
           ADD 10 TO LK-REF.
           DISPLAY "DEPTH=" LK-DEPTH " CONTENT=" LK-CONTENT
               " REF=" LK-REF " CALLCT=" WS-LOCAL-COUNT.
           IF LK-DEPTH > 1
               SUBTRACT 1 FROM LK-DEPTH
               CALL "KK07SUB" USING BY CONTENT LK-CONTENT
                                    BY REFERENCE LK-REF
                                    BY CONTENT LK-DEPTH
           END-IF.
           DISPLAY "RETURN DEPTH=" LK-DEPTH " CONTENT=" LK-CONTENT
               " REF=" LK-REF.
       END PROGRAM KK07SUB.

       END PROGRAM KK07MAIN.
