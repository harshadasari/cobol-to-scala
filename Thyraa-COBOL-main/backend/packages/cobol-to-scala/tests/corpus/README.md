# Synthetic COBOL test corpus

Fixed-format COBOL-85 programs, one construct-family each, DISPLAY-only (no file
I/O), deterministic. Modeled on the column/style conventions of `tests/samples/*.cbl`
(indicator column 7, code starting column 8, one period per paragraph rather than per
statement, `0000-`/`1000-`-style paragraph numbering).

`data/` = Phase 1 (data layout). `proc/` = Phase 2 (procedure coverage, including
constructs the roadmap marks as not-yet-supported by this repo's parser).

Every `pNN-*.cbl` has a sibling `pNN-*.expected.txt`: the exact `DISPLAY` output,
obtained by **compiling and running each program with GnuCOBOL**
(`cobc (GnuCOBOL) 4.0-early-dev.0`, default dialect) rather than hand-derived - this
repo's own roadmap (`docs/CAPABILITY_AUDIT_AND_ROADMAP.md`, Part 2, cross-cutting rule
2) designates GnuCOBOL as the test-oracle dialect, and Part 2 Phase 2 explicitly calls
for "given a program + record layouts, synthesize input datasets, and (where GnuCOBOL
can compile the source) run COBOL vs generated Scala side-by-side and diff outputs" -
this corpus is built to plug directly into that verification deliverable. Where a
program's output depends on a convention that is GnuCOBOL-specific rather than
COBOL-85-universal, a sibling `pNN-*.notes.md` explains the ambiguity instead of
silently guessing.

## Inventory

| # | Program | Constructs exercised | Expected-output confidence |
|---|---|---|---|
| data/p01 | `p01-comp3.cbl` | COMP-3 (packed decimal): positive/negative/zero, odd & even digit counts, `V99` scale, all-decimal (`SV9(5)`) | High (see `p01-comp3.notes.md` for one GnuCOBOL-vs-other-dialect DISPLAY-formatting caveat) |
| data/p02 | `p02-binary.cbl` | `COMP`/`BINARY` at 2/4/8-byte widths (`S9(4)`, `S9(9)`, `S9(18)`), negative values, picture-digit boundary values, unsigned & scaled variants | High (see `p02-binary.notes.md`) |
| data/p03 | `p03-zoned.cbl` | Signed `DISPLAY`-usage (zoned decimal) numerics; `COMPUTE`/`ADD`/`SUBTRACT`/`MULTIPLY`/`DIVIDE ... GIVING ... REMAINDER` producing negative results | High (see `p03-zoned.notes.md`) |
| data/p04 | `p04-occurs.cbl` | Fixed `OCCURS` table, nested `OCCURS` (2-D matrix), subscripted access, `PERFORM VARYING` summing loops | High |
| data/p05 | `p05-odo.cbl` | `OCCURS ... DEPENDING ON`, count varied at runtime across 3 passes (grow, grow again, shrink), sum recomputed each time | High |
| data/p06 | `p06-redefines.cbl` | `REDEFINES` of a numeric date field by a YYYY/MM/DD group; read/write through both views, showing shared storage | High |
| data/p07 | `p07-editing.cbl` | Edited pictures: `Z` suppression, comma insertion, decimal point, fixed & floating `$`, `CR`/`DB`, fixed & floating `+`/`-` | High (universal COBOL-85 editing rules, not dialect-specific) |
| proc/p10 | `p10-search.cbl` | `SEARCH` (linear) with `AT END`, `OCCURS ... INDEXED BY`, hit + miss cases | High execution confidence; **parser does not implement SEARCH today** - see Constraint check below |
| proc/p11 | `p11-searchall.cbl` | `SEARCH ALL` (binary search), `ASCENDING KEY`, `INDEXED BY`, hit + miss cases | High execution confidence; **parser does not implement SEARCH ALL today** |
| proc/p12 | `p12-sort.cbl` | `SORT` with `INPUT PROCEDURE`/`OUTPUT PROCEDURE`, `RELEASE`/`RETURN`, in-memory source/destination tables (SD's `ASSIGN` name is a GnuCOBOL-internal work file, no external file needed) | High execution confidence; **parser does not implement SORT/RELEASE/RETURN today** |
| proc/p13 | `p13-corresponding.cbl` | `MOVE CORRESPONDING` between two groups with partially-overlapping subordinate names | High; **parses correctly today** (positive finding) |
| proc/p14 | `p14-godep.cbl` | `GO TO ... DEPENDING ON` inside a `PERFORM ... THRU` range, incl. out-of-range (no-match) fall-through | High; **parses correctly today** (positive finding - contradicts roadmap gap list) |
| proc/p15 | `p15-intrinsics.cbl` | `FUNCTION UPPER-CASE`, `LENGTH`, `NUMVAL`, `MOD`, `MAX`, `REVERSE` | High execution confidence (see `p15-intrinsics.notes.md`); **parser does not implement FUNCTION intrinsics today** |
| proc/p16 | `p16-perform-forms.cbl` | `PERFORM` TIMES / UNTIL / VARYING (incl. two-level `AFTER`) / out-of-line `THRU` | High execution confidence; **inline `PERFORM <literal> TIMES` misparses today** even though UNTIL/VARYING/THRU are fine - see Constraint check |
| proc/p17 | `p17-evaluate.cbl` | `EVALUATE` with `THRU` ranges, `OTHER`, multi-subject `ALSO` incl. `ANY` | High; parses correctly today |
| proc/p18 | `p18-string.cbl` | `STRING` (multi-source, `DELIMITED BY SIZE`/`SPACE`, `WITH POINTER`), `UNSTRING` (`DELIMITED BY`, `TALLYING IN`), `INSPECT` (`TALLYING`, `REPLACING`, `CONVERTING`) | High; parses correctly today |

## Methodology

1. Each program was compiled and run with `cobc -x -o <name> <name>.cbl` followed by
   `./<name> > <name>.expected.txt`, capturing real stdout byte-for-byte (verified
   with `cat -A` to check trailing spaces / line endings). No hand-derivation of
   spacing was needed anywhere in this corpus because GnuCOBOL was available in this
   environment and is the project's designated oracle.
2. Every arithmetic/logic result embedded in a program (sums, matrix totals, dispatch
   targets, sort order, string splits, etc.) was independently hand-computed before
   running, then cross-checked against the actual GnuCOBOL output; all matched on the
   first run except for two programs (`p03-zoned.cbl`, `p16-perform-forms.cbl`) whose
   field names were adjusted to avoid accidental field reuse - no logic was changed
   after seeing output that disagreed with hand computation.
3. "Confidence" in the table above is about **expected-output correctness**, not
   about the repo parser. Parser-compatibility results are reported separately below,
   per the task's constraint check.

## Constraint check: does `parseCobol` accept these files?

Ran (for every file):
```
node -e "import('...index.js').then(({parseCobol}) => { const ast = parseCobol(src, {format:'fixed'}); ... })"
```
**None of the 16 programs throw.** The parser's paragraph-level loop treats any
unrecognized keyword as "skip one token and continue" (`procedure-parser.js`,
`parseProcedureDivision`, the `else if (!ctx.isAtEnd()) ctx.advance();` fallback), so
constructs it doesn't implement are silently dropped rather than rejected - the
corpus's job here was to find out *what* silently drops, and whether it drops cleanly
or corrupts the AST it dropped alongside. Findings, in descending order of severity:

### 1. `PERFORM <int-literal> TIMES` (inline form) is broken - contradicts the roadmap

The roadmap lists "PERFORM (inline/thru/times/until/varying)" as supported. Inline
`UNTIL`, `VARYING` (incl. two-level `AFTER`), and out-of-line `THRU` all parse
correctly with proper bodies. But inline `PERFORM 3 TIMES ... END-PERFORM` does not.

Root cause (`parser/procedure-parser.js`, `parsePerformStatement`, lines ~564-591):
the inline-vs-out-of-line dispatch tests `!ctx.check(TokenType.IDENTIFIER)` to decide
"no target paragraph follows, this is a bodied inline PERFORM" - but a literal TIMES
count (`3`) is a `NUMERIC_LITERAL` token, so this test is *also* true for `PERFORM 3
TIMES`. Control falls into the bare-inline-PERFORM branch (no UNTIL/VARYING/WITH
matched either) and never reaches the TIMES-detection code at lines ~604-611, which
is reachable only via the out-of-line/paragraph-name branch (e.g. `PERFORM
PARA-NAME 3 TIMES` works fine).

Minimal repro (verified with `node -e`):
```cobol
PERFORM 3 TIMES
    ADD 1 TO WS-X
END-PERFORM
```
parses to `PerformStatement{performType:"inline", times:null, statements:[]}` and the
`ADD 1 TO WS-X` inside leaks out as a **flat top-level sibling statement** of the
enclosing paragraph - i.e. it would run unconditionally once, not three times, if a
generator trusted the (empty) `statements` array on the PerformStatement node.
Reproduced again inside `p16-perform-forms.cbl`'s first PERFORM block. **Not a
parser rejection - a silent semantic corruption of a construct believed to already
work.**

### 2. `FUNCTION` intrinsics are not implemented and corrupt the surrounding MOVE

No `FunctionCall`/`Intrinsic` AST node exists anywhere in `parser/ast.js`. For `MOVE
FUNCTION UPPER-CASE(WS-TEXT) TO WS-UPPER` (from `p15-intrinsics.cbl`), the actual
parsed `MoveStatement` is:
```
source:  VariableReference{name: "FUNCTION"}
targets: [VariableReference{name: "UPPER-CASE", subscripts: [WS-TEXT]}]
```
i.e. the `FUNCTION` keyword itself becomes a fabricated source variable, and the
function name + its argument are fabricated into a bogus subscripted target
variable - **the real destination `WS-UPPER` is dropped from the AST entirely**. This
happens for every `FUNCTION` use in the program (confirmed for
`UPPER-CASE`/`LENGTH`/`NUMVAL`/`REVERSE`; `MOD`/`MAX` inside `COMPUTE` go through the
same operand-parsing path and should fail identically, though not individually
dumped). Each surrounding statement still terminates correctly (no cascading
desync across the whole paragraph), but the FUNCTION statement's own data is wrong,
not just missing.

### 3. `SEARCH` / `SEARCH ALL` / `SORT` / `RELEASE` / `RETURN`: no AST representation, and they can corrupt an adjacent MOVE

No `SearchStatement` or `SortStatement` class exists in `parser/ast.js` (confirmed by
listing every exported class). These keywords are dropped token-by-token by the
paragraph-level fallback. Two concrete side effects, both confirmed by AST dump:

- Because this corpus (like `tests/samples/*.cbl`) follows real-world style of one
  period per paragraph rather than per statement, a MOVE immediately preceding an
  unrecognized verb has no period to stop its target-list parse at. In
  `p11-searchall.cbl`, the last `MOVE 'RIVET' TO WS-PROD-NAME(5)` before `SEARCH ALL
  ...` picked up a bogus extra target named `"SEARCH"`. In `p12-sort.cbl`, the MOVE
  before the `SORT` statement picked up two bogus extra targets, `"SORT"` and
  `"SORT-FILE"`. This is data corruption on a statement that has nothing to do with
  the unsupported verb, not just a dropped statement.
- In `p12-sort.cbl`, `RETURN SORT-FILE AT END ... NOT AT END ...` sits inside an
  inline `PERFORM UNTIL ... END-PERFORM`. The inline-PERFORM body parser
  (`parseStatementBlock`) does not have the same skip-and-continue tolerance as the
  top-level paragraph loop - it stops collecting body statements the moment it meets
  `RETURN`. The result: the outer `PerformStatement` ends up with an empty/truncated
  body, and the `MOVE`/`ADD` statements that were meant to run conditionally inside
  the `NOT AT END` branch instead appear as flat top-level statements of the
  paragraph, outside any loop at all. This is a control-flow loss, not just a
  cosmetic gap - worth flagging above the plain "SEARCH/SORT unsupported" line item.

`p10-search.cbl` shows the same AST-flattening pattern as `p11` (its own preceding
statements are `SET`s, not `MOVE`s, and `SET`'s target-list parsing happened not to
absorb the following `SEARCH` token in this particular case - the corruption is real
but reachable only through certain preceding-statement shapes; **do not read this as
"SEARCH is fine when preceded by SET" - the AST still has no SearchStatement node at
all** and any WHEN clause statements are flattened into the paragraph regardless).

### 4. Two positive findings: the roadmap is stricter than the code in two places

- **`MOVE CORRESPONDING`** (`p13-corresponding.cbl`) parses correctly today:
  `MoveStatement{source: WS-SOURCE-GROUP, targets: [WS-TARGET-GROUP], corresponding:
  true}`. The remaining gap (per the roadmap) is generator-side field-name matching,
  not parser support.
- **`GO TO ... DEPENDING ON`** (`p14-godep.cbl`) parses correctly today:
  `GoToStatement{targets: [...three paragraph names...], dependingOn:
  VariableReference(WS-SELECTOR)}`. The roadmap's Part 1.3 gap table lists "GO TO
  DEPENDING ON, ALTER" together as a gap; that appears to be true only for `ALTER`
  now - `GO TO ... DEPENDING ON` itself already works and should probably be split
  out of that line item.

### 5. Already-working Phase 2 constructs, confirmed clean

`EVALUATE` with `THRU` ranges/`OTHER`/multi-subject `ALSO` incl. `ANY`
(`p17-evaluate.cbl`) and `STRING`/`UNSTRING`/`INSPECT` (`TALLYING`/`REPLACING`/
`CONVERTING`) (`p18-string.cbl`) all produced correctly-typed, correctly-shaped AST
nodes (`EvaluateStatement`, `StringStatement`, `UnstringStatement`,
`InspectStatement`) with no corruption of neighboring statements.

No parser code was modified to produce any of the above; these are read-only
findings from running the existing `parseCobol` against the new corpus files, per the
task's constraint check.
