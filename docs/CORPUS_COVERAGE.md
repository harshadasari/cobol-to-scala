# Corpus Feature Coverage

What the 574-program verification corpus actually exercises, enumerated from the corpus itself, and what it does not. This is the list to read before accepting any claim about this engine's correctness.

## The oracle and the comparison bar

- **Oracle:** `cobc (GnuCOBOL) 4.0-early-dev.0`, **default dialect** (no `-std=` flag; not `-std=ibm`, not `-std=ibm-strict`). See [toolchain-status.md](toolchain-status.md).
- **Not the oracle:** IBM Enterprise COBOL. GnuCOBOL is a different implementation; documented divergences from IBM exist (intermediate arithmetic precision, TRUNC defaults, sign display, sort tie order, EBCDIC behaviour). This corpus cannot detect any of them. Calibration against IBM is step 3 of [ACTION_PLAN_2026-10.md](ACTION_PLAN_2026-10.md).
- **Comparison bar:** for each program, the **stdout** of the generated Scala (compiled and run with `scala-cli`) is compared **byte-for-byte** with the stdout of the program compiled and run by `cobc`. Nothing else is compared: not return codes beyond the harness's own check, not files left on disk, not timing, not stderr.
- **Fixtures are live:** each `*.oracle.txt` is re-captured from `cobc` on every test run, not hand-maintained (see [ADVERSARIAL_ROUNDS_REPORT.md](ADVERSARIAL_ROUNDS_REPORT.md) section 2.5).
- **Scope:** self-contained batch-style programs that `DISPLAY` their results. No CICS, DB2, VSAM/indexed, JCL, IMS, or EBCDIC-at-rest system parity.
- **Defensible claim:** deterministic, auditable translation whose language semantics are continuously differential-tested against a reference compiler (GnuCOBOL 4.0-early-dev, default dialect) on an adversarially grown corpus of 574 programs; no LLM in the translation path. This file does not support any claim beyond that.

## What the 574 are

Corpus root: `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/corpus/`.

| Group | Files | What the check is |
|---|---:|---|
| `data/` (`.cbl`) | 19 | stdout diff vs `cobc` (data-layout probes: COMP-3, binary, zoned, OCCURS, REDEFINES, editing, rounding, truncation) |
| `proc/` (`.cbl`) | 539 | stdout diff vs `cobc` (procedure-division probes; the bulk of the adversarial rounds) |
| `sql/` (`.cbl`) | 5 | **No `cobc` oracle** (cobc has no SQL precompiler here); checked against golden `.expected.scala` and compile-verified Doobie output |
| `proc/` (`.cbl.txt`) | 11 | **Negative probes:** the expected behaviour is that `cobc` rejects the program (nonzero exit at compile time); the engine must agree. They are not run. |
| **Total** | **574** | 563 `.cbl` + 11 `.cbl.txt` |

So 558 programs have a live stdout oracle, 11 are compile-rejection agreement checks, and 5 are SQL generation checks without a `cobc` run. The headline "574" counts all of them. `cics/`, `jcl/` and `dclgen/` hold no `.cbl` files and are not part of the 574.

## How the counts were derived

Counts are the number of corpus programs whose source (comment lines and `*>` tails removed, case-insensitive) contains the construct, found by pattern matching over all 574 files. A program counts once per feature. They are approximate in two ways: a pattern can over-match (for example `ASCENDING KEY` appears in SORT statements as well as in OCCURS clauses) and can miss unusual spellings. Treat them as "roughly this many programs", not as audited figures. Example names are the first, middle and last alphabetically among matches. Programs are named for the probe (round prefix plus topic); the header comment of each `.cbl` states what the probe targets. A program that exercises a feature is not evidence that the feature is correct in general: the corpus was grown adversarially around the cases that broke the engine, so it is dense in edge cases and sparse in ordinary, boring code.

## 1. Data Division

| Feature | Programs | Examples |
|---|---:|---|
| PIC 9 (numeric DISPLAY / zoned) | 472 | `a01-comp3-18digit`, `kk13-callcontent-nonrecur`, `z15-call-omitted` |
| Signed numerics (`PIC S9`) | 83 | `a01-comp3-18digit`, `jj09-callref-relfile`, `z08-move-trunc` |
| PIC X (alphanumeric) | 384 | `a03-move-numeric-truncation`, `jj06-unstr-rec-nest`, `z13-searchall-skipmiddle` |
| Implied decimal point (`V`) | 70 | `a01-comp3-18digit`, `p04-occurs`, `z08-move-trunc` |
| Scaling positions (`P`) | 3 | `nn09-picture-p-scaling`, `oo07-pic-p-with-v`, `oo08-pic-p-comp3-comp` |
| Numeric-edited pictures (`Z * $ + - , . B 0 / CR DB`) | 16 | `a09-display-formatting`, `s11-display-group`, `z05-integration-batch` |
| `COMP` / `BINARY` (2/4/8-byte) | 54 | `a01-comp3-18digit`, `ee11-search-all-comp1-key`, `z08-move-trunc` |
| `COMP-3` / `PACKED-DECIMAL` | 23 | `a01-comp3-18digit`, `oo08-pic-p-comp3-comp`, `y06-mixed-trailing` |
| `COMP-5` | 1 | `d06-binary-groupvalue-comp5` |
| `COMP-1` / `COMP-2` (IEEE-754 float) | 15 | `dd10-comp1-relative-file`, `ee07-comp1-special-values`, `u02b-comp1-display-only` |
| `SIGN LEADING/TRAILING [SEPARATE]` | 6 | `c5-sign-trailing`, `hh12-signsep-nested-table`, `y05-sign-separate-file` |
| `SYNCHRONIZED` | 10 | `c6-comp-sync`, `e02-redefines-sync-group`, `h10-redefines-odo-sync` |
| `JUSTIFIED RIGHT` | 2 | `a04-alpha-justified`, `w08-move-justified-trunc` |
| `BLANK WHEN ZERO` | 2 | `a09-display-formatting`, `t10-blankzero-comp3` |
| `OCCURS n TIMES` (fixed) | 130 | `a06-table-boundary`, `k08-searchall-empty-table`, `z13-searchall-skipmiddle` |
| `OCCURS ... DEPENDING ON` | 38 | `d14-thru-crosssect-godep`, `h11-evaltrue-thru-godep`, `z04-initialize-odo-whole-record` |
| `OCCURS ... INDEXED BY` | 31 | `aa06-search-3level-two-idx`, `nn10-searchall-odo-multikey`, `z13-searchall-skipmiddle` |
| `OCCURS ... ASCENDING/DESCENDING KEY` | 46 | `aa01-sort-inputproc-thru`, `j09-nested-sort-via-call`, `z13-searchall-skipmiddle` |
| Nested / multi-dimensional tables | 11 | `a06-table-boundary`, `jj05-tbl-3level`, `z02-initialize-2dim-subscript` |
| `REDEFINES` | 38 | `a08-redefines-table`, `l08-redefines-own88`, `t06-fd-redefines` |
| `RENAMES` (level 66) | 4 | `aa03-renames66`, `b2-renames-call-arg`, `c3-write-from-renames` |
| Level-88 condition names | 19 | `a10-perform-zero-iter`, `o04-set88-occurs-elem`, `z11-set88-false` |
| `VALUE` clauses / figurative constants | 455 | `a01-comp3-18digit`, `l12-recur-selfwrite`, `z15-call-omitted` |
| Hex literals, `HIGH-VALUES`/`LOW-VALUES`/`QUOTES` | 27 | `aa03-renames66`, `mm12-call-content-interleave`, `z15-call-omitted` |
| `LINKAGE SECTION` | 114 | `aa05-call-decl-byref`, `l01-recgrp-nested`, `z15-call-omitted` |
| `FILE SECTION` (FD/SD) | 171 | `aa01-sort-inputproc-thru`, `hh02-occvar-coincidence`, `z05-integration-batch` |
| `COPY` statement | 10 | `cc12-copy-replacing-fd-io`, `k03-copy-replacing-quote`, `u10-nested-copybook` |
| `COPY ... REPLACING` | 8 | `cc12-copy-replacing-fd-io`, `k03-copy-replacing-quote`, `u09-copy-replacing` |
| `REPLACE` (standalone) | 1 | `pp11-replace-statement` |
| `SPECIAL-NAMES` / `DECIMAL-POINT IS COMMA` / `CURRENCY SIGN` | 4 | `u03b-decimalcomma-labeled`, `v05b-decimalcomma-edited-only`, `v05c-numval-comma-only` |

`OCCURS ... DEPENDING ON` is exercised, but dynamic-size `parse`/`format` of the record codec is a known open gap (fixed maximum, visibly marked `TODO(ODO)`); see section 7.

## 2. Procedure Division verbs

| Feature | Programs | Examples |
|---|---:|---|
| `DISPLAY` | 568 | `a01-comp3-18digit`, `l11-recgrp-filler`, `z15-call-omitted` |
| `MOVE` | 356 | `a01-comp3-18digit`, `jj10-exitpara-unstr-rec`, `z15-call-omitted` |
| `MOVE`/`ADD`/`SUBTRACT CORRESPONDING` | 15 | `f05-refmod-move-corresponding`, `ll10-movecorr-redef-occurs`, `y16-movecorr-recursive-groups` |
| `INITIALIZE` | 13 | `e11-init-occurs-comp3-redef`, `mm08-initialize-replacing-redef`, `z04-initialize-odo-whole-record` |
| `SET` (index / condition-name `TO TRUE`) | 34 | `aa01-sort-inputproc-thru`, `o06-recur-set-index-updown`, `z11-set88-false` |
| `ACCEPT` (`FROM DATE` / `DAY` / `DAY-OF-WEEK`) | 4 | `oo13-accept-date-day-dow`, `pp07-accept-date4-direct-if`, `s08-day-of-week-deterministic` |
| `COMPUTE` | 84 | `a01-comp3-18digit`, `m02-recur-movecorr-group`, `z08-move-trunc` |
| `ADD` | 108 | `a07-table-of-groups`, `n01b-exitperform-nested-iso`, `z15-call-omitted` |
| `SUBTRACT` | 34 | `bb08-rewrite-recursive`, `ll03-call-content-group-recur`, `y10-subcorr` |
| `MULTIPLY` | 6 | `a01-comp3-18digit`, `q06-num-div-editmul`, `w13-multiply-divide-rounded` |
| `DIVIDE` | 9 | `a11-divide-remainder-sizeerror`, `q06-num-div-editmul`, `x09-divrem-negative-scaled` |
| `ROUNDED` | 13 | `a02-rounded-truncation`, `n09-add-giving-multitarget`, `y10-subcorr` |
| `ON SIZE ERROR` / `NOT ON SIZE ERROR` | 10 | `a01-comp3-18digit`, `mm05-func-max-nested-rounded`, `oo10-subtract-3tgt-sizeerror` |
| `DIVIDE ... REMAINDER` | 6 | `a11-divide-remainder-sizeerror`, `s10-intdiv-remainder-negative`, `x09-divrem-negative-scaled` |
| Exponentiation (`**`) | 4 | `mm15-func-arg-power-unary`, `s09-unary-compute`, `w14-exponent-negzero` |
| `IF` / `ELSE` | 98 | `a10-perform-zero-iter`, `ll04-evaluate-multiwhen-recur`, `z05-integration-batch` |
| `EVALUATE` | 29 | `a10-perform-zero-iter`, `l09-evaluate-thru-alpha`, `y14-evaluate-also-88-mixed` |
| `EVALUATE ... ALSO` | 5 | `e10-eval-also-thru-cross`, `q01-eval-also-3subjects-thru`, `y14-evaluate-also-88-mixed` |
| `EVALUATE` with `THRU` ranges | 8 | `dd01-evaluate-recursive-nested`, `mm11-evaluate-func-subject-thru`, `r10-eval-nested` |
| `PERFORM` paragraph (out-of-line) | 159 | `a07-table-of-groups`, `k07-perform-until-zero-iter`, `z12-qualified-perform` |
| `PERFORM ... THRU` | 36 | `a10-perform-zero-iter`, `jj11-linage-thru`, `x08-backward-thru-section` |
| `PERFORM n TIMES` | 132 | `a06-table-boundary`, `k08-searchall-empty-table`, `z13-searchall-skipmiddle` |
| `PERFORM UNTIL` | 116 | `a07-table-of-groups`, `k02-goto-depending-qualified`, `z07-inspect-tallying-subscript` |
| `PERFORM VARYING` | 87 | `a07-table-of-groups`, `k02-goto-depending-qualified`, `z07-inspect-tallying-subscript` |
| `PERFORM VARYING ... AFTER` (nested) | 96 | `aa02-decl-reentrancy`, `ll01-call-content-dup-site`, `z15-call-omitted` |
| `PERFORM ... WITH TEST BEFORE/AFTER` | 5 | `j06-perftest-callref-subscr`, `kk10-testafter-nested-exit`, `r07-perf-negafter` |
| Inline `PERFORM ... END-PERFORM` | 121 | `a07-table-of-groups`, `jj06-unstr-rec-nest`, `z07-inspect-tallying-subscript` |
| `EXIT PERFORM` / `EXIT PARAGRAPH` / `EXIT SECTION` | 10 | `ee09-exit-section-recursive`, `kk10-testafter-nested-exit`, `x12-nested-perform-continue` |
| `GO TO` | 20 | `d14-thru-crosssect-godep`, `i08-callref-table-elem-sortkey`, `r08-perform-thru-backward-goto` |
| `GO TO ... DEPENDING ON` | 10 | `d14-thru-crosssect-godep`, `j03-godep-nomatch-declaratives`, `p14-godep` |
| `ALTER` (parses; effect is a no-op, see section 7) | 2 | `ee13-alter-statement`, `ii08-alter-recursive` |
| `CONTINUE` | 1 | `x12-nested-perform-continue` |
| `STOP RUN` | 574 | `a01-comp3-18digit`, `l13-perform-vary-triple`, `z15-call-omitted` |
| `GOBACK` | 102 | `aa05-call-decl-byref`, `k04-mutual-recursion`, `z15-call-omitted` |
| `EXIT PROGRAM` | 1 | `oo11-exitprogram-vs-goback` |
| `STRING` | 25 | `aa09-string-into-searchall-key`, `ll05-string-mixed-delim`, `z06-ptr-chain` |
| `UNSTRING` | 20 | `cc11-string-unstring-relkey`, `m04-recur-unstring-write`, `z06-ptr-chain` |
| `STRING`/`UNSTRING ... WITH POINTER` | 15 | `g09-str-unstr-subscr-alias`, `ll05-string-mixed-delim`, `z06-ptr-chain` |
| `STRING`/`UNSTRING ... ON OVERFLOW` | 11 | `aa08-comp3-18digit-sizeerror`, `jj06-unstr-rec-nest`, `t12-string-unstring-overflow` |
| `INSPECT ... TALLYING` | 10 | `d12-inspect-str-unstr-refmod`, `p18-string`, `z07-inspect-tallying-subscript` |
| `INSPECT ... REPLACING` | 9 | `c1-inspect-multi-swap`, `p18-string`, `v06-inspect-combined` |
| `INSPECT ... CONVERTING` | 4 | `p18-string`, `q04-insp-before-after`, `w06-inspect-converting-overlap` |
| `SEARCH` (linear) | 27 | `aa06-search-3level-two-idx`, `ll12-searchall-redef-perfvary`, `z13-searchall-skipmiddle` |
| `SEARCH ALL` (binary) | 17 | `aa09-string-into-searchall-key`, `ll12-searchall-redef-perfvary`, `z13-searchall-skipmiddle` |
| `SORT` | 23 | `aa01-sort-inputproc-thru`, `i08-callref-table-elem-sortkey`, `z05-integration-batch` |
| `SORT ... INPUT/OUTPUT PROCEDURE` | 29 | `aa01-sort-inputproc-thru`, `i06-merge-decl-missing-file`, `z05-integration-batch` |
| `RELEASE` / `RETURN` | 32 | `aa01-sort-inputproc-thru`, `i08-callref-table-elem-sortkey`, `z05-integration-batch` |
| `MERGE` | 7 | `dd03-merge-recursive-nested`, `h09-decl-merge-call`, `nn06-merge-multikey-mixed` |
| Qualification (`OF` / `IN`) | 41 | `aa01-sort-inputproc-thru`, `ll13-unstring-mixed-delim-or`, `z12-qualified-perform` |
| `DECLARATIVES` / `USE AFTER` | 40 | `aa02-decl-reentrancy`, `h13-sort-dup-outputproc-decl`, `z05-integration-batch` |
| `SECTION`s in the Procedure Division | 21 | `dd13-thru-crosssect-recur`, `l02-godep-ws-collide`, `x08-backward-thru-section` |

Reference modification is *present* in the corpus but is **not** a passing area: 19 programs (for example `d12-inspect-str-unstr-refmod`, `g01-refmod-unstring-delim`, `pp08-refmod-numeric-compute`) probe `identifier(start:length)`, and per [ACTION_PLAN_2026-10.md](ACTION_PLAN_2026-10.md) step 2 they are currently registered as `t.todo` (the generator emits a placeholder). They are counted in the 574 but do not count as verified behaviour. The same applies to any other program registered as `t.todo` in the whole suite (45 todo markers at the last audit; see the verification ledger for the authoritative list).

## 3. File I/O, by `ORGANIZATION`

| Feature | Programs | Examples |
|---|---:|---|
| `ORGANIZATION LINE SEQUENTIAL` | 81 | `aa02-decl-reentrancy`, `jj03-linage-exceeds`, `z05-integration-batch` |
| `ORGANIZATION SEQUENTIAL` (record sequential) | 1 | `bb11-redefines-occurs-lowvalues` |
| `ORGANIZATION RELATIVE` | 75 | `bb01-rewrite-length-shrink`, `gg02-odo-rewrite-varycount`, `pp12-use-error-proc-file` |
| `ORGANIZATION INDEXED` (negative probe only; see section 7) | 1 | `cc04-indexed-recordkey-random` |
| `SELECT ... ASSIGN` | 175 | `aa01-sort-inputproc-thru`, `hh03-relfile-tblgrp-signed`, `z05-integration-batch` |
| `OPEN` (INPUT / OUTPUT / I-O) | 158 | `aa02-decl-reentrancy`, `h13-sort-dup-outputproc-decl`, `z05-integration-batch` |
| `CLOSE` | 133 | `bb01-rewrite-length-shrink`, `hh01-write-eop-notclause`, `z05-integration-batch` |
| `READ` | 102 | `bb01-rewrite-length-shrink`, `gg08-unstring-keyed-read`, `z05-integration-batch` |
| `READ ... AT END` | 112 | `aa01-sort-inputproc-thru`, `j09-nested-sort-via-call`, `z13-searchall-skipmiddle` |
| `WRITE` | 131 | `bb01-rewrite-length-shrink`, `h13-sort-dup-outputproc-decl`, `z05-integration-batch` |
| `WRITE ... FROM` / `ADVANCING` | 14 | `bb08-rewrite-recursive`, `j02-merge-3using`, `t03-write-from` |
| `REWRITE` | 23 | `bb01-rewrite-length-shrink`, `dd09-decl-filestatus-branch`, `oo06-file-open-input-write` |
| `DELETE` (record) | 12 | `bb03-delete-already-deleted`, `dd12-delete-recursive`, `oo05-file-post-close-ops` |
| `START` | 18 | `bb09-start-basic`, `jj07-searchall-rec-nest`, `r14c-searchloop-editedmove-iso` |
| `FILE STATUS` | 111 | `aa02-decl-reentrancy`, `gg03-sign-leading-file`, `z05-integration-batch` |
| `ACCESS MODE RANDOM/DYNAMIC` | 35 | `bb09-start-basic`, `gg08-unstring-keyed-read`, `pp12-use-error-proc-file` |
| `RELATIVE KEY` | 74 | `bb01-rewrite-length-shrink`, `gg02-odo-rewrite-varycount`, `pp12-use-error-proc-file` |
| `INVALID KEY` | 23 | `bb09-start-basic`, `gg13-start-odo-relfile`, `pp04-start-after-close` |
| `LINAGE` | 15 | `hh01-write-eop-notclause`, `jj11-linage-thru`, `nn01-linage-recursive-redef` |

All file I/O is against files the program itself creates and reads back inside one run. There is no pre-existing dataset, no JCL `DD` allocation, and no byte-level comparison of the files themselves; only what the program `DISPLAY`s is compared.

## 4. Intrinsic functions

The corpus uses **8 distinct intrinsic functions** (`FUNCTION` followed by a name) in 36 programs. The capability audit's claim of a wider function set rests on unit tests, not on this corpus.

| Feature | Programs | Examples |
|---|---:|---|
| Any intrinsic `FUNCTION` | 36 | `aa07-evaluate-nested-function`, `ll15-funcmod-nested-arg-min`, `v11-intrinsic-cond` |
| `FUNCTION MOD` | 14 | `bb10-relative-key-function`, `mm11-evaluate-func-subject-thru`, `v11-intrinsic-cond` |
| `FUNCTION NUMVAL` | 12 | `f03-refmod-numval-subscript`, `p15-intrinsics`, `v05c-numval-comma-only` |
| `FUNCTION LENGTH` | 14 | `c6-comp-sync`, `f02-refmod-function-length`, `r11-intrinsics-composition` |
| `FUNCTION MAX` | 6 | `mm05-func-max-nested-rounded`, `r14-interplay`, `v11-intrinsic-cond` |
| `FUNCTION MIN` | 1 | `v11-intrinsic-cond` |
| `FUNCTION UPPER-CASE` | 5 | `aa07-evaluate-nested-function`, `p15-intrinsics`, `r11b-intrinsics-iso` |
| `FUNCTION TRIM` | 2 | `aa07-evaluate-nested-function`, `j07-string-pointer-function` |
| `FUNCTION REVERSE` | 1 | `p15-intrinsics` |
| Nested `FUNCTION` calls in arguments | 8 | `aa07-evaluate-nested-function`, `mm03-func-nested-3deep`, `r11b-intrinsics-iso` |

No corpus program uses `LOWER-CASE`, `ORD`/`CHR`, `CURRENT-DATE`, `INTEGER-OF-DATE`/`DATE-OF-INTEGER`, `NUMVAL-C`, `SUM`/`MEAN`/`MEDIAN`, `SQRT`, `ABS`, `RANDOM`, or any other function not in the list above.

## 5. Program structure and interop

| Feature | Programs | Examples |
|---|---:|---|
| Multiple `PROGRAM-ID`s in one source file | 123 | `aa05-call-decl-byref`, `l04-mutual-recur3`, `z15-call-omitted` |
| Nested (contained) programs, `END PROGRAM`-delimited | 62 | `aa05-call-decl-byref`, `k12-recursive-stoprun-depth`, `z15-call-omitted` |
| `PROGRAM-ID ... RECURSIVE` | 71 | `bb08-rewrite-recursive`, `kk07-call-content-ref-recursive`, `pp03-refmod-write-grouplink` |
| `PROGRAM-ID ... INITIAL` | 1 | `pp15-program-initial` |
| `CALL` | 124 | `aa05-call-decl-byref`, `l05-dyncall-dataname`, `z15-call-omitted` |
| `CALL ... USING BY REFERENCE` | 31 | `aa05-call-decl-byref`, `nn04-call-byref-refmod-recur`, `x07-sign-separate-call-byref` |
| `CALL ... USING BY CONTENT` | 17 | `e14-call-mixed-modes-table`, `ll04-evaluate-multiwhen-recur`, `v03-call-content-literal` |
| `CALL ... USING BY VALUE` | 2 | `e14-call-mixed-modes-table`, `g06-call-byvalue-occurs-group` |
| `CALL "literal"` (static name) | 122 | `aa05-call-decl-byref`, `l04-mutual-recur3`, `z15-call-omitted` |
| `CALL identifier` (dynamic name) | 2 | `l05-dyncall-dataname`, `mm10-dyncall-changing-name` |
| `PROCEDURE DIVISION USING` | 114 | `aa05-call-decl-byref`, `l01-recgrp-nested`, `z15-call-omitted` |

CALL interop covers programs defined in the same source file only. A `CALL` to a subprogram that is not in the same file is not translated (a visible TODO marker is emitted); see section 7.

## 6. Source format

All corpus programs are fixed-format (indicator in column 7) and self-contained in one source file, apart from the few copybooks stored beside the corpus (see the `COPY` rows in section 1). Free-format source is not exercised.

## 7. NOT covered / known gaps

Mirrors [CAPABILITY_AUDIT_AND_ROADMAP.md](CAPABILITY_AUDIT_AND_ROADMAP.md) section 1.3 (the authoritative, risk-ordered list), plus the items this corpus enumeration itself surfaced. Absence here is not "works"; it is "unknown".

**Engine gaps (documented as open):**

- **Reference modification (`identifier(start:length)`)** - open; step 2 of the action plan is in progress. The largest remaining engine risk.
- **`ORGANIZATION IS INDEXED` / VSAM-style keyed access** - not implemented. The installed GnuCOBOL build has indexed-file support compiled out, so it also cannot be oracle-verified in this environment. Only one negative probe (`cc04-indexed-recordkey-random.cbl.txt`) touches it.
- **`EXEC SQL` wired into the main generator** - not wired. Doobie generation exists in isolation and is compile-verified; the 5 `sql/` programs are not run against a database or compared with `cobc`.
- **`EXEC CICS` behaviour** - not translated. A skeleton generator emits `???`-bodied service stubs; no corpus `.cbl` exercises CICS and nothing is behaviourally verified.
- **IMS DL/I** - not handled.
- **JCL** - structural parse and dataset-lineage JSON only; no pipeline generation, no execution parity.
- **EBCDIC at rest** - the cp037 codec is unit-tested, but no generated-class round trip combines EBCDIC charset with numeric fields, and the stdout oracle runs in ASCII.
- **`GO TO` / `PERFORM` escaping an active `PERFORM ... THRU` range** (or a SORT/MERGE procedure) - not reproduced.
- **`CALL BY REFERENCE/CONTENT` of a group containing an `OCCURS` table into an ordinary (non-recursive) subprogram** - callee sees an empty table.
- **`UNSTRING` with a variable `DELIMITED BY`** - the statement no-ops.
- **`SORT/MERGE ... USING file GIVING file`** (no procedure form) - not implemented.
- **`ALTER`** - parses; retargeting is a no-op.
- **`REDEFINES` of an `OCCURS` group by another `OCCURS` group** - byte-level stub.
- **`OCCURS DEPENDING ON` dynamic `parse`/`format`** - fixed maximum only.
- **Non-error `USE` declaratives** (`USE FOR DEBUGGING`, `USE BEFORE REPORTING`) - never invoked.
- **External / dynamic `CALL`** to subprograms outside the source file - visible TODO marker.
- **Report Writer, Screen Section, OO-COBOL** - deliberately out of scope.

**Not exercised by any corpus program (enumeration finding; the engine may or may not handle them):**

- `LOCAL-STORAGE SECTION`, `EXTERNAL`, `GLOBAL`, `PROGRAM-ID ... COMMON`
- `PIC A` (alphabetic) fields; `USAGE INDEX`; `USAGE POINTER`
- Class conditions (`IS NUMERIC`, `IS ALPHABETIC`) and sign conditions (`IS POSITIVE`/`NEGATIVE`) as `IF` tests
- `NEXT SENTENCE`; `CALL ... RETURNING`; `CANCEL`; `OPEN EXTEND`; variable-length `RECORD VARYING`
- Any intrinsic function not listed in section 4
- Multi-file sequential batch flows with pre-existing input data, `ASSIGN` to real dataset names, and `DD`-style allocation

**Outside what this oracle can ever show (the mainframe gap):**

- **IBM Enterprise COBOL semantics.** Documented GnuCOBOL-vs-IBM divergences: intermediate arithmetic precision, `TRUNC` defaults on binary fields, sign display and sign-nibble conventions, `SORT` tie ordering for equal keys, and EBCDIC collating sequence. The corpus was never run under IBM.
- **Dialect flags.** Only the default dialect is exercised; no `-std=ibm`, `-std=mf`, or other dialect/compile-option variation.
- **Runtime environment.** CICS, DB2, VSAM, JCL, IMS, MQ, batch scheduling, record-locking, and storage-at-rest (EBCDIC, packed data in real datasets).
- **Performance, memory and numeric limits at production scale.**
- **Anything outside stdout:** return codes, abends, file contents, and stderr are not part of the bar.
- **Adversarial exhaustion.** Rounds 38-40 still found real bugs, including two entirely unimplemented statements. The corpus reflects what 40 rounds could think to probe, not a bound on remaining defects.

## Related

- [VIABILITY_REPORT_2026-10.md](VIABILITY_REPORT_2026-10.md) - why the oracle is not the mainframe and what that costs commercially
- [ACTION_PLAN_2026-10.md](ACTION_PLAN_2026-10.md) - the ordered next steps (reference modification, IBM calibration, divergence register)
- [CAPABILITY_AUDIT_AND_ROADMAP.md](CAPABILITY_AUDIT_AND_ROADMAP.md) - statement-level audit and Known Gaps
- Verification ledger: `Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md`
