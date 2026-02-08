// Main entry point for cobol-to-scala package
import { tokenize } from './parser/lexer.js';
import { parseDataDivision } from './parser/data-division-parser.js';
import { parseProcedureDivision } from './parser/procedure-parser.js';
import { parseSqlBlock } from './parser/sql-parser.js';
import { generateScala } from './generator/scala-generator.js';

export function parseCobol(source) {
  const tokens = tokenize(source);
  const dataItems = parseDataDivision(tokens);
  const procedures = parseProcedureDivision(tokens);
  const sqlBlocks = []; // Extract SQL blocks

  return {
    dataItems,
    procedures,
    sqlBlocks,
    tokens
  };
}

export function convertToScala(source, options = {}) {
  const ast = parseCobol(source);
  const result = generateScala(ast, options);
  return {
    ast,
    scala: result.code,        // The generated Scala code as string
    filename: result.filename,  // Suggested filename
    objectName: result.objectName,
    packageName: result.packageName
  };
}

export { tokenize, parseDataDivision, parseProcedureDivision, generateScala };
