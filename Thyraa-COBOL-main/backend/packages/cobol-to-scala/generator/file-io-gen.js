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
 * Generate OPEN statement
 */
export function generateOpen(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const files = Array.isArray(statement.files) ? statement.files : [statement.file || statement];

  for (const file of files) {
    const fileName = extractFileName(file);
    const fileVar = toFileVarName(fileName);
    const mode = (statement.mode || file?.mode || 'INPUT').toUpperCase();

    switch (mode) {
      case 'INPUT':
        const readerVar = toReaderVarName(fileName);
        lines.push(`${indentStr}val ${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        lines.push(`${indentStr}val ${readerVar} = scala.io.Source.fromFile(${fileVar})`);
        lines.push(`${indentStr}val ${toIteratorVarName(fileName)} = ${readerVar}.getLines()`);
        break;

      case 'OUTPUT':
        const writerVar = toWriterVarName(fileName);
        lines.push(`${indentStr}val ${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        lines.push(`${indentStr}val ${writerVar} = new java.io.PrintWriter(${fileVar})`);
        break;

      case 'I-O':
      case 'IO':
        lines.push(`${indentStr}val ${fileVar} = new java.io.RandomAccessFile(${toCamelCase(fileName)}Path, "rw")`);
        break;

      case 'EXTEND':
        const appendWriter = toWriterVarName(fileName);
        lines.push(`${indentStr}val ${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
        lines.push(`${indentStr}val ${appendWriter} = new java.io.PrintWriter(new java.io.FileWriter(${fileVar}, true))`);
        break;

      default:
        lines.push(`${indentStr}// OPEN ${mode} ${fileName}`);
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
    const fileName = file.name || file;
    const readerVar = toReaderVarName(fileName);
    const writerVar = toWriterVarName(fileName);

    // Generate close for both reader and writer (one will exist)
    lines.push(`${indentStr}try ${readerVar}.close() catch case _: Exception => ()`);
    lines.push(`${indentStr}try ${writerVar}.close() catch case _: Exception => ()`);
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
 * Generate WRITE statement
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
  generateFileStatusCheck
};
