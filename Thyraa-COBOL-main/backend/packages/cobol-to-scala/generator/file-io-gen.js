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
 * Generate OPEN statement
 */
export function generateOpen(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const files = Array.isArray(statement.files) ? statement.files : [statement.file || statement];

  for (const file of files) {
    const fileName = extractFileName(file);
    const { fileVar, readerVar, writerVar, iteratorVar, randomVar } = fileHandleVarNames(fileName);
    const mode = (statement.mode || file?.mode || 'INPUT').toUpperCase();

    switch (mode) {
      case 'INPUT':
        lines.push(`${indentStr}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        lines.push(`${indentStr}${readerVar} = scala.io.Source.fromFile(${fileVar})`);
        lines.push(`${indentStr}${iteratorVar} = ${readerVar}.getLines()`);
        break;

      case 'OUTPUT':
        lines.push(`${indentStr}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        lines.push(`${indentStr}${writerVar} = new java.io.PrintWriter(${fileVar})`);
        break;

      case 'I-O':
      case 'IO':
        lines.push(`${indentStr}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        lines.push(`${indentStr}${randomVar} = new java.io.RandomAccessFile(${fileVar}, "rw")`);
        break;

      case 'EXTEND':
        lines.push(`${indentStr}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        lines.push(`${indentStr}${writerVar} = new java.io.PrintWriter(new java.io.FileWriter(${fileVar}, true))`);
        break;

      default:
        lines.push(`${indentStr}// OPEN ${mode} ${fileName}`);
    }

    // round-6 finding 2/3 companion: this generator never models an OPEN
    // failure (missing file, permission error, etc. all surface as a raw
    // Java exception, not a FILE STATUS code) - a registered FILE STATUS
    // field always goes to "00" (successful open) here.
    const statusVar = fileStatusVarFor(fileName);
    if (statusVar) {
      lines.push(`${indentStr}${statusVar} = "00"`);
    }
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
    const { readerVar, writerVar, randomVar } = fileHandleVarNames(fileName);

    // Round-6 finding 1: a file using the ADVANCING deferred-terminator
    // WRITE model (see expression-gen.js's generateWriteStatement) leaves
    // its last physical line unterminated - flush the final newline here,
    // before the writer actually closes. A file that never uses ADVANCING
    // is untouched (ADVANCING_FILES empty/absent for it), so this is a
    // pure addition with zero effect on any pre-round-6 program.
    if (ADVANCING_FILES.has(String(fileName || '').toUpperCase())) {
      lines.push(`${indentStr}if ${writerVar} != null then { try ${writerVar}.print("\\n") catch case _: Exception => () }`);
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
    const { fileVar, readerVar, writerVar, iteratorVar, randomVar } = fileHandleVarNames(fileName);
    lines.push(`${indentStr}var ${fileVar}: java.io.File = null`);
    lines.push(`${indentStr}var ${readerVar}: scala.io.BufferedSource = null`);
    lines.push(`${indentStr}var ${writerVar}: java.io.PrintWriter = null`);
    lines.push(`${indentStr}var ${iteratorVar}: Iterator[String] = Iterator.empty`);
    lines.push(`${indentStr}var ${randomVar}: java.io.RandomAccessFile = null`);
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
};
