# Oracle Divergence Register: GnuCOBOL (as the harness runs it) vs IBM Enterprise COBOL

Date: 2026-10-05. Grounding: step 3 of `docs/ACTION_PLAN_2026-10.md`; section "Nothing on the market matches this engine's evidence standard, but its oracle is not the mainframe" of `docs/VIABILITY_REPORT_2026-10.md`.

Scope of this document: what can be established **without** an IBM compiler. Everything labelled MEASURED was produced by running `cobc` in this sandbox on the 563 `tests/corpus/**/*.cbl` programs. Everything labelled VENDOR/FORUM/THIRD-PARTY comes from a public source and was not independently reproduced. Anything labelled UNVERIFIED is recollection or inference. **No IBM compiler was available; no claim here says what IBM produces for any corpus program.** Section 8 lists what the owner must procure.

## 0. Headline findings

1. The harness oracle is `cobc (GnuCOBOL) 4.0-early-dev.0` run as `cobc -x -o <exe> <src>` (+ `-I <dir>` when a `.copybooks.json` exists). cobc loads `default.conf` (confirmed by `cobc -v`: "loading standard configuration file 'default.conf'"). It is **not** `-std=ibm`, and it is an early development build of the 4.0 line, not the 3.2 stable release.
2. Reproducibility check: my default-dialect re-run of all 558 compilable programs reproduced the committed `.oracle.txt` captures **byte-for-byte (558/558 identical)**, and a second default run was identical to the first. The oracle is deterministic and my driver replicates the harness. (Five `corpus/sql` programs, EXEC SQL, fail to compile under every dialect and have no `.oracle.txt`; they are the 563 - 558 gap.)
3. **Under `-std=ibm`, 107 of 558 runnable programs (19.2%) change stdout; under `-std=ibm-strict`, 105 change and a further 12 fail to compile** (117 of 563 unusable or different). Exit status never changed for any program that still compiled.
4. The change is almost entirely **one construct: how `DISPLAY` formats numeric items**. The `-std=ibm` configs set `pretty-display: no`; `-fno-pretty-display` alone on the default dialect reproduces exactly the same 107-program set. After re-enabling `-fpretty-display` under `-std=ibm`, only **2** programs still differ, and each is explained by one flag: `nn12-compute-mixed-types-chain` (`arithmetic-osvs`, intermediate precision) and `ee04-comp1-elem-redefines` (`binary-truncate: no`).
5. Neither dialect is IBM for DISPLAY. Public sources (third-party ironwork register, section 5) say IBM overpunches the sign of signed zoned DISPLAY items (e.g. -12 in `S9(3)` shows `01K`), whereas `-std=ibm` shows a separate trailing sign (`012-`) and the default shows a leading sign (`-012`). So the 107 "changed" outputs are not "the IBM answer"; they show that **our engine's current DISPLAY formatting is the GnuCOBOL default `pretty-display` behaviour, a choice IBM does not share in either form.** Only an IBM run can say what the right bytes are.
6. The classic "intermediate precision" divergence (100 vs 188) is real but, in this corpus, measurable in only **1** program (`nn12`) under `-farithmetic-osvs`. That is a corpus coverage statement, not evidence the engine is right: 14 programs use ROUNDED and 93 use COMPUTE, but few have decimal intermediates that straddle the divergence.

## 1. Toolchain facts (MEASURED)

```
$ cobc --version
cobc (GnuCOBOL) 4.0-early-dev.0
Copyright (C) 2020 Free Software Foundation, Inc.
Written by Keisuke Nishida, Roger While, Ron Norman, Simon Sobisch, Edward Hart
Built     Mar 31 2024 06:15:26
Packaged  Jun 06 2020 20:56:36 UTC
C version "13.2.0"
```

- Package: Ubuntu 24.04 `gnucobol4 4.0~early~20200606-6.1build1` (`dpkg -l gnucobol4`). Upstream snapshot dated 2020-06-06. `docs/toolchain-status.md` records the same version for the whole 40-round campaign.
- `cobc --info`: x86_64 Linux, gcc 13.2.0, `COB_CONFIG_DIR=/etc/gnucobol`, 64-bit, little-endian, **native character set ASCII**, GMP math library, indexed file handler **disabled**, XML and JSON libraries **disabled**, ncursesw screen I/O.
- `cobc -v -x -o h h.cob` prints `loading standard configuration file 'default.conf'`, then runs `gcc -c -Wno-unused -fsigned-char -Wno-pointer-sign -Wdate-time -finline-functions -pipe` and links. No `-std` is applied.
- This is a development build. It is not the 3.2 stable release. Third-party registers (section 5) were produced against 3.2.0; settings differ in places (examples in 1.2).
- Environment note: during this session another process transiently installed `gnucobol3` 3.1.2 over `/usr/bin/cobc`; I re-installed `gnucobol4` and confirmed `4.0-early-dev.0` before the experiment. Any future audit should record `cobc --version` in its output, not assume it.

### 1.1 What the dialect configs change (MEASURED from `/etc/gnucobol/*.conf`)

Files shipped in `/etc/gnucobol`: `default.conf`, `ibm.conf`, `ibm-strict.conf`, `lax.conf-inc`, `ibm.words`-based word lists, plus mf/mvs/bs2000/acu/realia/rm/xopen/cobol85/2002/2014 variants.

- `default.conf` is GnuCOBOL's own dialect (`standard-define 0`, `reserved-words: default`).
- `ibm-strict.conf` (`standard-define 2`) is a full config. `ibm.conf` is `include "ibm-strict.conf"` followed by `lax.conf-inc` (relaxed syntax, GnuCOBOL's full reserved-word list plus `ibm.words` extras). So **`-std=ibm` = ibm-strict's runtime/semantic settings + relaxed compile-time checks.** Reserved words listed by `cobc -list-reserved`: default 971 lines, ibm 1025, ibm-strict 498. Intrinsic functions known: default 109, ibm-strict 49.

Semantic (runtime-affecting) settings, default vs `-std=ibm` and `-std=ibm-strict` (identical in both IBM modes):

| Setting | default | ibm / ibm-strict | Effect |
|---|---|---|---|
| `pretty-display` | yes | **no** | DISPLAY format of numeric items (sign, decimal point, widths). This alone explains 105 of the 107 changes. |
| `binary-truncate` | yes | **no** | Binary stores are not cut to PICTURE digits (TRUNC(BIN)-like). IBM's default is TRUNC(STD) per THIRD-PARTY (section 5), so this setting moves *away* from IBM's default. |
| `arithmetic-osvs` | no | **yes** | Intermediate results limited to the receiver's precision. |
| `perform-osvs` | no | yes | Exit point of any running PERFORM is recognised when reached. |
| `move-ibm` | no | yes | Byte-by-byte left-to-right MOVE for overlapping moves. |
| `binary-size` | 1-2-4-8 | 2-4-8 | Storage bytes for COMP (affects group layouts, `LENGTH OF`). |
| `hostsign` | no | yes | Packed NUMERIC test accepts sign nibble F. |
| `sticky-linkage` | no | yes | LINKAGE items stay allocated between calls. |
| `complex-odo`, `indirect-redefines`, `relax-level-hierarchy` | no | yes | Accept ODO/REDEFINES forms IBM allows. |
| `assign-clause` | dynamic | external | ASSIGN semantics. |
| `word-length` / `literal-length` / `numeric-literal-length` / `pic-length` | 63 / 8191 / 38 / 255 | 30 / 160 / 18 / 50 (strict); ibm relaxes to 63/8192/38/255 | IBM limits. |
| `align-record`, `align-opt` | 0, no | 8, yes | Record alignment. |
| `reserved-words` | default | IBM list (strict) | Strict rejects words IBM does not reserve and rejects some IBM-legal items (section 3.2). |
| `binary-byteorder` | big-endian | big-endian | Same in all three. |
| `line-col-zero-default`, `implicit-assign-dynamic-var`, `screen-section-rules` | yes, yes, gc | no, no, std | Screen/ASSIGN details; not exercised by the corpus. |

Dozens of syntax-acceptance settings also move (`symbolic-constant`, `constant-78`, `numeric-boolean`, `program-prototypes`, `perform-varying-without-by`, `zero-length-literals`, etc.) to `unconformable` or `error` in strict mode. They affect compilation only.

### 1.2 Differences between this build and the 3.2.0 reports (MEASURED + THIRD-PARTY)

- 4.0-early-dev's `ibm-strict.conf` has **no `odoslide` setting** (`-fodoslide` exists as a flag; running the corpus with it changed nothing). ironwork reports that 3.2.0 `-std=ibm-strict` sets `odoslide: yes`.
- `-fdefault-colseq=EBCDIC` (cited by ironwork for 3.2) is **unrecognised** by this build (tested: `cobc: unrecognized option`). There is no cheap EBCDIC-collation experiment available here.
- `-fnotrunc` in this build changes the same 107-program set as `-fno-pretty-display` (plus the `ee04` binary effect); do not assume it means "only TRUNC".
- Hence: citing ironwork's findings as "GnuCOBOL -std=ibm-strict behaviour" does not transfer automatically to our 4.0-early-dev oracle.

## 2. Experiment: method and results (MEASURED)

### 2.1 Method

Driver: `scratchpad/dialect-audit/driver.mjs` (Node; analysis `analyze.py`, `classify.py`). It replicates `runCobol` in `tests/oracle/harness.js` (lines ~125-185): copy the `.cbl` to `<tmp>/<name>.cob`, write each `.copybooks.json` entry as `<tmp>/<NAME>.cpy`, `cobc [flags] -x -o <exe> <src>` plus `-I <tmp>` when copybooks exist, 10 s timeout for compile and run, stdin empty, cwd = scratch dir. Only stdout and the exit code are compared (as the harness does); no Scala. 563 programs x 22 configurations, 4 workers, about 20 s per configuration, run detached. Raw per-config outputs are in `scratchpad/dialect-audit/out/<config>/`.

Each config's result is classified against the default run as: same, output-changed, exit-changed (never happened), compile-broke (compiles by default, not under the config), compile-fixed (never happened), or both-compile-fail (5 SQL programs).

Caveat: date-dependent programs (`oo13`, `pp06`, `pp07`, `s08`) were run within the same day so they compare equal; they are not a source of the differences below.

### 2.2 Counts

| Configuration | same | stdout changed | compile broke | both fail (SQL) |
|---|---|---|---|---|
| default (baseline; equals committed `.oracle.txt` for all 558) | 558 | - | - | 5 |
| default, second run (determinism check) | 558 | 0 | 0 | 5 |
| `-std=ibm` | 451 | **107** | 0 | 5 |
| `-std=ibm-strict` | 441 | **105** | **12** | 5 |
| `-std=ibm -fpretty-display` (isolates non-DISPLAY effects) | 556 | 2 | 0 | 5 |
| `-std=ibm-strict -fpretty-display` | 544 | 2 | 12 | 5 |
| `-std=ibm -fpretty-display -fbinary-truncate` | 557 | 1 (`nn12`) | 0 | 5 |
| `-std=ibm -fpretty-display -fbinary-truncate -fno-arithmetic-osvs` | 558 | 0 | 0 | 5 |
| `-fno-pretty-display` | 451 | 107 (identical set to `-std=ibm`) | 0 | 5 |
| `-farithmetic-osvs` | 557 | 1 (`nn12-compute-mixed-types-chain`) | 0 | 5 |
| `-fno-binary-truncate` | 557 | 1 (`ee04-comp1-elem-redefines`) | 0 | 5 |
| `-fsign=EBCDIC` | 555 | 3 (`pp02-samegrp-2callsites`, `pp02b-call-bare-numlit-arg`, `oo03-byref-tblgrp-recur`) | 0 | 5 |
| `-fperform-osvs` | 558 | 0 | 0 | 5 |
| `-fmove-ibm` | 558 | 0 | 0 | 5 |
| `-fbinary-size=2-4-8` | 558 | 0 | 0 | 5 |
| `-fhostsign` | 558 | 0 | 0 | 5 |
| `-fsticky-linkage` | 558 | 0 | 0 | 5 |
| `-fodoslide` | 558 | 0 | 0 | 5 |
| `-fno-constant-folding` | 558 | 0 | 0 | 5 |
| `-fnotrunc` | 451 | 107 | 0 | 5 |
| `-fstatic-call` (not an IBM option; control) | 553 | 0 | 5 | 5 |

Exit status: unchanged for every program that compiled under every configuration. No timeouts.

Reading the table: `perform-osvs`, `move-ibm`, `binary-size`, `hostsign`, `sticky-linkage`, `odoslide` are **not exercised by any corpus program in a stdout-visible way**. That is a corpus-coverage gap for those IBM-compat behaviours, not evidence the engine is right on them.

### 2.3 Programs whose output changes under `-std=ibm`, grouped by construct

Programs can appear in more than one group. Counts of changed programs by observed pattern (56 DP, 25 SIGN, 28 WIDTH, 14 other; full per-program table in Appendix A):

| Group | Programs | What changes (default -> `-std=ibm`) | Examples |
|---|---|---|---|
| G1. Decimal point shown for implied-V items | 56 | `015.75` -> `01575`; `+0012345`-style. Default `pretty-display` inserts the `.` for `PIC 9(n)V9(m)` items (zoned, packed, binary, rounded results, subscripted targets). IBM never prints the implied point (UNVERIFIED for every case; third-party C95/C14 agree). | `ll07`, `n08-compute-rounded`, `x06`, `a01-comp3-18digit`, `p01-comp3`, `a07`, `y08`, `y10-subcorr`, `w11`, `w13`, `x05`, `p13`, `j12` |
| G2. Sign placement of signed DISPLAY items | 25 | `+00100` -> `00100+`; `-0123` -> `0123-`. Leading sign (default) vs trailing sign (`-std=ibm`). IBM, per THIRD-PARTY, uses an overpunched last digit; neither dialect matches. | `c5-sign-trailing`, `p03-zoned`, `a09-display-formatting`, `a12`, `q06`, `s09-unary-compute`, `r07-perf-negafter`, `q07`, `ff12-negative-zero-compute`, `gg04-negzero-file-roundtrip`, `x09`, `s10-intdiv-remainder-negative`, `oo09`/`oo10`/`nn13` (SIZE ERROR) |
| G3. Binary/packed/index/LENGTH display width | 28 | `LEN=12` -> `LEN=0000000012`; index `+000000003` -> `+0000000003`; `COMP +0100` -> `+00100`. | FUNCTION LENGTH: `c6-comp-sync`, `d02`-`d04`, `e01`-`e03`, `f02`, `f06`, `n07`; SEARCH/SET index: `kk09`, `ll11`, `ll12`, `q03`, `r01`, `r02`, `r14`, `r14c`, `w04`, `f12`, `aa06`, `nn10`, `e09`, `e13`, `i13`; binary: `p02-binary`, `g05`, `h10`, `y04` |
| G4. Edited/NUMVAL/intrinsic result display | included in G1/G2 | NUMVAL results, FUNCTION MAX/MIN results shown with or without point and sign | `v05`, `v05c`, `p15`, `r11`, `r11b`, `r11c`, `mm05`, `mm15`, `ll07` |
| G5. Binary value larger than PICTURE shown in full | 3 | `AMT=2594` -> `12594`; `F2=+7220` -> `+17220`; `INT=+078530011` -> `+1078530011`. TRUNC-related: under `-std=ibm` the binary field is not cut to PICTURE digits. Only `ee04` is attributable to `binary-truncate` itself; `d05` and `d02` converge when `-fpretty-display` is restored. | `d05-binary-groupvalue-comp4`, `d02-sync-groupvalue-slice`, `ee04-comp1-elem-redefines` (also its FLOAT line changes) |
| G6. Intermediate arithmetic precision (`arithmetic-osvs`) | 1 | `RESULT=+0000082.172` -> `82.375` under `-farithmetic-osvs`. One COMPUTE ROUNDED mixing COMP-3, COMP, zoned and BINARY operands. | `nn12-compute-mixed-types-chain` |
| G7. PIC P scaling DISPLAY | 2 | `UP=+123000` -> `UP=+00<123` (visible garbage byte in `-std=ibm` output, looks like a cobc rendering defect for P-scaled items without pretty-display: UNVERIFIED) | `oo08-pic-p-comp3-comp`, `nn09-picture-p-scaling` |
| G8. BY-REFERENCE/CALL with bare numeric literal | 2 | `IN SUB B=` (blank) -> `B=000`. This is the already-known build quirk (a bare numeric-literal CALL argument was corrupted to blank in the default dialect). | `pp02b-call-bare-numlit-arg`, `oo03-byref-tblgrp-recur` |
| G9. Display sign byte exposed by `-fsign=EBCDIC` | 3 | Programs that view a signed display field's last byte through an alphanumeric group change when `-fsign=EBCDIC` is used (`VAL2=020` -> `028`, `A=010` -> `318`). | `pp02-samegrp-2callsites`, `pp02b`, `oo03` |

Constructs that were looked for but produced **no** change in any dialect run: sort duplicate ordering, `OCCURS DEPENDING ON` (including `-fodoslide`), `ALTER`, `CANCEL`, `EXTERNAL`, COMP-5 byte order, INDEX/subscript use, `PERFORM` exit points, overlapping MOVE, `SIGN SEPARATE` stored bytes. "No change under cobc" is not "matches IBM"; it means cobc's own IBM modes do not distinguish them for these programs.

### 2.4 Programs that fail to compile under `-std=ibm-strict` (12 of 563) and why

All compile under the default dialect and under `-std=ibm`.

| Program | cobc strict error | Cause class |
|---|---|---|
| `j07-string-pointer-function` | `FUNCTION 'TRIM' unknown` | Strict IBM word/function list in this build lacks TRIM (UNVERIFIED whether the current IBM compiler has TRIM; ironwork reports 3.2's IBM list lacks CONTENT and COS, which Enterprise COBOL does have) |
| `aa07-evaluate-nested-function` | `FUNCTION 'TRIM' unknown` (3 sites) | same |
| `l07-declaratives-perfout` | `'HELPER-PARA' is not in DECLARATIVES` | Strict rule: PERFORM from inside DECLARATIVES to a non-declarative paragraph (IBM rule, UNVERIFIED) |
| `g07-decl-call-sort-outputproc`, `i14-call-content-table-elem`, `j06-perftest-callref-subscr`, `j04-callref-odo-counter-source`, `i12-string-pointer-table-elem`, `f03-refmod-numval-subscript` | `level 01 item '<X>' cannot have a OCCURS clause` | Strict forbids OCCURS on a level-01 item. IBM also forbids it (UNVERIFIED); the corpus programs use it. Real compile error on a mainframe. |
| `s11-display-group`, `s12-edited-operand88` | `numeric literal in VALUE clause of numeric-edited item used` | VALUE numeric literal on a numeric-edited item (ironwork 5.7: IBM refuses it too) |
| `e14-call-mixed-modes-table` | `'BINARY-LONG' is not defined, but is a reserved word in another dialect` | BINARY-LONG is a GnuCOBOL usage, not IBM. Real mainframe compile error. |

Interpretation: these 12 are programs the engine accepts that a strict IBM-conformant compiler would very likely refuse (strong candidates for "not valid mainframe COBOL" corpus entries, and a reason the corpus cannot be run on IBM unmodified). Two of the 12 (`s12`, `f03`) also change stdout under `-std=ibm`, which is why strict shows 105 changes rather than 107.

## 3. Findings from the experiment, for engineering

3.1 The engine's DISPLAY of numeric data is validated against GnuCOBOL's `pretty-display` only. About 19% of the corpus has at least one DISPLAY line whose bytes depend on this setting.

3.2 Because `-std=ibm` differs from default in one DISPLAY setting that the engine reproduces, converting the engine to match `-std=ibm` would be a **single formatting-policy change** (a "display profile" switch), not 105 independent bugs. The 2 semantic exceptions need individual attention: `nn12` (arithmetic precision) and `ee04` (binary truncation).

3.3 The measured IBM-mode outputs are not IBM answers. Where IBM differs from both (signed zoned overpunch, section 5), a third profile is needed and can only be validated with IBM.

3.4 Strict-mode compile failures flag corpus programs that use constructs IBM would reject; they should be labelled "GnuCOBOL-only" in the corpus.

## 4. Known IBM-compat flags: sensitivity by flag (MEASURED)

| Flag (exact name in `cobc --help`) | Programs whose stdout changes | Notes |
|---|---|---|
| `-farithmetic-osvs` | `nn12` | Also emits `-Warithmetic-osvs` warnings. Forum guidance says use this alone "if you only want IBM's arithmetic" (section 5 item 1). |
| `-fno-binary-truncate` / `-fbinary-truncate` (default on) | `ee04` | Default dialect already truncates (= IBM TRUNC(STD), per THIRD-PARTY). |
| `-fperform-osvs` | none | Not exercised. |
| `-fmove-ibm` | none | Not exercised (forum: it can slow runtime). |
| `-fpretty-display` / `-fno-pretty-display` | 107 | The dominant effect. |
| `-fsign=EBCDIC` | 3 | Changes the display-sign byte seen via alphanumeric views. |
| `-fbinary-size=2-4-8`, `-fhostsign`, `-fsticky-linkage`, `-fodoslide`, `-fno-constant-folding` | none | |
| `-fnotrunc` | 107 | In this build behaves like pretty-display off + binary effect. |

`-fdefault-colseq` (EBCDIC collation) does not exist in this build.

## 5. The divergence register (public sources)

Provenance labels: **[M]** measured here; **[IW]** third-party project ironwork (https://github.com/Portll/ironwork/blob/main/docs/dialect.md, fetched 2026-10-05; its survey ran `cobc -std=ibm-strict` GnuCOBOL **3.2.0** against its own re-implementation of IBM semantics read from IBM manuals, not against a real IBM compiler, so it is a reasoned register, not an IBM measurement); **[SF]** GnuCOBOL SourceForge forum, user/maintainer statements; **[?]** unverified. The links in the SF rows were fetched and the quoted statements read.

Status column legend: "Corpus" lists corpus programs that exercise the construct (by grep of the source plus the measured runs above). "Engine now" is what our engine does where I can determine it (the engine matches cobc **default** on all 558 programs, by the existing oracle suite, so for any construct the corpus exercises the engine currently equals default-dialect cobc).

| # | Item | IBM Enterprise COBOL | GnuCOBOL default / `-std=ibm` (4.0-early-dev, [M] unless noted) | Corpus | Engine now | Source |
|---|---|---|---|---|---|---|
| R1 | Intermediate arithmetic precision ("100 vs 188") | Intermediate result decimal places derive from the receiving field/operands per IBM rules; `COMPUTE C = ((399/100)-(211/100))*100` into `9(3)` gives **100** (reported on MVS Enterprise COBOL V4.2) | Default computes at full precision: **188**. `arithmetic-osvs: yes` in both IBM modes limits intermediates. Maintainer: "GnuCOBOL (like MF) evaluates expressions with as much precision as possible"; says `-farithmetic-osvs` for IBM arithmetic | `nn12` (the only program that changes); ROUNDED users: `a02`, `aa08`, `ff11`, `ll07`, `ll15`, `mm05`, `n08`, `n09`, `w13`, `x05`, `x06`, `y08`, `y10` | = default (full precision). Not IBM. | [SF] https://sourceforge.net/p/gnucobol/discussion/cobol/thread/9a729f5c/ ; IBM rules for intermediate results: [IW] 5.2 and 5.3 |
| R2 | Same, large chain: Muller recurrence in `COMP-3 9(3)V9(15)` | Z result: `X(20)=99.999996796239314` | Default: `X(20)=100.000005077793969`. Using `-farithmetic-osvs` reproduces IBM digits exactly. Maintainer note: use `-std=ibm-strict` to compile adjusted sources back to z "(likely)" with the same behavior; `-std=ibm` for full GnuCOBOL features; `-farithmetic-osvs` alone for IBM arithmetic only | none identical; COMP-3 COMPUTE with division: `nn12`, `a01`, `w11` | = default | [SF] https://sourceforge.net/p/gnucobol/discussion/cobol/thread/2b404bea5f/ (reply dated 2021-01-04) |
| R3 | cobc's osvs is itself imperfect vs IBM | IBM cuts every intermediate to its dmax | `-farithmetic-osvs` has bugs: `cob_decimal_align` divides where it should multiply; a literal right operand is not cut; `* 1`, `/ 1`, `+ 0`, `- 0` are constant-folded away (cobc 3.2.0). Whether these exist in 4.0-early is [?] | `nn12` | n/a | [IW] 5.3 |
| R4 | ROUNDED receiver intermediates | A ROUNDED receiver counts one extra decimal place in every operation (ironwork C101, "chosen so CCVS85 NC117A and NC171A pass") | cobc osvs counts the extra place in the last operation only: `COMPUTE D ROUNDED = D + E / 3` -> IBM-reading 5.12, cobc 5.11 | 14 ROUNDED programs (R1 row) | = default | [IW] section 3, C101 (an assumption, flagged "chosen" by ironwork, i.e. not an IBM-confirmed fact) |
| R5 | DISPLAY of signed zoned item | Last digit overpunched: -12 in `S9(3)` shows `01K` (Programming Guide, DISPSIGN) | default `pretty-display`: `-012` (leading sign); `-std=ibm`: `012-` (trailing sign) [M] | G2 above: 25 programs, e.g. `c5-sign-trailing`, `p03-zoned`, `a09-display-formatting` | = default (`-012`). Differs from IBM and from `-std=ibm`. | [IW] 5.2 and C14 |
| R6 | DISPLAY of packed / binary item | PICTURE digits, sign overpunched: `S9(5)V99 COMP-3` -123.45 shows `001234N`; COMP shows PICTURE digits (`S9(4) COMP` -12 shows `001K`); COMP-5 and TRUNC(BIN) binary in 5/10/20 digits | default: `-123.45` with point; `-std=ibm`: `-0012345` [M] ; cobc shows sign before digits (libcob `display_numeric`) [IW] | `a01`, `p01-comp3`, `p02-binary`, `y04`, `w02`, `x03` | = default | [IW] C14 |
| R7 | Implied decimal point in DISPLAY | Not printed (`9(3)V99` shows `00250`); UNVERIFIED for numeric-edited-free literals | default: printed (`002.50`); `-std=ibm`: `00250` [M] | G1: 56 programs | = default | [M]; IBM behaviour [?] (well known but not confirmed here) |
| R8 | DISPLAY of numeric literal | As written, point kept (`1.5`) | cobc: digits, no point (`15`) [IW C95, "the Language Reference is silent"] | `u03b-decimalcomma-labeled`, DISPLAY of literals widespread | [?] | [IW] C95 |
| R9 | TRUNC default (binary truncation) | TRUNC(STD) default: `MOVE 123456 TO 9(4) COMP` keeps 3456 | default `binary-truncate: yes` (cuts, like TRUNC(STD)); `-std=ibm*` sets `binary-truncate: no` (keeps 57920, TRUNC(BIN)-like) [M conf + IW] | `a03-move-numeric-truncation`, `z08-move-trunc`, `d05`, `d06`, `ee04`; only `ee04` changes in cobc runs | = default (truncating, same as IBM's default) | [IW] 5.2; [M] `/etc/gnucobol/*.conf`; the viability report states this point |
| R10 | SORT / MERGE duplicate-key order | Unspecified without `WITH DUPLICATES IN ORDER`; IBM's sort product determines it (UNVERIFIED) | cobc output order is an implementation detail of its internal sort; no divergence measurable between dialects (0 of 30 SORT programs changed) [M] | `r05-sort-duplicates-stability`, `ii11-sort-duplicates-fileio`, `kk11-sort-duplicates-multikey`, `nn05`, `h13`; MERGE: `nn06`, `j02`, `h05` | = default. IBM order unknown. | [?] No forum thread was read for this item. Needs IBM run. |
| R11 | EBCDIC vs ASCII collating | EBCDIC: lowercase < uppercase < digits; space < letters | ASCII native: digits < uppercase < lowercase. In comparisons, SORT and MERGE keys. `-fdefault-colseq` not available in this build [M] | `q04-insp-before-after` (only program mentioning COLLATING SEQUENCE/ALPHABET); mixed-case or digit-vs-letter key ordering in the 30 SORT and 12 MERGE programs is **not audited** | ASCII | [IW] 5.1 |
| R12 | Hex literals, ORD/CHAR, HIGH/LOW-VALUE, sign nibbles | EBCDIC code points | ASCII code points. `-fsign=EBCDIC` changes 3 corpus programs [M] | `x"..."`/HIGH-VALUE/LOW-VALUE in 4 programs; the 3 above | ASCII | [IW] 5.1; [M] |
| R13 | INDEX data items | Displacements (byte offsets); using an index set for one table on another table is wrong on z | cobc treats INDEX as subscripts so cross-table use "works" ("GnuCOBOL treats all INDEX variables as subscripts whereas Enterprise COBOL treats them as displacements") | `q03-idx-set-updown-indexcompare`, `w04-set-index-arith`, `o06-recur-set-index-updown` (SET UP/DOWN), plus 31 programs with INDEXED BY; DISPLAY of an index changes width under `-std=ibm` (`+000000003` -> `+0000000003`, 15 programs) | Subscript-style = default; DISPLAY of an index is [?] | [SF] https://sourceforge.net/p/gnucobol/discussion/help/thread/1483e7dd1a/ (a user answer to "GnuCOBOL compilation on z/OS", quoted; the thread is about installing on z/OS, not a maintainer statement) |
| R14 | COMP-4/COMP-5 byte order and size | COMP/COMP-4 big-endian on z; COMP-5 native-endian (UNVERIFIED which is little on IBM Linux x86) | `binary-byteorder: big-endian` in all three configs [M]; COMP-5 here is a native binary (little-endian x86) [?] | `d05-binary-groupvalue-comp4`, `d06-binary-groupvalue-comp5` (the only 2 programs naming COMP-4/COMP-5) | = default | [M] conf; rest [?] |
| R15 | `binary-size` (bytes for COMP) | 2/4/8 | default 1-2-4-8 (a `PIC 9(2) COMP` is 1 byte); ibm 2-4-8 [M] | 64 COMP/BINARY programs; no stdout change (0 of 563) | = default. Group lengths and REDEFINES over COMP fields in 11 SYNC and 38 REDEFINES programs are layout-sensitive but did not change output | [M] |
| R16 | EXTERNAL record size mismatch | Run ends | cobc lets a shorter description share the storage with only a warning; ends the run on a longer one (3.2.0) | `l05-dyncall-dataname`, `p12-sort`, `pp14-call-on-exception`, `pp14b-call-not-on-exception` (mention EXTERNAL, mostly as file/ASSIGN, not size-mismatch tests) | not tested | [IW] C180 (assumption). Viability report cites a forum thread for "only warns" (not re-fetched here) |
| R17 | ACCEPT at end of SYSIN | Receiver unchanged | cobc moves a space: numeric becomes zero, alnum becomes spaces; message on stderr | `m01-recur-init-group`, `oo13`, `pp06`, `pp07`, `s08` (these use ACCEPT FROM DATE/DAY, not stdin exhaustion) | not tested | [IW] C15 (assumption) |
| R18 | Dynamic CALL of an ENTRY name; CANCEL | Own WORKING-STORAGE copy per entry name; CANCEL of a literal-CALLed program is a no-op under NODYNAM | Entries share the program's one WORKING-STORAGE; CANCEL resets even for literal CALL; `-fstatic-call` does not change that | `j01-goback-paragraph`, `oo11-exitprogram-vs-goback` use CANCEL; 135 programs use CALL; entry-name CALL not seen | Unknown for IBM | [IW] C51, 5.2 |
| R19 | MOVE alphanumeric to numeric; MOVE zoned to zoned | Digit's low half; zone F | cobc reads sign, point, spaces as such; non-digit gives zero; zoned moves copy bytes | `a12`, `f01-refmod-move-numeric-target`, `z08` | = default | [IW] C240, C260 (both "chosen") |
| R20 | ODO receiving group | Received at its maximum length | At the object's current value (3.2.0 `odoslide yes` under strict; no such setting in 4.0-early conf) | 40 ODO programs (e.g. `e13-odo-search`, `h10`, `i13`, `j04`, `nn10`); `-fodoslide` changes none | = default | [IW] 5.2 |
| R21 | `ADD X TO X Y` | Sum of operands before TO held in a temporary for every receiver | X re-read for Y | not specifically searched | [?] | [IW] 5.2 |
| R22 | Intermediate > 30 digits | Truncated to 30 (31 with ARITH(EXTEND)) | All digits kept | `aa08-comp3-18digit-sizeerror`, `a01-comp3-18digit`, `q05` are 18-digit but not intermediates > 30 | not tested | [IW] 5.2 |
| R23 | Invalid decimal data, divide by zero without SIZE ERROR | Program check (S0C7, S0CB, S0C9) | Runs on, receiver unchanged; no abend | 13 ON SIZE ERROR programs test the covered path only | = cobc (runs on) | [IW] 5.2 |
| R24 | MEAN, MEDIAN, NUMVAL etc. | Floating point, rounded into receiver | Exact decimal, truncated | 12 NUMVAL programs, 42 FUNCTION programs; `v05`, `p15`, `r11c`, `mm05`... | = default | [IW] 5.2 |
| R25 | MAX/MIN/SUM/MOD/INTEGER result decimals | Rules from the Programming Guide (dmax-based) | MAX/MIN return the winning argument's own field; MOD/INTEGER field as large as value | `mm05-func-max-nested-rounded`, `ll15-funcmod-nested-arg-min`, `r11-intrinsics-composition` | = default | [IW] 5.2 |
| R26 | RETURN-CODE size | `S9(4) BINARY` | fullword; program exit status modulo 256 | none (0 use RETURN-CODE) | n/a | [IW] 5.2 |
| R27 | Floating point | IBM hex float (HFP) | IEEE | 16 COMP-1/COMP-2 programs (`ff09-comp1-sort-key`, `ee04`, `ee11-search-all-comp1-key`) | IEEE = default | [IW] 5.1 |
| R28 | Strictness: things cobc accepts that IBM refuses | Compile error | Default accepts `OCCURS` at level 01, `BINARY-LONG`, numeric VALUE on edited item, TRIM function use, etc. | 12 programs (section 2.4) | accepted | [M] |
| R29 | Reserved words/limits | Names <= 30 chars, IBM reserved set; END-DISPLAY is not reserved in Enterprise COBOL | default 63-char names, wider reserved set | not measured beyond `-std=ibm-strict` compile results | | [IW] 5.6 |
| R30 | Collected cobc bugs (not dialect): `cob_decimal_align`, constant-folding, SEARCH VARYING, BLANK WHEN ZERO, INITIALIZE TO VALUE | per IBM docs | wrong in cobc 3.2.0 | not identified | unknown for 4.0-early | [IW] 5.3 |
| R31 | JSON/XML GENERATE | UTF-8 etc. | libraries disabled in this build | none (0 JSON/XML programs) | n/a | [IW]; [M] `cobc --info` |

Not located in a public source during this task (unverified): any definitive IBM statement on SORT duplicate ordering; any IBM-measured EBCDIC SORT example in the corpus context.

## 6. Recommendation (do not implement; for the owner)

6.1 **Do not switch the oracle's single run to `-std=ibm`.** Reasons: (a) it would change 107 of 558 `.oracle.txt` captures (19.2%) and make 12 more programs uncompilable under strict (use `-std=ibm` instead, which compiles all 558); (b) 105 of the 107 are a single display-format policy and the result is still not IBM's (signed zoned, packed and binary DISPLAY differ again); (c) `-std=ibm` turns binary-truncate off, i.e. away from IBM's default TRUNC(STD), so it is less IBM on that axis than the current default.

6.2 **Instead run both dialects and flag disagreement.** In the harness, run `cobc` twice per program: baseline `-x` and `-std=ibm` (not strict). If stdout or exit status differ, record the program as `dialect-sensitive: needs IBM confirmation`, and include the delta in the oracle report. The experiment says this would flag 107 programs today. Add a third run `-std=ibm -fpretty-display` to separate the display-only group from semantic groups (2 programs today: `nn12`, `ee04`). Keep the oracle's pass/fail on the default dialect unchanged so the 40-round evidence remains comparable.

6.3 Engine work implied (quantified): 107 changed outputs imply at most **1 engine feature** (a selectable DISPLAY-numeric formatting profile) plus **2 semantic fixes** (`nn12` intermediate precision; `ee04` binary truncation), only if the owner decides IBM-mode matching is the target. The correct DISPLAY profile must be decided from IBM output, not from `-std=ibm`, so building it before calibration risks encoding a second non-IBM behaviour.

6.4 Claims language: every verification statement should carry the oracle identity (section 7.4). Suggested wording: "Output equals GnuCOBOL 4.0-early-dev.0 default dialect on N programs; 107 programs are dialect-sensitive under `-std=ibm`; not compared with IBM Enterprise COBOL."

6.5 Add a one-line `cobc --version` + flag capture to each oracle run artifact so a version change is visible (the environment was observed to switch to 3.1.2 mid-session).

6.6 Corpus hygiene: tag the 12 strict-compile failures (TRIM, level-01 OCCURS, BINARY-LONG, numeric VALUE on edited item, PERFORM out of DECLARATIVES) as GnuCOBOL-only constructs so the IBM calibration run can skip or adapt them.

## 7. Calibration protocol (for when IBM COBOL is available)

7.1 Environment: IBM COBOL for Linux on x86 (or z/OS Enterprise COBOL on a trial/ADCD instance). Record: compiler product and version (V6.x), compile options, run-time options, LE release, code page, and host (z/OS vs x86 Linux; endianness and EBCDIC-vs-ASCII runtime differ). Default compiler options (TRUNC(STD), ARITH(COMPAT), NUMPROC, DISPSIGN, etc.) must be recorded because DISPLAY and arithmetic behaviour depends on them.

7.2 Sample: stratified from the 574 programs (563 corpus plus the 11 others the harness counts, to be enumerated by the owner) so every group in section 2.3 and every register item R1-R31 has at least 5 programs, preferably 10:
- all 107 dialect-sensitive programs (this is the highest-value stratum; 107 programs is small enough to run in full),
- the 12 strict-compile failures (to learn what IBM rejects),
- 15-20 control programs from the 451 unchanged (stratified by feature: file I/O, SORT/MERGE, CALL, STRING/UNSTRING, REDEFINES, tables, INSPECT),
- every program containing SORT or MERGE (30 and 12 programs, overlapping), EBCDIC-sensitive comparisons, SIGN clauses (50), COMP-3/COMP (90), and ROUNDED (14).
Total: about 200-250 programs; run all 563 if time allows.

7.3 Procedure: (1) copy each `.cbl` unmodified; where IBM rejects, make the **minimal** edit and record it in a patch file; (2) compile with the IBM compiler with the options recorded in 7.1; (3) run with the same (empty) stdin; (4) capture stdout as bytes, with the runtime code page recorded; **convert EBCDIC to ASCII only for characters that map 1:1** and keep raw hex of any line with signs or non-printables; (5) capture the exit/return code; (6) for programs writing files, capture the record images in hex (the viability report notes stdout-only oracle misses the round-29 bug class); (7) diff `ibm.out` against, in this order, (a) the committed `.oracle.txt` (default cobc), (b) `-std=ibm` output, (c) the Scala engine's output. Classify every difference by the register item (R1..R31) or add a new row.

7.4 Publish: (1) the **delta register**: one row per construct with IBM output, cobc-default output, cobc `-std=ibm` output, engine output, corpus programs, verdict (engine matches IBM / matches cobc only / matches neither), plus the minimal reproducer program; (2) a "dialect-sensitive" flag list; (3) the **exact oracle identity string to state alongside every verification claim**: `cobc (GnuCOBOL) 4.0-early-dev.0 (Ubuntu gnucobol4 4.0~early~20200606-6.1build1, packaged 2020-06-06, built 2024-03-31), gcc 13.2.0, flags: -x [-std=<none|ibm>] [-I <copybook dir>], default.conf, 10 s timeouts`, with the IBM compiler's identity for the calibrated subset; (4) engine fixes required, ordered by number of corpus programs affected.

7.5 Acceptance: for each construct, the engine either matches IBM or documents the divergence in the register; claims of "matches the mainframe" remain prohibited until all items marked "matches cobc only" for the engine's supported feature set are resolved or documented.

## 8. Requires owner procurement or action

1. IBM COBOL for Linux on x86, or a z/OS Enterprise COBOL trial/ADCD image (commercial/licensing decision). Nothing in this document is an IBM measurement.
2. A GnuCOBOL 3.2 stable build (optional but recommended) to see which register items hold on the release the community uses; the harness's 4.0-early-dev build behaves differently in places (section 1.2).
3. Decision on the oracle policy in section 6 (dual-run flagging) and on target DISPLAY semantics.
4. Access to IBM manuals (Programming Guide SC27-8714, Language Reference SC27-8713) to confirm items marked [?]/[IW "chosen"] without running the compiler.
5. Egress permission or manual retrieval for sources that were blocked here: `gnucobol.sourceforge.io/further-information.html` (HTTP 403 CONNECT), the GnuCOBOL FAQ and manual `-std` pages, other forum threads on sort order and EXTERNAL size warnings.

## 9. Reproducing the experiment

```
cd <scratch>/dialect-audit
node driver.mjs [config1,config2,...]   # writes out/<config>/<rel>.{out,meta.json}
python3 analyze.py <config...>          # compares each to out/default, writes results.json
python3 classify.py                     # groups changed lines for -std=ibm
```
Recommendation (not done): add `tools/dialect-audit.mjs` to the repo with the same logic, and a CI check that the default run equals the `.oracle.txt` set.

Limitations: stdout and exit code only; no file-record images; timeouts 10 s; four date-dependent programs not time-shifted; classification of G1-G4 is by output-pattern heuristics (digits equal after stripping sign and point, etc.) followed by manual reading of every "other" case; construct groups for programs with several changed lines may overlap.

## Appendix A. All 107 programs whose stdout changes under `-std=ibm`

DP = decimal-point dropped, SIGN = sign placement, WIDTH = leading-zero width, VALUE/OTHER = other (see section 2.3 G5-G9). "residual" = still differs after restoring `-fpretty-display` (semantic rather than display).

| Program | Classes | strict compile | residual after -fpretty-display |
|---|---|---|---|
| `a01-comp3-18digit` | DP | ok |  |
| `a02-rounded-truncation` | DP | ok |  |
| `a03-move-numeric-truncation` | DP | ok |  |
| `a07-table-of-groups` | DP | ok |  |
| `a09-display-formatting` | DP, SIGN | ok |  |
| `a12-move-corresponding-mixed` | DP, SIGN | ok |  |
| `p01-comp3` | DP | ok |  |
| `p02-binary` | WIDTH | ok |  |
| `p03-zoned` | DP, SIGN | ok |  |
| `p04-occurs` | DP | ok |  |
| `aa06-search-3level-two-idx` | WIDTH | ok |  |
| `c5-sign-trailing` | SIGN | ok |  |
| `c6-comp-sync` | WIDTH | ok |  |
| `d02-sync-groupvalue-slice` | VALUE/OTHER, WIDTH | ok |  |
| `d03-sync-nested-subgroup` | WIDTH | ok |  |
| `d04-sync-occurs-enclosing` | WIDTH | ok |  |
| `d05-binary-groupvalue-comp4` | VALUE/OTHER | ok |  |
| `e01-sync-doublenested-occurs` | WIDTH | ok |  |
| `e02-redefines-sync-group` | VALUE/OTHER, WIDTH | ok |  |
| `e03-sync-group-level` | WIDTH | ok |  |
| `e09-searchall-decl-fileio` | WIDTH | ok |  |
| `e11-init-occurs-comp3-redef` | DP | ok |  |
| `e13-odo-search` | WIDTH | ok |  |
| `ee04-comp1-elem-redefines` | VALUE/OTHER, WIDTH | ok | yes |
| `ee11-search-all-comp1-key` | WIDTH | ok |  |
| `f01-refmod-move-numeric-target` | DP | ok |  |
| `f02-refmod-function-length` | WIDTH | ok |  |
| `f03-refmod-numval-subscript` | WIDTH | FAILS |  |
| `f06-redefines-sync-on-redefiner` | VALUE/OTHER, WIDTH | ok |  |
| `f12-3dim-occurs-searchall` | WIDTH | ok |  |
| `ff04-multi-relfile-difflen` | DP | ok |  |
| `ff11-divide-rounded-sizeerror` | DP | ok |  |
| `ff12-negative-zero-compute` | DP | ok |  |
| `ff14-linesq-signed-display` | DP | ok |  |
| `g05-sync-mixed-alignment` | WIDTH | ok |  |
| `gg03-sign-leading-file` | DP | ok |  |
| `gg04-negzero-file-roundtrip` | DP | ok |  |
| `gg05-occurs-signed-file` | DP | ok |  |
| `gg10-signsep-occurs-file` | DP | ok |  |
| `h10-redefines-odo-sync` | WIDTH | ok |  |
| `hh03-relfile-tblgrp-signed` | SIGN | ok |  |
| `hh04-relfile-nestgrp-tbl` | DP | ok |  |
| `hh12-signsep-nested-table` | DP | ok |  |
| `i13-search-odo-varying` | WIDTH | ok |  |
| `ii06-relfile-nested-table` | DP | ok |  |
| `ii07-relfile-tblgrp-rewrite` | SIGN | ok |  |
| `ii13-relfile-tblgrp-delete` | SIGN | ok |  |
| `j12-movecorr-different-order` | DP | ok |  |
| `jj05-tbl-3level` | SIGN | ok |  |
| `jj09-callref-relfile` | DP | ok |  |
| `kk09-searchall-redef-tblgrp` | WIDTH | ok |  |
| `ll07-compute-func-nested` | DP | ok |  |
| `ll11-searchall-redef-2deep` | WIDTH | ok |  |
| `ll12-searchall-redef-perfvary` | WIDTH | ok |  |
| `mm05-func-max-nested-rounded` | DP | ok |  |
| `mm15-func-arg-power-unary` | SIGN | ok |  |
| `n07-string-numeric-segments` | VALUE/OTHER | ok |  |
| `n08-compute-rounded` | DP | ok |  |
| `n09-add-giving-multitarget` | DP, SIGN | ok |  |
| `n10-subtract-corresponding` | DP, SIGN | ok |  |
| `n16-unrounded-truncation` | DP, SIGN | ok |  |
| `nn09-picture-p-scaling` | DP, SIGN, VALUE/OTHER | ok |  |
| `nn10-searchall-odo-multikey` | WIDTH | ok |  |
| `nn12-compute-mixed-types-chain` | VALUE/OTHER | ok | yes |
| `nn13-compute-2tgt-sizeerror` | SIGN | ok |  |
| `oo03-byref-tblgrp-recur` | VALUE/OTHER | ok |  |
| `oo08-pic-p-comp3-comp` | SIGN, VALUE/OTHER | ok |  |
| `oo09-add-3tgt-sizeerror` | SIGN | ok |  |
| `oo10-subtract-3tgt-sizeerror` | SIGN | ok |  |
| `p13-corresponding` | DP | ok |  |
| `p15-intrinsics` | DP, SIGN | ok |  |
| `pp02b-call-bare-numlit-arg` | VALUE/OTHER | ok |  |
| `q03-idx-set-updown-indexcompare` | WIDTH | ok |  |
| `q06-num-div-editmul` | SIGN | ok |  |
| `q07-perf-varying-after-steps` | SIGN | ok |  |
| `r01-search-midtable-varying` | VALUE/OTHER | ok |  |
| `r02-search-noatend` | WIDTH | ok |  |
| `r07-perf-negafter` | SIGN | ok |  |
| `r11-intrinsics-composition` | DP, SIGN | ok |  |
| `r11b-intrinsics-iso` | DP, SIGN | ok |  |
| `r11c-numval-bisect` | DP | ok |  |
| `r13-addcorresponding-nested` | DP | ok |  |
| `r14-interplay` | VALUE/OTHER | ok |  |
| `r14c-searchloop-editedmove-iso` | VALUE/OTHER | ok |  |
| `s09-unary-compute` | SIGN | ok |  |
| `s10-intdiv-remainder-negative` | SIGN | ok |  |
| `s12-edited-operand88` | DP | FAILS |  |
| `t08-level77` | DP | ok |  |
| `u03b-decimalcomma-labeled` | DP | ok |  |
| `v05-decimalcomma-numval` | DP | ok |  |
| `v05c-numval-comma-only` | DP | ok |  |
| `w02-group-byref-comp3-signed` | DP | ok |  |
| `w04-set-index-arith` | WIDTH | ok |  |
| `w11-divide-remainder-scale` | DP | ok |  |
| `w13-multiply-divide-rounded` | DP | ok |  |
| `w14-exponent-negzero` | DP | ok |  |
| `x03-comp3-writeread-lineseq` | DP | ok |  |
| `x05-add-corresponding-rounded` | DP | ok |  |
| `x06-compute-multiple-targets` | DP | ok |  |
| `x07-sign-separate-call-byref` | DP | ok |  |
| `x09-divrem-negative-scaled` | DP | ok |  |
| `y04-comp-binary-writeread` | WIDTH | ok |  |
| `y05-sign-separate-file` | DP | ok |  |
| `y06-mixed-trailing` | DP | ok |  |
| `y08-compute-subscripted-targets` | DP | ok |  |
| `y10-subcorr` | DP | ok |  |
| `z08-move-trunc` | DP | ok |  |

## Appendix B. Sources

- ironwork dialect register: https://github.com/Portll/ironwork/blob/main/docs/dialect.md (third-party; GnuCOBOL 3.2.0 `-std=ibm-strict` vs ironwork's reading of IBM manuals).
- GnuCOBOL forum, intermediate precision (100 vs 188): https://sourceforge.net/p/gnucobol/discussion/cobol/thread/9a729f5c/
- GnuCOBOL forum, Enterprise COBOL vs GnuCOBOL rounding, `-farithmetic-osvs` guidance: https://sourceforge.net/p/gnucobol/discussion/cobol/thread/2b404bea5f/
- GnuCOBOL forum, INDEX variables as displacements: https://sourceforge.net/p/gnucobol/discussion/help/thread/1483e7dd1a/
- Local config files: `/etc/gnucobol/default.conf`, `ibm.conf`, `ibm-strict.conf`, `lax.conf-inc`; `cobc --help`.
- Not retrievable here: https://gnucobol.sourceforge.io/further-information.html (proxy 403).
