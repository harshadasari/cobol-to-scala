# Notes: p03-zoned

Same dialect caveat as `p01-comp3.notes.md`: every `PIC S9(n)` field here is `USAGE
DISPLAY` (zoned decimal) - the most "native" numeric representation - and GnuCOBOL
still prints a leading `+`/`-` sign on plain `DISPLAY` even though none of these
pictures contain an editing symbol. See `p01-comp3.notes.md` for the full
explanation. Confidence: **high** that this is GnuCOBOL's actual behavior (verified
by execution); **medium** for portability to other COBOL-85 implementations, where an
unedited zoned-decimal `DISPLAY` may instead show the raw zone/overpunch character in
the sign position rather than a separate `+`/`-` character.

The arithmetic itself (COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE producing negative
results, DIVIDE ... GIVING ... REMAINDER, integer truncation on DIVIDE) is standard,
dialect-independent COBOL-85 semantics. Confidence: **high**.
