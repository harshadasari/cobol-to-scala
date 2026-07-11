/**
 * scala-generator.js
 * Main generator that coordinates full COBOL to Scala conversion
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toPascalCase, toCamelCase, generateCaseClass } from './case-class-gen.js';
import { getPicPattern, scalaBaseType, occursCount, hasOccurs } from './layout.js';
import { generateAllEnums, groupLevel88sByParent } from './enum-gen.js';
import { generateExpression, setFieldRegistry, generateCobolFmtHelper } from './expression-gen.js';
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
  generateMain: false,
  // Phase 1 byte-level record I/O options (see case-class-gen.js file header
  // for the full design rationale):
  charset: 'ascii', // 'ascii' | 'ebcdic' - drives PIC X/A string codecs and
                     // the codePage passed to zoned-decimal (DISPLAY numeric)
                     // codecs generated for every record's parse/format.
  embedRuntime: true, // true: inline the CobolCodecs object source into the
                       // generated file so `scala-cli run <file>.scala` is
                       // single-file/self-contained (the default - matches
                       // how the round-trip tests and the oracle harness
                       // invoke scala-cli). false: emit
                       // `import com.thyraa.cobol.runtime.CobolCodecs`
                       // instead, for callers who compile runtime/ once and
                       // share it across a multi-file classpath.
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read once at module load; stripped of its `package` line so it can be
// embedded verbatim as a top-level object in whatever package the generated
// file declares (Scala doesn't care which file an object's source lives in,
// only which package it's compiled into).
const COBOL_CODECS_SOURCE = fs
  .readFileSync(path.join(__dirname, '..', 'runtime', 'CobolCodecs.scala'), 'utf-8')
  .replace(/^package [^\n]*\n/, '')
  .trim();

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

  // When the CobolCodecs runtime isn't embedded inline (embedRuntime: false),
  // generated case classes' parse/format still reference it unqualified, so
  // an explicit import is required.
  if (!options.embedRuntime) {
    imports.add('import com.thyraa.cobol.runtime.CobolCodecs');
  }

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
    const pic = getPicPattern(item);
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
 * Collect the top-level WORKING-STORAGE items regardless of which AST shape
 * this parser run produced (mirrors the fallback chain used elsewhere in
 * this file, e.g. generateAllCaseClasses).
 */
function getWorkingStorageItems(ast) {
  if (ast.dataItems?.workingStorageSection?.items) {
    return ast.dataItems.workingStorageSection.items;
  }
  if (ast.data?.workingStorageSection?.items) {
    return ast.data.workingStorageSection.items;
  }
  if (ast.data?.workingStorageSection && Array.isArray(ast.data.workingStorageSection)) {
    return ast.data.workingStorageSection;
  }
  if (ast.workingStorage && Array.isArray(ast.workingStorage)) {
    return ast.workingStorage;
  }
  return [];
}

function isLevel(item, n) {
  return item.level === n || item.level === String(n).padStart(2, '0') || item.level === String(n);
}

function escapeScalaString(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Scala literal for an elementary item's initial value: honors the VALUE
 * clause (numeric/string/figurative-ZERO/figurative-SPACE) when present,
 * otherwise falls back to the COBOL default-initialization value for the
 * type (numeric 0, alphanumeric empty/spaces).
 */
function defaultElementaryValue(item, scalaType) {
  const raw = item.value;
  let literalKind = null; // 'numeric' | 'string'
  let literalText = null;

  if (raw && typeof raw === 'object') {
    if (raw.type === 'numeric') {
      literalKind = 'numeric';
      literalText = String(raw.value);
    } else if (raw.type === 'string') {
      literalKind = 'string';
      literalText = String(raw.value ?? '');
    } else if (raw.type === 'figurative') {
      if (raw.value === 'ZERO') {
        literalKind = 'numeric';
        literalText = '0';
      } else if (raw.value === 'SPACE') {
        literalKind = 'string';
        literalText = '';
      }
    }
  }

  if (scalaType === 'String') {
    if (literalKind === 'string') return `"${escapeScalaString(literalText)}"`;
    if (literalKind === 'numeric') return `"${escapeScalaString(literalText)}"`;
    return '""';
  }
  if (scalaType === 'BigDecimal') {
    if (literalKind === 'numeric') return `BigDecimal("${literalText}")`;
    return 'BigDecimal(0)';
  }
  if (scalaType === 'Long') {
    if (literalKind === 'numeric') return `${normalizeIntLiteralText(literalText)}L`;
    return '0L';
  }
  if (scalaType === 'Float') {
    if (literalKind === 'numeric') return `${literalText}f`;
    return '0.0f';
  }
  if (scalaType === 'Double') {
    if (literalKind === 'numeric') return `${literalText}d`;
    return '0.0';
  }
  // Int (default)
  if (literalKind === 'numeric') return normalizeIntLiteralText(literalText);
  return '0';
}

function normalizeIntLiteralText(raw) {
  const m = /^-?\d+/.exec(String(raw));
  return m ? m[0] : '0';
}

/**
 * Generate the accessor (`def`/`def_=`) pairs for a REDEFINES entry.
 *
 * - Elementary REDEFINES (no children): a plain pass-through alias onto the
 *   redefined target's flat var.
 * - Group REDEFINES (children): each child slices a fixed-width run of
 *   decimal digits out of the target's numeric value (e.g. WS-YEAR/MONTH/DAY
 *   REDEFINES a PIC 9(8) WS-DATE-NUMERIC) - reading/writing a child reads or
 *   rewrites just its digit-slice of the shared target var, so a write
 *   through either view is visible through the other, matching COBOL
 *   REDEFINES storage-sharing semantics without needing real byte-level
 *   aliasing in Scala.
 */
function redefinesAccessorLines(item, registry) {
  const targetUpper = String(item.redefines || '').toUpperCase();
  const targetInfo = registry.get(targetUpper);
  const lines = [];

  if (!targetInfo) {
    lines.push(`  // REDEFINES ${item.redefines}: target not found - ${item.name} not accessible`);
    return lines;
  }

  const targetCamel = targetInfo.camel;
  const realChildren = (item.children || []).filter(c => !isLevel(c, 88));

  if (realChildren.length === 0) {
    // Elementary REDEFINES: direct alias onto the target's storage.
    const camel = toCamelCase(item.name);
    lines.push(`  def ${camel}: ${targetInfo.scalaType} = ${targetCamel}`);
    lines.push(`  def ${camel}_=(v: ${targetInfo.scalaType}): Unit = ${targetCamel} = v`);
    registry.set((item.name || '').toUpperCase(), { ...targetInfo, camel });
    return lines;
  }

  // Group REDEFINES: children slice the target's decimal digits left-to-right.
  const widths = realChildren.map(c => (c.pic && c.pic.integerDigits) || 0);
  for (let i = 0; i < realChildren.length; i++) {
    const child = realChildren[i];
    const camel = toCamelCase(child.name);
    const w = widths[i];
    const r = widths.slice(i + 1).reduce((a, b) => a + b, 0);
    const modBase = 10 ** w;
    const divBase = 10 ** r;
    lines.push(`  def ${camel}: Int = ((${targetCamel} / ${divBase}) % ${modBase}).toInt`);
    lines.push(
      `  def ${camel}_=(v: Int): Unit = ${targetCamel} = ${targetCamel} - (((${targetCamel} / ${divBase}) % ${modBase}) * ${divBase}) + (v * ${divBase})`
    );

    const childPic = child.pic && typeof child.pic === 'object' ? child.pic : null;
    registry.set((child.name || '').toUpperCase(), {
      camel,
      scalaType: 'Int',
      dataType: 'numeric',
      integerDigits: w,
      decimalDigits: 0,
      signed: !!(childPic && childPic.signed),
      editPattern: null,
      occursDepth: 0,
    });
  }

  return lines;
}

/**
 * Flatten every WORKING-STORAGE item (at any nesting depth) into:
 *   - `lines`: Scala `var`/accessor declarations for the object body, and
 *   - `registry`: COBOL name (uppercased) -> field metadata, used by
 *     expression-gen.js to render subscripted references, MOVE/DISPLAY
 *     numeric-edit formatting, and DIVIDE decimal coercion.
 *
 * COBOL's flat namespace means every addressable item - whether a top-level
 * 01/77 elementary item or a child nested inside a group - gets its own
 * Scala identifier named after itself (not qualified by its parent group);
 * OCCURS at any ancestor level (including the item's own OCCURS, for
 * multi-dimensional tables like OCCURS-within-OCCURS) wraps the type in one
 * Vector[...] layer per occurs-bearing level, outer dimension first, so
 * `WS-COL(WS-I, WS-J)` becomes `wsCol(wsI - 1)(wsJ - 1)` against a flat
 * `var wsCol: Vector[Vector[Int]]`. FILLER items are skipped (COBOL forbids
 * referencing them from the PROCEDURE DIVISION). Case classes are still
 * generated separately (generateAllCaseClasses) for record-layout purposes;
 * they are independent of - and never referenced by - these flat vars.
 */
function buildFieldRegistry(ast) {
  const items = getWorkingStorageItems(ast);
  const registry = new Map();
  const lines = [];

  function walk(list, occursChain) {
    for (const item of list) {
      if (isLevel(item, 88)) continue;

      if (item.redefines) {
        const accessorLines = redefinesAccessorLines(item, registry);
        if (accessorLines.length) lines.push(...accessorLines);
        continue;
      }

      const realChildren = (item.children || []).filter(c => !isLevel(c, 88));
      if (realChildren.length > 0) {
        const ownCount = hasOccurs(item) && occursCount(item) > 1 ? occursCount(item) : null;
        walk(realChildren, ownCount ? [...occursChain, ownCount] : occursChain);
        continue;
      }

      if (item.isFiller || !item.name) continue;

      const ownCount = hasOccurs(item) && occursCount(item) > 1 ? occursCount(item) : null;
      const fullChain = ownCount ? [...occursChain, ownCount] : occursChain;

      const camel = toCamelCase(item.name);
      const baseType = scalaBaseType(item);
      let scalaType = baseType;
      for (let i = 0; i < fullChain.length; i++) scalaType = `Vector[${scalaType}]`;

      let defaultExpr = defaultElementaryValue(item, baseType);
      for (let i = fullChain.length - 1; i >= 0; i--) {
        defaultExpr = `Vector.fill(${fullChain[i]})(${defaultExpr})`;
      }

      lines.push(`  var ${camel}: ${scalaType} = ${defaultExpr}`);

      const pic = item.pic && typeof item.pic === 'object' ? item.pic : null;
      registry.set((item.name || '').toUpperCase(), {
        camel,
        scalaType: baseType,
        dataType: pic?.dataType || (baseType === 'String' ? 'alphanumeric' : 'numeric'),
        integerDigits: pic?.integerDigits || 0,
        decimalDigits: pic?.decimalDigits || 0,
        signed: !!(pic && pic.signed),
        editPattern: pic?.editPattern || null,
        occursDepth: fullChain.length,
      });
    }
  }

  walk(items, []);

  return { lines: lines.join('\n'), registry };
}

/**
 * Generate case classes from COBOL records
 * Handles multiple parser output formats
 */
function generateAllCaseClasses(ast, indent = 0, options = {}) {
  const classes = [];

  function processItems(items) {
    if (!items) return;
    for (const item of items) {
      if ((item.level === 1 || item.level === '01' || item.level === 1) &&
          item.children && item.children.length > 0) {
        classes.push(generateCaseClass(item, indent, options));
      }
    }
  }

  function processFileSection(fileSection) {
    if (!fileSection) return;
    const files = fileSection.files || fileSection;
    if (!Array.isArray(files)) return;

    for (const fd of files) {
      if (fd.record) {
        classes.push(generateCaseClass(fd.record, indent, options));
      }
      if (fd.records) {
        for (const record of fd.records) {
          classes.push(generateCaseClass(record, indent, options));
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

  // Flatten WORKING-STORAGE into Scala var/accessor declarations plus a
  // name -> metadata registry, and hand the registry to expression-gen.js
  // so subscripted references, MOVE/DISPLAY numeric-edit formatting, and
  // DIVIDE decimal coercion can all look field info up by COBOL name. Must
  // happen before generateMethods()/generateMainMethod() below, since those
  // generate the statements that consult the registry.
  const { lines: workingFields, registry: fieldRegistry } = buildFieldRegistry(ast);
  setFieldRegistry(fieldRegistry);

  // Package declaration
  sections.push(generatePackageDeclaration(opts.packageName));
  sections.push('');

  // Imports
  const imports = generateImports(ast, opts);
  if (imports) {
    sections.push(imports);
    sections.push('');
  }

  // Embedded CobolCodecs runtime (see DEFAULT_OPTIONS.embedRuntime above).
  if (opts.embedRuntime) {
    sections.push('// --- Embedded runtime: CobolCodecs (see runtime/CobolCodecs.scala) ---');
    sections.push('// Inlined because embedRuntime: true (the default), so this file is a');
    sections.push('// self-contained `scala-cli run` script. Pass embedRuntime: false to instead');
    sections.push('// `import com.thyraa.cobol.runtime.CobolCodecs` from a shared multi-file build.');
    sections.push(COBOL_CODECS_SOURCE);
    sections.push('');
  }

  // CobolFmt: numeric DISPLAY formatting helper (sign + zero-padding per
  // PIC integer/decimal digit counts) used by generated DISPLAY statements.
  sections.push('// CobolFmt: numeric DISPLAY formatting (sign + zero-padding per PIC)');
  sections.push(generateCobolFmtHelper());
  sections.push('');

  // Generate case classes (outside the object for better organization)
  const caseClasses = generateAllCaseClasses(ast, 0, { charset: opts.charset });
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

  // Working storage fields (flattened elementary vars + REDEFINES accessors)
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
