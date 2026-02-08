/**
 * COBOL Parser - Main Entry Point
 * Comprehensive COBOL parser for tokenization and AST generation
 */

// Import all components
import { TokenType, Keywords, Token, ValidLevelNumbers, FigurativeConstants, UsageTypes } from './tokens.js';
import { tokenize, tokenizeAuto, getFormat, Lexer, detectFormat } from './lexer.js';
import {
  parseDataDivision,
  parseWorkingStorageSection,
  parseFileSection,
  parseLinkageSection,
  parseLocalStorageSection,
  parsePicPattern,
  buildHierarchy,
  ParserContext as DataParserContext,
} from './data-division-parser.js';
import {
  parseProcedureDivision,
  parseStatement,
  parseCondition,
  parseArithmeticExpression,
  parseVariableReference,
  parseOperand,
  ParserContext as ProcedureParserContext,
} from './procedure-parser.js';
import {
  parseSqlBlock,
  parseCicsBlock,
  parseAllSqlBlocks,
  parseAllCicsBlocks,
  parseSqlText,
  extractHostVariables,
  CicsCommands,
  SqlTypes,
} from './sql-parser.js';
import * as AST from './ast.js';

/**
 * Parse identification division to extract program name and metadata
 */
function parseIdentificationDivision(tokens) {
  const result = {
    programId: '',
    author: '',
    installation: '',
    dateWritten: '',
    dateCompiled: '',
    security: '',
    remarks: '',
  };

  let inIdDivision = false;
  let currentClause = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const upperValue = token.value?.toUpperCase();

    // Find start of IDENTIFICATION DIVISION
    if (upperValue === 'IDENTIFICATION' || upperValue === 'ID') {
      const next = tokens[i + 1];
      if (next?.value?.toUpperCase() === 'DIVISION') {
        inIdDivision = true;
        i++;
        continue;
      }
    }

    // Check for end of IDENTIFICATION DIVISION
    if (inIdDivision) {
      if (upperValue === 'ENVIRONMENT' || upperValue === 'DATA' || upperValue === 'PROCEDURE') {
        break;
      }

      // Parse clauses
      if (upperValue === 'PROGRAM-ID') {
        currentClause = 'programId';
        continue;
      }
      if (upperValue === 'AUTHOR') {
        currentClause = 'author';
        continue;
      }
      if (upperValue === 'INSTALLATION') {
        currentClause = 'installation';
        continue;
      }
      if (upperValue === 'DATE-WRITTEN') {
        currentClause = 'dateWritten';
        continue;
      }
      if (upperValue === 'DATE-COMPILED') {
        currentClause = 'dateCompiled';
        continue;
      }
      if (upperValue === 'SECURITY') {
        currentClause = 'security';
        continue;
      }
      if (upperValue === 'REMARKS') {
        currentClause = 'remarks';
        continue;
      }

      // Collect value for current clause
      if (currentClause && token.type === TokenType.IDENTIFIER) {
        result[currentClause] = token.value;
        currentClause = null;
      }
    }
  }

  return result;
}

/**
 * Parse environment division to extract file and configuration info
 */
function parseEnvironmentDivision(tokens) {
  const result = {
    sourceComputer: '',
    objectComputer: '',
    specialNames: [],
    fileControls: [],
    ioControls: [],
  };

  let inEnvDivision = false;
  let section = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const upperValue = token.value?.toUpperCase();

    // Find start of ENVIRONMENT DIVISION
    if (upperValue === 'ENVIRONMENT') {
      const next = tokens[i + 1];
      if (next?.value?.toUpperCase() === 'DIVISION') {
        inEnvDivision = true;
        i++;
        continue;
      }
    }

    // Check for end of ENVIRONMENT DIVISION
    if (inEnvDivision) {
      if (upperValue === 'DATA' || upperValue === 'PROCEDURE') {
        break;
      }

      // Track sections
      if (upperValue === 'CONFIGURATION') {
        section = 'configuration';
        continue;
      }
      if (upperValue === 'INPUT-OUTPUT') {
        section = 'inputOutput';
        continue;
      }

      // Parse FILE-CONTROL entries
      if (upperValue === 'SELECT') {
        const fileControl = { fileName: '', assignTo: '', organization: '', access: '', status: '' };

        // Get file name
        i++;
        if (i < tokens.length && tokens[i].type === TokenType.IDENTIFIER) {
          fileControl.fileName = tokens[i].value;
        }

        // Parse ASSIGN, ORGANIZATION, ACCESS, STATUS
        while (i < tokens.length && tokens[i].type !== TokenType.PERIOD) {
          const val = tokens[i].value?.toUpperCase();
          if (val === 'ASSIGN') {
            i++;
            if (tokens[i]?.value?.toUpperCase() === 'TO') i++;
            if (i < tokens.length) {
              fileControl.assignTo = tokens[i].value;
            }
          } else if (val === 'ORGANIZATION') {
            i++;
            if (tokens[i]?.value?.toUpperCase() === 'IS') i++;
            if (i < tokens.length) {
              fileControl.organization = tokens[i].value?.toUpperCase();
            }
          } else if (val === 'ACCESS') {
            i++;
            if (tokens[i]?.value?.toUpperCase() === 'MODE') i++;
            if (tokens[i]?.value?.toUpperCase() === 'IS') i++;
            if (i < tokens.length) {
              fileControl.access = tokens[i].value?.toUpperCase();
            }
          } else if (val === 'FILE' && tokens[i + 1]?.value?.toUpperCase() === 'STATUS') {
            i += 2;
            if (tokens[i]?.value?.toUpperCase() === 'IS') i++;
            if (i < tokens.length) {
              fileControl.status = tokens[i].value;
            }
          }
          i++;
        }

        result.fileControls.push(fileControl);
      }
    }
  }

  return result;
}

/**
 * Find COPY statements in source
 */
function findCopyStatements(tokens) {
  const copies = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === TokenType.COPY) {
      const copyStmt = {
        copybookName: '',
        library: null,
        replacing: [],
      };

      // Get copybook name
      i++;
      if (i < tokens.length) {
        copyStmt.copybookName = tokens[i].value;
      }

      // Parse OF/IN library
      i++;
      if (i < tokens.length) {
        const val = tokens[i].value?.toUpperCase();
        if (val === 'OF' || val === 'IN') {
          i++;
          if (i < tokens.length) {
            copyStmt.library = tokens[i].value;
          }
        }
      }

      // Parse REPLACING clause
      while (i < tokens.length && tokens[i].type !== TokenType.PERIOD) {
        const val = tokens[i].value?.toUpperCase();
        if (val === 'REPLACING') {
          i++;
          // Parse replacement pairs
          while (i < tokens.length && tokens[i].type !== TokenType.PERIOD) {
            const from = tokens[i]?.value;
            i++;
            if (tokens[i]?.value?.toUpperCase() === 'BY') {
              i++;
              const to = tokens[i]?.value;
              copyStmt.replacing.push({ from, to });
            }
            i++;
          }
        }
        i++;
      }

      copies.push(copyStmt);
    }
  }

  return copies;
}

/**
 * Main parsing function - parses complete COBOL source
 * @param {string} source - COBOL source code
 * @param {object} options - Parsing options
 * @returns {object} Parsed AST with all divisions
 */
export function parseCobol(source, options = {}) {
  // Tokenize source
  const tokens = tokenize(source, options);

  // Parse identification division
  const identificationDivision = parseIdentificationDivision(tokens);

  // Parse environment division
  const environmentDivision = parseEnvironmentDivision(tokens);

  // Parse data division
  const dataDivision = parseDataDivision(tokens);

  // Parse procedure division
  const procedureDivision = parseProcedureDivision(tokens);

  // Parse SQL blocks
  const sqlBlocks = parseAllSqlBlocks(tokens);

  // Parse CICS blocks
  const cicsBlocks = parseAllCicsBlocks(tokens);

  // Find COPY statements
  const copyStatements = findCopyStatements(tokens);

  // Build complete program AST
  const program = new AST.CobolProgram({
    programId: identificationDivision.programId,
    identificationDivision,
    environmentDivision,
    dataDivision: new AST.DataDivision({
      fileSection: dataDivision.fileSection,
      workingStorageSection: dataDivision.workingStorageSection,
      localStorageSection: dataDivision.localStorageSection,
      linkageSection: dataDivision.linkageSection,
    }),
    procedureDivision,
  });

  return {
    program,
    tokens,
    dataItems: getDataItems(dataDivision),
    procedures: getProcedures(procedureDivision),
    sqlBlocks,
    cicsBlocks,
    copyStatements,
    errors: [],
  };
}

/**
 * Extract flat list of data items from data division
 */
function getDataItems(dataDivision) {
  const items = [];

  function collectItems(node) {
    if (!node) return;

    if (node.items) {
      for (const item of node.items) {
        items.push(item);
        if (item.children) {
          for (const child of item.children) {
            collectItems({ items: [child] });
          }
        }
      }
    }

    if (node.files) {
      for (const file of node.files) {
        if (file.records) {
          for (const record of file.records) {
            items.push(record);
            if (record.children) {
              for (const child of record.children) {
                collectItems({ items: [child] });
              }
            }
          }
        }
      }
    }
  }

  collectItems(dataDivision.workingStorageSection);
  collectItems(dataDivision.linkageSection);
  collectItems(dataDivision.localStorageSection);
  collectItems(dataDivision.fileSection);

  return items;
}

/**
 * Extract flat list of procedures
 */
function getProcedures(procedureDivision) {
  if (!procedureDivision) return [];

  const procedures = [];

  // Add sections
  for (const section of procedureDivision.sections || []) {
    procedures.push(section);
    // Add paragraphs within sections
    for (const para of section.paragraphs || []) {
      procedures.push(para);
    }
  }

  // Add standalone paragraphs
  for (const para of procedureDivision.paragraphs || []) {
    procedures.push(para);
  }

  return procedures;
}

/**
 * Quick parse - only tokenize without full AST
 */
export function quickParse(source, options = {}) {
  const tokens = tokenize(source, options);
  const format = getFormat(source);

  return {
    tokens,
    format,
    lineCount: source.split(/\r?\n/).length,
    tokenCount: tokens.length,
  };
}

/**
 * Parse only data division
 */
export function parseDataOnly(source, options = {}) {
  const tokens = tokenize(source, options);
  return parseDataDivision(tokens);
}

/**
 * Parse only procedure division
 */
export function parseProcedureOnly(source, options = {}) {
  const tokens = tokenize(source, options);
  return parseProcedureDivision(tokens);
}

/**
 * Parse only SQL statements
 */
export function parseSqlOnly(source, options = {}) {
  const tokens = tokenize(source, options);
  return parseAllSqlBlocks(tokens);
}

/**
 * Validate COBOL source (basic validation)
 */
export function validateCobol(source) {
  const errors = [];
  const warnings = [];

  try {
    const result = parseCobol(source);

    // Check for program ID
    if (!result.program.programId) {
      errors.push({
        severity: 'error',
        message: 'Missing PROGRAM-ID in IDENTIFICATION DIVISION',
        line: 1,
      });
    }

    // Check for procedure division
    if (!result.procedureDivision ||
        (result.procedures.length === 0)) {
      warnings.push({
        severity: 'warning',
        message: 'No procedures found in PROCEDURE DIVISION',
        line: 1,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      program: result.program,
    };
  } catch (e) {
    return {
      valid: false,
      errors: [{
        severity: 'error',
        message: `Parse error: ${e.message}`,
        line: 1,
      }],
      warnings: [],
      program: null,
    };
  }
}

// Re-export all components
export {
  // Tokens
  TokenType,
  Keywords,
  Token,
  ValidLevelNumbers,
  FigurativeConstants,
  UsageTypes,

  // Lexer
  tokenize,
  tokenizeAuto,
  getFormat,
  Lexer,
  detectFormat,

  // Data Division Parser
  parseDataDivision,
  parseWorkingStorageSection,
  parseFileSection,
  parseLinkageSection,
  parseLocalStorageSection,
  parsePicPattern,
  buildHierarchy,

  // Procedure Division Parser
  parseProcedureDivision,
  parseStatement,
  parseCondition,
  parseArithmeticExpression,
  parseVariableReference,
  parseOperand,

  // SQL/CICS Parser
  parseSqlBlock,
  parseCicsBlock,
  parseAllSqlBlocks,
  parseAllCicsBlocks,
  parseSqlText,
  extractHostVariables,
  CicsCommands,
  SqlTypes,

  // AST Types
  AST,
};

export default {
  // Main parsing functions
  parseCobol,
  quickParse,
  parseDataOnly,
  parseProcedureOnly,
  parseSqlOnly,
  validateCobol,

  // Tokenization
  tokenize,
  tokenizeAuto,
  getFormat,

  // Specific parsers
  parseDataDivision,
  parseProcedureDivision,
  parseAllSqlBlocks,
  parseAllCicsBlocks,

  // Utilities
  parsePicPattern,
  buildHierarchy,
  extractHostVariables,

  // Types
  TokenType,
  Keywords,
  AST,
  CicsCommands,
  SqlTypes,
};
