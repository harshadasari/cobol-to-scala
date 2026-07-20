/**
 * file-io-gen.js
 * Convert COBOL file operations to Scala
 */

import { toCamelCase, toPascalCase } from './case-class-gen.js';

/**
 * Generate file variable name from COBOL file name
 */
function toFileVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'File';
}

/**
 * Generate reader variable name
 */
function toReaderVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'Reader';
}

/**
 * Generate writer variable name
 */
function toWriterVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'Writer';
}

/**
 * Generate iterator variable name
 */
function toIteratorVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'Iterator';
}

/**
 * Generate random-access-handle variable name (I-O/EXTEND-via-RandomAccessFile mode)
 */
function toRandomVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'Random';
}

/**
 * round-25 root cause 1: in-memory line-buffer variable name for an
 * I-O-mode-opened file - see generateOpen's I-O branch doc comment for why
 * REWRITE/DELETE need a mutable, position-tracked view over this generator's
 * existing "one text line per record" storage model instead of genuine
 * byte-random access.
 */
function toBufVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'Buf';
}

/**
 * round-25 root cause 1: read-position counter (0-based index of the NEXT
 * record to read out of the I-O-mode buffer above) - `posVar - 1` is always
 * "the record most recently READ," which is what REWRITE/DELETE act on.
 */
function toPosVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'Pos';
}

/**
 * round-26 root cause 1: "does a currently-valid record exist to REWRITE/
 * DELETE" flag - true immediately after a READ successfully establishes one
 * (generateReadStatement, expression-gen.js), false again the instant a
 * REWRITE or DELETE *consumes* it (generateRewriteStatement/
 * generateDeleteStatement) or on a failed/AT-END read. `posVar > 0` alone
 * (the round-25 guard) is necessary but not sufficient: DELETE already
 * decrements posVar on success, so a second immediate DELETE with no
 * intervening READ correctly re-fails that check on its own - but REWRITE
 * never touched posVar at all, so a second immediate REWRITE with no
 * intervening READ still satisfied `posVar > 0` and silently mutated the
 * buffer a second time (bb04 - a genuinely invalid REWRITE must never
 * mutate anything). This flag directly models the real COBOL rule ("a READ
 * must be the most recent I-O statement against this file for REWRITE/
 * DELETE to be valid - another REWRITE/DELETE doesn't count") instead of
 * relying on posVar's own, only-incidentally-correct-for-DELETE side effect.
 */
function toHasCurrentVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'HasCurrent';
}

/**
 * round-27 findings 3/4: "has this specific 1-based buffer slot ever
 * genuinely been WRITE/REWRITE-d into" flag array, parallel to `bufVar` (same
 * length, grown in lockstep by every auto-extend loop that grows `bufVar` -
 * see generateKeyedWriteStatement/generateKeyedRewriteStatement/
 * generateKeyedDeleteStatement, expression-gen.js). WRITE/REWRITE's own
 * "positive key always succeeds, auto-extend" rule (round-26 finding 2) fills
 * any skipped slot with a blank `""` placeholder line purely so `bufVar`
 * stays index-addressable - that placeholder is NOT a real record (cc01: a
 * READ of such a slot must report FILE STATUS "23", not attempt to decode the
 * placeholder's blank bytes as real field data and crash), and a WRITE must
 * never silently overwrite an ALREADY-occupied slot the way REWRITE
 * legitimately does (cc02: FILE STATUS "22", record untouched instead). Every
 * place that currently sets `bufVar(i) = <real rendered record text>` also
 * sets `occVar(i) = true` in the same statement; DELETE (round-27 finding 1)
 * sets it back to `false` instead of removing the slot (a real RELATIVE
 * file's records occupy FIXED positions - removing an array element would
 * shift every LATER record's own position, corrupting subsequent keyed
 * lookups).
 */
function toOccVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'Occ';
}

/**
 * round-38 finding 3 (nn07): "is this file CURRENTLY open" flag - true from
 * a successful OPEN until the next CLOSE (or until this program ends,
 * whichever comes first), false before the first OPEN and after any CLOSE.
 * Closes a gap this generator's file-handle model never tracked at all: a
 * READ issued after CLOSE used to reach straight for `iteratorVar` (already
 * closed along with its underlying `readerVar`/Source at CLOSE time), and
 * calling `.hasNext`/`.next()` on an iterator over an already-closed
 * `scala.io.Source` throws a raw, uncaught `java.io.IOException: Stream
 * Closed` - a hard runtime crash real cobc never has (cobc just sets FILE
 * STATUS "47" - "an I-O statement other than OPEN/CLOSE was attempted on a
 * file not currently open" - and keeps running). Checked by
 * generateReadStatement (expression-gen.js) before ever touching
 * `iteratorVar`; also used by generateOpen/generateClose themselves to
 * report OPEN-while-already-open ("41") and CLOSE-while-already-closed
 * ("42") without touching any java.io handle at all in either case
 * (matching cobc: neither condition changes the file's actual open/closed
 * state or has any other side effect).
 */
function toIsOpenVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'IsOpen';
}

/**
 * round-38 finding 3 (nn07): "did the MOST RECENT READ against this file
 * already report end-of-file" flag - distinguishes cobc's FIRST past-end
 * sequential READ (FILE STATUS "10") from a SECOND (or later) consecutive
 * past-end READ with no successful READ in between (FILE STATUS "46" - "a
 * READ was attempted past the point a prior READ had already reached
 * end-of-file"). Reset to `false` by any read that actually finds a record
 * (a later READ past a NEW end-of-file position - not applicable to this
 * generator's forward-only iterator model, but the reset is still correct
 * conceptually) and by a fresh OPEN (a reopened file has no "prior READ" of
 * its own yet).
 */
function toPastEndVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'PastEnd';
}

/**
 * round-27 finding 7: "did the most recent keyed START against this file
 * fail (INVALID KEY - no record satisfied its comparison)" flag - see
 * generateStartStatement/generateReadStatement's own doc comments
 * (expression-gen.js) for the full rationale. Compiler-verified against
 * installed GnuCOBOL: a plain sequential READ NEXT/PREVIOUS performed right
 * after a FAILED START on the same file fires NEITHER its AT END nor its NOT
 * AT END clause at all (though FILE STATUS is still updated, to "46") - a
 * genuinely surprising cobc runtime quirk, not a textbook rule. Cleared
 * (false) by a SUBSEQUENT SUCCESSFUL START on the same file (compiler-
 * verified: READ NEXT recovers its ordinary behavior immediately afterward);
 * false by default, so a program that never uses START at all (the
 * overwhelming majority of the corpus) is completely unaffected.
 */
function toStartInvalidVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'StartInvalid';
}

/**
 * round-32 finding 2 (hh02): a content-based fingerprint of exactly what
 * THIS logical file itself last persisted to its own physical path, taken
 * at CLOSE time (see generateClose) - compared, at this file's own NEXT
 * OPEN, against a matching fingerprint of the file's CURRENT on-disk
 * content (see pushBufferLoadLines). Round-30 finding 2 established that
 * `occVar` (the occupied-slot tracker) can be safely reused verbatim across
 * a close/reopen cycle rather than re-derived from ambiguous content alone -
 * but only WHEN NOTHING ELSE could have changed the file's bytes in
 * between. Round-31 finding 1 caught the case where a DIFFERENT logical
 * file sharing the same physical path changes the record COUNT out from
 * under this one (caught by comparing bufVar/occVar lengths) - but two
 * different logical files can rewrite the SAME physical path with a
 * DIFFERENT occupied-slot pattern that happens to leave the SAME record
 * count (hh02's own probe: FILE-A writes keys 1/2/3, all occupied; FILE-B
 * then truncates the same path and writes only keys 1 and 3, auto-extending
 * to the same 3-slot count but leaving key 2 a genuine gap) - a length
 * comparison alone cannot see this. Comparing this file's own last-CLOSE
 * content fingerprint against the file's CURRENT on-disk content closes
 * this gap directly: if they still agree, nothing besides this program's own
 * WRITE/REWRITE/DELETE (already kept in lockstep with occVar) could have
 * touched the file since - not a heuristic at all, ground truth, exactly
 * like round-30's own null-check reasoning; if they disagree (regardless of
 * whether the record COUNT happens to still match), some other actor
 * rewrote the file's actual bytes, so occVar must be rebuilt from the fresh
 * content instead, exactly as if this were a true first open. Only ever
 * meaningful for a file that reaches pushBufferLoadLines (RANDOM/DYNAMIC
 * access, or I-O) - a plain SEQUENTIAL-access file's `bufVar` is always null
 * and this fingerprint is simply never read for it.
 */
function toSigVarName(cobolFileName) {
  return toCamelCase(cobolFileName) + 'Sig';
}

/**
 * Extract file name from various formats
 */
function extractFileName(file) {
  if (!file) return 'file';
  if (typeof file === 'string') return file;
  if (file.name) return file.name;
  if (file.fileName) return file.fileName;
  if (file.value) return file.value;
  return 'file';
}

/**
 * Every handle a file's OPEN might assign, declared exactly ONCE per file at
 * object scope (see scala-generator.js's generateFileHandleDeclarations) as a
 * plain `var` initialized to a harmless empty/null default - not as a `val`
 * freshly declared inside generateOpen's own generated block. A program that
 * OPENs the same file more than once in its lifetime (e.g. OPEN OUTPUT ...
 * CLOSE ... OPEN INPUT ... - a completely ordinary sequential round-trip, see
 * tests/corpus/proc/s01-fileio-roundtrip.cbl) previously re-declared
 * `val <fileName>File = ...` (and, for two OPENs of the *same* mode, the
 * mode-specific reader/writer/iterator too) on the second OPEN, which Scala
 * rejects outright ("... is already defined as value ...") - round-5 finding
 * 1c. Assigning to a pre-declared `var` instead compiles regardless of how
 * many times, or in how many different modes, the same file is OPENed.
 */
export function fileHandleVarNames(fileName) {
  return {
    fileVar: toFileVarName(fileName),
    readerVar: toReaderVarName(fileName),
    writerVar: toWriterVarName(fileName),
    iteratorVar: toIteratorVarName(fileName),
    randomVar: toRandomVarName(fileName),
    bufVar: toBufVarName(fileName),
    posVar: toPosVarName(fileName),
    hasCurrentVar: toHasCurrentVarName(fileName),
    occVar: toOccVarName(fileName),
    startInvalidVar: toStartInvalidVarName(fileName),
    sigVar: toSigVarName(fileName),
    isOpenVar: toIsOpenVarName(fileName),
    pastEndVar: toPastEndVarName(fileName),
  };
}

/**
 * FD file names (upper) using the ADVANCING "deferred terminator" WRITE
 * model - round-6 finding 1. Mirrors expression-gen.js's own
 * ADVANCING_FILES/setAdvancingFiles exactly (see its doc comment there for
 * the full rationale); this module needs its own copy because generateClose
 * (below) has to know, independently of expression-gen.js, whether this
 * file's very last physical line was left unterminated by the deferred
 * model and needs one final newline flushed before the file handle closes.
 */
let ADVANCING_FILES = new Set();

export function setAdvancingFiles(fileNames) {
  ADVANCING_FILES = fileNames instanceof Set ? fileNames : new Set();
}

/**
 * round-34 finding 2 (jj03): FD file names (upper) whose `LINAGE IS <n>
 * LINES WITH FOOTING AT <m>` clause has a statically-known-invalid
 * combination - `m > n` (the footing area alone would be larger than the
 * whole page). Real cobc rejects this at OPEN time with a hard runtime
 * abort (`libcob: error: LINAGE values invalid (status = 57)`) and writes
 * ZERO records - the program never gets past OPEN. Both `linageLines` and
 * `linageFootingLines` are plain integer literals only (see
 * data-division-parser.js's own doc comment - a data-name-driven LINAGE/
 * FOOTING is never captured at all), so this is always statically
 * determinable at Scala-generation time; there is no runtime-only case to
 * handle here. A file with no entry (every LINAGE-less file, and every
 * LINAGE file whose FOOTING is absent or `<= ` its own page size) is
 * completely unaffected - this is a pure addition gated on this registry.
 */
let LINAGE_INVALID_FILES = new Set();

export function setLinageInvalidFiles(fileNames) {
  LINAGE_INVALID_FILES = fileNames instanceof Set ? fileNames : new Set();
}

function isLinageInvalid(fileName) {
  return LINAGE_INVALID_FILES.has(String(fileName || '').toUpperCase());
}

/**
 * FD file name (upper) -> its `FILE STATUS IS <field>` field's camelCase
 * flat-var name - round-6 finding 2/3's t04 companion gap. See
 * expression-gen.js's own identical copy (FILE_STATUS_REGISTRY) for the full
 * rationale; this module needs its own copy because OPEN/CLOSE (below) are
 * generated here, independently of expression-gen.js's READ/WRITE.
 */
let FILE_STATUS_REGISTRY = new Map();

export function setFileStatusRegistry(registry) {
  FILE_STATUS_REGISTRY = registry instanceof Map ? registry : new Map();
}

function fileStatusVarFor(fileName) {
  return FILE_STATUS_REGISTRY.get(String(fileName || '').toUpperCase()) || null;
}

/**
 * round-26 root cause 3: FD file name (upper) -> its `ACCESS MODE IS
 * <mode>` clause (upper - 'SEQUENTIAL'/'RANDOM'/'DYNAMIC'), defaulting to
 * 'SEQUENTIAL' (COBOL's own default when the clause is omitted entirely) for
 * a file this registry has no entry for. See expression-gen.js's identical
 * copy for the full rationale; this module needs its own copy because OPEN
 * (below) needs it to decide whether an INPUT/OUTPUT-mode open should build
 * the same random-access-capable in-memory buffer round-25's I-O branch
 * already does, independently of expression-gen.js's READ/WRITE/REWRITE/
 * START.
 */
let ACCESS_MODE_REGISTRY = new Map();

export function setAccessModeRegistry(registry) {
  ACCESS_MODE_REGISTRY = registry instanceof Map ? registry : new Map();
}

function accessModeFor(fileName) {
  return ACCESS_MODE_REGISTRY.get(String(fileName || '').toUpperCase()) || 'SEQUENTIAL';
}

/**
 * round-29 finding 5 (MOST SERIOUS - see tests/oracle/README.md's round-29
 * entry): FD file name (upper) -> its own FD record's total byte width,
 * populated ONLY for a FILE-CONTROL entry that declared `ORGANIZATION IS
 * RELATIVE` with a determinable record length (scala-generator.js's own
 * copy, built from layout.js's `itemByteLength` over the FD's own 01
 * record). Real COBOL RELATIVE (and INDEXED) files are FIXED-LENGTH BYTE
 * RECORD storage - unlike this generator's pre-existing storage model,
 * built entirely on `scala.io.Source...getLines()`/`PrintWriter.println`
 * (one text "line" per record, `\n`-delimited), which is exactly correct
 * for a genuine LINE SEQUENTIAL file but silently CORRUPTS/SPLITS any
 * RELATIVE-file record whose own bytes happen to contain a raw 0x0A byte
 * inside a binary-encoded field (COMP-1/COMP-2/COMP-3/BINARY, or a zoned/
 * packed field whose value happens to produce one) - an entirely ordinary,
 * valid occurrence for such a field's bytes, not an error condition, but
 * one a newline-delimited reader has no way to distinguish from a genuine
 * record boundary (verified against installed GnuCOBOL - ee06: a COMP-2
 * value of 3.25 encodes, host-native/little-endian, to bytes ending in
 * `00 00 00 00 00 00 0A 40` - the 7th byte IS 0x0A - `getLines()` split
 * that single 11-byte record's own bytes into two separate "lines",
 * corrupting every subsequent record's read position too).
 *
 * When a file's name has an entry here, OPEN/CLOSE (this module) and
 * WRITE/REWRITE/DELETE's own auto-extend gap-fill (expression-gen.js's own
 * identical copy of this registry) read/write it as RAW FIXED-WIDTH byte
 * chunks with NO delimiter between records, instead of getLines()/
 * println. A file with no entry here (every LINE SEQUENTIAL/plain-
 * SEQUENTIAL file - correctly newline-delimited COBOL text - and any
 * RELATIVE file whose own record byte width couldn't be determined) is
 * completely unaffected, keeping the pre-existing text-line model exactly
 * as before - this is a pure ADDITION gated on this registry, not a
 * rewrite of the existing code path.
 */
let RELATIVE_RECORD_LENGTH_REGISTRY = new Map();

export function setRelativeRecordLengthRegistry(registry) {
  RELATIVE_RECORD_LENGTH_REGISTRY = registry instanceof Map ? registry : new Map();
}

function relativeRecordLengthFor(fileName) {
  return RELATIVE_RECORD_LENGTH_REGISTRY.get(String(fileName || '').toUpperCase()) || null;
}

/**
 * round-29 finding 5: the fixed-width-chunk-buffer-building Scala expression
 * shared by every "load this RELATIVE file's on-disk content into an
 * in-memory buffer" call site below (`pushBufferLoadLines`'s buffer branch,
 * and OPEN INPUT's plain/non-random branch) - reads the WHOLE file as raw
 * bytes (ISO-8859-1: the same lossless 1:1 byte<->char identity mapping
 * this generator's text-line reading already used elsewhere), then slices
 * it into exactly `recordLength`-character chunks with NO delimiter
 * involved at all - a raw 0x0A byte inside a chunk is just an ordinary
 * character at that position, never mistaken for a boundary. A trailing
 * PARTIAL chunk (fewer than `recordLength` bytes left over - a truncated/
 * malformed file, or many real COBOL RELATIVE files that legitimately pad
 * their last block) is silently dropped via the integer-division record
 * count, rather than surfacing a short, corrupt "record".
 */
function fixedWidthLoadLines(bi, fileVarExpr, targetArrayExpr, recordLength, varPrefix) {
  const lines = [];
  // `varPrefix` (this file's own camelCase name) keeps these locals unique
  // per file - two RELATIVE files both OPENed with this fixed-width model
  // in the same enclosing Scala scope (e.g. two OPENs in the same method)
  // would otherwise emit colliding `val _relBytes = ...` declarations.
  const bytesVar = `_${varPrefix}RelBytes`;
  const textVar = `_${varPrefix}RelText`;
  const countVar = `_${varPrefix}RelCount`;
  lines.push(`${bi}val ${bytesVar} = java.nio.file.Files.readAllBytes(${fileVarExpr}.toPath)`);
  lines.push(`${bi}val ${textVar} = new String(${bytesVar}, java.nio.charset.StandardCharsets.ISO_8859_1)`);
  lines.push(`${bi}val ${countVar} = ${textVar}.length / ${recordLength}`);
  lines.push(
    `${bi}${targetArrayExpr} = scala.collection.mutable.ArrayBuffer.tabulate(${countVar})(` +
    `i => ${textVar}.substring(i * ${recordLength}, (i + 1) * ${recordLength}))`
  );
  return lines;
}

/**
 * round-27 finding 8: FD file name (upper) -> true when its FILE-CONTROL
 * entry declared `ORGANIZATION IS INDEXED` - see expression-gen.js's own
 * identical copy (isIndexedRandomAccess) for the full rationale. This module
 * needs its own copy because generateOpen (below) has to decide, ahead of
 * expression-gen.js's own READ/WRITE/etc., whether to build the keyed/bufVar
 * handle at all for such a file.
 */
let INDEXED_ORGANIZATION_FILES = new Set();

export function setIndexedOrganizationFiles(fileNames) {
  INDEXED_ORGANIZATION_FILES = fileNames instanceof Set ? fileNames : new Set();
}

/** See expression-gen.js's identical isIndexedRandomAccess for the full rationale. */
function isIndexedRandomAccess(fileName) {
  if (!INDEXED_ORGANIZATION_FILES.has(String(fileName || '').toUpperCase())) return false;
  const mode = accessModeFor(fileName);
  return mode === 'RANDOM' || mode === 'DYNAMIC';
}

/**
 * round-10 finding 1: DECLARATIVES `USE AFTER STANDARD ERROR PROCEDURE ON
 * <file-name|INPUT|OUTPUT|I-O|EXTEND>` handler methods, keyed two ways -
 * `DECL_FILE_HANDLERS` (file name, upper -> method name) for an `ON
 * <file-name>` target, `DECL_MODE_HANDLERS` (mode, upper -> method name) for
 * an `ON INPUT`/`ON OUTPUT`/`ON I-O`/`ON EXTEND` target (applies to every
 * file opened in that mode with no more specific per-file handler
 * registered). Built once per conversion by scala-generator.js alongside
 * every other registry (see setDeclarativeHandlers) - empty for every
 * program with no DECLARATIVES at all (every one of the 144 pre-existing
 * corpus programs), so this is a pure addition with zero effect on them.
 */
let DECL_FILE_HANDLERS = new Map();
let DECL_MODE_HANDLERS = new Map();

export function setDeclarativeHandlers(fileHandlers, modeHandlers) {
  DECL_FILE_HANDLERS = fileHandlers instanceof Map ? fileHandlers : new Map();
  DECL_MODE_HANDLERS = modeHandlers instanceof Map ? modeHandlers : new Map();
}

/** A file-specific handler always wins over a mode-generic one (matches how a more specific USE target reads in real COBOL). */
function declarativeHandlerFor(fileName, mode) {
  return (
    DECL_FILE_HANDLERS.get(String(fileName || '').toUpperCase()) ||
    DECL_MODE_HANDLERS.get(String(mode || '').toUpperCase()) ||
    null
  );
}

/**
 * Generate OPEN statement.
 *
 * round-10 finding 2: an OPEN failure (missing file for INPUT/I-O/EXTEND,
 * an unwritable path for OUTPUT/EXTEND, ...) used to surface as a raw,
 * uncaught Java exception (FileNotFoundException/IOException) - a hard
 * runtime crash with no FILE STATUS mapping at all, compiler-verified wrong
 * against installed GnuCOBOL (x02: cobc itself just sets FILE STATUS to
 * "35" and continues running the rest of the program). Every mode that
 * actually touches java.io (all but the `default`/unrecognized-mode
 * fallback, which never opens anything) is now wrapped in try/catch:
 *   - `java.io.FileNotFoundException` (by far the most common case - the
 *     file/path doesn't exist) -> FILE STATUS "35" for INPUT/I-O, but "30"
 *     for OUTPUT/EXTEND (round-15 finding 7 - see below).
 *   - any other `java.io.IOException` -> FILE STATUS "30" (cobc's generic
 *     "permanent error" code).
 * A registered DECLARATIVES `USE AFTER STANDARD ERROR PROCEDURE ON
 * <this-file>/<this-mode>` handler (round-10 finding 1, see
 * setDeclarativeHandlers/declarativeHandlerFor) is invoked right after the
 * status is set, exactly mirroring cobc's own "run the declarative, then
 * fall through to the statement after OPEN" behavior (x01). With NEITHER a
 * registered FILE STATUS field NOR a matching handler, the catch block is a
 * bare `()` - matching cobc's own default behavior of silently continuing
 * past a failed OPEN with no other visible effect (x02, when FILE STATUS is
 * absent - not exercised by any corpus program, since x02 always declares
 * one, but this keeps the fallback honest either way).
 *
 * round-15 finding 7: `java.io.FileNotFoundException` was mapped to FILE
 * STATUS "35" ("file not found") uniformly, regardless of OPEN mode - wrong
 * for OUTPUT (and by the same reasoning, EXTEND): "35" is specifically
 * documented (both in the COBOL standard and GnuCOBOL's own FILE STATUS
 * table) as "an OPEN statement with the INPUT or I-O phrase was attempted on
 * a nonexistent file" - it is meaningless for OUTPUT/EXTEND, which are
 * defined to CREATE the target file, not require it to already exist. A
 * `java.io.FileNotFoundException` from `new FileOutputStream(...)` under
 * OPEN OUTPUT/EXTEND therefore never means "the file wasn't found" (OUTPUT
 * doesn't care whether it already exists) - it means the file genuinely
 * could NOT be created (its parent directory doesn't exist, or a permission
 * error), which is exactly cobc's generic permanent-I/O-error code, "30".
 * Verified against installed GnuCOBOL (d10: `OPEN OUTPUT` against
 * `/no/such/dir/D10BADOUT.DAT`, a path whose PARENT directory doesn't exist,
 * reports FILE STATUS "30", not "35"). Distinguished by OPEN mode (not a
 * runtime parent-directory existence probe) - the mode alone already
 * determines which status is even meaningful per the FILE STATUS
 * specification above, so this needs no additional runtime check and can't
 * disagree with it. INPUT/I-O keep the pre-existing "35" mapping unchanged
 * (x01/x02, both OPEN INPUT, are unaffected).
 */
export function generateOpen(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const files = Array.isArray(statement.files) ? statement.files : [statement.file || statement];

  for (const file of files) {
    const fileName = extractFileName(file);
    const { fileVar, readerVar, writerVar, iteratorVar, randomVar, bufVar, posVar, hasCurrentVar, occVar, sigVar, isOpenVar, pastEndVar } = fileHandleVarNames(fileName);
    const mode = (statement.mode || file?.mode || 'INPUT').toUpperCase();
    const statusVar = fileStatusVarFor(fileName);
    const handlerMethod = declarativeHandlerFor(fileName, mode);

    // round-38 finding 3 (nn07): OPENing a file that is ALREADY open (no
    // intervening CLOSE) is a distinct FILE STATUS condition real cobc
    // reports as "41". `fileBodyStart` marks where this file's own ordinary
    // OPEN codegen begins in `lines`; once the whole switch/try/catch below
    // has finished emitting it (unchanged from the pre-round-38 logic), it
    // is spliced back out, re-indented one level, and wrapped in
    // `if !isOpenVar then ... else <41>` - see the bottom of this loop body.
    // So it has ZERO side effects on the file's already-open handles beyond
    // the status value itself, matching cobc (the file stays open with
    // whatever it already had - no handler is registered/invoked for this
    // condition either, since it isn't an OPEN *failure* the DECLARATIVES
    // USE AFTER ERROR PROCEDURE convention models, just a distinct
    // non-fatal status). A file that has never been opened yet (the
    // overwhelming common case, and every pre-round-38 corpus program) has
    // `isOpenVar` false, so this is a pure no-op addition for them.
    const fileBodyStart = lines.length;

    // round-34 finding 2 (jj03): a `LINAGE IS <n> LINES WITH FOOTING AT <m>`
    // clause where `m > n` is statically invalid (the footing area alone
    // would exceed the whole page) - real cobc raises a hard runtime abort
    // AT OPEN TIME (`libcob: error: LINAGE values invalid (status = 57)`)
    // and the program produces ZERO output records; it never gets past
    // OPEN. Checked and emitted here, BEFORE any handle is built for this
    // file (mirroring round-27 finding 8's own isIndexedRandomAccess decline
    // immediately below), so no WRITE for this file can ever run. A file
    // with no entry in LINAGE_INVALID_FILES (every LINAGE-less file, and
    // every LINAGE file whose FOOTING is absent or within its own page
    // size) is completely unaffected.
    if (isLinageInvalid(fileName)) {
      lines.push(
        `${indentStr}System.err.println("libcob: error: LINAGE values invalid (status = 57) for file ${fileName}")`
      );
      lines.push(`${indentStr}sys.exit(1)`);
      continue;
    }

    // round-27 finding 8: an ORGANIZATION IS INDEXED file opened in RANDOM/
    // DYNAMIC access mode is not implemented at all (see isIndexedRandomAccess's
    // own doc comment) - decline visibly here too, BEFORE building either the
    // keyed/bufVar handle below or a plain writer/reader, so this file's own
    // handles are left entirely null/untouched and every later READ/WRITE/
    // REWRITE/DELETE/START statement (expression-gen.js, gated on the SAME
    // isIndexedRandomAccess check) consistently declines too, instead of the
    // pre-fix mismatch (this OPEN silently built a keyed-only handle while
    // WRITE assumed a plain writer existed - a guaranteed NullPointerException,
    // cc04's own repro).
    if (isIndexedRandomAccess(fileName)) {
      lines.push(
        `${indentStr}() // TODO: OPEN ${mode} ${fileName}: ORGANIZATION IS INDEXED with RANDOM/DYNAMIC access ` +
        'is not supported (no INDEXED-file cobc oracle is available in this sandbox to verify a real ' +
        'implementation against - see tests/oracle/README.md known gaps); file handle left unusable'
      );
      continue;
    }

    // round-26 root cause 3: a RANDOM/DYNAMIC-access file needs the SAME
    // indexable in-memory buffer an I-O-mode open already builds (round-25
    // root cause 1) for EVERY open mode, not just I-O - READ/REWRITE/WRITE/
    // START addressed by an explicit RELATIVE KEY value (expression-gen.js)
    // need direct `bufVar(key - 1)` access regardless of whether the file
    // happens to be open for INPUT, OUTPUT, or I-O. A plain SEQUENTIAL-access
    // file (the pre-existing default, and every pre-round-26 corpus program)
    // is completely unaffected - it keeps the exact INPUT/OUTPUT codegen
    // below unchanged.
    const isRandomAccess = accessModeFor(fileName) === 'RANDOM' || accessModeFor(fileName) === 'DYNAMIC';

    const bi = `${indentStr}  `;
    const openLines = [];
    let canFail = true;

    // round-25 root cause 1 / round-26 root cause 3: load `fileVar`'s
    // current on-disk lines into `bufVar`, reset `posVar`/`hasCurrentVar`,
    // and adapt `iteratorVar` as a thin forward-only view over that SAME
    // buffer (so a plain sequential READ/READ NEXT still works unchanged
    // over a RANDOM/DYNAMIC-access file, exactly like it already does for
    // I-O). Shared by the I-O case (every access mode) and, new this round,
    // the INPUT/OUTPUT cases whenever access mode is RANDOM/DYNAMIC.
    function pushBufferLoadLines() {
      const recLen = relativeRecordLengthFor(fileName);
      openLines.push(`${bi}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
      if (recLen) {
        // round-29 finding 5: RELATIVE-organization file with a known FIXED
        // record byte width - read raw bytes and chunk by that exact width
        // instead of `getLines()` (see relativeRecordLengthFor's own doc
        // comment for why: a 0x0A byte inside a binary-encoded field's own
        // storage is an ordinary data byte here, never a record delimiter).
        openLines.push(...fixedWidthLoadLines(bi, fileVar, bufVar, recLen, toCamelCase(fileName)));
        // round-27 findings 3/4 (adapted for round-29's fixed-width model):
        // a slot reloaded from disk is "occupied" unless its own chunk is
        // EXACTLY the all-NUL (0x00) gap-fill placeholder WRITE/REWRITE/
        // DELETE's own auto-extend logic now uses for a never-actually-
        // written gap slot (see expression-gen.js's identical
        // relativeRecordLengthFor/gap-fill literal, all-NUL bytes)
        // instead of the plain `""` the pre-fixed-width model used - every
        // real chunk here is always exactly `recLen` characters wide, so an
        // empty string can no longer occur at all once loaded through
        // fixedWidthLoadLines.
        //
        // round-30 finding 2 (ff13): this content-based heuristic is
        // FUNDAMENTALLY ambiguous for a genuinely-written all-zero-byte
        // record (e.g. a COMP-1 field holding 0.0F encodes to 4 zero bytes) -
        // indistinguishable, from content alone, from a slot that was never
        // written at all. Rebuilding `occVar` from disk content EVERY time
        // this file is opened discards a perfectly accurate answer this
        // SAME running program may already have in memory from an EARLIER
        // open/close cycle in this same run (occVar is never nulled by
        // CLOSE - only bufVar is, see generateClose) - only rebuild from
        // content when `occVar` is genuinely null (this file's occupied-slot
        // state has never been established in this run before: its very
        // first OPEN, whether that is OPEN OUTPUT of a brand new file or
        // OPEN INPUT/I-O of a file this program did not itself just create).
        // Once occVar exists, a later close+reopen of the SAME file within
        // the SAME run cannot have had its on-disk bytes changed by anything
        // other than this program's own WRITE/REWRITE/DELETE - all of which
        // already keep occVar exactly in sync - so reusing it verbatim is
        // not a heuristic at all, it is the literal ground truth, sidestepping
        // the content-based ambiguity entirely rather than guessing around
        // it. (A file genuinely modified between runs by some OTHER process
        // this generated Scala program never itself launched is out of
        // scope - no corpus program does this, and this single-process
        // simulation model has no concept of "another run" to begin with.)
        // round-31 finding 1 (gg01): round-30's own reasoning above ("nothing
        // else could have changed the file's bytes in between") silently
        // assumed this file's own occVar is the ONLY actor touching its
        // physical path - but this engine builds a SEPARATE bufVar/occVar
        // per logical file NAME (per SELECT/FD), while cobc allows two
        // DIFFERENT logical files (two different SELECT/FD entries) to be
        // ASSIGNed to the SAME physical path. If a DIFFERENT logical file
        // (gg01's FILE-B) opens OUTPUT and rewrites that shared path with
        // different content/size while THIS logical file (FILE-A) is
        // closed, FILE-A's own persisted occVar is stale the moment it
        // reopens - it reflects a shape some other actor already
        // overwrote, not the file's genuine current shape - so trusting it
        // unconditionally (round-30's `== null` check alone) can index it
        // out of bounds against the freshly-reloaded bufVar (correctly
        // sized to the NEW on-disk content) or silently misreport
        // occupied/gap slots that no longer correspond to anything real.
        // The freshly-reloaded bufVar's own record count is always
        // trustworthy (it comes straight off disk, right above) - comparing
        // it against the persisted occVar's own length is exactly the
        // signal that tells "this is genuinely the same file this occVar
        // was tracking" (lengths match - keep round-30's reuse, the common
        // case) apart from "some other actor changed this file's physical
        // shape since we last saw it" (lengths differ - occVar can no
        // longer be trusted at all, so rebuild from content exactly as if
        // this were a true first open).
        //
        // round-32 finding 2 (hh02): the length comparison above only
        // catches a change in record COUNT - it cannot see two different
        // logical files sharing a physical path where the REWRITING file
        // happens to leave the SAME record count but a genuinely DIFFERENT
        // occupied-slot pattern (see toSigVarName's own doc comment).
        // `_${toCamelCase(fileName)}FreshSig` is a content fingerprint of
        // the file's CURRENT on-disk bytes (the exact same `.mkString`
        // convention generateClose uses to compute `${sigVar}` when this
        // logical file itself last wrote this content) - comparing it
        // against `${sigVar}` (what THIS file left behind at its own last
        // CLOSE) catches a content change regardless of whether the record
        // count happens to still agree.
        openLines.push(`${bi}val _${toCamelCase(fileName)}FreshSig = ${bufVar}.mkString`);
        openLines.push(`${bi}if ${occVar} == null || ${occVar}.length != ${bufVar}.length || ${sigVar} != _${toCamelCase(fileName)}FreshSig then`);
        openLines.push(`${bi}  ${occVar} = scala.collection.mutable.ArrayBuffer.from(${bufVar}.map(_ != "\\u0000" * ${recLen}))`);
      } else {
        const srcVar = `_${toCamelCase(fileName)}Src`;
        openLines.push(`${bi}val ${srcVar} = scala.io.Source.fromFile(${fileVar})(scala.io.Codec.ISO8859)`);
        openLines.push(`${bi}${bufVar} = scala.collection.mutable.ArrayBuffer.from(${srcVar}.getLines())`);
        // round-27 findings 3/4: a slot reloaded from disk is "occupied" unless
        // its own on-disk line is the exact empty string - the literal filler
        // WRITE/REWRITE's own auto-extend loop uses for a never-actually-written
        // gap slot (see toOccVarName's own doc comment) - so a gap a program
        // creates, closes, and reopens (cc01's own shape) still reads back as a
        // gap, not as a legitimate (blank) record.
        //
        // round-30 finding 2: same reload-preservation fix as the recLen
        // branch just above - only rebuild from content when occVar is
        // genuinely null (this file's first open in this run); a later
        // reopen keeps the already-accurate in-memory answer instead of
        // re-deriving an ambiguous one from a genuinely-blank record's bytes.
        //
        // round-31 finding 1: same cross-logical-file staleness guard as the
        // recLen branch above, for consistency - a stale occVar whose OWN
        // length no longer matches the freshly-reloaded bufVar (a different
        // logical file sharing this physical path rewrote it while this one
        // was closed) is rebuilt from content instead of trusted verbatim.
        //
        // round-32 finding 2: same content-fingerprint companion as the
        // recLen branch above - a same-length, different-content rewrite by
        // another logical file sharing this physical path is caught even
        // when the record count happens to coincide.
        openLines.push(`${bi}val _${toCamelCase(fileName)}FreshSig = ${bufVar}.mkString("\\n")`);
        openLines.push(`${bi}if ${occVar} == null || ${occVar}.length != ${bufVar}.length || ${sigVar} != _${toCamelCase(fileName)}FreshSig then`);
        openLines.push(`${bi}  ${occVar} = scala.collection.mutable.ArrayBuffer.from(${bufVar}.map(_.nonEmpty))`);
        openLines.push(`${bi}${srcVar}.close()`);
      }
      openLines.push(`${bi}${posVar} = 0`);
      openLines.push(`${bi}${hasCurrentVar} = false`);
      openLines.push(`${bi}${iteratorVar} = new Iterator[String] {`);
      openLines.push(`${bi}  def hasNext: Boolean = ${posVar} < ${bufVar}.length`);
      openLines.push(`${bi}  def next(): String = { val _v = ${bufVar}(${posVar}); ${posVar} += 1; _v }`);
      openLines.push(`${bi}}`);
    }

    switch (mode) {
      case 'INPUT':
        if (isRandomAccess) {
          // round-26 root cause 3: OPEN INPUT of a RANDOM/DYNAMIC-access
          // file (e.g. bb09's `ACCESS MODE IS DYNAMIC` + `START`/`READ
          // NEXT`, bb10's `ACCESS MODE IS RANDOM` + keyed `READ`) needs the
          // SAME indexable buffer as I-O, not just a forward-only iterator -
          // see pushBufferLoadLines's own doc comment.
          pushBufferLoadLines();
          break;
        }
        openLines.push(`${bi}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        // round-29 finding 5: a plain SEQUENTIAL-access RELATIVE file with a
        // known FIXED record byte width reads raw fixed-width byte chunks
        // instead of `getLines()` too - see relativeRecordLengthFor's own
        // doc comment (a 0x0A byte inside a binary-encoded field is just an
        // ordinary data byte, never a record delimiter, for such a file).
        // `iteratorVar` stays an opaque `Iterator[String]` either way, so no
        // READ codegen anywhere needs to know or care which branch built it.
        {
          const recLen = relativeRecordLengthFor(fileName);
          if (recLen) {
            openLines.push(...fixedWidthLoadLines(bi, fileVar, `val ${toCamelCase(fileName)}Chunks`, recLen, toCamelCase(fileName)));
            openLines.push(`${bi}${iteratorVar} = ${toCamelCase(fileName)}Chunks.iterator`);
          } else {
            // round-10 finding 3 companion: ISO-8859-1 is a lossless 1:1
            // byte<->char identity mapping (unlike the JVM's UTF-8-by-default
            // charset, which rejects/mangles arbitrary non-ASCII byte values) -
            // required so a record containing packed/binary bytes round-trips
            // through this text-line reader exactly, and a no-op for every
            // plain-ASCII (DISPLAY-only) record already in the corpus.
            openLines.push(`${bi}${readerVar} = scala.io.Source.fromFile(${fileVar})(scala.io.Codec.ISO8859)`);
            openLines.push(`${bi}${iteratorVar} = ${readerVar}.getLines()`);
          }
        }
        break;

      case 'OUTPUT':
        if (isRandomAccess) {
          // round-26 root cause 3: OPEN OUTPUT of a RANDOM/DYNAMIC-access
          // file always starts a brand-new, empty file (matches plain
          // OUTPUT semantics for any organization) - no existing content to
          // load, so the buffer starts empty rather than reading from disk.
          // WRITE (expression-gen.js's generateWriteStatement) then indexes
          // into this SAME buffer by the file's current RELATIVE KEY value
          // instead of blindly appending through a PrintWriter, matching
          // real cobc's own boundary-checked WRITE for RANDOM/DYNAMIC access
          // (verified against installed GnuCOBOL: a WRITE with an invalid -
          // non-positive - RELATIVE KEY reports FILE STATUS 24 and does NOT
          // persist the record, rather than always succeeding the way a
          // SEQUENTIAL-access WRITE does).
          openLines.push(`${bi}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
          openLines.push(`${bi}${bufVar} = new scala.collection.mutable.ArrayBuffer[String]()`);
          // round-27 findings 3/4: fresh empty buffer -> fresh empty occupied-
          // slot tracker, grown in lockstep by every WRITE/REWRITE/DELETE from
          // here on (see toOccVarName's own doc comment).
          openLines.push(`${bi}${occVar} = new scala.collection.mutable.ArrayBuffer[Boolean]()`);
          openLines.push(`${bi}${posVar} = 0`);
          openLines.push(`${bi}${hasCurrentVar} = false`);
          break;
        }
        openLines.push(`${bi}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        openLines.push(
          `${bi}${writerVar} = new java.io.PrintWriter(new java.io.OutputStreamWriter(` +
          `new java.io.FileOutputStream(${fileVar}), java.nio.charset.StandardCharsets.ISO_8859_1))`
        );
        break;

      case 'I-O':
      case 'IO': {
        // round-25 root cause 1: this branch used to ONLY create randomVar
        // (a java.io.RandomAccessFile never actually read from anywhere
        // else in this generator - dead weight - whose "rw" open mode also
        // has the further side effect of silently CREATING a missing file
        // rather than failing with FILE STATUS 35 the way OPEN INPUT/I-O
        // both must) and never touched iteratorVar at all - so any READ
        // after OPEN I-O saw iteratorVar stuck at its Iterator.empty
        // default (generateFileHandleDeclarations) and always reported
        // FILE STATUS 10/no-record, no matter what was actually on disk.
        // REWRITE/DELETE need a MUTABLE, position-tracked view over the
        // exact same "one text line per record" storage model READ/WRITE
        // already use (this generator's only modeled file organization,
        // never genuine byte-random access), so the whole file's lines are
        // loaded into an in-memory buffer up front (the same ISO-8859-1
        // identity-mapped reading the INPUT case above uses); iteratorVar
        // becomes a thin adapter over that buffer plus a position counter
        // (posVar) instead of Source's own forward-only iterator, so
        // REWRITE/DELETE (generateRewriteStatement/generateDeleteStatement,
        // expression-gen.js) can find "the record just READ" (posVar - 1)
        // and mutate the SAME buffer generateClose (below) flushes back to
        // disk on CLOSE - durably persisting the change for a later OPEN
        // INPUT/I-O of the same file, matching cobc's own REWRITE/DELETE
        // semantics for a SEQUENTIAL-access RELATIVE/INDEXED file.
        pushBufferLoadLines();
        break;
      }

      case 'EXTEND':
        openLines.push(`${bi}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        openLines.push(
          `${bi}${writerVar} = new java.io.PrintWriter(new java.io.OutputStreamWriter(` +
          `new java.io.FileOutputStream(${fileVar}, true), java.nio.charset.StandardCharsets.ISO_8859_1))`
        );
        break;

      default:
        canFail = false;
        break;
    }

    // round-38 finding 3 (nn07): splice this file's own OPEN codegen (from
    // `fileBodyStart` to wherever it currently ends) back out of `lines`,
    // re-indent it one level, and wrap it in `if !isOpenVar then <body> else
    // <41>` - see fileBodyStart's own doc comment above. Called from both
    // remaining exit points below (the unrecognized-mode `continue` and the
    // normal try/catch path, which falls through to this loop's natural
    // end) since both need the exact same wrapping.
    function wrapFileBodyWithOpenGuard() {
      const bodyLines = lines.splice(fileBodyStart, lines.length - fileBodyStart);
      const reindented = bodyLines.map(l => `  ${l}`);
      lines.push(`${indentStr}if ${isOpenVar} then`);
      lines.push(`${indentStr}  ${statusVar ? `${statusVar} = "41"` : '()'}`);
      lines.push(`${indentStr}else`);
      lines.push(...reindented);
    }

    if (!canFail) {
      // Unrecognized mode: never touches java.io at all, so nothing can
      // throw - no try/catch needed, just the plain comment (and, as
      // before, a "00" FILE STATUS if one happens to be registered).
      lines.push(`${indentStr}// OPEN ${mode} ${fileName}`);
      if (statusVar) {
        lines.push(`${indentStr}${statusVar} = "00"`);
      }
      // round-38 finding 3: this generator's own open/closed bookkeeping is
      // independent of whether the program even declared a FILE STATUS
      // field - always updated, regardless.
      lines.push(`${indentStr}${isOpenVar} = true`);
      lines.push(`${indentStr}${pastEndVar} = false`);
      wrapFileBodyWithOpenGuard();
      continue;
    }

    // round-6 finding 2/3 companion: a registered FILE STATUS field goes to
    // "00" on a successful open.
    if (statusVar) {
      openLines.push(`${bi}${statusVar} = "00"`);
    }
    // round-38 finding 3: see the !canFail branch's identical comment above -
    // only reached on a SUCCESSFUL open (inside the try, before any
    // exception could be thrown by the mode-specific lines above it).
    openLines.push(`${bi}${isOpenVar} = true`);
    openLines.push(`${bi}${pastEndVar} = false`);

    lines.push(`${indentStr}try`);
    lines.push(...openLines);
    lines.push(`${indentStr}catch`);

    const bi2 = `${bi}  `;
    function catchBody(code) {
      const body = [];
      if (statusVar) body.push(`${bi2}${statusVar} = "${code}"`);
      if (handlerMethod) body.push(`${bi2}${handlerMethod}()`);
      if (body.length === 0) body.push(`${bi2}()`);
      return body;
    }

    // round-15 finding 7: OUTPUT/EXTEND creates the file, so a
    // FileNotFoundException under those modes means "couldn't create it"
    // (permanent error, "30"), never "file not found" ("35" - only
    // meaningful when the mode requires the file to already exist).
    const fileNotFoundStatus = (mode === 'OUTPUT' || mode === 'EXTEND') ? '30' : '35';
    lines.push(`${bi}case _: java.io.FileNotFoundException =>`);
    lines.push(...catchBody(fileNotFoundStatus));
    lines.push(`${bi}case _: java.io.IOException =>`);
    lines.push(...catchBody('30'));

    wrapFileBodyWithOpenGuard();
  }

  return lines.join('\n');
}

/**
 * Generate CLOSE statement
 */
export function generateClose(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const files = Array.isArray(statement.files) ? statement.files : [statement.file];

  for (const file of files) {
    const fileName = extractFileName(file);
    const { fileVar, readerVar, writerVar, randomVar, bufVar, sigVar, isOpenVar } = fileHandleVarNames(fileName);
    // round-38 finding 3 (nn07): a second CLOSE of an already-closed file
    // (no intervening OPEN) is a distinct FILE STATUS condition real cobc
    // reports as "42" - see generateOpen's identical `fileBodyStart`/
    // `wrapFileBodyWithOpenGuard` convention for "41" (OPEN of an
    // already-open file); this is its CLOSE-side mirror image. This file's
    // own ordinary CLOSE codegen (unchanged from the pre-round-38 logic) is
    // spliced back out, re-indented one level, and wrapped in
    // `if isOpenVar then ... else <42>` at the bottom of this loop body -
    // so re-closing an already-closed file has ZERO side effects (no
    // handle is touched - they are all already null/closed) beyond the
    // status value itself.
    const closeBodyStart = lines.length;

    // Round-6 finding 1: a file using the ADVANCING deferred-terminator
    // WRITE model (see expression-gen.js's generateWriteStatement) leaves
    // its last physical line unterminated - flush the final newline here,
    // before the writer actually closes. A file that never uses ADVANCING
    // is untouched (ADVANCING_FILES empty/absent for it), so this is a
    // pure addition with zero effect on any pre-round-6 program.
    if (ADVANCING_FILES.has(String(fileName || '').toUpperCase())) {
      lines.push(`${indentStr}if ${writerVar} != null then { try ${writerVar}.print("\\n") catch case _: Exception => () }`);
    }

    // round-25 root cause 1: an I-O-mode OPEN loads this file's records into
    // an in-memory buffer instead of writing straight through (see
    // generateOpen's I-O branch) - REWRITE/DELETE mutate that buffer in
    // place, so it must be flushed back to disk (overwriting the file with
    // its own current, possibly-mutated contents) here for those changes to
    // actually persist for a later OPEN of the same file. A file never
    // opened I-O in this run leaves bufVar at its null default
    // (generateFileHandleDeclarations), so this is a harmless no-op for
    // every pre-existing (non-I-O) corpus program.
    //
    // round-29 finding 5: for a RELATIVE-organization file with a known
    // FIXED record byte width, flush the buffer back out as RAW
    // concatenated bytes with NO delimiter between records at all (each
    // entry is already exactly `recLen` characters wide - see
    // fixedWidthLoadLines/the auto-extend gap-fill literal) instead of
    // `bufVar.foreach(_w.println)` - the pre-fix model appended a `\n`
    // after EVERY record, which a 0x0A byte inside a binary-encoded
    // field's own value is indistinguishable from on the next OPEN/READ.
    // Every other file (no entry in relativeRecordLengthFor) keeps the
    // exact pre-existing newline-per-record flush unchanged.
    {
      const recLen = relativeRecordLengthFor(fileName);
      if (recLen) {
        // round-32 finding 2: capture this file's own content fingerprint
        // (see toSigVarName's own doc comment) from the EXACT bufVar
        // content just flushed to disk, before it is nulled - the same
        // `.mkString` convention pushBufferLoadLines's own fresh-content
        // fingerprint uses on the next OPEN.
        lines.push(
          `${indentStr}if ${bufVar} != null then { val _fos = new java.io.FileOutputStream(${fileVar}); ` +
          `try ${bufVar}.foreach(r => _fos.write(r.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1))) ` +
          `finally _fos.close(); ${sigVar} = ${bufVar}.mkString; ${bufVar} = null }`
        );
      } else {
        lines.push(
          `${indentStr}if ${bufVar} != null then { val _w = new java.io.PrintWriter(new java.io.OutputStreamWriter(` +
          `new java.io.FileOutputStream(${fileVar}), java.nio.charset.StandardCharsets.ISO_8859_1)); ` +
          `try ${bufVar}.foreach(_w.println) finally _w.close(); ${sigVar} = ${bufVar}.mkString("\\n"); ${bufVar} = null }`
        );
      }
    }

    // Only whichever handle OPEN actually assigned for this file is
    // non-null; guard each close so CLOSE-ing a file that was never opened
    // in this mode (or already closed) is a harmless no-op instead of a
    // NullPointerException.
    lines.push(`${indentStr}if ${readerVar} != null then { try ${readerVar}.close() catch case _: Exception => (); ${readerVar} = null }`);
    lines.push(`${indentStr}if ${writerVar} != null then { try ${writerVar}.close() catch case _: Exception => (); ${writerVar} = null }`);
    lines.push(`${indentStr}if ${randomVar} != null then { try ${randomVar}.close() catch case _: Exception => (); ${randomVar} = null }`);

    // round-6 finding 2/3 companion: CLOSE failures aren't modeled either -
    // a registered FILE STATUS field always goes to "00" here.
    const statusVar = fileStatusVarFor(fileName);
    if (statusVar) {
      lines.push(`${indentStr}${statusVar} = "00"`);
    }
    // round-38 finding 3: a successful CLOSE marks this file as no longer
    // open (only reached below this loop's own already-closed guard, so
    // this is a real close, not a repeat one).
    lines.push(`${indentStr}${isOpenVar} = false`);

    // Splice this file's own ordinary CLOSE codegen back out, re-indent it
    // one level, and wrap it in `if isOpenVar then ... else <42>` - mirrors
    // generateOpen's identical wrapFileBodyWithOpenGuard convention above.
    {
      const bodyLines = lines.splice(closeBodyStart, lines.length - closeBodyStart);
      const reindented = bodyLines.map(l => `  ${l}`);
      lines.push(`${indentStr}if ${isOpenVar} then`);
      lines.push(...reindented);
      lines.push(`${indentStr}else`);
      lines.push(`${indentStr}  ${statusVar ? `${statusVar} = "42"` : '()'}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate the once-per-file top-level `var` declarations every OPEN/CLOSE
 * this generator emits assumes are already in scope (see fileHandleVarNames'
 * doc comment above) - one block per distinct FD/SELECT file name found in
 * the ENVIRONMENT DIVISION's FILE-CONTROL. `null` defaults are safe because
 * every generated OPEN unconditionally assigns before any generated READ/
 * WRITE/CLOSE dereferences the same variable in a correct program (a READ/
 * WRITE before OPEN is invalid COBOL to begin with).
 */
export function generateFileHandleDeclarations(fileNames, indent = 1, linageRegistry = null) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  for (const fileName of fileNames) {
    const { fileVar, readerVar, writerVar, iteratorVar, randomVar, bufVar, posVar, hasCurrentVar, occVar, startInvalidVar, sigVar, isOpenVar, pastEndVar } = fileHandleVarNames(fileName);
    lines.push(`${indentStr}var ${fileVar}: java.io.File = null`);
    lines.push(`${indentStr}var ${readerVar}: scala.io.BufferedSource = null`);
    lines.push(`${indentStr}var ${writerVar}: java.io.PrintWriter = null`);
    lines.push(`${indentStr}var ${iteratorVar}: Iterator[String] = Iterator.empty`);
    lines.push(`${indentStr}var ${randomVar}: java.io.RandomAccessFile = null`);
    // round-38 finding 3: see toIsOpenVarName/toPastEndVarName's own doc
    // comments above.
    lines.push(`${indentStr}var ${isOpenVar}: Boolean = false`);
    lines.push(`${indentStr}var ${pastEndVar}: Boolean = false`);
    // round-25 root cause 1: OPEN I-O's in-memory line buffer + read-position
    // counter (see generateOpen's I-O branch and generateRewriteStatement/
    // generateDeleteStatement in expression-gen.js) - null/0 defaults are a
    // pure addition with zero effect on any file never opened I-O.
    lines.push(`${indentStr}var ${bufVar}: scala.collection.mutable.ArrayBuffer[String] = null`);
    lines.push(`${indentStr}var ${posVar}: Int = 0`);
    // round-26 root cause 1: see toHasCurrentVarName's own doc comment above.
    lines.push(`${indentStr}var ${hasCurrentVar}: Boolean = false`);
    // round-27 findings 3/4: see toOccVarName's own doc comment above.
    lines.push(`${indentStr}var ${occVar}: scala.collection.mutable.ArrayBuffer[Boolean] = null`);
    // round-27 finding 7: see toStartInvalidVarName's own doc comment above.
    lines.push(`${indentStr}var ${startInvalidVar}: Boolean = false`);
    // round-32 finding 2: see toSigVarName's own doc comment above.
    lines.push(`${indentStr}var ${sigVar}: String = null`);
    // round-32 finding 1 (hh01): per-file LINAGE line counter - only
    // declared for a file whose FD actually carries a `LINAGE IS <n> LINES`
    // clause (see expression-gen.js's toLinageCounterVarName/generateWriteStatement) -
    // a pure addition, absent (and zero cost) for every file with no LINAGE
    // clause at all.
    if (linageRegistry instanceof Map && linageRegistry.has(String(fileName || '').toUpperCase())) {
      lines.push(`${indentStr}var ${toCamelCase(fileName)}LinageCtr: Int = 0`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate READ statement
 */
export function generateRead(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const fileName = statement.file;
  const iteratorVar = toIteratorVarName(fileName);
  const recordType = statement.into ? toPascalCase(statement.into) : null;
  const intoVar = statement.into ? toCamelCase(statement.into) : '_record';

  // Generate read with AT END handling
  if (statement.atEnd || statement.notAtEnd) {
    lines.push(`${indentStr}if ${iteratorVar}.hasNext then`);

    if (recordType) {
      lines.push(`${indentStr}  val _line = ${iteratorVar}.next()`);
      lines.push(`${indentStr}  val ${intoVar} = ${recordType}.parse(_line.getBytes)`);
    } else {
      lines.push(`${indentStr}  val ${intoVar} = ${iteratorVar}.next()`);
    }

    if (statement.notAtEnd) {
      for (const stmt of statement.notAtEnd) {
        lines.push(`${indentStr}  // NOT AT END processing`);
      }
    }

    lines.push(`${indentStr}else`);

    if (statement.atEnd) {
      for (const stmt of statement.atEnd) {
        lines.push(`${indentStr}  // AT END processing`);
      }
    } else {
      lines.push(`${indentStr}  // End of file reached`);
    }
  } else {
    // Simple read without AT END
    if (recordType) {
      lines.push(`${indentStr}val _line = ${iteratorVar}.nextOption()`);
      lines.push(`${indentStr}val ${intoVar} = _line.map(l => ${recordType}.parse(l.getBytes))`);
    } else {
      lines.push(`${indentStr}val ${intoVar} = ${iteratorVar}.nextOption()`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate WRITE statement.
 *
 * DEAD CODE (round-6 finding 1): the live WRITE dispatch (expression-gen.js's
 * generateExpression, case 'WRITE') always calls that module's own
 * generateWriteStatement instead - this function (and generateFileIO's
 * 'WRITE' case below, and generateFileIOWithResource) are never invoked from
 * the real conversion path (confirmed: no import of generateFileIO/
 * generateWrite from scala-generator.js's WRITE handling, no test exercises
 * this function directly). Its own ADVANCING handling below is ALSO stale
 * relative to the real, compiler-verified GnuCOBOL model (a deferred-
 * terminator/carriage-control model - n newlines emitted BEFORE the record
 * for `n LINES`, not "N blank println() calls"; see expression-gen.js's
 * generateWriteStatement doc comment for the verified semantics). Left as-is
 * rather than deleted (out of scope for this fix - the live path is what
 * matters) or "fixed" in place (which would misrepresent live/dead status by
 * making dead code look current); do not treat this function's presence as
 * evidence that ADVANCING is handled here.
 */
export function generateWrite(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const fileName = statement.file;
  const writerVar = toWriterVarName(fileName);
  const recordType = statement.from ? toPascalCase(statement.from) : null;
  const fromVar = statement.from ? toCamelCase(statement.from) : null;

  if (recordType && fromVar) {
    lines.push(`${indentStr}val _bytes = ${recordType}.format(${fromVar})`);
    lines.push(`${indentStr}${writerVar}.println(new String(_bytes))`);
  } else if (statement.record) {
    const recordVar = toCamelCase(statement.record);
    lines.push(`${indentStr}${writerVar}.println(${recordVar})`);
  } else {
    lines.push(`${indentStr}${writerVar}.println("")`);
  }

  // Handle ADVANCING
  if (statement.advancing) {
    if (statement.advancing.type === 'PAGE') {
      lines.push(`${indentStr}${writerVar}.println("\\f") // Page break`);
    } else if (statement.advancing.lines) {
      lines.push(`${indentStr}(1 to ${statement.advancing.lines}).foreach(_ => ${writerVar}.println())`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate REWRITE statement
 */
export function generateRewrite(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const fileName = statement.file;
  const fileVar = toFileVarName(fileName);
  const recordType = statement.from ? toPascalCase(statement.from) : null;
  const fromVar = statement.from ? toCamelCase(statement.from) : null;

  lines.push(`${indentStr}// REWRITE - requires random access file`);

  if (recordType && fromVar) {
    lines.push(`${indentStr}val _bytes = ${recordType}.format(${fromVar})`);
    lines.push(`${indentStr}${fileVar}.write(_bytes)`);
  } else if (statement.record) {
    const recordVar = toCamelCase(statement.record);
    lines.push(`${indentStr}${fileVar}.writeBytes(${recordVar}.toString)`);
  }

  return lines.join('\n');
}

/**
 * Generate DELETE statement (for indexed/relative files)
 */
export function generateDelete(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = statement.file;

  return `${indentStr}// DELETE record from ${fileName} - requires indexed file implementation`;
}

/**
 * Generate START statement (for indexed files)
 */
export function generateStart(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = statement.file;
  const key = statement.key ? toCamelCase(statement.key) : 'key';

  return `${indentStr}// START ${fileName} positioned at ${key} - requires indexed file implementation`;
}

/**
 * Generate file I/O with Using.resource pattern
 */
export function generateFileIOWithResource(fileOperations, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  // Group operations by file
  const fileOps = new Map();

  for (const op of fileOperations) {
    const fileName = op.file;
    if (!fileOps.has(fileName)) {
      fileOps.set(fileName, []);
    }
    fileOps.get(fileName).push(op);
  }

  for (const [fileName, ops] of fileOps) {
    const openOp = ops.find(o => o.type === 'OPEN');
    const mode = openOp?.mode?.toUpperCase() || 'INPUT';

    if (mode === 'INPUT') {
      lines.push(`${indentStr}scala.util.Using.resource(scala.io.Source.fromFile(${toCamelCase(fileName)}Path)) { source =>`);
      lines.push(`${indentStr}  val lines = source.getLines()`);

      for (const op of ops) {
        if (op.type !== 'OPEN' && op.type !== 'CLOSE') {
          lines.push(generateFileIO(op, indent + 1));
        }
      }

      lines.push(`${indentStr}}`);
    } else if (mode === 'OUTPUT') {
      lines.push(`${indentStr}scala.util.Using.resource(new java.io.PrintWriter(${toCamelCase(fileName)}Path)) { writer =>`);

      for (const op of ops) {
        if (op.type !== 'OPEN' && op.type !== 'CLOSE') {
          lines.push(generateFileIO(op, indent + 1));
        }
      }

      lines.push(`${indentStr}}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate FILE STATUS handling with Either pattern
 */
export function generateFileStatusCheck(statement, fileStatusVar, indent = 0) {
  const indentStr = '  '.repeat(indent);

  return `${indentStr}${fileStatusVar} match
${indentStr}  case "00" => Right(()) // Success
${indentStr}  case "10" => Left("End of file")
${indentStr}  case "22" => Left("Duplicate key")
${indentStr}  case "23" => Left("Record not found")
${indentStr}  case "30" => Left("Permanent error")
${indentStr}  case "35" => Left("File not found")
${indentStr}  case "39" => Left("File attribute conflict")
${indentStr}  case "41" => Left("File already open")
${indentStr}  case "42" => Left("File not open")
${indentStr}  case "43" => Left("DELETE without prior READ")
${indentStr}  case "44" => Left("REWRITE without prior READ")
${indentStr}  case "46" => Left("READ after end of file")
${indentStr}  case "47" => Left("READ on file not open for input")
${indentStr}  case "48" => Left("WRITE on file not open for output")
${indentStr}  case "49" => Left("REWRITE/DELETE on file not open for I-O")
${indentStr}  case code => Left(s"Unknown file status: $$code")`;
}

/**
 * Main file I/O generator - routes to specific generators
 */
export function generateFileIO(statement, indent = 0) {
  if (!statement) return '';

  const type = statement.type?.toUpperCase() || '';

  switch (type) {
    case 'OPEN':
      return generateOpen(statement, indent);
    case 'CLOSE':
      return generateClose(statement, indent);
    case 'READ':
      return generateRead(statement, indent);
    case 'WRITE':
      return generateWrite(statement, indent);
    case 'REWRITE':
      return generateRewrite(statement, indent);
    case 'DELETE':
      return generateDelete(statement, indent);
    case 'START':
      return generateStart(statement, indent);
    default:
      return `${'  '.repeat(indent)}// ${type} file operation`;
  }
}

export default {
  generateOpen,
  generateClose,
  generateRead,
  generateWrite,
  generateRewrite,
  generateDelete,
  generateStart,
  generateFileIO,
  generateFileIOWithResource,
  generateFileStatusCheck,
  generateFileHandleDeclarations,
  fileHandleVarNames,
  setDeclarativeHandlers,
  setAccessModeRegistry,
  setIndexedOrganizationFiles,
  setRelativeRecordLengthRegistry,
  setLinageInvalidFiles,
};
