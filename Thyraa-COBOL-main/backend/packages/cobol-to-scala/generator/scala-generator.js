/**
 * scala-generator.js
 * Main generator that coordinates full COBOL to Scala conversion
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toPascalCase, toCamelCase, generateCaseClass, collectAmbiguousGroupClassNames } from './case-class-gen.js';
import { getPicPattern, scalaBaseType, occursCount, hasOccurs, itemByteLength } from './layout.js';
import { generateAllEnums, groupLevel88sByParent } from './enum-gen.js';
import {
  generateExpression,
  setFieldRegistry,
  setTableRegistry,
  setGroupRegistry,
  setGroupByteLengthRegistry,
  setSortFileRegistry,
  setQualifiedRegistry,
  setConditionRegistry,
  setAmbiguousGroupClassNames,
  setDecimalPointIsComma,
  setRecordFileRegistry,
  setAdvancingFiles as setAdvancingFilesExpr,
  setFileStatusRegistry as setFileStatusRegistryExpr,
  setCallProgramRegistry,
  generateCobolFmtHelper,
  generateCobolInspectHelper,
  generateCobolUnstringHelper,
  formatEditedPicture,
  isRegisteredGroupName,
  resolveGroupKey,
  groupDisplayValueExpr,
  scatterGroupFromString,
} from './expression-gen.js';
import {
  generateMethod,
  generateAllMethods,
  toMethodName,
  flattenProcedureUnits,
  collectAmbiguousParagraphNames,
  generateProgramFlowLines,
} from './method-gen.js';
import {
  generateFileIO,
  generateFileStatusCheck,
  generateFileHandleDeclarations,
  setAdvancingFiles as setAdvancingFilesFileIO,
  setFileStatusRegistry as setFileStatusRegistryFileIO,
} from './file-io-gen.js';
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
  if (ast.environmentDivision?.fileControls?.length > 0) {
    return true;
  }
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
 * FILE-CONTROL entries (SELECT ... ASSIGN TO ...) from the ENVIRONMENT
 * DIVISION - the only place a file's on-disk path comes from. Handles both
 * this parser's actual shape (`ast.environmentDivision.fileControls`, from
 * parser/index.js's parseEnvironmentDivision - now wired into the root
 * index.js's parseCobol, round-5 finding 1a) and the never-actually-produced
 * `ast.environment.inputOutput.fileControl` shape this file's functions
 * previously (and only ever) checked, kept as a fallback in case some other
 * caller supplies that shape directly.
 */
function getFileControls(ast) {
  if (Array.isArray(ast.environmentDivision?.fileControls) && ast.environmentDivision.fileControls.length > 0) {
    return ast.environmentDivision.fileControls;
  }
  return ast.environment?.inputOutput?.fileControl || [];
}

/**
 * Generate file path constants from file control
 */
function generateFileConstants(ast, indent = 1) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const fileControl = getFileControls(ast);

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

/**
 * Collect every FD/SD record (01-level DataItem) in the FILE SECTION,
 * regardless of parser output shape. Used so SORT work-file records (e.g. an
 * SD's 01 SORT-REC) get flattened into addressable flat vars the same way
 * WORKING-STORAGE items are - RELEASE/RETURN/plain statement generation all
 * address record fields (SORT-KEY, SORT-NAME, ...) by their COBOL name, same
 * as any other elementary item.
 */
function getFileSectionRecordItems(ast) {
  const files = ast.dataItems?.fileSection?.files || ast.data?.fileSection?.files || [];
  const records = [];
  for (const f of files) {
    if (Array.isArray(f.records)) records.push(...f.records);
  }
  return records;
}

/**
 * Collect every 01-level item in the LINKAGE SECTION, regardless of parser
 * output shape (mirrors getWorkingStorageItems). round-7 finding 1: a called
 * subprogram's PROCEDURE DIVISION references its LINKAGE SECTION items
 * exactly like ordinary WORKING-STORAGE fields, but buildFieldRegistry never
 * walked them at all before this fix - LINKAGE SECTION support didn't exist,
 * since no corpus program before round-7 declared one. Folding these into
 * the exact same flattened-var + FIELD_REGISTRY walk as WORKING-STORAGE
 * items get is what lets generateEntryMethod's own registry lookups (and
 * every ordinary statement inside the callee's own PROCEDURE DIVISION that
 * references a LINKAGE item by name) resolve correctly.
 */
function getLinkageSectionItems(ast) {
  if (ast.dataItems?.linkageSection?.items) return ast.dataItems.linkageSection.items;
  if (ast.data?.linkageSection?.items) return ast.data.linkageSection.items;
  if (ast.linkageSection && Array.isArray(ast.linkageSection)) return ast.linkageSection;
  return [];
}

function isLevel(item, n) {
  return item.level === n || item.level === String(n).padStart(2, '0') || item.level === String(n);
}

function escapeScalaString(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Fit a plain (compile-time-known) string to a fixed width the same way
 * CobolFmt.fitLeft/fitRight do at runtime (see expression-gen.js's
 * generateCobolFmtHelper) - used for a VALUE clause literal, which COBOL
 * space-pads/truncates to the item's own declared PIC width (and
 * left-pads/truncates-left instead when the item is JUSTIFIED RIGHT) at
 * *initialization* time, not just at MOVE time.
 */
function fitAlphanumericText(text, width, justifiedRight) {
  const s = String(text ?? '');
  if (!width || width <= 0) return s;
  if (s.length >= width) {
    return justifiedRight ? s.slice(s.length - width) : s.slice(0, width);
  }
  const pad = ' '.repeat(width - s.length);
  return justifiedRight ? pad + s : s + pad;
}

/**
 * Truncate a numeric literal's text to an item's own declared integer/decimal
 * digit counts, exactly as COBOL truncates (never rounds) a VALUE clause (or
 * a MOVE - see expression-gen.js's CobolFmt.truncNumeric, the runtime
 * equivalent for non-literal MOVE sources) that supplies more digits than the
 * receiving item's PICTURE can hold: excess low-order decimal digits are
 * dropped, excess high-order integer digits are dropped (sign preserved).
 */
function truncateNumericLiteralText(raw, integerDigits, decimalDigits) {
  const s = String(raw ?? '0');
  const neg = s.startsWith('-');
  const unsigned = s.replace(/^[+-]/, '');
  const dot = unsigned.indexOf('.');
  let intPart = dot === -1 ? unsigned : unsigned.slice(0, dot);
  let decPart = dot === -1 ? '' : unsigned.slice(dot + 1);

  if (typeof decimalDigits === 'number' && decimalDigits >= 0) {
    decPart = decPart.slice(0, decimalDigits);
  }
  if (typeof integerDigits === 'number' && integerDigits >= 0 && intPart.length > integerDigits) {
    intPart = intPart.slice(intPart.length - integerDigits);
  }

  const sign = neg ? '-' : '';
  return decPart.length > 0 ? `${sign}${intPart}.${decPart}` : `${sign}${intPart || '0'}`;
}

/**
 * Scala literal for an elementary item's initial value: honors the VALUE
 * clause (numeric/string/figurative-ZERO/figurative-SPACE) when present,
 * otherwise falls back to the COBOL default-initialization value for the
 * type (numeric 0, alphanumeric empty/spaces). A VALUE clause is fitted to
 * the item's own declared width/digit-counts exactly as COBOL does at
 * initialization (see fitAlphanumericText/truncateNumericLiteralText above) -
 * this matters because later MOVEs that read this item as a *source* trust
 * its stored value to already be at its full declared width/precision (see
 * expression-gen.js's renderVariableMoveSource).
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

  const pic = item.pic && typeof item.pic === 'object' ? item.pic : null;

  if (scalaType === 'String') {
    // A numeric-edited item's own VALUE clause (or lack of one) must go
    // through the same PICTURE-edit formatting a MOVE into it would apply
    // (formatEditedPicture) - not the plain alphanumeric fit/pad below -
    // COBOL performs numeric-edit formatting at *initialization* time too,
    // not only at MOVE time (round-5 finding 3/s11: DISPLAY of an edited
    // item declared with a VALUE clause showed the literal's own raw text,
    // e.g. "7.5" for `PIC ZZ9.99 VALUE 7.5`, instead of the PICTURE-formatted
    // "  7.50" cobc actually stores/displays).
    if (pic?.dataType === 'edited' && pic?.editPattern) {
      const rawForEdit = literalKind === 'numeric' || literalKind === 'string' ? literalText : '0';
      return `"${escapeScalaString(formatEditedPicture(pic.editPattern, rawForEdit, !!item.blankWhenZero))}"`;
    }
    if (literalKind === 'string' || literalKind === 'numeric') {
      const width = pic?.length || 0;
      const justifiedRight = String(item.justified || '').toUpperCase() === 'RIGHT';
      return `"${escapeScalaString(fitAlphanumericText(literalText, width, justifiedRight))}"`;
    }
    return '""';
  }
  if (scalaType === 'BigDecimal') {
    if (literalKind === 'numeric') {
      return `BigDecimal("${truncateNumericLiteralText(literalText, pic?.integerDigits, pic?.decimalDigits)}")`;
    }
    return 'BigDecimal(0)';
  }
  if (scalaType === 'Long') {
    if (literalKind === 'numeric') {
      return `${normalizeIntLiteralText(truncateNumericLiteralText(literalText, pic?.integerDigits, 0))}L`;
    }
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
  if (literalKind === 'numeric') {
    return normalizeIntLiteralText(truncateNumericLiteralText(literalText, pic?.integerDigits, 0));
  }
  return '0';
}

function normalizeIntLiteralText(raw) {
  const m = /^-?\d+/.exec(String(raw));
  return m ? m[0] : '0';
}

/**
 * round-8 finding 4: a group-level VALUE clause (`01 WS-REC VALUE
 * "AB1234". 05 WS-CODE PIC X(2). 05 WS-NUM PIC 9(4).`) initializes the
 * group's *storage bytes* as a whole - cobc lays the literal down across
 * the group's full declared width (space-padding on the right when the
 * literal is shorter, exactly like an elementary alphanumeric VALUE - see
 * fitAlphanumericText) - and every child with no VALUE clause of its own
 * simply reads back whichever slice of those bytes falls at its own
 * position, the same way a REDEFINES child does (see
 * characterSlicedGroupRedefinesLines below, the sibling mechanism for a
 * REDEFINES-declared alias over the same bytes). This computes that raw
 * "storage text" for one item's *own* VALUE clause (figurative constants
 * ZERO/SPACE included), fitted/truncated to `width` bytes - callers pass it
 * down through buildFieldRegistry's walk() as `parentValueText` so a
 * VALUE-less descendant (leaf or nested group, arbitrarily deep) can slice
 * out its own span. Returns null when the item has no VALUE clause at all
 * (the ordinary case), leaving the caller's own inherited-from-an-ancestor
 * text, if any, as the fallback.
 */
function ownValueStorageText(item, width) {
  const v = item.value;
  if (!v || typeof v !== 'object') return null;
  let text = null;
  if (v.type === 'string') text = String(v.value ?? '');
  else if (v.type === 'numeric') text = String(v.value);
  else if (v.type === 'figurative') {
    if (v.value === 'SPACE') text = '';
    else if (v.value === 'ZERO') text = '0';
  }
  if (text == null) return null;
  return fitAlphanumericText(text, width, false);
}

/**
 * round-8 finding 4 (continued): the actual per-leaf/per-FILLER Scala
 * initializer, combining an item's own VALUE clause (defaultElementaryValue,
 * unchanged and always taking priority) with `inheritedSlice` - the bytes
 * this item's own span occupies within the nearest VALUE-bearing ancestor
 * group's storage text, computed by buildFieldRegistry's walk() (null when
 * there is no such ancestor, e.g. the overwhelmingly common case of a group
 * with no group-level VALUE clause at all - behavior is then identical to
 * plain defaultElementaryValue).
 *
 * The inherited slice is reused by constructing a synthetic VALUE clause
 * (`{ type: 'string'|'numeric', value: ... }`) and handing it to the exact
 * same defaultElementaryValue this item would already go through for its
 * own VALUE clause, so every existing width/justify/edited-picture rule
 * applies identically instead of being re-implemented:
 *   - String target: the slice is already exactly this item's own declared
 *     width (buildFieldRegistry's walk() sliced it that way), so it passes
 *     through as a string VALUE clause unchanged (still routed through
 *     fitAlphanumericText/JUSTIFIED RIGHT handling for symmetry with every
 *     other VALUE-clause path).
 *   - Numeric target: COBOL's DISPLAY-numeric storage is just the item's
 *     digit characters with no punctuation (V is implied, never stored), so
 *     the slice is only usable when it is *purely* digits - a group VALUE
 *     literal shorter than the full group width space-pads the remainder
 *     (see ownValueStorageText/fitAlphanumericText), and a numeric child
 *     landing entirely or partly on that padding sees spaces, which are not
 *     valid digit text; falling back to defaultElementaryValue's ordinary
 *     zero-default in that case is exactly COBOL's own behavior for a
 *     VALUE-less numeric item. When the slice is pure digits, the implied
 *     decimal point is reinserted at this item's own declared
 *     integerDigits/decimalDigits split before handing it to
 *     defaultElementaryValue as a numeric VALUE clause.
 *   - OCCURS items and any item whose own VALUE clause is already present
 *     never reach the inheritance branch at all (see buildFieldRegistry's
 *     walk(), which only computes a non-null inheritedSlice for a
 *     VALUE-less, non-OCCURS item).
 */
function defaultElementaryValueWithInheritance(item, scalaType, inheritedSlice) {
  if (item.value || inheritedSlice == null) return defaultElementaryValue(item, scalaType);

  if (scalaType === 'String') {
    return defaultElementaryValue({ ...item, value: { type: 'string', value: inheritedSlice } }, scalaType);
  }

  if (!/^\d+$/.test(inheritedSlice)) return defaultElementaryValue(item, scalaType);

  const pic = item.pic && typeof item.pic === 'object' ? item.pic : null;
  const intDigits = pic?.integerDigits ?? inheritedSlice.length;
  const decDigits = pic?.decimalDigits || 0;
  const numericText = decDigits > 0
    ? `${inheritedSlice.slice(0, intDigits)}.${inheritedSlice.slice(intDigits)}`
    : inheritedSlice;
  return defaultElementaryValue({ ...item, value: { type: 'numeric', value: numericText } }, scalaType);
}

/**
 * Character-sliced group REDEFINES: used whenever the redefined target is
 * alphanumeric (String) - including REDEFINES over an OCCURS table (e.g.
 * `01 WS-TABLE-VIEW REDEFINES WS-FLAT-VIEW. 05 WS-CHUNK OCCURS 3 TIMES PIC
 * X(4).` over a PIC X(12) WS-FLAT-VIEW). Each child occupies a fixed run of
 * *characters* (not decimal digits - see the numeric sibling path in
 * redefinesAccessorLines, which is only meaningful when the target is
 * itself numeric), left to right; a child with an OCCURS clause becomes a
 * `Vector[String]` accessor whose elements are equal-width character slices
 * of its own span. Both the getter and setter are plain `def`s (not a raw
 * `var`), so `wsChunk(i)` (read) and `wsChunk = wsChunk.updated(i, v)`
 * (write - see renderAssignment) both work exactly as if `wsChunk` were a
 * real `Vector[String]` var, while the *actual* storage stays the shared
 * target String.
 */
function characterSlicedGroupRedefinesLines(realChildren, targetCamel, registry) {
  const lines = [];
  let offset = 0;

  for (const child of realChildren) {
    const camel = toCamelCase(child.name);
    const count = hasOccurs(child) && occursCount(child) > 1 ? occursCount(child) : 1;
    const elementWidth = child.pic && typeof child.pic === 'object' ? (child.pic.length || 0) : 0;
    const totalWidth = elementWidth * count;
    const start = offset;
    const end = offset + totalWidth;
    offset = end;

    if (count > 1) {
      lines.push(`  def ${camel}: Vector[String] =`);
      lines.push(
        `    (0 until ${count}).map(i => ${targetCamel}.substring(${start} + i * ${elementWidth}, ${start} + (i + 1) * ${elementWidth})).toVector`
      );
      lines.push(`  def ${camel}_=(v: Vector[String]): Unit =`);
      lines.push(
        `    ${targetCamel} = ${targetCamel}.substring(0, ${start}) + (0 until ${count}).map(i => CobolFmt.fitLeft(v(i), ${elementWidth})).mkString + ${targetCamel}.substring(${end})`
      );
      registry.set((child.name || '').toUpperCase(), {
        camel,
        scalaType: 'String',
        dataType: 'alphanumeric',
        integerDigits: 0,
        decimalDigits: 0,
        signed: false,
        editPattern: null,
        occursDepth: 1,
        picLength: elementWidth,
        justified: false,
        blankWhenZero: false,
      });
    } else {
      lines.push(`  def ${camel}: String = ${targetCamel}.substring(${start}, ${end})`);
      lines.push(
        `  def ${camel}_=(v: String): Unit = ${targetCamel} = ${targetCamel}.substring(0, ${start}) + CobolFmt.fitLeft(v, ${elementWidth}) + ${targetCamel}.substring(${end})`
      );
      // A character-sliced child can itself be numeric-dataType (a PIC 9
      // child of a group REDEFINES over a flat/String target, or - see
      // groupOverGroupRedefinesLines, round-3 finding 6 - a numeric child of
      // a synthetic group-over-group flat view) even though its own storage
      // is represented as a Scala String here; DISPLAY (renderDisplayOperand)
      // keys off `dataType === 'numeric'` to decide whether to route through
      // CobolFmt.num(..., integerDigits, decimalDigits, ...) - leaving both
      // hardcoded at 0 (the pre-fix behavior) rendered every such numeric
      // child as an empty string (0 total digits) instead of its actual
      // value, since this branch was previously only ever exercised with
      // alphanumeric children.
      const childPic = child.pic && typeof child.pic === 'object' ? child.pic : null;
      const childDataType = (childPic && childPic.dataType) || 'alphanumeric';
      registry.set((child.name || '').toUpperCase(), {
        camel,
        scalaType: 'String',
        dataType: childDataType,
        integerDigits: childDataType === 'numeric' ? (childPic?.integerDigits || elementWidth) : 0,
        decimalDigits: childDataType === 'numeric' ? (childPic?.decimalDigits || 0) : 0,
        signed: !!(childPic && childPic.signed),
        editPattern: null,
        occursDepth: 0,
        picLength: elementWidth,
        justified: String(child.justified || '').toUpperCase() === 'RIGHT',
        blankWhenZero: false,
      });
    }
  }

  return lines;
}

/**
 * Generate the accessor (`def`/`def_=`) pairs for a REDEFINES entry.
 *
 * - Elementary REDEFINES (no children): a plain pass-through alias onto the
 *   redefined target's flat var.
 * - Group REDEFINES over a NUMERIC target (children): each child slices a
 *   fixed-width run of decimal digits out of the target's numeric value
 *   (e.g. WS-YEAR/MONTH/DAY REDEFINES a PIC 9(8) WS-DATE-NUMERIC) - reading/
 *   writing a child reads or rewrites just its digit-slice of the shared
 *   target var, so a write through either view is visible through the
 *   other, matching COBOL REDEFINES storage-sharing semantics without
 *   needing real byte-level aliasing in Scala.
 * - Group REDEFINES over an ALPHANUMERIC target (children): see
 *   characterSlicedGroupRedefinesLines above - character-position slicing,
 *   including REDEFINES over an OCCURS table.
 */
function redefinesAccessorLines(item, registry, siblingList) {
  const targetUpper = String(item.redefines || '').toUpperCase();
  const targetInfo = registry.get(targetUpper);
  const lines = [];

  if (!targetInfo) {
    // The target has no flat-var registry entry of its own - either it
    // genuinely doesn't exist (typo/bad COBOL), or (round-3 finding 6) it's
    // a GROUP: a group never gets an elementary registry entry (only its own
    // *children* do - see the walk() call site below), yet REDEFINES a
    // group-level item is completely ordinary COBOL (e.g. reshuffling a
    // date group's YEAR/MONTH/DAY into a differently-shaped view, or a view
    // containing an OCCURS). The pre-fix behavior left every one of this
    // redefining item's own children entirely undeclared - a hard compile
    // error the moment the generated program referenced any of them, not
    // merely a missing-alias comment. REDEFINES requires the target to be
    // the immediately-preceding same-level item in this same list (COBOL
    // rule), so it's always findable in `siblingList`.
    const targetItem = (siblingList || []).find(i => !isLevel(i, 88) && (i.name || '').toUpperCase() === targetUpper);
    const targetRealChildren = targetItem ? (targetItem.children || []).filter(c => !isLevel(c, 88)) : [];
    if (targetItem && targetRealChildren.length > 0) {
      return groupOverGroupRedefinesLines(item, targetItem, registry);
    }
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

  if (targetInfo.scalaType === 'String') {
    return characterSlicedGroupRedefinesLines(realChildren, targetCamel, registry);
  }

  if (!['Int', 'Long', 'BigDecimal'].includes(targetInfo.scalaType)) {
    // Not a plain integer-or-BigDecimal numeric target and not String (e.g.
    // Float/Double from COMP-1/COMP-2) - the digit-slicing arithmetic below
    // assumes `/`, `%`, `*`, `-`, `+` over the target's own Scala numeric
    // type, and character-slicing above assumes String; a group REDEFINES
    // over anything else is genuinely infeasible to model with this
    // generator's flat-var representation. Emit a visible marker that still
    // compiles rather than silently-wrong numeric-view code.
    lines.push(
      `  // REDEFINES ${item.redefines}: ??? TODO - group REDEFINES over a ${targetInfo.scalaType} target is not supported; ${item.name}'s children are not accessible`
    );
    return lines;
  }

  // Group REDEFINES over a numeric (Int/Long/BigDecimal) target: children
  // slice the target's decimal digits left-to-right. BigDecimal supports the
  // same `/`/`%`/`*`/`-`/`+` operators used below, so no separate branch is
  // needed for a COMP-3 (or other BigDecimal-typed) whole-number target.
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
      picLength: 0,
      justified: false,
      blankWhenZero: false,
    });
  }

  return lines;
}

/**
 * Recursively flatten a REDEFINES target GROUP's own real (non-88, named)
 * children into a flat, ordered list of leaf descriptors suitable for
 * building a synthetic "flat character view" over them (see
 * groupOverGroupRedefinesLines) - or `null` when this concatenation model
 * can't represent the shape at all: a FILLER (an inert byte-width gap this
 * generator's flat-var model has no value for at all - unlike an ordinary
 * elementary item, nothing here tracks what bytes it actually holds), a
 * nested OCCURS-bearing group child, a numeric child with a SIGN (real
 * signed DISPLAY storage overpunches the sign into the last digit's zone
 * nibble - modeling that correctly here would need byte-level codecs, not
 * plain digit-text concatenation), an OCCURS-bearing *numeric* child (this
 * model only tiles character/String elements), or any child whose Scala
 * type isn't one of Int/String (Float/Double/Long from COMP-1/COMP-2/
 * 9-18-digit fields - out of scope, same as the numeric-sibling REDEFINES
 * branch above).
 */
function flattenRedefinesLeaves(groupItem) {
  const leaves = [];
  function walk(children) {
    for (const child of children) {
      if (isLevel(child, 88)) continue;
      if (child.isFiller || !child.name) return false;
      const real = (child.children || []).filter(c => !isLevel(c, 88));
      if (real.length > 0) {
        if (hasOccurs(child)) return false;
        if (!walk(real)) return false;
        continue;
      }
      const baseType = scalaBaseType(child);
      if (baseType !== 'Int' && baseType !== 'String') return false;
      const pic = child.pic && typeof child.pic === 'object' ? child.pic : null;
      if (!pic || !pic.length) return false;
      if (baseType === 'Int' && pic.signed) return false;
      const count = hasOccurs(child) && occursCount(child) > 1 ? occursCount(child) : 1;
      if (count > 1 && baseType !== 'String') return false;
      leaves.push({
        camel: toCamelCase(child.name),
        baseType,
        count,
        elementWidth: pic.length,
        totalWidth: pic.length * count,
        intDigits: pic.integerDigits || pic.length,
      });
    }
    return true;
  }
  const ok = walk((groupItem.children || []).filter(c => !isLevel(c, 88)));
  return ok ? leaves : null;
}

/**
 * Declare every one of a REDEFINES entry's own children as a compiling but
 * honestly-unimplemented `def`/`def_=` pair - used only when
 * flattenRedefinesLeaves reports the target group's shape isn't one this
 * generator's character-concatenation view can represent (see its doc
 * comment). The getter throws `NotImplementedError` only if actually
 * *read* at runtime (never at declaration time - a `def`, not a `var` with
 * an eagerly-evaluated `???` initializer, which would crash every program
 * containing this fallback regardless of whether the field is ever
 * touched); the setter silently discards a write rather than also risking a
 * crash on the (very plausible) MOVE-before-first-read pattern. This is
 * strictly better than the pre-fix behavior (no declaration at all - a hard
 * compile error the instant the field was referenced anywhere).
 */
function todoStubRedefinesLines(redefiningItem, registry) {
  const lines = [];
  function walk(children) {
    for (const child of children) {
      if (isLevel(child, 88) || child.isFiller || !child.name) continue;
      const real = (child.children || []).filter(c => !isLevel(c, 88));
      if (real.length > 0) {
        walk(real);
        continue;
      }
      const camel = toCamelCase(child.name);
      const baseType = scalaBaseType(child);
      lines.push(
        `  // REDEFINES ${redefiningItem.redefines}: ??? TODO - this group-over-group REDEFINES shape ` +
        `(FILLER gap / nested OCCURS / signed numeric / unsupported type) is not supported; ${child.name} ` +
        `is declared but not aliased to real storage`
      );
      lines.push(`  def ${camel}: ${baseType} = ??? // TODO REDEFINES ${redefiningItem.redefines}: unsupported group shape`);
      lines.push(`  def ${camel}_=(v: ${baseType}): Unit = () // TODO REDEFINES ${redefiningItem.redefines}: write discarded (unsupported group shape)`);
      registry.set((child.name || '').toUpperCase(), {
        camel,
        scalaType: baseType,
        dataType: baseType === 'String' ? 'alphanumeric' : 'numeric',
        integerDigits: (child.pic && child.pic.integerDigits) || 0,
        decimalDigits: (child.pic && child.pic.decimalDigits) || 0,
        signed: !!(child.pic && child.pic.signed),
        editPattern: null,
        occursDepth: 0,
        picLength: (child.pic && child.pic.length) || 0,
        justified: false,
        blankWhenZero: false,
      });
    }
  }
  walk((redefiningItem.children || []).filter(c => !isLevel(c, 88)));
  return lines;
}

/**
 * Group-over-group REDEFINES (round-3 finding 6): `item.redefines` names
 * another GROUP (not a plain elementary item - the case redefinesAccessorLines
 * otherwise handles), which has no single flat Scala var of its own to alias
 * onto. Synthesizes one: a `<item>BaseFlat` getter/setter pair that
 * concatenates/redistributes the *target* group's own already-registered
 * children's display text (numeric children zero-padded to their own digit
 * width via CobolFmt.digitsOf, alphanumeric children fitted to their own
 * width via CobolFmt.fitLeft - the exact same convention MOVE numeric-to-
 * alphanumeric already uses), then reuses characterSlicedGroupRedefinesLines
 * completely unchanged for the redefining item's own children, exactly as if
 * `<item>BaseFlat` were a real flat String var - Scala's setter-call sugar
 * (`foo = x` desugars to `foo_=(x)` whenever both a `def foo` and a
 * `def foo_=` are in scope) makes a getter/setter pair usable as a plain
 * variable reference to that helper's generated code without any changes to
 * it at all.
 */
function groupOverGroupRedefinesLines(item, targetItem, registry) {
  const redefiningRealChildren = (item.children || []).filter(c => !isLevel(c, 88));
  const leaves = flattenRedefinesLeaves(targetItem);

  if (!leaves) {
    return todoStubRedefinesLines(item, registry);
  }

  const flatName = `${toCamelCase(item.name)}BaseFlat`;

  const getterParts = leaves.map(l => (l.baseType === 'String'
    ? (l.count > 1
      ? `${l.camel}.map(s => CobolFmt.fitLeft(s, ${l.elementWidth})).mkString`
      : `CobolFmt.fitLeft(${l.camel}, ${l.elementWidth})`)
    : `CobolFmt.digitsOf(BigDecimal(${l.camel}), ${l.intDigits}, 0)`));

  const setterLines = [];
  let offset = 0;
  for (const l of leaves) {
    const start = offset;
    const end = offset + l.totalWidth;
    offset = end;
    if (l.baseType === 'String' && l.count > 1) {
      setterLines.push(
        `    ${l.camel} = (0 until ${l.count}).map(i => v.substring(${start} + i * ${l.elementWidth}, ${start} + (i + 1) * ${l.elementWidth})).toVector`
      );
    } else if (l.baseType === 'String') {
      setterLines.push(`    ${l.camel} = CobolFmt.fitLeft(v.substring(${start}, ${end}), ${l.elementWidth})`);
    } else {
      setterLines.push(`    ${l.camel} = v.substring(${start}, ${end}).toInt`);
    }
  }

  const lines = [
    `  // REDEFINES ${item.redefines}: ${item.redefines} is a GROUP, not an elementary item - ${flatName}`,
    `  // is a synthetic flat-character view over its own children's storage (concatenated in`,
    `  // declaration order), so ${item.name}'s children below can character-slice it exactly`,
    `  // like a REDEFINES over a real PIC X target.`,
    `  def ${flatName}: String = ${getterParts.join(' + ')}`,
    `  def ${flatName}_=(v: String): Unit =`,
    ...setterLines,
  ];

  lines.push(...characterSlicedGroupRedefinesLines(redefiningRealChildren, flatName, registry));
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
/**
 * Count how many distinct elementary (leaf, non-88, non-FILLER) DataItem
 * nodes share each uppercased name anywhere in the given item trees. COBOL's
 * data names are a single flat namespace disambiguated only by OF/IN
 * qualification - two different groups are free to each declare a child
 * named e.g. NAME - so a name occurring more than once here cannot safely
 * become a single bare Scala identifier (buildFieldRegistry uses this to
 * decide which leaf names need parent-qualified identifiers instead).
 */
function countLeafNameOccurrences(itemLists) {
  const counts = new Map();
  function walk(list) {
    for (const item of list) {
      if (isLevel(item, 88) || item.isFiller || !item.name) continue;
      const realChildren = (item.children || []).filter(c => !isLevel(c, 88));
      if (realChildren.length > 0) {
        walk(realChildren);
        continue;
      }
      const upper = item.name.toUpperCase();
      counts.set(upper, (counts.get(upper) || 0) + 1);
    }
  }
  for (const list of itemLists) walk(list);
  return counts;
}

function buildFieldRegistry(ast) {
  const wsItems = getWorkingStorageItems(ast);
  const fileItems = getFileSectionRecordItems(ast);
  const linkageItems = getLinkageSectionItems(ast);
  const leafNameCounts = countLeafNameOccurrences([wsItems, fileItems, linkageItems]);
  const registry = new Map();
  const tableRegistry = new Map();
  const groupRegistry = new Map();
  // A group's own bare uppercased COBOL name -> its full ancestor-path key in
  // groupRegistry (see the groupKey computation below) - lets a caller that
  // only has a bare group name in hand (a MOVE/ADD CORRESPONDING source/
  // target, or a RELEASE/RETURN FROM/INTO reference - none of which carry
  // OF/IN qualification in the Phase 2 corpus) still resolve to the right
  // groupRegistry entry, without needing to know the item's full ancestor
  // chain itself. Last write wins for a bare name declared more than once
  // (only possible for a *nested* group, e.g. two different records each
  // declaring their own same-named nested group) - entry-point callers only
  // ever reference either a top-level record (always unique) or a
  // WORKING-STORAGE table-of-groups name (also unique in every corpus
  // program), so this ambiguity never actually arises at an entry point;
  // groupRegistry's own full-path keys (not this map) are what correctly
  // disambiguate the *recursive* case.
  const groupKeyRegistry = new Map();
  // group-item name (upper) -> total byte length of one occurrence (see
  // FUNCTION LENGTH(group-item) support in expression-gen.js's functionLength).
  const groupByteLengthRegistry = new Map();
  // "<name>::<immediate parent name>" (both upper) -> field info, for OF/IN
  // qualified references (e.g. `NAME OF WS-TARGET-GROUP`) - populated for
  // every leaf regardless of whether its bare name is globally ambiguous, so
  // a qualified reference always resolves correctly even when the bare name
  // happens to be unique too.
  const qualifiedRegistry = new Map();
  // 88-level condition name (upper) -> { info: <parent field's registry
  // info>, values: <Level88.values array> } - see the level88ConditionExpr
  // doc comment in expression-gen.js for how this drives IF/EVALUATE
  // condition-name generation.
  const conditionRegistry = new Map();
  const lines = [];
  const declaredIndexNames = new Set();
  // Unique per-program suffix for FILLER's hidden flat vars (see the leaf
  // FILLER branch below) - just needs to never collide with another FILLER
  // elsewhere in the same program, not to mean anything on its own.
  let fillerSeq = 0;

  // `ancestorNames` is the full chain of uppercased ancestor group names from
  // the top-level 01 item down to (but not including) the current item -
  // needed (not just the immediate parent) for two things: disambiguating a
  // leaf name that collides *even after* immediate-parent qualification (two
  // different top-level records each declaring their own same-named nested
  // group containing a same-named child, e.g. both with `05 DTL-GROUP. 10
  // QTY ...` - immediate-parent qualification alone produces the identical
  // `dtlGroupQty` identifier for both, a duplicate-var compile error - see
  // tests/corpus/proc/r13b-dupgroupname-iso.cbl), and resolving an OF/IN
  // qualifier that names an ancestor *above* the immediate parent (`QTY OF
  // WS-B`, skipping the intermediate DTL-GROUP level entirely - equally
  // valid, common COBOL).
  // round-8 finding 4: `parentValueText`, when non-null, is the raw storage
  // text of the nearest VALUE-bearing ancestor group enclosing this whole
  // `list` (already fitted/truncated to that ancestor's full byte width -
  // see ownValueStorageText) - `offset` (reset per walk() call, since each
  // invocation is scoped to one group's own children or the top-level item
  // list) tracks how many bytes of it this loop has consumed so far, so each
  // item can slice out exactly its own span for defaultElementaryValueWithInheritance
  // (leaf) or to pass further down as its own nested group's parentValueText
  // (see the group branch below). Stays undefined/null at the top level
  // (`walk(wsItems, [], [])` and friends) and for every ordinary group with
  // no group-level VALUE clause anywhere above it - the overwhelmingly common
  // case - so no existing (VALUE-less-group) behavior changes at all.
  function walk(list, occursChain, ancestorNames, parentValueText) {
    let offset = 0;
    for (const item of list) {
      if (isLevel(item, 88)) continue;

      // OCCURS metadata (times count, INDEXED BY names, ASCENDING/DESCENDING
      // KEY names) is recorded for every OCCURS-bearing item - elementary or
      // group - so SEARCH/SEARCH ALL generation can look up the table's
      // bounds/index/key by the table (group) name referenced in the SEARCH
      // statement. Each INDEXED BY name also becomes its own flat `Int` var
      // (COBOL indexes are addressable data items in their own right, used
      // both as subscripts and as ordinary MOVE/SET/DISPLAY operands).
      if (hasOccurs(item)) {
        const occ = item.occurs;
        const idxCamels = (occ.indexedBy || []).map(toCamelCase);
        tableRegistry.set((item.name || '').toUpperCase(), {
          times: occursCount(item),
          indexed: idxCamels,
          // Raw (uppercased) COBOL key names, not camelCased - SEARCH ALL
          // generation matches these against a WHEN condition's
          // VariableReference.name (also raw COBOL text), and only
          // camelCases when it needs an actual Scala identifier.
          ascending: (occ.ascending || []).map(n => String(n).toUpperCase()),
          descending: (occ.descending || []).map(n => String(n).toUpperCase()),
        });

        (occ.indexedBy || []).forEach((idxName, i) => {
          const upperIdx = String(idxName).toUpperCase();
          if (declaredIndexNames.has(upperIdx)) return;
          declaredIndexNames.add(upperIdx);
          lines.push(`  var ${idxCamels[i]}: Int = 1`);
          registry.set(upperIdx, {
            camel: idxCamels[i],
            scalaType: 'Int',
            dataType: 'numeric',
            // GnuCOBOL's runtime DISPLAY format for an index-name is always
            // signed, 9-digit zero-padded (e.g. `+000000004`) regardless of
            // the table's declared OCCURS size - index-names are internally
            // a fixed binary width, not sized by the table they index -
            // verified against installed GnuCOBOL (see
            // tests/corpus/proc/r01-search-midtable-varying.cbl /
            // r02-search-noatend.cbl's DISPLAY of an index-name).
            integerDigits: 9,
            decimalDigits: 0,
            signed: true,
            editPattern: null,
            occursDepth: 0,
            picLength: 0,
          });
        });
      }

      if (item.redefines) {
        const accessorLines = redefinesAccessorLines(item, registry, list);
        if (accessorLines.length) lines.push(...accessorLines);
        continue; // shares storage with what it redefines - no offset advance
      }

      // round-8 finding 4: this item's own span within `parentValueText`
      // (null when there is no VALUE-bearing ancestor in scope at all - see
      // walk()'s own doc comment). `itemWidth` (used to advance `offset` for
      // the *next* sibling) always uses the item's full occupied storage,
      // OCCURS multiplier included, exactly like itemByteLength's own
      // documented contract; the slice handed to a VALUE-less descendant
      // (`itemWidthSingle`/`inheritedSlice`) is deliberately left null for an
      // OCCURS-bearing item - a table inheriting its initial contents from an
      // enclosing group's VALUE clause is not a shape this fix (or any corpus
      // program) exercises, and guessing at a per-element split would risk a
      // wrong value rather than the safe, pre-existing zero/blank default.
      const itemWidth = itemByteLength(item);
      const itemWidthSingle = hasOccurs(item) ? null : itemWidth;
      const inheritedSlice = (parentValueText != null && itemWidthSingle != null)
        ? parentValueText.substr(offset, itemWidthSingle)
        : null;
      offset += itemWidth;

      const realChildren = (item.children || []).filter(c => !isLevel(c, 88));
      if (realChildren.length > 0) {
        const parentUpper = (item.name || '').toUpperCase();
        // Full ancestor-path key for THIS group, not just its bare name -
        // two different top-level records can each declare their own
        // same-named nested group (e.g. both with `05 DTL-GROUP`), which
        // would otherwise collide on a single shared `groupRegistry` entry
        // keyed just "DTL-GROUP" (whichever one is processed last would
        // silently overwrite the other, corrupting MOVE/ADD CORRESPONDING's
        // recursion into it for *both* records - see
        // tests/corpus/proc/r13-addcorresponding-nested.cbl). Identical to a
        // top-level item's own bare name when ancestorNames is empty, so
        // every existing (non-nested-collision) lookup by bare name is
        // unaffected.
        const groupKey = [...ancestorNames, parentUpper].join('/');
        const ownCount = hasOccurs(item) && occursCount(item) > 1 ? occursCount(item) : null;
        // round-8 finding 4: this group's own VALUE clause (if any) wins over
        // whatever it may itself have inherited from a further-up ancestor -
        // each level's own VALUE clause always overrides an ancestor's, exact
        // same rule as an elementary item's own VALUE winning over inheritance
        // (defaultElementaryValueWithInheritance). Computed even when this
        // group has OCCURS (`itemByteLength({ ...item, occurs: null })` is
        // already the established one-occurrence-width convention, see
        // groupByteLengthRegistry below) so a group's *own* VALUE clause still
        // reaches its children regardless - only *inheriting* an ancestor's
        // VALUE across an OCCURS boundary is left unsupported (inheritedSlice
        // is already null for an OCCURS item, above).
        const ownGroupValueText = ownValueStorageText(item, itemByteLength({ ...item, occurs: null }));
        const effectiveValueText = ownGroupValueText ?? inheritedSlice;
        walk(realChildren, ownCount ? [...occursChain, ownCount] : occursChain, [...ancestorNames, parentUpper], effectiveValueText);

        // Group registry: immediate child names (COBOL name + camel), used
        // by MOVE/ADD CORRESPONDING to match children between two group
        // items by name at generation time. Built *after* recursing so each
        // child's camel can be read back from qualifiedRegistry (keyed by
        // this group's own name as parent) - the one identifier that's
        // always correct for that child regardless of whether its bare name
        // happens to collide with a same-named child under some other group.
        // A child that is itself a group carries its own `groupKey` too, so
        // CORRESPONDING's recursion (correspondingPairs/positionalPairs in
        // expression-gen.js) can look up *that specific* nested group's
        // children instead of an ambiguous bare name.
        groupKeyRegistry.set(parentUpper, groupKey);
        groupRegistry.set(
          groupKey,
          realChildren
            .map(c => {
              if (c.isFiller || !c.name) {
                // A plain elementary FILLER got its own hidden flat var above
                // (`_fillerCamel`/`_fillerInfo`, stashed directly on this AST
                // node) - included here (isFiller: true, no nameUpper) so
                // group DISPLAY/identical-layout group MOVE carry its bytes
                // along (round-5 finding 3/s06). A group-level FILLER (has
                // its own named children) has no single flat-var slot to
                // give it - not exercised by any corpus program - so it's
                // left out entirely here, same as before this fix (its own
                // named children remain individually addressable by their
                // own bare names regardless).
                if (!c._fillerCamel) return null;
                return { nameUpper: null, camel: c._fillerCamel, info: c._fillerInfo, groupKey: null, isFiller: true };
              }
              const nameUpper = (c.name || '').toUpperCase();
              const info = qualifiedRegistry.get(`${nameUpper}::${parentUpper}`);
              const childHasRealChildren = (c.children || []).some(cc => cc.level !== 88);
              return {
                nameUpper,
                camel: info ? info.camel : toCamelCase(c.name),
                info: info || null,
                groupKey: childHasRealChildren ? `${groupKey}/${nameUpper}` : null,
              };
            })
            .filter(Boolean)
        );

        // FUNCTION LENGTH(group-item): a compile-time constant (the sum of
        // the group's elementary children's byte lengths, exactly what
        // layout.js's itemByteLength already computes for record/case-class
        // sizing) - not a runtime var, since there is no single flat Scala
        // identifier holding a group's "value" the way there is for an
        // elementary item. Recorded once per group name here (regardless of
        // OCCURS - a bare, unsubscripted `FUNCTION LENGTH(tbl-group)` refers
        // to one occurrence's width) so expression-gen.js's functionLength
        // can look it up by name alone.
        groupByteLengthRegistry.set(parentUpper, itemByteLength({ ...item, occurs: null }));
        continue;
      }

      if (item.isFiller || !item.name) {
        // FILLER bytes are unaddressable from the PROCEDURE DIVISION (no
        // COBOL name to look them up by), but they still occupy real storage
        // that a whole-group MOVE or DISPLAY must carry along unchanged
        // (round-5 finding 3/s06 - verified against installed GnuCOBOL: a
        // group-to-group MOVE copies a FILLER's bytes just like any other
        // byte in the group, and a DISPLAY of the whole group shows them).
        // A hidden `var` (never entered into `registry`/`qualifiedRegistry` -
        // nothing outside this group's own display/MOVE concatenation ever
        // references it - only into the group's own entry in `groupRegistry`
        // below via the `_fillerCamel`/`_fillerInfo` stashed directly on this
        // AST node) gives it the same flat-var representation as a named
        // sibling, at the same position, so the concatenation this generator
        // builds for group DISPLAY/identical-layout group MOVE (see
        // expression-gen.js's groupDisplayValueExpr/generateGroupMove) is
        // byte-width-correct end to end.
        const ownCount = hasOccurs(item) && occursCount(item) > 1 ? occursCount(item) : null;
        const fullChain = ownCount ? [...occursChain, ownCount] : occursChain;
        fillerSeq += 1;
        const fillerCamel = `_filler${fillerSeq}`;
        const baseType = scalaBaseType(item);
        let scalaType = baseType;
        for (let i = 0; i < fullChain.length; i++) scalaType = `Vector[${scalaType}]`;
        // round-8 finding 4: a FILLER between two named children of a
        // VALUE-bearing group still occupies real storage bytes that a
        // whole-group DISPLAY/MOVE must carry along correctly (same
        // round-5 finding 3/s06 rationale as the flat-var mirroring above) -
        // so it inherits its own slice of the ancestor's VALUE text exactly
        // like a named leaf does, not just the plain zero/blank default.
        let defaultExpr = defaultElementaryValueWithInheritance(item, baseType, inheritedSlice);
        for (let i = fullChain.length - 1; i >= 0; i--) {
          defaultExpr = `Vector.fill(${fullChain[i]})(${defaultExpr})`;
        }
        lines.push(`  var ${fillerCamel}: ${scalaType} = ${defaultExpr}`);
        const fillerPic = item.pic && typeof item.pic === 'object' ? item.pic : null;
        item._fillerCamel = fillerCamel;
        item._fillerInfo = {
          camel: fillerCamel,
          scalaType: baseType,
          dataType: fillerPic?.dataType || (baseType === 'String' ? 'alphanumeric' : 'numeric'),
          integerDigits: fillerPic?.integerDigits || 0,
          decimalDigits: fillerPic?.decimalDigits || 0,
          signed: !!(fillerPic && fillerPic.signed),
          editPattern: null,
          occursDepth: fullChain.length,
          picLength: fillerPic?.length || 0,
          justified: false,
          blankWhenZero: false,
        };
        continue;
      }

      const ownCount = hasOccurs(item) && occursCount(item) > 1 ? occursCount(item) : null;
      const fullChain = ownCount ? [...occursChain, ownCount] : occursChain;

      const nameUpper = item.name.toUpperCase();
      const ambiguous = (leafNameCounts.get(nameUpper) || 0) > 1;
      // Names that collide across sibling/cousin groups (only possible via
      // OF/IN qualification in real COBOL - see countLeafNameOccurrences)
      // get a full-ancestor-path-qualified identifier instead of the bare
      // camelCase name every *unique* name still uses - preserves the
      // existing, already-tested identifier scheme for the overwhelmingly
      // common (unique-name) case. The *full* chain (not just the immediate
      // parent) is required: two different top-level records can each
      // declare their own same-named nested group with a same-named child
      // (both immediate parents are spelled identically too), which
      // immediate-parent-only qualification cannot tell apart - the full
      // path always can, since sibling names must differ and top-level
      // record names must be unique in valid COBOL.
      const camel = ambiguous
        ? toCamelCase([...ancestorNames, item.name].join('-'))
        : toCamelCase(item.name);
      const baseType = scalaBaseType(item);
      let scalaType = baseType;
      for (let i = 0; i < fullChain.length; i++) scalaType = `Vector[${scalaType}]`;

      // round-8 finding 4: fall back to the nearest VALUE-bearing ancestor
      // group's own storage slice (defaultElementaryValueWithInheritance)
      // when this leaf has no VALUE clause of its own - see that function's
      // doc comment; a no-op (identical to the pre-existing
      // defaultElementaryValue call) whenever `inheritedSlice` is null, i.e.
      // no VALUE-bearing ancestor is in scope.
      let defaultExpr = defaultElementaryValueWithInheritance(item, baseType, inheritedSlice);
      for (let i = fullChain.length - 1; i >= 0; i--) {
        defaultExpr = `Vector.fill(${fullChain[i]})(${defaultExpr})`;
      }

      lines.push(`  var ${camel}: ${scalaType} = ${defaultExpr}`);

      const pic = item.pic && typeof item.pic === 'object' ? item.pic : null;
      const info = {
        camel,
        scalaType: baseType,
        dataType: pic?.dataType || (baseType === 'String' ? 'alphanumeric' : 'numeric'),
        integerDigits: pic?.integerDigits || 0,
        decimalDigits: pic?.decimalDigits || 0,
        signed: !!(pic && pic.signed),
        editPattern: pic?.editPattern || null,
        occursDepth: fullChain.length,
        // Same per-level occurs counts, outer dimension first, used to build
        // `defaultExpr`'s own nested Vector.fill above - kept on the info
        // object too so a later INITIALIZE (round-5 finding 4) can rebuild
        // the identical Vector[...] nesting for a REPLACING/default value
        // without needing the original DataItem/occursChain again.
        occursCounts: fullChain.slice(),
        picLength: pic?.length || 0,
        // JUSTIFIED RIGHT (alphanumeric MOVE alignment) and BLANK WHEN ZERO
        // (numeric-edited MOVE) - see expression-gen.js's
        // renderVariableMoveSource/fitAlphanumericExpr and
        // formatEditedPicture/CobolFmt.edited.
        justified: String(item.justified || '').toUpperCase() === 'RIGHT',
        blankWhenZero: !!item.blankWhenZero,
      };
      // Only an unambiguous name gets a bare-name registry entry - an
      // ambiguous one would just silently overwrite whichever same-named
      // sibling group's entry was registered first, corrupting lookups for
      // *both* (a bare, unqualified reference to an ambiguous name isn't
      // valid COBOL anyway - it always requires OF/IN - so nothing legit
      // depends on a bare-key entry existing here).
      if (!ambiguous) registry.set(nameUpper, info);
      // Register a qualified-lookup entry for *every* ancestor level, not
      // just the immediate parent - `QTY OF WS-B` (qualifying by a
      // grandparent, skipping the intermediate DTL-GROUP level entirely) is
      // equally valid, common COBOL, and convertIdentifier's OF/IN handling
      // (see lookupQualified) needs an entry under whichever ancestor name
      // the source actually used.
      for (const ancestor of ancestorNames) {
        qualifiedRegistry.set(`${nameUpper}::${ancestor}`, info);
      }

      // Level-88 condition-name registry: every VALUE/VALUES (incl. THRU
      // ranges) declared under this elementary item, keyed by the 88-level's
      // own name - used by convertCondition (IF/PERFORM UNTIL a-condition-
      // name) and evaluateConditionExpr (EVALUATE TRUE/FALSE WHEN a-
      // condition-name) to generate the equality/range test against this
      // item's own value instead of treating the condition name as if it
      // were itself a boolean data item (it isn't one - see
      // level88ConditionExpr in expression-gen.js).
      for (const cond of item.conditions || []) {
        if (!cond || !cond.name) continue;
        conditionRegistry.set(String(cond.name).toUpperCase(), { info, values: cond.values || [] });
      }
    }
  }

  walk(wsItems, [], []);
  walk(fileItems, [], []);
  walk(linkageItems, [], []);

  return { lines: lines.join('\n'), registry, tableRegistry, groupRegistry, groupKeyRegistry, groupByteLengthRegistry, qualifiedRegistry, conditionRegistry };
}

/**
 * Build the record<->file name registries round-5 finding 1b needs: a WRITE/
 * REWRITE statement identifies its record by the FD's own 01 record name
 * (`WRITE OUT-REC`), but OPEN's writer/reader/iterator handles are keyed by
 * the *file* name (`OPEN OUTPUT OUT-FILE`) - routinely a different word
 * entirely (the overwhelmingly common COBOL style, in fact - see
 * tests/corpus/proc/s01-fileio-roundtrip.cbl's own OUT-FILE/OUT-REC). SD
 * ("sort") work files are excluded - buildSortFileRegistry already gives
 * those their own independent in-memory buffer support, not real OPEN/READ/
 * WRITE file handles at all.
 *   - recordToFile: FD record name (upper) -> its FD's own file name (raw
 *     COBOL text) - what a WRITE/REWRITE needs.
 *   - fileToRecord: FD file name (upper) -> its first 01 record's own name
 *     (raw COBOL text) - what a plain READ with no INTO clause needs (it
 *     implicitly loads the FD's own record).
 */
function buildRecordFileRegistries(ast) {
  const recordToFile = new Map();
  const fileToRecord = new Map();
  const files = ast.dataItems?.fileSection?.files || ast.data?.fileSection?.files || [];

  for (const f of files) {
    if (f.type === 'SD' || !f.name) continue;
    for (const record of f.records || []) {
      if (!record?.name) continue;
      recordToFile.set(record.name.toUpperCase(), f.name);
      if (!fileToRecord.has(f.name.toUpperCase())) fileToRecord.set(f.name.toUpperCase(), record.name);
    }
  }

  return { recordToFile, fileToRecord };
}

/**
 * FD file names (upper) that have at least one `WriteStatement` anywhere in
 * the whole PROCEDURE DIVISION with a non-null `.advancing` clause - round-6
 * finding 1 (see expression-gen.js's ADVANCING_FILES/setAdvancingFiles and
 * file-io-gen.js's own copy for the full rationale: a file's WRITE behavior
 * switches wholesale to a deferred-terminator model the moment ANY WRITE for
 * it uses ADVANCING, compiler-verified against installed GnuCOBOL).
 *
 * Walks the *entire* AST (not just a specific procedure-statement shape) via
 * a generic deep traversal rather than mirroring every nested-statement field
 * name (thenStatements/elseStatements/whenClauses/loop bodies/...) the way
 * containsStatementType's checkStatements does above - the AST here is small
 * (one program), so correctness (never missing a WRITE buried in an IF/
 * EVALUATE/PERFORM/SECTION of whatever shape) is worth more than the
 * micro-optimization of only walking known statement-container fields. A
 * `seen` guard defends against any accidental reference cycle (none of
 * parser/ast.js's node shapes are known to have one, but this is cheap
 * insurance either way).
 */
function collectAdvancingFileNames(ast, recordToFile) {
  const fileNames = new Set();
  const seen = new Set();

  function fileNameFor(recordName) {
    if (!recordName) return null;
    return recordToFile.get(String(recordName).toUpperCase()) || recordName;
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (node.type === 'WriteStatement' && node.advancing) {
      const fname = fileNameFor(node.recordName || node.record);
      if (fname) fileNames.add(String(fname).toUpperCase());
    }

    for (const key of Object.keys(node)) {
      if (key === 'location') continue;
      walk(node[key]);
    }
  }

  walk(ast);
  return fileNames;
}

/**
 * Build a registry of SD ("sort") work files -> the in-memory buffer support
 * a generated SORT/RELEASE/RETURN needs: a dedicated row case class (one
 * field per record child, independent of the byte-level case class
 * `generateAllCaseClasses` may also emit for the same record - this one only
 * ever lives in-process, so it carries none of the codec machinery), a
 * `Vector`-backed buffer var, and a read-cursor var. Registered under both
 * the SD's own name (what SORT/RETURN reference) and its 01 record's name
 * (what RELEASE references), so either lookup key resolves to the same info.
 */
function buildSortFileRegistry(ast) {
  const registry = new Map();
  const files = ast.dataItems?.fileSection?.files || ast.data?.fileSection?.files || [];

  for (const f of files) {
    if (f.type !== 'SD') continue;
    const record = (f.records || [])[0];
    if (!record) continue;

    const fields = (record.children || [])
      .filter(c => !isLevel(c, 88) && !c.isFiller && c.name)
      .map(c => ({ camel: toCamelCase(c.name), scalaType: scalaBaseType(c) }));
    if (fields.length === 0) continue;

    const info = {
      caseClassName: `${toPascalCase(f.name)}Row`,
      bufferVar: `${toCamelCase(f.name)}Buffer`,
      idxVar: `${toCamelCase(f.name)}Idx`,
      fields,
      // The 01 record's own uppercased COBOL name - this is the key
      // GROUP_REGISTRY (buildFieldRegistry) uses for this record's field
      // list, which generateReturn's RETURN ... INTO handling (in
      // expression-gen.js) needs to look up positionalPairs(recordNameUpper,
      // intoUpper). Recorded directly rather than reverse-searched out of
      // this Map by identity (this map is keyed by *both* the SD's own name
      // and the record's name pointing at the same `info` - reverse-search
      // isn't guaranteed to land on the record's name specifically).
      recordNameUpper: record.name ? record.name.toUpperCase() : '',
    };

    registry.set((f.name || '').toUpperCase(), info);
    if (record.name) registry.set(record.name.toUpperCase(), info);
  }

  return registry;
}

/**
 * Scala declarations (row case class + buffer/cursor vars) for every SD work
 * file found by buildSortFileRegistry(). Returned separately (rather than
 * folded into generateAllCaseClasses/buildFieldRegistry's own lines) since
 * these are synthesized purely to support SORT/RELEASE/RETURN codegen, not
 * derived from a WORKING-STORAGE/FILE SECTION item the way every other
 * declaration in this file is.
 */
function generateSortFileSupport(sortFileRegistry) {
  const caseClasses = [];
  const decls = [];
  const seen = new Set();

  for (const info of sortFileRegistry.values()) {
    if (seen.has(info)) continue;
    seen.add(info);
    const fieldList = info.fields.map(f => `${f.camel}: ${f.scalaType}`).join(', ');
    caseClasses.push(`case class ${info.caseClassName}(${fieldList})`);
    decls.push(`  var ${info.bufferVar}: scala.collection.mutable.ArrayBuffer[${info.caseClassName}] = scala.collection.mutable.ArrayBuffer.empty`);
    decls.push(`  var ${info.idxVar}: Int = 0`);
  }

  return { caseClasses: caseClasses.join('\n\n'), decls: decls.join('\n') };
}

/**
 * Generate case classes from COBOL records
 * Handles multiple parser output formats
 */
function generateAllCaseClasses(ast, indent = 0, options = {}) {
  // Every top-level (01-level) record that will get its own case class is
  // collected *before* any generation happens, so the ambiguous-nested-group-
  // name set (see case-class-gen.js's collectAmbiguousGroupClassNames/
  // resolveClassName) can be computed once across the *whole* program - two
  // different top-level records each containing a same-named nested group
  // (e.g. both declaring their own `05 DTL-GROUP`) would otherwise emit two
  // colliding `case class DtlGroup`/`object DtlGroup` definitions in the same
  // generated file.
  const topLevelItems = [];

  function processItems(items) {
    if (!items) return;
    for (const item of items) {
      if ((item.level === 1 || item.level === '01' || item.level === 1) &&
          item.children && item.children.length > 0) {
        topLevelItems.push(item);
      }
    }
  }

  function processFileSection(fileSection) {
    if (!fileSection) return;
    const files = fileSection.files || fileSection;
    if (!Array.isArray(files)) return;

    for (const fd of files) {
      if (fd.record) {
        topLevelItems.push(fd.record);
      }
      if (fd.records) {
        for (const record of fd.records) {
          topLevelItems.push(record);
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

  const ambiguousNames = collectAmbiguousGroupClassNames(topLevelItems.map(item => [item]));
  const classes = topLevelItems.map(item =>
    generateCaseClass(item, indent, options, { ambiguousNames, parentClassName: null })
  );

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
 * Split a raw parsed AST's PROCEDURE DIVISION into `{ topLevelParagraphs,
 * sections }`, handling the handful of shapes different parser entry points
 * have historically produced (see generateMethods/findMainProcedure's prior
 * per-function copies of this same fallback chain, now unified here so both
 * agree on the exact same paragraph/section structure - round-4 finding 9
 * depended on these being consistent, since a section-led program was
 * previously invisible to findMainProcedure even though generateMethods
 * already (partially) saw its sections).
 */
function splitProcedureDivision(ast) {
  // Format 1: ast.procedure.paragraphs (nested format) - no sections in this shape.
  if (ast.procedure?.paragraphs && Array.isArray(ast.procedure.paragraphs)) {
    return { topLevelParagraphs: ast.procedure.paragraphs, sections: [] };
  }
  // Format 2: ast.procedures is a ProcedureDivision object with paragraphs + sections.
  if (ast.procedures?.paragraphs && Array.isArray(ast.procedures.paragraphs)) {
    const sections = Array.isArray(ast.procedures.sections) ? ast.procedures.sections : [];
    return { topLevelParagraphs: ast.procedures.paragraphs, sections };
  }
  // Format 3: ast.procedures is an array directly.
  if (Array.isArray(ast.procedures)) {
    return { topLevelParagraphs: ast.procedures, sections: [] };
  }
  return { topLevelParagraphs: [], sections: [] };
}

/**
 * Generate methods from COBOL procedures
 * Handles multiple parser output formats
 */
function generateMethods(ast, indent = 1) {
  const { topLevelParagraphs, sections } = splitProcedureDivision(ast);
  return generateAllMethods(topLevelParagraphs, sections, indent);
}

/**
 * Generate main method if requested.
 *
 * The `@main def run()` entry point is the *whole* PROCEDURE DIVISION's true
 * entry: the first paragraph (whether genuinely top-level or the first
 * paragraph of the first SECTION - round-4 finding 9) chained by natural
 * fall-through all the way through the rest of the division, including
 * across SECTION boundaries - not just a single call to the first paragraph's
 * own (fall-through-free) standalone method, which left every paragraph after
 * the first unreachable unless some other paragraph happened to PERFORM it.
 */
function generateMainMethod(ast, options, indent = 1) {
  if (!options.generateMain) return '';

  const indentStr = '  '.repeat(indent);
  const { topLevelParagraphs, sections } = splitProcedureDivision(ast);
  const units = flattenProcedureUnits(topLevelParagraphs, sections);
  const ambiguousNames = collectAmbiguousParagraphNames(topLevelParagraphs, sections);

  const lines = [`${indentStr}@main def run(): Unit =`];
  lines.push(...generateProgramFlowLines(units, indent + 1, ambiguousNames));

  return lines.join('\n');
}

/**
 * Find the main procedure: the true first unit of the PROCEDURE DIVISION in
 * source order - a genuinely top-level paragraph if one precedes every
 * SECTION, otherwise the first paragraph of the first SECTION (or that
 * section's own name, if it has no nested paragraphs at all) - round-4
 * finding 9. COBOL's entry point is always whatever comes first, regardless
 * of its name, so this no longer favors a paragraph named "MAIN"/"START"/etc.
 * over a differently-named paragraph that actually comes first.
 */
export function findMainProcedure(ast) {
  const { topLevelParagraphs, sections } = splitProcedureDivision(ast);
  const units = flattenProcedureUnits(topLevelParagraphs, sections);
  return units[0]?.name ?? null;
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
  const {
    lines: workingFields,
    registry: fieldRegistry,
    tableRegistry,
    groupRegistry,
    groupKeyRegistry,
    groupByteLengthRegistry,
    qualifiedRegistry,
    conditionRegistry,
  } = buildFieldRegistry(ast);
  setFieldRegistry(fieldRegistry);
  setTableRegistry(tableRegistry);
  setGroupRegistry(groupRegistry, groupKeyRegistry);
  setGroupByteLengthRegistry(groupByteLengthRegistry);
  setQualifiedRegistry(qualifiedRegistry);
  setConditionRegistry(conditionRegistry);

  // SPECIAL-NAMES' DECIMAL-POINT IS COMMA (round-7 finding 5) - drives
  // DISPLAY/numeric-edited PICTURE decimal-separator rendering in
  // expression-gen.js (CobolFmt.num/CobolFmt.edited call sites, and
  // formatEditedPicture's own compile-time-literal-folding path).
  setDecimalPointIsComma(!!ast.environmentDivision?.decimalPointIsComma);

  // Case-class names that collide across two different top-level records
  // (see case-class-gen.js's collectAmbiguousGroupClassNames/resolveClassName
  // and generateAllCaseClasses below) - handed to expression-gen.js purely as
  // a defensive guard for generateGroupMove's differing-layout byte-level
  // round trip, which references a group's case-class name directly by its
  // bare COBOL name and has no parent-path context to disambiguate an
  // ambiguous one with (unlike generateAllCaseClasses, which does).
  setAmbiguousGroupClassNames(
    collectAmbiguousGroupClassNames([getWorkingStorageItems(ast), getFileSectionRecordItems(ast)])
  );

  // SD ("sort") work-file support: a dedicated row case class + in-memory
  // buffer/cursor vars per SD, so SORT/RELEASE/RETURN can be generated as
  // real (if in-process, not on-disk) buffer operations - see
  // buildSortFileRegistry()/generateSortFileSupport() above.
  const sortFileRegistry = buildSortFileRegistry(ast);
  setSortFileRegistry(sortFileRegistry);
  const sortFileSupport = generateSortFileSupport(sortFileRegistry);

  // FD record name <-> file name registries (round-5 finding 1b) - lets
  // WRITE/REWRITE/plain-READ codegen resolve the *file*-keyed handle a
  // record actually belongs to, regardless of which of the two names a given
  // statement mentions.
  const { recordToFile, fileToRecord } = buildRecordFileRegistries(ast);
  setRecordFileRegistry(recordToFile, fileToRecord);

  // ADVANCING file set (round-6 finding 1) - fed to both expression-gen.js
  // (generateWriteStatement's model switch) and file-io-gen.js (generateClose's
  // final-newline flush), which each keep their own copy (see their doc
  // comments) since they're independent modules.
  const advancingFiles = collectAdvancingFileNames(ast, recordToFile);
  setAdvancingFilesExpr(advancingFiles);
  setAdvancingFilesFileIO(advancingFiles);

  // FILE STATUS registry (round-6 finding 2/3 companion) - FD file name
  // (upper) -> its `FILE STATUS IS <field>` field's camelCase flat-var name,
  // for whichever FILE-CONTROL entries actually declared one. Fed to both
  // expression-gen.js (READ/WRITE) and file-io-gen.js (OPEN/CLOSE), which
  // each keep their own copy (see their doc comments).
  const fileStatusRegistry = new Map();
  for (const fc of getFileControls(ast)) {
    const fname = fc.name || fc.fileName;
    if (fname && fc.status) {
      fileStatusRegistry.set(String(fname).toUpperCase(), toCamelCase(fc.status));
    }
  }
  setFileStatusRegistryExpr(fileStatusRegistry);
  setFileStatusRegistryFileIO(fileStatusRegistry);

  // Package declaration, imports, and the embedded runtime helper objects
  // (CobolCodecs/CobolFmt/CobolInspect/CobolUnstring) - skipped when
  // `opts.skipPreamble` is set (round-7 finding 1: generateMultiProgramScala
  // sets this for every program after the first one in a multi-PROGRAM-ID
  // source, since these are top-level `object`/`package` declarations that
  // would otherwise be emitted - and fail to compile as duplicates - once
  // per program in the same file). Always false by default, so every
  // single-program call site (100% of existing corpus programs) emits this
  // exactly as before.
  if (!opts.skipPreamble) {
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

    // CobolInspect: INSPECT TALLYING/REPLACING helper (literal, non-overlapping
    // substring counting/replacement) used by generated INSPECT statements.
    sections.push('// CobolInspect: INSPECT TALLYING/REPLACING helpers');
    sections.push(generateCobolInspectHelper());
    sections.push('');

    // CobolUnstring: UNSTRING scanning helper (WITH POINTER start/writeback,
    // DELIMITED BY ALL collapsing, DELIMITER IN) used by generated UNSTRING
    // statements.
    sections.push('// CobolUnstring: UNSTRING scanning helper');
    sections.push(generateCobolUnstringHelper());
    sections.push('');
  }

  // Generate case classes (outside the object for better organization)
  const caseClasses = generateAllCaseClasses(ast, 0, { charset: opts.charset });
  if (caseClasses) {
    sections.push('// Data structures');
    sections.push(caseClasses);
    sections.push('');
  }

  // SD work-file row case classes (SORT/RELEASE/RETURN in-memory buffers).
  if (sortFileSupport.caseClasses) {
    sections.push('// SORT work-file row types (in-memory buffer support)');
    sections.push(sortFileSupport.caseClasses);
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

  // File handle vars (File/reader/writer/iterator/random-access), one set
  // per FD/SELECT file name, declared exactly once as top-level `var`s so
  // OPEN can assign (not redeclare) them regardless of how many times, or in
  // how many different modes, the same file is OPENed in this program's
  // lifetime (round-5 finding 1c - see file-io-gen.js's
  // generateFileHandleDeclarations/fileHandleVarNames doc comments).
  const fileControlNames = getFileControls(ast).map(f => f.name || f.fileName).filter(Boolean);
  const fdFileNames = (ast.dataItems?.fileSection?.files || ast.data?.fileSection?.files || [])
    .filter(f => f.type !== 'SD' && f.name)
    .map(f => f.name);
  const allFileNames = [...new Set([...fileControlNames, ...fdFileNames].map(n => n.toUpperCase()))]
    .map(upper => fileControlNames.find(n => n.toUpperCase() === upper) || fdFileNames.find(n => n.toUpperCase() === upper));
  const fileHandleDecls = generateFileHandleDeclarations(allFileNames, 1);
  if (fileHandleDecls) {
    sections.push('');
    sections.push('  // File handles');
    sections.push(fileHandleDecls);
  }

  // Working storage fields (flattened elementary vars + REDEFINES accessors)
  if (workingFields) {
    sections.push('');
    sections.push('  // Working storage');
    sections.push(workingFields);
  }

  // SD work-file buffer/cursor vars.
  if (sortFileSupport.decls) {
    sections.push('');
    sections.push('  // SORT work-file buffers');
    sections.push(sortFileSupport.decls);
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

  // CALL entry point (round-7 finding 1) - only in multi-PROGRAM-ID mode
  // (generateMultiProgramScala sets opts.emitEntryPoint for every program in
  // the source); false by default, so no single-program-file output changes
  // at all.
  if (opts.emitEntryPoint) {
    const entryMethod = generateEntryMethod(ast, fieldRegistry, 1);
    if (entryMethod) {
      sections.push('');
      sections.push(entryMethod);
    }
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
 * Generate the CALL entry point for one program in a multi-PROGRAM-ID source
 * (round-7 finding 1) - assigns each incoming argument to this program's own
 * PROCEDURE DIVISION USING (LINKAGE SECTION) variable, runs the *whole*
 * PROCEDURE DIVISION exactly the way this program's own `@main` would
 * (generateProgramFlowLines - same fall-through-from-the-first-unit
 * semantics, round-4 finding 9), then returns every USING parameter's final
 * value - a bare scalar for a single-parameter program, a tuple for more than
 * one, `Unit` for zero (a CALL with no USING clause at all) - back to the
 * caller.
 *
 * This is the callee side of the "value-in/tuple-out" pragmatic mapping this
 * generator uses for COBOL's BY REFERENCE CALL semantics (real COBOL lets a
 * called subprogram mutate its LINKAGE SECTION parameters and have the
 * caller observe those mutations directly - Scala has no equivalent
 * pass-by-reference mechanism) - see generateCall's own doc comment
 * (generator/expression-gen.js) for the caller side: it assigns this
 * method's return value(s) back into whichever of the CALL's own USING
 * operands were BY REFERENCE (COBOL's default).
 *
 * A LINKAGE parameter's Scala type is looked up in `fieldRegistry` (the same
 * one this program's own working-storage vars were flattened through -
 * LINKAGE SECTION items go through the identical buildFieldRegistry path);
 * falls back to `String` only if a parameter is somehow unregistered
 * (defensive - every corpus program's LINKAGE item is registered).
 *
 * round-8 finding 1: a USING parameter naming a whole GROUP LINKAGE item
 * (rather than an elementary field) has no fieldRegistry entry of its own
 * at all - a group never gets a flat Scala var, only its children do (see
 * generator/expression-gen.js's groupDisplayValueExpr) - so it *already*
 * falls back to `String` above, matching the caller side's own
 * concatenated-raw-storage-text convention for such an operand
 * (generateCall). What still needs to change for a group parameter is the
 * assignment on both ends: instead of `<name> = _argN` (a hard "not found"
 * compile error - there is no flat `<name>` var to assign) and a bare
 * `<name>` return (same problem), a group parameter's incoming string is
 * scattered into its own children's flat vars (scatterGroupFromString) and
 * its outgoing value is its children's own concatenated storage text
 * (groupDisplayValueExpr) - the exact inverse pairing generateCall uses on
 * the caller side for the same operand.
 */
function generateEntryMethod(ast, fieldRegistry, indent = 1) {
  const indentStr = '  '.repeat(indent);
  const bi = '  '.repeat(indent + 1);

  const usingNames = (ast.procedures?.using || []).map(n => (typeof n === 'string' ? n : (n?.name || n)));
  const paramInfos = usingNames.map(name => {
    const nameUpper = String(name).toUpperCase();
    const info = fieldRegistry.get(nameUpper);
    const isGroup = !info && isRegisteredGroupName(nameUpper);
    return {
      camel: toCamelCase(name),
      scalaType: info?.scalaType || 'String',
      isGroup,
      groupKey: isGroup ? resolveGroupKey(nameUpper) : null,
    };
  });

  const { topLevelParagraphs, sections } = splitProcedureDivision(ast);
  const units = flattenProcedureUnits(topLevelParagraphs, sections);
  const ambiguousNames = collectAmbiguousParagraphNames(topLevelParagraphs, sections);

  const paramList = paramInfos.map((p, i) => `_arg${i}: ${p.scalaType}`).join(', ');
  const returnType = paramInfos.length === 0
    ? 'Unit'
    : paramInfos.length === 1
      ? paramInfos[0].scalaType
      : `(${paramInfos.map(p => p.scalaType).join(', ')})`;

  const lines = [
    `${indentStr}// round-7 finding 1: CALL entry point for a sibling program in this same`,
    `${indentStr}// multi-PROGRAM-ID source - see this function's own doc comment above and`,
    `${indentStr}// generateCall's (generator/expression-gen.js) for the full BY REFERENCE`,
    `${indentStr}// "value-in/tuple-out" convention this pairs with.`,
    `${indentStr}def entry(${paramList}): ${returnType} =`,
  ];
  paramInfos.forEach((p, i) => {
    if (!p.isGroup) {
      lines.push(`${bi}${p.camel} = _arg${i}`);
      return;
    }
    const scattered = scatterGroupFromString(p.groupKey, `_arg${i}`, indent + 1);
    if (scattered == null) {
      lines.push(
        `${bi}() // TODO: CALL ... USING ${p.groupKey}: group parameter scatter not supported for this ` +
          'shape (an OCCURS child, or a child with no registered field info) - value left unchanged'
      );
      return;
    }
    lines.push(...scattered);
  });
  lines.push(...generateProgramFlowLines(units, indent + 1, ambiguousNames));
  if (paramInfos.length === 1 || paramInfos.length > 1) {
    const returnExprs = paramInfos.map(p => {
      if (!p.isGroup) return p.camel;
      const groupExpr = groupDisplayValueExpr(p.groupKey);
      // No flat `<name>` var exists for a group parameter (see this
      // function's own doc comment), so the fallback for an unsupported
      // group shape must still be a same-typed (String) placeholder, not a
      // reference to a nonexistent variable - "" plus a visible comment,
      // never a guessed/wrong value.
      return groupExpr ? `(${groupExpr})` : `"" /* TODO: group return unsupported for this shape */`;
    });
    lines.push(paramInfos.length === 1 ? `${bi}${returnExprs[0]}` : `${bi}(${returnExprs.join(', ')})`);
  }

  return lines.join('\n');
}

/**
 * Generate Scala for a multi-PROGRAM-ID COBOL source - contained or
 * sequential programs sharing one file (round-7 finding 1; see u01's own
 * repro shape: a calling program followed by its own callee, both full
 * IDENTIFICATION/DATA/PROCEDURE DIVISIONs, in the same source). `programs` is
 * `[{ programId, ast }, ...]` in source order - see index.js's
 * splitProgramSources/parseCobol for how a raw source is split into this
 * shape (only ever attempted when the source actually contains more than one
 * PROGRAM-ID; a single-program source never reaches this function at all).
 *
 * Emits one `object <ProgramObjectName>:` per program (each with its own
 * case classes/working-storage/methods, via ordinary generateScala), but the
 * shared preamble (package declaration, imports, and the embedded
 * CobolCodecs/CobolFmt/CobolInspect/CobolUnstring runtime objects - each a
 * top-level definition that would be a duplicate-definition compile error if
 * repeated) is emitted exactly once, ahead of the first program
 * (`opts.skipPreamble` suppresses it for every program after the first - see
 * generateScala's own doc comment on that option). Only the *first* program
 * in the file gets `generateMain`'s `@main def run()` - matching cobc, where
 * the primary/first program in a source is the one an `-x` executable
 * actually runs; every program (including the first) also gets its own
 * `entry(...)` method (generateEntryMethod) so a sibling CALL can invoke it
 * regardless of declaration order.
 *
 * The cross-program CALL_PROGRAM_REGISTRY (generator/expression-gen.js's
 * setCallProgramRegistry) is built from *every* program before any of their
 * method bodies are generated, specifically so a CALL to a program declared
 * later in the same source (a forward reference - again, u01's own shape:
 * its first program calls "ADDER", declared second) still resolves.
 */
export function generateMultiProgramScala(programs, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const callRegistry = new Map();
  for (const { programId, ast } of programs) {
    const name = programId || extractProgramName(ast);
    const objectName = toPascalCase(name);
    const usingNames = ast.procedures?.using || [];
    callRegistry.set(String(name).toUpperCase(), {
      objectName,
      paramCount: usingNames.length,
    });
  }
  setCallProgramRegistry(callRegistry);

  const codeSections = [];
  programs.forEach(({ programId, ast }, i) => {
    const name = programId || extractProgramName(ast);
    const programOpts = {
      ...opts,
      objectName: toPascalCase(name),
      skipPreamble: i > 0,
      emitEntryPoint: true,
      generateMain: i === 0 && opts.generateMain,
    };
    const result = generateScala(ast, programOpts);
    codeSections.push(result.code);
  });

  // Reset the shared registry immediately after use so a later, unrelated
  // single-program conversion in the same process never sees stale entries
  // from this multi-program run (setFieldRegistry/etc. are all reset the
  // same way by every ordinary generateScala call already - this is the one
  // registry generateScala itself never touches, since only this function
  // populates it).
  setCallProgramRegistry(new Map());

  const firstName = programs[0]?.programId || extractProgramName(programs[0]?.ast || {});
  const objectName = toPascalCase(firstName);

  return {
    code: codeSections.join('\n\n'),
    filename: `${objectName}.scala`,
    objectName,
    packageName: opts.packageName,
  };
}

/**
 * Generate Scala from multiple COBOL programs (independently - one wholly
 * separate file per program, no cross-program CALL wiring). Distinct from
 * generateMultiProgramScala above, which links multiple PROGRAM-IDs *within
 * one source* together (round-7 finding 1) - this one is for genuinely
 * separate COBOL source files with no relationship to each other.
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
  generateMultiProgramScala,
  formatScalaCode,
  extractProgramName,
  toPascalCase,
  toCamelCase
};
