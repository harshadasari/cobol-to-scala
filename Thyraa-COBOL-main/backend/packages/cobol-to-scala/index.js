// Main entry point for cobol-to-scala package
import { tokenize } from './parser/lexer.js';
import { parseDataDivision } from './parser/data-division-parser.js';
import { parseProcedureDivision } from './parser/procedure-parser.js';
import { parseSqlBlock } from './parser/sql-parser.js';
import { expandCopybooks } from './parser/copybook-resolver.js';
import { generateScala } from './generator/scala-generator.js';

/**
 * Parse COBOL source into data items, procedures and SQL blocks.
 *
 * @param {string} source - COBOL source text
 * @param {object} [options]
 * @param {object} [options.copybooks] - map of copybook name -> source text;
 *   COPY statements are expanded before parsing when provided
 * @param {string} [options.format] - 'fixed' | 'free' (auto-detected otherwise)
 */
export function parseCobol(source, options = {}) {
  let effectiveSource = source;
  let copybookReport = { expanded: [], missing: [] };

  if (options.copybooks && Object.keys(options.copybooks).length > 0) {
    const result = expandCopybooks(source, options.copybooks, options);
    effectiveSource = result.source;
    copybookReport = { expanded: result.expanded, missing: result.missing };
  }

  const tokens = tokenize(effectiveSource, options);
  const dataItems = parseDataDivision(tokens);
  const procedures = parseProcedureDivision(tokens);
  const sqlBlocks = []; // Extract SQL blocks

  return {
    dataItems,
    procedures,
    sqlBlocks,
    tokens,
    copybooks: copybookReport
  };
}

export function convertToScala(source, options = {}) {
  const ast = parseCobol(source, options);
  const result = generateScala(ast, options);
  return {
    ast,
    scala: result.code,        // The generated Scala code as string
    filename: result.filename,  // Suggested filename
    objectName: result.objectName,
    packageName: result.packageName,
    copybooks: ast.copybooks    // Which copybooks were expanded / missing
  };
}

export {
  tokenize,
  parseDataDivision,
  parseProcedureDivision,
  generateScala,
  expandCopybooks
};
