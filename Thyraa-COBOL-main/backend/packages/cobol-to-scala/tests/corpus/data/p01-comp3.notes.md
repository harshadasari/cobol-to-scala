# Notes: p01-comp3

## How expected.txt was derived

Empirically: `cobc -x -o p01 p01-comp3.cbl && ./p01 > p01-comp3.expected.txt` using the
GnuCOBOL toolchain installed in this environment (`cobc (GnuCOBOL) 4.0-early-dev.0`).
GnuCOBOL is this repo's own designated test-oracle dialect (see
`docs/CAPABILITY_AUDIT_AND_ROADMAP.md`, cross-cutting rule "Dialect switches: IBM
Enterprise COBOL first; GnuCOBOL for test-oracle runs"), so its actual runtime output
is treated as ground truth here rather than hand-derived.

## One genuine cross-dialect ambiguity

`DISPLAY` of a **non-edited** numeric item that has `S` (sign) and/or `V` (implied
decimal point) in its PICTURE - e.g. `PIC S9(3)V99 COMP-3` - comes out of GnuCOBOL
with a leading `+`/`-` sign character and a printed decimal point, e.g. `MOVE 123.45`
displays as `+123.45`, `MOVE -123.45` displays as `-123.45`.

This is **not** universal across COBOL implementations. Classic mainframe lore (IBM
Enterprise COBOL and others) is that a `DISPLAY` of an *unedited* numeric field shows
only the bare digit characters that occupy the PICTURE's digit positions - `V` and `S`
are non-printing categories, so no decimal point and no sign would appear unless the
picture uses actual editing characters (`Z`, `,`, `.`, `$`, `+`, `-`, `CR`, `DB`) or
`SIGN IS SEPARATE`. Under that reading, `MOVE 123.45 TO PIC S9(3)V99 COMP-3` then
`DISPLAY` would show `12345` (5 raw digits, no sign, no point) - which is also the
classic "why didn't my negative balance show a minus sign" gotcha that edited pictures
(see `p07-editing.cbl`) exist to solve.

Every `expected.txt` in this corpus locks to the empirically-confirmed GnuCOBOL
behavior (sign + implied decimal point shown). If this corpus is later run against a
different dialect/compiler, the numeric lines in `p01-comp3.expected.txt`,
`p02-binary.expected.txt`, `p03-zoned.expected.txt`, and the `NUMVAL-RESULT` /
`MOD-POS` / `MOD-NEG` lines of `p15-intrinsics.expected.txt` are the ones to
re-verify first. Confidence: **high** for "this is what GnuCOBOL actually does"
(verified by direct execution), **medium** for "this is what every COBOL-85
implementation does" (not independently verified against a second compiler).

Everything else in this program (truncation on MOVE, positive/negative/zero packed
values, odd/even digit-count byte packing) is standard, dialect-independent COBOL-85
numeric semantics. Confidence: **high**.
