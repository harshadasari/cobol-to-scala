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
    const { fileVar, readerVar, writerVar, iteratorVar, randomVar, bufVar, posVar } = fileHandleVarNames(fileName);
    const mode = (statement.mode || file?.mode || 'INPUT').toUpperCase();
    const statusVar = fileStatusVarFor(fileName);
    const handlerMethod = declarativeHandlerFor(fileName, mode);

    const bi = `${indentStr}  `;
    const openLines = [];
    let canFail = true;

    switch (mode) {
      case 'INPUT':
        openLines.push(`${bi}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        // round-10 finding 3 companion: ISO-8859-1 is a lossless 1:1
        // byte<->char identity mapping (unlike the JVM's UTF-8-by-default
        // charset, which rejects/mangles arbitrary non-ASCII byte values) -
        // required so a record containing packed/binary bytes round-trips
        // through this text-line reader exactly, and a no-op for every
        // plain-ASCII (DISPLAY-only) record already in the corpus.
        openLines.push(`${bi}${readerVar} = scala.io.Source.fromFile(${fileVar})(scala.io.Codec.ISO8859)`);
        openLines.push(`${bi}${iteratorVar} = ${readerVar}.getLines()`);
        break;

      case 'OUTPUT':
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
        const srcVar = `_${toCamelCase(fileName)}Src`;
        openLines.push(`${bi}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        openLines.push(`${bi}val ${srcVar} = scala.io.Source.fromFile(${fileVar})(scala.io.Codec.ISO8859)`);
        openLines.push(`${bi}${bufVar} = scala.collection.mutable.ArrayBuffer.from(${srcVar}.getLines())`);
        openLines.push(`${bi}${srcVar}.close()`);
        openLines.push(`${bi}${posVar} = 0`);
        openLines.push(`${bi}${iteratorVar} = new Iterator[String] {`);
        openLines.push(`${bi}  def hasNext: Boolean = ${posVar} < ${bufVar}.length`);
        openLines.push(`${bi}  def next(): String = { val _v = ${bufVar}(${posVar}); ${posVar} += 1; _v }`);
        openLines.push(`${bi}}`);
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

    if (!canFail) {
      // Unrecognized mode: never touches java.io at all, so nothing can
      // throw - no try/catch needed, just the plain comment (and, as
      // before, a "00" FILE STATUS if one happens to be registered).
      lines.push(`${indentStr}// OPEN ${mode} ${fileName}`);
      if (statusVar) {
        lines.push(`${indentStr}${statusVar} = "00"`);
      }
      continue;
    }

    // round-6 finding 2/3 companion: a registered FILE STATUS field goes to
    // "00" on a successful open.
    if (statusVar) {
      openLines.push(`${bi}${statusVar} = "00"`);
    }

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
    const { fileVar, readerVar, writerVar, randomVar, bufVar } = fileHandleVarNames(fileName);

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
    lines.push(
      `${indentStr}if ${bufVar} != null then { val _w = new java.io.PrintWriter(new java.io.OutputStreamWriter(` +
      `new java.io.FileOutputStream(${fileVar}), java.nio.charset.StandardCharsets.ISO_8859_1)); ` +
      `try ${bufVar}.foreach(_w.println) finally _w.close(); ${bufVar} = null }`
    );

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
export function generateFileHandleDeclarations(fileNames, indent = 1) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  for (const fileName of fileNames) {
    const { fileVar, readerVar, writerVar, iteratorVar, randomVar, bufVar, posVar } = fileHandleVarNames(fileName);
    lines.push(`${indentStr}var ${fileVar}: java.io.File = null`);
    lines.push(`${indentStr}var ${readerVar}: scala.io.BufferedSource = null`);
    lines.push(`${indentStr}var ${writerVar}: java.io.PrintWriter = null`);
    lines.push(`${indentStr}var ${iteratorVar}: Iterator[String] = Iterator.empty`);
    lines.push(`${indentStr}var ${randomVar}: java.io.RandomAccessFile = null`);
    // round-25 root cause 1: OPEN I-O's in-memory line buffer + read-position
    // counter (see generateOpen's I-O branch and generateRewriteStatement/
    // generateDeleteStatement in expression-gen.js) - null/0 defaults are a
    // pure addition with zero effect on any file never opened I-O.
    lines.push(`${indentStr}var ${bufVar}: scala.collection.mutable.ArrayBuffer[String] = null`);
    lines.push(`${indentStr}var ${posVar}: Int = 0`);
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
};
