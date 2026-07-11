# Notes: p02-binary

Same dialect caveat as `p01-comp3.notes.md`: GnuCOBOL's `DISPLAY` of a signed
non-edited numeric item (here `COMP`/`BINARY` usage) prints a leading sign character
even though the PICTURE has no editing symbols (e.g. `-999999999`). See
`p01-comp3.notes.md` for the full explanation and the cross-dialect caveat.
Confidence: **high** that this is GnuCOBOL's actual behavior (verified by execution);
**medium** for portability to other COBOL-85 implementations.

All boundary values (`PIC S9(4)`, `S9(9)`, `S9(18)` at their digit-count limits, i.e.
9999 / 999999999 / 999999999999999999 and their negatives) were verified to round-trip
through `MOVE` without truncation, since the literal values were chosen to exactly fit
the picture's digit count rather than the wider physical binary storage width (2/4/8
bytes can hold larger magnitudes than the picture allows; COBOL truncates a MOVE to
the picture's digit count, not the physical storage width, under standard
truncation - GnuCOBOL default `-fbinary-truncate` behavior). Confidence: **high**
(standard, dialect-independent behavior, verified by execution).
