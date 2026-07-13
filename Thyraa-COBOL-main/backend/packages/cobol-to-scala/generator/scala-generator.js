/**
 * scala-generator.js
 * Main generator that coordinates full COBOL to Scala conversion
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  toPascalCase,
  toCamelCase,
  generateCaseClass,
  collectAmbiguousGroupClassNames,
  classifyCodec,
  decodeFieldExpr,
  encodeFieldExpr,
} from './case-class-gen.js';
import { getPicPattern, scalaBaseType, occursCount, hasOccurs, itemByteLength, syncPadBytes, elementaryByteLength } from './layout.js';
import { packedDecode, binaryDecode } from './codecs.js';
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
  setDeclarativeHandlers as setDeclarativeHandlersExpr,
  setCallProgramRegistry,
  resetCallRetSeq,
  defaultZeroValueForScalaType,
  generateCobolFmtHelper,
  generateCobolInspectHelper,
  generateCobolUnstringHelper,
  formatEditedPicture,
  isRegisteredGroupName,
  resolveGroupKey,
  groupDisplayValueExpr,
  scatterGroupFromString,
  flattenGroupLeaves,
  getGroupRegistry,
  getGroupKeyRegistry,
  getTableRegistry,
} from './expression-gen.js';
import {
  generateMethod,
  generateAllMethods,
  generateSectionMethod,
  toMethodName,
  flattenProcedureUnits,
  collectAmbiguousParagraphNames,
  generateProgramFlowLines,
  generateProgramFlowLinesNested,
} from './method-gen.js';
import {
  generateFileIO,
  generateFileStatusCheck,
  generateFileHandleDeclarations,
  setAdvancingFiles as setAdvancingFilesFileIO,
  setFileStatusRegistry as setFileStatusRegistryFileIO,
  setDeclarativeHandlers as setDeclarativeHandlersFileIO,
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
 * True if this program's own PROGRAM-ID clause carries the RECURSIVE
 * attribute (`PROGRAM-ID. NAME RECURSIVE.` - permits the program to CALL
 * itself, directly or indirectly, while an outer activation of it is still
 * on the call stack). round-21 finding 2: this is what
 * generateRecursiveEntryMethod (below) is gated on. Scanned the same
 * tokens-based way extractProgramName resolves the program's own name
 * (parseCobolTokens, index.js, never builds a structured identification-
 * division AST node at all - see that function's own doc comment above),
 * since RECURSIVE is the only clause this needs to recognize.
 */
function isRecursiveProgram(ast) {
  if (!ast.tokens || !Array.isArray(ast.tokens)) return false;
  for (let i = 0; i < ast.tokens.length; i++) {
    const token = ast.tokens[i];
    if (token.value?.toUpperCase() === 'PROGRAM-ID' || token.type === 'PROGRAM-ID') {
      let j = i + 1;
      // Skip the period that immediately follows the PROGRAM-ID keyword
      // itself, then the program-name token, then scan the remainder of
      // this one clause (up to ITS OWN terminating period) for RECURSIVE.
      while (j < ast.tokens.length && (ast.tokens[j].type === 'PERIOD' || ast.tokens[j].value === '.')) j++;
      j++;
      while (j < ast.tokens.length) {
        const t = ast.tokens[j];
        if (t.type === 'PERIOD' || t.value === '.') break;
        if (String(t.value).toUpperCase() === 'RECURSIVE') return true;
        j++;
      }
      return false;
    }
  }
  return false;
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
/**
 * round-9 finding 3: cobc's actual byte-reinterpretation for a non-DISPLAY
 * (COMP-3/BINARY) numeric child inheriting its initial value from an
 * enclosing group's own VALUE clause. The DISPLAY-numeric assumption
 * defaultElementaryValueWithInheritance otherwise makes (this item's byte
 * span holds its own ASCII digit characters) is wrong for a packed-decimal
 * or binary child - cobc lays the VALUE literal's raw text down across the
 * group's storage exactly like it does for a DISPLAY child (no special-
 * casing at VALUE-initialization time; the compiler doesn't know or care
 * what a byte span "means" for some child at that offset), and that span is
 * then read back through whatever the child's own USAGE clause says its
 * storage format actually is - packed-decimal nibbles for COMP-3, two's-
 * complement for COMP/COMP-4/COMP-5/BINARY - producing whatever
 * (deterministic, if odd-looking) digits that decoding yields.
 * Compiler-verified for COMP-3 against installed GnuCOBOL - see
 * tests/corpus/proc/w03-group-value-comp3-slice.cbl: `VALUE "AB1234CD"`
 * laid under `05 WS-AMT PIC 9(4) COMP-3` reinterprets raw bytes 0x31 0x32
 * 0x33 as packed decimal and displays "1323", not the naive "0123" a plain-
 * digit-text assumption produces.
 *
 * Reuses the already-tested codecs.js packedDecode/binaryDecode (the exact
 * same decoders this generator relies on for real COMP-3/BINARY file-record
 * storage elsewhere - case-class-gen.js) instead of re-deriving the nibble/
 * byte-order rules from scratch. Neither decoder knows this item's own
 * declared digit count - packedDecode returns every digit nibble present in
 * the slice (including a packed-decimal leading pad nibble for an even digit
 * count), binaryDecode returns the full two's-complement magnitude for the
 * slice's whole byte width - so the result is always truncated to this
 * item's own low-order `digits` decimal digits afterward (packedByteLength's
 * own pad-nibble math guarantees the true digits are always exactly the
 * *last* `digits` characters of packedDecode's raw digit string), matching
 * the same high-order-digit truncation convention used everywhere else in
 * this generator (CobolFmt.truncNumeric).
 *
 * Only COMP-3 is oracle-verified (w03); COMP/COMP-4/COMP-5/BINARY reuses the
 * identical truncation principle for consistency but has no corpus program
 * exercising a binary child under a group VALUE clause to verify against -
 * flagged here and in tests/oracle/README.md as the narrower, unverified
 * half of this fix.
 *
 * Returns null (caller falls back to defaultElementaryValue's ordinary zero
 * default) when the slice can't be decoded at all - e.g. a COMP-3 slice
 * containing a genuinely invalid (>9) digit nibble, which packedDecode
 * itself rejects - rather than letting a RangeError escape and abort the
 * whole conversion over one VALUE-inheriting child's unlucky byte content.
 */
function nonDisplayInheritedNumericText(inheritedSlice, digits, usage) {
  const bytes = Uint8Array.from(inheritedSlice, ch => ch.charCodeAt(0) & 0xff);
  const isPacked = usage === 'COMP-3' || usage === 'COMPUTATIONAL-3' || usage === 'PACKED-DECIMAL';
  const isComp5 = usage === 'COMP-5' || usage === 'COMPUTATIONAL-5';
  try {
    let unscaled;
    if (isPacked) {
      ({ unscaled } = packedDecode(bytes));
    } else {
      const endianness = isComp5 ? 'LITTLE' : 'BIG';
      unscaled = binaryDecode(bytes, { endianness });
    }
    const negative = unscaled < 0n;
    const magnitudeStr = (negative ? -unscaled : unscaled).toString();
    // round-15 finding 4: COMP-5 (native/host binary) is exempt from real
    // cobc's default binary-truncate convention - unlike COMP-3/COMP/
    // COMP-4/BINARY (all of which cobc silently clips to the low-order
    // `digits` decimal digits of the PICTURE, verified via d02's oracle:
    // a group-VALUE-inherited SYNC `S9(4) COMP` reads raw bytes that decode
    // to 17220, and DISPLAYs "+7220" - the low-order 4 digits, not the full
    // value), COMP-5's DISPLAY shows the TRUE full stored magnitude even
    // when it exceeds the PICTURE's own declared digit count - verified via
    // d06's oracle: a group-VALUE-inherited `9(4) COMP-5` reads raw bytes
    // that decode (native/little-endian) to 12849, and DISPLAYs "12849" in
    // full, not "2849" (12849 mod 10^4). Only the truncating (non-COMP-5)
    // side pads short values up to `digits` with leading zeros - a COMP-5
    // value never needs that (its own untruncated decimal text is used as-is,
    // already whatever width it naturally is).
    const truncated = !isComp5 && magnitudeStr.length > digits
      ? magnitudeStr.slice(-digits)
      : magnitudeStr.padStart(digits, '0');
    return (negative ? '-' : '') + truncated;
  } catch {
    return null;
  }
}

function defaultElementaryValueWithInheritance(item, scalaType, inheritedSlice) {
  if (item.value || inheritedSlice == null) return defaultElementaryValue(item, scalaType);

  if (scalaType === 'String') {
    return defaultElementaryValue({ ...item, value: { type: 'string', value: inheritedSlice } }, scalaType);
  }

  const pic = item.pic && typeof item.pic === 'object' ? item.pic : null;
  const intDigits = pic?.integerDigits ?? inheritedSlice.length;
  const decDigits = pic?.decimalDigits || 0;

  const usage = (item.usage || 'DISPLAY').toUpperCase();
  const isNonDisplay = usage === 'COMP-3' || usage === 'COMPUTATIONAL-3' || usage === 'PACKED-DECIMAL' ||
    usage === 'COMP' || usage === 'COMP-4' || usage === 'COMP-5' || usage === 'BINARY' ||
    usage === 'COMPUTATIONAL' || usage === 'COMPUTATIONAL-4' || usage === 'COMPUTATIONAL-5';

  if (isNonDisplay) {
    const digits = intDigits + decDigits;
    const digitsText = digits > 0 ? nonDisplayInheritedNumericText(inheritedSlice, digits, usage) : null;
    if (digitsText == null) return defaultElementaryValue(item, scalaType);
    const neg = digitsText.startsWith('-');
    const unsignedDigits = neg ? digitsText.slice(1) : digitsText;
    // round-15 finding 4: `unsignedDigits` can be WIDER than `digits` now
    // (COMP-5 only - nonDisplayInheritedNumericText deliberately declines to
    // truncate it, see its own doc comment) - split integer/decimal parts by
    // the ACTUAL length, not the PICTURE's nominal intDigits, so a too-wide
    // COMP-5 value's decimal point (if any) still lands in the right place
    // instead of losing high-order digits to a stale intDigits-sized slice.
    const actualIntDigits = decDigits > 0 ? Math.max(unsignedDigits.length - decDigits, 0) : unsignedDigits.length;
    const numericText = decDigits > 0
      ? `${neg ? '-' : ''}${unsignedDigits.slice(0, actualIntDigits)}.${unsignedDigits.slice(actualIntDigits)}`
      : digitsText;
    // Widen the synthetic item's own pic.integerDigits to match whenever the
    // decoded value came back wider than the declared PICTURE (COMP-5 only) -
    // otherwise defaultElementaryValue's generic truncateNumericLiteralText
    // call (shared with the ordinary too-wide-VALUE-literal path, which
    // legitimately DOES truncate) would re-clip a value this function already
    // decided to leave alone. A no-op (effectiveIntDigits === intDigits)
    // whenever unsignedDigits is already exactly `digits` wide, which is
    // every case except an untruncated COMP-5 overflow.
    const effectiveIntDigits = Math.max(intDigits, actualIntDigits);
    const effectivePic = pic ? { ...pic, integerDigits: effectiveIntDigits } : { integerDigits: effectiveIntDigits, decimalDigits: decDigits };
    return defaultElementaryValue({ ...item, pic: effectivePic, value: { type: 'numeric', value: numericText } }, scalaType);
  }

  if (!/^\d+$/.test(inheritedSlice)) return defaultElementaryValue(item, scalaType);

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
 *
 * round-17 finding 4: this is the OPPOSITE direction from round-16 finding
 * 1's `elementaryOverGroupRedefinesLines`/`flattenRedefinesLeavesBytes` fix -
 * here `realChildren` are the REDEFINING item's own children (a GROUP), and
 * `targetCamel` is the single ELEMENTARY target's flat var being sliced
 * (e.g. f06: `01 WS-B REDEFINES WS-A` where WS-A is a plain `PIC X(4)` and
 * WS-B has a `B-NUM PIC S9(4) COMP SYNC` child). Before this fix, EVERY
 * child - DISPLAY or not - was sized by `child.pic.length`, its PICTURE's
 * DECIMAL DIGIT COUNT, never its true BINARY STORAGE WIDTH - correct for a
 * DISPLAY child (1 character IS 1 byte IS 1 digit there) but wrong for a
 * COMP/COMP-3/COMP-4/BINARY/COMP-5 child, whose real storage can be
 * (usually is) NARROWER than its digit count implies (a 4-digit COMP field
 * is 2 bytes, not 4 characters) - slicing by digit count instead of byte
 * width silently walked `offset` past the target's own true length,
 * eventually throwing `StringIndexOutOfBoundsException` the moment any
 * later child's slice (or this one's own, once the running offset itself
 * overflowed) fell outside the target String's actual bounds. Reproduces
 * even without SYNC (SYNC only changes WHERE the pad bytes land, not
 * whether the digit-count-vs-byte-width mismatch itself is wrong).
 *
 * Fixed the same way round-16 finding 1 fixed the reverse direction: a
 * non-DISPLAY child is sized by its real `elementaryByteLength` (not
 * `pic.length`), any SYNC alignment pad bytes real cobc inserts before it
 * are accounted for as genuine, nameless character positions (via
 * `syncPadBytes`, exactly like `flattenRedefinesLeavesBytes` does for the
 * other direction), and its value is decoded/encoded through the same
 * `classifyCodec`/`decodeFieldExpr`/`encodeFieldExpr` byte-level codec
 * dispatch a record's own byte-level `parse`/`format` uses - not plain
 * digit-text substring/concatenation, which can't represent binary/packed
 * storage at all. A DISPLAY child (occurs or not) is completely unaffected -
 * its byte width already equals its digit/character count, so this is a
 * pure no-op for every pre-existing corpus program (none of which redefine
 * an elementary target with a non-DISPLAY child). An OCCURS non-DISPLAY
 * child (a rarer shape entirely unexercised by any corpus program, this
 * one included) still falls back to the pre-existing PICTURE-digit-count
 * model rather than risk a partial/incorrect byte-accurate table model no
 * program here can verify.
 */
function characterSlicedGroupRedefinesLines(realChildren, targetCamel, registry) {
  const lines = [];
  let offset = 0;

  // round-18 finding 7: the redefining item's own children can themselves be
  // nested GROUPs, arbitrarily many levels deep (g10: `01 WS-ALT REDEFINES
  // WS-L1. 05 WS-ALT-L2. 10 WS-ALT-L3. 15 WS-ALT-L4. 20 WS-ALT-FLAT PIC
  // X(8).` - WS-ALT-FLAT is 4 levels below WS-ALT itself). This loop
  // previously only ever handled ONE flat level of ELEMENTARY (or OCCURS-
  // elementary) children directly - a child that is itself a group (real
  // children of its own, no `.pic`) fell through to the elementary-sizing
  // logic below, which reads `child.pic.length` - `undefined` for a group,
  // silently producing a zero-width slice (`substring(start, start)`) for
  // that whole child AND everything nested inside it, so the true leaf
  // (WS-ALT-FLAT) was NEVER declared or registered at all - a hard "Not
  // found: wsAltFlat" compile error the instant PROCEDURE DIVISION code
  // referenced it. Recursing into a nested (non-OCCURS-bearing) group
  // child's own children here - using the SAME running `offset`, exactly
  // like an ordinary (non-REDEFINES) group's own recursive registration
  // does - reaches the true leaves regardless of nesting depth; only a
  // nested group that ALSO carries its own OCCURS (a table-of-groups nested
  // inside a REDEFINES's own children - a rarer shape no corpus program
  // exercises) still falls through to the pre-existing (zero-width, honest
  // limitation - unchanged by this fix) elementary-sizing path below,
  // rather than attempting an unverified nested-table character model.
  function walk(children) {
    for (const child of children) {
      const realGrandchildren = (child.children || []).filter(c => !isLevel(c, 88));
      if (realGrandchildren.length > 0 && !hasOccurs(child)) {
        walk(realGrandchildren);
        continue;
      }
      processLeaf(child);
    }
  }

  function processLeaf(child) {
    const camel = toCamelCase(child.name);
    const count = hasOccurs(child) && occursCount(child) > 1 ? occursCount(child) : 1;
    const usage = (child.usage || 'DISPLAY').toUpperCase();
    const isNonDisplay = usage !== 'DISPLAY';

    if (isNonDisplay && count === 1) {
      const byteWidth = elementaryByteLength(child);
      const codec = classifyCodec(child, {});
      if (byteWidth > 0 && codec.codecKind !== 'legacy') {
        const padBefore = syncPadBytes(child, offset);
        const start = offset + padBefore;
        const end = start + byteWidth;
        offset = end;

        const baseType = scalaBaseType(child);
        const codecField = { ...codec, type: baseType, length: byteWidth };
        const sliceExpr = `${targetCamel}.substring(${start}, ${end})`;
        const decodeExpr = truncateNonComp5NumericValue(
          codecField,
          decodeFieldExpr(codecField, `(${sliceExpr}).getBytes(java.nio.charset.StandardCharsets.ISO_8859_1)`)
        );
        const encodeExpr = `new String(${encodeFieldExpr(codecField, 'v')}, java.nio.charset.StandardCharsets.ISO_8859_1)`;
        lines.push(`  def ${camel}: ${baseType} = ${decodeExpr}`);
        lines.push(
          `  def ${camel}_=(v: ${baseType}): Unit = ${targetCamel} = ${targetCamel}.substring(0, ${start}) + ${encodeExpr} + ${targetCamel}.substring(${end})`
        );

        const childPic = child.pic && typeof child.pic === 'object' ? child.pic : null;
        registry.set((child.name || '').toUpperCase(), {
          camel,
          scalaType: baseType,
          dataType: baseType === 'String' ? 'alphanumeric' : 'numeric',
          integerDigits: childPic?.integerDigits || 0,
          decimalDigits: childPic?.decimalDigits || 0,
          signed: !!(childPic && childPic.signed),
          editPattern: null,
          occursDepth: 0,
          picLength: byteWidth,
          justified: false,
          blankWhenZero: false,
        });
        return;
      }
      // No real byte width, or a 'legacy' codec (COMP-1/COMP-2 float/
      // double, no byte-level codec support here) - fall through to the
      // pre-existing PICTURE-digit-count model below unchanged (`offset`
      // untouched, exactly as if this child were never inspected for its
      // byte width at all - the pre-round-17 behavior for this narrow,
      // unexercised combination).
    }

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

  walk(realChildren);
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
function redefinesAccessorLines(item, registry, siblingList, tableRegistry, targetAbsOffset = 0) {
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
      const redefiningRealChildren = (item.children || []).filter(c => !isLevel(c, 88));
      // round-16 finding 1: the group-over-group path below
      // (groupOverGroupRedefinesLines) only ever declared accessors for
      // ITEM's OWN children, sliced out of a synthetic flat view over the
      // target - it silently assumed `item` itself is always a group. An
      // ELEMENTARY item (no children of its own) redefining a GROUP target
      // (e02: `05 WS-B REDEFINES WS-A PIC X(5)` over a SYNC-padded group)
      // fell through that assumption entirely: `item.children` is empty, so
      // nothing was ever declared for `item` itself - a hard "Not found"
      // compile error. elementaryOverGroupRedefinesLines below handles this
      // mirror-image shape: same synthetic-flat-view construction, exposed
      // directly as `item`'s own accessor instead of a further-sliced
      // `...BaseFlat` helper.
      if (redefiningRealChildren.length === 0) {
        return elementaryOverGroupRedefinesLines(item, targetItem, registry, targetAbsOffset);
      }
      return groupOverGroupRedefinesLines(item, targetItem, registry, tableRegistry, targetAbsOffset);
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
 * round-18 finding 6 companion: a FILLER-tolerant variant of
 * flattenRedefinesLeaves, used ONLY by occursOnRedefinesItemLines below.
 * flattenRedefinesLeaves bails outright on a FILLER target child because
 * IT needs to expose the target's own named fields THROUGH the redefining
 * view - a nameless FILLER has nothing to expose there. This flattening
 * only ever needs a flat, whole-target CONCATENATED TEXT VIEW (get/set) to
 * slice the REDEFINING item's own children out of - a FILLER's bytes are
 * just as real, and just as readable/writable via its own hidden
 * `_fillerCamel` var (buildFieldRegistry's own elementary-FILLER branch
 * always runs for the target BEFORE this REDEFINES branch is ever reached,
 * since REDEFINES must name an earlier-declared sibling - so `_fillerCamel`
 * is always already stashed by this point), as a named sibling's own flat
 * var. g07's own WS-SRC-TABLE (three `05 FILLER PIC X(8) VALUE "..."`
 * items, redefined by an OCCURS-bearing WS-SRC-ARR) is exactly this shape -
 * flattenRedefinesLeaves alone would bail on the very first FILLER and
 * leave nothing to build a flat view from at all.
 */
function flattenRedefinesLeavesAllowingFiller(groupItem) {
  const leaves = [];
  function walk(children) {
    for (const child of children) {
      if (isLevel(child, 88)) continue;
      const real = (child.children || []).filter(c => !isLevel(c, 88));
      if (real.length > 0) {
        if (hasOccurs(child)) return false;
        if (!walk(real)) return false;
        continue;
      }
      if (child.isFiller || !child.name) {
        if (!child._fillerCamel || child._fillerInfo?.scalaType !== 'String') return false;
        const width = child._fillerInfo?.picLength || (child.pic && typeof child.pic === 'object' ? child.pic.length : 0) || 0;
        if (!width) return false;
        leaves.push({ camel: child._fillerCamel, baseType: 'String', count: 1, elementWidth: width, totalWidth: width, intDigits: 0 });
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
 * round-16 finding 1: byte-accurate REDEFINES target flattening - a
 * fallback for exactly the shapes flattenRedefinesLeaves's own doc comment
 * says it deliberately bails on: a SIGNED numeric child and/or a non-DISPLAY
 * USAGE (COMP/COMP-3/COMP-4/COMP-5/BINARY, including a SYNC-padded one).
 * flattenRedefinesLeaves' "zero-padded decimal digit text" model is only
 * actually correct for a DISPLAY (zoned) unsigned numeric or plain
 * alphanumeric child - real storage for a signed/binary/packed child is not
 * ASCII digit text at all, so guessing at a digit-text rendering for it
 * would silently produce the wrong bytes rather than the honest "can't
 * represent this" `null` flattenRedefinesLeaves already returns. This
 * reuses case-class-gen.js's own `classifyCodec`/`decodeFieldExpr`/
 * `encodeFieldExpr` - the EXACT SAME codec dispatch a record's own
 * byte-level `parse`/`format` already uses - so a REDEFINES's synthetic
 * flat view decodes/encodes each child identically to how that same field
 * would round-trip through real file I/O.
 *
 * Tried only as a FALLBACK, after flattenRedefinesLeaves itself has already
 * returned `null` (see groupOverGroupRedefinesLines/
 * elementaryOverGroupRedefinesLines below) - every previously-supported
 * shape (unsigned DISPLAY/plain alphanumeric, no OCCURS, no SYNC) still
 * goes through flattenRedefinesLeaves and produces byte-for-byte the same
 * generated text as before this round; this path only ever activates for a
 * shape that model could not represent at all.
 *
 * `baseOffset` is the target group's own ABSOLUTE record offset (its true
 * position in the whole record, threaded down from buildFieldRegistry's
 * own `itemAbsoluteOffsets` map - see the `walk()` call site above) - needed
 * so a SYNC binary descendant aligns against its real position, exactly
 * like layout.js's itemByteLength/this same walk() already do for the
 * group's own ordinary flat-var declaration (round-15 findings 1/2).
 *
 * Still bails (returns `null`) on a FILLER/unnamed child (no tracked value
 * to encode - same restriction as flattenRedefinesLeaves), an OCCURS-
 * bearing child (no Vector-of-rows support in this flat-character model),
 * and a COMP-1/COMP-2 float child (`classifyCodec`'s own `'legacy'`
 * codecKind - no byte-level float codec exists in CobolCodecs yet).
 */
function flattenRedefinesLeavesBytes(groupItem, baseOffset = 0) {
  const leaves = [];
  function walk(children, base) {
    let offset = 0;
    for (const child of children) {
      if (isLevel(child, 88) || child.redefines) continue;
      if (child.isFiller || !child.name) return false;
      if (hasOccurs(child)) return false;

      const padBefore = syncPadBytes(child, base + offset);
      if (padBefore > 0) {
        // round-16 finding 1: the SYNC pad bytes real cobc inserts before
        // this child (0x00-valued - see layout.js's syncPadBytes doc
        // comment) are real bytes of the target's own storage that a flat
        // character view MUST still account for positionally, even though
        // no COBOL name addresses them - omitting them here would shift
        // every subsequent leaf's character offset left by the pad width,
        // silently misaligning the whole rest of the view (e02: WS-A is
        // A-LEAD(1) + 1 pad byte + A-NUM(2) + A-TAIL(1) = 5 bytes; without
        // this, the flat view would total only 4 characters and every byte
        // from A-NUM onward would be read/written one position too early).
        leaves.push({ pad: true, width: padBefore });
      }
      offset += padBefore;
      const childStart = base + offset;

      const real = (child.children || []).filter(c => !isLevel(c, 88) && !c.redefines);
      if (real.length > 0) {
        if (!walk(real, childStart)) return false;
        offset += itemByteLength(child, childStart);
        continue;
      }

      const codec = classifyCodec(child, {});
      if (codec.codecKind === 'legacy') return false;
      const length = elementaryByteLength(child);
      if (!length) return false;
      leaves.push({
        camel: toCamelCase(child.name),
        width: length,
        codecField: { ...codec, type: scalaBaseType(child), length },
      });
      offset += length;
    }
    return true;
  }
  const ok = walk((groupItem.children || []).filter(c => !isLevel(c, 88) && !c.redefines), baseOffset);
  return ok ? leaves : null;
}

/**
 * Normalize a flattenRedefinesLeaves() text-model leaf into the shared
 * `{ camel, width, encode(expr), decode(sliceExpr) }` shape
 * buildFlatViewLines below consumes - `encode` renders this leaf's own
 * current value as its character-text contribution to the flat view (used
 * for the getter and, when item's own declared width is a strict PREFIX of
 * the full target width, to preserve the untouched tail on write);
 * `decode` renders the Scala expression to assign back to this leaf's own
 * var given its already-sliced substring of the flat view. Produces
 * byte-for-byte the same expressions the pre-round-16 inline
 * getter/setter-building code in groupOverGroupRedefinesLines used, so
 * every previously-supported shape's generated Scala is unchanged.
 */
function textLeafOp(l) {
  return {
    camel: l.camel,
    width: l.totalWidth,
    encode: (expr) => (l.baseType === 'String'
      ? (l.count > 1
        ? `${expr}.map(s => CobolFmt.fitLeft(s, ${l.elementWidth})).mkString`
        : `CobolFmt.fitLeft(${expr}, ${l.elementWidth})`)
      : `CobolFmt.digitsOf(BigDecimal(${expr}), ${l.intDigits}, 0)`),
    decode: (sliceExpr) => (l.baseType === 'String'
      ? (l.count > 1
        ? `(0 until ${l.count}).map(i => ${sliceExpr}.substring(i * ${l.elementWidth}, (i + 1) * ${l.elementWidth})).toVector`
        : `CobolFmt.fitLeft(${sliceExpr}, ${l.elementWidth})`)
      : `${sliceExpr}.toInt`),
  };
}

/**
 * round-16 finding 1 (re-using round-15 finding 4's own established rule):
 * a decoded COMP/COMP-3/COMP-4/BINARY (packed or big-endian binary) value
 * read back through a byte-accurate REDEFINES flat view can be WIDER than
 * its declared PICTURE digit count (e.g. a 2-byte binary field's raw
 * storage can hold values past 4 declared digits) - real cobc's
 * "binary-truncate" runtime convention clips the OBSERVED value to the
 * field's own low-order declared digits (verified end-to-end here via e02:
 * a `PIC S9(4) COMP` field whose raw bytes decode to 21075 DISPLAYs as
 * `+1075`, not `+21075`). COMP-5 (and this same round's BINARY-CHAR/SHORT/
 * LONG/DOUBLE, all native/host-endian like COMP-5 - see case-class-gen.js's
 * COMP5_USAGES) is specifically EXEMPT from this truncation (round-15
 * finding 4) - detected here via `endianness === 'LITTLE'`, the same signal
 * classifyCodec itself uses to pick COMP-5's native byte order. A no-op for
 * 'zoned'/'string' codecKinds (DISPLAY storage has no independent "wider
 * raw capacity" to truncate - its bytes already ARE the declared digit
 * text) and for 'legacy' (excluded upstream by flattenRedefinesLeavesBytes
 * already).
 */
function truncateNonComp5NumericValue(field, valueExpr) {
  const isNative = field.endianness === 'LITTLE';
  const needsTruncation = !isNative && (field.codecKind === 'packed' || field.codecKind === 'binary');
  if (!needsTruncation) return valueExpr;
  const decDigits = field.decimalDigits || 0;
  const intDigits = Math.max((field.digits || 0) - decDigits, 0);
  const truncated = `CobolFmt.truncNumeric(BigDecimal(${valueExpr}), ${intDigits}, ${decDigits})`;
  if (field.type === 'BigDecimal') return truncated;
  if (field.type === 'Int') return `(${truncated}).toIntExact`;
  return `(${truncated}).toLongExact`;
}

/**
 * Normalize a flattenRedefinesLeavesBytes() byte-model leaf into the same
 * shared op shape textLeafOp produces above, routing through case-class-
 * gen.js's decodeFieldExpr/encodeFieldExpr (wrapped to/from a Scala String
 * via ISO-8859-1, the same lossless 1:1 byte<->char mapping this generator's
 * flat-var Strings already use elsewhere - see case-class-gen.js's own
 * charset doc comment) instead of digit-text concatenation. `decode` runs
 * the decoded value through truncateNonComp5NumericValue above (a no-op for
 * everything but a non-native binary/packed numeric).
 */
function byteLeafOp(l) {
  if (l.pad) {
    // round-16 finding 1: a SYNC alignment pad span (see
    // flattenRedefinesLeavesBytes) - real 0x00 bytes with no COBOL name to
    // read/write back through. `camel: null` tells buildFlatViewLines/
    // elementaryOverGroupRedefinesLines' setter loops to still consume this
    // op's own width when computing subsequent leaves' character offsets,
    // but emit no assignment line for it at all.
    const padLiteral = '"' + '\\u0000'.repeat(l.width) + '"';
    return { camel: null, width: l.width, encode: () => padLiteral, decode: null };
  }
  return {
    camel: l.camel,
    width: l.width,
    encode: (expr) => `new String(${encodeFieldExpr(l.codecField, expr)}, java.nio.charset.StandardCharsets.ISO_8859_1)`,
    decode: (sliceExpr) => truncateNonComp5NumericValue(
      l.codecField,
      decodeFieldExpr(l.codecField, `${sliceExpr}.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1)`)
    ),
  };
}

/**
 * Shared getter/setter construction for a synthetic flat-character view
 * named `flatName` over an ordered list of leaf `ops` (see textLeafOp/
 * byteLeafOp) - used both by groupOverGroupRedefinesLines (where `flatName`
 * is a `...BaseFlat` helper further sliced by the redefining GROUP's own
 * children) and elementaryOverGroupRedefinesLines (where `flatName` IS the
 * redefining elementary item's own accessor directly). Byte-for-byte
 * identical output to the pre-round-16 inline code for the text-leaf case.
 */
function buildFlatViewLines(flatName, ops) {
  const getterExpr = ops.map(op => op.encode(op.camel)).join(' + ');
  const lines = [`  def ${flatName}: String = ${getterExpr}`, `  def ${flatName}_=(v: String): Unit =`];
  let offset = 0;
  let anyAssignment = false;
  for (const op of ops) {
    const start = offset;
    const end = offset + op.width;
    offset = end;
    // A pad-span op (round-16 finding 1's byteLeafOp) has no COBOL name to
    // write back through - its width still advances `offset` for later
    // ops, but it contributes no assignment line of its own.
    if (op.camel === null) continue;
    anyAssignment = true;
    lines.push(`    ${op.camel} = ${op.decode(`v.substring(${start}, ${end})`)}`);
  }
  if (!anyAssignment) lines.push('    ()');
  return lines;
}

/**
 * round-16 finding 1: an ELEMENTARY item (no children of its own) REDEFINES-
 * ing a GROUP target - e.g. e02's `05 WS-B REDEFINES WS-A PIC X(5)` where
 * WS-A is a group with a SYNC-padded binary child. Before this fix,
 * redefinesAccessorLines routed EVERY group-target REDEFINES through
 * groupOverGroupRedefinesLines, which only ever declares accessors for the
 * REDEFINING item's OWN children (sliced out of a synthetic flat view) - it
 * assumed `item` is itself a group. An elementary redefining item has no
 * children at all, so nothing was declared for `item` itself: a hard
 * "Not found: wsB"-style compile error the moment anything referenced it.
 *
 * Builds the identical synthetic flat-character view groupOverGroupRedefinesLines
 * builds (flattenRedefinesLeaves' text model first, flattenRedefinesLeavesBytes'
 * byte-accurate codec model second), but exposes it DIRECTLY as `item`'s own
 * accessor - there are no child items of `item`'s own to slice it further
 * for. When `item`'s own declared width is a strict PREFIX of the target's
 * full flat width (legal COBOL - REDEFINES only requires the redefiner not
 * exceed the target's size), the setter reads the current full view back
 * out first so only `item`'s own leading slice is overwritten, preserving
 * the target's own untouched tail bytes - the same "read full, splice
 * prefix, redistribute" convention characterSlicedGroupRedefinesLines's own
 * elementary-child setter already uses against a real flat String target.
 *
 * Only reachable/supported for an alphanumeric-shaped `item` (scalaBaseType
 * 'String') - a numeric REDEFINES of a group is a rarer shape this
 * generator does not attempt to model; falls back to the pre-existing
 * honest `???`/no-op stub pair (todoStubRedefinesLines's own convention)
 * for that or any shape neither leaf-flattening model can represent,
 * rather than ever leaving `item` completely undeclared or guessing at a
 * wrong numeric decode.
 */
function elementaryOverGroupRedefinesLines(item, targetItem, registry, targetAbsOffset = 0) {
  const camel = toCamelCase(item.name);
  const itemBaseType = scalaBaseType(item);

  const textLeaves = flattenRedefinesLeaves(targetItem);
  const ops = textLeaves
    ? textLeaves.map(textLeafOp)
    : (flattenRedefinesLeavesBytes(targetItem, targetAbsOffset) || []).map(byteLeafOp);

  if (itemBaseType !== 'String' || ops.length === 0) {
    return [
      `  // REDEFINES ${item.redefines}: ??? TODO - this elementary-over-group REDEFINES shape ` +
        '(FILLER gap / nested OCCURS / unsupported type, or a non-alphanumeric redefining item) is not ' +
        `supported; ${item.name} is declared but not aliased to real storage`,
      `  def ${camel}: ${itemBaseType} = ??? // TODO REDEFINES ${item.redefines}: unsupported group shape`,
      `  def ${camel}_=(v: ${itemBaseType}): Unit = () // TODO REDEFINES ${item.redefines}: write discarded (unsupported group shape)`,
    ];
  }

  const itemWidth = elementaryByteLength(item);
  const totalWidth = ops.reduce((sum, op) => sum + op.width, 0);
  const getterExpr = ops.map(op => op.encode(op.camel)).join(' + ');
  const fullWidthMatch = itemWidth >= totalWidth;

  const lines = [
    fullWidthMatch
      ? `  def ${camel}: String = ${getterExpr}`
      : `  def ${camel}: String = (${getterExpr}).substring(0, ${itemWidth})`,
    `  def ${camel}_=(v: String): Unit =`,
  ];

  if (!fullWidthMatch) {
    // item's own declared width is a strict prefix of the target's full
    // width - only that leading slice is being overwritten; the target's
    // own trailing bytes must survive untouched, so the current full view
    // is read back out first and only its own head replaced before
    // redistributing to each leaf.
    lines.push(`    val _full = (${getterExpr})`);
    lines.push(`    val _new = v + _full.substring(${itemWidth})`);
  }
  const sourceVar = fullWidthMatch ? 'v' : '_new';
  let offset = 0;
  let anyAssignment = false;
  for (const op of ops) {
    const start = offset;
    const end = offset + op.width;
    offset = end;
    if (op.camel === null) continue; // pad span - no COBOL name to write back through
    anyAssignment = true;
    lines.push(`    ${op.camel} = ${op.decode(`${sourceVar}.substring(${start}, ${end})`)}`);
  }
  if (!anyAssignment) lines.push('    ()');

  registry.set((item.name || '').toUpperCase(), {
    camel,
    scalaType: 'String',
    dataType: (item.pic && item.pic.dataType) || 'alphanumeric',
    integerDigits: (item.pic && item.pic.integerDigits) || 0,
    decimalDigits: (item.pic && item.pic.decimalDigits) || 0,
    signed: !!(item.pic && item.pic.signed),
    editPattern: (item.pic && item.pic.editPattern) || null,
    occursDepth: 0,
    picLength: itemWidth,
    justified: String(item.justified || '').toUpperCase() === 'RIGHT',
    blankWhenZero: !!item.blankWhenZero,
  });

  return lines;
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
 *
 * round-13 finding 5: a child that is ITSELF an OCCURS-bearing group (e.g.
 * r1313's `WS-TAB-BY-NAME REDEFINES WS-TAB-BY-NUM` where both sides' single
 * child - `WS-ENTRY-NAME`/`WS-ENTRY-NUM` - is `OCCURS 3 ... INDEXED BY ...`)
 * used to fall into the plain `real.length > 0 -> walk(real)` branch below
 * with NO OCCURS-awareness at all - its own elementary children (WS-NAME-KEY/
 * WS-NAME-VAL) were declared as bare scalar `def`s (occursDepth 0, plain
 * String/Int), while every OTHER registry that cares about this same name -
 * TABLE_REGISTRY (subscripting, SEARCH/SEARCH ALL's lookupTable) - had NO
 * entry for it at all (buildFieldRegistry's own OCCURS registration, in its
 * `walk()`, is only ever reached for an *ordinary* item, never one buried
 * inside this fallback). Two dishonest, disagreeing outcomes followed: (a) a
 * subscripted reference to one of these fields (`WS-NAME-KEY(1)`, or
 * generateSearchAll's own generated comparisons) called the bare scalar
 * `def` as if it were a 1-argument function - `String#apply(Int): Char` -
 * i.e. `wsNameKey(0)` compiled as "index into the string", not "subscript
 * into a table", a straight-up Scala compile error the instant the shape
 * being indexed didn't even line up (`value padTo is not a member of Char`,
 * r1313's actual failure); (b) even where that accidentally type-checked,
 * `generateSearch`'s own `lookupTable(tableName)` found nothing in
 * TABLE_REGISTRY and silently degraded to "no metadata found" - the SEARCH
 * ALL never ran at all.
 *
 * Fixed via the "all three registries honestly agree" route (documented
 * choice - see tests/oracle/README.md's round-13 table): a real byte-slice
 * table VIEW over the target's own storage is NOT implemented (this would
 * need per-element packed/binary-aware byte codecs threaded through a
 * REDEFINES-of-REDEFINES chain - out of scope for this fix), but every
 * registry that discovers this name now agrees on its SHAPE. This branch:
 *   - registers the exact same TABLE_REGISTRY entry (times/indexed/
 *     ascending/descending/dependingOn) buildFieldRegistry's own walk()
 *     would give a real OCCURS item - so lookupTable/generateSearch finds
 *     real metadata (the "SEARCH ALL's no-metadata-found gap" half of this
 *     fix: the redefining table no longer silently no-ops) and each
 *     INDEXED BY name gets its own real `Int` var, exactly like an ordinary
 *     table;
 *   - declares each of ITS elementary children as a `Vector[<baseType>]`
 *     honest stub (matching the Vector-per-OCCURS-dimension shape every
 *     other table-child registry entry has - occursDepth: 1) rather than a
 *     bare scalar, so a subscripted reference type-checks (`Vector#apply`,
 *     not `String#apply`) and only throws `NotImplementedError` if the
 *     table is actually walked/searched at runtime - never a compile error,
 *     never silently-wrong data.
 * A deeper nesting (a table-of-tables, or a named FILLER row) is not
 * exercised by any probe/corpus program - falls back to the original plain
 * scalar-stub walk for its own leaves instead of guessing.
 */
function todoStubRedefinesLines(redefiningItem, registry, tableRegistry) {
  const lines = [];

  function scalarStub(child) {
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

  // A table-child's own elementary rows (WS-NAME-KEY/WS-NAME-VAL) as honest
  // Vector-typed stubs - see this function's own doc comment above for why
  // Vector (not a bare scalar) is required for consistency with
  // TABLE_REGISTRY/generateSearchAll's own expectations.
  function occursRowStub(child) {
    const rowReal = (child.children || []).filter(c => !isLevel(c, 88));
    if (rowReal.length === 0) {
      // An elementary OCCURS item redefining an elementary OCCURS item (no
      // row structure at all) - same Vector-stub treatment, one level.
      const camel = toCamelCase(child.name);
      const baseType = scalaBaseType(child);
      lines.push(
        `  // REDEFINES ${redefiningItem.redefines}: ??? TODO - group-over-group REDEFINES with an OCCURS ` +
        `child (${child.name}) is not implemented as a true byte-slice table view; every element throws if read`
      );
      lines.push(`  def ${camel}: Vector[${baseType}] = ??? // TODO REDEFINES ${redefiningItem.redefines}: unsupported OCCURS shape`);
      lines.push(`  def ${camel}_=(v: Vector[${baseType}]): Unit = () // TODO REDEFINES ${redefiningItem.redefines}: write discarded (unsupported OCCURS shape)`);
      registry.set((child.name || '').toUpperCase(), {
        camel,
        scalaType: baseType,
        dataType: baseType === 'String' ? 'alphanumeric' : 'numeric',
        integerDigits: (child.pic && child.pic.integerDigits) || 0,
        decimalDigits: (child.pic && child.pic.decimalDigits) || 0,
        signed: !!(child.pic && child.pic.signed),
        editPattern: null,
        occursDepth: 1,
        picLength: (child.pic && child.pic.length) || 0,
        justified: false,
        blankWhenZero: false,
      });
      return;
    }
    for (const row of rowReal) {
      if (isLevel(row, 88) || row.isFiller || !row.name) continue;
      const rowRealChildren = (row.children || []).filter(c => !isLevel(c, 88));
      if (rowRealChildren.length > 0 || hasOccurs(row)) {
        // Row-of-groups or nested table - deeper than any probe/corpus shape
        // exercises; fall back to the plain scalar walk for its own leaves
        // (still avoids THIS function's actual bug - the outer table's own
        // OCCURS-ness - even though this inner shape stays unsupported too).
        scalarStub(row);
        continue;
      }
      const camel = toCamelCase(row.name);
      const baseType = scalaBaseType(row);
      lines.push(
        `  // REDEFINES ${redefiningItem.redefines}: ??? TODO - group-over-group REDEFINES with an OCCURS ` +
        `child (${child.name}) is not implemented as a true byte-slice table view; every element throws if read`
      );
      lines.push(`  def ${camel}: Vector[${baseType}] = ??? // TODO REDEFINES ${redefiningItem.redefines}: unsupported OCCURS shape`);
      lines.push(`  def ${camel}_=(v: Vector[${baseType}]): Unit = () // TODO REDEFINES ${redefiningItem.redefines}: write discarded (unsupported OCCURS shape)`);
      registry.set((row.name || '').toUpperCase(), {
        camel,
        scalaType: baseType,
        dataType: baseType === 'String' ? 'alphanumeric' : 'numeric',
        integerDigits: (row.pic && row.pic.integerDigits) || 0,
        decimalDigits: (row.pic && row.pic.decimalDigits) || 0,
        signed: !!(row.pic && row.pic.signed),
        editPattern: null,
        occursDepth: 1,
        picLength: (row.pic && row.pic.length) || 0,
        justified: false,
        blankWhenZero: false,
      });
    }
  }

  function walk(children) {
    for (const child of children) {
      if (isLevel(child, 88) || child.isFiller || !child.name) continue;

      if (hasOccurs(child)) {
        const occ = child.occurs || {};
        const idxCamels = (occ.indexedBy || []).map(toCamelCase);
        tableRegistry.set((child.name || '').toUpperCase(), {
          times: occursCount(child),
          indexed: idxCamels,
          ascending: (occ.ascending || []).map(n => String(n).toUpperCase()),
          descending: (occ.descending || []).map(n => String(n).toUpperCase()),
          dependingOn: occ.dependingOn ? toCamelCase(occ.dependingOn) : null,
        });
        (occ.indexedBy || []).forEach((idxName, i) => {
          const upperIdx = String(idxName).toUpperCase();
          if (registry.has(upperIdx)) return;
          lines.push(`  var ${idxCamels[i]}: Int = 1`);
          registry.set(upperIdx, {
            camel: idxCamels[i],
            scalaType: 'Int',
            dataType: 'numeric',
            integerDigits: 9,
            decimalDigits: 0,
            signed: true,
            editPattern: null,
            occursDepth: 0,
            picLength: 0,
          });
        });
        occursRowStub(child);
        continue;
      }

      const real = (child.children || []).filter(c => !isLevel(c, 88));
      if (real.length > 0) {
        walk(real);
        continue;
      }
      scalarStub(child);
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
function groupOverGroupRedefinesLines(item, targetItem, registry, tableRegistry, targetAbsOffset = 0) {
  const redefiningRealChildren = (item.children || []).filter(c => !isLevel(c, 88));

  // round-18 finding 6: OCCURS directly on the REDEFINES item ITSELF (not on
  // a nested row-group descendant of it - characterSlicedGroupRedefinesLines
  // already handles THAT shape, an OCCURS-bearing CHILD of the redefining
  // group) means item's own children are PER-ROW fields of a table, not
  // per-occurrence scalars. g07: `01 WS-SRC-ARR REDEFINES WS-SRC-TABLE
  // OCCURS 3 TIMES. 05 A-KEY PIC 9(3). 05 A-VAL PIC X(5).` - A-KEY/A-VAL are
  // each one field of EVERY one of the 3 rows, not a single scalar sliced
  // once. Before this fix, `hasOccurs(item)` was never even consulted here -
  // A-KEY/A-VAL always got a single, zero-parameter accessor (`def aKey:
  // Int`, sliced from only the FIRST occurrence's bytes) - a hard "method
  // aKey does not take parameters" compile error the moment PROCEDURE
  // DIVISION code subscripted it (`A-KEY(WS-IDX)`), exactly like any other
  // registered scalar field would reject a subscript.
  if (hasOccurs(item) && redefiningRealChildren.length > 0) {
    const count = occursCount(item);
    if (count > 1) {
      const rowLines = occursOnRedefinesItemLines(item, targetItem, redefiningRealChildren, registry, count, targetAbsOffset);
      if (rowLines) return rowLines;
      // Falls through to the ordinary (scalar, single-occurrence) handling
      // below only when the target's own shape can't be flattened at all
      // (see occursOnRedefinesItemLines' own doc comment) - matches this
      // function's pre-existing honest-decline behavior for that shape
      // rather than inventing a new failure mode.
    }
  }

  const textLeaves = flattenRedefinesLeaves(targetItem);

  // round-16 finding 1: flattenRedefinesLeaves' text-digit model is tried
  // FIRST (unchanged - byte-for-byte identical generated Scala to every
  // pre-round-16 program using this path), falling back to
  // flattenRedefinesLeavesBytes' byte-accurate codec model only for a shape
  // the text model can't represent at all (a signed and/or non-DISPLAY
  // target child - e.g. a SYNC-padded binary field) - and only THEN to the
  // honest todoStubRedefinesLines decline if neither model can represent
  // the target's shape.
  const ops = textLeaves
    ? textLeaves.map(textLeafOp)
    : (flattenRedefinesLeavesBytes(targetItem, targetAbsOffset) || []).map(byteLeafOp);

  if (ops.length === 0) {
    return todoStubRedefinesLines(item, registry, tableRegistry);
  }

  const flatName = `${toCamelCase(item.name)}BaseFlat`;
  const lines = [
    `  // REDEFINES ${item.redefines}: ${item.redefines} is a GROUP, not an elementary item - ${flatName}`,
    `  // is a synthetic flat-character view over its own children's storage (concatenated in`,
    `  // declaration order), so ${item.name}'s children below can character-slice it exactly`,
    `  // like a REDEFINES over a real PIC X target.`,
    ...buildFlatViewLines(flatName, ops),
  ];

  lines.push(...characterSlicedGroupRedefinesLines(redefiningRealChildren, flatName, registry));
  return lines;
}

/**
 * round-18 finding 6: builds TABLE (Vector) accessors for each of the
 * REDEFINES item's own children when OCCURS sits on the REDEFINES item
 * ITSELF (`count` occurrences of one row, each row being `realChildren` in
 * declaration order) - see groupOverGroupRedefinesLines' own doc comment
 * above for the motivating shape. Builds the identical synthetic flat-
 * character view over the TARGET's storage that the scalar (non-OCCURS)
 * path builds (flattenRedefinesLeavesAllowingFiller's text model first,
 * flattenRedefinesLeavesBytes' byte-accurate codec model second - the
 * FILLER-tolerant variant is needed here specifically because g07's own
 * target is a group of THREE bare FILLERs with no named fields of its own
 * at all), then slices each row's own children out of it positionally:
 * row `i`'s child at within-row byte offset `start` occupies
 * `flatName.substring(i*rowWidth + start, i*rowWidth + start + width)`.
 *
 * Only supports a DISPLAY (character/zoned-numeric), non-signed, non-nested
 * child - the same restriction flattenRedefinesLeaves/textLeafOp already
 * apply to the scalar case (a byte-accurate/signed/COMP child of the
 * REDEFINING item's own row is a rarer shape no corpus program exercises;
 * returns `null` in that case so the caller falls back to its pre-existing
 * scalar handling rather than emit a wrong table view).
 *
 * Each child's SETTER must rebuild the ENTIRE flat view, not just its own
 * row slices - a row's other children's bytes are interleaved with this
 * child's own (row 0: child A bytes then child B bytes, row 1: child A
 * bytes then child B bytes, ...), so overwriting only this child's own
 * positions the way a scalar REDEFINES child's setter does (prefix + new
 * middle + suffix, all contiguous) isn't possible here. Every sibling
 * child's CURRENT row value is read back through its own generated getter
 * (`<siblingCamel>(i)`) and re-encoded, exactly preserving it, while this
 * child's row values come from the new `v` being assigned.
 */
function occursOnRedefinesItemLines(item, targetItem, realChildren, registry, count, targetAbsOffset = 0) {
  const tolerantLeaves = flattenRedefinesLeavesAllowingFiller(targetItem);
  const ops = tolerantLeaves
    ? tolerantLeaves.map(textLeafOp)
    : (flattenRedefinesLeavesBytes(targetItem, targetAbsOffset) || []).map(byteLeafOp);
  if (ops.length === 0) return null;

  // Build each row-child's own within-row offset/width - restricted to a
  // plain DISPLAY, unsigned, non-nested, non-OCCURS-of-its-own child (see
  // this function's own doc comment).
  const specs = [];
  let rowOffset = 0;
  for (const child of realChildren) {
    if (child.isFiller || !child.name) return null;
    if ((child.children || []).some(c => !isLevel(c, 88))) return null;
    if (hasOccurs(child)) return null;
    const baseType = scalaBaseType(child);
    if (baseType !== 'Int' && baseType !== 'String') return null;
    const pic = child.pic && typeof child.pic === 'object' ? child.pic : null;
    if (!pic || !pic.length) return null;
    if (baseType === 'Int' && pic.signed) return null;
    specs.push({
      nameUpper: child.name.toUpperCase(),
      camel: toCamelCase(child.name),
      baseType,
      start: rowOffset,
      width: pic.length,
      intDigits: pic.integerDigits || pic.length,
      signed: !!pic.signed,
      justified: String(child.justified || '').toUpperCase() === 'RIGHT',
    });
    rowOffset += pic.length;
  }
  const rowWidth = rowOffset;

  const flatName = `${toCamelCase(item.name)}BaseFlat`;
  const lines = [
    `  // REDEFINES ${item.redefines}: OCCURS ${count} on ${item.name} itself - ${flatName} is a synthetic`,
    `  // flat-character view over the target's own storage; ${item.name}'s children below are`,
    `  // TABLE (Vector) accessors, one row of ${rowWidth} characters per occurrence, sliced from it.`,
    ...buildFlatViewLines(flatName, ops),
  ];

  function decodeExpr(spec, sliceExpr) {
    return spec.baseType === 'Int' ? `${sliceExpr}.toInt` : sliceExpr;
  }
  function encodeExpr(spec, valueExpr) {
    return spec.baseType === 'Int'
      ? `CobolFmt.digitsOf(BigDecimal(${valueExpr}), ${spec.intDigits}, 0)`
      : `CobolFmt.fitLeft(${valueExpr}, ${spec.width})`;
  }

  for (const spec of specs) {
    const rowSliceExpr = `${flatName}.substring(i * ${rowWidth} + ${spec.start}, i * ${rowWidth} + ${spec.start + spec.width})`;
    lines.push(`  def ${spec.camel}: Vector[${spec.baseType}] =`);
    lines.push(`    (0 until ${count}).map(i => ${decodeExpr(spec, rowSliceExpr)}).toVector`);

    const rowExprs = specs.map(s => encodeExpr(s, s === spec ? 'v(i)' : `${s.camel}(i)`));
    lines.push(`  def ${spec.camel}_=(v: Vector[${spec.baseType}]): Unit =`);
    lines.push(`    ${flatName} = (0 until ${count}).map(i => ${rowExprs.join(' + ')}).mkString`);

    // Register each row-child in FIELD_REGISTRY as an occursDepth: 1 table
    // field - the same shape characterSlicedGroupRedefinesLines' own
    // OCCURS-on-CHILD branch already registers (see its Vector[String]
    // case), so every existing subscripted-reference/DISPLAY/MOVE call site
    // treats a table field built this way identically to one built any
    // other way.
    registry.set(spec.nameUpper, {
      camel: spec.camel,
      scalaType: spec.baseType,
      dataType: spec.baseType === 'Int' ? 'numeric' : 'alphanumeric',
      integerDigits: spec.baseType === 'Int' ? spec.intDigits : 0,
      decimalDigits: 0,
      signed: spec.signed,
      editPattern: null,
      occursDepth: 1,
      picLength: spec.width,
      justified: spec.justified,
      blankWhenZero: false,
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
  //
  // round-13 finding 4: flat, whole-WORKING-STORAGE-section ordered list of
  // every elementary leaf (and FILLER) this walk has registered so far, in
  // physical declaration order - i.e. exactly the linear byte-layout order a
  // whole-group DISPLAY/MOVE concatenation (groupDisplayValueExpr/
  // scatterGroupFromString) already assumes for an ordinary group's own
  // children. A level-66 RENAMES item (parsed into item.renames/
  // renamesThrough - see parser/data-division-parser.js - but previously with
  // *zero* codegen anywhere: it fell through into the plain elementary-leaf
  // branch below like any ordinary field, getting its own disconnected flat
  // var that never actually aliased the fields it renames) is resolved by
  // finding its FROM/THRU endpoint names in this same flat list and slicing
  // the contiguous run between them (inclusive) - deliberately flattened
  // past any intermediate GROUP_REGISTRY nesting (not just the immediate
  // enclosing group's own children), since real COBOL RENAMES is defined
  // purely in terms of physical byte position and can legally span a nested
  // group boundary (e.g. renaming the tail of one 05-level group through the
  // head of the next) - a per-group-only child list couldn't represent that
  // at all. Each entry has the same `{ nameUpper, camel, info, groupKey:
  // null, isFiller }` shape groupRegistry's own child descriptors use, so the
  // resulting synthetic group (see the level-66 branch in the loop below)
  // slots directly into groupDisplayValueExpr/scatterGroupFromString/
  // generateGroupMove with no changes to any of them - RENAMES becomes "just
  // another group" from their point of view.
  const flatLeafOrder = [];
  // round-15 finding 1/2: `baseOffset` is the ABSOLUTE byte offset (from the
  // whole record's own start) at which THIS `list` begins - threaded down
  // through nested-group recursion (see the group branch below) exactly like
  // layout.js's itemByteLength now does, so a SYNC binary item's alignment
  // padding is computed against its true absolute record position, not a
  // position relative to whichever immediate enclosing (sub-)group's own
  // local `offset` happens to be 0 at. Defaults to 0 for the top-level calls
  // (`walk(wsItems, [], [])` and friends) below, which is already correct -
  // a top-level 01-record's own children genuinely do start at absolute 0.
  function walk(list, occursChain, ancestorNames, parentValueText, baseOffset = 0) {
    let offset = 0;
    // round-16 finding 1: every real (named, non-88) sibling's own ABSOLUTE
    // record offset (after its own SYNC padding, if any), keyed by its
    // uppercased COBOL name - populated below as this loop reaches each
    // item, consulted when a LATER sibling's own `.redefines` names one of
    // them (COBOL requires a REDEFINES target to be the immediately-
    // preceding same-level item in this same list, so it is always found
    // here by the time a redefines branch below needs it). Threaded into
    // redefinesAccessorLines so a REDEFINES of a GROUP target that itself
    // contains a SYNC-padded child computes that child's alignment against
    // the target's TRUE absolute position - exactly like this same walk()
    // already does for the target's own ordinary flat-var declaration (see
    // groupStartOffset below) - rather than silently assuming absolute 0.
    const itemAbsoluteOffsets = new Map();
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
          // OCCURS ... DEPENDING ON (round-10 finding 4): the live counter
          // field's own camelCase flat-var name (or null for a fixed-size
          // OCCURS table) - lets a WRITE of the enclosing record build a
          // variable-length concatenation driven by the counter's *current*
          // runtime value instead of always writing the fixed max count
          // (see expression-gen.js's odoDisplayValueExpr).
          dependingOn: occ.dependingOn ? toCamelCase(occ.dependingOn) : null,
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
        const targetAbsOffset = itemAbsoluteOffsets.get(String(item.redefines).toUpperCase()) ?? 0;
        const accessorLines = redefinesAccessorLines(item, registry, list, tableRegistry, targetAbsOffset);
        if (accessorLines.length) lines.push(...accessorLines);

        // round-17 finding 8: an 88-level condition-name declared under a
        // REDEFINES item (e.g. f13's `01 WS-FLAG-NUM REDEFINES WS-FLAG PIC
        // 9(1). 88 FLAG-LOW VALUE 0 1.`) was NEVER registered in
        // conditionRegistry at all - this whole `if (item.redefines)`
        // branch `continue`s before ever reaching the ordinary elementary-
        // leaf's own conditionRegistry registration loop further down (only
        // reached for a NON-redefines item), even though the parser
        // attaches `item.conditions` to a REDEFINES item exactly the same
        // way it does for an ordinarily-declared one (parser/data-division-
        // parser.js's `currentItem.conditions.push(...)` doesn't care
        // whether the item carries a REDEFINES clause). Left unregistered,
        // `EVALUATE TRUE WHEN FLAG-LOW` (and a plain `IF FLAG-LOW`/`SET
        // FLAG-LOW TO TRUE`) had no registry entry to resolve the condition
        // name to at all - a hard "Not found: flagLow" compile error.
        // Registered here using `registry.get(...)` for `item`'s own just-
        // declared info (the elementary-alias or byte-/character-sliced
        // accessor redefinesAccessorLines above just registered under
        // `item`'s own bare name) - exactly the same `{ info, values,
        // falseValue }` shape the ordinary path builds, so
        // level88ConditionExpr/evaluateConditionExpr need no changes at all
        // to consume it.
        for (const cond of item.conditions || []) {
          if (!cond || !cond.name) continue;
          const ownInfo = registry.get((item.name || '').toUpperCase()) || null;
          conditionRegistry.set(String(cond.name).toUpperCase(), {
            info: ownInfo,
            values: cond.values || [],
            falseValue: cond.falseValue || null,
          });
        }

        // round-17 finding 4 (companion bug uncovered while fixing f06's
        // SYNC-on-redefiner StringIndexOutOfBoundsException): a REDEFINES
        // item that is ITSELF a group (has real children of its own - e.g.
        // `01 WS-B REDEFINES WS-A` with B-LEAD/B-NUM children) never got
        // registered in groupRegistry/groupKeyRegistry/
        // groupByteLengthRegistry at all - this whole branch `continue`s
        // before ever reaching the ordinary group-registration code further
        // down this loop (only reached for a NON-redefines item), since
        // redefinesAccessorLines above already declares this item's own
        // children's accessors directly (character-/byte-sliced views over
        // the target - see characterSlicedGroupRedefinesLines - not a
        // recursive walk() call the way an ordinary group's children get
        // their own flat vars). Left unregistered, `FUNCTION LENGTH(WS-B)`
        // (and MOVE/DISPLAY of the bare group name WS-B) had nowhere to
        // resolve to at all - a hard "Not found: wsB" compile error, since a
        // group has no flat var of its own. Registered here, mirroring the
        // ordinary-group registration below, keyed off `registry`
        // (FIELD_REGISTRY) rather than `qualifiedRegistry` since a REDEFINES
        // item's own children are registered directly under their bare name
        // by redefinesAccessorLines's own helpers, not under a qualified
        // `name::parent` key.
        const realRedefiningChildren = (item.children || []).filter(c => !isLevel(c, 88));
        if (realRedefiningChildren.length > 0) {
          const parentUpper = (item.name || '').toUpperCase();
          const groupKey = [...ancestorNames, parentUpper].join('/');
          groupKeyRegistry.set(parentUpper, groupKey);
          groupRegistry.set(
            groupKey,
            realRedefiningChildren
              .map(c => {
                if (c.isFiller || !c.name) return null;
                const nameUpper = (c.name || '').toUpperCase();
                const info = registry.get(nameUpper) || null;
                const childHasRealChildren = (c.children || []).some(cc => cc.level !== 88);
                return {
                  nameUpper,
                  camel: info ? info.camel : toCamelCase(c.name),
                  info,
                  groupKey: childHasRealChildren ? `${groupKey}/${nameUpper}` : null,
                };
              })
              .filter(Boolean)
          );
          groupByteLengthRegistry.set(parentUpper, itemByteLength({ ...item, occurs: null }, targetAbsOffset));
        }
        continue; // shares storage with what it redefines - no offset advance
      }

      // round-13 finding 4: level-66 RENAMES - shares storage with the
      // contiguous run of sibling elementary items it renames (see
      // flatLeafOrder's own doc comment above), so - exactly like REDEFINES
      // just above - it consumes no `offset` of its own and gets no flat var
      // of its own; it is registered as a synthetic GROUP_REGISTRY entry
      // instead (its own bare name -> the sliced child list), which is all
      // groupDisplayValueExpr (DISPLAY of the renamed name) and
      // scatterGroupFromString (MOVE INTO the renamed name, wired in
      // generateMove - generator/expression-gen.js) need.
      if (isLevel(item, 66) && item.renames) {
        const renameNameUpper = (item.name || '').toUpperCase();
        const fromUpper = String(item.renames).toUpperCase();
        const toUpper = String(item.renamesThrough || item.renames).toUpperCase();
        const fromIdx = flatLeafOrder.findIndex(e => e.nameUpper === fromUpper);
        const toIdx = flatLeafOrder.findIndex(e => e.nameUpper === toUpper);
        if (fromIdx !== -1 && toIdx !== -1 && fromIdx <= toIdx) {
          const children = flatLeafOrder.slice(fromIdx, toIdx + 1);
          groupRegistry.set(renameNameUpper, children);
          groupKeyRegistry.set(renameNameUpper, renameNameUpper);
          const totalWidth = children.reduce((sum, c) => {
            if (!c.info) return sum;
            return sum + (c.info.picLength || (c.info.integerDigits || 0) + (c.info.decimalDigits || 0));
          }, 0);
          groupByteLengthRegistry.set(renameNameUpper, totalWidth);
        } else {
          // FROM/THRU endpoint not found as a registered elementary sibling
          // (e.g. it names an OCCURS table member, or a group rather than an
          // elementary item - not a shape any corpus program or this fix
          // targets) - an honest, visible comment; no accessor is generated,
          // so any later reference to this RENAMES name falls through to
          // whatever generic fallback that call site already has for an
          // unregistered name (never a guessed/wrong value).
          lines.push(
            `  // RENAMES ${item.name}: unsupported range (THRU endpoint(s) not found as ` +
            'contiguous registered elementary sibling(s)) - no accessor generated'
          );
        }
        continue; // shares storage with what it renames - no offset advance
      }

      // round-15 finding 1: a SYNC binary item's alignment padding must be
      // consulted HERE too, exactly like layout.js's itemByteLength already
      // does when summing a group's total width - otherwise this walk's own
      // `offset` (used below to slice this item's inherited span out of
      // `parentValueText`, and threaded down as the absolute base offset for
      // any nested group) silently drifts out of sync with the byte position
      // itemByteLength itself assigns this same item, corrupting which bytes
      // of the group's own VALUE literal this item (and everything after it)
      // reads. `groupStartOffset` (this item's own ABSOLUTE record offset,
      // after padding) is what a nested group's own recursive walk() call
      // needs too - see round-15 finding 2's baseOffset threading below.
      const padBefore = syncPadBytes(item, baseOffset + offset);
      offset += padBefore;
      const groupStartOffset = baseOffset + offset;
      if (item.name) itemAbsoluteOffsets.set(item.name.toUpperCase(), groupStartOffset);

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
      const itemWidth = itemByteLength(item, groupStartOffset);
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
        const ownGroupValueText = ownValueStorageText(item, itemByteLength({ ...item, occurs: null }, groupStartOffset));
        const effectiveValueText = ownGroupValueText ?? inheritedSlice;
        // round-15 finding 2: thread this group's own absolute start offset
        // down as the new baseOffset for its children's recursive walk() -
        // see the doc comment on walk()'s own `baseOffset` parameter above.
        walk(realChildren, ownCount ? [...occursChain, ownCount] : occursChain, [...ancestorNames, parentUpper], effectiveValueText, groupStartOffset);

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
        groupByteLengthRegistry.set(parentUpper, itemByteLength({ ...item, occurs: null }, groupStartOffset));
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
          usage: (item.usage || 'DISPLAY').toUpperCase(),
          occursDepth: fullChain.length,
          picLength: fillerPic?.length || 0,
          justified: false,
          blankWhenZero: false,
        };
        // round-13 finding 4: only a non-OCCURS FILLER (fullChain.length ===
        // 0) is added to flatLeafOrder - a FILLER *inside* a table has no
        // single scalar byte position for a RENAMES range to land on (same
        // restriction groupDisplayValueExpr already applies to a table child
        // via TABLE_REGISTRY, see the level-66 branch's own fallback comment
        // above for what happens when a RENAMES endpoint can't be found).
        if (fullChain.length === 0) {
          flatLeafOrder.push({ nameUpper: null, camel: fillerCamel, info: item._fillerInfo, groupKey: null, isFiller: true });
        }
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
        // round-10 finding 3: this item's own USAGE clause (upper, defaults
        // to 'DISPLAY') - lets expression-gen.js's WRITE codegen tell a
        // packed/binary (non-DISPLAY) group child apart from a plain
        // zoned-DISPLAY one, which is what decides whether a WRITE of the
        // whole group must go through the record's byte-level format()
        // instead of the plain display-text concatenation path (see
        // groupContainsNonDisplay/writeContentAndMode).
        usage: (item.usage || 'DISPLAY').toUpperCase(),
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
        conditionRegistry.set(String(cond.name).toUpperCase(), {
          info,
          values: cond.values || [],
          falseValue: cond.falseValue || null,
        });
      }

      // round-13 finding 4: only a non-OCCURS elementary leaf (fullChain.length
      // === 0) is added to flatLeafOrder - same restriction as the FILLER
      // branch above (a table member has no single scalar byte position a
      // RENAMES range's FROM/THRU endpoint can land on).
      if (fullChain.length === 0) {
        flatLeafOrder.push({ nameUpper, camel, info, groupKey: null, isFiller: false });
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
    return { topLevelParagraphs: ast.procedure.paragraphs, sections: [], declaratives: [] };
  }
  // Format 2: ast.procedures is a ProcedureDivision object with paragraphs + sections.
  if (ast.procedures?.paragraphs && Array.isArray(ast.procedures.paragraphs)) {
    const sections = Array.isArray(ast.procedures.sections) ? ast.procedures.sections : [];
    // round-10 finding 1: DECLARATIVES ... END DECLARATIVES SECTIONs (see
    // parser/procedure-parser.js's parseDeclaratives) - deliberately kept
    // separate from `sections` above (never flattened into the normal
    // fall-through flow generateProgramFlowLines/generateAllMethods build).
    const declaratives = Array.isArray(ast.procedures.declaratives) ? ast.procedures.declaratives : [];
    return { topLevelParagraphs: ast.procedures.paragraphs, sections, declaratives };
  }
  // Format 3: ast.procedures is an array directly.
  if (Array.isArray(ast.procedures)) {
    return { topLevelParagraphs: ast.procedures, sections: [], declaratives: [] };
  }
  return { topLevelParagraphs: [], sections: [], declaratives: [] };
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
 * round-10 finding 1 (registry-population ordering fixed by round-13 finding
 * 3 - see collectDeclarativeHandlers's doc comment below): generate one
 * Scala method per DECLARATIVES SECTION (reusing generateSectionMethod
 * exactly as an ordinary section would use it - a DECLARATIVES section is
 * structurally identical, just excluded from `sections`/the normal
 * fall-through chain, see splitProcedureDivision), plus the two lookup
 * registries (fileName -> method name, mode -> method name) file-io-gen.js's
 * generateOpen and expression-gen.js's generateReadStatement consult to
 * invoke the right one on a file-operation failure - see those modules' own
 * setDeclarativeHandlers/declarativeHandlerFor.
 *
 * Only a `USE AFTER [STANDARD] ERROR PROCEDURE ON ...` clause (useClause.kind
 * === 'ERROR') is wired into either registry; any other USE form
 * (useClause.kind === 'UNSUPPORTED', e.g. USE FOR DEBUGGING) still gets its
 * body compiled into a real (if arguably unreachable) method - an honest,
 * visible TODO comment marks it as never invoked, rather than silently
 * dropping the section or guessing at a wiring this generator doesn't
 * understand.
 *
 * round-13 finding 3 (SEVERE): this used to be a single pass - walk each
 * `decl` in order, generate its method body via generateSectionMethod/
 * generateMethod, THEN (only at the very end of that same iteration) add its
 * own fileHandlers/modeHandlers entries. The caller (convertProgramAst,
 * below) only calls setDeclarativeHandlersExpr/FileIO - which install the
 * registries expression-gen.js's/file-io-gen.js's declarativeHandlerFor
 * actually reads from - AFTER this whole function returns. That meant ANY
 * file operation generated *inside* a DECLARATIVES body saw registries that
 * were empty (for a single self-retriggering handler: r13-09b's
 * FILE-A-HANDLER-PARA's own `OPEN INPUT FILE-A` retry, generated before its
 * own entry existed yet) or only partially populated (for a two-handler
 * reentrancy case where handler A's body triggers handler B, and B is
 * declared textually after A - r13-09's shape - B's entry didn't exist yet
 * either when A's body was generated). Every corpus-covered case that
 * "happened to work" only did so because either the retriggered file
 * operation's own compile-time codegen doesn't actually consult
 * declarativeHandlerFor (a bare OPEN with no FILE STATUS/AT END/USE wiring
 * at all), or no DECLARATIVES body in the corpus ever itself performed a
 * file operation on a file with a declarative handler.
 *
 * Fixed with a genuine two-pass split: collectDeclarativeHandlers walks
 * every `decl`'s own useClause.targets ONLY (no codegen at all, so nothing
 * downstream can observe a partial registry) and returns the complete
 * fileHandlers/modeHandlers maps; the caller installs those via
 * setDeclarativeHandlersExpr/FileIO BEFORE calling
 * generateDeclarativeMethodBodies (the actual codegen pass, below) - so by
 * the time ANY declarative body (or, per the existing round-10 finding 1
 * comment above, the ordinary PROCEDURE DIVISION body too) is generated,
 * every handler - including a handler's own file, and every OTHER handler in
 * the same DECLARATIVES block, regardless of textual order - is already
 * visible to declarativeHandlerFor.
 *
 * Returns `{ methods: '', fileHandlers: new Map(), modeHandlers: new Map() }`
 * for the overwhelmingly common case (no DECLARATIVES at all) - harmless for
 * every one of the 187 pre-existing corpus programs (which don't use
 * DECLARATIVES, or whose DECLARATIVES bodies happen not to perform a file
 * operation on a handler-guarded file) *within a single conversion*.
 *
 * IMPORTANT (cross-call state leak, found post-round-13): this must NOT skip
 * installing the (empty) registries in this no-DECLARATIVES case. Earlier,
 * generateDeclarativeSupport's early-return branch below returned the empty
 * maps to its own caller but never called setDeclarativeHandlersExpr/FileIO
 * with them - leaving whatever fileHandlers/modeHandlers a *previous*
 * convertToScala() call in the same process had installed (DECL_FILE_HANDLERS/
 * DECL_MODE_HANDLERS in expression-gen.js and file-io-gen.js are module-level
 * `let`s, not per-call state) still active. A program with no DECLARATIVES at
 * all converted right after one that has them would then have its OPEN/READ
 * failure paths incorrectly resolve to the *previous* program's declarative
 * handler method (which doesn't even exist in this program's generated
 * object) - a hard compile error. Every branch of generateDeclarativeSupport
 * must call both setters, even when the maps are empty, so each conversion
 * starts from a clean slate regardless of what ran before it in-process.
 */
function collectDeclarativeHandlers(declaratives) {
  const fileHandlers = new Map();
  const modeHandlers = new Map();
  for (const decl of declaratives || []) {
    const methodName = toMethodName(decl.name);
    const useClause = decl.useClause;
    if (!useClause || useClause.kind !== 'ERROR') continue;
    for (const target of useClause.targets || []) {
      if (target.kind === 'FILE' && target.name) {
        fileHandlers.set(String(target.name).toUpperCase(), methodName);
      } else if (target.kind) {
        modeHandlers.set(String(target.kind).toUpperCase(), methodName);
      }
    }
  }
  return { fileHandlers, modeHandlers };
}

/**
 * Second pass - generate every DECLARATIVES SECTION's own method body. Must
 * only be called AFTER the caller has already installed
 * collectDeclarativeHandlers's registries via
 * setDeclarativeHandlersExpr/FileIO (round-13 finding 3 - see
 * collectDeclarativeHandlers's doc comment above), so any file operation
 * inside a declarative body itself resolves against the complete registry,
 * not a partial or empty one.
 */
function generateDeclarativeMethodBodies(declaratives, indent = 1) {
  const methodTexts = [];
  for (const decl of declaratives || []) {
    const useClause = decl.useClause;

    if (!useClause || useClause.kind !== 'ERROR') {
      methodTexts.push(
        `${'  '.repeat(indent)}// DECLARATIVES SECTION "${decl.name}": unsupported USE form - ` +
        'compiled below but never invoked from any file-operation failure path'
      );
    }

    methodTexts.push(generateSectionMethod(decl, indent, new Set()));
    // generateSectionMethod's own nested fall-through steps call each
    // paragraph's *flat top-level method* by name (exactly like
    // generateAllMethods' ordinary-section handling does) - that flat
    // method has to actually exist somewhere, which generateSectionMethod
    // itself does not generate (mirrors generateAllMethods, which always
    // emits both: one flat method per paragraph, plus the section wrapper).
    // A paragraphless section (direct statements under the SECTION header)
    // needs no separate paragraph methods - generateSectionMethod's own
    // returned method already IS the flat method in that case.
    if (decl.paragraphs && decl.paragraphs.length > 0) {
      for (const para of decl.paragraphs) {
        methodTexts.push(generateMethod(para, indent));
      }
    }
  }
  return methodTexts.join('\n\n');
}

/**
 * round-13 finding 3: orchestrates the two-pass split above -
 * collectDeclarativeHandlers (no codegen) THEN, only after the caller
 * installs its result, generateDeclarativeMethodBodies (real codegen). Kept
 * as a single entry point so convertProgramAst's own call site only changes
 * from one call to a short, explicit three-step sequence - see its own call
 * site below for why the registry-install step must sit in between.
 */
function generateDeclarativeSupport(ast, indent = 1) {
  const { declaratives } = splitProcedureDivision(ast);
  if (!declaratives || declaratives.length === 0) {
    // Must still (re)install the (empty) registries - see this function's
    // doc comment above for the cross-call leak this guards against. Do NOT
    // early-return before calling the setters.
    const fileHandlers = new Map();
    const modeHandlers = new Map();
    setDeclarativeHandlersExpr(fileHandlers, modeHandlers);
    setDeclarativeHandlersFileIO(fileHandlers, modeHandlers);
    return { methods: '', fileHandlers, modeHandlers };
  }
  const { fileHandlers, modeHandlers } = collectDeclarativeHandlers(declaratives);
  setDeclarativeHandlersExpr(fileHandlers, modeHandlers);
  setDeclarativeHandlersFileIO(fileHandlers, modeHandlers);
  const methods = generateDeclarativeMethodBodies(declaratives, indent);
  return { methods, fileHandlers, modeHandlers };
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

  // Cross-program CALL_PROGRAM_REGISTRY (round-7 finding 1) - populated only
  // for a multi-PROGRAM-ID source, via `opts.callProgramRegistry` which
  // generateMultiProgramScala below passes through on every one of its
  // per-program generateScala calls (the *same* full-source registry each
  // time, so a forward CALL reference still resolves - see that function's
  // own doc comment). Always (re)installed here - explicitly to `new Map()`
  // for the ordinary case (no callProgramRegistry option, ie. every
  // standalone single-program conversion, which is what index.js's
  // convertToScala calls for any non-multi-PROGRAM-ID source) - rather than
  // relying on generateMultiProgramScala to clean up after itself once it's
  // done with its own per-source registry. This is what actually closes the
  // leak: previously CALL_PROGRAM_REGISTRY was only ever set by
  // generateMultiProgramScala (populated before its per-program loop, reset
  // to an empty Map after it), so an exception partway through that loop
  // (before the post-loop reset ran) - or simply this module never having
  // run generateMultiProgramScala's reset step for some other reason - would
  // leave a *previous, unrelated* multi-program conversion's registry
  // visible to every later plain generateScala() call in the same process,
  // exactly the same class of cross-call leak as the DECLARATIVES handler
  // registries (see generateDeclarativeSupport's doc comment below). Passing
  // the registry through as an explicit per-call value instead of leaving it
  // as ambient module state that only one caller sets/clears removes the
  // leak vector entirely - every generateScala call now installs the
  // registry it actually wants, unconditionally, regardless of what any
  // earlier call in the process left behind.
  setCallProgramRegistry(
    opts.callProgramRegistry instanceof Map ? opts.callProgramRegistry : new Map()
  );

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

  // Cosmetic determinism only (see expression-gen.js's resetCallRetSeq doc
  // comment for the bug this counter itself fixes) - every generateScala()
  // call starts its own program's `_callRet<N>` numbering fresh at 0.
  resetCallRetSeq();

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

  // DECLARATIVES `USE AFTER STANDARD ERROR PROCEDURE` handler methods +
  // registries (round-10 finding 1, registry-population ordering fixed by
  // round-13 finding 3) - generateDeclarativeSupport itself now installs the
  // fileHandlers/modeHandlers registries (via setDeclarativeHandlersExpr/
  // FileIO) BEFORE generating any declarative method body, so a file
  // operation inside a DECLARATIVES section - including a handler retrying
  // its own OPEN, or one handler's body triggering another - already sees
  // the complete registry; see generateDeclarativeSupport's own doc comment
  // for the full two-pass fix. This also still runs before generateMethods/
  // generateMainMethod below (the ordinary PROCEDURE DIVISION body) and
  // before file-io-gen.js's generateOpen is ever invoked for this program.
  const declarativeSupport = generateDeclarativeSupport(ast, 1);

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

  // DECLARATIVES error-handler methods (round-10 finding 1) - generated
  // ahead of the ordinary PROCEDURE DIVISION methods below, but excluded
  // from `sections`/normal PERFORM/fall-through resolution entirely (see
  // splitProcedureDivision) - only reachable via the file-I/O failure paths
  // wired up in file-io-gen.js's generateOpen/expression-gen.js's
  // generateReadStatement.
  if (declarativeSupport.methods) {
    sections.push('');
    sections.push('  // DECLARATIVES (USE AFTER ERROR PROCEDURE handlers)');
    sections.push(declarativeSupport.methods);
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
/**
 * round-22 finding 1: builds the ordered per-USING-parameter "leaf shape"
 * list a RECURSIVE program's entry() needs - one `{ camel, scalaType }`
 * per plain scalar parameter, or the flattened list of elementary children
 * flattenGroupLeaves (generator/expression-gen.js) finds for a GROUP
 * parameter - or `null` overall the instant any single parameter's shape
 * can't be resolved this way (an unregistered name, or a GROUP whose own
 * flattenGroupLeaves bails - an OCCURS-bearing child, a FILLER child, or a
 * child with no registered field info at all).
 *
 * This is the single shared decision generateEntryMethod's own RECURSIVE
 * gating (below) and generateMultiProgramScala's pre-loop callRegistry
 * construction both consult - see generateMultiProgramScala's own doc
 * comment on why the two call sites must agree bit-for-bit on the same
 * program: this one runs AFTER this ast's own GROUP_REGISTRY/TABLE_REGISTRY
 * globals are installed (generateEntryMethod's call site, mid-generateScala),
 * the other BEFORE any program's globals are installed at all (every
 * program's callRegistry entry is built up front) - so it takes the
 * relevant registries as explicit parameters (defaulting to the
 * currently-installed globals via flattenGroupLeaves's own defaults) rather
 * than reading GROUP_REGISTRY/TABLE_REGISTRY directly, so the exact same
 * traversal logic works correctly at both times.
 */
function computeParamLeafShapes(usingNames, fieldRegistry, groupRegistry, groupKeyRegistry, tableRegistry) {
  const shapes = [];
  for (const rawName of usingNames) {
    const name = String(rawName);
    const nameUpper = name.toUpperCase();
    const info = fieldRegistry.get(nameUpper);
    if (info) {
      shapes.push([{ camel: toCamelCase(name), scalaType: info.scalaType }]);
      continue;
    }
    const groupKey = (groupKeyRegistry && groupKeyRegistry.get(nameUpper)) || nameUpper;
    if (!groupRegistry || !groupRegistry.has(groupKey)) {
      // Unregistered name (defensive - every corpus program's LINKAGE item
      // is registered): treat as a single opaque String leaf, matching
      // generateEntryMethod's own scalarType fallback for an unresolved
      // parameter.
      shapes.push([{ camel: toCamelCase(name), scalaType: 'String' }]);
      continue;
    }
    const leaves = flattenGroupLeaves(groupKey, groupRegistry, tableRegistry);
    if (leaves == null) return null;
    shapes.push(leaves);
  }
  return shapes;
}

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

  // round-21 finding 2 (extended by round-22 finding 1 to also cover a GROUP
  // LINKAGE parameter): a RECURSIVE program (PROGRAM-ID ... RECURSIVE - can
  // CALL itself while an outer activation is still on the Scala call stack)
  // must NOT model its own LINKAGE SECTION parameter(s) as shared
  // module-level `var`s the way the ordinary convention below safely does
  // for a non-recursive callee - see generateRecursiveEntryMethod's own doc
  // comment for the full bug this avoids and why. Gated on every LINKAGE
  // parameter's own leaf shape being resolvable (computeParamLeafShapes,
  // above): a plain scalar is trivially one leaf; a GROUP parameter's leaves
  // are its own elementary children (flattenGroupLeaves,
  // generator/expression-gen.js) - only a GROUP containing an OCCURS table,
  // a FILLER child, or a child with no registered field info at all still
  // falls through to the ordinary convention below (an out-of-scope shape no
  // corpus program exercises).
  const paramLeafShapes = computeParamLeafShapes(
    usingNames, fieldRegistry, getGroupRegistry(), getGroupKeyRegistry(), getTableRegistry()
  );
  if (isRecursiveProgram(ast) && paramInfos.length > 0 && paramLeafShapes !== null) {
    return generateRecursiveEntryMethod(paramInfos, paramLeafShapes, units, ambiguousNames, indent);
  }

  // round-12 finding 3: every parameter gets a default (its type's own
  // zero/spaces value, matching real COBOL's un-passed-LINKAGE-item
  // semantics - see expression-gen.js's defaultZeroValueForScalaType) so a
  // CALL with fewer USING operands than this program's own LINKAGE SECTION
  // declares still compiles: Scala allows omitting any number of *trailing*
  // positional arguments as long as every omitted one has a default, and
  // generateCall (expression-gen.js) never pads its own argument list out to
  // this method's full arity - it simply passes exactly as many arguments as
  // the CALL statement itself supplied.
  const paramList = paramInfos
    .map((p, i) => `_arg${i}: ${p.scalaType} = ${defaultZeroValueForScalaType(p.scalaType)}`)
    .join(', ');
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
 * round-21 finding 2 (extended by round-22 finding 1 to also cover a GROUP
 * LINKAGE parameter - see below): CALL entry point for a RECURSIVE program -
 * see generateEntryMethod's own doc comment above for the ordinary,
 * non-recursive case this specializes, and isRecursiveProgram/its own call
 * site for the gating condition (every LINKAGE parameter's own leaf shape
 * resolvable via computeParamLeafShapes).
 *
 * The bug this fixes: the ordinary convention above assigns each incoming
 * argument into a shared, module-level `var` (e.g. `lsDepth = _arg0`) before
 * running the program's own paragraphs, then returns that SAME var's final
 * value for the caller-side writeback (generateCall's "value-in/tuple-out",
 * generator/expression-gen.js). That is safe for a non-recursive callee -
 * only one activation is ever mid-flight at a time - but a RECURSIVE program
 * can CALL itself while an outer activation's own entry() call is still on
 * the Scala stack; the inner activation's `lsDepth = _arg0` assignment
 * overwrites the very same var the outer activation is still using, so once
 * the inner call returns, the outer activation's own subsequent reads of its
 * LINKAGE parameter silently observe the INNER activation's value instead of
 * its own (verified against installed GnuCOBOL - see
 * tests/corpus/proc/j10-recursive-call-ws.cbl's own header comment for the
 * full oracle trace: the outermost call must still read back its OWN
 * original parameter value, `EXIT DEPTH=01`, even though two deeper
 * recursive activations both legitimately share one aliased storage cell
 * and both correctly read `EXIT DEPTH=03`).
 *
 * Real cobc does not have this problem because a BY REFERENCE CALL passes
 * the ADDRESS of whatever variable the caller named - each activation's own
 * LINKAGE item is a true alias of that one specific variable, never a fresh
 * copy. This reproduces that aliasing directly: instead of copying the
 * incoming value into a module var, entry() accepts a getter/setter CLOSURE
 * pair per parameter (`_getN: () => T`, `_setN: T => Unit`) built by the
 * CALLER (generateCall, generator/expression-gen.js) to read/write whatever
 * variable expression was actually passed - a live alias of the caller's own
 * storage, exactly like cobc's own pointer. A local `def <camel>: T =
 * _getN()` / `def <camel>_=(v: T): Unit = _setN(v)` pair (Scala's own
 * getter/setter assignment sugar - the same pattern round-3 finding 6's
 * REDEFINES-of-GROUP accessor pair already uses) then lets every reference
 * to the LINKAGE item elsewhere in this program's body read/write straight
 * through to whichever variable the CURRENT activation was actually called
 * with, with zero changes needed to how expression-gen.js reads/writes an
 * ordinary identifier (Scala resolves `lsDepth`/`lsDepth = x` to the nearest
 * lexically enclosing `def`/`def ..._=`, exactly as if it were a real var).
 *
 * Because these getter/setter defs are local to entry()'s own call - Scala's
 * ordinary per-call parameter/local scoping, no different from any other
 * recursive method - every recursive self-CALL creates its OWN fresh
 * binding, entirely independent of any other activation's, exactly matching
 * cobc's own per-activation LINKAGE pointer. Every paragraph reachable from
 * this program's entry point is nested as a local `def` *inside* entry()
 * itself (body-duplicating - generateProgramFlowLinesNested, mirroring
 * generatePerformThruMethod's existing `renderNestedFallthroughDefs`
 * pattern, NOT the ordinary `generateProgramFlowLines`/
 * `renderNestedFallthroughSteps` wrapper that calls shared TOP-LEVEL
 * paragraph methods) so each paragraph's own body closes over THIS
 * SPECIFIC call's own getter/setter defs, not some other activation's.
 *
 * No return value at all (`Unit`, unlike the ordinary convention's
 * return-then-caller-assigns writeback): any assignment to the LINKAGE item
 * anywhere in this program's body already writes straight back through the
 * setter closure, live, the instant it happens - matching cobc's own
 * continuous aliasing, not a single point-in-time round trip after the
 * whole CALL returns.
 *
 * WORKING-STORAGE itself is deliberately left exactly as before (a shared,
 * module-level `var`, unconditionally, recursive or not) - this program's
 * own WORKING-STORAGE items being shared/static across every recursive
 * activation is cobc's own confirmed, reproducible behavior for a RECURSIVE
 * program (see j10's own header comment), not a bug to fix.
 *
 * round-22 finding 1: a GROUP LINKAGE parameter has no single flat Scala var
 * of its own the way a scalar parameter does (see groupDisplayValueExpr's own
 * doc comment, generator/expression-gen.js) - only its own elementary
 * children do, each with its own flat var, exactly like a WORKING-STORAGE
 * group's own children. `paramLeafShapes` (computeParamLeafShapes, above -
 * the SAME list generateEntryMethod's own gating already computed to decide
 * this function should even run) is this program's LINKAGE SECTION USING
 * list, already flattened into one ordered leaf-descriptor list per
 * parameter: a 1-element list for a plain scalar, or one element per
 * elementary child (recursing into any nested group) for a GROUP parameter.
 * Flattening every parameter's own leaf list together (`.flat()`) and
 * building one getter/setter closure pair PER LEAF - instead of per
 * parameter - extends the exact same per-scalar aliasing trick to a GROUP
 * parameter's children: each child gets its own local `def <camel>: T =
 * _getN()` / `def <camel>_=(v: T): Unit = _setN(v)` pair, so every reference
 * to that child elsewhere in this program's body (already emitted as a bare
 * `<camel>` identifier - GROUP children are flattened to their own named
 * vars the same way a WORKING-STORAGE group's are) resolves to this
 * activation's own live alias, with zero changes needed anywhere else in the
 * generator.
 */
function generateRecursiveEntryMethod(paramInfos, paramLeafShapes, units, ambiguousNames, indent = 1) {
  const indentStr = '  '.repeat(indent);
  const bi = '  '.repeat(indent + 1);

  const flatLeaves = paramLeafShapes.flat();

  const paramList = flatLeaves
    .map((leaf, i) =>
      `_get${i}: () => ${leaf.scalaType} = () => ${defaultZeroValueForScalaType(leaf.scalaType)}, ` +
      `_set${i}: ${leaf.scalaType} => Unit = (_: ${leaf.scalaType}) => ()`
    )
    .join(', ');

  const lines = [
    `${indentStr}// round-21 finding 2 (extended by round-22 finding 1 for a GROUP LINKAGE`,
    `${indentStr}// parameter): RECURSIVE program's own CALL entry point - see`,
    `${indentStr}// generateRecursiveEntryMethod's own doc comment (generator/scala-generator.js)`,
    `${indentStr}// for the per-call-activation LINKAGE aliasing this uses instead of the`,
    `${indentStr}// ordinary shared-module-var convention generateEntryMethod uses for a`,
    `${indentStr}// non-recursive callee - one getter/setter closure pair per LEAF (a GROUP`,
    `${indentStr}// parameter's own elementary children), not per parameter.`,
    `${indentStr}def entry(${paramList}): Unit =`,
  ];
  flatLeaves.forEach((leaf, i) => {
    lines.push(`${bi}def ${leaf.camel}: ${leaf.scalaType} = _get${i}()`);
    lines.push(`${bi}def ${leaf.camel}_=(v: ${leaf.scalaType}): Unit = _set${i}(v)`);
  });
  lines.push(...generateProgramFlowLinesNested(units, indent + 1, ambiguousNames));

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
 *
 * Post-leak-fix: this registry is threaded through to each per-program
 * generateScala() call explicitly, via `programOpts.callProgramRegistry`,
 * rather than left as ambient module state this function alone sets before
 * its loop and clears after. generateScala itself now (re)installs
 * CALL_PROGRAM_REGISTRY unconditionally on every call (defaulting to an empty
 * Map when no callProgramRegistry option is given) - see its own doc comment
 * for the cross-call leak this closes (a prior multi-program conversion's
 * registry bleeding into a later, unrelated single-program one, including via
 * an exception skipping this function's old post-loop reset).
 */
export function generateMultiProgramScala(programs, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const callRegistry = new Map();
  for (const { programId, ast } of programs) {
    const name = programId || extractProgramName(ast);
    const objectName = toPascalCase(name);
    const usingNames = (ast.procedures?.using || []).map(n => (typeof n === 'string' ? n : (n?.name || n)));
    // round-12 finding 4: per-parameter Scala type (mirrors
    // generateEntryMethod's own paramInfos lookup exactly) so a caller-side
    // CALL ... USING ... OMITTED (generator/expression-gen.js's generateCall)
    // can substitute a type-correct zero/spaces default in that positional
    // slot instead of guessing "String" for every callee.
    const {
      registry: linkageFieldRegistry,
      groupRegistry: linkageGroupRegistry,
      groupKeyRegistry: linkageGroupKeyRegistry,
      tableRegistry: linkageTableRegistry,
    } = buildFieldRegistry(ast);
    const paramTypes = usingNames.map(n => linkageFieldRegistry.get(String(n).toUpperCase())?.scalaType || 'String');
    // round-21 finding 2 (extended by round-22 finding 1 to also cover a
    // GROUP LINKAGE parameter): whether this program qualifies for the
    // per-call-activation LINKAGE aliasing generateRecursiveEntryMethod
    // builds (see its own doc comment) - RECURSIVE-flagged, at least one
    // LINKAGE parameter, and every one of them resolvable into an ordered
    // leaf-shape list (computeParamLeafShapes, above): a plain scalar
    // trivially is; a GROUP parameter is too UNLESS it contains an OCCURS
    // table, a FILLER child, or a child with no registered field info at all
    // (flattenGroupLeaves' own bail-outs - an out-of-scope shape no corpus
    // program exercises, which keeps the ordinary value-in/tuple-out
    // convention entirely). Computed from THIS ast's own freshly-built
    // groupRegistry/groupKeyRegistry/tableRegistry, not the global
    // isRegisteredGroupName/resolveGroupKey/flattenGroupLeaves-default
    // helpers (generator/expression-gen.js) - this loop runs for every
    // program *before* any of their generateScala calls install those
    // globals for the program actually being inspected, so the globals
    // cannot be trusted here. generateEntryMethod (the callee side, invoked
    // later, during this exact program's own generateScala call, once its
    // globals are correctly installed) recomputes the identical gating
    // condition independently via those now-valid globals - both sides must
    // agree on the same decision for a given program, or the caller's
    // closures-vs-values shape here would mismatch the callee's actual
    // entry() signature and fail to compile.
    const paramLeafShapes = computeParamLeafShapes(
      usingNames, linkageFieldRegistry, linkageGroupRegistry, linkageGroupKeyRegistry, linkageTableRegistry
    );
    const recursive = isRecursiveProgram(ast) && usingNames.length > 0 && paramLeafShapes !== null;
    callRegistry.set(String(name).toUpperCase(), {
      objectName,
      paramCount: usingNames.length,
      paramTypes,
      paramLeafShapes: recursive ? paramLeafShapes : null,
      recursive,
    });
  }

  const codeSections = [];
  programs.forEach(({ programId, ast }, i) => {
    const name = programId || extractProgramName(ast);
    const programOpts = {
      ...opts,
      objectName: toPascalCase(name),
      skipPreamble: i > 0,
      emitEntryPoint: true,
      generateMain: i === 0 && opts.generateMain,
      // Threaded through explicitly rather than set as ambient module state
      // (see this function's own doc comment above) - generateScala installs
      // it unconditionally on every call.
      callProgramRegistry: callRegistry,
    };
    const result = generateScala(ast, programOpts);
    codeSections.push(result.code);
  });

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
