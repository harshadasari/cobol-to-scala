/**
 * scala-generator.js
 * Main generator that coordinates full COBOL to Scala conversion
 */

import { toPascalCase, toCamelCase, generateCaseClass } from './case-class-gen.js';
import { generateAllEnums, groupLevel88sByParent } from './enum-gen.js';
import { generateExpression } from './expression-gen.js';
import { generateMethod, generateAllMethods, toMethodName } from './method-gen.js';
import { generateFileIO, generateFileStatusCheck } from './file-io-gen.js';
import { generateSql, generateDoobieImports, generateTransactorSetup } from './sql-gen.js';

/**
 * Default options for Scala generation
 */
const DEFAULT_OPTIONS = {
  packageName: 'com.example.cobol',
  objectName: null, // Derived from program name if not specified
  useScala3Syntax: true,
  generateCompanionObjects: true,
  includeComments: true,
  indentSize: 2,
  maxLineLength: 120,
  useDoobie: false,
  useCatsEffect: false,
  generateMain: false
};

/**
 * Extract program name from COBOL AST
 * Searches tokens for PROGRAM-ID value
 */
function extractProgramName(ast) {
  if (ast.identification?.programId) {
    return ast.identification.programId;
  }
  if (ast.programId) {
    return ast.programId;
  }
  if (ast.name) {
    return ast.name;
  }

  // Try to extract from tokens if available
  if (ast.tokens && Array.isArray(ast.tokens)) {
    for (let i = 0; i < ast.tokens.length - 1; i++) {
      const token = ast.tokens[i];
      if (token.value?.toUpperCase() === 'PROGRAM-ID' ||
          token.type === 'PROGRAM-ID') {
        // Skip period if present, then get the identifier
        let nextIdx = i + 1;
        while (nextIdx < ast.tokens.length) {
          const next = ast.tokens[nextIdx];
          if (next.type === 'PERIOD' || next.value === '.') {
            nextIdx++;
            continue;
          }
          if (next.type === 'IDENTIFIER' || /^[A-Za-z]/.test(next.value)) {
            return next.value;
          }
          break;
        }
      }
    }
  }

  return 'CobolProgram';
}

/**
 * Generate Scala package declaration
 */
function generatePackageDeclaration(packageName) {
  return `package ${packageName}`;
}

/**
 * Generate Scala imports based on AST analysis
 */
function generateImports(ast, options) {
  const imports = new Set();

  // Standard imports
  imports.add('import scala.util.{Try, Success, Failure}');

  // Check if file I/O is used
  if (hasFileOperations(ast)) {
    imports.add('import scala.io.Source');
    imports.add('import java.io.{File, PrintWriter, FileWriter}');
    imports.add('import scala.util.Using');
  }

  // Check if SQL is used
  if (hasSqlOperations(ast)) {
    imports.add('import java.sql.SQLException');
    if (options.useDoobie) {
      imports.add(generateDoobieImports());
    }
  }

  // Check if date/time is used
  if (hasDateTimeOperations(ast)) {
    imports.add('import java.time.{LocalDate, LocalTime, LocalDateTime}');
    imports.add('import java.time.format.DateTimeFormatter');
  }

  // Check if BigDecimal is used
  if (hasBigDecimalFields(ast)) {
    // BigDecimal is in scala.math, already available
  }

  return Array.from(imports).sort().join('\n');
}

/**
 * Check if AST contains file operations
 */
function hasFileOperations(ast) {
  if (ast.environment?.inputOutput?.fileControl) {
    return true;
  }
  if (ast.data?.fileSection) {
    return true;
  }
  return containsStatementType(ast, ['OPEN', 'CLOSE', 'READ', 'WRITE', 'REWRITE', 'DELETE', 'START']);
}

/**
 * Check if AST contains SQL operations
 */
function hasSqlOperations(ast) {
  return containsStatementType(ast, ['EXEC SQL', 'EXEC-SQL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']);
}

/**
 * Check if AST contains date/time operations
 */
function hasDateTimeOperations(ast) {
  return containsStatementType(ast, ['ACCEPT']) ||
    containsFunctionCall(ast, ['CURRENT-DATE', 'WHEN-COMPILED']);
}

/**
 * Check if AST contains BigDecimal fields
 */
function hasBigDecimalFields(ast) {
  const dataItems = collectDataItems(ast);
  return dataItems.some(item => {
    const pic = item.picture?.toUpperCase() || '';
    return pic.includes('V') || pic.includes('S9');
  });
}

/**
 * Check if AST contains specific statement types
 */
function containsStatementType(ast, types) {
  // Handle multiple formats for procedures
  let procedures = [];

  // Format 1: ast.procedure.paragraphs (nested)
  if (ast.procedure?.paragraphs && Array.isArray(ast.procedure.paragraphs)) {
    procedures = ast.procedure.paragraphs;
  }
  // Format 2: ast.procedures (ProcedureDivision object with .paragraphs)
  else if (ast.procedures?.paragraphs && Array.isArray(ast.procedures.paragraphs)) {
    procedures = ast.procedures.paragraphs;
  }
  // Format 3: ast.procedures.sections (check sections too)
  else if (ast.procedures?.sections && Array.isArray(ast.procedures.sections)) {
    procedures = ast.procedures.sections;
    // Also include top-level paragraphs
    if (ast.procedures.paragraphs) {
      procedures = [...procedures, ...ast.procedures.paragraphs];
    }
  }
  // Format 4: ast.procedures is an array directly
  else if (Array.isArray(ast.procedures)) {
    procedures = ast.procedures;
  }

  function checkStatements(statements) {
    for (const stmt of statements || []) {
      if (types.includes(stmt.type?.toUpperCase())) {
        return true;
      }
      // Check nested statements in IF, EVALUATE, etc.
      if (stmt.thenStatements && checkStatements(stmt.thenStatements)) return true;
      if (stmt.elseStatements && checkStatements(stmt.elseStatements)) return true;
      if (stmt.statements && checkStatements(stmt.statements)) return true;
    }
    return false;
  }

  for (const proc of procedures) {
    if (checkStatements(proc.statements)) return true;
    // Also check paragraphs within sections
    if (proc.paragraphs) {
      for (const para of proc.paragraphs) {
        if (checkStatements(para.statements)) return true;
      }
    }
  }
  return false;
}

/**
 * Check if AST contains specific function calls
 */
function containsFunctionCall(ast, functionNames) {
  // Simplified check - would need deeper analysis for full coverage
  return false;
}

/**
 * Collect all data items from AST
 * Handles multiple parser output formats
 */
function collectDataItems(ast) {
  const items = [];

  function collect(item) {
    if (item) {
      items.push(item);
      if (item.children) {
        item.children.forEach(collect);
      }
    }
  }

  // Handle parseCobol() flat dataItems array (from index.js)
  if (ast.dataItems) {
    // dataItems from parser can be an object with sections or flat array
    if (ast.dataItems.workingStorageSection?.items) {
      ast.dataItems.workingStorageSection.items.forEach(collect);
    }
    if (ast.dataItems.fileSection?.files) {
      for (const file of ast.dataItems.fileSection.files) {
        if (file.records) file.records.forEach(collect);
      }
    }
    if (ast.dataItems.linkageSection?.items) {
      ast.dataItems.linkageSection.items.forEach(collect);
    }
    // Also check if dataItems itself has these properties
    if (ast.dataItems.workingStorageSection === undefined &&
        ast.dataItems.fileSection === undefined) {
      // It might be a direct object with section properties
      const ws = ast.dataItems.workingStorageSection || ast.dataItems.workingStorage;
      const fs = ast.dataItems.fileSection;
      const ls = ast.dataItems.linkageSection;
      if (ws?.items) ws.items.forEach(collect);
      if (fs?.files) {
        for (const file of fs.files) {
          if (file.records) file.records.forEach(collect);
        }
      }
      if (ls?.items) ls.items.forEach(collect);
    }
  }

  // Handle nested data.workingStorageSection format
  if (ast.data?.workingStorageSection?.items) {
    ast.data.workingStorageSection.items.forEach(collect);
  } else if (ast.data?.workingStorageSection) {
    // Could be an array directly
    const ws = ast.data.workingStorageSection;
    if (Array.isArray(ws)) ws.forEach(collect);
  }

  if (ast.data?.fileSection?.files) {
    for (const file of ast.data.fileSection.files) {
      if (file.records) file.records.forEach(collect);
    }
  }

  if (ast.data?.linkageSection?.items) {
    ast.data.linkageSection.items.forEach(collect);
  }

  // Handle direct workingStorage format (older format)
  if (ast.workingStorage && Array.isArray(ast.workingStorage)) {
    ast.workingStorage.forEach(collect);
  }

  // Handle direct fileSection format
  if (ast.fileSection && Array.isArray(ast.fileSection)) {
    ast.fileSection.forEach(collect);
  }

  // Handle direct linkageSection format
  if (ast.linkageSection && Array.isArray(ast.linkageSection)) {
    ast.linkageSection.forEach(collect);
  }

  return items;
}

/**
 * Generate file path constants from file control
 */
function generateFileConstants(ast, indent = 1) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const fileControl = ast.environment?.inputOutput?.fileControl || [];

  for (const file of fileControl) {
    const fileName = toCamelCase(file.name || file.fileName);
    const assignTo = file.assignTo || file.assign || `"${fileName}.dat"`;

    lines.push(`${indentStr}val ${fileName}Path: String = ${assignTo.includes('"') ? assignTo : `"${assignTo}"`}`);
  }

  return lines.join('\n');
}

/**
 * Generate working storage as class fields
 * Handles multiple parser output formats
 */
function generateWorkingStorageFields(ast, indent = 1) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  // Collect working storage items from various formats
  let workingStorage = [];

  // Format 1: ast.dataItems.workingStorageSection.items
  if (ast.dataItems?.workingStorageSection?.items) {
    workingStorage = ast.dataItems.workingStorageSection.items;
  }
  // Format 2: ast.data.workingStorageSection.items
  else if (ast.data?.workingStorageSection?.items) {
    workingStorage = ast.data.workingStorageSection.items;
  }
  // Format 3: ast.data.workingStorageSection as array
  else if (ast.data?.workingStorageSection && Array.isArray(ast.data.workingStorageSection)) {
    workingStorage = ast.data.workingStorageSection;
  }
  // Format 4: ast.workingStorage as array
  else if (ast.workingStorage && Array.isArray(ast.workingStorage)) {
    workingStorage = ast.workingStorage;
  }

  for (const item of workingStorage) {
    // Skip 01 level records (they become case classes)
    if (item.level === 1 || item.level === '01') {
      continue;
    }

    // Handle 77 level items (standalone working storage variables)
    if (item.level === 77 || item.level === '77') {
      const fieldName = toCamelCase(item.name);
      const fieldType = mapSimpleType(item);
      const defaultValue = getDefaultValue(item);
      lines.push(`${indentStr}var ${fieldName}: ${fieldType} = ${defaultValue}`);
    }
  }

  return lines.join('\n');
}

/**
 * Map simple COBOL type to Scala type
 */
function mapSimpleType(item) {
  const pic = item.picture?.toUpperCase() || '';
  const usage = item.usage?.toUpperCase() || '';

  if (usage === 'COMP-1') return 'Float';
  if (usage === 'COMP-2') return 'Double';
  if (usage === 'COMP-3') return 'BigDecimal';

  if (pic.includes('V') || pic.includes('S9')) return 'BigDecimal';

  if (/^[AX]/.test(pic)) return 'String';

  if (/^9/.test(pic)) {
    const match = pic.match(/9\((\d+)\)/);
    const digits = match ? parseInt(match[1], 10) : pic.length;
    return digits <= 9 ? 'Int' : 'Long';
  }

  return 'String';
}

/**
 * Get default value for a type
 */
function getDefaultValue(item) {
  const type = mapSimpleType(item);
  const value = item.value;

  if (value !== undefined && value !== null) {
    if (type === 'String') return `"${value}"`;
    if (type === 'Int' || type === 'Long') return value.toString();
    if (type === 'BigDecimal') return `BigDecimal("${value}")`;
    if (type === 'Float') return `${value}f`;
    if (type === 'Double') return `${value}d`;
    return value.toString();
  }

  switch (type) {
    case 'String': return '""';
    case 'Int': return '0';
    case 'Long': return '0L';
    case 'Float': return '0.0f';
    case 'Double': return '0.0';
    case 'BigDecimal': return 'BigDecimal(0)';
    default: return 'null';
  }
}

/**
 * Generate case classes from COBOL records
 * Handles multiple parser output formats
 */
function generateAllCaseClasses(ast, indent = 0) {
  const classes = [];

  function processItems(items) {
    if (!items) return;
    for (const item of items) {
      if ((item.level === 1 || item.level === '01' || item.level === 1) &&
          item.children && item.children.length > 0) {
        classes.push(generateCaseClass(item, indent));
      }
    }
  }

  function processFileSection(fileSection) {
    if (!fileSection) return;
    const files = fileSection.files || fileSection;
    if (!Array.isArray(files)) return;

    for (const fd of files) {
      if (fd.record) {
        classes.push(generateCaseClass(fd.record, indent));
      }
      if (fd.records) {
        for (const record of fd.records) {
          classes.push(generateCaseClass(record, indent));
        }
      }
    }
  }

  // Handle parseCobol() output format (dataItems object)
  if (ast.dataItems) {
    // Check for WorkingStorageSection object with items property
    if (ast.dataItems.workingStorageSection?.items) {
      processItems(ast.dataItems.workingStorageSection.items);
    }
    if (ast.dataItems.fileSection) {
      processFileSection(ast.dataItems.fileSection);
    }
    if (ast.dataItems.linkageSection?.items) {
      processItems(ast.dataItems.linkageSection.items);
    }
  }

  // Handle nested data format
  if (ast.data?.workingStorageSection?.items) {
    processItems(ast.data.workingStorageSection.items);
  } else if (ast.data?.workingStorageSection && Array.isArray(ast.data.workingStorageSection)) {
    processItems(ast.data.workingStorageSection);
  }

  if (ast.data?.fileSection) {
    processFileSection(ast.data.fileSection);
  }

  if (ast.data?.linkageSection?.items) {
    processItems(ast.data.linkageSection.items);
  } else if (ast.data?.linkageSection && Array.isArray(ast.data.linkageSection)) {
    processItems(ast.data.linkageSection);
  }

  // Handle direct arrays (older format)
  if (ast.workingStorage && Array.isArray(ast.workingStorage)) {
    processItems(ast.workingStorage);
  }
  if (ast.fileSection) {
    processFileSection(ast.fileSection);
  }
  if (ast.linkageSection && Array.isArray(ast.linkageSection)) {
    processItems(ast.linkageSection);
  }

  return classes.filter(c => c).join('\n\n');
}

/**
 * Generate enums from Level 88 conditions
 */
function generateEnums(ast, indent = 0) {
  const dataItems = collectDataItems(ast);
  return generateAllEnums(dataItems, indent);
}

/**
 * Generate methods from COBOL procedures
 * Handles multiple parser output formats
 */
function generateMethods(ast, indent = 1) {
  let procedures = [];

  // Format 1: ast.procedure.paragraphs (nested format)
  if (ast.procedure?.paragraphs && Array.isArray(ast.procedure.paragraphs)) {
    procedures = ast.procedure.paragraphs;
  }
  // Format 2: ast.procedures is a ProcedureDivision object with paragraphs
  else if (ast.procedures?.paragraphs && Array.isArray(ast.procedures.paragraphs)) {
    procedures = ast.procedures.paragraphs;
    // Also include paragraphs from sections
    if (ast.procedures.sections && Array.isArray(ast.procedures.sections)) {
      for (const section of ast.procedures.sections) {
        if (section.paragraphs) {
          procedures = [...procedures, ...section.paragraphs];
        }
        // Include section-level statements as a method
        if (section.statements && section.statements.length > 0) {
          procedures = [...procedures, section];
        }
      }
    }
  }
  // Format 3: ast.procedures is an array directly
  else if (Array.isArray(ast.procedures)) {
    procedures = ast.procedures;
  }

  return generateAllMethods(procedures, indent);
}

/**
 * Generate main method if requested
 */
function generateMainMethod(ast, options, indent = 1) {
  if (!options.generateMain) return '';

  const indentStr = '  '.repeat(indent);
  const mainProcedure = findMainProcedure(ast);

  const lines = [
    `${indentStr}@main def run(): Unit =`,
    `${indentStr}  ${toMethodName(mainProcedure || 'mainProcedure')}()`
  ];

  return lines.join('\n');
}

/**
 * Find the main procedure (typically the first one or one with specific naming)
 */
function findMainProcedure(ast) {
  let procedures = [];

  // Handle multiple formats
  if (ast.procedure?.paragraphs && Array.isArray(ast.procedure.paragraphs)) {
    procedures = ast.procedure.paragraphs;
  } else if (ast.procedures?.paragraphs && Array.isArray(ast.procedures.paragraphs)) {
    procedures = ast.procedures.paragraphs;
  } else if (Array.isArray(ast.procedures)) {
    procedures = ast.procedures;
  }

  if (procedures.length === 0) return null;

  // Look for common main procedure names
  const mainNames = ['MAIN', 'MAIN-PROCEDURE', 'MAIN-PARA', '0000-MAIN', '0000-MAIN-PARAGRAPH', 'START'];
  for (const name of mainNames) {
    const found = procedures.find(p => p.name?.toUpperCase() === name);
    if (found) return found.name;
  }

  // Return the first procedure
  return procedures[0]?.name;
}

/**
 * Generate complete Scala file from COBOL AST
 */
export function generateScala(ast, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const programName = extractProgramName(ast);
  const objectName = opts.objectName || toPascalCase(programName);
  const filename = `${objectName}.scala`;

  const sections = [];

  // Package declaration
  sections.push(generatePackageDeclaration(opts.packageName));
  sections.push('');

  // Imports
  const imports = generateImports(ast, opts);
  if (imports) {
    sections.push(imports);
    sections.push('');
  }

  // Generate case classes (outside the object for better organization)
  const caseClasses = generateAllCaseClasses(ast, 0);
  if (caseClasses) {
    sections.push('// Data structures');
    sections.push(caseClasses);
    sections.push('');
  }

  // Generate enums
  const enums = generateEnums(ast, 0);
  if (enums) {
    sections.push('// Enumerations');
    sections.push(enums);
    sections.push('');
  }

  // Generate main object
  sections.push(`object ${objectName}:`);

  // File constants
  const fileConstants = generateFileConstants(ast, 1);
  if (fileConstants) {
    sections.push('');
    sections.push('  // File paths');
    sections.push(fileConstants);
  }

  // Working storage fields (77-level items)
  const workingFields = generateWorkingStorageFields(ast, 1);
  if (workingFields) {
    sections.push('');
    sections.push('  // Working storage');
    sections.push(workingFields);
  }

  // SQL transactor setup if needed
  if (hasSqlOperations(ast) && opts.useDoobie) {
    sections.push('');
    sections.push('  // Database connection');
    sections.push(generateTransactorSetup(opts.dbConfig || {}, 1));
  }

  // Methods from procedures
  const methods = generateMethods(ast, 1);
  if (methods) {
    sections.push('');
    sections.push('  // Procedures');
    sections.push(methods);
  }

  // Main method
  const mainMethod = generateMainMethod(ast, opts, 1);
  if (mainMethod) {
    sections.push('');
    sections.push(mainMethod);
  }

  sections.push(`end ${objectName}`);

  const code = sections.join('\n');

  return {
    code,
    filename,
    objectName,
    packageName: opts.packageName
  };
}

/**
 * Generate Scala from multiple COBOL programs
 */
export function generateScalaMultiple(asts, options = {}) {
  const results = [];

  for (const ast of asts) {
    results.push(generateScala(ast, options));
  }

  return results;
}

/**
 * Format generated Scala code
 */
export function formatScalaCode(code, options = {}) {
  const lines = code.split('\n');
  const formattedLines = [];

  let indentLevel = 0;
  const indentSize = options.indentSize || 2;

  for (let line of lines) {
    const trimmed = line.trim();

    // Decrease indent for closing braces/keywords
    if (trimmed.startsWith('end ') || trimmed === 'end' ||
        trimmed.startsWith('}') || trimmed === ')') {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // Apply current indent
    if (trimmed) {
      formattedLines.push(' '.repeat(indentLevel * indentSize) + trimmed);
    } else {
      formattedLines.push('');
    }

    // Increase indent for opening constructs
    if (trimmed.endsWith(':') || trimmed.endsWith('=') ||
        trimmed.endsWith('{') || trimmed.endsWith('(') ||
        trimmed.startsWith('if ') || trimmed.startsWith('while ') ||
        trimmed.startsWith('for ') || trimmed.startsWith('match') ||
        trimmed.startsWith('try') || trimmed.startsWith('catch')) {
      indentLevel += 1;
    }
  }

  return formattedLines.join('\n');
}

export default {
  generateScala,
  generateScalaMultiple,
  formatScalaCode,
  extractProgramName,
  toPascalCase,
  toCamelCase
};
