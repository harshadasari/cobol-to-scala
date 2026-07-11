# Demo: convert a COBOL program to Scala and prove they agree

This is a small, runnable, end-to-end demonstration of this repo's
conversion engine (`Thyraa-COBOL-main/backend/packages/cobol-to-scala/`) and
its core claim: **the generated Scala behaves the same as the real COBOL
compiler**, not just "looks plausible."

It is intentionally separate from the engine's own test suite
(`.../cobol-to-scala/tests/`) - this is a from-scratch walkthrough a new
reader can follow without understanding `node:test` or the oracle harness
first, using the same underlying idea (compile+run both sides, diff the
output) in a plain shell script.

## What it does

1. Takes `demo/demoacct.cbl` - a small program that `COPY`s its record
   layout from `demo/copybooks/CUSTOMER.cpy` (copybook expansion is exactly
   how virtually all production COBOL keeps its record layouts) and uses a
   `COMP-3` packed-decimal balance field plus `COMPUTE ROUNDED`.
2. Converts it to Scala by calling the engine's `convertToScala()` through
   plain `node` (`demo/convert.mjs`) - exactly how any other caller of the
   `@thyraa/cobol-to-scala` package would use it.
3. Prints the generated Scala.
4. Compiles and runs the **original COBOL** with `cobc` (GnuCOBOL) - the
   "compiler oracle": real compiler, real semantics, not a guess.
5. Compiles and runs the **generated Scala** with `scala-cli`.
6. Diffs the two programs' stdout and prints `EQUIVALENT` or `DIVERGED`.

## Prerequisites

You need three tools on `PATH`:

| Tool | Checked with | Notes |
|---|---|---|
| `node` | `node --version` | Node 18+ (the engine package is ESM, `"type": "module"`). |
| `cobc` (GnuCOBOL) | `cobc --version` | Ubuntu/Debian: `apt-get install -y gnucobol4` (or `gnucobol`/`gnucobol3`). No PPA needed - it's in the `universe` repo. See the repo root `docs/toolchain-status.md` for the exact commands used to set this up in this project's own environment. |
| `scala-cli` | `scala-cli version` | See <https://scala-cli.virtuslab.org/install> for the standard install path. `docs/toolchain-status.md` also documents a Maven-Central-only fallback install (no GitHub releases / coursier installer needed) for restricted-network environments. |

No `npm install` is required for the demo itself - `convert.mjs` imports the
engine package directly via a relative path (the engine has zero runtime
`node_modules` dependencies).

## Running it

From the repo root:

```bash
demo/convert-demo.sh
```

Or from anywhere:

```bash
/path/to/cobol-to-scala/demo/convert-demo.sh
```

Expected final output:

```
=== Diff: cobc vs generated Scala ===
(no differences)

EQUIVALENT - generated Scala output matches real GnuCOBOL output exactly.
```

The script exits `0` on `EQUIVALENT` and `1` on `DIVERGED` (with the line
diff printed above the verdict), so it's usable as a CI smoke test.

### Converting a different program

```bash
demo/convert-demo.sh path/to/your-program.cbl
```

This form does not pass a copybook directory (only `demoacct.cbl` ships with
one in this repo), so point it at a program that doesn't `COPY` anything, or
adapt the script's `COPYBOOKS_DIR` variable for your own layout.

## Files

| File | Purpose |
|---|---|
| `demoacct.cbl` | The demo COBOL program (customer record, COMP-3 balance, COMPUTE ROUNDED interest calculation). |
| `copybooks/CUSTOMER.cpy` | The record layout `demoacct.cbl` `COPY`s in. |
| `convert.mjs` | Minimal Node CLI wrapper around `convertToScala()` - reads the copybook directory, converts, writes the generated Scala to a path given on the command line. |
| `convert-demo.sh` | Orchestrates all 6 steps above, in scratch directories under `$TMPDIR` (never inside the repo), and cleans up after itself. |

## What this does and doesn't prove

This demo is a **single hand-picked program**, chosen to exercise COPY
expansion, a byte-level COMP-3 codec, and COMPUTE ROUNDED in one small file.
It demonstrates the mechanism, not the full extent of engine coverage. For
the actual breadth of verification - 48 corpus programs, two rounds of
adversarial refutation, 379 automated tests - see
`Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md`
and the repo root `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`'s "Verification
record" section. In particular, COMPUTE ROUNDED is exercised here on a value
that happens to round the same way whether or not ROUNDED is honored
correctly (1500.00 x 0.025 divides evenly at 2 decimal places) - it
demonstrates the codegen path compiles and runs, not that every
COMPUTE-without-ROUNDED truncation edge case is correct (see the roadmap
doc's Phase 2 notes for a specific, verified gap in that area found while
preparing this demo).
