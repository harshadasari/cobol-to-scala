# Notes: p15-intrinsics

`NUMVAL-RESULT` (`PIC S9(3)V99`), `MOD-POS`, and `MOD-NEG` (`PIC S9(3)`) are
non-edited signed numeric fields, so the same GnuCOBOL DISPLAY-sign/decimal-point
convention documented in `../data/p01-comp3.notes.md` applies to their expected
output (`-123.45`, `+002`, `+002`). Confidence: **high** for GnuCOBOL's actual
output (verified by execution); **medium** for portability to other dialects.

`FUNCTION MOD` uses floored-division modulo (result takes the sign of the divisor),
per COBOL-85: `FUNCTION MOD(-7, 3) = 2` because `-7 = (-3 * 3) + 2`, not the `-1`
a truncating/C-style remainder would give. Verified by execution; confidence:
**high**, and this is standard-mandated behavior, not a GnuCOBOL-specific quirk.

Separately - and this is a parser-compatibility finding, not an output-confidence
one - the repo's own parser does not implement `FUNCTION` intrinsics at all; see
`../README.md` for how `MOVE FUNCTION UPPER-CASE(WS-TEXT) TO WS-UPPER` gets
silently misparsed (the `FUNCTION` keyword becomes a fabricated source variable
reference, and the function name + argument become a fabricated subscripted target,
dropping the real `WS-UPPER` target entirely). This does not affect the
GnuCOBOL-derived `expected.txt`, which reflects real program execution.
