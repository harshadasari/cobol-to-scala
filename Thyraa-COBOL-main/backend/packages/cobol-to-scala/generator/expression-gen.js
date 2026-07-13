/**
 * expression-gen.js
 * Convert COBOL expressions and statements to Scala
 */

import { toCamelCase, toPascalCase } from './case-class-gen.js';
import {
  generateOpen,
  generateClose,
  generateRead,
  generateWrite,
  generateRewrite,
  generateDelete as generateDeleteFile,
  generateStart,
  fileHandleVarNames,
} from './file-io-gen.js';

/**
 * Map COBOL arithmetic operators to Scala
 */
const ARITHMETIC_OPERATORS = {
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '**': 'Math.pow',
  'ADD': '+',
  'SUBTRACT': '-',
  'MULTIPLY': '*',
  'DIVIDE': '/'
};

/**
 * Map COBOL comparison operators to Scala
 */
const COMPARISON_OPERATORS = {
  '=': '==',
  'EQUAL': '==',
  'EQUALS': '==',
  'EQUAL TO': '==',
  '>': '>',
  'GREATER': '>',
  'GREATER THAN': '>',
  '<': '<',
  'LESS': '<',
  'LESS THAN': '<',
  '>=': '>=',
  'GREATER OR EQUAL': '>=',
  'NOT LESS': '>=',
  '<=': '<=',
  'LESS OR EQUAL': '<=',
  'NOT GREATER': '<=',
  'NOT =': '!=',
  'NOT EQUAL': '!=',
  'NOT EQUALS': '!='
};

/**
 * Map COBOL logical operators to Scala
 */
const LOGICAL_OPERATORS = {
  'AND': '&&',
  'OR': '||',
  'NOT': '!'
};

// ============================================================================
// WORKING-STORAGE field registry
//
// Built once per conversion by scala-generator.js's buildFieldRegistry() and
// installed here via setFieldRegistry() before any method bodies are
// generated. Keyed by uppercased COBOL name -> { camel, scalaType, dataType,
// integerDigits, decimalDigits, signed, editPattern, occursDepth }. Used for:
//   - DISPLAY numeric formatting (sign + zero-padding per PIC digit counts)
//   - MOVE literal coercion to the target's declared Scala type
//   - numeric-edited PICTURE formatting (Z/9/$/+/-/CR/DB) at MOVE time
//   - decimal-aware DIVIDE when the GIVING target is a BigDecimal field
// Subscript rendering itself needs no registry lookup - it is derived
// entirely from the VariableReference node's own `.subscripts`.
// ============================================================================

let FIELD_REGISTRY = new Map();

/** Install the field registry built for the program currently being generated. */
export function setFieldRegistry(registry) {
  FIELD_REGISTRY = registry instanceof Map ? registry : new Map();
}

function lookupField(name) {
  if (!name) return null;
  return FIELD_REGISTRY.get(String(name).toUpperCase()) || null;
}

/**
 * Look up field metadata for a MOVE/arithmetic target/operand reference. A
 * qualified reference (`NAME OF WS-TARGET-GROUP`) resolves through the
 * qualified registry by (name, immediate parent) first, since the bare name
 * alone may be ambiguous (or simply not registered at all - see
 * buildFieldRegistry's ambiguous-name handling) and falls back to a bare
 * lookup only if no qualified entry exists.
 */
function lookupFieldForRef(ref) {
  if (!ref) return null;
  if (typeof ref !== 'object') return lookupField(ref);
  if (Array.isArray(ref.qualifiers) && ref.qualifiers.length > 0) {
    const info = lookupQualified(String(ref.name).toUpperCase(), String(ref.qualifiers[0]).toUpperCase());
    if (info) return info;
  }
  return lookupField(ref.name);
}

// ============================================================================
// OCCURS table registry (SEARCH / SEARCH ALL) and group registry (MOVE
// CORRESPONDING). Built once per conversion by scala-generator.js's
// buildFieldRegistry() alongside FIELD_REGISTRY, and installed the same way.
// ============================================================================

/** name (upper) -> { times, indexed: [camel...], ascending: [camel...], descending: [camel...] } */
let TABLE_REGISTRY = new Map();
/** group-item full ancestor-path key -> [{ nameUpper, camel, info, groupKey }, ...] immediate real children */
let GROUP_REGISTRY = new Map();
/** group-item bare uppercased COBOL name -> its full ancestor-path key in GROUP_REGISTRY */
let GROUP_KEY_REGISTRY = new Map();
/** group-item name (upper) -> total byte length of one occurrence (FUNCTION LENGTH support) */
let GROUP_BYTE_LENGTH_REGISTRY = new Map();
/** SD file name AND its 01 record name (both upper) -> sort-buffer support info */
let SORT_FILE_REGISTRY = new Map();
/**
 * FD record name (upper) -> its FD's own file name (raw COBOL text, not
 * camelCase) - round-5 finding 1b. A WRITE/REWRITE statement identifies its
 * record by the record's own name (`WRITE OUT-REC`), but the writer/file
 * handle OPEN assigns is keyed by the *file* name (`OPEN OUTPUT OUT-FILE`) -
 * the overwhelmingly common COBOL style even declares them differently
 * (record name != file name), so a WRITE naively keyed off its own record
 * name could reference a writer variable that was never declared at all.
 */
let RECORD_FILE_REGISTRY = new Map();
/** FD file name (upper) -> its first 01 record's own name (raw COBOL text) - the mirror-image lookup for a plain READ with no INTO clause. */
let FILE_RECORD_REGISTRY = new Map();
/**
 * FD file names (upper) that have at least one WRITE statement anywhere in
 * the PROCEDURE DIVISION with an ADVANCING clause (round-6 finding 1) -
 * compiler-verified against installed GnuCOBOL that a file's WRITE behavior
 * switches *wholesale* to the carriage-control-style "deferred terminator"
 * model (see generateWriteStatement's doc comment) the moment ANY WRITE for
 * that file uses ADVANCING, even for a later plain WRITE to the same file
 * with no ADVANCING clause of its own (which then contributes zero
 * separator characters, not the ordinary one-newline-per-record behavior
 * a file that never uses ADVANCING at all gets). A file NOT in this set
 * keeps the exact byte-for-byte pre-round-6 `println` behavior - this is
 * what guarantees zero regression across every existing corpus program
 * (none of which use ADVANCING at all).
 */
let ADVANCING_FILES = new Set();
/**
 * FD file name (upper) -> its `FILE STATUS IS <field>` field's own camelCase
 * flat-var name (round-6 finding 2/3's t04 companion gap: `SELECT ... FILE
 * STATUS IS ws-status` was already parsed into
 * `environmentDivision.fileControls[i].status`, but nothing in codegen ever
 * read it - OPEN/READ/WRITE/CLOSE never assigned that field at all, so it
 * silently kept whatever value WORKING-STORAGE gave it (typically spaces)
 * forever. That is worse than a wrong comparison result: a bare `READ
 * file-name` with no AT END clause at all (the overwhelmingly common
 * FILE-STATUS-driven EOF idiom - see t04) has no other way to detect
 * end-of-file, so the read loop simply never terminates - a silent, total
 * hang, not just wrong output.) Absent (unset) for a file with no FILE
 * STATUS clause - every read/write/open/close of such a file is completely
 * unaffected (this is a pure addition, not a behavior change, for the
 * overwhelming majority of existing corpus programs, none of which declare
 * FILE STATUS).
 */
let FILE_STATUS_REGISTRY = new Map();
/** "<name>::<immediate parent name>" (both upper) -> field info, for OF/IN qualified references */
let QUALIFIED_REGISTRY = new Map();
/** Level-88 condition name (upper) -> { info: <parent field's registry info>, values: [...] } */
let CONDITION_REGISTRY = new Map();
/**
 * PascalCase case-class names (see case-class-gen.js's
 * collectAmbiguousGroupClassNames) that collide across two different
 * top-level records' nested groups in this program - consulted only by
 * generateGroupMove's differing-layout byte-level round trip below, which
 * has no parent-path context of its own to disambiguate an ambiguous name
 * the way generateAllCaseClasses/generateCaseClass can.
 */
let AMBIGUOUS_GROUP_CLASS_NAMES = new Set();

export function setTableRegistry(registry) {
  TABLE_REGISTRY = registry instanceof Map ? registry : new Map();
}

export function setGroupRegistry(registry, keyRegistry) {
  GROUP_REGISTRY = registry instanceof Map ? registry : new Map();
  GROUP_KEY_REGISTRY = keyRegistry instanceof Map ? keyRegistry : new Map();
}

/**
 * round-22 finding 1: accessors for the currently-installed GROUP_REGISTRY/
 * GROUP_KEY_REGISTRY/TABLE_REGISTRY globals, so a scala-generator.js call
 * site that already has these globals correctly installed for the ast it's
 * generating (e.g. generateEntryMethod, mid-generateScala) can pass them
 * explicitly into a shared helper (computeParamLeafShapes) that also needs
 * to run BEFORE any globals are installed at all, from an ast's own freshly
 * built registries (generateMultiProgramScala's pre-loop) - see that
 * function's own doc comment.
 */
export function getGroupRegistry() {
  return GROUP_REGISTRY;
}

export function getGroupKeyRegistry() {
  return GROUP_KEY_REGISTRY;
}

export function getTableRegistry() {
  return TABLE_REGISTRY;
}

/**
 * Resolve a bare (unqualified) uppercased group name - as read directly off
 * a MOVE/ADD CORRESPONDING source/target or a RELEASE/RETURN FROM/INTO
 * reference, none of which carry OF/IN qualification in the Phase 2 corpus -
 * to its full ancestor-path key in GROUP_REGISTRY (see
 * scala-generator.js's buildFieldRegistry). Falls back to the bare name
 * itself when it isn't in GROUP_KEY_REGISTRY at all (a top-level record's
 * own key always equals its bare name, so this is a no-op for the
 * overwhelmingly common case).
 */
export function resolveGroupKey(bareNameUpper) {
  return GROUP_KEY_REGISTRY.get(bareNameUpper) || bareNameUpper;
}

/**
 * round-8 finding 1: true when `nameUpper` is a registered group (not a
 * scalar elementary item) - used by generateCall/generateEntryMethod
 * (scala-generator.js) to detect a CALL ... USING operand or LINKAGE
 * SECTION PROCEDURE DIVISION USING parameter that names a whole group
 * rather than an elementary field, which needs the concatenated-string
 * in/scatter-back-out convention (groupDisplayValueExpr/
 * scatterGroupFromString) instead of the ordinary scalar value-in/value-out
 * one.
 */
export function isRegisteredGroupName(nameUpper) {
  return GROUP_REGISTRY.has(resolveGroupKey(nameUpper));
}

export function setGroupByteLengthRegistry(registry) {
  GROUP_BYTE_LENGTH_REGISTRY = registry instanceof Map ? registry : new Map();
}

export function setSortFileRegistry(registry) {
  SORT_FILE_REGISTRY = registry instanceof Map ? registry : new Map();
}

export function setRecordFileRegistry(recordToFile, fileToRecord) {
  RECORD_FILE_REGISTRY = recordToFile instanceof Map ? recordToFile : new Map();
  FILE_RECORD_REGISTRY = fileToRecord instanceof Map ? fileToRecord : new Map();
}

/** See ADVANCING_FILES' doc comment above. */
export function setAdvancingFiles(fileNames) {
  ADVANCING_FILES = fileNames instanceof Set ? fileNames : new Set();
}

/** See FILE_STATUS_REGISTRY's doc comment above. */
export function setFileStatusRegistry(registry) {
  FILE_STATUS_REGISTRY = registry instanceof Map ? registry : new Map();
}

/** The FILE STATUS flat-var camelCase name for `fileName` (upper-normalized internally), or null if that file declared no FILE STATUS clause. */
function fileStatusVarFor(fileName) {
  return FILE_STATUS_REGISTRY.get(String(fileName || '').toUpperCase()) || null;
}

/**
 * round-10 finding 1: DECLARATIVES handler registries, mirroring
 * file-io-gen.js's own identical copy (see that module's doc comment for the
 * full rationale) - this module needs its own copy because READ (below) is
 * generated here, independently of file-io-gen.js's OPEN/CLOSE.
 */
let DECL_FILE_HANDLERS = new Map();
let DECL_MODE_HANDLERS = new Map();

export function setDeclarativeHandlers(fileHandlers, modeHandlers) {
  DECL_FILE_HANDLERS = fileHandlers instanceof Map ? fileHandlers : new Map();
  DECL_MODE_HANDLERS = modeHandlers instanceof Map ? modeHandlers : new Map();
}

function declarativeHandlerFor(fileName, mode) {
  return (
    DECL_FILE_HANDLERS.get(String(fileName || '').toUpperCase()) ||
    DECL_MODE_HANDLERS.get(String(mode || '').toUpperCase()) ||
    null
  );
}

/** The FD file name a WRITE/REWRITE of `recordName` actually belongs to - falls back to the record's own name when it isn't a registered FD record (defensive; every corpus program's record is registered). */
function fileNameForRecord(recordName) {
  return RECORD_FILE_REGISTRY.get(String(recordName || '').toUpperCase()) || recordName;
}

export function setQualifiedRegistry(registry) {
  QUALIFIED_REGISTRY = registry instanceof Map ? registry : new Map();
}

export function setConditionRegistry(registry) {
  CONDITION_REGISTRY = registry instanceof Map ? registry : new Map();
}

export function setAmbiguousGroupClassNames(names) {
  AMBIGUOUS_GROUP_CLASS_NAMES = names instanceof Set ? names : new Set();
}

/**
 * round-7 finding 1: PROGRAM-ID (upper, unquoted) -> `{ objectName, paramCount }`
 * for every program parsed from the *same* COBOL source (a multi-PROGRAM-ID
 * file - contained or sequential programs; see scala-generator.js's
 * generateMultiProgramScala) - lets generateCall resolve `CALL "NAME" USING
 * ...` to a real sibling `object <objectName>` and its generated `entry(...)`
 * method (see scala-generator.js's generateEntryMethod) instead of guessing.
 * Empty (the default) for every ordinary single-PROGRAM-ID source, which is
 * every corpus program that existed before this - `generateCall` falls back
 * to its pre-round-7 behavior 1:1 whenever a CALL's target isn't in this map,
 * *except* that fallback is now an honest TODO marker instead of a bare
 * undeclared call (round-7 finding 1c) - see generateCall's own doc comment.
 */
let CALL_PROGRAM_REGISTRY = new Map();

export function setCallProgramRegistry(registry) {
  CALL_PROGRAM_REGISTRY = registry instanceof Map ? registry : new Map();
}

// Incidentally-discovered-and-fixed bug (found while promoting round-12's
// z09 survivor, which - unlike any single-CALL corpus program before it -
// exercises two BY-REFERENCE-writeback CALLs in the SAME paragraph):
// generateCall always named its intermediate result `val _callRet`, so a
// second such CALL in the same method body redeclared the identical `val`
// name - a hard "already defined" Scala compile error, not merely a wrong-
// output bug. Every call site now asks for its own never-repeated name via
// nextCallRetName(); resetCallRetSeq() is invoked once per generateScala()
// call (scala-generator.js) purely so a fresh conversion's numbering starts
// at 0 (cosmetic determinism - correctness never depended on any particular
// starting value, only on never repeating one within the same generated
// file).
let CALL_RET_SEQ = 0;

export function resetCallRetSeq() {
  CALL_RET_SEQ = 0;
}

function nextCallRetName() {
  return `_callRet${CALL_RET_SEQ++}`;
}

/**
 * The COBOL default-initialization ("no VALUE clause") literal for a bare
 * Scala type - numeric zero, or empty/blank text - with no item context
 * (unlike scala-generator.js's defaultElementaryValue, which additionally
 * honors an item's own VALUE clause; these two call sites never have an
 * item to consult at all). Used for a CALL ... USING parameter this
 * generator must supply a value for despite the source not actually passing
 * one (round-12 findings 3/4):
 *
 *   - CALL ... USING OMITTED (finding 4): the operand is explicitly absent -
 *     no caller-side value exists at all - so the callee's own parameter
 *     simply gets its type's zero/spaces default passed in, and (per
 *     generateCall's refWriters) nothing is ever written back to it.
 *   - CALL ... USING <fewer args than the callee's LINKAGE SECTION declares>
 *     (finding 3): a real cobc-compiled callee simply never touches its own
 *     un-passed trailing LINKAGE items (they are not addressable at all per
 *     the standard - reading one is undefined behavior); this generator
 *     pragmatically models that as "starts out zero/spaces, is never written
 *     back" - see generateEntryMethod's trailing default parameter values,
 *     which this pairs with.
 */
export function defaultZeroValueForScalaType(scalaType) {
  if (scalaType === 'BigDecimal') return 'BigDecimal(0)';
  if (scalaType === 'Long') return '0L';
  if (scalaType === 'Float') return '0.0f';
  if (scalaType === 'Double') return '0.0';
  if (scalaType === 'String') return '""';
  return '0';
}

/**
 * round-7 finding 5: SPECIAL-NAMES' `DECIMAL-POINT IS COMMA` (parsed by
 * parser/index.js's parseEnvironmentDivision, installed by
 * scala-generator.js's generateScala) - swaps the rendered decimal-point
 * character from "." to "," for plain numeric DISPLAY (CobolFmt.num) and
 * numeric-edited PICTURE formatting (formatEditedPicture/CobolFmt.edited).
 * False (the default) for every program that doesn't declare this clause -
 * every corpus program before round-7 - so this is a pure addition.
 */
let DECIMAL_POINT_IS_COMMA = false;

export function setDecimalPointIsComma(value) {
  DECIMAL_POINT_IS_COMMA = !!value;
}

function lookupTable(name) {
  if (!name) return null;
  return TABLE_REGISTRY.get(String(name).toUpperCase()) || null;
}

function lookupSortFile(name) {
  if (!name) return null;
  return SORT_FILE_REGISTRY.get(String(name).toUpperCase()) || null;
}

/** Look up an OF/IN qualified reference's field info by (name, immediate parent). */
function lookupQualified(nameUpper, parentUpper) {
  return QUALIFIED_REGISTRY.get(`${nameUpper}::${parentUpper}`) || null;
}

/**
 * Scala boolean expression testing an 88-level condition name, e.g.
 * `IF WS-STATUS-ERROR` or `EVALUATE TRUE WHEN WS-STATUS-ERROR` where
 * WS-STATUS-ERROR is declared `88 WS-STATUS-ERROR VALUE 5 THRU 9.` under
 * WS-STATUS-CODE. A condition name is *not* itself an addressable data item
 * (there is no `wsStatusError` var) - it is sugar for testing its parent
 * field against the VALUE/VALUES (incl. THRU ranges) the 88-level declared,
 * so this renders `wsStatusCode >= 5 && wsStatusCode <= 9` (OR'd across
 * every VALUE/range the condition name declares) directly against the
 * parent's own flat var, using CONDITION_REGISTRY (built by
 * scala-generator.js's buildFieldRegistry from each elementary item's
 * `.conditions`). Returns null when `nameUpper` isn't a registered
 * condition name, so callers can fall back to their prior (pre-88-support)
 * behavior for anything else.
 */
function level88ConditionExpr(nameUpper) {
  const entry = nameUpper ? CONDITION_REGISTRY.get(nameUpper) : null;
  if (!entry) return null;
  const { info, values } = entry;
  const fieldExpr = info.camel;
  const isString = info.scalaType === 'String';

  const parts = (values || []).map(v => {
    if (v.through !== undefined && v.through !== null) {
      const lo = level88ValueLiteral(v, info);
      const hi = level88ValueLiteral({ ...v, value: v.through }, info);
      return isString
        ? `(${fieldExpr}.compareTo(${lo}) >= 0 && ${fieldExpr}.compareTo(${hi}) <= 0)`
        : `(${fieldExpr} >= ${lo} && ${fieldExpr} <= ${hi})`;
    }
    return `(${fieldExpr} == ${level88ValueLiteral(v, info)})`;
  });

  return parts.length > 0 ? `(${parts.join(' || ')})` : 'false';
}

/**
 * Scala literal for one level-88 VALUE entry, coerced to its parent field's
 * (`info`) declared Scala type. Shared by level88ConditionExpr (IF/EVALUATE
 * condition-name tests) and level88FirstValueAssignment (SET
 * condition-name-1 TO TRUE) - both need the exact same VALUE-literal
 * rendering, just used differently (a comparison vs. an assignment source).
 */
function level88ValueLiteral(v, info) {
  const isString = info.scalaType === 'String';
  if (!v || v.type === 'figurative') {
    const fig = String(v?.value || '').toUpperCase();
    if (fig === 'SPACE') return isString ? '" "' : '0';
    return isString ? '""' : '0';
  }
  if (isString) return `"${escapeScalaStringLiteral(String(v.value))}"`;
  if (info.scalaType === 'BigDecimal') return `BigDecimal("${v.value}")`;
  if (info.scalaType === 'Long') return `${normalizeIntLiteralText(v.value)}L`;
  return normalizeIntLiteralText(v.value);
}

/**
 * The parent field's camelCase identifier and the Scala literal for the
 * FIRST VALUE (or the low end of the first VALUE ... THRU ... range) a
 * level-88 condition name declares - exactly what `SET condition-name-1 TO
 * TRUE` must assign to the parent field. A condition-name is not itself an
 * addressable data item (see level88ConditionExpr's doc comment) - it is
 * sugar for one or more VALUEs of its parent elementary item - so "set the
 * condition to true" means "move the first declared VALUE into the parent
 * field" (IBM/GnuCOBOL rule for SET ... TO TRUE on a condition-name).
 * Returns null when nameUpper isn't a registered condition name, or declares
 * no VALUEs at all (shouldn't happen for valid COBOL).
 */
function level88FirstValueAssignment(nameUpper) {
  const entry = nameUpper ? CONDITION_REGISTRY.get(nameUpper) : null;
  if (!entry || !Array.isArray(entry.values) || entry.values.length === 0) return null;
  const { info, values } = entry;
  return { camel: info.camel, literal: level88ValueLiteral(values[0], info) };
}

/**
 * Mirror of level88FirstValueAssignment for `SET condition-name-1 TO FALSE`
 * (round-12 finding 1): the parent field's camelCase identifier and the
 * Scala literal for the condition's own `WHEN SET TO FALSE IS literal-3`
 * clause (parser/data-division-parser.js's parseLevel88). Returns null when
 * nameUpper isn't a registered condition name, or declares no false-value
 * clause at all - real COBOL requires `SET ... TO FALSE` to only target a
 * condition-name that actually declared one (cobc rejects it at compile
 * time otherwise), so every condition-name this ever fires for in valid
 * source has one; the null fallback just avoids generating a bogus
 * assignment for a not-actually-valid program instead of crashing.
 */
function level88FalseValueAssignment(nameUpper) {
  const entry = nameUpper ? CONDITION_REGISTRY.get(nameUpper) : null;
  if (!entry || !entry.falseValue) return null;
  const { info, falseValue } = entry;
  return { camel: info.camel, literal: level88ValueLiteral(falseValue, info) };
}

/**
 * COBOL paragraph/section name -> Scala method name, mirroring
 * method-gen.js's toMethodName() exactly (strip a leading numeric prefix,
 * then camelCase). Duplicated locally rather than imported, since
 * method-gen.js imports *from* this module - importing back would create a
 * cycle.
 */
function paragraphMethodName(name, sectionName) {
  if (!name) return '';
  let n = String(name).replace(/^\d+[-_]?/, '');
  if (!n) n = '_' + name;
  const bare = toCamelCase(n);
  // round-12 bonus finding (z12): an explicit OF/IN qualifier
  // (`sectionName`, from PerformStatement.targetSection/throughSection -
  // null for the ordinary unqualified form) routes a genuinely colliding
  // bare name to its section-qualified method name, mirroring
  // method-gen.js's resolveParagraphMethodName exactly (duplicated locally
  // rather than imported - method-gen.js imports *from* this module, so
  // importing back would create a cycle - see this function's own
  // pre-existing doc note). AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM is
  // installed by method-gen.js's generateAllMethods (the same ambiguity set
  // resolveParagraphMethodName itself consults) via
  // setAmbiguousParagraphNamesForPerform below.
  if (sectionName && AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM.has(bare)) {
    let sn = String(sectionName).replace(/^\d+[-_]?/, '');
    if (!sn) sn = '_' + sectionName;
    const sectionPart = toCamelCase(sn);
    return sectionPart + bare.charAt(0).toUpperCase() + bare.slice(1);
  }
  return bare;
}

let AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM = new Set();

export function setAmbiguousParagraphNamesForPerform(names) {
  AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM = names instanceof Set ? names : new Set();
}

/**
 * Local mirror of method-gen.js's `performThruWrapperName`, duplicated for
 * the same reason `paragraphMethodName` above is (method-gen.js imports
 * *from* this module, so the reverse import would cycle). Produces the
 * IDENTICAL wrapper-method name generateAllMethods actually generates
 * (via method-gen.js's own performThruWrapperName, called from the exact
 * same `stmt.targetParagraph`/`targetSection`/`throughParagraph`/
 * `throughSection` fields) for a `PERFORM x THRU y` range.
 */
function performThruWrapperNameLocal(fromParagraph, fromSection, toParagraph, toSection) {
  let fromStripped = String(fromParagraph || '').replace(/^\d+[-_]?/, '');
  if (!fromStripped) fromStripped = '_' + fromParagraph;
  const fromBase = toCamelCase(fromStripped);
  const toBase = toPascalCase(String(toParagraph || '').replace(/^\d+[-_]?/, ''));
  const fromQualifier = fromSection ? 'In' + toPascalCase(String(fromSection).replace(/^\d+[-_]?/, '')) : '';
  const toQualifier = toSection ? 'In' + toPascalCase(String(toSection).replace(/^\d+[-_]?/, '')) : '';
  return `${fromBase}${fromQualifier}To${toBase}${toQualifier}`;
}

/**
 * Round-18 finding 3's PERFORM ... THRU companion gap: `generatePerform`
 * (the nested-statement sibling of method-gen.js's generatePerformFromAST,
 * used for a PERFORM inside an IF/EVALUATE/SEARCH branch body etc.)
 * previously called `paragraphMethodName(statement.targetParagraph, ...)`
 * directly at every one of its call sites, completely ignoring
 * `statement.throughParagraph` - so `PERFORM STEP-ONE THRU STEP-THREE`
 * nested inside (for example) an EVALUATE WHEN body silently called ONLY
 * `stepOne()` (the single FROM paragraph's own standalone method, with no
 * fallthrough into STEP-TWO/STEP-THREE) instead of the THRU range's real
 * wrapper method (`stepOneToStepThree()`, which method-gen.js's
 * generateAllMethods always generates whenever ANY PERFORM THRU anywhere in
 * the program - nested or not - names that range, since round-16 finding
 * 4's collectStatementsDeep). method-gen.js's own top-level counterpart
 * (generatePerformFromAST) already checked `stmt.throughParagraph` - this
 * was specifically a NESTED-PERFORM-THRU gap. A pure generalization: an
 * ordinary (non-THRU) nested PERFORM is completely unaffected (falls
 * through to the exact same `paragraphMethodName(...)()` text as before).
 */
function performTargetCallExpr(statement, fallbackName = 'procedure') {
  if (statement.throughParagraph) {
    return `${performThruWrapperNameLocal(statement.targetParagraph || '', statement.targetSection, statement.throughParagraph, statement.throughSection)}()`;
  }
  return `${paragraphMethodName(statement.targetParagraph || fallbackName, statement.targetSection)}()`;
}

/**
 * Scala expression for one subscript, 1-based COBOL -> 0-based Scala.
 * Literal subscripts are folded at generation time (`WS-QTY(1)` -> `0`);
 * bare-variable subscripts render as `<camelName> - 1`; anything else (any
 * real arithmetic, e.g. `WS-T(WS-I + 1)`) renders as a full parenthesized
 * expression minus 1 - parser/procedure-parser.js's parseVariableReference
 * parses every subscript slot as a full arithmetic expression (see its doc
 * comment), so `sub` is normally an ArithmeticExpression node; the legacy
 * `{type:'literal'|'variable', value}` tags are also still accepted, for any
 * other call site that builds a subscript node directly rather than through
 * the parser.
 */
function subscriptIndexExpr(sub) {
  // round-7 finding 4: a subscript variable/expression is frequently a
  // COMP-3 (BigDecimal-typed) field or index (see u04's own repro - a
  // `PERFORM VARYING` control variable declared `COMP-3 PIC S9(4)`, used
  // directly as a table subscript) - Vector's own `apply`/`updated` both
  // require a plain `Int` index, so a bare `wsI - 1` (BigDecimal - Int, which
  // is itself a BigDecimal) is a hard "Found: BigDecimal, Required: Int"
  // compile error at every read/write/multi-dim subscript site that uses
  // this function (renderCamelAssignment's `.updated(...)` write path
  // included, since it also calls this). `.toInt` is applied at every
  // non-literal branch (never the literal-fold branches, which already
  // produce a plain Int constant string) - a no-op for the common case where
  // the subscript already *is* a plain Scala Int (Int#toInt returns itself),
  // so this is a pure addition with no behavior change for that case.
  //
  // round-18 finding 8: every DYNAMIC (non-literal) branch also clamps the
  // computed 0-based index to `.max(0)` - a purely defensive guard against a
  // garbage-but-plausible upstream value (most concretely, round-17 finding
  // 1's ref-mod numeric-MOVE honest placeholder, `BigDecimal(0)` - see
  // renderVariableMoveSource/refModNumericPlaceholder - which is itself a
  // legitimate, documented, deliberately-out-of-scope decline, not a bug in
  // its own right) from ever propagating into a NEGATIVE Vector index and
  // throwing `IndexOutOfBoundsException` (g03: a 1-based COBOL subscript
  // computed from a still-zero placeholder becomes 0-based index -1). This
  // does not (and cannot, without threading each specific table's own
  // runtime length into every subscript call site) guard the UPPER bound -
  // an implausibly-large computed subscript can still throw, matching real
  // cobc's own equally unsafe behavior for an out-of-range subscript when
  // SSRANGE checking isn't enabled (the default). A no-op for every
  // legitimately in-range subscript value (`.max(0)` only ever changes a
  // computed result that was already negative - i.e. already wrong - never
  // a valid 0-based index, which is never negative to begin with).
  if (sub && typeof sub === 'object') {
    if (sub.type === 'literal') {
      const n = parseInt(sub.value, 10);
      return literalSubscriptIndexExpr(n);
    }
    if (sub.type === 'variable') {
      return `(${toCamelCase(sub.value)} - 1).toInt.max(0)`;
    }
    if (sub.type === 'ArithmeticExpression' && !sub.operator && !sub.unaryMinus && !sub.functionCall) {
      if (sub.value !== null && sub.value !== undefined) {
        const n = parseInt(sub.value, 10);
        return literalSubscriptIndexExpr(n);
      }
      if (sub.variable) {
        return `(${convertIdentifier(sub.variable)} - 1).toInt.max(0)`;
      }
    }
  }
  return `((${convertArithmeticExpression(sub)}) - 1).toInt.max(0)`;
}

/**
 * round-19 finding 4: a bare, compile-time-known integer LITERAL subscript
 * (e.g. `WS-VAL(0)`, `WS-VAL(-1)` - as opposed to a computed/dynamic
 * subscript, which subscriptIndexExpr's other branches already `.max(0)`
 * clamp per round-18 finding 8) that is ZERO or NEGATIVE is always
 * out-of-range (COBOL subscripts are 1-based) - detectable with certainty at
 * GENERATION time, unlike a dynamic subscript's runtime value. Before this
 * fix, the literal branches above returned the raw folded 0-based index with
 * NO clamp and NO marker at all - a literal negative/zero subscript rendered
 * a bare negative Scala Int constant, crashing with IndexOutOfBoundsException
 * the moment it was read/written, an inconsistency with the dynamic case
 * (which at least degrades to a *clamped*, non-crashing, if silently wrong,
 * value). This does not attempt to reproduce cobc's own behavior for this
 * shape (reading whatever raw bytes happen to sit adjacent to the table in
 * memory) - that is genuine platform/build-dependent UNDEFINED BEHAVIOR (no
 * SSRANGE checking by default), and chasing it would mean guessing at
 * non-reproducible output, which this campaign's own methodology explicitly
 * warns against (see tests/oracle/README.md's round-19 table). Instead this
 * only makes the CURRENT (deliberately non-cobc-matching) fallback honest:
 * the same `.max(0)` clamp round-18 finding 8 already uses for a dynamic
 * subscript (preventing a crash, not attempting correctness) plus a visible,
 * compiling inline BLOCK comment (an asterisk-style comment, never a
 * double-slash line comment - this text is always spliced into a larger
 * single-line expression by every caller, and a line comment would silently
 * swallow whatever follows on that same line) marking the literal subscript
 * as out-of-range. A normal (>=1) literal subscript is completely
 * unaffected - this only changes the n<=0 branch.
 */
function literalSubscriptIndexExpr(n) {
  if (!Number.isFinite(n)) return '0';
  const idx = n - 1;
  if (idx >= 0) return String(idx);
  return `(${idx}).max(0) /* TODO: literal COBOL subscript ${n} is out of range (COBOL subscripts are 1-based) - real cobc's own behavior here is an out-of-bounds memory read (undefined, platform/build-dependent - not reproduced here by design); this generator instead clamps to row 1 - see tests/oracle/README.md known gaps */`;
}

/**
 * The camelCase flat-var identifier for an assignment TARGET reference,
 * honoring OF/IN qualification (`MOVE x TO QTY OF WS-B`) the same way
 * convertIdentifier already does for a *read* reference - a qualified
 * reference disambiguates *which* same-named field is meant (see
 * buildFieldRegistry's ambiguous-name handling), so resolving it through the
 * qualified registry - rather than always taking the bare
 * `toCamelCase(targetRef.name)` an assignment target had used previously -
 * is required whenever the bare name is ambiguous (a bare `toCamelCase` of
 * an ambiguous name isn't even a declared identifier at all - see
 * buildFieldRegistry's "only an unambiguous name gets a bare-name registry
 * entry" comment).
 */
function targetCamelFor(targetRef) {
  const name = targetRef.name || '';
  if (Array.isArray(targetRef.qualifiers) && targetRef.qualifiers.length > 0) {
    const info = lookupQualified(name.toUpperCase(), String(targetRef.qualifiers[0]).toUpperCase());
    if (info) return info.camel;
    const bare = lookupField(name);
    if (bare) return bare.camel;
  }
  return toCamelCase(name);
}

/**
 * Shared honest-decline comment text for a reference-modification
 * (`identifier(start:length)`, Known Gap #1) operand reached from any
 * operand-position call site that cannot use the shared `???`-typed
 * placeholder `convertIdentifier`'s own refMod branch returns (that
 * placeholder's static type is `Nothing`, which only unifies safely when
 * passed untouched as an argument to something else - the moment a call site
 * calls a member directly ON it (`.padTo`, `.compareTo`, `.indices`, ...) or
 * feeds it to an overloaded constructor like `BigDecimal(...)`, that's
 * either a hard "Required: ?{member}" compile error or (worse, `BigDecimal`
 * specifically) an "Ambiguous overload" error, since every overload accepts
 * `Nothing`). Every call site below (STRING segment source, relational
 * comparison, CALL argument, MOVE-to-numeric-target, DISPLAY operand) shares
 * this exact wording - "reference modification not implemented as X - see
 * tests/oracle/README.md known gaps" - via this one function, rather than
 * six/seven independent copies of the same sentence (round-17 finding 3's own
 * explicit ask): grep for "reference modification not implemented as" to
 * find every one of them at once. `contextLabel` is call-site-supplied text
 * describing where the placeholder was substituted (e.g. "a DISPLAY
 * operand", "a MOVE numeric target") - ref-mod's own read/write semantics
 * remain entirely out of scope (Known Gap #1); this only stops a *specific*
 * operand position from crashing (or, pre-round-15/16, silently passing the
 * wrong full-variable value) when it happens to receive a ref-mod'd operand.
 */
function refModGapComment(contextLabel) {
  return `reference modification not implemented as ${contextLabel} - see tests/oracle/README.md known gaps`;
}

/**
 * Concrete, String-typed honest placeholder for a ref-mod'd operand reaching
 * a call site that needs to call a String member directly on its operand
 * (`.padTo`/`.take`, `.compareTo`, `.indices`/`.length`, ...) - `""` compiles
 * and runs cleanly against every one of those (contributing "nothing"/
 * comparing-empty/zero-length, all visibly wrong but never a crash) where
 * the shared `Nothing`-typed `???` placeholder would not.
 */
function refModStringPlaceholder(contextLabel) {
  return `"" /* TODO: ${refModGapComment(contextLabel)} */`;
}

/**
 * Concrete, numeric honest placeholder for a ref-mod'd operand reaching a
 * numeric-context call site (round-17 finding 1: MOVE into a numeric
 * target) - `BigDecimal(???)` is an AMBIGUOUS OVERLOAD in Scala 3 (every one
 * of `BigDecimal.apply`'s 7 overloads accepts `Nothing`), a hard compile
 * error the String-typed placeholder above doesn't have to deal with (no
 * overload resolution happens for a String literal). `BigDecimal(0)` is a
 * concrete, unambiguous, honestly-wrong (always zero) stand-in.
 */
function refModNumericPlaceholder(contextLabel) {
  return `BigDecimal(0) /* TODO: ${refModGapComment(contextLabel)} */`;
}

/**
 * Render an assignment to a (possibly subscripted) target as a Scala
 * statement. WORKING-STORAGE OCCURS tables are represented as flat
 * `var name: Vector[...]` fields (one Vector layer per occurs-bearing
 * ancestor level, see scala-generator.js's buildFieldRegistry), so a
 * subscripted write can't use `name(idx) = value` - Vector has no index
 * setter - it must rebuild the vector with `.updated(idx, value)`, nested
 * once per subscript dimension for multi-dimensional OCCURS.
 */
function renderAssignment(targetRef, valueExpr) {
  if (!targetRef) return `/* no assignment target */ = ${valueExpr}`;
  if (typeof targetRef === 'string') {
    return `${toCamelCase(targetRef)} = ${valueExpr}`;
  }

  if (targetRef.refMod) {
    // Reference modification write (`MOVE ... TO WS-FIELD(start:length)`) -
    // round-3 finding 3, a documented gap: this generator has no byte-level
    // substring-patch model for a WORKING-STORAGE flat var, so rather than
    // (the pre-fix behavior) silently mis-dispatching into the ordinary
    // subscript codegen path above and emitting invalid Scala (a stray
    // dangling `:length)` the parser previously failed to consume at all -
    // see parser/procedure-parser.js's parseVariableReference), this
    // degrades to a visible, compiling `???` marker: it throws only if this
    // exact assignment is ever actually reached at runtime, never at
    // declaration/compile time, and is grep-able as an honest, undone gap
    // rather than a silent wrong write.
    return `${targetCamelFor(targetRef)} = ??? // ??? TODO: reference modification (write) not implemented - see tests/oracle/README.md known gaps`;
  }

  const camel = targetCamelFor(targetRef);
  const subscripts = Array.isArray(targetRef.subscripts) ? targetRef.subscripts : [];
  if (subscripts.length === 0) {
    return `${camel} = ${valueExpr}`;
  }

  const idxs = subscripts.map(subscriptIndexExpr);
  function rec(depth, baseExpr) {
    if (depth === idxs.length - 1) {
      return `${baseExpr}.updated(${idxs[depth]}, ${valueExpr})`;
    }
    return `${baseExpr}.updated(${idxs[depth]}, ${rec(depth + 1, `${baseExpr}(${idxs[depth]})`)})`;
  }
  return `${camel} = ${rec(0, camel)}`;
}

/**
 * Convert a COBOL identifier to Scala camelCase
 * Handles strings, VariableReference objects, and other AST nodes
 */
function convertIdentifier(cobolId) {
  if (!cobolId) return '';

  // Handle string directly
  if (typeof cobolId === 'string') {
    return toCamelCase(cobolId);
  }

  // Handle VariableReference objects
  if (cobolId.type === 'VariableReference' || cobolId.name) {
    const name = cobolId.name || '';

    if (cobolId.refMod) {
      // Reference modification read (`WS-FIELD(start:length)`) - round-3
      // finding 3, a documented gap (see renderAssignment's mirror-image
      // comment for the write side): degrades to a visible, compiling `???`
      // marker rather than silently ignoring the (start:length) and reading
      // the whole field instead.
      return `??? /* TODO: reference modification (read) not implemented - ${toCamelCase(name)}(...) - see tests/oracle/README.md known gaps */`;
    }

    // Resolve the base (unsubscripted) identifier FIRST - honoring OF/IN
    // qualification when present - and only THEN append any subscript index
    // chain to *that* resolved name (round-4 finding 6). Previously the
    // subscript check ran first and returned immediately with a bare
    // `toCamelCase(name)`, entirely skipping the qualifiers branch below it
    // whenever the reference was *both* qualified and subscripted (e.g.
    // `WS-EMP-NAME OF WS-DEPT-A (1)`) - silently dropping the qualifier and
    // resolving to whichever same-named field happened to get the bare
    // registry entry, or a nonexistent identifier if none did. This mirrors
    // renderAssignment/targetCamelFor's write-side resolution order exactly
    // (which already got this right: resolve the qualified camel name, then
    // subscript it).
    let baseName;
    if (cobolId.qualifiers && cobolId.qualifiers.length > 0) {
      // OF/IN qualification disambiguates *which* same-named data item is
      // meant (e.g. `NAME OF WS-TARGET-GROUP`) - it is not a path into a
      // nested Scala object (this generator's WORKING-STORAGE items are all
      // flat vars, not case-class instances - see buildFieldRegistry), so
      // resolve it through the qualified registry rather than emitting a
      // `<qualifier>.<name>` dot-path that has no corresponding Scala value.
      const info = lookupQualified(name.toUpperCase(), String(cobolId.qualifiers[0]).toUpperCase());
      if (info) {
        baseName = info.camel;
      } else {
        const bare = lookupField(name);
        baseName = bare ? bare.camel : toCamelCase(name);
      }
    } else {
      baseName = toCamelCase(name);
    }

    const subscripts = Array.isArray(cobolId.subscripts) ? cobolId.subscripts : [];
    if (subscripts.length > 0) {
      const idxChain = subscripts.map(s => `(${subscriptIndexExpr(s)})`).join('');
      return `${baseName}${idxChain}`;
    }
    return baseName;
  }

  // Handle qualified names (OF/IN) - older format
  if (typeof cobolId === 'object' && cobolId.qualifier) {
    return `${toCamelCase(cobolId.qualifier)}.${toCamelCase(cobolId.name || '')}`;
  }

  // Handle Literal objects (round-6 finding 2/3: thread literalType through)
  if (cobolId.type === 'Literal') {
    return convertLiteral(cobolId.value, cobolId.literalType);
  }

  // Fallback - try to extract name property
  if (typeof cobolId === 'object' && cobolId.name) {
    return toCamelCase(cobolId.name);
  }

  return safeNodeString(cobolId);
}

/**
 * Render an unrecognized AST node as valid Scala instead of the useless
 * "[object Object]" produced by String(object). Extracts the most likely
 * payload (value/name/pattern) or, failing that, emits a TODO comment
 * carrying the node type so the generated code still compiles and the
 * unconverted construct is visible to a reviewer.
 *
 * Ordering matters here (coverage-honesty fix): a node that carries a
 * `.type` tag is a genuine AST construct (every ASTNode subclass sets one -
 * see parser/ast.js) that reached this generic fallback because none of the
 * specific dispatch tables (convertArithmeticExpression/convertCondition/
 * convertIdentifier/...) recognized it - i.e. it is, by construction,
 * unsupported, and MUST render the visible `???` TODO marker rather than
 * silently guessing at a `.name` property. Guessing is actively dangerous:
 * a `FunctionCall` node's `.name` is the *intrinsic function's* name (e.g.
 * "UPPER-CASE"), so naively returning `toCamelCase(node.name)` for one that
 * reached here would render `upperCase` - a plausible-looking but entirely
 * fictitious identifier for a variable that doesn't exist, silently hiding
 * the unsupported construct instead of flagging it (this is exactly what
 * generateFunctionCall's own TODO marker exists to prevent for the FUNCTION
 * dispatch path specifically; this fallback must never undermine it for any
 * *other* node type that ends up here as FunctionCall once did before it
 * got dedicated handling). Only a plain, untyped object (no `.type` at all -
 * a shape from outside the ASTNode hierarchy, e.g. the legacy
 * `{qualifier, name}` shape convertIdentifier also handles directly) falls
 * through to the `.name`/`.pattern` best-effort sniffing below.
 */
function safeNodeString(node) {
  if (node === null || node === undefined) return '';
  if (typeof node !== 'object') return String(node);

  if (node.value !== undefined && typeof node.value !== 'object') {
    // round-6 finding 2/3: a Literal node reaching here still carries its
    // own literalType - pass it through instead of re-guessing from text
    // shape (a quoted digit-shaped string, e.g. "10", must stay a string).
    return convertLiteral(node.value, node.type === 'Literal' ? node.literalType : undefined);
  }

  // Only `.type` counts as "this is a tagged AST construct" - NOT
  // `node.constructor.name`, which is truthy ("Object") for every plain
  // object literal and would otherwise defeat the untyped-object fallback
  // below for every caller that builds an ad hoc `{name: ...}` shape.
  if (node.type) {
    return `??? /* TODO: unsupported COBOL construct (${node.type}) */`;
  }

  if (typeof node.name === 'string' && node.name) {
    return toCamelCase(node.name);
  }
  if (typeof node.pattern === 'string' && node.pattern) {
    return `"${node.pattern}"`;
  }

  const nodeType = node.constructor?.name || 'unknown';
  return `??? /* TODO: unsupported COBOL construct (${nodeType}) */`;
}

/**
 * Convert a COBOL literal to Scala.
 *
 * `literalType` (round-6 finding 2/3), when supplied, is the authoritative
 * source-shape tag the parser's `Literal` AST node already carries
 * ('string'/'numeric'/'figurative' - see parser/ast.js) - a QUOTED string
 * literal whose *text* happens to look like digits (e.g. `"10"`,
 * `FILE STATUS IS "00"`, `INSPECT ... REPLACING CHARACTERS BY "0"`) must
 * render as a Scala string literal (`"10"`), never as a bare numeric token
 * (`10`), no matter what its characters look like - COBOL's own lexical
 * quoting already disambiguates this at parse time, so codegen has no
 * business re-guessing from the text shape once that information is
 * available. Without this, a bare `10` compared against (or assigned into) a
 * String-typed field is a hard Scala 3 compile error ("Values of types
 * String and Int cannot be compared"), and a quoted digit-shaped literal fed
 * to a String-typed runtime helper (e.g. `CobolInspect.replaceCharacters`)
 * fails the same way.
 *
 * The bare shape-sniffing regex below is kept ONLY as a fallback for the
 * handful of call sites that don't (or structurally can't) carry a
 * `literalType` hint (e.g. a plain JS value with no originating AST node) -
 * every call site that has one available now passes it; see the "audit"
 * note on each convertLiteral(...) call site.
 */
function convertLiteral(value, literalType) {
  if (value === null || value === undefined) return 'null';

  if (typeof value === 'string') {
    if (literalType === 'string') {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    if (literalType === 'numeric') {
      return value;
    }
    // No literalType hint available - fall back to the old text-shape guess.
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return value;
    }
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value.toString();
  }

  if (typeof value === 'object') {
    return safeNodeString(value);
  }

  return String(value);
}

/**
 * Scala source for the CobolFmt runtime helper embedded in every generated
 * program. DISPLAY of a non-edited numeric PIC item prints a fixed-width,
 * zero-padded representation with a leading sign character for signed items
 * (always '+' or '-', including for zero - COBOL treats zero as
 * non-negative) and no sign character at all for unsigned items; the
 * decimal point (if any) is inserted per the PIC's integer/decimal digit
 * counts, and an all-decimal PIC (0 integer digits, e.g. `SV9(5)`) omits the
 * leading zero entirely (`-.54321`, not `-0.54321`).
 *
 * Also carries the MOVE-time helpers used by generateMove/renderMoveSource
 * (see the doc comments there): fixed-width alphanumeric fit (`fitLeft`/
 * `fitRight`, default vs. JUSTIFIED RIGHT alignment), unsigned display-digit
 * text for a numeric-to-alphanumeric MOVE (`digitsOf`), numeric MOVE
 * truncation to a target's declared digit widths (`truncNumeric`), ON SIZE
 * ERROR digit-capacity testing (`fitsDigits`), and a runtime port of
 * formatEditedPicture (`edited`) for numeric-edited MOVE targets whose
 * source isn't a compile-time literal (formatEditedPicture itself, in this
 * file, still handles literal sources directly at generation time - cheaper,
 * and covers the overwhelmingly common case).
 */
export function generateCobolFmtHelper() {
  return [
    'object CobolFmt:',
    '  // WRITE ... AFTER/BEFORE ADVANCING n LINES (round-6 finding 1) - the',
    '  // separator text emitted between one physical line and the next,',
    '  // compiler-verified against installed GnuCOBOL: ADVANCING 0 LINES is a',
    '  // bare carriage return (same-line overprint), ADVANCING n LINES (n>=1)',
    '  // is exactly n newline characters (n-1 blank lines plus the ordinary',
    '  // line break), never n-1.',
    '  def advanceSep(n: Int): String = if n <= 0 then "\\r" else "\\n" * n',
    '',
    '  // round-7 finding 5: `decimalComma` (SPECIAL-NAMES\' DECIMAL-POINT IS',
    '  // COMMA - see generator/expression-gen.js\'s setDecimalPointIsComma)',
    '  // renders the decimal point as "," instead of "." - compiler-verified',
    '  // against installed GnuCOBOL (tests/oracle - u03/u03b\'s oracle output,',
    '  // round-7 refutation) that a plain (non-edited) numeric DISPLAY item',
    '  // renders its assumed decimal point using the *current* DECIMAL-POINT',
    '  // character, not always ".". Defaults to false so every call site that',
    '  // predates this finding (100% of them) is byte-for-byte unchanged.',
    '  def num(v: BigDecimal, intDigits: Int, decDigits: Int, signed: Boolean, decimalComma: Boolean = false): String =',
    '    val neg = v.signum < 0',
    '    val absVal = v.abs',
    '    val totalDigits = intDigits + decDigits',
    '    val unscaled = (absVal * BigDecimal(10).pow(decDigits)).setScale(0, BigDecimal.RoundingMode.HALF_UP).toBigInt.toString',
    '    val digits = if unscaled.length < totalDigits then ("0" * (totalDigits - unscaled.length)) + unscaled else unscaled',
    '    val intPart = if intDigits > 0 then digits.dropRight(decDigits) else ""',
    '    val decPart = if decDigits > 0 then digits.takeRight(decDigits) else ""',
    '    val signStr = if signed then (if neg then "-" else "+") else ""',
    '    val body = if decDigits > 0 then intPart + (if decimalComma then "," else ".") + decPart else intPart',
    '    signStr + body',
    '',
    '  // round-7 findings 2/3: DISPLAY of a COMP-1/COMP-2 (Float/Double) item -',
    '  // these have no PIC clause (no fixed integer/decimal digit counts to',
    '  // zero-pad to the way `num` above does for an ordinary DISPLAY numeric',
    '  // item), so cobc renders them as plain decimal text instead - compiler-',
    '  // verified against installed GnuCOBOL (tests/oracle - u02b\'s oracle',
    '  // output, round-7 refutation): 3.5 -> "3.5", 2.25 -> "2.25", and a',
    '  // *whole* value like 7.0 -> "7" (no trailing ".0"/decimal point at',
    '  // all) - unlike Scala\'s own Float/Double.toString, which always keeps',
    '  // a ".0" for a whole value. `.toString` on a Float/Double already gives',
    '  // the shortest round-tripping decimal text (matching cobc\'s own',
    '  // representation for every value both were checked against), so this',
    '  // only has to additionally strip a trailing ".0".',
    '  def floatDisplay(v: Double): String =',
    '    val s = v.toString',
    '    if s.endsWith(".0") then s.dropRight(2) else s',
    '',
    '  // Fixed-width alphanumeric MOVE alignment: default is truncate-right/',
    '  // pad-right with spaces; JUSTIFIED RIGHT truncates-left/pads-left.',
    '  def fitLeft(s: String, width: Int): String =',
    '    if width <= 0 then s',
    '    else if s.length >= width then s.substring(0, width)',
    '    else s + (" " * (width - s.length))',
    '  def fitRight(s: String, width: Int): String =',
    '    if width <= 0 then s',
    '    else if s.length >= width then s.substring(s.length - width)',
    '    else (" " * (width - s.length)) + s',
    '',
    '  // Unsigned display-digit text of a numeric value, zero-padded to',
    '  // intDigits+decDigits with no decimal point character (COBOL\'s implied',
    '  // V occupies no storage) and no sign - used when a numeric item is',
    '  // MOVEd to an alphanumeric receiver, which takes the sending item\'s raw',
    '  // digit characters only.',
    '  def digitsOf(v: BigDecimal, intDigits: Int, decDigits: Int): String =',
    '    val absVal = v.abs',
    '    val totalDigits = intDigits + decDigits',
    '    val unscaled = (absVal * BigDecimal(10).pow(decDigits)).setScale(0, BigDecimal.RoundingMode.HALF_UP).toBigInt.toString',
    '    if unscaled.length < totalDigits then ("0" * (totalDigits - unscaled.length)) + unscaled else unscaled.takeRight(math.max(totalDigits, unscaled.length))',
    '',
    '  // FUNCTION NUMVAL argument parsing: COBOL allows spaces anywhere around',
    '  // the (optional, leading or trailing) sign - not just at the very start/',
    '  // end of the string - e.g. \'+  12.5\' and \'12.5-\' are both COBOL-legal.',
    '  // BigDecimal\'s own parser only tolerates leading/trailing whitespace, so',
    '  // every space is stripped first (spaces are never significant inside a',
    '  // NUMVAL argument - they only ever separate a sign from its digits), the',
    '  // sign (wherever it ended up) is normalized to the front, and what',
    '  // remains is parsed as a plain signed decimal.',
    '  // round-8 finding 2: `decimalComma` (SPECIAL-NAMES\' DECIMAL-POINT IS',
    '  // COMMA - same convention/flag as `num`/`edited` above) swaps which',
    '  // punctuation character NUMVAL treats as the decimal point: under',
    '  // DECIMAL-POINT IS COMMA, "," is the decimal point (normalized to "."',
    '  // for BigDecimal\'s own parser, which only understands ".") and "." is',
    '  // the digit-grouping separator (stripped, same as "," is stripped in',
    '  // the default/non-comma mode) - compiler-verified against installed',
    '  // GnuCOBOL (tests/oracle - v05c\'s oracle output, round-8 refutation:',
    '  // NUMVAL("123,45") under DECIMAL-POINT IS COMMA is 123.45, not a parse',
    '  // failure). Defaults to false, matching every call site that predates',
    '  // this finding.',
    '  def numval(s: String, decimalComma: Boolean = false): BigDecimal =',
    '    val compact = s.filterNot(_.isWhitespace)',
    '    val hasLeadingSign = compact.nonEmpty && (compact.head == \'+\' || compact.head == \'-\')',
    '    val hasTrailingSign = compact.nonEmpty && (compact.last == \'+\' || compact.last == \'-\')',
    '    val negative = (hasLeadingSign && compact.head == \'-\') || (hasTrailingSign && compact.last == \'-\')',
    '    var digits = compact',
    '    if hasLeadingSign then digits = digits.drop(1)',
    '    if hasTrailingSign then digits = digits.dropRight(1)',
    '    val normalized =',
    '      if decimalComma then digits.filterNot(_ == \'.\').replace(\',\', \'.\') else digits.filterNot(_ == \',\')',
    '    if normalized.isEmpty then BigDecimal(0) else BigDecimal((if negative then "-" else "") + normalized)',
    '',
    '  // Numeric MOVE truncation to a target\'s declared digit widths: extra',
    '  // low-order decimal digits are dropped (never rounded - MOVE truncates,',
    '  // it does not round), and extra high-order integer digits are dropped',
    '  // (COBOL keeps only the low-order integerDigits digits, sign preserved -',
    '  // matches BigDecimal\'s `%` remainder, which truncates toward zero).',
    '  def truncNumeric(v: BigDecimal, intDigits: Int, decDigits: Int): BigDecimal =',
    '    val scaled = v.setScale(decDigits, BigDecimal.RoundingMode.DOWN)',
    '    val whole = scaled.setScale(0, BigDecimal.RoundingMode.DOWN)',
    '    val frac = scaled - whole',
    '    val mod = BigDecimal(10).pow(math.max(intDigits, 0))',
    '    (whole % mod) + frac',
    '',
    '  // Arithmetic-assignment store-time semantics for a ROUNDED target',
    '  // (COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE ... ROUNDED): HALF_UP rounding',
    '  // to the target\'s declared decimal digits (COBOL\'s ROUNDED clause),',
    '  // then the same high-order integer-digit truncation truncNumeric applies',
    '  // (a ROUNDED result can still overflow the target\'s integer capacity,',
    '  // and COBOL truncates the high-order digits exactly the same way with',
    '  // or without ROUNDED).',
    '  def roundNumeric(v: BigDecimal, intDigits: Int, decDigits: Int): BigDecimal =',
    '    val scaled = v.setScale(decDigits, BigDecimal.RoundingMode.HALF_UP)',
    '    val whole = scaled.setScale(0, BigDecimal.RoundingMode.DOWN)',
    '    val frac = scaled - whole',
    '    val mod = BigDecimal(10).pow(math.max(intDigits, 0))',
    '    (whole % mod) + frac',
    '',
    '  // ON SIZE ERROR digit-capacity test: true when the *integer* part of v',
    '  // fits within intDigits decimal digits (COBOL\'s SIZE ERROR condition is',
    '  // about integer-digit overflow only - the fractional part is simply',
    '  // truncated/rounded as normal and never triggers it).',
    '  def fitsDigits(v: BigDecimal, intDigits: Int): Boolean =',
    '    if intDigits <= 0 then v.abs.signum == 0',
    '    else v.abs.toBigInt.toString.length <= intDigits',
    '',
    '  // Runtime port of the generator\'s formatEditedPicture (see',
    '  // generator/expression-gen.js) for a numeric-edited MOVE whose source',
    '  // value is not known until runtime (a variable/expression, not a',
    '  // compile-time literal). rawValue is already-formatted signed decimal',
    '  // text (see numericRawValueExpr at the call site).',
    '  // `decimalComma` (round-7 finding 5, same convention as `num` above):',
    '  // under SPECIAL-NAMES\' DECIMAL-POINT IS COMMA, "," (not ".") is the',
    '  // edit pattern\'s decimal-point insertion character - e.g. `PIC ZZ9,99`',
    '  // means what `PIC ZZ9.99` means by default (3 integer + 2 decimal',
    '  // digit positions, decimal point rendered as ",") - compiler-verified',
    '  // (u03b\'s oracle output). Defaults to false, matching every call site',
    '  // that predates this finding.',
    '  def edited(editPattern: String, rawValue: String, blankWhenZero: Boolean, decimalComma: Boolean = false): String =',
    '    val decimalMarker = if decimalComma then \',\' else \'.\'',
    '    var corePattern = editPattern',
    '    var trailingSign: String = null',
    '    if corePattern.endsWith("CR") || corePattern.endsWith("DB") then',
    '      trailingSign = corePattern.substring(corePattern.length - 2)',
    '      corePattern = corePattern.substring(0, corePattern.length - 2)',
    '',
    '    val raw = rawValue.trim',
    '    val neg = raw.startsWith("-")',
    '    val unsignedRaw = if raw.startsWith("-") || raw.startsWith("+") then raw.substring(1) else raw',
    '    val dotIdx = unsignedRaw.indexOf(".")',
    '    val intRaw = if dotIdx == -1 then unsignedRaw else unsignedRaw.substring(0, dotIdx)',
    '    val decRaw = if dotIdx == -1 then "" else unsignedRaw.substring(dotIdx + 1)',
    '',
    '    val chars = corePattern.toCharArray.toVector',
    '    case class DigitPos(idx: Int, fixed: Boolean, isDecimal: Boolean, var digit: Char)',
    '',
    '    var seenDecimalPoint = false',
    '    val digitPositions = scala.collection.mutable.ArrayBuffer[DigitPos]()',
    '    var floatingChar: Char = 0',
    '    val floatingIndices = scala.collection.mutable.ArrayBuffer[Int]()',
    '    var fixedSymbolIdx = -1',
    '    var fixedSymbolChar: Char = 0',
    '    val symCount = scala.collection.mutable.Map(\'$\' -> 0, \'+\' -> 0, \'-\' -> 0)',
    '    for ch <- chars if symCount.contains(ch) do symCount(ch) += 1',
    '',
    '    for idx <- chars.indices do',
    '      val ch = chars(idx)',
    '      if ch == decimalMarker then',
    '        seenDecimalPoint = true',
    '      else if ch == \'9\' || ch == \'Z\' || ch == \'*\' then',
    '        digitPositions += DigitPos(idx, ch == \'9\', seenDecimalPoint, \'0\')',
    '      else if ch == \'$\' || ch == \'+\' || ch == \'-\' then',
    '        if symCount(ch) >= 2 then',
    '          digitPositions += DigitPos(idx, false, seenDecimalPoint, \'0\')',
    '          floatingChar = ch',
    '          floatingIndices += idx',
    '        else',
    '          fixedSymbolIdx = idx',
    '          fixedSymbolChar = ch',
    '',
    '    val intDigitCount = digitPositions.count(d => !d.isDecimal)',
    '    val decDigitCount = digitPositions.count(d => d.isDecimal)',
    '    val intDigits = if intDigitCount == 0 then "" else ("0" * math.max(intDigitCount - intRaw.length, 0) + intRaw).takeRight(intDigitCount)',
    '    val decDigitsStr = if decDigitCount == 0 then "" else (decRaw + ("0" * decDigitCount)).take(decDigitCount)',
    '    val digitsStr = intDigits + decDigitsStr',
    '    for i <- digitPositions.indices do digitPositions(i).digit = digitsStr(i)',
    '',
    '    var firstShown = digitPositions.indexWhere(d => d.fixed || d.digit != \'0\')',
    '    if firstShown == -1 then firstShown = digitPositions.length',
    '',
    '    var boundaryIdx = -1',
    '    var symbolChar: Char = 0',
    '    if floatingIndices.length >= 2 then',
    '      symbolChar = floatingChar',
    '      boundaryIdx = if firstShown > 0 then digitPositions(firstShown - 1).idx else floatingIndices(0)',
    '',
    '    val floatingSignChar = symbolChar match',
    '      case \'+\' => if neg then "-" else "+"',
    '      case \'-\' => if neg then "-" else " "',
    '      case \'$\' => "$"',
    '      case _ => ""',
    '    val fixedSignChar = fixedSymbolChar match',
    '      case \'+\' => if neg then "-" else "+"',
    '      case \'-\' => if neg then "-" else " "',
    '      case \'$\' => "$"',
    '      case _ => ""',
    '',
    '    val shownFromIdx =',
    '      if boundaryIdx != -1 then boundaryIdx',
    '      else if firstShown < digitPositions.length then digitPositions(firstShown).idx',
    '      else chars.length',
    '',
    '    val out = new StringBuilder',
    '    for idx <- chars.indices do',
    '      val ch = chars(idx)',
    '      if ch == \'.\' then',
    '        out += (if idx >= shownFromIdx then \'.\' else \' \')',
    '      else if ch == \'9\' || ch == \'Z\' || ch == \'*\' then',
    '        val arrIdx = digitPositions.indexWhere(_.idx == idx)',
    '        out += (if arrIdx >= firstShown then digitPositions(arrIdx).digit else \' \')',
    '      else if ch == \'$\' || ch == \'+\' || ch == \'-\' then',
    '        if idx == fixedSymbolIdx then out ++= fixedSignChar',
    '        else if idx == boundaryIdx then out ++= floatingSignChar',
    '        else',
    '          val arrIdx = digitPositions.indexWhere(_.idx == idx)',
    '          out += (if arrIdx != -1 && arrIdx >= firstShown then digitPositions(arrIdx).digit else \' \')',
    '      else',
    '        out += (if idx >= shownFromIdx then ch else \' \')',
    '',
    '    var result = out.toString',
    '    if trailingSign != null then result = result + (if neg then trailingSign else "  ")',
    '',
    '    val allZero = digitsStr.forall(_ == \'0\')',
    '    if blankWhenZero && allZero then " " * editPattern.length else result',
  ].join('\n');
}

/**
 * Scala source for the CobolInspect runtime helper embedded in every
 * generated program, backing INSPECT TALLYING/REPLACING generation
 * (generateInspect). Kept as small, literal-substring operations (not
 * regex-based) since COBOL's INSPECT operands are literal text, not
 * patterns, and matches are non-overlapping, scanned strictly left to right.
 */
export function generateCobolInspectHelper() {
  return [
    'object CobolInspect:',
    '  def tallyAll(s: String, pat: String): Int =',
    '    if pat.isEmpty then 0',
    '    else',
    '      var i = 0',
    '      var c = 0',
    '      while i <= s.length - pat.length do',
    '        if s.regionMatches(i, pat, 0, pat.length) then',
    '          c += 1',
    '          i += pat.length',
    '        else',
    '          i += 1',
    '      c',
    '  def tallyLeading(s: String, pat: String): Int =',
    '    if pat.isEmpty then 0',
    '    else',
    '      var i = 0',
    '      var c = 0',
    '      while s.regionMatches(i, pat, 0, pat.length) do',
    '        c += 1',
    '        i += pat.length',
    '      c',
    '  def replaceAll(s: String, from: String, to: String): String =',
    '    if from.isEmpty then s else s.replace(from, to)',
    '  def replaceFirst(s: String, from: String, to: String): String =',
    '    val i = s.indexOf(from)',
    '    if i < 0 then s else s.substring(0, i) + to + s.substring(i + from.length)',
    '  def replaceLeading(s: String, from: String, to: String): String =',
    '    val sb = new StringBuilder(s)',
    '    var i = 0',
    '    while from.nonEmpty && i <= s.length - from.length && sb.toString.regionMatches(i, from, 0, from.length) do',
    '      for j <- 0 until math.min(from.length, to.length) do sb.setCharAt(i + j, to(j))',
    '      i += from.length',
    '    sb.toString',
    '  def replaceTrailing(s: String, from: String, to: String): String =',
    '    val sb = new StringBuilder(s)',
    '    var i = s.length - from.length',
    '    while from.nonEmpty && i >= 0 && sb.toString.regionMatches(i, from, 0, from.length) do',
    '      for j <- 0 until math.min(from.length, to.length) do sb.setCharAt(i + j, to(j))',
    '      i -= from.length',
    '    sb.toString',
    '  def replaceCharacters(s: String, to: String): String =',
    '    if to.isEmpty then s else to.head.toString * s.length',
    '  // INSPECT ... BEFORE/AFTER INITIAL <boundary> (round-4 finding 3): split',
    '  // `s` into (the piece an operation should actually scan/modify, the',
    '  // untouched complement to reattach) around the *first* occurrence of',
    '  // `boundary`. beforeInitial\'s region is everything up to (not including)',
    '  // that occurrence; afterInitial\'s region is everything after it (the',
    '  // boundary text itself belongs to the *unchanged* complement in both',
    '  // cases). No occurrence at all: BEFORE treats the whole string as the',
    '  // region (nothing to exclude), AFTER treats the region as empty (nothing',
    '  // "after" an occurrence that never happened).',
    '  def beforeInitial(s: String, boundary: String): (String, String) =',
    '    if boundary.isEmpty then (s, "")',
    '    else',
    '      val i = s.indexOf(boundary)',
    '      if i < 0 then (s, "") else (s.substring(0, i), s.substring(i))',
    '  def afterInitial(s: String, boundary: String): (String, String) =',
    '    if boundary.isEmpty then (s, "")',
    '    else',
    '      val i = s.indexOf(boundary)',
    '      if i < 0 then (s, "") else (s.substring(0, i + boundary.length), s.substring(i + boundary.length))',
    '',
    '  // round-14 finding 2: a SINGLE INSPECT statement carrying MULTIPLE',
    '  // REPLACING clauses (e.g. `REPLACING ALL "A" BY "B" ALL "B" BY "A"`) must',
    '  // have every clause match against the PRE-STATEMENT snapshot of the',
    '  // subject, in ONE left-to-right scan - not a cascade where each clause\'s',
    '  // own textual output feeds the next clause\'s input (`AAAABBBB` with the',
    '  // two clauses above must become `BBBBAAAA`, not `AAAAAAAA` - a naive',
    '  // sequential .replace/.replace would first turn every `A` into `B`',
    '  // (`BBBBBBBB`), then every `B` - including the ones the first pass just',
    '  // wrote - into `A` (`AAAAAAAA`)). Mirrors real COBOL\'s own rule: scanning',
    '  // left to right one position at a time, the FIRST clause (in the order',
    '  // written) whose comparand matches at that position wins; matched',
    '  // characters are then skipped over (not re-examined by a later clause).',
    '  case class ReplClause(kind: String, from: String, to: String, regionType: String, regionBoundary: String)',
    '',
    '  private def replRegion(s: String, c: ReplClause): (Int, Int) =',
    '    val n = s.length',
    '    c.regionType match',
    '      case "BEFORE" =>',
    '        if c.regionBoundary.isEmpty then (0, n)',
    '        else',
    '          val i = s.indexOf(c.regionBoundary)',
    '          if i < 0 then (0, n) else (0, i)',
    '      case "AFTER" =>',
    '        if c.regionBoundary.isEmpty then (0, n)',
    '        else',
    '          val i = s.indexOf(c.regionBoundary)',
    '          if i < 0 then (n, n) else (i + c.regionBoundary.length, n)',
    '      case _ => (0, n)',
    '',
    '  // TRAILING\'s own contiguous run is anchored at the END of its region -',
    '  // precomputed here (non-destructively, against the original text) exactly',
    '  // like the single-clause replaceTrailing helper\'s own backward scan.',
    '  private def replTrailingZoneStart(s: String, c: ReplClause, start: Int, end: Int): Int =',
    '    if c.from.isEmpty then end',
    '    else',
    '      var i = end - c.from.length',
    '      while i >= start && s.regionMatches(i, c.from, 0, c.from.length) do i -= c.from.length',
    '      i + c.from.length',
    '',
    '  // Position-preserving overwrite (LEADING/TRAILING/CHARACTERS convention -',
    '  // matches replaceLeading/replaceTrailing\'s own setCharAt-based partial',
    '  // overwrite): only the first min(from.length, to.length) characters of',
    '  // the matched span actually change; any remaining positions keep their',
    '  // original text.',
    '  private def replPadded(s: String, start: Int, spanLen: Int, to: String): String =',
    '    val sb = new StringBuilder',
    '    var j = 0',
    '    while j < spanLen do',
    '      sb.append(if j < to.length then to(j) else s.charAt(start + j))',
    '      j += 1',
    '    sb.toString',
    '',
    '  def replaceMultiClause(s: String, clauses: Seq[ReplClause]): String =',
    '    val n = s.length',
    '    val regions = clauses.map(c => replRegion(s, c))',
    '    val trailingStarts = clauses.zip(regions).map { case (c, (start, end)) =>',
    '      if c.kind == "TRAILING" then replTrailingZoneStart(s, c, start, end) else -1',
    '    }',
    '    val leadingActive = Array.fill(clauses.length)(true)',
    '    val firstDone = Array.fill(clauses.length)(false)',
    '    val out = new StringBuilder',
    '    var i = 0',
    '    while i < n do',
    '      var consumed = false',
    '      var ci = 0',
    '      while !consumed && ci < clauses.length do',
    '        val c = clauses(ci)',
    '        val (rStart, rEnd) = regions(ci)',
    '        if i >= rStart && i < rEnd then',
    '          c.kind match',
    '            case "CHARACTERS" =>',
    '              out.append(if c.to.nonEmpty then c.to.head else s.charAt(i))',
    '              i += 1',
    '              consumed = true',
    '            case "ALL" =>',
    '              if c.from.nonEmpty && i + c.from.length <= rEnd && s.regionMatches(i, c.from, 0, c.from.length) then',
    '                out.append(c.to)',
    '                i += c.from.length',
    '                consumed = true',
    '            case "FIRST" =>',
    '              if !firstDone(ci) && c.from.nonEmpty && i + c.from.length <= rEnd && s.regionMatches(i, c.from, 0, c.from.length) then',
    '                out.append(c.to)',
    '                i += c.from.length',
    '                firstDone(ci) = true',
    '                consumed = true',
    '            case "LEADING" =>',
    '              if leadingActive(ci) then',
    '                if c.from.nonEmpty && i + c.from.length <= rEnd && s.regionMatches(i, c.from, 0, c.from.length) then',
    '                  out.append(replPadded(s, i, c.from.length, c.to))',
    '                  i += c.from.length',
    '                  consumed = true',
    '                else',
    '                  leadingActive(ci) = false',
    '            case "TRAILING" =>',
    '              if c.from.nonEmpty && i >= trailingStarts(ci) && ((i - trailingStarts(ci)) % c.from.length == 0) && i + c.from.length <= rEnd then',
    '                out.append(replPadded(s, i, c.from.length, c.to))',
    '                i += c.from.length',
    '                consumed = true',
    '            case _ => ()',
    '        ci += 1',
    '      if !consumed then',
    '        out.append(s.charAt(i))',
    '        i += 1',
    '    out.toString',
  ].join('\n');
}

/**
 * UNSTRING runtime helper (see generateUnstring) - a character-by-character
 * scan (not a single regex `.split()`, which can't express all of this at
 * once): starts at a given 0-based position (WITH POINTER - round-4 finding
 * 10), stops after at most `maxFields` delimited fields (COBOL only fills as
 * many INTO targets as it has), and for each field also reports back which
 * literal delimiter text actually matched at its boundary (DELIMITER IN -
 * finding 12; empty string for a final field consumed with no delimiter
 * following, i.e. ran out of source). `delims` is tried in listed order at
 * every position - the earliest match in the source wins; a tie at the same
 * position keeps whichever delimiter is *listed* first (mirrors regex
 * alternation's leftmost-alternative-wins precedence, matching COBOL's
 * DELIMITED BY id-1 OR id-2 OR ... left-to-right priority). `all` (true for
 * a delimiter written with the ALL keyword - finding 11) extends the match
 * over every immediately-following repeat of that *same* delimiter text, so
 * "a,,b" DELIMITED BY ALL "," yields ["a","b"], not ["a","","b"].
 */
export function generateCobolUnstringHelper() {
  return [
    'object CobolUnstring:',
    '  // Fourth element (round-6 finding 6): true when the source held MORE',
    '  // delimited fields than there were INTO targets to receive them (some',
    '  // of the source was left unexamined because every receiver was already',
    '  // full) - compiler-verified against installed GnuCOBOL (t12): exactly',
    '  // "hit the maxFields cap while text after the last-consumed delimiter',
    '  // still remains", not merely "maxFields fields were produced" (an exact',
    '  // fit - the last field consuming the source right up to its end - is',
    '  // NOT overflow).',
    '  def unstring(source: String, startPos: Int, delims: Seq[(String, Boolean)], maxFields: Int): (Vector[String], Vector[String], Int, Boolean) =',
    '    var pos = math.max(0, math.min(startPos, source.length))',
    '    var fields = Vector.empty[String]',
    '    var matched = Vector.empty[String]',
    '    var continue_ = true',
    '    while fields.length < maxFields && continue_ do',
    '      var bestIdx = -1',
    '      var bestText = ""',
    '      var bestAll = false',
    '      for (text, all) <- delims if text.nonEmpty do',
    '        val i = source.indexOf(text, pos)',
    '        if i >= 0 && (bestIdx == -1 || i < bestIdx) then',
    '          bestIdx = i',
    '          bestText = text',
    '          bestAll = all',
    '      if bestIdx == -1 then',
    '        fields = fields :+ source.substring(pos)',
    '        matched = matched :+ ""',
    '        pos = source.length',
    '        continue_ = false',
    '      else',
    '        fields = fields :+ source.substring(pos, bestIdx)',
    '        var endPos = bestIdx + bestText.length',
    '        if bestAll then',
    '          while endPos <= source.length - bestText.length && source.regionMatches(endPos, bestText, 0, bestText.length) do',
    '            endPos += bestText.length',
    '        matched = matched :+ bestText',
    '        pos = endPos',
    '    val overflow = fields.length == maxFields && pos < source.length',
    '    (fields, matched, pos, overflow)',
  ].join('\n');
}

/**
 * Numeric-edited PICTURE formatting (Z/9/* zero-suppression, $/+/- fixed and
 * floating insertion, comma/decimal-point insertion, CR/DB trailing sign).
 * Evaluated at Scala-generation time against a COBOL literal's raw text -
 * every numeric-edited MOVE source in the Phase 1 corpus is a literal, so
 * the formatted result is embedded directly as a Scala string literal
 * (the numeric-edited item is a receiving-only field: COBOL performs the
 * editing at MOVE time, DISPLAY simply prints the stored characters).
 *
 * @param {string} editPattern - the parser's fully-expanded PicClause.editPattern
 *   (repeat counts already expanded, CR/DB already appended as a literal
 *   2-char suffix - see parser/data-division-parser.js parsePicPattern).
 * @param {string} rawValue - the literal's raw text, e.g. "-987654321.99".
 * @param {boolean} [blankWhenZero] - BLANK WHEN ZERO clause: the *entire*
 *   field (all editPattern.length positions, including any CR/DB suffix)
 *   renders as spaces whenever the value is exactly zero, overriding every
 *   other edit character.
 * @param {boolean} [decimalPointIsComma] - round-7 finding 5: SPECIAL-NAMES'
 *   DECIMAL-POINT IS COMMA - "," (not ".") is the pattern's decimal-point
 *   insertion character (defaults to the module-level flag set by
 *   setDecimalPointIsComma, so existing call sites that don't pass this
 *   explicitly still pick up the current program's setting).
 */
export function formatEditedPicture(editPattern, rawValue, blankWhenZero = false, decimalPointIsComma = DECIMAL_POINT_IS_COMMA) {
  const decimalMarker = decimalPointIsComma ? ',' : '.';
  let corePattern = editPattern;
  let trailingSign = null;
  if (/CR$/.test(corePattern) || /DB$/.test(corePattern)) {
    trailingSign = corePattern.slice(-2);
    corePattern = corePattern.slice(0, -2);
  }

  const raw = String(rawValue).trim();
  const neg = raw.startsWith('-');
  const unsignedRaw = raw.replace(/^[+-]/, '');
  const dotIdx = unsignedRaw.indexOf('.');
  const intRaw = dotIdx === -1 ? unsignedRaw : unsignedRaw.slice(0, dotIdx);
  const decRaw = dotIdx === -1 ? '' : unsignedRaw.slice(dotIdx + 1);

  const chars = corePattern.split('');

  const symbolCounts = { '$': 0, '+': 0, '-': 0 };
  for (const ch of chars) if (ch in symbolCounts) symbolCounts[ch] += 1;

  let seenDecimalPoint = false;
  const digitPositions = []; // { idx, kind: 'fixed' | 'suppress', isDecimal }
  let floatingChar = null;
  const floatingIndices = [];
  let fixedSymbolIdx = null;
  let fixedSymbolChar = null;

  chars.forEach((ch, idx) => {
    if (ch === decimalMarker) {
      seenDecimalPoint = true;
      return;
    }
    if (ch === '9' || ch === 'Z' || ch === '*') {
      digitPositions.push({ idx, kind: ch === '9' ? 'fixed' : 'suppress', isDecimal: seenDecimalPoint });
      return;
    }
    if (ch === '$' || ch === '+' || ch === '-') {
      if (symbolCounts[ch] >= 2) {
        digitPositions.push({ idx, kind: 'suppress', isDecimal: seenDecimalPoint, isSymbol: true });
        floatingChar = ch;
        floatingIndices.push(idx);
      } else {
        fixedSymbolIdx = idx;
        fixedSymbolChar = ch;
      }
    }
    // Other insertion characters (',', 'B', '0', '/') need no classification
    // here - they're handled purely positionally at render time below.
  });

  const intDigitCount = digitPositions.filter(d => !d.isDecimal).length;
  const decDigitCount = digitPositions.filter(d => d.isDecimal).length;

  const intDigits = intDigitCount === 0 ? '' : intRaw.padStart(intDigitCount, '0').slice(-intDigitCount);
  const decDigits = decDigitCount === 0 ? '' : decRaw.padEnd(decDigitCount, '0').slice(0, decDigitCount);
  const digitsStr = intDigits + decDigits;
  digitPositions.forEach((d, i) => { d.digit = digitsStr[i]; });

  let firstShownArrIdx = digitPositions.findIndex(d => d.kind === 'fixed' || (d.kind === 'suppress' && d.digit !== '0'));
  // No position qualifies (an all-suppress picture - no '9' anywhere - whose
  // value is entirely zero): COBOL shows nothing at all (the whole field
  // zero-suppresses to blank), NOT a forced trailing zero digit. A picture
  // with at least one '9' always matches above via `kind === 'fixed'`
  // regardless of that digit's value, so this branch is only reached for
  // genuinely all-suppress zero pictures.
  if (firstShownArrIdx === -1) firstShownArrIdx = digitPositions.length;

  let boundaryPatternIdx = null;
  let symbolChar = null;
  if (floatingIndices.length >= 2) {
    symbolChar = floatingChar;
    boundaryPatternIdx = firstShownArrIdx > 0
      ? digitPositions[firstShownArrIdx - 1].idx
      : floatingIndices[0];
  }

  let floatingSignChar = '';
  if (symbolChar === '+') floatingSignChar = neg ? '-' : '+';
  else if (symbolChar === '-') floatingSignChar = neg ? '-' : ' ';
  else if (symbolChar === '$') floatingSignChar = '$';

  let fixedSignChar = '';
  if (fixedSymbolChar === '+') fixedSignChar = neg ? '-' : '+';
  else if (fixedSymbolChar === '-') fixedSignChar = neg ? '-' : ' ';
  else if (fixedSymbolChar === '$') fixedSignChar = '$';

  // When nothing at all qualifies to be shown (all-suppress picture, zero
  // value), fall past the end of the pattern rather than 0, so literal/
  // insertion characters (commas, fixed text) blank out too, not just the
  // digit positions - the whole field zero-suppresses to spaces.
  const shownFromPatternIdx = boundaryPatternIdx !== null
    ? boundaryPatternIdx
    : (firstShownArrIdx < digitPositions.length ? digitPositions[firstShownArrIdx].idx : corePattern.length);

  let out = '';
  chars.forEach((ch, idx) => {
    if (ch === '.') {
      out += idx >= shownFromPatternIdx ? '.' : ' ';
      return;
    }
    if (ch === '9' || ch === 'Z' || ch === '*') {
      const arrIdx = digitPositions.findIndex(d => d.idx === idx);
      out += arrIdx >= firstShownArrIdx ? digitPositions[arrIdx].digit : ' ';
      return;
    }
    if (ch === '$' || ch === '+' || ch === '-') {
      if (idx === fixedSymbolIdx) {
        out += fixedSignChar;
      } else if (idx === boundaryPatternIdx) {
        out += floatingSignChar;
      } else {
        // A floating symbol position past the boundary is a shown digit
        // slot (e.g. the '1' of 1,234.50 falls on a '$' in $$$,$$9.99), not
        // blank - only positions strictly before the boundary are blanked.
        const arrIdx = digitPositions.findIndex(d => d.idx === idx);
        out += arrIdx !== -1 && arrIdx >= firstShownArrIdx ? digitPositions[arrIdx].digit : ' ';
      }
      return;
    }
    out += idx >= shownFromPatternIdx ? ch : ' ';
  });

  if (trailingSign) {
    out += neg ? trailingSign : '  ';
  }

  if (blankWhenZero && /^0*$/.test(digitsStr)) {
    return ' '.repeat(editPattern.length);
  }

  return out;
}

/**
 * Convert a COBOL arithmetic expression to Scala
 */
export function convertArithmeticExpression(expr) {
  if (!expr) return '';

  if (typeof expr === 'string' || typeof expr === 'number') {
    const strExpr = String(expr);
    // Check if it's an identifier or a literal
    if (/^[A-Za-z]/.test(strExpr)) {
      return convertIdentifier(strExpr);
    }
    return strExpr;
  }

  if (expr.type === 'FunctionCall') {
    return generateFunctionCall(expr);
  }

  // Nodes produced by the procedure parser (parser/ast.js shapes)
  if (expr.type === 'ArithmeticExpression') {
    if (expr.unaryMinus) {
      return `-${convertArithmeticExpression(expr.right)}`;
    }
    if (expr.functionCall) {
      return generateFunctionCall(expr.functionCall);
    }
    if (expr.operator && expr.left != null && expr.right != null) {
      const left = convertArithmeticExpression(expr.left);
      const right = convertArithmeticExpression(expr.right);
      if (expr.operator === '**') {
        return `Math.pow(${left}, ${right})`;
      }
      const op = ARITHMETIC_OPERATORS[expr.operator] || expr.operator;
      return `(${left} ${op} ${right})`;
    }
    if (expr.variable) {
      return convertIdentifier(expr.variable);
    }
    if (expr.value !== null && expr.value !== undefined) {
      // An ArithmeticExpression's own `.value` (as opposed to `.left`/
      // `.right` holding nested Literal nodes) is only ever populated by
      // parsePrimary's NUMERIC_LITERAL branch (parser/procedure-parser.js) -
      // a bare arithmetic-expression term never wraps a *string* literal
      // this way (those come through as their own Literal node instead,
      // handled by the `expr.type === 'Literal'` branch below) - so this is
      // always numeric, explicitly (round-6 finding 2/3 audit).
      return convertLiteral(expr.value, 'numeric');
    }
    return '0';
  }

  if (expr.type === 'VariableReference') {
    return convertIdentifier(expr);
  }

  if (expr.type === 'Literal') {
    // round-6 finding 2/3: this is the call site that broke FILE STATUS
    // string comparisons and CobolInspect literal arguments - a quoted
    // digit-shaped string literal (e.g. "10", "0") must stay a Scala string,
    // never fall through to convertLiteral's bare-shape numeric guess.
    return convertLiteral(expr.value, expr.literalType);
  }

  if (expr.type === 'literal') {
    return convertLiteral(expr.value, expr.literalType);
  }

  if (expr.type === 'identifier') {
    return convertIdentifier(expr.name);
  }

  if (expr.type === 'binary') {
    const left = convertArithmeticExpression(expr.left);
    const right = convertArithmeticExpression(expr.right);
    const op = ARITHMETIC_OPERATORS[expr.operator] || expr.operator;

    if (expr.operator === '**') {
      return `Math.pow(${left}, ${right})`;
    }

    return `(${left} ${op} ${right})`;
  }

  if (expr.type === 'unary') {
    const operand = convertArithmeticExpression(expr.operand);
    return `-${operand}`;
  }

  if (expr.type === 'function') {
    const args = expr.arguments.map(convertArithmeticExpression).join(', ');
    const funcName = convertCobolFunction(expr.name);
    return `${funcName}(${args})`;
  }

  return safeNodeString(expr);
}

/**
 * Convert COBOL intrinsic functions to Scala
 */
function convertCobolFunction(funcName) {
  const functionMap = {
    'FUNCTION LENGTH': 'length',
    'FUNCTION UPPER-CASE': 'toUpperCase',
    'FUNCTION LOWER-CASE': 'toLowerCase',
    'FUNCTION TRIM': 'trim',
    'FUNCTION NUMVAL': 'toDouble',
    'FUNCTION ABS': 'Math.abs',
    'FUNCTION SQRT': 'Math.sqrt',
    'FUNCTION SIN': 'Math.sin',
    'FUNCTION COS': 'Math.cos',
    'FUNCTION TAN': 'Math.tan',
    'FUNCTION LOG': 'Math.log',
    'FUNCTION LOG10': 'Math.log10',
    'FUNCTION EXP': 'Math.exp',
    'FUNCTION MAX': 'Math.max',
    'FUNCTION MIN': 'Math.min',
    'FUNCTION MOD': 'mod',
    'FUNCTION REMAINDER': 'remainder',
    'FUNCTION INTEGER': 'toInt',
    'FUNCTION INTEGER-PART': 'toInt',
    'FUNCTION CURRENT-DATE': 'java.time.LocalDateTime.now'
  };

  return functionMap[funcName.toUpperCase()] || toCamelCase(funcName);
}

/**
 * FUNCTION LENGTH(x): COBOL's LENGTH always returns the *storage* length of
 * its argument, not any notion of "trimmed"/logical length - a PIC X(10)
 * field holding "hello" still reports 10. For a variable reference this is
 * a compile-time constant (the field's declared PIC length from the
 * registry), so it's embedded directly as a numeric literal rather than a
 * runtime `.length` call (which would report this generator's unpadded
 * internal representation instead - see renderDisplayOperand's padding
 * comment for why storage is kept unpadded internally). For a string
 * literal argument, COBOL's LENGTH is simply the literal's own character
 * count. Falls back to a runtime `.length` call only when neither shape
 * applies (e.g. a reference with no registry entry) - a defensive fallback,
 * not exercised by the Phase 2 corpus.
 */
/**
 * True (returning its digit text) when `node` - a reference modification's
 * `length` operand, as parsed by parseVariableReference's
 * `parseArithmeticExpression(ctx)` call (parser/procedure-parser.js) - is a
 * bare compile-time-known integer constant: either a plain numeric `Literal`
 * node, or the `ArithmeticExpression` wrapper parseArithmeticExpression
 * always produces for a single leaf operand (no operator/left/right/
 * variable/functionCall set, just its own `.value` digit text) - NOT a real
 * arithmetic expression, subscript, or field reference, which would need an
 * actual runtime evaluation this generator has no way to fold at generation
 * time. Returns `null` for anything else (a variable, a computed expression,
 * or a missing length operand entirely - COBOL allows `identifier(start:)`
 * with no length, meaning "to the end of the item", not exercised here).
 */
function refModLiteralLengthText(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'Literal' && node.literalType === 'numeric' && /^-?\d+$/.test(String(node.value))) {
    return String(node.value);
  }
  if (
    node.type === 'ArithmeticExpression' &&
    !node.operator && !node.left && !node.right && !node.variable && !node.functionCall &&
    node.value != null && /^-?\d+$/.test(String(node.value))
  ) {
    return String(node.value);
  }
  return null;
}

function functionLength(arg) {
  if (arg && arg.type === 'Literal' && arg.literalType !== 'figurative') {
    return String(String(arg.value ?? '').length);
  }
  if (arg && arg.type === 'VariableReference') {
    // round-17 finding 2: reference modification (`identifier(start:
    // length)`, Known Gap #1) used as a FUNCTION LENGTH argument. Before
    // this fix, `lookupFieldForRef(arg)` below ignored `.refMod` entirely
    // and returned the BASE field's own full declared `picLength` - SILENT
    // WRONG OUTPUT (no crash, no marker): `FUNCTION LENGTH(WS-SRC(3:4))`
    // reported 10 (WS-SRC's own full width) instead of 4 (the ref-mod's own
    // substring length). Unlike every other ref-mod call site in this file
    // (STRING/comparison/CALL-argument/MOVE-target/DISPLAY, all documented,
    // deliberately out-of-scope honest declines - ref-mod's own runtime
    // substring *value* isn't implemented), the *length* of a reference
    // modification is a compile-time-known constant in the overwhelmingly
    // common case - the `(start:length)` clause's length operand is almost
    // always a literal - so this is actually fully implementable here,
    // rather than just an honest decline: return that literal directly
    // (verified against installed GnuCOBOL, `probe_len.cbl`: a runtime
    // FUNCTION LENGTH call over a ref-mod'd argument DISPLAYs its result
    // zero-padded to a fixed unsigned 10-digit width, unlike the plain-
    // identifier/literal-argument cases above which fold to a bare,
    // unpadded compile-time constant - `CobolFmt.num(..., 10, 0, false,
    // false)` reproduces that exactly). Only when the length operand is
    // itself a variable/expression (not a literal) - genuinely not a
    // compile-time constant - does this fall back to an honest TODO
    // decline rather than guess at a runtime value ref-mod's own semantics
    // don't support computing anyway.
    if (arg.refMod) {
      // Returned as a bare numeric literal (exactly like the ordinary
      // `info.picLength` case just below) - this value also feeds MOVE/
      // COMPUTE/arithmetic contexts (via convertArithmeticExpression's
      // FunctionCall dispatch), which need a plain numeric expression, not
      // pre-formatted display text. A direct DISPLAY of FUNCTION LENGTH
      // over a ref-mod'd argument additionally needs cobc's own 10-digit
      // zero-padded runtime-intrinsic-result format (verified against
      // installed GnuCOBOL, probe_len.cbl - see this function's own doc
      // comment) - generateDisplay special-cases exactly that shape
      // separately (see its own FunctionCall/LENGTH branch) rather than
      // baking display-only formatting into this shared value.
      const literalLength = refModLiteralLengthText(arg.refMod.length);
      if (literalLength != null) return literalLength;
      return `(0 /* TODO: FUNCTION LENGTH of a reference-modified argument whose length operand is not a literal - not implemented - see tests/oracle/README.md known gaps */)`;
    }
    const info = lookupFieldForRef(arg);
    if (info && info.picLength) return String(info.picLength);
    // Not an elementary item in the field registry - check whether it's a
    // GROUP item instead (FUNCTION LENGTH of a group is always the sum of
    // its elementary children's storage bytes, a compile-time constant - see
    // GROUP_BYTE_LENGTH_REGISTRY/scala-generator.js's buildFieldRegistry -
    // never a nonexistent flat-var reference or a runtime `.length` call,
    // which would be this generator's own unpadded internal string length,
    // not COBOL's storage length).
    const nameUpper = String(arg.name || '').toUpperCase();
    if (GROUP_BYTE_LENGTH_REGISTRY.has(nameUpper)) {
      return String(GROUP_BYTE_LENGTH_REGISTRY.get(nameUpper));
    }
  }
  return `${convertArithmeticExpression(arg)}.length`;
}

/**
 * FUNCTION intrinsic call -> Scala expression. Only the intrinsics the
 * Phase 2 corpus (p15-intrinsics.cbl) actually exercises are implemented
 * with verified-against-cobc semantics; anything else renders as a visible
 * TODO marker rather than a guessed translation.
 */
function generateFunctionCall(fc) {
  const name = String(fc?.name || '').toUpperCase();
  const args = fc?.arguments || [];

  switch (name) {
    case 'UPPER-CASE':
      return `(${convertArithmeticExpression(args[0])}).toUpperCase`;
    case 'LOWER-CASE':
      return `(${convertArithmeticExpression(args[0])}).toLowerCase`;
    case 'REVERSE':
      return `(${convertArithmeticExpression(args[0])}).reverse`;
    case 'TRIM':
      return `(${convertArithmeticExpression(args[0])}).trim`;
    case 'LENGTH':
    case 'LENGTH-OF':
      return functionLength(args[0]);
    case 'NUMVAL':
    case 'NUMVAL-C':
      // NUMVAL's argument is always an alphanumeric field/literal that may
      // carry not just leading/trailing spaces from fixed-width storage but
      // COBOL-legal *internal* spaces between an explicit sign and its
      // digits (e.g. '+  12.5') - a plain .trim only strips the outer edges,
      // so BigDecimal's own parser (which rejects internal whitespace
      // outright) still crashes on those. CobolFmt.numval strips every space
      // and normalizes the sign first - see its doc comment. `decimalComma`
      // (round-8 finding 2) threads the current SPECIAL-NAMES' DECIMAL-POINT
      // IS COMMA setting through so NUMVAL parses "," (not ".") as the
      // decimal point when that dialect option is in effect.
      return `CobolFmt.numval(${convertArithmeticExpression(args[0])}, ${DECIMAL_POINT_IS_COMMA})`;
    case 'MOD': {
      // COBOL FUNCTION MOD is floored-division modulo (result takes the
      // divisor's sign), not Scala/Java's truncating `%` (which takes the
      // dividend's sign) - e.g. FUNCTION MOD(-7, 3) = 2, but -7 % 3 == -1 in
      // Scala. ((a % b) + b) % b converts truncating remainder to floored
      // remainder for either operand's sign.
      const a = convertArithmeticExpression(args[0]);
      const b = convertArithmeticExpression(args[1]);
      return `(((${a}) % (${b}) + (${b})) % (${b}))`;
    }
    case 'MAX':
      // Math.max has no BigDecimal overload (FUNCTION MAX's operands are
      // frequently BigDecimal-typed COBOL numerics) - List(...).max works for
      // any Scala numeric type via its built-in Ordering (Int/Long/
      // BigDecimal all have one). Operands render via convertArithmeticExpression
      // (their natural Scala type, same as every other arithmetic use of
      // these fields elsewhere) rather than being forced to BigDecimal -
      // COMPUTE/MOVE assign the result directly with no further coercion, so
      // forcing BigDecimal here would break an Int-typed COMPUTE target when
      // the operands are themselves plain Int fields (see
      // tests/corpus/proc/r11-intrinsics-composition.cbl's WS-MAX-RESULT).
      return `List(${args.map(convertArithmeticExpression).join(', ')}).max`;
    case 'MIN':
      return `List(${args.map(convertArithmeticExpression).join(', ')}).min`;
    default:
      return `??? /* TODO: unsupported FUNCTION ${fc?.name || name} */`;
  }
}

/**
 * Coerce an arithmetic operand AST node (the shapes convertArithmeticExpression
 * itself dispatches on: VariableReference, Literal, ArithmeticExpression, or
 * a bare identifier/number) to a Scala expression *guaranteed* to be
 * BigDecimal-valued - used by ON SIZE ERROR digit-capacity checks (which
 * need the *exact*, unrounded mathematical result regardless of the
 * receiving field's own Scala type) and by DIVIDE's GIVING-target coercion.
 *
 * Recurses into ArithmeticExpression structure and coerces only the *leaf*
 * operands individually, rather than rendering the whole expression as a
 * string first and then wrapping that string in `BigDecimal(...)` - wrapping
 * an already-composed expression is exactly the bug this replaces: if every
 * leaf of `wsA + wsB` is itself a BigDecimal-typed field, Scala infers `wsA +
 * wsB` to *already* be of type `scala.math.BigDecimal`, and
 * `BigDecimal(wsA + wsB)` then fails to compile (`BigDecimal.apply` has no
 * overload accepting a `scala.math.BigDecimal`) - this was the DIVIDE
 * "double-BigDecimal-wrap" compile error. Recursing and coercing only leaves
 * means the top-level operator strings (`+`/`-`/`*`) are combined directly
 * without ever re-wrapping an already-BigDecimal sub-expression.
 */
/**
 * BigDecimal-guaranteed rendering of a FUNCTION call used as an operand
 * inside toBigDecimalOperand - NOT a blind `BigDecimal(generateFunctionCall(fc))`
 * wrap, because that double-wraps (and fails to compile - `BigDecimal.apply`
 * has no overload accepting a `scala.math.BigDecimal`) whenever
 * generateFunctionCall's own rendering is *already* BigDecimal-typed:
 *   - NUMVAL/NUMVAL-C: CobolFmt.numval always returns BigDecimal - never wrap.
 *   - MAX/MIN: List(...).max/.min's result type follows its *operands'*
 *     natural Scala type (see generateFunctionCall's MAX/MIN cases - not
 *     forced to BigDecimal there, so an Int-typed COMPUTE/MOVE target isn't
 *     broken by an unwanted coercion elsewhere). Here, a guaranteed-BigDecimal
 *     result is exactly what's needed, so each argument is coerced through
 *     toBigDecimalOperand *before* building the List - same numeric value,
 *     now guaranteed BigDecimal, with no separate wrap needed afterward
 *     (mirrors toBigDecimalOperand's own operator-recursion approach above:
 *     coerce the leaves, never the already-composed expression text).
 *   - everything else (MOD, ABS, SQRT, INTEGER, ...): generateFunctionCall
 *     renders these as plain Int/Long/Double Scala expressions, so they still
 *     need the same wrap-if-not-already-BigDecimal fallback as any other
 *     shape this function doesn't specifically recognize.
 */
function functionCallToBigDecimalOperand(fc) {
  const name = String(fc?.name || '').toUpperCase();

  if (name === 'NUMVAL' || name === 'NUMVAL-C') {
    return generateFunctionCall(fc);
  }

  if (name === 'MAX' || name === 'MIN') {
    const args = fc?.arguments || [];
    const method = name === 'MAX' ? 'max' : 'min';
    return `List(${args.map(toBigDecimalOperand).join(', ')}).${method}`;
  }

  const rendered = generateFunctionCall(fc);
  return /^BigDecimal\(/.test(rendered) ? rendered : `BigDecimal(${rendered})`;
}

function toBigDecimalOperand(node) {
  if (node === null || node === undefined) return 'BigDecimal(0)';

  if (typeof node === 'string') {
    return /^-?\d+(\.\d+)?$/.test(node) ? `BigDecimal("${node}")` : `BigDecimal(${convertIdentifier(node)})`;
  }
  if (typeof node === 'number') return `BigDecimal(${node})`;

  if (node.type === 'Literal') {
    if (node.literalType === 'figurative') return 'BigDecimal(0)';
    return `BigDecimal("${node.value}")`;
  }

  if (node.type === 'VariableReference') {
    const info = lookupFieldForRef(node);
    const expr = convertIdentifier(node);
    return info?.scalaType === 'BigDecimal' ? expr : `BigDecimal(${expr})`;
  }

  if (node.type === 'ArithmeticExpression') {
    if (node.unaryMinus) return `(-${toBigDecimalOperand(node.right)})`;
    if (node.functionCall) return functionCallToBigDecimalOperand(node.functionCall);
    if (node.operator && node.left != null && node.right != null) {
      const left = toBigDecimalOperand(node.left);
      const right = toBigDecimalOperand(node.right);
      if (node.operator === '**') return `${left}.pow((${right}).toInt)`;
      const op = ARITHMETIC_OPERATORS[node.operator] || node.operator;
      return `(${left} ${op} ${right})`;
    }
    if (node.variable) return toBigDecimalOperand(node.variable);
    if (node.value !== null && node.value !== undefined) return `BigDecimal("${node.value}")`;
    return 'BigDecimal(0)';
  }

  // Any other shape this function doesn't specifically recognize (e.g. the
  // legacy 'literal'/'identifier'/'binary'/'unary' tags convertArithmeticExpression
  // also accepts): render it normally and wrap only if the resulting text
  // doesn't already start with `BigDecimal(` - a best-effort fallback, not a
  // shape produced by this parser's own AST.
  const rendered = convertArithmeticExpression(node);
  return /^BigDecimal\(/.test(rendered) ? rendered : `BigDecimal(${rendered})`;
}

/**
 * Store-time coercion for an arithmetic-assignment target (COMPUTE/ADD/
 * SUBTRACT/MULTIPLY/DIVIDE - round-3 findings 8/9/10/13): `bdExpr` must
 * already be a `scala.math.BigDecimal`-valued Scala expression (see
 * toBigDecimalOperand) representing the *exact* mathematical result: this
 * applies COBOL's real store-time semantics on top of it rather than
 * assigning that exact result directly (the pre-fix behavior for every
 * arithmetic statement - `ROUNDED` was rendered as a no-op trailing
 * comment, and its absence never truncated to the target's declared decimal
 * digits either) -
 *   - ROUNDED: HALF_UP rounding to the target's declared decimal digits.
 *   - no ROUNDED: truncation (toward zero) to the same decimal digits - COBOL
 *     never keeps more fractional precision than the receiving field
 *     declares, with or without ROUNDED.
 *   - either way: any surplus high-order integer digit is then dropped, the
 *     same high-order truncation MOVE already applies (CobolFmt.truncNumeric/
 *     roundNumeric both do this in one step).
 * `rawExpr` (the exact Scala expression this statement would have generated
 * before this fix - built via convertIdentifier/convertArithmeticExpression
 * over the target's *natural* declared Scala type, no BigDecimal coercion)
 * is the fallback used whenever the target isn't a plain registered
 * Int/Long/BigDecimal field (e.g. an unregistered/ambiguous name) - safer
 * than assigning a bare BigDecimal expression to a target whose actual
 * declared Scala type this function couldn't confirm, which would risk a
 * new compile error instead of preserving the previous (untruncated, but at
 * least type-correct) behavior for that edge case.
 */
function storeNumericByInfo(info, bdExpr, rawExpr, rounded) {
  const intDigits = info?.integerDigits > 0 ? info.integerDigits : 18;
  const decDigits = info?.decimalDigits || 0;
  const fn = rounded ? 'roundNumeric' : 'truncNumeric';

  if (info?.dataType === 'edited' && info.editPattern) {
    // Numeric-edited receiver (round-4 finding 4, e.g. `DIVIDE ... GIVING
    // <edited-field>`): the target is String-typed, so the bare BigDecimal/
    // Int arithmetic result can never be assigned to it directly (a hard
    // Scala 3 "Found: Int/BigDecimal, Required: String" compile error) - it
    // must instead be formatted through the PICTURE, exactly like a
    // numeric-edited MOVE already does (renderVariableMoveSource). Apply the
    // same store-time ROUNDED-or-truncated digit-width coercion the plain
    // numeric branch below applies (so an edited receiver truncates/rounds
    // to its own declared decimal places exactly like a plain numeric one
    // would), then render that exact stored value through the runtime
    // CobolFmt.edited helper - numericRawValueExpr turns the intermediate
    // BigDecimal into the signed-decimal-text form CobolFmt.edited expects.
    const storedBD = `CobolFmt.${fn}(${bdExpr}, ${intDigits}, ${decDigits})`;
    const rawValueExpr = numericRawValueExpr(storedBD, { scalaType: 'BigDecimal' });
    return `CobolFmt.edited("${escapeScalaStringLiteral(info.editPattern)}", ${rawValueExpr}, ${info.blankWhenZero ? 'true' : 'false'}, ${DECIMAL_POINT_IS_COMMA})`;
  }

  // round-7 findings 2/3: a COMP-1/COMP-2 (Float/Double) target has no PIC
  // clause at all, so the truncNumeric/roundNumeric digit-width coercion
  // below (built entirely around a PIC's integer/decimal digit counts)
  // doesn't apply - COMP-1/COMP-2 are genuine binary floating point, with no
  // COBOL-defined digit-truncation semantics of their own. Previously this
  // fell all the way through to the `!['Int','Long','BigDecimal'].includes`
  // guard below and returned the bare BigDecimal-valued `rawExpr` unchanged -
  // a hard "Found: BigDecimal, Required: Float/Double" compile error at
  // every COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE target of this type.
  if (info?.scalaType === 'Float') return `(${bdExpr}).toFloat`;
  if (info?.scalaType === 'Double') return `(${bdExpr}).toDouble`;

  if (!info || !['Int', 'Long', 'BigDecimal'].includes(info.scalaType)) {
    return rawExpr;
  }
  const stored = `CobolFmt.${fn}(${bdExpr}, ${intDigits}, ${decDigits})`;
  if (info.scalaType === 'BigDecimal') return stored;
  if (info.scalaType === 'Long') return `(${stored}).toLong`;
  return `(${stored}).toInt`;
}

function storeNumericExpr(targetRef, bdExpr, rawExpr, rounded) {
  return storeNumericByInfo(lookupFieldForRef(targetRef), bdExpr, rawExpr, rounded);
}

/** BigDecimal-valued Scala expression for an already-resolved field (camel identifier + registry info), mirroring toBigDecimalOperand's VariableReference leaf case but for CORRESPONDING pairs, which carry pre-resolved camel/info rather than an AST node. */
function fieldRefToBigDecimalExpr(camel, info) {
  return info?.scalaType === 'BigDecimal' ? camel : `BigDecimal(${camel})`;
}

/**
 * ON SIZE ERROR / NOT ON SIZE ERROR wrapper shared by COMPUTE/ADD/SUBTRACT/
 * MULTIPLY/DIVIDE. `entries` is one `{ target, resultBD, finalExpr }` per
 * receiving field: `resultBD` is a BigDecimal-valued Scala expression (via
 * toBigDecimalOperand above) for the *exact* mathematical result, used only
 * to test digit capacity - COBOL's SIZE ERROR condition is an integer-digit
 * overflow test; the fractional part is simply truncated/rounded as normal
 * and never itself triggers it (see CobolFmt.fitsDigits). `finalExpr` is
 * exactly the expression this statement would generate with no ON SIZE
 * ERROR clause at all (already coerced to the target's declared Scala
 * type/rounding). On a size error, no target is updated at all (COBOL
 * leaves every receiving field unchanged) and the ON SIZE ERROR statements
 * run instead; otherwise every target is assigned as normal and NOT ON SIZE
 * ERROR runs. `extraErrorCond`, when given, is OR'd into the size-error test
 * ahead of every digit-capacity check (DIVIDE's BY ZERO test - BigDecimal
 * division by zero raises an exception before a digit-capacity check could
 * even run, so the zero test must short-circuit first via `||`).
 */
function generateArithmeticSizeErrorCheck(indent, statement, entries, extraErrorCond) {
  const indentStr = '  '.repeat(indent);
  const bi = '  '.repeat(indent + 1);

  const digitConds = entries.map(e => {
    const info = lookupFieldForRef(e.target);
    const intDigits = info && info.integerDigits > 0 ? info.integerDigits : 18;
    return `!CobolFmt.fitsDigits(${e.resultBD}, ${intDigits})`;
  });
  const cond = [extraErrorCond, ...digitConds].filter(Boolean).join(' || ');

  const lines = [`${indentStr}if (${cond}) then`];
  const onErrStmts = Array.isArray(statement.onSizeError) ? statement.onSizeError : [];
  lines.push(
    onErrStmts.length > 0 ? onErrStmts.map(s => generateExpression(s, indent + 1)).join('\n') : `${bi}()`
  );
  lines.push(`${indentStr}else`);
  const notErrStmts = Array.isArray(statement.notOnSizeError) ? statement.notOnSizeError : [];
  const body = [
    ...entries.map(e => `${bi}${renderAssignment(e.target, e.finalExpr)}`),
    ...notErrStmts.map(s => generateExpression(s, indent + 1)),
  ];
  lines.push(body.length > 0 ? body.join('\n') : `${bi}()`);
  return lines.join('\n');
}

/**
 * True when a statement carries an ON SIZE ERROR and/or NOT ON SIZE ERROR
 * clause with at least one statement in its body. The parser always
 * initializes both arrays to `[]` regardless of whether either clause was
 * present in the source (see parser/ast.js's ComputeStatement/AddStatement/
 * etc. constructors), so this can't distinguish "clause absent" from
 * "clause present but empty" - an extreme corner case (an `ON SIZE ERROR`
 * with literally no imperative statement following it) not exercised by any
 * known corpus program, and not worth threading a dedicated presence flag
 * through the parser for.
 */
function hasSizeErrorClause(statement) {
  return (
    (Array.isArray(statement.onSizeError) && statement.onSizeError.length > 0) ||
    (Array.isArray(statement.notOnSizeError) && statement.notOnSizeError.length > 0)
  );
}

/**
 * Generate COMPUTE statement
 */
export function generateCompute(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  // COMPUTE supports multiple targets: COMPUTE A B = expression
  const targets = Array.isArray(statement.targets) && statement.targets.length > 0
    ? statement.targets
    : [statement.target].filter(Boolean);

  if (targets.length === 0) {
    return `${indentStr}// COMPUTE with no resolvable target: ${convertArithmeticExpression(statement.expression)}`;
  }

  // Every target shares the same computed result, but each is stored with
  // its *own* ROUNDED-or-truncated coercion to its own declared digit
  // widths (round-3 findings 8/13 - `expression` used to be assigned raw,
  // with ROUNDED rendered as a no-op trailing comment) - see
  // storeNumericExpr. The exact (unrounded, untruncated) BigDecimal result
  // (resultBD) is reused both for that per-target coercion and for the ON
  // SIZE ERROR digit-capacity test below.
  //
  // round-10 finding 6: `COMPUTE A B ROUNDED C = expr` applies ROUNDED to
  // only the target(s) it immediately follows - each target's OWN
  // `.rounded` flag (set by parseComputeStatement) is authoritative; a
  // target with no ROUNDED of its own truncates, even though
  // `statement.rounded` (true if ANY target in the statement had ROUNDED)
  // is also true in that case.
  const resultBD = toBigDecimalOperand(statement.expression);
  const rawExpr = convertArithmeticExpression(statement.expression);
  const keyword = statement.isNew ? 'val ' : '';
  const entries = targets.map(target => ({
    target,
    resultBD,
    finalExpr: storeNumericExpr(target, resultBD, rawExpr, target?.rounded === true),
  }));

  if (!hasSizeErrorClause(statement)) {
    return entries
      .map(e => `${indentStr}${keyword}${renderAssignment(e.target, e.finalExpr)}`)
      .join('\n');
  }

  return generateArithmeticSizeErrorCheck(indent, statement, entries);
}

/**
 * Scala literal for a figurative/numeric ZERO MOVEd into a field, honoring
 * the target's declared Scala type (0 / 0L / BigDecimal(0) / a target-width
 * string of '0' characters for an alphanumeric target - COBOL's figurative
 * ZERO moved to an alphanumeric receiver fills it with '0' digit characters,
 * not empty text).
 *
 * A numeric-EDITED target (round-4 finding 2) needs the full PICTURE-edited
 * rendering of zero (e.g. `MOVE ZEROES TO WS-EDITED` where WS-EDITED is
 * `PIC ZZ,ZZ9.99` must store `"     0.00"`, not a bare run of '0' characters)
 * - exactly the same `formatEditedPicture` call renderLiteralForTarget's own
 * numeric-literal branch already makes for an explicit `MOVE 0 TO
 * <edited-field>`; this is that same path, reached instead via the
 * figurative-ZERO branch (MOVE ZERO/ZEROS/ZEROES), which previously fell
 * through to the plain alphanumeric '0'-repeat branch below unconditionally.
 */
function zeroLiteralFor(info) {
  if (!info) return '0';
  if (info.dataType === 'edited' && info.editPattern) {
    return `"${escapeScalaStringLiteral(formatEditedPicture(info.editPattern, '0', info.blankWhenZero))}"`;
  }
  if (info.scalaType === 'BigDecimal') return 'BigDecimal(0)';
  if (info.scalaType === 'Long') return '0L';
  if (info.scalaType === 'String') return `"${'0'.repeat(Math.max(info.picLength || 0, 0))}"`;
  return '0';
}

/** Scala string literal for a target-width run of `ch`, or a single `ch` when the target's width isn't known. */
function repeatedCharLiteralFor(ch, info) {
  const width = info && info.scalaType === 'String' ? Math.max(info.picLength || 0, 1) : 1;
  return `"${escapeScalaStringLiteral(ch.repeat(width))}"`;
}

/**
 * Fill `width` characters by repeating `text` (COBOL's `MOVE ALL 'literal'
 * TO target` - round-3 finding 11): the literal tiles across the entire
 * receiving field, truncating the final repetition if it doesn't divide
 * evenly, rather than being padded with trailing spaces the way a plain
 * (non-ALL) MOVE of the same literal would be - see fitAlphanumericText,
 * which this deliberately does not reuse for the ALL case.
 */
function repeatToWidthText(text, width) {
  const s = String(text ?? '');
  if (!width || width <= 0) return s;
  if (s.length === 0) return ' '.repeat(width);
  if (s.length >= width) return s.slice(0, width);
  return s.repeat(Math.ceil(width / s.length)).slice(0, width);
}

/**
 * Fixed-width alphanumeric MOVE alignment as a compile-time (JS) string
 * transform - used whenever the source text is already known at generation
 * time (a literal, or a figurative constant); the runtime equivalent for a
 * variable source is CobolFmt.fitLeft/fitRight (see generateCobolFmtHelper).
 * Default alignment truncates/pads on the right; JUSTIFIED RIGHT
 * truncates/pads on the left.
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

/** Runtime (Scala expression) equivalent of fitAlphanumericText, via the embedded CobolFmt helper. */
function fitAlphanumericExpr(expr, width, justifiedRight) {
  if (!width || width <= 0) return expr;
  return justifiedRight ? `CobolFmt.fitRight(${expr}, ${width})` : `CobolFmt.fitLeft(${expr}, ${width})`;
}

/**
 * Render a MOVE source (Literal AST node or figurative-constant string)
 * against the target field's registry info, coercing to the target's
 * declared Scala type:
 *   - BigDecimal target: `BigDecimal("<exact literal text>")` (never routed
 *     through a Scala Double literal - avoids any binary floating-point
 *     round-tripping of decimal text like "-987654321.99").
 *   - Long target: literal text with an `L` suffix (bare integer literals
 *     wider than Int overflow Scala's default Int literal type otherwise).
 *   - Int target: literal text as-is (truncated to its integer prefix,
 *     defensively, since COBOL MOVE truncates a fractional source moved to
 *     an integer receiver).
 *   - String target with an edited PIC (dataType 'edited'): the fully
 *     PICTURE-formatted string, computed by formatEditedPicture() - COBOL
 *     performs numeric-edit formatting at MOVE time, not at DISPLAY time.
 *   - String target (plain alphanumeric): fitted to the target's declared
 *     width (truncate/pad right, or left when JUSTIFIED RIGHT - see
 *     fitAlphanumericText).
 * Falls back to the pre-existing untyped behavior when no registry info is
 * available (e.g. a program with no matching WORKING-STORAGE entry).
 */
function renderMoveSource(source, info) {
  if (source && typeof source === 'object' && source.type === 'Literal') {
    return renderLiteralForTarget(source, info);
  }

  if (typeof source === 'string') {
    const upper = source.toUpperCase();
    if (upper === 'SPACES' || upper === 'SPACE') return repeatedCharLiteralFor(' ', info);
    if (upper === 'ZEROS' || upper === 'ZEROES' || upper === 'ZERO') return zeroLiteralFor(info);
    if (upper === 'HIGH-VALUES' || upper === 'HIGH-VALUE') return repeatedCharLiteralFor(String.fromCharCode(255), info);
    if (upper === 'LOW-VALUES' || upper === 'LOW-VALUE') return repeatedCharLiteralFor(String.fromCharCode(0), info);
    return convertIdentifier(source);
  }

  if (source && source.type === 'VariableReference') {
    return renderVariableMoveSource(source, info);
  }

  // MOVE FUNCTION MAX(...)/MIN(...)/NUMVAL(...) TO <numeric-edited field>:
  // these intrinsics are generated as guaranteed-BigDecimal Scala expressions
  // (see generateFunctionCall's MAX/MIN/NUMVAL cases) - route through
  // CobolFmt.edited (the runtime numeric-edit formatter) the same way a
  // VariableReference source into an edited target already does
  // (renderVariableMoveSource), instead of falling through to
  // convertArithmeticExpression's raw (unformatted, and String-vs-BigDecimal
  // type-mismatched) rendering.
  if (source && source.type === 'FunctionCall' && info?.dataType === 'edited' && info.editPattern &&
      BIGDECIMAL_RESULT_FUNCTIONS.has(String(source.name || '').toUpperCase())) {
    const rawExpr = generateFunctionCall(source);
    const rawValueExpr = numericRawValueExpr(rawExpr, { scalaType: 'BigDecimal' });
    return `CobolFmt.edited("${escapeScalaStringLiteral(info.editPattern)}", ${rawValueExpr}, ${info.blankWhenZero ? 'true' : 'false'}, ${DECIMAL_POINT_IS_COMMA})`;
  }

  return convertArithmeticExpression(source);
}

/**
 * FUNCTION names whose generated Scala expression is BigDecimal-typed when
 * MOVEd into a numeric-edited field - used by renderMoveSource above to
 * decide when `MOVE FUNCTION xxx(...) TO <numeric-edited field>` can safely
 * be routed through CobolFmt.edited's BigDecimal formatting path. NUMVAL/
 * NUMVAL-C are unconditionally BigDecimal (CobolFmt.numval's return type).
 * MAX/MIN follow their *operands'* natural Scala type (see
 * generateFunctionCall - not forced to BigDecimal, so an Int-typed COMPUTE/
 * MOVE target isn't broken by an unwanted coercion), so this is only exact
 * when the MAX/MIN operands are themselves BigDecimal-typed fields - true
 * for every corpus program that MOVEs a MAX/MIN result into an edited field
 * (they're always decimal-valued PICTUREs, e.g. PIC S9(5)V99, in practice -
 * an edited-numeric receiver only makes semantic sense for a decimal-ish
 * source to begin with).
 */
const BIGDECIMAL_RESULT_FUNCTIONS = new Set(['MAX', 'MIN', 'NUMVAL', 'NUMVAL-C']);

function renderLiteralForTarget(lit, info) {
  if (lit.literalType === 'figurative') {
    switch (String(lit.value).toUpperCase()) {
      case 'ZERO': return zeroLiteralFor(info);
      case 'SPACE': return repeatedCharLiteralFor(' ', info);
      case 'HIGH-VALUE': return repeatedCharLiteralFor(String.fromCharCode(255), info);
      case 'LOW-VALUE': return repeatedCharLiteralFor(String.fromCharCode(0), info);
      default: return repeatedCharLiteralFor(' ', info);
    }
  }

  if (lit.literalType === 'string') {
    const text = lit.value ?? '';
    if (info?.dataType === 'edited' && info.editPattern) {
      return `"${escapeScalaStringLiteral(formatEditedPicture(info.editPattern, text, info.blankWhenZero))}"`;
    }
    if (info?.scalaType === 'String' && info.dataType !== 'edited') {
      // MOVE ALL 'literal' (round-3 finding 11): the literal tiles across
      // the whole receiving field width instead of being space-padded once
      // - a plain (non-ALL) MOVE keeps fitAlphanumericText's pad-once
      // behavior.
      const filled = lit.all
        ? repeatToWidthText(text, info.picLength)
        : fitAlphanumericText(text, info.picLength, info.justified);
      return `"${escapeScalaStringLiteral(filled)}"`;
    }
    return `"${escapeScalaStringLiteral(text)}"`;
  }

  // Numeric literal (raw text, sign already included by the lexer, e.g. "-50").
  const raw = String(lit.value);
  if (info?.dataType === 'edited' && info.editPattern) {
    return `"${escapeScalaStringLiteral(formatEditedPicture(info.editPattern, raw, info.blankWhenZero))}"`;
  }
  if (info?.scalaType === 'String') {
    // Numeric literal -> alphanumeric target: COBOL stores the literal's own
    // digit text (unsigned - a numeric-to-alphanumeric MOVE never carries a
    // sign character), fitted to the target's declared width exactly like an
    // alphanumeric source (or tiled across it for MOVE ALL - see above).
    const unsigned = raw.replace(/^[+-]/, '');
    const filled = lit.all
      ? repeatToWidthText(unsigned, info.picLength)
      : fitAlphanumericText(unsigned, info.picLength, info.justified);
    return `"${escapeScalaStringLiteral(filled)}"`;
  }
  if (info?.scalaType === 'BigDecimal') {
    return `BigDecimal("${truncateNumericLiteralTextForMove(raw, info)}")`;
  }
  if (info?.scalaType === 'Long') {
    return `${normalizeIntLiteralText(truncateNumericLiteralTextForMove(raw, info))}L`;
  }
  if (info?.scalaType === 'Int') {
    return normalizeIntLiteralText(truncateNumericLiteralTextForMove(raw, info));
  }
  // Reached only once the 'figurative' and 'string' branches above have
  // already been excluded - lit.literalType is 'numeric' here (round-6
  // finding 2/3 audit: pass it explicitly rather than relying on
  // convertLiteral's text-shape fallback).
  return convertLiteral(raw, 'numeric');
}

/**
 * Truncate a numeric literal's text (JS string transform, generation-time -
 * the runtime equivalent for a variable source is CobolFmt.truncNumeric) to
 * the target's declared integer/decimal digit widths: COBOL MOVE drops
 * excess low-order decimal digits (never rounds) and excess high-order
 * integer digits (keeping the low-order ones, sign preserved).
 */
function truncateNumericLiteralTextForMove(raw, info) {
  const s = String(raw ?? '0');
  const neg = s.startsWith('-');
  const unsigned = s.replace(/^[+-]/, '');
  const dot = unsigned.indexOf('.');
  let intPart = dot === -1 ? unsigned : unsigned.slice(0, dot);
  let decPart = dot === -1 ? '' : unsigned.slice(dot + 1);

  const decimalDigits = info?.decimalDigits;
  const integerDigits = info?.integerDigits;
  if (typeof decimalDigits === 'number' && decimalDigits >= 0) {
    decPart = decPart.slice(0, decimalDigits);
  }
  if (typeof integerDigits === 'number' && integerDigits > 0 && intPart.length > integerDigits) {
    intPart = intPart.slice(intPart.length - integerDigits);
  }

  const sign = neg ? '-' : '';
  return decPart.length > 0 ? `${sign}${intPart || '0'}.${decPart}` : `${sign}${intPart || '0'}`;
}

function normalizeIntLiteralText(raw) {
  const m = /^-?\d+/.exec(String(raw));
  return m ? m[0] : '0';
}

function escapeScalaStringLiteral(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Unsigned display-digit runtime expression for a numeric field/expression
 * used as a MOVE source into an alphanumeric target: COBOL takes the sending
 * numeric item's own digit characters (zero-padded to its own declared
 * width, no sign, no decimal point - V is an implied, non-storage position),
 * via the embedded CobolFmt.digitsOf runtime helper.
 */
function numericDigitsExpr(expr, sourceInfo) {
  const intDigits = sourceInfo?.integerDigits || 0;
  const decDigits = sourceInfo?.decimalDigits || 0;
  const asBD = sourceInfo?.scalaType === 'BigDecimal' ? expr : `BigDecimal(${expr})`;
  return `CobolFmt.digitsOf(${asBD}, ${intDigits}, ${decDigits})`;
}

/**
 * Runtime-value equivalent of `raw` in formatEditedPicture: signed decimal
 * text for a numeric Scala expression whose value isn't known until runtime
 * (a variable or computed expression, unlike a literal MOVE source, which
 * formatEditedPicture already formats once at generation time - see
 * renderLiteralForTarget). Used to drive CobolFmt.edited (the runtime port
 * of formatEditedPicture) for a numeric-edited MOVE target.
 */
function numericRawValueExpr(expr, sourceInfo) {
  if (sourceInfo?.scalaType === 'BigDecimal') {
    return `{ val _v = (${expr}); (if _v.signum < 0 then "-" else "") + _v.abs.bigDecimal.toPlainString }`;
  }
  return `{ val _v = (${expr}); (if _v < 0 then "-" else "") + math.abs(_v).toString }`;
}

/**
 * Render a MOVE source that is a (possibly subscripted) VariableReference,
 * against the target field's registry info - the variable-source sibling of
 * renderLiteralForTarget above. Handles every MOVE semantics rule that
 * depends on knowing both the source's and target's *types*, none of which
 * a bare `convertIdentifier(source)` (the pre-existing behavior, still used
 * as the fallback when no target registry info is available) can express:
 *   - numeric-edited target, any source: CobolFmt.edited (runtime port of
 *     formatEditedPicture).
 *   - numeric source -> alphanumeric target: unsigned display-digit text
 *     (numericDigitsExpr), then fitted to the target's width/justification.
 *   - alphanumeric source -> alphanumeric target: the source's own value,
 *     first fitted to *its own* declared width (emulating COBOL's fully-
 *     stored sending item - matters for JUSTIFIED RIGHT sources/targets,
 *     see fitAlphanumericExpr's callers), then fitted again to the target's
 *     width/justification.
 *   - numeric source -> numeric target: truncated to the target's declared
 *     digit widths (CobolFmt.truncNumeric) and coerced to its Scala type.
 */
function renderVariableMoveSource(source, info) {
  const sourceInfo = lookupFieldForRef(source);
  let rawExpr = convertIdentifier(source);

  // round-7 finding 7: a group-item MOVE source (`MOVE WS-GROUP TO
  // WS-A`) has no FIELD_REGISTRY entry of its own - a group never gets a
  // flat Scala var, only its children do (see groupDisplayValueExpr's own
  // doc comment) - so `sourceInfo` is null and the pre-fix `rawExpr` fell
  // back to convertIdentifier's bare `toCamelCase(name)`: an undeclared
  // identifier, a hard "not found" compile error (see u11/u11b's own
  // repros). Route it through the exact same raw-storage concatenation
  // groupDisplayValueExpr already builds for DISPLAY of a whole group
  // (round-5 finding 3) instead - COBOL's group-MOVE-to-elementary
  // semantics move the group's own concatenated storage text, which the
  // branches below then truncate/pad to the receiving field's width exactly
  // like any other alphanumeric MOVE source (sourceInfo staying null routes
  // through their existing "no source info" fallbacks correctly, without
  // needing further changes downstream).
  if (!sourceInfo) {
    const hasSubscripts = source && typeof source === 'object' && Array.isArray(source.subscripts) && source.subscripts.length > 0;
    const nameUpper = source && typeof source === 'object' ? String(source.name || '').toUpperCase() : String(source || '').toUpperCase();
    if (nameUpper && !hasSubscripts) {
      const groupExpr = groupDisplayValueExpr(resolveGroupKey(nameUpper));
      if (groupExpr) rawExpr = `(${groupExpr})`;
    }
  }

  if (!info) return rawExpr;

  if (info.dataType === 'edited' && info.editPattern) {
    const rawValueExpr = sourceInfo
      ? numericRawValueExpr(rawExpr, sourceInfo)
      : `(${rawExpr}).toString`;
    return `CobolFmt.edited("${escapeScalaStringLiteral(info.editPattern)}", ${rawValueExpr}, ${info.blankWhenZero ? 'true' : 'false'}, ${DECIMAL_POINT_IS_COMMA})`;
  }

  if (info.scalaType === 'String') {
    if (sourceInfo && sourceInfo.dataType === 'numeric') {
      const digitsExpr = numericDigitsExpr(rawExpr, sourceInfo);
      return fitAlphanumericExpr(digitsExpr, info.picLength, info.justified);
    }
    const ownWidthExpr = sourceInfo && sourceInfo.scalaType === 'String' && sourceInfo.picLength > 0
      ? fitAlphanumericExpr(rawExpr, sourceInfo.picLength, sourceInfo.justified)
      : rawExpr;
    return fitAlphanumericExpr(ownWidthExpr, info.picLength, info.justified);
  }

  if (info.dataType === 'numeric' || (info.dataType !== 'alphanumeric' && info.dataType !== 'edited')) {
    const intDigits = info.integerDigits > 0 ? info.integerDigits : 18;
    const decDigits = info.decimalDigits || 0;
    // A numeric-edited source (round-5 finding 6) is stored as its already-
    // formatted PICTURE text (e.g. "  12.50" for PIC ZZ9.99, zero-suppressed
    // leading positions rendered as spaces - see formatEditedPicture) - a
    // bare `BigDecimal(rawExpr)` chokes on that internal whitespace
    // (`NumberFormatException`), which CobolFmt.numval (already used for
    // FUNCTION NUMVAL's own space-tolerant parsing) strips before parsing;
    // any other source (a plain numeric field, or a non-numeric String this
    // generator doesn't otherwise track) keeps the pre-existing
    // BigDecimal(...) coercion unchanged.
    //
    // round-17 finding 1: a reference-modified source
    // (`MOVE identifier(start:length) TO <numeric target>`, Known Gap #1)
    // reaches here with `rawExpr` set to convertIdentifier's shared
    // `Nothing`-typed `???` placeholder (source.refMod is set, but
    // sourceInfo above is looked up on the BASE field regardless of refMod -
    // lookupFieldForRef never consults .refMod at all - so this branch is
    // still reached for a ref-mod'd numeric-target MOVE exactly like a
    // plain one). `BigDecimal(???)` is an AMBIGUOUS OVERLOAD in Scala 3 -
    // every one of BigDecimal.apply's 7 overloads independently accepts a
    // `Nothing`-typed argument, so the compiler can't pick one - a hard
    // compile error distinct from (and not fixed by) round-15/16's
    // String-typed placeholder fix for other operand positions. Substitute
    // the shared, concrete `BigDecimal(0)` honest placeholder instead - ref-
    // mod's own slicing semantics stay exactly as out of scope as
    // everywhere else this gap surfaces.
    const asBD = (source && typeof source === 'object' && source.refMod)
      ? refModNumericPlaceholder('a MOVE numeric target')
      : sourceInfo?.scalaType === 'BigDecimal'
        ? rawExpr
        : sourceInfo?.dataType === 'edited'
          ? `CobolFmt.numval(${rawExpr})`
          : `BigDecimal(${rawExpr})`;
    const truncated = `CobolFmt.truncNumeric(${asBD}, ${intDigits}, ${decDigits})`;
    if (info.scalaType === 'BigDecimal') return truncated;
    if (info.scalaType === 'Long') return `${truncated}.toLong`;
    return `${truncated}.toInt`;
  }

  return rawExpr;
}

/**
 * True when `ref` is a bare (no subscripts) reference to a name registered
 * as a group in GROUP_REGISTRY - used to detect a group-to-group MOVE (see
 * generateGroupMove) in generateMove below.
 */
function groupRefNameUpper(ref) {
  if (!ref || typeof ref !== 'object') return null;
  if (Array.isArray(ref.subscripts) && ref.subscripts.length > 0) return null;
  const nameUpper = String(ref.name || '').toUpperCase();
  return GROUP_REGISTRY.has(nameUpper) ? nameUpper : null;
}

/** Per-child metadata for one group's immediate real children, combining GROUP_REGISTRY (names/flat-var identifiers) with the qualified field registry (types) and a second GROUP_REGISTRY lookup (nested-group detection). A FILLER child (round-5 finding 3/s06 - `nameUpper: null`, `isFiller: true`) has no case-class constructor field name of its own known to this function (case-class-gen.js names FILLERs by its own independent per-case-class sequence - see generateGroupMove's differing-layout branch, which bails out rather than guess) and no QUALIFIED_REGISTRY entry (nothing to qualify by name), so its already-computed `info` (stashed on the GROUP_REGISTRY entry itself) is used directly instead. */
function groupChildInfos(nameUpper) {
  const children = GROUP_REGISTRY.get(nameUpper) || [];
  return children.map(c => ({
    nameUpper: c.nameUpper,
    camel: c.camel,
    ccField: c.isFiller ? null : toCamelCase(c.nameUpper),
    info: c.isFiller ? c.info : lookupQualified(c.nameUpper, nameUpper),
    isGroup: c.nameUpper ? GROUP_REGISTRY.has(c.nameUpper) : false,
    isFiller: !!c.isFiller,
  }));
}

/**
 * Whether two groups' child lists are "identical layout": same count, and
 * each positional pair shares the same Scala representation (type, width,
 * decimal places). When true, a plain per-child assignment (in declared
 * order) is byte-for-byte equivalent to a real COBOL group MOVE - no
 * type-converting coercion happens, exactly as if the bytes were copied
 * directly - without needing a byte-level round trip. Any child that is
 * itself a nested group, or a metadata mismatch, means "no" (routes to the
 * byte-level path in generateGroupMove instead).
 */
function groupLayoutsIdentical(srcChildren, tgtChildren) {
  if (srcChildren.length === 0 || srcChildren.length !== tgtChildren.length) return false;
  for (let i = 0; i < srcChildren.length; i++) {
    const s = srcChildren[i];
    const t = tgtChildren[i];
    if (s.isGroup || t.isGroup) return false;
    if (!s.info || !t.info) return false;
    if (s.info.scalaType !== t.info.scalaType) return false;
    if ((s.info.picLength || 0) !== (t.info.picLength || 0)) return false;
    if ((s.info.decimalDigits || 0) !== (t.info.decimalDigits || 0)) return false;
  }
  return true;
}

/**
 * Generate a group-to-group MOVE (`MOVE WS-SRC-GROUP TO WS-DST-GROUP`).
 * COBOL group MOVE is byte-wise and never type-converts - unlike an
 * elementary MOVE of the same underlying data, which does. Two strategies,
 * chosen per the task's documented design:
 *   - Identical layout (every child pair has the same Scala type/width -
 *     see groupLayoutsIdentical): a plain per-child assignment via the field
 *     registry. This is byte-for-byte equivalent to a real group MOVE
 *     whenever both sides already share the same underlying representation
 *     (the overwhelmingly common case - e.g. copying one WS-*-GROUP to
 *     another of the same shape), without the overhead/complexity of a
 *     round trip through case classes.
 *   - Differing layout (e.g. a COMP-3 field on one side lining up with a
 *     DISPLAY field of the same size on the other - genuine "read raw bytes
 *     under a different PICTURE" territory): route through the byte-level
 *     case classes generateAllCaseClasses/generateCaseClass already
 *     generate for every WORKING-STORAGE group reachable from an 01-level
 *     item - format() the sending group's current field values, space-pad/
 *     truncate those bytes to the receiving group's length (COBOL group
 *     MOVE follows the same padding rule as a plain alphanumeric MOVE), and
 *     parse() them back out under the *receiving* group's own layout, which
 *     is exactly "reinterpret the same bytes under a different PICTURE"
 *     without guessing at a field-by-field numeric conversion.
 * Falls back to a comment (not broken code) when a group has a FILLER or
 * REDEFINES child - those don't occupy a case-class constructor slot the
 * same way GROUP_REGISTRY assumes (see case-class-gen.js), so a byte-level
 * round trip can't be safely constructed from the flat-var registry alone;
 * this shape doesn't occur in the Phase 2 adversarial corpus.
 */
function generateGroupMove(sourceNameUpper, targetNameUpper, indent) {
  const indentStr = '  '.repeat(indent);
  const srcChildren = groupChildInfos(sourceNameUpper);
  const tgtChildren = groupChildInfos(targetNameUpper);

  if (srcChildren.length === 0 || tgtChildren.length === 0) {
    return `${indentStr}() // MOVE ${sourceNameUpper} TO ${targetNameUpper}: group has no registered children`;
  }

  if (groupLayoutsIdentical(srcChildren, tgtChildren)) {
    return tgtChildren.map((t, i) => `${indentStr}${t.camel} = ${srcChildren[i].camel}`).join('\n');
  }

  // Byte-level round trip needs every real child to have both a flat-var
  // identifier (to read the current value) *and* a matching case-class
  // constructor slot of the same name (case-class-gen.js's generateCaseClass
  // gives every non-redefines, non-88 child - including FILLERs, under its
  // own independent synthetic naming sequence - its own constructor field, in
  // the same order GROUP_REGISTRY lists real, named children). A REDEFINES
  // child among them breaks that correspondence (it's a derived `lazy val` in
  // the case class, not a constructor parameter, and isn't registered in
  // qualifiedRegistry either - see buildFieldRegistry's redefines branch),
  // and a FILLER's own hidden flat-var name (`_fillerN`, round-5 finding
  // 3/s06 - see scala-generator.js's buildFieldRegistry) has no known
  // relationship to case-class-gen.js's independent `fillerN` case-class
  // field naming sequence, so `ccField` is left `null` for it
  // (groupChildInfos) rather than guessed. Neither shape occurs in the Phase
  // 2 adversarial corpus; emit a visible, still-compiling marker instead of a
  // guessed/broken round trip rather than silently mis-converting one.
  if (!srcChildren.every(c => c.info && c.ccField) || !tgtChildren.every(c => c.info && c.ccField)) {
    return (
      `${indentStr}() // MOVE ${sourceNameUpper} TO ${targetNameUpper}: ??? TODO - differing-layout group MOVE ` +
      'with a FILLER/REDEFINES child is not supported (byte-level round trip needs every child to have a plain ' +
      'flat-var + case-class constructor slot); group left unchanged'
    );
  }

  // A bare COBOL group name with no parent-path context can't be resolved to
  // the right one of two colliding (parent-qualified) case-class names - see
  // AMBIGUOUS_GROUP_CLASS_NAMES/case-class-gen.js's resolveClassName - so
  // fall back to the same kind of visible, still-compiling marker as the
  // FILLER/REDEFINES case above rather than risk referencing the wrong
  // (or a nonexistent) class.
  if (AMBIGUOUS_GROUP_CLASS_NAMES.has(toPascalCase(sourceNameUpper)) || AMBIGUOUS_GROUP_CLASS_NAMES.has(toPascalCase(targetNameUpper))) {
    return (
      `${indentStr}() // MOVE ${sourceNameUpper} TO ${targetNameUpper}: ??? TODO - differing-layout group MOVE ` +
      'involving an ambiguous nested group name (declared identically under two different records) is not ' +
      'supported; group left unchanged'
    );
  }

  const bi = '  '.repeat(indent + 1);
  const srcClass = toPascalCase(sourceNameUpper);
  const tgtClass = toPascalCase(targetNameUpper);
  const lines = [`${indentStr}{`];
  lines.push(`${bi}val _bytes = ${srcClass}.format(${srcClass}(${srcChildren.map(c => c.camel).join(', ')}))`);
  lines.push(`${bi}val _padded = _bytes.padTo(${tgtClass}.recordLength, ' '.toByte).take(${tgtClass}.recordLength)`);
  lines.push(`${bi}val _parsed = ${tgtClass}.parse(_padded)`);
  for (const t of tgtChildren) {
    lines.push(`${bi}${t.camel} = _parsed.${t.ccField}`);
  }
  lines.push(`${indentStr}}`);
  return lines.join('\n');
}

/**
 * round-9 finding 4: detect a *subscripted* reference to a whole GROUP that
 * itself has an OCCURS clause - `WS-ROW(1)` where `05 WS-ROW OCCURS 3 TIMES`
 * groups several children together (`10 WS-A`/`10 WS-B`) - as opposed to
 * groupRefNameUpper's *bare* (no-subscript) group reference. A group with
 * OCCURS has no flat var of its own at all (only its children do, each
 * wrapped in its own Vector - see buildFieldRegistry's doc comment), so
 * `WS-ROW(1)` is neither "the bare-group MOVE case" (groupRefNameUpper
 * requires zero subscripts) nor an ordinary elementary reference
 * (lookupFieldForRef finds nothing for a group name) - used by generateMove
 * to recognize `MOVE WS-ROW(i) TO WS-ROW(j)` (whole-row copy/shift within a
 * table of groups) and route it through generateSubscriptedGroupMove instead
 * of falling through to the (wrong, non-compiling) elementary MOVE path.
 */
function subscriptedGroupRowRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  if (!Array.isArray(ref.subscripts) || ref.subscripts.length === 0) return null;
  const nameUpper = String(ref.name || '').toUpperCase();
  if (!isRegisteredGroupName(nameUpper)) return null;
  return { groupKey: resolveGroupKey(nameUpper), subscripts: ref.subscripts };
}

/**
 * Build a read expression for a flat var nested `idxs.length` Vector layers
 * deep (one layer per OCCURS-bearing ancestor, outermost subscript first) -
 * `camel(idxs[0])(idxs[1])...`. `idxs.length === 0` (a bare, non-OCCURS
 * child) just returns the camel itself unchanged.
 */
function nestedReadExpr(camel, idxs) {
  return camel + idxs.map(i => `(${i})`).join('');
}

/**
 * Build a `.updated(...)` write expression for the same nested-Vector shape
 * nestedReadExpr reads, rebuilding one Vector layer at a time (Vector has no
 * in-place index setter) so `valueExpr` ends up written at the exact
 * `idxs`-addressed element. Mirrors renderAssignment's own local `rec`
 * helper (same nested-nested-`.updated` shape for an ordinary elementary
 * multi-dimensional subscript write), duplicated here rather than shared
 * since renderAssignment's version is a private closure over a single
 * `valueExpr` string it renders directly, not reusable standalone.
 */
function nestedUpdateExpr(camel, idxs, valueExpr) {
  function rec(depth, baseExpr) {
    if (depth === idxs.length - 1) {
      return `${baseExpr}.updated(${idxs[depth]}, ${valueExpr})`;
    }
    return `${baseExpr}.updated(${idxs[depth]}, ${rec(depth + 1, `${baseExpr}(${idxs[depth]})`)})`;
  }
  return rec(0, camel);
}

/**
 * round-9 finding 4 (continued, generalized by round-15 findings 5/6): the
 * actual per-child copy for a whole-row MOVE (`MOVE WS-ROW-A(i) TO
 * WS-ROW-B(j)`) - reuses each side's own GROUP_REGISTRY entry (the same
 * metadata groupDisplayValueExpr/scatterGroupFromString already walk) so
 * every child (including a nested group child, recursed into, and a FILLER
 * child's own hidden flat var) gets copied from the source row's subscript
 * position to the target row's: `<targetChildCamel> = <nested .updated
 * chain ending in <sourceChildCamel><nested reads>>`.
 *
 * Two round-15 generalizations over the original (round-9) version:
 *   - `sourceGroupKey`/`targetGroupKey` may now be DIFFERENT tables (finding
 *     5, d07: `MOVE WS-ROW-A(i) TO WS-ROW-B(j)`, two distinct 01-records)
 *     as well as the same one (the original, still-supported same-table
 *     shift/copy idiom, w05) - children are matched POSITIONALLY (same rule
 *     generateGroupMove's groupLayoutsIdentical already applies for a bare,
 *     non-subscripted cross-record group MOVE): same count, and each
 *     positional pair's own Scala representation (type/width/decimals) must
 *     agree, or this bails out to null (caller falls back to a visible
 *     marker) rather than emit a type-mismatched assignment.
 *   - `targetIdxs`/`sourceIdxs` may now carry more than one dimension
 *     (finding 6, d08: `MOVE WS-INNER(1,1) TO WS-INNER(2,2)`, a
 *     two-dimensional OCCURS-within-OCCURS row) - nestedReadExpr/
 *     nestedUpdateExpr build the full N-deep `.updated`/read chain instead
 *     of the original single-`.updated` shape, so any dimension count works
 *     uniformly (a 1-dimensional row, still the overwhelmingly common case,
 *     produces byte-for-byte the same single-`.updated` output as before).
 *
 * A child that itself has an *additional* OCCURS clause of its own (a table
 * nested inside each row, not just the row's own ancestor OCCURS chain) still
 * can't be represented this way (its flat var would need yet another,
 * independently-driven Vector index no corpus program supplies), so that
 * (narrow, unexercised) shape still bails out to null.
 */
function subscriptedGroupMoveChildLines(sourceGroupKey, targetGroupKey, targetIdxs, sourceIdxs, indent) {
  const indentStr = '  '.repeat(indent);
  const sourceChildren = GROUP_REGISTRY.get(sourceGroupKey);
  const targetChildren = GROUP_REGISTRY.get(targetGroupKey);
  if (!sourceChildren || !targetChildren || sourceChildren.length === 0 ||
      sourceChildren.length !== targetChildren.length) {
    return null;
  }

  const lines = [];
  for (let i = 0; i < sourceChildren.length; i++) {
    const s = sourceChildren[i];
    const t = targetChildren[i];
    if ((s.nameUpper && TABLE_REGISTRY.has(s.nameUpper)) || (t.nameUpper && TABLE_REGISTRY.has(t.nameUpper))) {
      return null;
    }
    if (s.groupKey || t.groupKey) {
      if (!s.groupKey || !t.groupKey) return null;
      const nested = subscriptedGroupMoveChildLines(s.groupKey, t.groupKey, targetIdxs, sourceIdxs, indent);
      if (nested == null) return null;
      lines.push(...nested);
      continue;
    }
    if (!s.camel || !t.camel) return null;
    if (s.info && t.info) {
      if (s.info.scalaType !== t.info.scalaType) return null;
      if ((s.info.picLength || 0) !== (t.info.picLength || 0)) return null;
      if ((s.info.decimalDigits || 0) !== (t.info.decimalDigits || 0)) return null;
    }
    const readExpr = nestedReadExpr(s.camel, sourceIdxs);
    lines.push(`${indentStr}${t.camel} = ${nestedUpdateExpr(t.camel, targetIdxs, readExpr)}`);
  }
  return lines;
}

function generateSubscriptedGroupMove(sourceGroupKey, targetGroupKey, targetSubscripts, sourceSubscripts, indent) {
  if (!Array.isArray(targetSubscripts) || !Array.isArray(sourceSubscripts) ||
      targetSubscripts.length === 0 || targetSubscripts.length !== sourceSubscripts.length) {
    return null;
  }
  const targetIdxs = targetSubscripts.map(subscriptIndexExpr);
  const sourceIdxs = sourceSubscripts.map(subscriptIndexExpr);
  return subscriptedGroupMoveChildLines(sourceGroupKey, targetGroupKey, targetIdxs, sourceIdxs, indent);
}

/**
 * round-13 finding 4: MOVE of a non-group source (a literal, figurative
 * constant, or plain elementary field/expression - anything groupRefNameUpper
 * doesn't recognize as a group) INTO a bare group target - most notably a
 * level-66 RENAMES name (scala-generator.js's buildFieldRegistry registers it
 * as a synthetic GROUP_REGISTRY entry over the contiguous sibling range it
 * renames), but this works for any ordinary group target the same way, since
 * it's just "the inverse of groupDisplayValueExpr" applied to a MOVE's own
 * source instead of a CALL's current parameter value - exactly the same
 * value-as-concatenated-raw-storage-text convention generateCall/
 * generateEntryMethod already use for a group CALL BY REFERENCE operand (see
 * scatterGroupFromString's own doc comment), reused here for MOVE.
 *
 * Fits/pads the source to the target group's own total byte width (via
 * GROUP_BYTE_LENGTH_REGISTRY, a synthetic all-String/alphanumeric `info` so
 * renderMoveSource's existing literal/figurative/variable rendering paths -
 * fitAlphanumericText, repeatedCharLiteralFor, etc. - apply unchanged), binds
 * it to a block-scoped `val` (so a non-trivial source expression is
 * evaluated exactly once even though scatterGroupFromString may reference it
 * once per child), then scatters it across the group's own children.
 *
 * Returns null (not a guessed/wrong assignment) when the target group's total
 * width isn't known (no GROUP_BYTE_LENGTH_REGISTRY entry) or scatterGroupFromString
 * itself can't represent the shape (an OCCURS child, or a child with no
 * registered field info) - the caller falls back to a visible, compiling TODO
 * marker instead.
 */
function generateScalarIntoGroupMove(source, targetNameUpper, indent) {
  const indentStr = '  '.repeat(indent);
  const groupKey = resolveGroupKey(targetNameUpper);
  const totalWidth = GROUP_BYTE_LENGTH_REGISTRY.get(targetNameUpper);
  if (totalWidth == null) return null;

  const syntheticInfo = {
    scalaType: 'String',
    dataType: 'alphanumeric',
    picLength: totalWidth,
    justified: false,
  };
  const sourceExpr = renderMoveSource(source, syntheticInfo);
  const bi = '  '.repeat(indent + 1);
  const scattered = scatterGroupFromString(groupKey, '_src', indent + 1);
  if (scattered == null) return null;

  return [`${indentStr}{`, `${bi}val _src = ${sourceExpr}`, ...scattered, `${indentStr}}`].join('\n');
}

/**
 * Generate MOVE statement
 */
export function generateMove(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const source = statement.source;
  const targets = Array.isArray(statement.targets) ? statement.targets : [statement.target];
  const sourceGroupUpper = groupRefNameUpper(source);

  const lines = [];

  for (const target of targets) {
    const targetGroupUpper = groupRefNameUpper(target);
    if (sourceGroupUpper && targetGroupUpper) {
      lines.push(generateGroupMove(sourceGroupUpper, targetGroupUpper, indent));
      continue;
    }

    // round-9 finding 4: MOVE of a subscripted whole-group table row (e.g.
    // `MOVE WS-ROW(1) TO WS-ROW(3)`) - see subscriptedGroupRowRef's doc
    // comment. round-15 findings 5/6 generalized generateSubscriptedGroupMove
    // to also cover a CROSS-table row MOVE (different groupKey on each side,
    // e.g. d07's `MOVE WS-ROW-A(i) TO WS-ROW-B(j)`, two distinct 01-records)
    // and a multi-dimensional row reference (e.g. d08's `MOVE WS-INNER(1,1)
    // TO WS-INNER(2,2)`, OCCURS nested inside OCCURS) - both now routed
    // through the SAME call below (previously restricted to
    // `sourceRow.groupKey === targetRow.groupKey` and exactly one subscript
    // dimension); generateSubscriptedGroupMove/subscriptedGroupMoveChildLines
    // themselves still bail out to null (falling through to the visible
    // marker) for the one shape that genuinely isn't representable this way -
    // a child with its OWN additional OCCURS clause.
    const sourceRow = subscriptedGroupRowRef(source);
    const targetRow = subscriptedGroupRowRef(target);
    if (sourceRow && targetRow) {
      const rowLines = generateSubscriptedGroupMove(sourceRow.groupKey, targetRow.groupKey, targetRow.subscripts, sourceRow.subscripts, indent);
      if (rowLines != null) {
        lines.push(rowLines.join('\n'));
        continue;
      }
      lines.push(
        `${indentStr}() // MOVE ${source.name}(...) TO ${target.name}(...): ??? TODO - whole-row MOVE with a ` +
        'nested-OCCURS row child (a table nested inside each row, independent of the row\'s own subscript ' +
        'dimensions) or a differing-layout cross-table row shape is not supported; row left unchanged'
      );
      continue;
    }

    // round-13 finding 4: MOVE of a non-group source (literal, figurative
    // constant, or plain elementary field/expression) INTO a bare group
    // target - most notably a level-66 RENAMES name, but any ordinary group
    // target the same way - see generateScalarIntoGroupMove's own doc
    // comment. The group-to-group branch above already handles the case
    // where BOTH sides are groups; this handles "only the target is".
    if (targetGroupUpper && !sourceGroupUpper) {
      const scatterLines = generateScalarIntoGroupMove(source, targetGroupUpper, indent);
      if (scatterLines != null) {
        lines.push(scatterLines);
        continue;
      }
      lines.push(
        `${indentStr}() // MOVE ... TO ${targetGroupUpper}: ??? TODO - group target marshalling not supported ` +
        'for this shape (an OCCURS child, a child with no registered field info, or an unknown group byte width); ' +
        'value left unchanged'
      );
      continue;
    }

    const info = lookupFieldForRef(target);
    const sourceExpr = renderMoveSource(source, info);
    lines.push(`${indentStr}${renderAssignment(target, sourceExpr)}`);
  }

  return lines.join('\n');
}

/**
 * Match immediate child field names between two group items (looked up in
 * GROUP_REGISTRY by its full ancestor-path key - see scala-generator.js's
 * buildFieldRegistry), recursing into any child pair that is itself a group
 * on both sides. This is MOVE CORRESPONDING's actual rule (COBOL-85
 * 13.16.20.3): move every elementary item in the receiving group whose name
 * matches (ignoring level number/qualification) an elementary item in the
 * sending group; unmatched fields on either side are left untouched.
 *
 * The recursive step uses each child's own `groupKey` (not its bare
 * `nameUpper`) to look up its own children - required whenever two different
 * top-level records each declare their own same-named nested group (e.g.
 * both with `05 DTL-GROUP`): GROUP_REGISTRY has a *separate* entry per
 * distinct group occurrence (keyed by full ancestor path), so recursing by
 * bare name alone would resolve to whichever same-named group happened to be
 * registered - not necessarily the correct one for *this* source/target pair
 * - see tests/corpus/proc/r13-addcorresponding-nested.cbl.
 */
function correspondingPairs(sourceKey, targetKey) {
  const srcChildren = GROUP_REGISTRY.get(sourceKey) || [];
  const tgtChildren = GROUP_REGISTRY.get(targetKey) || [];
  const pairs = [];

  for (const tgt of tgtChildren) {
    // A FILLER entry (round-5 finding 3/s06 - see scala-generator.js's
    // buildFieldRegistry) has no `nameUpper` at all (`null`) - CORRESPONDING
    // only ever matches *named* fields, so it must never participate here;
    // without this guard two unrelated FILLERs on each side would spuriously
    // "correspond" via `null === null`.
    if (!tgt.nameUpper) continue;
    const src = srcChildren.find(s => s.nameUpper === tgt.nameUpper);
    if (!src) continue;

    if (src.groupKey && tgt.groupKey) {
      pairs.push(...correspondingPairs(src.groupKey, tgt.groupKey));
    } else {
      pairs.push({
        sourceCamel: src.camel,
        targetCamel: tgt.camel,
        sourceInfo: src.info || lookupField(src.nameUpper),
        targetInfo: tgt.info || lookupField(tgt.nameUpper),
      });
    }
  }

  return pairs;
}

/**
 * Pair up two groups' immediate children BY POSITION (declared order), not
 * by matching field names the way correspondingPairs (MOVE CORRESPONDING)
 * does. This is the actual semantics of RELEASE record FROM identifier and
 * RETURN file INTO identifier: both are COBOL's implicit *structural* MOVE
 * of the whole record (a positional, name-independent copy - like any other
 * COBOL group MOVE) - RELEASE/RETURN have no CORRESPONDING keyword and never
 * matched by name in real COBOL, regardless of whether the FROM/INTO group's
 * field names happen to coincide with the SD record's own (a source group
 * legitimately declaring differently-named fields, as in
 * tests/corpus/proc/r06-sort-mkcomp3.cbl's WS-SRC-DEPT vs SORT-DEPT, is the
 * whole point of RELEASE/RETURN's FROM/INTO existing at all - reusing
 * correspondingPairs here silently produced zero pairs, hence zero copying).
 * Recurses into a nested-group pair at the same position on both sides,
 * mirroring correspondingPairs' own recursion. The shorter side's length
 * determines the pair count (COBOL only requires the FROM/INTO side not
 * exceed the SD record's declared size).
 */
function positionalPairs(sourceKey, targetKey) {
  // FILLER entries (round-5 finding 3/s06) are excluded here - unlike
  // generateGroupMove's identical-layout path, RELEASE/RETURN's FROM/INTO
  // side is a distinct WORKING-STORAGE group the programmer explicitly wrote
  // to line up with the SD record *by position*; a FILLER on one side but
  // not the other would shift every subsequent pairing by one, corrupting a
  // previously-correct positional match. Matches this function's
  // pre-existing behavior (FILLER was never present in GROUP_REGISTRY at
  // all before FILLER support was added for group DISPLAY/MOVE).
  const srcChildren = (GROUP_REGISTRY.get(sourceKey) || []).filter(c => !c.isFiller);
  const tgtChildren = (GROUP_REGISTRY.get(targetKey) || []).filter(c => !c.isFiller);
  const pairs = [];
  const n = Math.min(srcChildren.length, tgtChildren.length);

  for (let i = 0; i < n; i++) {
    const src = srcChildren[i];
    const tgt = tgtChildren[i];

    if (src.groupKey && tgt.groupKey) {
      pairs.push(...positionalPairs(src.groupKey, tgt.groupKey));
    } else {
      pairs.push({
        sourceCamel: src.camel,
        targetCamel: tgt.camel,
        sourceInfo: src.info || lookupField(src.nameUpper),
        targetInfo: tgt.info || lookupField(tgt.nameUpper),
      });
    }
  }

  return pairs;
}

/**
 * Scala subscript suffix for a (possibly multi-dimensional) subscript list,
 * e.g. `(wsI - 1)` - the same rendering convertIdentifier uses for a
 * subscripted VariableReference, factored out so it can be applied to a
 * *different* identifier than the one the AST subscript node came from (see
 * generateRelease/generateReturn: the FROM/INTO reference's own subscript
 * applies uniformly to every one of the SD record's sibling flat-var
 * fields, not just one).
 */
function subscriptSuffixExpr(subscripts) {
  if (!Array.isArray(subscripts) || subscripts.length === 0) return '';
  return subscripts.map(s => `(${subscriptIndexExpr(s)})`).join('');
}

/**
 * Assignment to `camel` (a flat-var identifier string, not an AST node),
 * honoring an optional subscript list the same way renderAssignment does for
 * an ordinary VariableReference target - a subscripted table field is a
 * `Vector[...]`, which has no index *setter*, so it must be rebuilt with
 * `.updated(idx, value)` rather than `camel(idx) = value`. Used by
 * generateReturn's INTO target, which (unlike renderAssignment's normal
 * callers) computes the target field's own flat-var name via
 * positionalPairs rather than starting from a VariableReference AST node.
 */
function renderCamelAssignment(camel, subscripts, valueExpr) {
  if (!Array.isArray(subscripts) || subscripts.length === 0) {
    return `${camel} = ${valueExpr}`;
  }
  const idxs = subscripts.map(subscriptIndexExpr);
  function rec(depth, baseExpr) {
    if (depth === idxs.length - 1) return `${baseExpr}.updated(${idxs[depth]}, ${valueExpr})`;
    return `${baseExpr}.updated(${idxs[depth]}, ${rec(depth + 1, `${baseExpr}(${idxs[depth]})`)})`;
  }
  return `${camel} = ${rec(0, camel)}`;
}

/** Coerce a matched CORRESPONDING source value to the target field's Scala type. */
function coerceCorrespondingValue(pair) {
  const expr = pair.sourceCamel;
  const targetType = pair.targetInfo?.scalaType;
  const sourceType = pair.sourceInfo?.scalaType;
  if (!targetType || targetType === sourceType) return expr;
  if (targetType === 'BigDecimal') return `BigDecimal(${expr})`;
  if (targetType === 'Long') return `${expr}.toLong`;
  if (targetType === 'Int') return `${expr}.toInt`;
  return expr;
}

/**
 * Generate MOVE CORRESPONDING statement
 */
export function generateMoveCorresponding(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const sourceUpper = String(statement.source?.name || statement.source || '').toUpperCase();
  const targets = Array.isArray(statement.targets) && statement.targets.length > 0
    ? statement.targets
    : [statement.target].filter(Boolean);

  const lines = [];
  for (const targetRef of targets) {
    const targetUpper = String(targetRef?.name || targetRef || '').toUpperCase();
    const pairs = correspondingPairs(resolveGroupKey(sourceUpper), resolveGroupKey(targetUpper));
    if (pairs.length === 0) {
      lines.push(
        `${indentStr}// MOVE CORRESPONDING ${sourceUpper} TO ${targetUpper}: no matching child field names found in the group registry`
      );
      continue;
    }
    for (const pair of pairs) {
      lines.push(`${indentStr}${pair.targetCamel} = ${coerceCorrespondingValue(pair)}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : `${indentStr}()`;
}

/**
 * Generate ADD CORRESPONDING statement: `ADD CORRESPONDING group-1 TO
 * group-2` adds every matching (by name, recursing into a nested same-named
 * group on both sides - see correspondingPairs) elementary child of group-1
 * into group-2's own value (`group-2.field = group-2.field + group-1.field`);
 * group-1 itself is left unchanged (this is an ADD, not a MOVE) and any
 * field on either side without a same-named counterpart is left untouched -
 * same matching rule as MOVE CORRESPONDING (generateMoveCorresponding
 * above), just accumulating instead of overwriting.
 */
function generateAddCorresponding(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const sourceRef = (Array.isArray(statement.addends) && statement.addends[0]) || statement.source;
  const targetRef = (Array.isArray(statement.to) && statement.to[0]) || statement.target;
  const sourceUpper = String(sourceRef?.name || sourceRef || '').toUpperCase();
  const targetUpper = String(targetRef?.name || targetRef || '').toUpperCase();
  const pairs = correspondingPairs(resolveGroupKey(sourceUpper), resolveGroupKey(targetUpper));

  if (pairs.length === 0) {
    return `${indentStr}() // ADD CORRESPONDING ${sourceUpper} TO ${targetUpper}: no matching child field names found in the group registry`;
  }

  // round-18 finding 5: ADD CORRESPONDING between two SUBSCRIPTED rows of
  // an OCCURS table (`ADD CORRESPONDING WS-ROW-A(1) TO WS-ROW-B(2)`)
  // previously dropped BOTH operands' own subscripts entirely - sourceRef/
  // targetRef's `.subscripts` were never consulted at all - so every
  // matched pair fed the BARE (whole-table) `Vector[Int]` flat var straight
  // into `BigDecimal(...)`: a hard compile error, and even had it compiled,
  // it would have overwritten the wrong (unsubscripted) variable wholesale
  // rather than one row's own scalar field. `subscriptSuffixExpr` (empty
  // for an ordinary non-OCCURS group - a pure no-op for every pre-round-18
  // ADD CORRESPONDING call site, none of which exercised a subscripted
  // operand) resolves each side's own subscript expression down to its
  // actual scalar read; `renderCamelAssignment` (already used by
  // generateReturn's own subscripted INTO target, for the identical reason)
  // writes the result back through `.updated(...)` instead of a bare
  // (type-mismatched, whole-Vector) `=`.
  const sourceSuffix = subscriptSuffixExpr(sourceRef?.subscripts);
  const targetSuffix = subscriptSuffixExpr(targetRef?.subscripts);

  // Each matched pair is stored through the same ROUNDED-or-truncated
  // store-time coercion every other arithmetic statement now uses (round-3
  // findings 8/13). round-10 finding 5: `ADD CORRESPONDING ... ROUNDED` is
  // now parsed (parseAddStatement's CORRESPONDING branch) into
  // `statement.rounded` - CORRESPONDING has exactly one implicit target
  // group, so a single statement-level flag applies to every matched pair.
  const rounded = !!statement.rounded;
  return pairs
    .map(pair => {
      const sourceRead = `${pair.sourceCamel}${sourceSuffix}`;
      const targetRead = `${pair.targetCamel}${targetSuffix}`;
      const sumBD = `(${fieldRefToBigDecimalExpr(targetRead, pair.targetInfo)} + ${fieldRefToBigDecimalExpr(sourceRead, pair.sourceInfo)})`;
      const coercedSource = coerceCorrespondingValue({ ...pair, sourceCamel: sourceRead });
      const rawExpr = `${targetRead} + (${coercedSource})`;
      const stored = storeNumericByInfo(pair.targetInfo, sumBD, rawExpr, rounded);
      return `${indentStr}${renderCamelAssignment(pair.targetCamel, targetRef?.subscripts, stored)}`;
    })
    .join('\n');
}

/**
 * Generate SUBTRACT CORRESPONDING statement (round-3 finding 10 - previously
 * unimplemented: `generateSubtract` never checked `statement.corresponding`
 * at all, so `SUBTRACT CORRESPONDING group-1 FROM group-2` fell through to
 * the plain-operand path, which tried to treat a *group* reference as a
 * single elementary operand). Mirrors generateAddCorresponding exactly,
 * subtracting instead of adding: `SUBTRACT CORRESPONDING group-1 FROM
 * group-2` subtracts every matching (by name, recursing into a nested
 * same-named group on both sides - correspondingPairs) elementary child of
 * group-1 from group-2's own value; group-1 is left unchanged and any field
 * without a same-named counterpart on either side is left untouched.
 */
function generateSubtractCorresponding(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const sourceRef = (Array.isArray(statement.subtrahends) && statement.subtrahends[0]) || statement.source;
  const targetRef = (Array.isArray(statement.from) && statement.from[0]) || statement.target;
  const sourceUpper = String(sourceRef?.name || sourceRef || '').toUpperCase();
  const targetUpper = String(targetRef?.name || targetRef || '').toUpperCase();
  const pairs = correspondingPairs(resolveGroupKey(sourceUpper), resolveGroupKey(targetUpper));

  if (pairs.length === 0) {
    return `${indentStr}() // SUBTRACT CORRESPONDING ${sourceUpper} FROM ${targetUpper}: no matching child field names found in the group registry`;
  }

  // round-18 finding 5 (same audit, and same fix, applied to SUBTRACT
  // CORRESPONDING - see generateAddCorresponding's own doc comment above
  // for the full rationale: both operands' own subscripts, previously
  // dropped entirely, must be resolved down to the actual scalar field
  // before building the arithmetic expression).
  const sourceSuffix = subscriptSuffixExpr(sourceRef?.subscripts);
  const targetSuffix = subscriptSuffixExpr(targetRef?.subscripts);

  // round-10 finding 5 (same audit applied to SUBTRACT CORRESPONDING).
  const rounded = !!statement.rounded;
  return pairs
    .map(pair => {
      const sourceRead = `${pair.sourceCamel}${sourceSuffix}`;
      const targetRead = `${pair.targetCamel}${targetSuffix}`;
      const diffBD = `(${fieldRefToBigDecimalExpr(targetRead, pair.targetInfo)} - ${fieldRefToBigDecimalExpr(sourceRead, pair.sourceInfo)})`;
      const coercedSource = coerceCorrespondingValue({ ...pair, sourceCamel: sourceRead });
      const rawExpr = `${targetRead} - (${coercedSource})`;
      const stored = storeNumericByInfo(pair.targetInfo, diffBD, rawExpr, rounded);
      return `${indentStr}${renderCamelAssignment(pair.targetCamel, targetRef?.subscripts, stored)}`;
    })
    .join('\n');
}

/**
 * FUNCTION intrinsics whose generated Scala expression is String-valued -
 * shared by renderRelationalCondition (relational type-coercion) and
 * stringSourceSegmentExpr (STRING numeric-segment coercion): every other
 * intrinsic (LENGTH, MOD, MAX, MIN, NUMVAL, NUMVAL-C, ...) returns a Scala
 * numeric value (Int/Long/BigDecimal).
 */
const FUNCTION_RETURNS_STRING = new Set(['UPPER-CASE', 'LOWER-CASE', 'REVERSE', 'TRIM']);

/**
 * Normalize a relational-condition subject/object node back down to the
 * simplest shape that still identifies what it fundamentally *is* - a
 * Literal / VariableReference / FunctionCall - so relationalOperandDescriptor
 * doesn't need to duplicate ArithmeticExpression-unwrapping logic. Returns
 * null for a genuine computed expression (an operator or unary minus is
 * present) - COBOL arithmetic expressions are always numeric, so callers
 * treat null as "numeric, unknown further detail".
 * (parsePrimaryCondition/parseEvaluateValue wrap a bare operand in an
 * ArithmeticExpression only when the parser had to fold in an arithmetic
 * continuation - see their doc comments - so this mirrors exactly what
 * convertArithmeticExpression itself already unwraps for rendering, just
 * exposing the *identity* of the leaf instead of rendering it.)
 */
function unwrapSimpleConditionOperand(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'ArithmeticExpression') {
    if (node.operator || node.unaryMinus) return null;
    if (node.functionCall) return unwrapSimpleConditionOperand(node.functionCall) || node.functionCall;
    if (node.variable) return unwrapSimpleConditionOperand(node.variable) || node.variable;
    if (node.value !== null && node.value !== undefined) {
      return { type: 'Literal', literalType: /^-?\d+(\.\d+)?$/.test(String(node.value)) ? 'numeric' : 'string', value: node.value };
    }
    return null;
  }
  return node;
}

/**
 * Classify one relational-condition operand for type-coercion purposes
 * (round-3 finding 5): `scalaClass` is what convertArithmeticExpression will
 * actually render it as at the Scala level (String vs a numeric type) -
 * comparing mismatched scalaClasses is a hard Scala 3 compile error
 * ("Values of types Int and String cannot be compared with == or !="),
 * which the pre-fix generator emitted unconditionally for e.g. a numeric
 * REDEFINES character-sliced-view field (String-typed, see
 * scala-generator.js's redefinesAccessorLines) compared against a plain Int
 * field. `semantic` distinguishes three COBOL comparison categories that can
 * all render as Scala String: genuinely alphanumeric (PIC X, string
 * literals), numeric-EDITED (PIC Z/9,999/etc.), and a *plain numeric* item
 * that only happens to be Scala-String-typed because of this generator's
 * REDEFINES character-slicing (`numeric-as-string`) -
 * compiler-verified (probe1.cbl/probe2.cbl, and n05-relation-typecoercion's
 * WS-EDITED case) that GnuCOBOL treats numeric-edited operands as
 * ALPHANUMERIC for comparison purposes (byte comparison against the *other*
 * side's own raw storage text, NOT a numeric extraction) - despite looking
 * "numeric" in the source, `WS-EDITED = WS-N` compares literal characters,
 * not values. Only the REDEFINES numeric-as-string case is genuinely
 * numeric at the COBOL semantic level (it's an ordinary `PIC 9` child - this
 * generator's flat-var model is just representing its shared storage as a
 * String), so extraction-and-numeric-compare is reserved for that case
 * alone.
 */
function relationalOperandDescriptor(node) {
  const simple = unwrapSimpleConditionOperand(node);

  if (simple && simple.type === 'Literal') {
    if (simple.literalType === 'string') {
      return { scalaClass: 'string', semantic: 'alphanumeric', literalText: String(simple.value ?? '') };
    }
    if (simple.literalType === 'figurative') {
      const fig = String(simple.value || '').toUpperCase();
      const isAlnumFig = fig === 'SPACE' || fig === 'HIGH-VALUE' || fig === 'LOW-VALUE' || fig === 'QUOTE';
      return { scalaClass: isAlnumFig ? 'string' : 'numeric', semantic: isAlnumFig ? 'alphanumeric' : 'numeric' };
    }
    return { scalaClass: 'numeric', semantic: 'numeric', literalText: String(simple.value ?? '0') };
  }

  if (simple && simple.type === 'VariableReference') {
    const info = lookupFieldForRef(simple);
    if (info) {
      const isString = info.scalaType === 'String';
      const semantic = !isString ? 'numeric' : (info.dataType === 'numeric' ? 'numeric-as-string' : 'alphanumeric');
      return { scalaClass: isString ? 'string' : 'numeric', semantic, info };
    }
  }

  if (simple && simple.type === 'FunctionCall') {
    const isStr = FUNCTION_RETURNS_STRING.has(String(simple.name || '').toUpperCase());
    return { scalaClass: isStr ? 'string' : 'numeric', semantic: isStr ? 'alphanumeric' : 'numeric' };
  }

  return { scalaClass: 'numeric', semantic: 'numeric' };
}

/**
 * round-8 finding 3: compile-time-known display width of a string-class
 * relational operand - a registered field's own declared PIC length, or a
 * string literal's own text length - or null when neither is known (e.g. a
 * FunctionCall operand, whose result length isn't tracked at all). Used by
 * renderRelationalCondition's string-vs-string branch to decide whether
 * (and how much) space-padding COBOL's alphanumeric comparison rule
 * requires before the two operands are safe to compare directly.
 */
function stringOperandWidth(desc) {
  if (desc.info) return desc.info.picLength || 0;
  if (desc.literalText != null) return desc.literalText.length;
  return null;
}

/** Figurative-constant fill character - shared by MOVE's repeatedCharLiteralFor/zeroLiteralFor and the comparison rendering below. */
function figurativeFillChar(figKind) {
  switch (String(figKind).toUpperCase()) {
    case 'SPACE': return ' ';
    case 'HIGH-VALUE': return String.fromCharCode(255);
    case 'LOW-VALUE': return String.fromCharCode(0);
    case 'QUOTE': return '"';
    case 'ZERO': return '0';
    default: return ' ';
  }
}

/**
 * Scala string-literal expression for a figurative constant (HIGH-VALUES/
 * LOW-VALUES/SPACES/ZEROES/QUOTES) used directly as one side of a relational
 * comparison - round-4 finding 1. convertArithmeticExpression's generic
 * Literal branch has no notion of "comparison width" at all (it just
 * stringifies the figurative constant's own keyword text, e.g. literally
 * `"HIGH-VALUE"` - never what COBOL actually compares), so a figurative
 * comparison operand needs its own renderer here: COBOL expands a bare
 * figurative constant to match whatever it's being compared *against* - the
 * other operand's own declared width (a registered field's `picLength`, or a
 * same-width literal's own text length) - falling back to a single character
 * when there's no such anchor at all (both sides figurative, e.g.
 * `HIGH-VALUES > LOW-VALUES` - compiler-verified against installed GnuCOBOL:
 * this compares exactly one 0xFF byte against one 0x00 byte, not some other
 * arbitrary width).
 */
function figurativeCompareText(literalNode, otherDescriptor) {
  const ch = figurativeFillChar(literalNode.value);
  const width =
    otherDescriptor?.info?.picLength ||
    (otherDescriptor?.literalText != null ? otherDescriptor.literalText.length : 0) ||
    1;
  return `"${escapeScalaStringLiteral(ch.repeat(Math.max(width, 1)))}"`;
}

/**
 * Scala expression for one relational-condition operand, routing a bare
 * figurative-constant operand through figurativeCompareText (sized against
 * the *other* operand's descriptor) instead of convertArithmeticExpression's
 * generic (and, for a figurative constant, simply wrong) literal rendering.
 */
function relationalOperandExpr(node, otherDescriptor) {
  const simple = unwrapSimpleConditionOperand(node);
  if (simple && simple.type === 'Literal' && simple.literalType === 'figurative') {
    return figurativeCompareText(simple, otherDescriptor);
  }
  if (simple && simple.type === 'VariableReference' && simple.refMod) {
    // round-16 finding 2: reference modification (`identifier(start:length)`,
    // Known Gap #1) used as a relational-comparison operand (IF/EVALUATE).
    // convertArithmeticExpression routes a VariableReference through
    // convertIdentifier, whose shared ref-mod placeholder is `Nothing`-typed
    // (`???`) - harmless for `==`/`!=` (defined on Any), but renderComparisonExpr's
    // own `cmp` helper (above) renders every OTHER relational operator as
    // `<left>.compareTo(<right>)`, and `Nothing` has no `compareTo` member -
    // a hard compile error ("Found: Nothing, Required: ?{compareTo}") instead
    // of an honest, compiling gap. Same fix shape as round-15 finding 8's
    // stringSegmentValueExpr: substitute a concrete, String-typed empty
    // placeholder - `"".compareTo(...)`/`"" == ...` both compile and run
    // (comparing against an empty string - visibly wrong result, never a
    // crash) - rather than implementing real ref-mod slicing here, which
    // stays exactly as out of scope as everywhere else this gap surfaces.
    // round-17: now routed through the shared refModStringPlaceholder
    // helper (see its own doc comment) instead of a standalone literal -
    // same text, same behavior, one shared source of truth.
    return `(${refModStringPlaceholder('a comparison operand')})`;
  }
  return convertArithmeticExpression(node);
}

/**
 * Render a RelationalCondition to Scala, coercing operand types per COBOL's
 * class-of-operand comparison rules instead of emitting a bare `left op
 * right` regardless of type (round-3 finding 5):
 *   - alphanumeric vs alphanumeric (incl. numeric-EDITED, which GnuCOBOL
 *     treats as alphanumeric for comparison - see relationalOperandDescriptor's
 *     doc comment): string comparison (`==`/`.compareTo`) - already what a
 *     bare `left op right` produces (String has a working `<`/`>` via
 *     Predef's Ordering), so left untouched.
 *   - numeric vs numeric, including a *plain numeric* operand that only
 *     happens to be String-typed (a REDEFINES character-sliced view - see
 *     scala-generator.js): extract the String side's numeric value
 *     (CobolFmt.numval) and compare numerically - a bare `==` between an
 *     Int/BigDecimal and a String operand is a hard Scala 3 compile error.
 *   - genuine numeric vs alphanumeric (incl. numeric-edited): COBOL treats
 *     the numeric operand as if converted to alphanumeric - compiler-
 *     verified (probe1.cbl) this means the numeric operand contributes its
 *     own *unpadded* digit text if it's a literal, or its own
 *     zero-padded-to-its-own-declared-width digit text if it's a field
 *     (CobolFmt.digitsOf/numericDigitsExpr - the same convention numeric-to-
 *     alphanumeric MOVE already uses) - critically, NOT padded to the
 *     *other* operand's width, which was this fix's first (wrong, un-
 *     verified) draft. Whichever of the two final byte-strings is then
 *     shorter is space-padded on the right to the longer's length (the
 *     ordinary alphanumeric comparison rule) - both widths are compile-time
 *     constants, so that padding is applied directly in the generated
 *     source rather than via a runtime helper.
 */
function renderRelationalCondition(condition) {
  return renderComparisonExpr(condition.subject, condition.object, condition.relationalOperator || '=');
}

/**
 * Shared core of renderRelationalCondition, factored out so any other call
 * site needing a COBOL-correct comparison between two arbitrary operand
 * nodes (not just an actual parsed RelationalCondition) can reuse the exact
 * same type-coercion/space-padding rules instead of emitting a bare `==`.
 * round-9 finding 1: EVALUATE's VALUE-clause WHEN test
 * (evaluateConditionExpr's default/'VALUE' case) previously called this
 * padding logic nowhere at all - it rendered a bare
 * `(subjectExpr) == (valueExpr)`, which is a hard Scala String `==` (exact
 * length match required) whenever the subject and the WHEN value are
 * differently-sized alphanumeric operands (e.g. `01 WS-LONG PIC X(6)` vs a
 * 2-character WHEN literal/field) - COBOL space-pads the shorter operand
 * first, exactly like an ordinary IF/relational comparison does (already
 * fixed for that path by round-8 finding 3, immediately below).
 */
function renderComparisonExpr(subjectNode, objectNode, rawOp) {
  const op = rawOp === '<>' ? '!=' : (COMPARISON_OPERATORS[rawOp] || rawOp);
  const isEq = op === '==' || op === '!=';
  const cmp = (l, r) => (isEq ? `${l} ${op} ${r}` : `(${l}.compareTo(${r}) ${op} 0)`);

  const subj = relationalOperandDescriptor(subjectNode);
  const obj = relationalOperandDescriptor(objectNode);
  // relationalOperandExpr (not a bare convertArithmeticExpression) so a
  // figurative-constant operand (HIGH-VALUES/LOW-VALUES/SPACES/...) renders
  // as its actual comparison text, sized against the *other* operand's own
  // descriptor (round-4 finding 1) - see figurativeCompareText's doc comment.
  // This is exact for the common case both fig01's cases exercise (a
  // figurative vs. a same-scalaClass alphanumeric field/figurative, handled
  // just below); a figurative operand mismatched against a genuinely numeric
  // field (the branch further down) is a pre-existing, untested edge case
  // this fix does not additionally chase.
  const leftExpr = relationalOperandExpr(subjectNode, obj);
  const rightExpr = relationalOperandExpr(objectNode, subj);

  if (subj.scalaClass === obj.scalaClass) {
    if (subj.scalaClass !== 'string') {
      // Both numeric Scala types (Int/Long/BigDecimal freely compare with
      // each other) - no coercion needed.
      return `${leftExpr} ${op} ${rightExpr}`;
    }
    // Both Scala String - only extract-and-compare-numerically when *both*
    // sides are semantically plain-numeric-as-string (e.g. two REDEFINES
    // views); a numeric-as-string vs a genuinely alphanumeric/edited operand
    // has no well-defined COBOL numeric-extraction rule (numeric-edited
    // itself compares as alphanumeric - see the doc comment above), so it
    // falls through to the ordinary string comparison, same as two plain
    // alphanumeric/edited operands.
    if (subj.semantic === 'numeric-as-string' && obj.semantic === 'numeric-as-string') {
      return `CobolFmt.numval(${leftExpr}) ${op} CobolFmt.numval(${rightExpr})`;
    }
    // round-8 finding 3: a bare Scala string `==`/`.compareTo` assumes both
    // operands are already the same length - untrue whenever two
    // alphanumeric operands have different declared widths (two fields with
    // different PIC X(n) lengths, or a literal compared against a field of a
    // different length). COBOL always compares two alphanumeric operands as
    // if the shorter one were first space-padded on the right to the
    // longer's length (compiler-verified against installed GnuCOBOL - see
    // tests/corpus/proc/v08-unequal-compare.cbl) - exactly the same padding
    // rule the numeric-vs-alphanumeric branch below already applies, and
    // both widths (a field's own info.picLength, or a literal's own text
    // length) are compile-time constants, so the padding is spliced directly
    // into the generated source here too. Left unpadded (falls through to
    // the bare comparison) when either side's width can't be determined at
    // all (e.g. a FunctionCall operand, whose result length is unknown at
    // generation time) - not this fix's concern, and safer than guessing.
    const leftWidth = stringOperandWidth(subj);
    const rightWidth = stringOperandWidth(obj);
    if (leftWidth != null && rightWidth != null && leftWidth !== rightWidth) {
      const padLen = Math.abs(leftWidth - rightWidth);
      const pad = `"${' '.repeat(padLen)}"`;
      const leftFinal = leftWidth < rightWidth ? `(${leftExpr} + ${pad})` : leftExpr;
      const rightFinal = rightWidth < leftWidth ? `(${rightExpr} + ${pad})` : rightExpr;
      return cmp(leftFinal, rightFinal);
    }
    return cmp(leftExpr, rightExpr);
  }

  // Mismatched Scala representation: one String, one numeric.
  if (subj.semantic === 'numeric-as-string' || obj.semantic === 'numeric-as-string') {
    const leftNum = subj.scalaClass === 'string' ? `CobolFmt.numval(${leftExpr})` : leftExpr;
    const rightNum = obj.scalaClass === 'string' ? `CobolFmt.numval(${rightExpr})` : rightExpr;
    return `${leftNum} ${op} ${rightNum}`;
  }

  // Genuine numeric vs alphanumeric/edited (compiler-verified rule - see
  // above): each side's own width is a compile-time constant, so the
  // shorter final text is space-padded to match right here.
  const numericIsSubject = subj.scalaClass === 'numeric';
  const numericDesc = numericIsSubject ? subj : obj;
  const stringDesc = numericIsSubject ? obj : subj;
  const stringExpr = numericIsSubject ? rightExpr : leftExpr;

  let numericText, numericWidth;
  if (numericDesc.info) {
    numericText = numericDigitsExpr(numericIsSubject ? leftExpr : rightExpr, numericDesc.info);
    numericWidth = (numericDesc.info.integerDigits || 0) + (numericDesc.info.decimalDigits || 0);
  } else {
    const digits = String(numericDesc.literalText ?? '0').replace(/^[+-]/, '');
    numericText = `"${escapeScalaStringLiteral(digits)}"`;
    numericWidth = digits.length;
  }
  const stringWidth = stringDesc.info?.picLength || (stringDesc.literalText ? stringDesc.literalText.length : 0);

  const padLen = Math.abs(numericWidth - stringWidth);
  const pad = padLen > 0 ? ` + "${' '.repeat(padLen)}"` : '';
  const numericFinal = numericWidth < stringWidth ? `${numericText}${pad}` : numericText;
  const stringFinal = stringWidth < numericWidth ? `${stringExpr}${pad}` : stringExpr;

  const leftFinal = numericIsSubject ? numericFinal : stringFinal;
  const rightFinal = numericIsSubject ? stringFinal : numericFinal;
  return cmp(leftFinal, rightFinal);
}

/**
 * Convert a COBOL condition to Scala
 */
export function convertCondition(condition) {
  if (!condition) return 'true';

  if (typeof condition === 'string') {
    // Check if it's an 88-level condition name
    if (/^[A-Za-z]/.test(condition)) {
      const l88 = level88ConditionExpr(condition.toUpperCase());
      return l88 !== null ? l88 : convertIdentifier(condition);
    }
    return condition;
  }

  // Nodes produced by the procedure parser (parser/ast.js shapes)
  if (condition.type === 'RelationalCondition') {
    // `.negated` (set by parseNotCondition for `IF NOT A > B`, or directly
    // by parseNotCondition's abbreviated-relation-continuation branch) was
    // previously never consulted here at all - a plain NOT-prefixed
    // relational condition silently rendered as if the NOT weren't there.
    const rendered = renderRelationalCondition(condition);
    return condition.negated ? `!(${rendered})` : rendered;
  }

  if (condition.type === 'Condition') {
    const wrapNegated = expr => condition.negated ? `!(${expr})` : expr;

    switch (condition.conditionType) {
      case 'compound': {
        const op = LOGICAL_OPERATORS[condition.operator?.toUpperCase()] || condition.operator;
        if (condition.operator?.toUpperCase() === 'NOT') {
          return `!(${convertCondition(condition.right || condition.left)})`;
        }
        return `(${convertCondition(condition.left)} ${op} ${convertCondition(condition.right)})`;
      }
      case 'class': {
        const field = convertArithmeticExpression(condition.subject);
        switch (condition.classType?.toUpperCase()) {
          case 'NUMERIC':
            return wrapNegated(`${field}.forall(_.isDigit)`);
          case 'ALPHABETIC':
            return wrapNegated(`${field}.forall(_.isLetter)`);
          case 'ALPHABETIC-LOWER':
            return wrapNegated(`${field}.forall(c => c.isLetter && c.isLower)`);
          case 'ALPHABETIC-UPPER':
            return wrapNegated(`${field}.forall(c => c.isLetter && c.isUpper)`);
          default:
            return wrapNegated(`true /* ${condition.classType} class test */`);
        }
      }
      case 'sign': {
        const field = convertArithmeticExpression(condition.subject);
        switch (condition.signType?.toUpperCase()) {
          case 'POSITIVE':
            return wrapNegated(`${field} > 0`);
          case 'NEGATIVE':
            return wrapNegated(`${field} < 0`);
          default:
            return wrapNegated(`${field} == 0`);
        }
      }
      case 'simple':
      default: {
        // Level-88 condition name used as a boolean, e.g. `IF WS-STATUS-OK`
        // or `PERFORM UNTIL WS-FLAG-DONE` - not itself an addressable data
        // item, so it must resolve through CONDITION_REGISTRY (see
        // level88ConditionExpr) rather than being treated as a field
        // reference; anything not a registered condition name falls back to
        // the previous (pre-88-support) behavior.
        const subj = condition.subject;
        const nameUpper = subj && typeof subj === 'object'
          ? String(subj.name || '').toUpperCase()
          : String(subj || '').toUpperCase();
        const l88 = level88ConditionExpr(nameUpper);
        return wrapNegated(l88 !== null ? l88 : convertArithmeticExpression(condition.subject));
      }
    }
  }

  if (condition.type === 'comparison') {
    const left = convertArithmeticExpression(condition.left);
    const right = convertArithmeticExpression(condition.right);
    const op = COMPARISON_OPERATORS[condition.operator?.toUpperCase()] || condition.operator || '==';
    return `${left} ${op} ${right}`;
  }

  if (condition.type === 'level88') {
    const fieldName = convertIdentifier(condition.field);
    const enumName = toPascalCase(condition.field);
    const conditionName = toPascalCase(condition.condition);
    return `${fieldName} == ${enumName}.${conditionName}`;
  }

  if (condition.type === 'logical') {
    const op = LOGICAL_OPERATORS[condition.operator?.toUpperCase()] || condition.operator;

    if (condition.operator?.toUpperCase() === 'NOT') {
      const operand = convertCondition(condition.operand);
      return `!(${operand})`;
    }

    const left = convertCondition(condition.left);
    const right = convertCondition(condition.right);
    return `(${left} ${op} ${right})`;
  }

  if (condition.type === 'class') {
    const field = convertIdentifier(condition.field);
    switch (condition.class?.toUpperCase()) {
      case 'NUMERIC':
        return `${field}.forall(_.isDigit)`;
      case 'ALPHABETIC':
        return `${field}.forall(_.isLetter)`;
      case 'ALPHABETIC-LOWER':
        return `${field}.forall(c => c.isLetter && c.isLower)`;
      case 'ALPHABETIC-UPPER':
        return `${field}.forall(c => c.isLetter && c.isUpper)`;
      default:
        return `/* ${condition.class} */ true`;
    }
  }

  if (condition.type === 'sign') {
    const field = convertIdentifier(condition.field);
    switch (condition.sign?.toUpperCase()) {
      case 'POSITIVE':
        return `${field} > 0`;
      case 'NEGATIVE':
        return `${field} < 0`;
      case 'ZERO':
        return `${field} == 0`;
      default:
        return `${field} == 0`;
    }
  }

  return safeNodeString(condition);
}

/**
 * Generate IF statement
 */
export function generateIf(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const condition = convertCondition(statement.condition);

  const lines = [`${indentStr}if ${condition} then`];

  // round-7 finding 6: an empty THEN branch (e.g. `IF cond NEXT SENTENCE`, or
  // any degenerate case with zero statements) must still emit a placeholder
  // `()` - a Scala 3 significant-indentation `if ... then` with nothing
  // indented under it does NOT compile to "empty block", it silently absorbs
  // whatever statement follows at the *outer* indent level into looking like
  // its own body was skipped, and worse, the subsequent `else` (if any) would
  // no longer be recognized as belonging to this `if` at all. Always emitting
  // at least one line keeps this branch's body real regardless of clause
  // shape.
  if (statement.thenStatements && statement.thenStatements.length > 0) {
    for (const stmt of statement.thenStatements) {
      lines.push(generateExpression(stmt, indent + 1));
    }
  } else {
    lines.push(`${indentStr}  ()`);
  }

  if (statement.elseStatements && statement.elseStatements.length > 0) {
    lines.push(`${indentStr}else`);
    for (const stmt of statement.elseStatements) {
      lines.push(generateExpression(stmt, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Scala boolean expression for one EVALUATE subject's value (TRUE/FALSE
 * pseudo-subjects render as literal booleans; anything else is a normal
 * operand expression).
 */
function evaluateSubjectExpr(subject) {
  if (subject && subject.type === 'TRUE') return 'true';
  if (subject && subject.type === 'FALSE') return 'false';
  return convertArithmeticExpression(subject);
}

/**
 * Scala boolean expression testing one EVALUATE WHEN condition slot against
 * its corresponding subject (parser/ast.js's WhenClause.conditions[i] shapes:
 * ANY/TRUE/FALSE/NOT/RANGE/VALUE - see parseEvaluateStatement).
 */
/**
 * uppercased name of a bare VariableReference WHEN operand, or null for
 * anything else (literal, arithmetic expression, ...) - used to detect a
 * WHEN operand that is actually an 88-level condition name rather than an
 * ordinary value to compare against (see evaluateConditionExpr's VALUE case).
 */
function bareVariableNameUpper(node) {
  if (node && typeof node === 'object' && node.type === 'VariableReference' &&
      (!Array.isArray(node.subscripts) || node.subscripts.length === 0)) {
    return String(node.name || '').toUpperCase();
  }
  return null;
}

function evaluateConditionExpr(subject, cond) {
  if (!cond) return 'true';
  switch (cond.type) {
    case 'ANY':
      return 'true';
    case 'TRUE':
      return evaluateSubjectExpr(subject);
    case 'FALSE':
      return `!(${evaluateSubjectExpr(subject)})`;
    case 'NOT':
      return `(${evaluateSubjectExpr(subject)}) != (${convertArithmeticExpression(cond.value)})`;
    case 'RANGE': {
      const s = evaluateSubjectExpr(subject);
      const from = convertArithmeticExpression(cond.from);
      const to = convertArithmeticExpression(cond.to);
      return `((${s}) >= (${from}) && (${s}) <= (${to}))`;
    }
    case 'NOT-RANGE': {
      const s = evaluateSubjectExpr(subject);
      const from = convertArithmeticExpression(cond.from);
      const to = convertArithmeticExpression(cond.to);
      return `!((${s}) >= (${from}) && (${s}) <= (${to}))`;
    }
    // RELATION/CLASS/SIGN are a full standalone "condition-1" WHEN object
    // (parser/procedure-parser.js's parseEvaluateObject) - COBOL's
    // `EVALUATE TRUE WHEN WS-A > WS-B` / `WHEN WS-X IS NUMERIC` idiom for an
    // IF/ELSE-IF chain. The condition's own truth value *is* the match test,
    // independent of whatever the paired subject's own value would otherwise
    // compare against - only a FALSE pseudo-subject inverts it (mirrors the
    // TRUE/FALSE handling every other case here already does).
    case 'RELATION': {
      const rawOp = cond.operator || '=';
      const op = rawOp === '<>' ? '!=' : (COMPARISON_OPERATORS[rawOp] || rawOp);
      const rel = `(${convertArithmeticExpression(cond.left)}) ${op} (${convertArithmeticExpression(cond.right)})`;
      const result = cond.negated ? `!(${rel})` : rel;
      return subject && subject.type === 'FALSE' ? `!(${result})` : result;
    }
    case 'CLASS': {
      const field = convertArithmeticExpression(cond.subject);
      let expr;
      switch (cond.classType?.toUpperCase()) {
        case 'NUMERIC':
          expr = `${field}.forall(_.isDigit)`;
          break;
        case 'ALPHABETIC':
          expr = `${field}.forall(_.isLetter)`;
          break;
        case 'ALPHABETIC-LOWER':
          expr = `${field}.forall(c => c.isLetter && c.isLower)`;
          break;
        case 'ALPHABETIC-UPPER':
          expr = `${field}.forall(c => c.isLetter && c.isUpper)`;
          break;
        default:
          expr = `true /* ${cond.classType} class test */`;
          break;
      }
      const result = cond.negated ? `!(${expr})` : expr;
      return subject && subject.type === 'FALSE' ? `!(${result})` : result;
    }
    case 'SIGN': {
      const field = convertArithmeticExpression(cond.subject);
      let expr;
      switch (cond.signType?.toUpperCase()) {
        case 'POSITIVE':
          expr = `${field} > 0`;
          break;
        case 'NEGATIVE':
          expr = `${field} < 0`;
          break;
        default:
          expr = `${field} == 0`;
          break;
      }
      const result = cond.negated ? `!(${expr})` : expr;
      return subject && subject.type === 'FALSE' ? `!(${result})` : result;
    }
    case 'VALUE':
    default: {
      // `EVALUATE TRUE WHEN <88-name>` (or `WHEN FALSE`'s pseudo-subject) is
      // COBOL's idiom for `IF <88-name>` fanned out across multiple WHEN
      // clauses - the WHEN operand there is a condition name, not a value to
      // compare the TRUE/FALSE pseudo-subject against (which wouldn't even
      // typecheck: the condition name isn't a boolean data item - see
      // level88ConditionExpr). Detected only under a TRUE/FALSE subject,
      // exactly the shape real COBOL requires for this idiom.
      if (subject && (subject.type === 'TRUE' || subject.type === 'FALSE')) {
        const nameUpper = bareVariableNameUpper(cond.value);
        const l88 = nameUpper ? level88ConditionExpr(nameUpper) : null;
        if (l88 !== null) {
          return subject.type === 'FALSE' ? `!(${l88})` : l88;
        }
      }
      // round-9 finding 1: reuse the same operand-classification/space-
      // padding rules an ordinary relational IF already gets (renderComparisonExpr,
      // shared with renderRelationalCondition) instead of a bare `==` - a
      // TRUE/FALSE pseudo-subject (handled above, and the only case with no
      // real "subject node" to classify) is the one shape this can't cover,
      // so it still falls back to evaluateSubjectExpr/convertArithmeticExpression
      // directly.
      if (subject && subject.type !== 'TRUE' && subject.type !== 'FALSE' && subject != null) {
        return renderComparisonExpr(subject, cond.value, '=');
      }
      return `(${evaluateSubjectExpr(subject)}) == (${convertArithmeticExpression(cond.value)})`;
    }
  }
}

/**
 * Generate EVALUATE statement as an if/else-if chain rather than a Scala
 * `match`: EVALUATE's WHEN conditions are arbitrary per-subject tests (ANY,
 * TRUE/FALSE, NOT, THRU ranges, multi-subject ALSO) rather than structural
 * patterns, so a general boolean-condition cascade - tested top to bottom,
 * first match wins, exactly like COBOL WHEN clauses - covers every shape
 * without needing a separate strategy per condition kind.
 */
/**
 * Merge cascading (empty-bodied) WHEN clauses into the next clause in the
 * same run that actually carries a body - round-18 finding 3: `EVALUATE
 * subject WHEN "A" WHEN "B" WHEN "C" <shared-body>` is legal COBOL (repeated
 * WHEN keywords, not a single WHEN's comma/ALSO-separated multi-value list)
 * meaning "if A or B or C, run the shared body" - real cobc's own
 * documented "multiple WHEN phrases sharing one imperative-statement-list"
 * form. `parseEvaluateStatement` (parser/procedure-parser.js) has always
 * parsed each `WHEN <cond>` as its OWN separate WhenClause node, and a WHEN
 * with no imperative statements before the next WHEN/END-EVALUATE gets an
 * EMPTY `.statements` list (correctly - COBOL genuinely allows an empty
 * WHEN body written that way) - but `generateEvaluate` previously rendered
 * every WhenClause as its OWN independent `if`/`else if` branch, each with
 * ONLY that one clause's own (possibly empty) body. That silently turned
 * "A or B or C share this body" into "A does nothing, B does nothing, only
 * C runs the body" - correct only when the subject happened to equal the
 * LAST condition in the cascade; any other match (g08: `WS-CODE = "B"`)
 * silently ran nothing instead of the shared body at all (not even a
 * fallthrough - the whole EVALUATE effectively no-oped for every non-final
 * condition in every multi-WHEN cascade in the entire corpus). This merge
 * pass runs BEFORE codegen so the actual `if`/`else if` cascade below only
 * ever sees one WhenClause per real body, each carrying every OR'd
 * condition-set (one per originally-separate empty-bodied WHEN that fed
 * into it) that should trigger it - a pure generalization of the
 * pre-existing single-condition-set case (an ordinary WHEN with a body of
 * its own becomes a one-element conditionSets list, rendering byte-for-byte
 * the same `if`/`else if` text as before this fix).
 *
 * A trailing run of empty-bodied WHEN clauses with no later body-bearing
 * WHEN to share (WHEN OTHER never joins a cascade - parseEvaluateStatement
 * detects it separately and never adds it to `whenClauses` at all) is
 * preserved as-is (each kept as its own no-op branch) - matching this
 * function's own pre-fix behavior for that narrow, unexercised shape, since
 * there's no well-defined body to attribute them to.
 */
function mergeCascadingWhenClauses(whenClauses) {
  const merged = [];
  let pendingConditionSets = [];

  for (const when of whenClauses) {
    const conds = when.conditions || [];
    const hasBody = Array.isArray(when.statements) && when.statements.length > 0;
    if (!hasBody) {
      pendingConditionSets.push(conds);
      continue;
    }
    pendingConditionSets.push(conds);
    merged.push({ conditionSets: pendingConditionSets, statements: when.statements });
    pendingConditionSets = [];
  }

  // Any left over (a trailing empty-bodied run with nothing after it to
  // share a body with) - keep each as its own no-op branch, unchanged from
  // this function's own pre-fix rendering.
  for (const conds of pendingConditionSets) {
    merged.push({ conditionSets: [conds], statements: [] });
  }

  return merged;
}

export function generateEvaluate(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const subjects = statement.subjects || [];
  const whenClauses = mergeCascadingWhenClauses(statement.whenClauses || []);

  function statementsOrNoop(stmts, bodyIndent) {
    if (stmts && stmts.length > 0) {
      return stmts.map(s => generateExpression(s, bodyIndent)).join('\n');
    }
    return `${'  '.repeat(bodyIndent)}()`;
  }

  function conditionSetExpr(conds) {
    return conds.length > 0
      ? conds.map((c, j) => evaluateConditionExpr(subjects[j], c)).join(' && ')
      : 'true';
  }

  const lines = [];
  whenClauses.forEach((when, i) => {
    // A single condition-set (the overwhelmingly common case - an ordinary
    // WHEN whose own body follows immediately, or the only WHEN left in a
    // cascade after mergeCascadingWhenClauses) renders byte-for-byte the
    // same text as before this fix (no extra OR-grouping parens); only a
    // genuinely merged multi-WHEN cascade (round-18 finding 3) adds the
    // `(...) || (...)` grouping.
    const cond = when.conditionSets.length > 1
      ? when.conditionSets.map(conds => `(${conditionSetExpr(conds)})`).join(' || ')
      : conditionSetExpr(when.conditionSets[0] || []);
    lines.push(`${indentStr}${i === 0 ? 'if' : 'else if'} (${cond}) then`);
    lines.push(statementsOrNoop(when.statements, indent + 1));
  });

  if (lines.length === 0) {
    // No WHEN clauses at all (malformed input) - WHEN OTHER (if any) is the
    // only reachable branch.
    return statementsOrNoop(statement.whenOther, indent);
  }

  lines.push(`${indentStr}else`);
  lines.push(statementsOrNoop(statement.whenOther, indent + 1));

  return lines.join('\n');
}

/**
 * Scala expression for a figurative-constant DELIMITED BY value used as a
 * literal search needle (STRING's DELIMITED BY / UNSTRING's DELIMITED BY).
 */
function delimiterNeedleExpr(node) {
  if (node && node.type === 'Literal' && node.literalType === 'figurative') {
    const v = String(node.value).toUpperCase();
    if (v === 'SPACE' || v === 'SPACES') return '" "';
    if (v === 'ZERO' || v === 'ZEROS' || v === 'ZEROES') return '"0"';
  }
  return convertArithmeticExpression(node);
}

/**
 * Scala expression for one STRING source operand's *character* contribution
 * - always String-valued, even when the COBOL operand is numeric (round-3
 * finding 7). STRING concatenates character data; a numeric operand
 * contributes its digit-display text, exactly like MOVE numeric-to-
 * alphanumeric already does (CobolFmt.digitsOf) for a registered numeric
 * field, its own literal digit text (unpadded - it has no declared
 * PICTURE) for a numeric literal, and `.toString` for any other computed
 * numeric expression (arithmetic, or a numeric-returning intrinsic like
 * FUNCTION LENGTH/MOD/MAX/MIN/NUMVAL). Before this fix, every numeric
 * operand rendered as a bare Scala Int/Long/BigDecimal value, and the
 * segment-copy loop below (`.indices`/`.take` on `_v`) doesn't even compile
 * against one - this wasn't just wrong output, it was a hard compile error
 * for any STRING statement with a numeric segment.
 */
function stringSegmentValueExpr(node) {
  const rawExpr = convertArithmeticExpression(node);

  if (node && node.type === 'Literal' && node.literalType === 'numeric') {
    return `"${escapeScalaStringLiteral(String(node.value))}"`;
  }

  if (node && node.type === 'VariableReference') {
    if (node.refMod) {
      // round-15 finding 8: reference modification (`identifier(start:
      // length)`, Known Gap #1) used as a STRING segment source. Ref-mod
      // itself stays unimplemented (out of scope - see convertIdentifier's
      // own `???`-typed placeholder, used everywhere else a ref-mod read
      // appears), but that placeholder's static type is `Nothing`, and
      // STRING's own per-character copy loop (generateString, below) calls
      // `.indices`/`.length` directly on this segment's value - `Nothing`
      // has neither member, so this combination was a HARD COMPILE ERROR
      // ("Found: Nothing, Required: ?{indices}") instead of an honest,
      // compiling gap. A concrete, STRING-typed empty-string placeholder
      // fixes that: `"".indices`/`"".length` both compile and evaluate to
      // "contributes zero characters, never advances `_ptr`" - visibly
      // wrong output (the segment's real content is simply missing), but a
      // compiling, running honest decline rather than a crash. Do NOT
      // implement real ref-mod slicing here - that's a separate, larger,
      // deliberately out-of-scope fix (see the known-gaps note). round-17:
      // now routed through the shared refModStringPlaceholder helper.
      return refModStringPlaceholder('a STRING source');
    }
    const info = lookupFieldForRef(node);
    if (info && info.scalaType !== 'String') {
      return numericDigitsExpr(rawExpr, info);
    }
    return rawExpr;
  }

  if (node && node.type === 'FunctionCall') {
    const isStr = FUNCTION_RETURNS_STRING.has(String(node.name || '').toUpperCase());
    return isStr ? rawExpr : `(${rawExpr}).toString`;
  }

  if (node && node.type === 'ArithmeticExpression' && (node.operator || node.unaryMinus)) {
    // A genuine computed arithmetic expression - always numeric in COBOL.
    return `(${rawExpr}).toString`;
  }

  return rawExpr;
}

/**
 * Scala expression for one STRING source's contribution, honoring its
 * DELIMITED BY clause: SIZE (or absent - COBOL defaults to SIZE) takes the
 * whole value; DELIMITED BY <value> truncates at the first occurrence of
 * that literal/identifier's text (searched via indexOf so multi-character
 * delimiters work the same as the single-character common case like SPACE).
 */
function stringSourceSegmentExpr(source) {
  const valueExpr = stringSegmentValueExpr(source.value);
  const d = source.delimitedBy;
  if (!d || d.type === 'SIZE') return valueExpr;
  const needle = delimiterNeedleExpr(d.value);
  return `{ val _v = ${valueExpr}; val _idx = _v.indexOf(${needle}); if _idx >= 0 then _v.take(_idx) else _v }`;
}

/**
 * Generate STRING statement.
 *
 * COBOL STRING concatenates its (per-source, DELIMITED-BY-truncated) source
 * segments into the receiving field starting at the WITH POINTER position
 * (or position 1 if no POINTER clause), overwriting only the characters it
 * writes - everything in the receiving field before the starting position
 * and after the last character written is left exactly as it was. That is
 * modeled here by starting from the target's *current* value, padded/
 * truncated to its full declared storage width (matching how this generator
 * keeps alphanumeric fields unpadded internally but always renders them at
 * full width - see renderDisplayOperand), then overwriting a character range
 * of a mutable StringBuilder built from that width-normalized snapshot.
 * WITH POINTER's identifier is both read (starting position) and written
 * back (final position, one past the last character stored) when present.
 *
 * ON OVERFLOW / NOT ON OVERFLOW (round-6 findings 4/5) - compiler-verified
 * against installed GnuCOBOL (t12): overflow is set the instant any source
 * character can't be stored because the target ran out of room (`_ptr - 1 +
 * _i` would land at or past the target's declared width) - characters that
 * *do* fit are still stored (STRING never backs out a partial store), and
 * everything past the point of overflow is simply dropped, never written.
 * The per-character bounds check below is unconditional (finding 5 - it
 * previously called `_sb.setCharAt` with no bounds check at all, a guaranteed
 * `StringIndexOutOfBoundsException` the moment the combined source segments
 * exceeded the target's width, with or without an ON OVERFLOW clause even
 * being present); the ON OVERFLOW/NOT ON OVERFLOW branches (finding 4,
 * previously parsed but silently dropped at codegen) are only emitted when
 * the statement actually has one, so a STRING with neither clause generates
 * the same shape as before (now overflow-safe) instead of an unused `_overflow`
 * var and empty branches.
 */
export function generateString(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const bi = '  '.repeat(indent + 1);
  const targetInfo = lookupFieldForRef(statement.into);
  const width = targetInfo?.picLength || 0;
  const targetExpr = convertIdentifier(statement.into);
  const initialPtr = statement.pointer ? convertIdentifier(statement.pointer) : '1';
  const hasOverflowClauses = (statement.onOverflow && statement.onOverflow.length > 0) ||
    (statement.notOnOverflow && statement.notOnOverflow.length > 0);

  const lines = [`${indentStr}{`];
  lines.push(`${bi}val _base = (${targetExpr}).padTo(${width}, ' ').take(${width})`);
  lines.push(`${bi}val _sb = new StringBuilder(_base)`);
  lines.push(`${bi}var _ptr = ${initialPtr}`);
  lines.push(`${bi}var _overflow = false`);

  (statement.sources || []).forEach((source, i) => {
    const segVar = `_seg${i}`;
    lines.push(`${bi}val ${segVar} = ${stringSourceSegmentExpr(source)}`);
    lines.push(
      `${bi}for _i <- ${segVar}.indices do { val _pos = _ptr - 1 + _i; if _pos >= 0 && _pos < ${width} then _sb.setCharAt(_pos, ${segVar}(_i)) else _overflow = true }`
    );
    lines.push(`${bi}_ptr = _ptr + ${segVar}.length`);
  });

  lines.push(`${bi}${renderAssignment(statement.into, '_sb.toString')}`);
  if (statement.pointer) {
    lines.push(`${bi}${renderAssignment(statement.pointer, '_ptr')}`);
  }

  if (hasOverflowClauses) {
    lines.push(`${bi}if _overflow then`);
    const onOverflow = statement.onOverflow || [];
    lines.push(
      onOverflow.length > 0
        ? onOverflow.map(s => generateExpression(s, indent + 2)).join('\n')
        : `${bi}  ()`
    );
    lines.push(`${bi}else`);
    const notOnOverflow = statement.notOnOverflow || [];
    lines.push(
      notOnOverflow.length > 0
        ? notOnOverflow.map(s => generateExpression(s, indent + 2)).join('\n')
        : `${bi}  ()`
    );
  }

  lines.push(`${indentStr}}`);

  return lines.join('\n');
}

/**
 * Best-effort literal text for one UNSTRING DELIMITED BY operand's `node`
 * (see parser/procedure-parser.js's parseUnstringStatement - each entry in
 * `statement.delimiters` is `{ node, all }`). Only literal (including
 * figurative) delimiters resolve to compile-time text; a variable delimiter
 * can't be folded into a literal at generation time and is intentionally
 * left unsupported (falls through to the "no DELIMITED BY" TODO path) rather
 * than guessed.
 */
function unstringDelimiterLiteralText(node) {
  if (node && node.type === 'Literal') {
    if (node.literalType === 'figurative') {
      const v = String(node.value).toUpperCase();
      if (v === 'SPACE' || v === 'SPACES') return ' ';
      if (v === 'ZERO' || v === 'ZEROS' || v === 'ZEROES') return '0';
      return null;
    }
    return String(node.value);
  }
  return null;
}

/**
 * Generate UNSTRING statement.
 *
 * Delegates the actual character-by-character scan to the embedded
 * `CobolUnstring.unstring` runtime helper (see generateCobolUnstringHelper)
 * rather than a single regex `.split()` the way this used to work, because a
 * single `.split()` call cannot express everything real UNSTRING needs at
 * once:
 *   - WITH POINTER must *start* scanning at the pointer's current position
 *     (not position 1) and write the final scan position back (round-4
 *     finding 10) - `.split()` has no notion of a start offset.
 *   - DELIMITED BY ALL must collapse a run of consecutive occurrences of
 *     *that* delimiter into one logical delimiter (round-4 finding 11) -
 *     expressible in a regex (`(?:txt)+`) but not while *also* reporting back
 *     which literal delimiter matched at each boundary for DELIMITER IN
 *     (finding 12), which needs the runtime to track per-boundary match text,
 *     not just discard it the way `.split()` does.
 *   - Only as many fields as there are INTO targets should ever be scanned
 *     (COBOL fills only that many, leaving the rest of the source
 *     un-inspected) - `.split()` unconditionally splits the whole remaining
 *     string.
 *
 * COBOL fills only as many targets as there are delimited fields available
 * (leftover targets are left untouched - modeled here as empty string, since
 * every target is a flat, already-declared var); TALLYING IN counts exactly
 * the targets actually filled, which `CobolUnstring.unstring`'s own
 * `maxFields` cap already guarantees `_parts.length` equals directly (no
 * separate `math.min` needed, unlike the old `.split()`-based version whose
 * `_parts` was always the *entire* remaining string's split).
 *
 * Wrapped in its own `{ ... }` block scope (mirroring generateString) so two
 * UNSTRING statements in the same paragraph don't collide over `_parts`/
 * `_delims`/`_newPtr` (round-4 finding 13).
 */
/**
 * Declared full storage width of an UNSTRING INTO target, when it's a
 * registered String-typed (alphanumeric) field - see generateUnstring's own
 * doc comment on why this padding matters. `null` for anything else
 * (unregistered name, or a non-String target - UNSTRING into a numeric
 * field isn't exercised by any corpus program and is left exactly as
 * before, unpadded).
 */
function unstringTargetWidth(target) {
  const info = lookupFieldForRef(target);
  return info && info.scalaType === 'String' && info.picLength ? info.picLength : null;
}

export function generateUnstring(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const bi = '  '.repeat(indent + 1);
  const source = convertIdentifier(statement.source);
  const targets = statement.into || [];

  const delimEntries = statement.delimiters || [];
  const delimiterTexts = delimEntries.map(e => unstringDelimiterLiteralText(e && e.node));
  if (delimiterTexts.length === 0 || delimiterTexts.some(t => t === null)) {
    return `${indentStr}// UNSTRING ${source}: DELIMITED BY clause missing or not a compile-time-resolvable literal - not supported (no corpus target exercises this shape)`;
  }

  const delimsScala = delimEntries
    .map((e, i) => `("${escapeScalaStringLiteral(delimiterTexts[i])}", ${e.all ? 'true' : 'false'})`)
    .join(', ');
  const initialPtr = statement.pointer ? convertIdentifier(statement.pointer) : '1';

  const lines = [`${indentStr}{`];

  // round-18 finding 4: real cobc's UNSTRING reads its SOURCE and writes its
  // INTO targets against the SAME live storage - when a target happens to
  // alias the very field being unstrung (g09: `UNSTRING R-FIELD(1)
  // DELIMITED BY "-" INTO R-FIELD(1) R-FIELD(3)`), the FIRST target write
  // (into R-FIELD(1)) is visible to every SUBSEQUENT field's own scan of
  // R-FIELD(1) (compiler-verified against installed GnuCOBOL: after writing
  // "AB" back into R-FIELD(1), its remaining bytes are now blank/padded, so
  // there's no more "-" to find - the second field silently consumes
  // nothing but trailing spaces, and the pointer ends up one past the
  // field's own full width, not wherever the ORIGINAL (pre-overwrite) text
  // would have put it). The previous single `CobolUnstring.unstring(source,
  // ..., targets.length)` batch call evaluated `source` (a live Scala
  // expression, e.g. `rField(0)`) into its arguments exactly ONCE, before
  // any target write happened - a frozen snapshot, diverging from cobc's
  // own live-aliasing the moment source and a target coincide.
  //
  // Fixed by processing exactly one field per target, re-evaluating
  // `source` FRESH for every single-field call (never hoisted into a `val`)
  // - so a call made after an earlier target's write sees that write's
  // effect, exactly like real cobc's in-place storage does. `_ptr` (a local
  // var, separate from WS-PTR's own field, which COBOL only ever writes
  // back once at the very end) threads the running 0-based cursor across
  // calls; `_uActive` mirrors CobolUnstring.unstring's own internal
  // `continue_` flag (false once a call finds no more delimiter - an empty
  // DELIMITER IN result signals this exactly per that field's own
  // documented meaning below) - once false, every LATER target is left at
  // "" without even attempting another call, matching real COBOL leaving
  // any INTO identifier past the last actually-delimited field untouched
  // (approximated here, as before this fix, as an explicit empty-string
  // write - every target is a flat, already-declared var with no
  // "leave completely unassigned" concept). This whole restructuring is a
  // pure no-op for the overwhelmingly common non-aliased case: re-reading
  // an unchanged `source` expression produces byte-for-byte the same split
  // a single batch call would, one field at a time.
  if (targets.length === 0) {
    // Degenerate (invalid COBOL - UNSTRING always has at least one INTO
    // target) - preserve the old single zero-field batch call verbatim
    // rather than special-casing further; only the ON OVERFLOW/POINTER
    // wiring below can observe it, and no corpus program exercises this
    // shape.
    lines.push(
      `${bi}val (_parts, _delims, _newPtr, _overflow) = CobolUnstring.unstring(${source}, (${initialPtr}) - 1, Seq(${delimsScala}), 0)`
    );
    if (statement.pointer) {
      lines.push(`${bi}${renderAssignment(statement.pointer, '_newPtr + 1')}`);
    }
  } else {
    lines.push(`${bi}var _ptr = (${initialPtr}) - 1`);
    lines.push(`${bi}var _overflow = false`);
    lines.push(`${bi}var _uActive = true`);
    if (statement.tallying) lines.push(`${bi}var _uFilled = 0`);

    const bi2 = `${bi}  `;
    targets.forEach((t, index) => {
      // round-18 finding 4 companion: real COBOL UNSTRING populates a
      // receiving field exactly like an alphanumeric MOVE would - the
      // matched text, space-padded (or truncated) out to the field's own
      // FULL declared storage width - not the bare matched substring left
      // otherwise unpadded. This was already a latent (if usually invisible
      // - DISPLAY re-pads to full width anyway) gap even before this
      // round's live-aliasing fix, but it becomes directly observable the
      // moment a target is re-read as a later field's own SOURCE in the
      // same UNSTRING (g09): without padding, R-FIELD(1)'s in-model value
      // after its own write-back is the short unpadded "AB" (length 2), so
      // the very next field's scan (also reading R-FIELD(1)) clamps its
      // start position against a 2-character string instead of the real
      // 10-byte fixed storage cobc actually has - silently producing the
      // wrong final WITH POINTER value even once the *target values*
      // themselves are otherwise correct. Only applied when the target is a
      // registered String-typed (alphanumeric) field with a known width;
      // any other shape (unregistered/numeric target - not exercised by any
      // corpus program) falls back to the prior unpadded text, unchanged.
      const targetWidth = unstringTargetWidth(t.target);
      const fit = (expr) => (targetWidth ? `CobolFmt.fitLeft(${expr}, ${targetWidth})` : expr);

      lines.push(`${bi}if _uActive then`);
      lines.push(
        `${bi2}val (_parts${index}, _delims${index}, _newPtr${index}, _ovf${index}) = ` +
        `CobolUnstring.unstring(${source}, _ptr, Seq(${delimsScala}), 1)`
      );
      lines.push(`${bi2}${renderAssignment(t.target, fit(`_parts${index}.headOption.getOrElse("")`))}`);
      if (t.count) {
        // COUNT IN identifier: the number of characters actually delimited
        // into the corresponding target - the matched substring's own
        // length, not the receiving field's declared width.
        lines.push(`${bi2}${renderAssignment(t.count, `_parts${index}.headOption.map(_.length).getOrElse(0)`)}`);
      }
      if (t.delimiter) {
        // DELIMITER IN identifier: the literal delimiter text that actually
        // matched at this field's boundary (empty when this field was the
        // last one, consumed with no following delimiter at all) - round-4
        // finding 12.
        lines.push(`${bi2}${renderAssignment(t.delimiter, `_delims${index}.headOption.getOrElse("")`)}`);
      }
      lines.push(`${bi2}_ptr = _newPtr${index}`);
      lines.push(`${bi2}_overflow = _ovf${index}`);
      if (statement.tallying) lines.push(`${bi2}_uFilled += 1`);
      lines.push(`${bi2}if _delims${index}.headOption.getOrElse("") == "" then _uActive = false`);
      lines.push(`${bi}else`);
      lines.push(`${bi2}${renderAssignment(t.target, fit('""'))}`);
      if (t.count) lines.push(`${bi2}${renderAssignment(t.count, '0')}`);
      if (t.delimiter) lines.push(`${bi2}${renderAssignment(t.delimiter, '""')}`);
    });

    if (statement.tallying) {
      lines.push(`${bi}${renderAssignment(statement.tallying, '_uFilled')}`);
    }

    if (statement.pointer) {
      // The running cursor is 0-based internally; WITH POINTER's own field
      // is COBOL's 1-based position.
      lines.push(`${bi}${renderAssignment(statement.pointer, '_ptr + 1')}`);
    }
  }

  // ON OVERFLOW / NOT ON OVERFLOW (round-6 finding 6) - the clauses are now
  // parsed (parser/procedure-parser.js's parseUnstringStatement); `_overflow`
  // is set exactly when the source had more delimited fields than there were
  // INTO targets to receive them. Only emitted when the statement actually
  // has one of these clauses, mirroring generateString's identical pattern.
  const hasOverflowClauses = (statement.onOverflow && statement.onOverflow.length > 0) ||
    (statement.notOnOverflow && statement.notOnOverflow.length > 0);
  if (hasOverflowClauses) {
    lines.push(`${bi}if _overflow then`);
    const onOverflow = statement.onOverflow || [];
    lines.push(
      onOverflow.length > 0
        ? onOverflow.map(s => generateExpression(s, indent + 2)).join('\n')
        : `${bi}  ()`
    );
    lines.push(`${bi}else`);
    const notOnOverflow = statement.notOnOverflow || [];
    lines.push(
      notOnOverflow.length > 0
        ? notOnOverflow.map(s => generateExpression(s, indent + 2)).join('\n')
        : `${bi}  ()`
    );
  }

  lines.push(`${indentStr}}`);

  return lines.join('\n');
}

/** Scala expression for an INSPECT BEFORE/AFTER INITIAL phrase's boundary operand. */
function inspectRegionBoundaryExpr(region) {
  return convertArithmeticExpression(region.value);
}

/**
 * Scala expression for the substring an INSPECT TALLYING clause should scan,
 * honoring an optional BEFORE/AFTER INITIAL region (round-4 finding 3): the
 * portion of `target` before, or after, the first occurrence of the boundary
 * text (the whole target when there's no region at all).
 */
function inspectTallyScanExpr(target, region) {
  if (!region) return target;
  const boundary = inspectRegionBoundaryExpr(region);
  return region.type === 'BEFORE'
    ? `CobolInspect.beforeInitial(${target}, ${boundary})._1`
    : `CobolInspect.afterInitial(${target}, ${boundary})._2`;
}

/**
 * Wrap a REPLACING/CONVERTING sub-clause's operation with its optional
 * BEFORE/AFTER INITIAL restriction (round-4 finding 3): `buildOperation`
 * receives the Scala expression text for whatever should actually be
 * scanned/modified (either `scanExpr` itself, absent a region, or a `_reg`
 * local bound to just the restricted piece) and returns the operation's own
 * result expression; the untouched complement (`_rest`) - the piece before
 * an AFTER boundary, or from a BEFORE boundary onward, including the
 * boundary text itself either way - is reattached around it so the rest of
 * the target is provably unmodified by this one clause.
 */
function applyInspectRegion(region, scanExpr, buildOperation) {
  if (!region) return buildOperation(scanExpr);
  const boundary = inspectRegionBoundaryExpr(region);
  if (region.type === 'BEFORE') {
    return `{ val (_reg, _rest) = CobolInspect.beforeInitial(${scanExpr}, ${boundary}); ${buildOperation('_reg')} + _rest }`;
  }
  return `{ val (_rest, _reg) = CobolInspect.afterInitial(${scanExpr}, ${boundary}); _rest + ${buildOperation('_reg')} }`;
}

/**
 * Generate INSPECT statement. `statement.tallying`/`.replacing` are always
 * arrays (empty when that clause is absent - see parser/ast.js's
 * InspectStatement), so each is checked by length, not truthiness. Each
 * TALLYING/REPLACING sub-clause and the CONVERTING clause may carry its own
 * `region` (`{ type: 'BEFORE'|'AFTER', value }`, from
 * parser/procedure-parser.js's parseInspectRegion) restricting that one
 * operation to before/after the first occurrence of a boundary value -
 * round-4 finding 3 (previously parsed not at all: the whole BEFORE/AFTER
 * INITIAL phrase was left completely unconsumed, so the INSPECT ran
 * unrestricted over the *entire* target and the leftover tokens were then
 * mis-parsed as a separate, bogus statement).
 *
 * round-17 finding 6: REPLACING/CONVERTING's write-back previously always
 * emitted a naive `${target} = ${expr}` string, where `target` is
 * `convertIdentifier(statement.target)`'s READ-form rendering - fine for a
 * plain scalar (`wsField = ...`), but a hard "value update is not a member
 * of Vector[String]" compile error for a subscripted table-row element
 * (`INSPECT WS-ROW(2) REPLACING ...` renders `wsRow(2) = ...`, which is a
 * Vector element WRITE - Scala's `x(i) = v` sugar needs a real `.update`
 * method, which an immutable Vector doesn't have; this generator represents
 * every OCCURS table as an immutable `Vector`, always written via
 * `.updated(i, v)` - see renderAssignment's own doc comment). Confirmed
 * general (reproduces on a plain fixed-size OCCURS too, not ODO-specific) -
 * a new combination no prior corpus program exercised. Fixed by routing the
 * write-back through the shared `renderAssignment(statement.target, expr)`
 * helper every other subscripted-write call site (MOVE/STRING/...) already
 * uses, instead of hand-building the assignment string here - a pure no-op
 * for a non-subscripted target (renderAssignment's own subscripts.length
 * === 0 branch produces the identical `${camel} = ${expr}` text as before).
 */
export function generateInspect(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = convertIdentifier(statement.target);
  const lines = [];

  if (Array.isArray(statement.tallying) && statement.tallying.length > 0) {
    for (const t of statement.tallying) {
      const counter = convertIdentifier(t.counter);
      const scan = inspectTallyScanExpr(target, t.region);
      if (t.type === 'CHARACTERS') {
        lines.push(`${indentStr}${counter} = ${counter} + (${scan}).length`);
      } else if (t.type === 'ALL') {
        const pattern = convertArithmeticExpression(t.what);
        // Non-overlapping substring count, scanning left to right - matches
        // COBOL's TALLYING FOR ALL semantics for both single- and
        // multi-character patterns (a plain .count(_ == char) would only be
        // correct for exactly-one-character patterns).
        lines.push(`${indentStr}${counter} = ${counter} + CobolInspect.tallyAll(${scan}, ${pattern})`);
      } else if (t.type === 'LEADING') {
        const pattern = convertArithmeticExpression(t.what);
        lines.push(`${indentStr}${counter} = ${counter} + CobolInspect.tallyLeading(${scan}, ${pattern})`);
      }
    }
  }

  if (Array.isArray(statement.replacing) && statement.replacing.length === 1) {
    // Single REPLACING clause: no cascading concern (there is only one
    // clause to apply), so this keeps the pre-existing, already
    // oracle-verified per-clause-type codegen byte-for-byte.
    const r = statement.replacing[0];
    const buildOperation = (scanExpr) => {
      if (r.type === 'CHARACTERS') {
        const to = convertArithmeticExpression(r.to);
        return `CobolInspect.replaceCharacters(${scanExpr}, ${to})`;
      }
      const from = convertArithmeticExpression(r.from);
      const to = convertArithmeticExpression(r.to);
      if (r.type === 'FIRST') return `CobolInspect.replaceFirst(${scanExpr}, ${from}, ${to})`;
      if (r.type === 'LEADING') return `CobolInspect.replaceLeading(${scanExpr}, ${from}, ${to})`;
      if (r.type === 'TRAILING') return `CobolInspect.replaceTrailing(${scanExpr}, ${from}, ${to})`;
      // ALL (default)
      return `CobolInspect.replaceAll(${scanExpr}, ${from}, ${to})`;
    };
    const expr = applyInspectRegion(r.region, target, buildOperation);
    lines.push(`${indentStr}${renderAssignment(statement.target, expr)}`);
  } else if (Array.isArray(statement.replacing) && statement.replacing.length > 1) {
    // round-14 finding 2: multiple REPLACING clauses in ONE INSPECT
    // statement must all match against the PRE-STATEMENT snapshot of the
    // target, in a single left-to-right pass (see CobolInspect.replaceMultiClause's
    // own doc comment) - not the previous cascade, where each clause's
    // `applyInspectRegion` wrapped the *previous* clause's own resulting
    // expression, so a later clause's comparand could match text an
    // earlier clause in the SAME statement had just written.
    const clauseExprs = statement.replacing.map((r) => {
      const kind = r.type || 'ALL';
      const from = r.type === 'CHARACTERS' ? '""' : convertArithmeticExpression(r.from);
      const to = convertArithmeticExpression(r.to);
      const regionType = r.region ? r.region.type : '';
      const regionBoundary = r.region ? inspectRegionBoundaryExpr(r.region) : '""';
      return `CobolInspect.ReplClause("${kind}", ${from}, ${to}, "${regionType}", ${regionBoundary})`;
    });
    lines.push(`${indentStr}${renderAssignment(statement.target, `CobolInspect.replaceMultiClause(${target}, Seq(${clauseExprs.join(', ')}))`)}`);
  }

  if (statement.converting) {
    const from = convertArithmeticExpression(statement.converting.from);
    const to = convertArithmeticExpression(statement.converting.to);
    const buildOperation = (scanExpr) =>
      `(${scanExpr}).map(c => { val _i = (${from}).indexOf(c); if _i >= 0 then (${to})(_i) else c })`;
    const expr = applyInspectRegion(statement.converting.region, target, buildOperation);
    lines.push(`${indentStr}${renderAssignment(statement.target, expr)}`);
  }

  return lines.length > 0 ? lines.join('\n') : `${indentStr}()`;
}

/**
 * Normalize statement type from AST class names to simple keywords
 */
function normalizeType(type) {
  if (!type) return '';
  // Remove "Statement" suffix and convert to uppercase
  return type.replace(/Statement$/i, '').toUpperCase();
}

/**
 * Main expression generator - routes to specific generators
 */
export function generateExpression(statement, indent = 0) {
  if (!statement) return '';

  const rawType = statement.type || '';
  const type = normalizeType(rawType);

  switch (type) {
    case 'COMPUTE':
      return generateCompute(statement, indent);
    case 'MOVE':
      // MoveStatement's AST type is always "MoveStatement" whether or not
      // it's a MOVE CORRESPONDING (that's just a `.corresponding` boolean
      // flag on the same node - see parser/ast.js) - so the dispatch has to
      // branch on the flag here; normalizeType(...) can never itself produce
      // a distinct "MOVE CORRESPONDING" case label to switch on.
      return statement.corresponding ? generateMoveCorresponding(statement, indent) : generateMove(statement, indent);
    case 'IF':
      return generateIf(statement, indent);
    case 'EVALUATE':
      return generateEvaluate(statement, indent);
    case 'STRING':
      return generateString(statement, indent);
    case 'UNSTRING':
      return generateUnstring(statement, indent);
    case 'INSPECT':
      return generateInspect(statement, indent);
    case 'ADD':
      return generateAdd(statement, indent);
    case 'SUBTRACT':
      return generateSubtract(statement, indent);
    case 'MULTIPLY':
      return generateMultiply(statement, indent);
    case 'DIVIDE':
      return generateDivide(statement, indent);
    case 'DISPLAY':
      return generateDisplay(statement, indent);
    case 'ACCEPT':
      return generateAccept(statement, indent);
    case 'OPEN':
      return generateOpen(statement, indent);
    case 'CLOSE':
      return generateClose(statement, indent);
    case 'READ':
      return generateReadStatement(statement, indent);
    case 'WRITE':
      return generateWriteStatement(statement, indent);
    case 'REWRITE':
      return generateRewriteStatement(statement, indent);
    case 'DELETE':
      return generateDeleteStatement(statement, indent);
    case 'START':
      return generateStartStatement(statement, indent);
    case 'PERFORM':
      return generatePerform(statement, indent);
    case 'CALL':
      return generateCall(statement, indent);
    case 'GO':
    case 'GOTO':
      return generateGoTo(statement, indent);
    case 'STOP':
      return generateStop(statement, indent);
    case 'GOBACK':
      return generateGoback(statement, indent);
    case 'EXIT':
      return generateExit(statement, indent);
    case 'SET':
      return generateSet(statement, indent);
    case 'INITIALIZE':
      return generateInitialize(statement, indent);
    case 'SEARCH':
      return generateSearch(statement, indent);
    case 'SORT':
      return generateSort(statement, indent);
    case 'MERGE':
      return generateMerge(statement, indent);
    case 'RELEASE':
      return generateRelease(statement, indent);
    case 'RETURN':
      return generateReturn(statement, indent);
    case 'CONTINUE':
      return `${'  '.repeat(indent)}() // CONTINUE`;
    case 'NEXT SENTENCE':
    case 'NEXT-SENTENCE':
      return `${'  '.repeat(indent)}() // NEXT SENTENCE (implicit fall-through)`;
    default:
      // Visible, grep-able TODO marker for a statement type this dispatch
      // doesn't (yet) recognize - a `()` no-op keeps the surrounding method
      // compiling (matching every other unsupported-construct marker in
      // this file - see safeNodeString/generateFunctionCall's own `???`
      // markers), rather than a runtime-throwing `???` literal, which would
      // turn a merely-unimplemented statement into a hard crash the moment
      // it's reached instead of a silent (but visible in the source) no-op.
      return `${'  '.repeat(indent)}() /* ??? TODO: unsupported statement type (${type}) - not yet implemented */`;
  }
}

/**
 * Generate ADD statement
 * ADD A B TO C GIVING D -> D = A + B + C
 * ADD A B TO C -> C = C + A + B
 */
function generateAdd(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  if (statement.corresponding) {
    return generateAddCorresponding(statement, indent);
  }

  // Get addends (values being added)
  const addendNodes = statement.addends || statement.operands || [];
  const addends = addendNodes.map(a => convertArithmeticExpression(a));
  const rounded = !!statement.rounded;

  // TO/GIVING targets (raw refs - kept unstringified so renderAssignment can
  // see their subscripts; convertIdentifier is used separately for reading
  // a target's current value on the ADD ... TO path).
  const toTargets = statement.to || [];
  const givingTargets = statement.giving || [];
  const withSizeError = hasSizeErrorClause(statement);

  const lines = [];

  // Every target below is stored through storeNumericExpr - ROUNDED applied
  // (or, absent ROUNDED, truncated) to *its own* declared digit widths at
  // store time, and any surplus high-order integer digit dropped the same
  // way MOVE already does (round-3 findings 8/9/13: ROUNDED used to be a
  // no-op trailing comment, and every target - GIVING's multiple targets
  // very much included - was assigned the exact raw sum with no truncation
  // at all, regardless of its own declared decimal digits).
  if (givingTargets.length > 0) {
    // ADD ... GIVING - result goes to giving targets
    const toExprs = toTargets.map(t => convertIdentifier(t));
    const sum = [...addends, ...toExprs].join(' + ');
    const sumBD = `(${[...addendNodes, ...toTargets].map(toBigDecimalOperand).join(' + ')})`;
    const entries = givingTargets.map(target => ({
      target,
      resultBD: sumBD,
      finalExpr: storeNumericExpr(target, sumBD, sum, rounded),
    }));
    if (!withSizeError) {
      lines.push(...entries.map(e => `${indentStr}${renderAssignment(e.target, e.finalExpr)}`));
    } else {
      lines.push(generateArithmeticSizeErrorCheck(indent, statement, entries));
    }
  } else if (toTargets.length > 0 && addends.length > 0) {
    // ADD ... TO - adds to each TO target
    const addendSum = addends.join(' + ');
    const addendSumBD = `(${addendNodes.map(toBigDecimalOperand).join(' + ')})`;
    const entries = toTargets.map(target => {
      const current = convertIdentifier(target);
      const sumBD = `(${toBigDecimalOperand(target)} + ${addendSumBD})`;
      return {
        target,
        resultBD: sumBD,
        finalExpr: storeNumericExpr(target, sumBD, `${current} + ${addendSum}`, rounded),
      };
    });
    if (!withSizeError) {
      lines.push(...entries.map(e => `${indentStr}${renderAssignment(e.target, e.finalExpr)}`));
    } else {
      lines.push(generateArithmeticSizeErrorCheck(indent, statement, entries));
    }
  } else {
    // Fallback
    const target = statement.target;
    const current = convertIdentifier(target);
    if (current && addends.length > 0) {
      const sumBD = `(${toBigDecimalOperand(target)} + ${addendNodes.map(toBigDecimalOperand).join(' + ')})`;
      lines.push(`${indentStr}${renderAssignment(target, storeNumericExpr(target, sumBD, `${current} + ${addends.join(' + ')}`, rounded))}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate SUBTRACT statement
 * SUBTRACT A B FROM C GIVING D -> D = C - A - B
 * SUBTRACT A B FROM C -> C = C - A - B
 */
function generateSubtract(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  if (statement.corresponding) {
    return generateSubtractCorresponding(statement, indent);
  }

  // Get subtrahends (values being subtracted)
  const subtrahendNodes = statement.subtrahends || statement.operands || [];
  const subtrahends = subtrahendNodes.map(s => convertArithmeticExpression(s));
  const rounded = !!statement.rounded;

  const fromTargets = statement.from || [];
  const givingTargets = statement.giving || [];
  const withSizeError = hasSizeErrorClause(statement);

  const lines = [];

  // See generateAdd's doc comment - the same store-time ROUNDED/truncation
  // coercion (round-3 findings 8/9/13) applies here, per target.
  if (givingTargets.length > 0) {
    // SUBTRACT ... GIVING
    const fromExprs = fromTargets.map(f => convertIdentifier(f));
    const fromExpr = fromExprs.join(' + ');
    const subExpr = subtrahends.join(' + ');
    const rawExpr = `${fromExpr} - (${subExpr})`;
    const fromBD = `(${fromTargets.map(toBigDecimalOperand).join(' + ')})`;
    const subBD = `(${subtrahendNodes.map(toBigDecimalOperand).join(' + ')})`;
    const resultBD = `(${fromBD} - ${subBD})`;
    const entries = givingTargets.map(target => ({
      target,
      resultBD,
      finalExpr: storeNumericExpr(target, resultBD, rawExpr, rounded),
    }));
    if (!withSizeError) {
      lines.push(...entries.map(e => `${indentStr}${renderAssignment(e.target, e.finalExpr)}`));
    } else {
      lines.push(generateArithmeticSizeErrorCheck(indent, statement, entries));
    }
  } else if (fromTargets.length > 0) {
    // SUBTRACT ... FROM - subtracts from each FROM target
    const subExpr = subtrahends.join(' + ');
    const subBD = `(${subtrahendNodes.map(toBigDecimalOperand).join(' + ')})`;
    const entries = fromTargets.map(target => {
      const current = convertIdentifier(target);
      const resultBD = `(${toBigDecimalOperand(target)} - ${subBD})`;
      return {
        target,
        resultBD,
        finalExpr: storeNumericExpr(target, resultBD, `${current} - (${subExpr})`, rounded),
      };
    });
    if (!withSizeError) {
      lines.push(...entries.map(e => `${indentStr}${renderAssignment(e.target, e.finalExpr)}`));
    } else {
      lines.push(generateArithmeticSizeErrorCheck(indent, statement, entries));
    }
  }

  return lines.join('\n');
}

/**
 * Generate MULTIPLY statement
 * COBOL: MULTIPLY A BY B [GIVING C]
 * - Without GIVING: B = A * B (multiplier stored in BY operand)
 * - With GIVING: C = A * B
 */
function generateMultiply(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  // Get multiplicand (the first operand)
  const multiplicandNode = statement.multiplicand || statement.left;
  const multiplicand = convertArithmeticExpression(multiplicandNode);
  const rounded = !!statement.rounded;

  // Get by operands (what we multiply by)
  const byOperands = statement.by || [];
  const withSizeError = hasSizeErrorClause(statement);
  const lines = [];

  // See generateAdd's doc comment - the same store-time ROUNDED/truncation
  // coercion (round-3 findings 8/9/13) applies here, per target.
  if (statement.giving && statement.giving.length > 0) {
    // MULTIPLY A BY B GIVING C - result goes to C
    const byNode = byOperands.length > 0 ? byOperands[0] : statement.right;
    const byExpr = convertArithmeticExpression(byNode);
    const rawExpr = `${multiplicand} * ${byExpr}`;
    const resultBD = `(${toBigDecimalOperand(multiplicandNode)} * ${toBigDecimalOperand(byNode)})`;
    const entries = statement.giving.map(target => ({
      target,
      resultBD,
      finalExpr: storeNumericExpr(target, resultBD, rawExpr, rounded),
    }));

    if (!withSizeError) {
      lines.push(...entries.map(e => `${indentStr}${renderAssignment(e.target, e.finalExpr)}`));
    } else {
      lines.push(generateArithmeticSizeErrorCheck(indent, statement, entries));
    }
  } else if (byOperands.length > 0) {
    // MULTIPLY A BY B - result stored in B
    const multiplicandBD = toBigDecimalOperand(multiplicandNode);
    const entries = byOperands.map(by => {
      const byExpr = convertIdentifier(by);
      const resultBD = `(${multiplicandBD} * ${toBigDecimalOperand(by)})`;
      return {
        target: by,
        resultBD,
        finalExpr: storeNumericExpr(by, resultBD, `${multiplicand} * ${byExpr}`, rounded),
      };
    });
    if (!withSizeError) {
      lines.push(...entries.map(e => `${indentStr}${renderAssignment(e.target, e.finalExpr)}`));
    } else {
      lines.push(generateArithmeticSizeErrorCheck(indent, statement, entries));
    }
  } else {
    // Fallback for simple format
    const right = convertArithmeticExpression(statement.right);
    const target = statement.target || statement.giving;
    const targetExpr = convertIdentifier(target);
    if (statement.giving) {
      const resultBD = `(${toBigDecimalOperand(multiplicandNode)} * ${toBigDecimalOperand(statement.right)})`;
      lines.push(`${indentStr}${renderAssignment(target, storeNumericExpr(target, resultBD, `${multiplicand} * ${right}`, rounded))}`);
    } else {
      const resultBD = `(${toBigDecimalOperand(target)} * ${toBigDecimalOperand(multiplicandNode)})`;
      lines.push(`${indentStr}${renderAssignment(target, storeNumericExpr(target, resultBD, `${targetExpr} * ${multiplicand}`, rounded))}`);
    }
  }

  return lines.join('\n');
}

/**
 * round-9 finding 6: the BigDecimal-valued *stored* quotient - i.e. the exact
 * same ROUNDED-or-truncated-to-declared-digits value storeNumericByInfo would
 * actually assign to the first GIVING target - without that function's
 * further Int/Long/Float/Double/edited-string final coercion. DIVIDE ...
 * GIVING q REMAINDER r's remainder is defined as `dividend - (q * divisor)`
 * using q's own *stored* (picture-truncated) value, not the mathematically
 * exact quotient - compiler-verified (tests/corpus/proc/w11-divide-remainder-scale.cbl:
 * `7.5000 / 2.0000` stores an exact `3.7500` quotient into a PIC 9(4)V9(4)
 * target - no truncation actually occurs here, since 4 decimal digits is
 * enough room - so REMAINDER must be `7.5 - (3.75 * 2.0) = 0`, not
 * BigDecimal's own `%` operator's answer of `1.5`, which effectively uses an
 * *integer* quotient (floor(7.5/2.0) = 3) instead of COBOL's own
 * decimal-digit-truncated one). Falls back to the exact (untruncated)
 * quotient expression for a target this generator can't apply digit
 * truncation to at all - unregistered, or COMP-1/COMP-2 (no PIC digit counts
 * to truncate to) - matching storeNumericByInfo's own equivalent fallback.
 */
function storedQuotientBDExpr(givingTarget, resultBD, rounded) {
  const info = lookupFieldForRef(givingTarget);
  if (!info || info.scalaType === 'Float' || info.scalaType === 'Double') return resultBD;
  const intDigits = info.integerDigits > 0 ? info.integerDigits : 18;
  const decDigits = info.decimalDigits || 0;
  const fn = rounded ? 'roundNumeric' : 'truncNumeric';
  return `CobolFmt.${fn}(${resultBD}, ${intDigits}, ${decDigits})`;
}

/**
 * Generate DIVIDE statement. GIVING targets that call for BigDecimal
 * (decimal-place) division are coerced via toBigDecimalOperand (never a
 * naive `BigDecimal(<already-rendered-expression-text>)` wrap - see its doc
 * comment for why that double-wraps and fails to compile whenever the
 * dividend/divisor are themselves already BigDecimal-typed fields, the
 * DIVIDE "double-BigDecimal-wrap" bug).
 */
function generateDivide(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const giving = Array.isArray(statement.giving) ? statement.giving : [statement.giving].filter(Boolean);
  const into = Array.isArray(statement.into) ? statement.into : [statement.into].filter(Boolean);
  const withSizeError = hasSizeErrorClause(statement);
  const rounded = !!statement.rounded;

  if (giving.length > 0) {
    // Parser fields: "DIVIDE A BY B"   -> dividend=A, divisor=B
    //                "DIVIDE A INTO B" -> divisor=A, into=[B]
    const dividendNode = into.length > 0 ? into[0] : statement.dividend;
    const divisorNode = statement.divisor;
    const dividend = convertArithmeticExpression(dividendNode);
    const divisor = convertArithmeticExpression(divisorNode);
    const dividendBD = toBigDecimalOperand(dividendNode);
    const divisorBD = toBigDecimalOperand(divisorNode);
    const resultBD = `(${dividendBD} / ${divisorBD})`;

    // Every GIVING target is now stored through storeNumericExpr - real
    // (non-truncating) BigDecimal division, then ROUNDED-or-truncated to
    // the target's own declared digit widths at store time (round-3
    // findings 8/9/13: ROUNDED was a complete no-op for DIVIDE before this
    // fix, e.g. `DIVIDE 7 BY 2 GIVING X ROUNDED` into a 0-decimal target
    // must yield 4, not the 3 plain truncating-Int-division gave). The
    // plain `${dividend} / ${divisor}` fallback (natural Scala type, no
    // BigDecimal) is kept only for an unregistered/ambiguous target -
    // storeNumericExpr's own fallback path.
    const entries = giving.map(target => ({
      target,
      resultBD,
      finalExpr: storeNumericExpr(target, resultBD, `${dividend} / ${divisor}`, rounded),
    }));
    if (statement.remainder) {
      // round-9 finding 6: REMAINDER = dividend - (stored quotient * divisor),
      // using the FIRST GIVING target's own actually-stored (ROUNDED-or-
      // truncated) quotient value - not BigDecimal's own `%` operator, which
      // silently uses an integer-floor quotient instead of COBOL's
      // decimal-digit-truncated one (see storedQuotientBDExpr's doc comment).
      const storedQuotientBD = storedQuotientBDExpr(giving[0], resultBD, rounded);
      const remainderBD = `(${dividendBD} - ((${storedQuotientBD}) * ${divisorBD}))`;
      entries.push({
        target: statement.remainder,
        resultBD: remainderBD,
        finalExpr: storeNumericExpr(statement.remainder, remainderBD, `${dividend} % ${divisor}`, false),
      });
    }

    if (!withSizeError) {
      lines.push(...entries.map(e => `${indentStr}${renderAssignment(e.target, e.finalExpr)}`));
    } else {
      // DIVIDE BY ZERO: BigDecimal division would raise ArithmeticException
      // before any digit-capacity check could even run, so it must be
      // tested (and short-circuit into the ON SIZE ERROR branch) ahead of -
      // not alongside - the digit checks.
      const zeroCheck = `(${divisorBD}) == BigDecimal(0)`;
      lines.push(generateArithmeticSizeErrorCheck(indent, statement, entries, zeroCheck));
    }
  } else if (into.length > 0) {
    // DIVIDE A INTO B  -> b = b / a
    const divisorNode = statement.divisor || statement.dividend;
    const divisor = convertArithmeticExpression(divisorNode);
    const divisorBD = toBigDecimalOperand(divisorNode);

    const entries = into.map(target => {
      const name = convertIdentifier(target);
      const resultBD = `(${toBigDecimalOperand(target)} / ${divisorBD})`;
      return {
        target,
        resultBD,
        finalExpr: storeNumericExpr(target, resultBD, `${name} / ${divisor}`, rounded),
      };
    });

    if (!withSizeError) {
      lines.push(...entries.map(e => `${indentStr}${renderAssignment(e.target, e.finalExpr)}`));
    } else {
      const zeroCheck = `(${divisorBD}) == BigDecimal(0)`;
      lines.push(generateArithmeticSizeErrorCheck(indent, statement, entries, zeroCheck));
    }
  } else {
    const dividend = convertArithmeticExpression(statement.dividend);
    const divisor = convertArithmeticExpression(statement.divisor);
    lines.push(`${indentStr}// DIVIDE with no target: ${dividend} / ${divisor}`);
  }

  return lines.join('\n');
}

/**
 * Concatenated raw-storage display text for a whole GROUP item (round-5
 * finding 3) - cobc's own `DISPLAY group-item` shows every child's storage
 * back-to-back with no separators, at its own fixed width, in declared
 * order; there is no single flat Scala var holding a group's "value" the way
 * there is for an elementary item (see scala-generator.js's
 * buildFieldRegistry), so this builds the equivalent by walking
 * GROUP_REGISTRY: a String child is fitted (space-padded/truncated) to its
 * own declared width via CobolFmt.fitLeft, a numeric child renders its own
 * unsigned zero-padded digit text via CobolFmt.digitsOf (matching the
 * existing MOVE-numeric-to-alphanumeric convention - COBOL's raw DISPLAY
 * storage for an unsigned/zoned numeric is exactly its digit text; signed
 * zoned-overpunch storage is out of scope, see the bail-out below), a
 * FILLER's own hidden flat var (round-5 finding 3/s06) is fitted the same
 * way as any other String child, and a nested group recurses via its own
 * `groupKey`. Returns `null` (not a guessed/wrong value) when the shape
 * can't be represented this way: an OCCURS-bearing child (a `Vector`, not a
 * scalar - whole-group DISPLAY concatenation of a table isn't modeled) or a
 * child with no registry info at all.
 */
export function groupDisplayValueExpr(groupKey) {
  const children = GROUP_REGISTRY.get(groupKey);
  if (!children || children.length === 0) return null;

  const parts = [];
  for (const c of children) {
    if (c.nameUpper && TABLE_REGISTRY.has(c.nameUpper)) return null;
    if (c.groupKey) {
      const nested = groupDisplayValueExpr(c.groupKey);
      if (nested == null) return null;
      parts.push(nested);
      continue;
    }
    const info = c.info;
    if (!info) return null;
    if (info.scalaType === 'String') {
      const width = info.picLength || 0;
      parts.push(width > 0 ? `CobolFmt.fitLeft(${c.camel}, ${width})` : c.camel);
    } else {
      const asBD = info.scalaType === 'BigDecimal' ? c.camel : `BigDecimal(${c.camel})`;
      const digitsText = `CobolFmt.digitsOf(${asBD}, ${info.integerDigits}, ${info.decimalDigits})`;
      // round-9 finding 2: a signed numeric child (e.g. `PIC S9(5)V99 COMP-3`)
      // loses its sign entirely if only digitsOf's own unsigned digit text is
      // used - fine for an ordinary MOVE-numeric-to-alphanumeric (COBOL really
      // does drop the sign there), but this same channel also carries a
      // group's value across a CALL ... BY REFERENCE boundary
      // (scatterGroupFromString is its exact inverse - see that function's
      // updated numeric branch below), where the sign is real data that must
      // round-trip, not a display-formatting choice. A one-character '+'/'-'
      // sign marker is prepended for a signed child only (unsigned children -
      // by far the common case - keep the exact prior text/width, so every
      // other caller of this function, e.g. whole-group DISPLAY, s06, is
      // unaffected).
      parts.push(info.signed ? `((if ${asBD} < BigDecimal(0) then "-" else "+") + ${digitsText})` : digitsText);
    }
  }
  return parts.join(' + ');
}

/**
 * round-10 finding 3/4: USAGE clauses whose on-disk storage is NOT plain
 * zoned-DISPLAY digit/character bytes - packed decimal, binary, and the two
 * floating-point USAGEs. A WRITE of a record containing any of these must
 * round-trip the record's own true byte-level encoding (CobolCodecs, via the
 * record's generated case-class format()) rather than groupDisplayValueExpr's
 * display-text convention, which silently produced bytes a real cobc READ of
 * the same record could never have written in the first place (x03: a
 * COMP-3 field's *unsigned digit text* was written, then the very next READ
 * tried to packedDecode those ASCII digit bytes as if they were packed
 * decimal - a guaranteed crash/corruption, never a plausible cobc byte
 * layout at all).
 */
const NON_DISPLAY_USAGES = new Set([
  'COMP-3', 'COMPUTATIONAL-3', 'PACKED-DECIMAL',
  'COMP', 'COMP-4', 'COMP-5', 'BINARY', 'COMPUTATIONAL', 'COMPUTATIONAL-4', 'COMPUTATIONAL-5',
  'COMP-1', 'COMPUTATIONAL-1', 'COMP-2', 'COMPUTATIONAL-2',
  // round-16 finding 6: GnuCOBOL's native fixed-width binary USAGEs (no PIC
  // clause at all) are non-DISPLAY storage too.
  'BINARY-CHAR', 'BINARY-SHORT', 'BINARY-LONG', 'BINARY-DOUBLE',
]);

function isNonDisplayUsage(usage) {
  return NON_DISPLAY_USAGES.has(String(usage || '').toUpperCase());
}

/**
 * True when `groupKey`'s own children (recursing into nested groups; an
 * OCCURS table's own elementary USAGE counts too) include at least one
 * non-DISPLAY field anywhere - see isNonDisplayUsage. Drives
 * writeRecordPlan's mode selection: true routes a WRITE of this record
 * through the byte-level case-class format() path (writeByteConstructorExpr)
 * instead of the plain display-text concatenation
 * (writeGroupDisplayValueExpr) - see that function's own doc comment for why
 * the two paths are genuinely incompatible, not just cosmetically different.
 */
function groupContainsNonDisplay(groupKey) {
  const children = GROUP_REGISTRY.get(groupKey);
  if (!children || children.length === 0) return false;
  for (const c of children) {
    if (c.groupKey && groupContainsNonDisplay(c.groupKey)) return true;
    if (!c.groupKey && c.info && isNonDisplayUsage(c.info.usage)) return true;
  }
  return false;
}

/**
 * Builds the `<Child1>, <Child2>, ...` constructor-argument list needed to
 * instantiate this group's own generated case class from its CURRENT flat-var
 * values (`<ClassName>(<args>)`), for writeByteLevelLines's `.format(...)`
 * call. Each plain elementary child contributes its own flat-var camel
 * identifier directly (case-class-gen.js gives every real child its own
 * same-named, same-order constructor parameter - see generateCaseClass);
 * a nested group child recurses into its own constructor call
 * (`<NestedClassName>(<nested-args>)`).
 *
 * Returns `null` (not a guessed/wrong constructor call) for any shape this
 * can't safely build - a FILLER child (no established flat-var <-> case-class
 * constructor-slot correspondence, same restriction generateGroupMove's own
 * differing-layout path already documents), an OCCURS table child (fixed or
 * ODO - a case class's own `format()` always writes the table at its FIXED
 * max width, which is exactly wrong for an ODO table's variable-length WRITE;
 * combining COMP-3/binary fields with an OCCURS table in the same record is
 * consequently left as an honest, visible TODO rather than a silently wrong
 * byte layout - see writeRecordPlan), a nested group whose case-class name is
 * ambiguous across two different records, or a child with no registry info
 * at all.
 */
function groupChildConstructorExpr(groupKey) {
  const children = GROUP_REGISTRY.get(groupKey);
  if (!children || children.length === 0) return null;

  const parts = [];
  for (const c of children) {
    if (c.isFiller) return null;
    if (c.nameUpper && TABLE_REGISTRY.has(c.nameUpper)) return null;
    if (c.groupKey) {
      const nestedClassName = toPascalCase(c.nameUpper);
      if (AMBIGUOUS_GROUP_CLASS_NAMES.has(nestedClassName)) return null;
      const nestedArgs = groupChildConstructorExpr(c.groupKey);
      if (nestedArgs == null) return null;
      parts.push(`${nestedClassName}(${nestedArgs})`);
      continue;
    }
    if (!c.info || !c.camel) return null;
    parts.push(c.camel);
  }
  return parts.join(', ');
}

/**
 * round-10 finding 4 (extended by round-11 finding 1): the table-aware
 * variant of groupDisplayValueExpr - identical for every plain child, but a
 * TABLE_REGISTRY child (an OCCURS-bearing elementary field) contributes its
 * elements' worth of digit text concatenated back-to-back, exactly like
 * cobc's own raw-storage DISPLAY of a group containing a table:
 *   - OCCURS ... DEPENDING ON (`tableInfo.dependingOn`, see
 *     scala-generator.js's tableRegistry construction): the table's
 *     *current* runtime length (round-10 finding 4 - verified against
 *     installed GnuCOBOL's y11b oracle, `GROUP=[3123]` for a 3-element ODO
 *     table holding 1/2/3 with a 1-digit counter holding 3).
 *   - fixed-size OCCURS (no DEPENDING ON, round-11 finding 1): every
 *     declared element (`tableInfo.times`), unconditionally - this is the
 *     piece round-10 left as an unconditional bail-out
 *     (groupDisplayValueExpr's own restriction), which meant DISPLAY of a
 *     group with a *fixed*-size OCCURS child fell all the way through to a
 *     bare, undeclared-identifier Scala reference (renderDisplayOperand had
 *     no fallback at all for that shape) rather than a compiling, correct
 *     concatenation.
 * Both cases share the same `(0 until <count>).map(i => <elem>).mkString`
 * shape; only the count expression differs (a runtime `.toInt` conversion of
 * the counter field vs. a literal element count).
 *
 * A table child whose own USAGE is non-DISPLAY (packed+OCCURS - see
 * writeRecordPlan, an honest TODO instead) still bails out to `null` exactly
 * like groupDisplayValueExpr always has. A separate function (not folded
 * into groupDisplayValueExpr itself) specifically so this table-aware
 * behavior is scoped to callers that have actually been oracle-verified for
 * it (writeRecordPlan's WRITE path, and renderDisplayOperand's bare
 * whole-group DISPLAY path per y11b) rather than silently changing every
 * groupDisplayValueExpr caller's behavior (e.g. READ's group-mode fallback
 * text, or the CALL BY REFERENCE group-marshalling convention
 * scatterGroupFromString pairs with) which remain on the original,
 * table-bailing function untouched.
 */
function odoDisplayValueExpr(groupKey) {
  const children = GROUP_REGISTRY.get(groupKey);
  if (!children || children.length === 0) return null;

  const parts = [];
  for (const c of children) {
    if (c.nameUpper && TABLE_REGISTRY.has(c.nameUpper)) {
      const tableInfo = TABLE_REGISTRY.get(c.nameUpper);
      if (!tableInfo || !c.info || isNonDisplayUsage(c.info.usage)) return null;
      const info = c.info;
      const countExpr = tableInfo.dependingOn ? `(${tableInfo.dependingOn}).toInt` : `${tableInfo.times}`;
      const asBDExpr = info.scalaType === 'BigDecimal' ? `${c.camel}(i)` : `BigDecimal(${c.camel}(i))`;
      const digitsText = `CobolFmt.digitsOf(${asBDExpr}, ${info.integerDigits || 0}, ${info.decimalDigits || 0})`;
      const elemExpr = info.signed
        ? `((if ${asBDExpr} < BigDecimal(0) then "-" else "+") + ${digitsText})`
        : digitsText;
      parts.push(`(0 until ${countExpr}).map(i => ${elemExpr}).mkString`);
      continue;
    }
    if (c.groupKey) {
      const nested = odoDisplayValueExpr(c.groupKey);
      if (nested == null) return null;
      parts.push(nested);
      continue;
    }
    const info = c.info;
    if (!info) return null;
    if (info.scalaType === 'String') {
      const width = info.picLength || 0;
      parts.push(width > 0 ? `CobolFmt.fitLeft(${c.camel}, ${width})` : c.camel);
    } else {
      const asBD = info.scalaType === 'BigDecimal' ? c.camel : `BigDecimal(${c.camel})`;
      const digitsText = `CobolFmt.digitsOf(${asBD}, ${info.integerDigits}, ${info.decimalDigits})`;
      parts.push(info.signed ? `((if ${asBD} < BigDecimal(0) then "-" else "+") + ${digitsText})` : digitsText);
    }
  }
  return parts.join(' + ');
}

/**
 * round-8 finding 1: the inverse of groupDisplayValueExpr - scatters a
 * previously-concatenated whole-group string (produced by
 * groupDisplayValueExpr for this *same* group, byte-for-byte - see the
 * call sites, which always pair the two) back out into each of the group's
 * own child flat vars, at the same fixed offsets/widths
 * groupDisplayValueExpr's own concatenation order and per-child width
 * (CobolFmt.fitLeft's padding width for a String child, or
 * integerDigits+decimalDigits digit width for a numeric child) establish.
 *
 * Used by generateCall's/generateEntryMethod's (scala-generator.js) BY
 * REFERENCE CALL handling for a group-shaped USING/LINKAGE operand: Scala
 * has no shared-storage / pass-by-reference mechanism, so the
 * "value-in/tuple-out" convention this generator otherwise uses for a
 * scalar BY REFERENCE parameter (pass the current value in, assign the
 * callee's returned value back) is extended to a group operand by using its
 * raw concatenated storage text (groupDisplayValueExpr) as that "value",
 * with this function doing the reverse assignment.
 *
 * `sourceExpr` is any Scala String-valued expression of exactly this
 * group's own byte width (a plain var, or - as at every call site here - a
 * substring slice of an enclosing group's own sourceExpr, for a nested
 * group). Returns null (the same "can't be represented this way" signal
 * groupDisplayValueExpr itself uses, for exactly the same unsupported
 * shapes - an OCCURS-bearing child, or a child with no registered field
 * info at all) rather than emitting a partially-scattered, wrong result.
 */
export function scatterGroupFromString(groupKey, sourceExpr, indent) {
  const indentStr = '  '.repeat(indent);
  const children = GROUP_REGISTRY.get(groupKey);
  if (!children || children.length === 0) return null;

  const lines = [];
  let offset = 0;
  for (const c of children) {
    if (c.nameUpper && TABLE_REGISTRY.has(c.nameUpper)) return null;

    if (c.groupKey) {
      const width = GROUP_BYTE_LENGTH_REGISTRY.get(c.nameUpper);
      if (width == null) return null;
      const nestedLines = scatterGroupFromString(
        c.groupKey,
        `(${sourceExpr}).substring(${offset}, ${offset + width})`,
        indent
      );
      if (nestedLines == null) return null;
      lines.push(...nestedLines);
      offset += width;
      continue;
    }

    const info = c.info;
    if (!info) return null;

    if (info.scalaType === 'String') {
      const width = info.picLength || 0;
      const sliceExpr = width > 0 ? `(${sourceExpr}).substring(${offset}, ${offset + width})` : sourceExpr;
      lines.push(`${indentStr}${c.camel} = ${sliceExpr}`);
      offset += width;
      continue;
    }

    const intDigits = info.integerDigits || 0;
    const decDigits = info.decimalDigits || 0;
    const digitWidth = intDigits + decDigits;
    // round-9 finding 2: the exact inverse of groupDisplayValueExpr's own
    // updated numeric branch - a signed child's marshalled text carries one
    // extra leading sign character ('+'/'-') before its unsigned digit text,
    // which must be consumed here (and negate the parsed magnitude) or the
    // sign is silently dropped and, worse, the leftover sign character would
    // corrupt the digit-slice parsing itself.
    const signWidth = info.signed ? 1 : 0;
    const width = signWidth + digitWidth;
    const sliceExpr = `(${sourceExpr}).substring(${offset + signWidth}, ${offset + width})`;
    const bdMagExpr = decDigits > 0
      ? `BigDecimal((${sliceExpr}).take(${intDigits}) + "." + (${sliceExpr}).drop(${intDigits}))`
      : `BigDecimal(${sliceExpr})`;
    const bdExpr = info.signed
      ? `(if (${sourceExpr}).substring(${offset}, ${offset + 1}) == "-" then -(${bdMagExpr}) else (${bdMagExpr}))`
      : bdMagExpr;
    const finalExpr = info.scalaType === 'BigDecimal' ? bdExpr
      : info.scalaType === 'Long' ? `${bdExpr}.toLong`
      : info.scalaType === 'Float' ? `${bdExpr}.toFloat`
      : info.scalaType === 'Double' ? `${bdExpr}.toDouble`
      : `${bdExpr}.toInt`;
    lines.push(`${indentStr}${c.camel} = ${finalExpr}`);
    offset += width;
  }
  return lines;
}

/**
 * round-22 finding 1: flattens a group's own children (walking `groupRegistry`
 * exactly like groupDisplayValueExpr/scatterGroupFromString do), recursing
 * into any nested-group child, into an ORDERED list of `{ camel, scalaType }`
 * leaf descriptors - one entry per elementary field actually reachable inside
 * the group, in declaration order. This is the per-child analogue of
 * groupDisplayValueExpr's own concatenation-order traversal: same bail-out
 * conditions (an OCCURS-bearing child, a FILLER child with no addressable
 * COBOL name, or a child with no registered field info at all all return
 * `null` - never a guessed/partial list).
 *
 * Used by generateRecursiveEntryMethod/generateCall's RECURSIVE-target branch
 * (generator/scala-generator.js, generator/expression-gen.js) to extend
 * round-21 finding 2's per-scalar getter/setter closure-aliasing convention
 * to a GROUP LINKAGE parameter: one closure pair PER LEAF child, instead of
 * the single flat Scala var a scalar LINKAGE parameter has - a group has no
 * such single var of its own to alias (see groupDisplayValueExpr's own doc
 * comment), only its children do, so the aliasing must happen one level
 * deeper, per child, exactly where those flat vars actually live.
 *
 * `groupRegistry`/`tableRegistry` are passed explicitly (defaulting to the
 * currently-installed GROUP_REGISTRY/TABLE_REGISTRY globals) so this same
 * traversal can also run BEFORE those globals are installed for a given
 * program - see generateMultiProgramScala's own pre-loop (scala-generator.js),
 * which must decide every program's RECURSIVE-entry-method eligibility up
 * front, across every program in the source, before any one of them installs
 * its own globals via generateScala.
 */
export function flattenGroupLeaves(groupKey, groupRegistry = GROUP_REGISTRY, tableRegistry = TABLE_REGISTRY) {
  const children = groupRegistry.get(groupKey);
  if (!children || children.length === 0) return null;

  const leaves = [];
  for (const c of children) {
    if (c.isFiller) return null;
    if (c.nameUpper && tableRegistry.has(c.nameUpper)) return null;
    if (c.groupKey) {
      const nested = flattenGroupLeaves(c.groupKey, groupRegistry, tableRegistry);
      if (nested == null) return null;
      leaves.push(...nested);
      continue;
    }
    if (!c.info) return null;
    leaves.push({ camel: c.camel, scalaType: c.info.scalaType });
  }
  return leaves;
}

/**
 * Render one DISPLAYed operand. Plain numeric (non-edited) PIC items print
 * through CobolFmt.num() so the output matches cobc's zero-padded,
 * leading-sign DISPLAY format (e.g. PIC S9(5) value 100 -> "+00100");
 * numeric-edited and alphanumeric fields already hold their final display
 * string (numeric-edited items are formatted at MOVE time - see
 * renderLiteralForTarget/formatEditedPicture) and print as-is. A bare group
 * reference (round-5 finding 3 - `info` is null because a group never gets
 * its own elementary FIELD_REGISTRY entry, only its children do) falls back
 * to odoDisplayValueExpr's table-aware raw-storage concatenation first
 * (round-11 finding 1: this handles a group containing an OCCURS child,
 * fixed-size or DEPENDING ON, the exact shape groupDisplayValueExpr itself
 * always bails out of - previously DISPLAY of such a group fell through
 * every branch here to the bare `expr` at the bottom, a reference to a
 * nonexistent Scala identifier, since a group has no flat var of its own;
 * verified against installed GnuCOBOL's y11b oracle, `GROUP=[3123]`), then
 * groupDisplayValueExpr's raw-storage concatenation for every other group
 * shape (odoDisplayValueExpr is a strict superset of groupDisplayValueExpr's
 * own non-table branches, so the two calls are non-overlapping only in the
 * table-child case; groupDisplayValueExpr is still tried second rather than
 * dropped, so a group shape neither function can render still degrades to
 * the same bare-`expr` fallback as before, not a thrown error).
 */
function renderDisplayOperand(ref) {
  if (ref && typeof ref === 'object' && ref.refMod) {
    // round-17 finding 3: reference modification (`identifier(start:
    // length)`, Known Gap #1) used as a plain DISPLAY operand - a hard
    // "Found: Nothing, Required: ?{padTo}" compile error. `expr` below would
    // be convertIdentifier's shared `Nothing`-typed `???` placeholder, and
    // EVERY branch further down this function calls a member directly on it
    // (`.padTo`/`.take` for alphanumeric, `BigDecimal(...)` for numeric,
    // `CobolFmt.floatDisplay(...)` for Float/Double) - `Nothing` has none of
    // those members, so this crashed regardless of which branch the
    // field's own declared type would otherwise route through. Same
    // honest-decline shape as every other operand-position call site (see
    // refModStringPlaceholder's own doc comment) - substitute a concrete
    // String placeholder up front, before any type-specific branch below
    // ever sees the ref-mod'd expr at all.
    return refModStringPlaceholder('a DISPLAY operand');
  }
  const expr = convertIdentifier(ref);
  const info = lookupFieldForRef(ref);
  if (!info) {
    const hasSubscripts = ref && typeof ref === 'object' && Array.isArray(ref.subscripts) && ref.subscripts.length > 0;
    const nameUpper = ref && typeof ref === 'object' ? String(ref.name || '').toUpperCase() : String(ref || '').toUpperCase();
    if (nameUpper && !hasSubscripts) {
      const groupKey = resolveGroupKey(nameUpper);
      const tableAwareExpr = odoDisplayValueExpr(groupKey);
      if (tableAwareExpr) return `(${tableAwareExpr})`;
      const groupExpr = groupDisplayValueExpr(groupKey);
      if (groupExpr) return `(${groupExpr})`;
    }
  }
  // round-7 findings 2/3: COMP-1/COMP-2 (Float/Double) - no PIC clause, so
  // integerDigits/decimalDigits are always 0/0 and the ordinary CobolFmt.num
  // path below renders an all-zero-width (i.e. empty) numeric string. See
  // CobolFmt.floatDisplay's own doc comment for the plain-decimal-text
  // format cobc actually uses for these.
  if (info && (info.scalaType === 'Float' || info.scalaType === 'Double')) {
    return `CobolFmt.floatDisplay(${expr})`;
  }
  if (info && info.dataType === 'numeric') {
    const asBigDecimal = info.scalaType === 'BigDecimal' ? expr : `BigDecimal(${expr})`;
    return `CobolFmt.num(${asBigDecimal}, ${info.integerDigits}, ${info.decimalDigits}, ${info.signed}, ${DECIMAL_POINT_IS_COMMA})`;
  }
  // Plain (non-edited) alphanumeric PIC X/A items always occupy their full
  // declared storage width in COBOL - a MOVE of a shorter value space-pads
  // the rest - but this generator stores WORKING-STORAGE String fields
  // unpadded (see renderLiteralForTarget). Pad/truncate to the field's
  // declared width at DISPLAY time so output matches cobc's fixed-width
  // alphanumeric DISPLAY exactly without having to thread padding through
  // every MOVE/STRING/UNSTRING assignment. Numeric-edited fields already
  // hold their final, fully-formatted, correct-width string (formatted at
  // MOVE time - see formatEditedPicture) so they're excluded here.
  if (info && info.dataType === 'alphanumeric' && info.scalaType === 'String' && info.picLength > 0) {
    return `(${expr}).padTo(${info.picLength}, ' ').take(${info.picLength})`;
  }
  return expr;
}

/**
 * Generate DISPLAY statement. `WITH NO ADVANCING` (parsed into
 * `statement.noAdvancing` by parser/procedure-parser.js's
 * parseDisplayStatement) suppresses the trailing newline a plain DISPLAY
 * always emits - two DISPLAYs, the first WITH NO ADVANCING, print onto the
 * *same* physical output line (round-5 finding 3's s11 repro chains two such
 * DISPLAYs). Previously always emitted `println(...)`, ignoring the flag
 * entirely - `print(...)` (no trailing newline) is used instead when set.
 */
function generateDisplay(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  // AST uses 'values' not 'items'
  const values = statement.values || statement.items || [];

  const items = values.map(item => {
    if (typeof item === 'string') {
      if (item.startsWith('"') || item.startsWith("'")) {
        return item.replace(/'/g, '"');
      }
      return convertIdentifier(item);
    }
    // Handle Literal objects
    if (item.type === 'Literal') {
      if (item.literalType === 'string') {
        return `"${(item.value || '').replace(/"/g, '\\"')}"`;
      }
      return item.value;
    }
    // Handle VariableReference objects (pass the whole node, not just
    // item.name, so subscripts are preserved - see convertIdentifier)
    if (item.type === 'VariableReference') {
      return renderDisplayOperand(item);
    }
    // round-17 finding 2: DISPLAY of a bare `FUNCTION LENGTH(identifier
    // (start:length))` result (no intervening MOVE) needs cobc's own
    // 10-digit zero-padded runtime-intrinsic-result DISPLAY format
    // (verified against installed GnuCOBOL - a ref-mod'd argument, unlike a
    // plain identifier/literal argument, isn't folded to a compile-time
    // constant, so its DISPLAY goes through the general numeric-intrinsic-
    // result format instead of an unpadded literal) - functionLength()
    // itself returns a bare numeric literal (shared with MOVE/arithmetic
    // contexts, which need a plain value, not pre-formatted text), so that
    // formatting is applied here, at the one call site that actually
    // DISPLAYs the raw FUNCTION LENGTH result directly.
    if (item.type === 'FunctionCall') {
      const fnName = String(item.name || '').toUpperCase();
      if (fnName === 'LENGTH' || fnName === 'LENGTH-OF') {
        const arg0 = (item.arguments || [])[0];
        if (arg0 && arg0.type === 'VariableReference' && arg0.refMod) {
          const literalLength = refModLiteralLengthText(arg0.refMod.length);
          if (literalLength != null) {
            return `CobolFmt.num(BigDecimal(${literalLength}), 10, 0, false, false)`;
          }
        }
      }
    }
    return convertArithmeticExpression(item);
  });

  const printFn = statement.noAdvancing ? 'print' : 'println';

  if (items.length === 0) {
    return statement.noAdvancing ? `${indentStr}()` : `${indentStr}println()`;
  }

  return `${indentStr}${printFn}(${items.join(' + ')})`;
}

/**
 * Coerce ACCEPT's raw (always textual/digit-string) source expression to the
 * target field's own declared Scala type/width, exactly like any other MOVE
 * source would be (round-5 finding 5): a numeric target gets an actual
 * numeric value (`CobolFmt.truncNumeric(BigDecimal(...), ...)`, coerced to
 * the target's own Scala numeric type), a numeric-edited target is PICTURE-
 * formatted, and a plain alphanumeric target is fitted to its declared
 * width - never a bare, untyped, unwidthed string. Falls back to the raw
 * expression unchanged when the target has no registry entry at all (no
 * worse than the pre-fix behavior for that case).
 */
function coerceAcceptValue(rawExpr, info) {
  if (!info) return rawExpr;
  if (info.dataType === 'edited' && info.editPattern) {
    return `CobolFmt.edited("${escapeScalaStringLiteral(info.editPattern)}", ${rawExpr}, ${info.blankWhenZero ? 'true' : 'false'}, ${DECIMAL_POINT_IS_COMMA})`;
  }
  if (info.scalaType === 'String') {
    return fitAlphanumericExpr(rawExpr, info.picLength, info.justified);
  }
  const intDigits = info.integerDigits > 0 ? info.integerDigits : 18;
  const decDigits = info.decimalDigits || 0;
  const truncated = `CobolFmt.truncNumeric(BigDecimal(${rawExpr}), ${intDigits}, ${decDigits})`;
  if (info.scalaType === 'BigDecimal') return truncated;
  if (info.scalaType === 'Long') return `${truncated}.toLong`;
  return `${truncated}.toInt`;
}

/**
 * Generate ACCEPT statement. Previously always declared a brand-new `val
 * <target> = ...` - a local shadowing binding, not an assignment to the
 * target's actual registered flat var at all (round-5 finding 5): every
 * later reference to the target elsewhere in the program still read the
 * *original* (default-initialized, or previously MOVEd-into) value, and a
 * numeric target was left holding raw, untyped date/time text instead of an
 * actual number. Now resolves and assigns through the same
 * renderAssignment/field-registry path any other statement uses, with
 * coerceAcceptValue applying the same numeric/edited/alphanumeric coercion
 * an ordinary MOVE source would get.
 */
function generateAccept(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const targetRef = statement.target;
  const info = lookupFieldForRef(targetRef);

  let rawExpr;
  if (statement.from === 'DATE') {
    rawExpr = 'java.time.LocalDate.now.format(java.time.format.DateTimeFormatter.ofPattern("yyMMdd"))';
  } else if (statement.from === 'TIME') {
    rawExpr = 'java.time.LocalTime.now.format(java.time.format.DateTimeFormatter.ofPattern("HHmmss"))';
  } else if (statement.from === 'DAY') {
    rawExpr = 'java.time.LocalDate.now.getDayOfYear.toString';
  } else if (statement.from === 'DAY-OF-WEEK') {
    // ISO day-of-week (1=Monday..7=Sunday) - matches GnuCOBOL's own
    // ACCEPT FROM DAY-OF-WEEK numbering (verified against installed
    // GnuCOBOL - see tests/corpus/proc/s08-day-of-week-deterministic.cbl,
    // which range-checks 1-7 rather than asserting a specific day, since the
    // actual value is inherently a function of "today").
    rawExpr = 'java.time.LocalDate.now.getDayOfWeek.getValue.toString';
  } else {
    rawExpr = 'scala.io.StdIn.readLine()';
  }

  return `${indentStr}${renderAssignment(targetRef, coerceAcceptValue(rawExpr, info))}`;
}

/**
 * Generate SEARCH (linear) statement: iterate the OCCURS table's index from
 * whatever value a prior SET left it at (COBOL requires SET before SEARCH
 * unless AT END never needs to trigger; this generator does not itself
 * reset the index), testing each WHEN condition in turn at the current
 * index position - the first WHEN whose condition holds wins (its
 * statements run, and the index is left exactly where it matched, per
 * COBOL); if no WHEN matches at the current position, the index advances by
 * one and the next position is tried; running off the end of the table
 * (index > OCCURS count) without a match executes the AT END imperative.
 * Wrapped in its own `{ }` block so the local `_searchDone` flag doesn't
 * collide with a second SEARCH statement later in the same paragraph.
 */
function generateSearch(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const tableName = statement.target?.name || statement.target;
  const tinfo = lookupTable(tableName);

  if (!tinfo || tinfo.indexed.length === 0) {
    return `${indentStr}() // SEARCH ${tableName}: no OCCURS/INDEXED BY metadata found for this table`;
  }

  if (statement.searchAll) {
    return generateSearchAll(statement, indent, tinfo);
  }

  // SEARCH ... VARYING identifier-2 (IBM/GnuCOBOL '85 rules, verified against
  // installed GnuCOBOL - see tests/corpus/proc/r01-search-midtable-varying.cbl):
  // identifier-2 - NOT the table's own default (leftmost-declared) index -
  // becomes the SOLE loop-control variable for this SEARCH. It is not
  // resynced to the default index's (or anything else's) value at all - it
  // keeps whatever value it already had going in - and it alone is bounds-
  // checked/incremented on every iteration; the table's default index is left
  // completely untouched by the SEARCH machinery itself (only a WHEN/AT END
  // clause that happens to reference it directly would see its old, unmoved
  // value). Confirmed empirically: `SEARCH tbl VARYING idx2` with a WHEN
  // clause testing the *default* index never advances that index at all, and
  // starting idx2 out of bounds (as if never SET) fires AT END immediately
  // without ever evaluating a WHEN.
  const idxVar = statement.varying
    ? toCamelCase(statement.varying.name || statement.varying)
    : tinfo.indexed[0];
  // round-16 finding 5: a table declared OCCURS ... DEPENDING ON must be
  // searched only up to the depending-on counter's CURRENT runtime value,
  // not the table's fixed declared maximum (`tinfo.times`) - real cobc's
  // SEARCH stops at the live count exactly like FUNCTION LENGTH/an ordinary
  // whole-table DISPLAY already do elsewhere in this generator (see
  // buildFieldRegistry's own `dependingOn` registration, threaded into
  // `tinfo.dependingOn` as the counter's own camelCase flat-var name, null
  // for a fixed-size OCCURS table - a no-op for every non-ODO SEARCH).
  // Verified against installed GnuCOBOL (e13): `WS-ROW OCCURS 1 TO 5 TIMES
  // DEPENDING ON WS-COUNT` with WS-COUNT = 3 does not find a row placed at
  // index 4 (`R-CODE(4) = "DD"`) even though the fixed-max storage already
  // holds that row's data - SEARCH must not see past the live count.
  const bound = tinfo.dependingOn || String(tinfo.times);
  const bi = '  '.repeat(indent + 1);
  const wi = '  '.repeat(indent + 2);
  const si = '  '.repeat(indent + 3);

  const lines = [`${indentStr}{`];
  lines.push(`${bi}var _searchDone = false`);
  lines.push(`${bi}while !_searchDone && ${idxVar} <= ${bound} do`);

  const whenClauses = statement.whenClauses || [];
  whenClauses.forEach((when, i) => {
    const cond = convertCondition(when.condition);
    lines.push(`${wi}${i === 0 ? 'if' : 'else if'} (${cond}) then`);
    const body = when.statements && when.statements.length > 0
      ? when.statements.map(s => generateExpression(s, indent + 3)).join('\n')
      : `${si}()`;
    lines.push(body);
    lines.push(`${si}_searchDone = true`);
  });
  lines.push(`${wi}else`);
  lines.push(`${si}${idxVar} = ${idxVar} + 1`);

  lines.push(`${bi}if !_searchDone then`);
  const atEnd = statement.atEnd || [];
  lines.push(
    atEnd.length > 0
      ? atEnd.map(s => generateExpression(s, indent + 2)).join('\n')
      : `${wi}()`
  );
  lines.push(`${indentStr}}`);

  return lines.join('\n');
}

/**
 * Flatten a SEARCH ALL WHEN condition's top-level AND-chain into its
 * individual conjuncts (round-11 finding 2). COBOL's SEARCH ALL WHEN phrase
 * is defined as one or more AND-ed tests; recurses through nested compound
 * AND nodes only (any other node - a bare RelationalCondition, an OR, a NOT,
 * ...) is returned as a single opaque leaf, never decomposed further. Order
 * is preserved left-to-right so key-equality extraction below can match the
 * table's own declared key ordering deterministically when a field name
 * appears more than once.
 */
function flattenAndChain(condition) {
  if (!condition) return [];
  if (condition.type === 'Condition' && condition.conditionType === 'compound' && String(condition.operator).toUpperCase() === 'AND') {
    return [...flattenAndChain(condition.left), ...flattenAndChain(condition.right)];
  }
  return [condition];
}

/**
 * From a WHEN clause's flattened AND-chain (`leaves`), pick out the
 * contiguous *prefix* of the table's declared composite key
 * (`declaredKeysUpper`, in ASCENDING/DESCENDING declaration order) that has
 * a `<key>(<index>) = <value>` equality conjunct - round-11 finding 2. A
 * multi-key SEARCH ALL (`ASCENDING KEY IS WS-K1 WS-K2`) must be driven by
 * the FULL composite key it was declared with, in that order, not just the
 * first key: the old single-key findKeyEquality() silently discarded every
 * conjunct past the first, so a WHEN testing `WS-K1(x) = 20 AND WS-K2(x) =
 * 9` (no such row - only (20,1) and (20,2) exist) matched purely on
 * WS-K1 = 20 and returned whichever of those two rows binary search landed
 * on, a wrong match where cobc reports "not found" (verified against
 * installed GnuCOBOL's y12 oracle: FOUND3=NONE).
 *
 * Stops at the first declared key with no equality conjunct (a legitimate
 * COBOL usage - SEARCH ALL may test just a leading prefix of a composite
 * key, since the table is primarily ordered by that prefix). Returns
 * `{ prefixKeys, residualLeaves }` where `prefixKeys` is the (possibly
 * shorter-than-declared) ordered list of `{ nameUpper, camel, targetExpr }`
 * consumed this way, and `residualLeaves` is every other conjunct (an
 * un-consumed trailing key, or any non-key test entirely) that must still be
 * re-verified once the composite key narrows to a candidate index (see
 * generateSearchAll's use of it) rather than silently ignored. `prefixKeys`
 * is empty when even the FIRST declared key has no equality conjunct -
 * callers treat that as "cannot be decomposed to a key-prefix equality set"
 * and fall back to a linear scan.
 */
function extractKeyPrefix(leaves, declaredKeysUpper) {
  const eqByKey = new Map();
  for (const leaf of leaves) {
    if (
      leaf &&
      leaf.type === 'RelationalCondition' &&
      leaf.relationalOperator === '=' &&
      leaf.subject &&
      !eqByKey.has(String(leaf.subject.name).toUpperCase())
    ) {
      const nm = String(leaf.subject.name).toUpperCase();
      if (declaredKeysUpper.includes(nm)) eqByKey.set(nm, leaf);
    }
  }

  const prefixKeys = [];
  const consumed = new Set();
  for (const k of declaredKeysUpper) {
    const leaf = eqByKey.get(k);
    if (!leaf) break;
    // round-17 finding 7: carry the key reference's own subscript list
    // (e.g. `WS-CELL-KEY(IDX1, IDX2, IDX3)` for a 3-deep nested OCCURS
    // table) through to generateSearchAll - a 1- or 2-dimension table's key
    // field needs 0 or 1 OUTER (fixed) subscript threaded alongside the
    // binary search's own driven index; a 3+-dimension table needs every
    // subscript BUT the innermost (see generateSearchAll's own
    // outerKeySubscriptChain use of this).
    const subscripts = Array.isArray(leaf.subject.subscripts) ? leaf.subject.subscripts : [];
    prefixKeys.push({ nameUpper: k, camel: toCamelCase(k), targetExpr: convertArithmeticExpression(leaf.object), subscripts });
    consumed.add(leaf);
  }
  const residualLeaves = leaves.filter(l => !consumed.has(l));
  return { prefixKeys, residualLeaves };
}

/**
 * Scala expression for the `_hi = idx - 1` ("narrow to the lower half")
 * branch of the composite-key binary search - the direct multi-key
 * generalization of the pre-existing single-key ternary
 * (`isDescending ? _key < target : _key > target`), lexicographically
 * ("dictionary order") tuple-comparing the current candidate index's
 * composite key (`_key0, _key1, ...`, one per `prefixKeys` entry, already
 * bound by generateSearchAll) against the searched-for composite target:
 * the first key decides unless the two are equal, in which case the next
 * key breaks the tie, and so on. Applies only per the table's own single
 * declared direction (`isDescending` - this generator only models a table
 * whose *entire* declared key list shares one direction, ASCENDING or
 * DESCENDING, matching the pre-existing single-key isDescending convention;
 * see tinfo.ascending/tinfo.descending) - true for an ASCENDING table
 * exactly when the current composite key sorts AFTER the target (so the
 * target, if present, must be at a lower index), the mirror-image sense for
 * DESCENDING.
 *
 * NOTE: this is deliberately NOT a generic "current < target" comparison -
 * an earlier draft of this function built exactly that (reusing the
 * single-key ascending-case comparator character for every recursion level
 * regardless of which binary-search branch it fed), which silently inverted
 * the search direction the moment a second key was compared and made every
 * multi-key SEARCH ALL that reached this branch return the wrong entry (or
 * none at all) - caught by re-running the isolated y12 repro after the
 * initial implementation, not assumed correct from the code shape alone.
 */
/**
 * round-17 finding 7: the OUTER (fixed) subscript chain a SEARCH ALL key
 * field needs before its own innermost, search-driven index - e.g. a
 * 3-deep nested OCCURS table's key reference `WS-CELL-KEY(IDX1, IDX2,
 * IDX3)` needs `(idx1)(idx2)` prepended before the binary search's own
 * `(<idxVar> - 1)` subscript (IDX3, the innermost/searched dimension, is
 * never read from `pk.subscripts` at all - the search loop drives that
 * position itself, exactly like the pre-existing single-dimension code
 * already did by hardcoding `${idxVar} - 1` with no subscript chain in
 * front of it). A 1-dimension table's key has exactly one subscript in
 * `pk.subscripts` (the innermost/only one) so `subscripts.slice(0, -1)` is
 * empty and this returns `''` - a pure no-op, byte-for-byte the same
 * output as before this fix for every 1-dimension SEARCH ALL table (every
 * pre-round-17 corpus program). A 2-dimension table needs exactly one
 * outer subscript, 3-dimension needs two, and so on - this generalizes to
 * any nesting depth, not just 1-2 levels.
 */
function outerKeySubscriptChain(pk) {
  const outer = Array.isArray(pk.subscripts) ? pk.subscripts.slice(0, -1) : [];
  return outer.map(s => `(${subscriptIndexExpr(s)})`).join('');
}

function compositeShouldNarrowLowerExpr(prefixKeys, isDescending, i = 0) {
  const cmp = isDescending ? '<' : '>';
  const keyVar = `_key${i}`;
  const target = `(${prefixKeys[i].targetExpr})`;
  if (i === prefixKeys.length - 1) return `${keyVar} ${cmp} ${target}`;
  return `(${keyVar} ${cmp} ${target}) || (${keyVar} == ${target} && ${compositeShouldNarrowLowerExpr(prefixKeys, isDescending, i + 1)})`;
}

/**
 * Generate SEARCH ALL (binary search). The COBOL standard requires a SEARCH
 * ALL's WHEN condition to test the table's declared ASCENDING/DESCENDING
 * KEY(s) with equality, and requires the table's contents to already be in
 * that key order - i.e. any conforming SEARCH ALL WHEN clause has exactly
 * the shape a real binary search can be driven from directly, which is what
 * extractKeyPrefix() detects (round-11 finding 2 - extended from a
 * single-key-only extraction to the table's FULL declared composite key,
 * see extractKeyPrefix's own doc comment for why single-key extraction was
 * an outright wrong-match bug, not just an incompleteness). When present,
 * this generates a genuine O(log n) binary search that narrows on the
 * extracted composite key (compared in declared key order via
 * compositeLessThanExpr) vs. the extracted target-value expressions, with
 * any residual (non-key, or trailing-key-without-equality) WHEN conjunct
 * re-verified at the narrowed candidate index before declaring a match -
 * an exact composite-key match can only occur at one table position (the
 * table is sorted uniquely by that key), so a residual-conjunct failure at
 * that position means "not found" outright, not "keep narrowing".
 *
 * If the WHEN clause doesn't have that shape (multiple WHEN clauses, or not
 * even the table's first declared key has an equality conjunct), a linear
 * scan over the whole table is generated instead, honestly noted as such: it
 * still reproduces cobc's observable stdout for a single-match search (the
 * table is - by the same SEARCH ALL precondition - already sorted per its
 * declared key, so the same entry that would satisfy a real binary search
 * also satisfies a left-to-right scan of the same WHEN condition); only the
 * O(log n) vs O(n) performance characteristic differs, which no
 * stdout-based oracle comparison can observe.
 */
function generateSearchAll(statement, indent, tinfo) {
  const indentStr = '  '.repeat(indent);
  const bi = '  '.repeat(indent + 1);
  const wi = '  '.repeat(indent + 2);
  const si = '  '.repeat(indent + 3);
  const idxVar = tinfo.indexed[0];
  // round-16 finding 5: same ODO-awareness as generateSearch above - a
  // SEARCH ALL over an OCCURS ... DEPENDING ON table must bound both its
  // binary-search range and its linear-scan fallback by the depending-on
  // counter's live value, not the fixed declared maximum.
  const times = tinfo.dependingOn || String(tinfo.times);
  const isDescending = tinfo.ascending.length === 0 && tinfo.descending.length > 0;
  const declaredKeysUpper = (tinfo.ascending.length > 0 ? tinfo.ascending : tinfo.descending).map(k => String(k).toUpperCase());

  const whenClauses = statement.whenClauses || [];
  const singleWhen = whenClauses.length === 1 ? whenClauses[0] : null;
  const { prefixKeys, residualLeaves } = singleWhen && declaredKeysUpper.length > 0
    ? extractKeyPrefix(flattenAndChain(singleWhen.condition), declaredKeysUpper)
    : { prefixKeys: [], residualLeaves: [] };

  const lines = [`${indentStr}{`];
  const atEnd = statement.atEnd || [];
  const atEndLines = atEnd.length > 0 ? atEnd.map(s => generateExpression(s, indent + 2)).join('\n') : `${bi}()`;

  if (prefixKeys.length > 0) {
    lines.push(`${bi}var _lo = 1`);
    lines.push(`${bi}var _hi = ${times}`);
    lines.push(`${bi}var _searchDone = false`);
    lines.push(`${bi}while !_searchDone && _lo <= _hi do`);
    lines.push(`${wi}${idxVar} = (_lo + _hi) / 2`);
    prefixKeys.forEach((pk, i) => {
      lines.push(`${wi}val _key${i} = ${pk.camel}${outerKeySubscriptChain(pk)}(${idxVar} - 1)`);
    });
    const keyEqExpr = prefixKeys.map((pk, i) => `_key${i} == (${pk.targetExpr})`).join(' && ');
    lines.push(`${wi}if (${keyEqExpr}) then`);
    if (residualLeaves.length > 0) {
      // round-12 finding 2: extractKeyPrefix stops at the first declared key
      // with no equality conjunct, so `prefixKeys` can be a *strict* prefix
      // of the table's full declared composite key (a legitimate WHEN that
      // tests a leading key plus a later one but skips a middle key, e.g.
      // `WS-K1(x) = 10 AND WS-K3(x) = 9` against `ASCENDING KEY WS-K1 WS-K2
      // WS-K3`, with WS-K2 left in `residualLeaves`). The table is only
      // guaranteed sorted (and therefore unique) by its FULL declared key -
      // multiple rows can tie on a mere prefix - so the round-11 assumption
      // this replaces ("a residual failure at the landed row means outright
      // not-found") was wrong: verified against installed GnuCOBOL
      // (searchall-skipmiddle-check.cbl/z-corpus skipmiddle probe), which
      // finds the correct tied row (K1=10,K2=2,K3=9) even though the binary
      // search's own midpoint calculation lands on a *different* K1=10 row
      // first. Fix: when the residual conjunct(s) fail at the landed index,
      // do not immediately declare "not found" - first linearly scan every
      // OTHER row tied with it on the extracted prefix key (contiguous,
      // since the table is sorted by a key that starts with that same
      // prefix) for one that satisfies every conjunct (prefix equality AND
      // residual), in ascending table order. Only once that whole tied range
      // is exhausted with no match is the search conclusively "not found".
      const residualExpr = residualLeaves.map(l => `(${convertCondition(l)})`).join(' && ');
      const ti = '  '.repeat(indent + 4);
      const tbi = '  '.repeat(indent + 5);
      const tieBody = singleWhen.statements && singleWhen.statements.length > 0
        ? singleWhen.statements.map(s => generateExpression(s, indent + 5)).join('\n')
        : `${'  '.repeat(indent + 5)}()`;
      const tieLeftExpr = prefixKeys.map((pk, i) => `${pk.camel}${outerKeySubscriptChain(pk)}(_tieLo - 2) == _key${i}`).join(' && ');
      const tieRightExpr = prefixKeys.map((pk, i) => `${pk.camel}${outerKeySubscriptChain(pk)}(_tieHi) == _key${i}`).join(' && ');
      lines.push(`${si}var _tieLo = ${idxVar}`);
      lines.push(`${si}while _tieLo > 1 && (${tieLeftExpr}) do _tieLo -= 1`);
      lines.push(`${si}var _tieHi = ${idxVar}`);
      lines.push(`${si}while _tieHi < ${times} && (${tieRightExpr}) do _tieHi += 1`);
      lines.push(`${si}var _tieIdx = _tieLo`);
      lines.push(`${si}var _tieFound = false`);
      lines.push(`${si}while !_tieFound && _tieIdx <= _tieHi do`);
      lines.push(`${ti}${idxVar} = _tieIdx`);
      lines.push(`${ti}if (${residualExpr}) then`);
      lines.push(tieBody);
      lines.push(`${tbi}_tieFound = true`);
      lines.push(`${ti}_tieIdx = _tieIdx + 1`);
      lines.push(`${si}if _tieFound then`);
      lines.push(`${ti}_searchDone = true`);
      lines.push(`${si}else`);
      lines.push(`${ti}_lo = _hi + 1`);
    } else {
      const body = singleWhen.statements && singleWhen.statements.length > 0
        ? singleWhen.statements.map(s => generateExpression(s, indent + 3)).join('\n')
        : `${'  '.repeat(indent + 3)}()`;
      lines.push(body);
      lines.push(`${si}_searchDone = true`);
    }
    lines.push(`${wi}else if (${compositeShouldNarrowLowerExpr(prefixKeys, isDescending)}) then`);
    lines.push(`${si}_hi = ${idxVar} - 1`);
    lines.push(`${wi}else`);
    lines.push(`${si}_lo = ${idxVar} + 1`);
    lines.push(`${bi}if !_searchDone then`);
    lines.push(atEndLines);
  } else {
    lines.push(`${bi}// SEARCH ALL fallback: linear scan - the WHEN clause here isn't a single`);
    lines.push(`${bi}// key-equality test this generator can drive a binary search from directly`);
    lines.push(`${bi}// (see extractKeyPrefix's doc comment); result is identical, only the`);
    lines.push(`${bi}// O(log n) vs O(n) search-order difference is invisible to stdout.`);
    lines.push(`${bi}${idxVar} = 1`);
    lines.push(`${bi}var _searchDone = false`);
    lines.push(`${bi}while !_searchDone && ${idxVar} <= ${times} do`);
    whenClauses.forEach((when, i) => {
      const cond = convertCondition(when.condition);
      lines.push(`${wi}${i === 0 ? 'if' : 'else if'} (${cond}) then`);
      const body = when.statements && when.statements.length > 0
        ? when.statements.map(s => generateExpression(s, indent + 3)).join('\n')
        : `${si}()`;
      lines.push(body);
      lines.push(`${si}_searchDone = true`);
    });
    lines.push(`${wi}else`);
    lines.push(`${si}${idxVar} = ${idxVar} + 1`);
    lines.push(`${bi}if !_searchDone then`);
    lines.push(atEndLines);
  }

  lines.push(`${indentStr}}`);
  return lines.join('\n');
}

/**
 * Scala call expression for a SORT/MERGE INPUT/OUTPUT PROCEDURE clause
 * (parser/ast.js shape: `{ procedure, through }`), reusing the exact same
 * paragraph/THRU-range method-naming convention method-gen.js's
 * generateAllMethods/generatePerformThruMethod use for `PERFORM x THRU y`,
 * so the call always resolves to a generated method name.
 */
function procedureCallExpr(proc) {
  if (!proc || !proc.procedure) return '()';
  const fromName = paragraphMethodName(proc.procedure);
  if (proc.through) {
    const toStripped = String(proc.through).replace(/^\d+[-_]?/, '');
    return `${fromName}To${toPascalCase(toStripped)}()`;
  }
  return `${fromName}()`;
}

/** Flatten a SORT/MERGE `keys` clause list into `{ camel, order }` entries. */
function flattenSortKeys(keys) {
  const flat = [];
  for (const group of keys || []) {
    for (const f of group.fields || []) {
      flat.push({ camel: toCamelCase(f.name || f), order: group.order || 'ASCENDING' });
    }
  }
  return flat;
}

/**
 * Generate SORT statement. Models the SD work file as an in-memory buffer
 * (see scala-generator.js's buildSortFileRegistry/generateSortFileSupport):
 * clear it, run the INPUT PROCEDURE (which RELEASEs rows into it), sort the
 * buffer in place by the declared key(s), reset the read cursor, then run
 * the OUTPUT PROCEDURE (which RETURNs rows back out of it in sorted order).
 */
function generateSort(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const info = lookupSortFile(statement.fileName);
  if (!info) {
    return `${indentStr}() // SORT ${statement.fileName}: no matching SD record found - cannot generate a sort buffer`;
  }

  const lines = [];
  lines.push(`${indentStr}${info.bufferVar}.clear()`);

  if (statement.inputProcedure) {
    lines.push(`${indentStr}${procedureCallExpr(statement.inputProcedure)}`);
  } else if (statement.using && statement.using.length > 0) {
    lines.push(`${indentStr}() // TODO: SORT ... USING ${statement.using.join(', ')} not yet supported (no corpus target exercises it; only INPUT PROCEDURE is implemented)`);
  }

  lines.push(sortCascadeLines(statement.fileName, info.bufferVar, flattenSortKeys(statement.keys), indentStr));

  lines.push(`${indentStr}${info.idxVar} = 0`);

  if (statement.outputProcedure) {
    lines.push(`${indentStr}${procedureCallExpr(statement.outputProcedure)}`);
  } else if (statement.giving && statement.giving.length > 0) {
    lines.push(`${indentStr}() // TODO: SORT ... GIVING ${statement.giving.join(', ')} not yet supported (no corpus target exercises it; only OUTPUT PROCEDURE is implemented)`);
  }

  return lines.join('\n');
}

/**
 * The key-ordering cascade shared by SORT and MERGE (round-18 finding 2:
 * MERGE previously had no codegen support at all - see generateMerge's own
 * doc comment below): true multi-key ordering with per-key ASCENDING/
 * DESCENDING, evaluated as a tie-breaking cascade (first key decides unless
 * equal, then the next key, ...) via sortInPlaceWith rather than
 * sortInPlaceBy building one shared tuple Ordering - a single shared
 * Ordering can't flip direction per-component for a mixed ASCENDING/
 * DESCENDING key list (an approximation that only reverses the *whole*
 * comparison is only correct when every key shares the same direction).
 * ArrayBuffer's sort is stable either way (verified), so ties preserve
 * RELEASE/append order.
 *
 * `fileNameForComment` is only used in the "no key found" fallback comment
 * (SORT's own file name, or MERGE's) - purely cosmetic, never affects
 * behavior.
 */
function sortCascadeLines(fileNameForComment, bufferVar, flat, indentStr) {
  if (flat.length === 0) {
    return `${indentStr}() // SORT/MERGE ${fileNameForComment}: no ASCENDING/DESCENDING KEY found - buffer left in append order`;
  }
  const bi = `${indentStr}  `;
  const cmpLines = [`${indentStr}${bufferVar}.sortInPlaceWith { (a, b) =>`];
  flat.forEach((k, i) => {
    const op = k.order === 'DESCENDING' ? '>' : '<';
    const kw = i === 0 ? 'if' : 'else if';
    cmpLines.push(`${bi}${kw} a.${k.camel} != b.${k.camel} then a.${k.camel} ${op} b.${k.camel}`);
  });
  cmpLines.push(`${bi}else false`);
  cmpLines.push(`${indentStr}}`);
  return cmpLines.join('\n');
}

/**
 * Generate MERGE statement.
 *
 * Round-18 finding 2: MERGE previously had NO generator support at all -
 * `generateExpression`'s statement-type switch had no 'MERGE' case, so a
 * `MergeStatement` node silently fell through to the generic default no-op
 * (`docs/CAPABILITY_AUDIT_AND_ROADMAP.md`'s claim that MERGE was oracle-
 * equivalent was simply never actually tested before this round).
 *
 * MERGE ... USING file1 file2 ... OUTPUT PROCEDURE reuses almost all of
 * SORT's own machinery (the SD work-file model: buildSortFileRegistry/
 * generateSortFileSupport's row case class + Vector buffer + read-cursor
 * var, and the same sortCascadeLines key-ordering cascade above) - the only
 * genuinely new piece is *filling* the buffer, since MERGE (unlike SORT) has
 * no INPUT PROCEDURE clause at all - every USING file is opened, read to
 * exhaustion, and closed by MERGE itself (real COBOL semantics: a MERGE
 * ... USING file requires that file to NOT already be open), each record
 * copied into the SD record's own fields BY POSITION (the same convention
 * RELEASE ... FROM already uses for a WORKING-STORAGE source), then appended
 * to the shared buffer exactly like RELEASE does.
 *
 * This is a real multi-way-merge-equivalent, not a mere approximation
 * disguised as one: real MERGE assumes every USING file is ALREADY sorted
 * (ascending/descending, per its own KEY clause) - concatenating every
 * file's records (each internally already in the declared key order) and
 * then applying one single STABLE sort by that same key produces exactly
 * the same final ordering a genuine k-way merge would, including tie-
 * breaking (a stable sort preserves each input file's own internal relative
 * order for equal keys, and preserves USING's own listed file order for an
 * equal key straddling two different files - matching a textbook merge's
 * left-to-right tie-break). Verified against installed GnuCOBOL (g12):
 * `MERGE MERGE-FILE ASCENDING KEY M-KEY USING IN-FILE-1 IN-FILE-2 OUTPUT
 * PROCEDURE IS EMIT-PARA` correctly interleaves IN-FILE-1's (010, 030) and
 * IN-FILE-2's (020, 040) into 010/020/030/040 order.
 */
function generateMerge(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const info = lookupSortFile(statement.fileName);
  if (!info) {
    return `${indentStr}() // MERGE ${statement.fileName}: no matching SD record found - cannot generate a merge buffer`;
  }

  const lines = [];
  lines.push(`${indentStr}${info.bufferVar}.clear()`);

  if (statement.using && statement.using.length > 0) {
    for (const fileRef of statement.using) {
      lines.push(generateMergeUsingFileLines(fileRef, info, indent));
    }
  } else {
    lines.push(`${indentStr}() // MERGE ${statement.fileName}: no USING files found - buffer left empty`);
  }

  lines.push(sortCascadeLines(statement.fileName, info.bufferVar, flattenSortKeys(statement.keys), indentStr));

  lines.push(`${indentStr}${info.idxVar} = 0`);

  if (statement.outputProcedure) {
    lines.push(`${indentStr}${procedureCallExpr(statement.outputProcedure)}`);
  } else if (statement.giving && statement.giving.length > 0) {
    lines.push(`${indentStr}() // TODO: MERGE ... GIVING ${statement.giving.join(', ')} not yet supported (no corpus target exercises it; only OUTPUT PROCEDURE is implemented)`);
  }

  return lines.join('\n');
}

/**
 * Lines to open one MERGE ... USING file for reading, WITHOUT reusing
 * generateOpen's own DECLARATIVES-dispatching codegen (see
 * generateMergeUsingFileLines's doc comment below for why) - just enough to
 * populate the same reader/iterator variables generateOpen's INPUT case
 * would, or leave the iterator empty on any I/O failure.
 */
function generateMergeUsingFileOpenLines(fileName, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const bi = `${indentStr}  `;
  const { fileVar, readerVar, iteratorVar } = fileHandleVarNames(fileName);

  const lines = [];
  lines.push(`${indentStr}try`);
  lines.push(`${bi}${fileVar} = new java.io.File(${toCamelCase(fileName)}Path)`);
  lines.push(`${bi}${readerVar} = scala.io.Source.fromFile(${fileVar})(scala.io.Codec.ISO8859)`);
  lines.push(`${bi}${iteratorVar} = ${readerVar}.getLines()`);
  lines.push(`${indentStr}catch`);
  lines.push(`${bi}case _: java.io.IOException =>`);
  lines.push(
    `${bi}  ${iteratorVar} = Iterator.empty // MERGE USING ${fileName}: missing/unreadable file ` +
    `silently contributes zero records - no FILE STATUS update, no DECLARATIVES handler (round-20 ` +
    `finding 2: real cobc never invokes a USE AFTER ERROR PROCEDURE for MERGE's own internal ` +
    `per-USING-file access, regardless of whether one is registered for this file name)`
  );
  return lines.join('\n');
}

/**
 * Lines to OPEN one MERGE ... USING file, drain every one of its records
 * into the shared SD merge buffer (positionally copied into the SD record's
 * own fields - see generateMerge's own doc comment above), then CLOSE it
 * again.
 *
 * round-20 finding 2: this used to reuse file-io-gen.js's generateOpen
 * verbatim for the open step - convenient (shares the exact FILE STATUS/
 * exception-mapping codegen an explicit OPEN statement gets), but WRONG: a
 * MERGE's own internal access to one of its USING files is not a COBOL
 * OPEN statement at all, so a registered `USE AFTER STANDARD ERROR
 * PROCEDURE ON <this-file>` DECLARATIVES handler must NEVER be invoked for
 * it - confirmed against installed GnuCOBOL (i06): a MERGE USING file that
 * does not exist on disk silently contributes zero records (no error, no
 * handler call, the other USING file(s) still merge normally), even though
 * the very same program registers and successfully invokes that same
 * handler for an ordinary explicit OPEN of a different file elsewhere.
 * `generateMergeUsingFileOpenLines` (above) is the file-not-found-tolerant,
 * handler-free replacement for just the open step; everything downstream
 * (readDestination/readAssignLines for the per-line decode, positionalPairs/
 * coerceCorrespondingValue for the position-matched copy RELEASE ... FROM
 * already uses, generateClose for the close - already null-guarded, so it's
 * a harmless no-op when the open above failed and left the reader null) is
 * unchanged.
 */
function generateMergeUsingFileLines(fileRef, sortInfo, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = typeof fileRef === 'string' ? fileRef : (fileRef?.name || fileRef?.fileName || String(fileRef || ''));
  const fileNameUpper = String(fileName).toUpperCase();
  const { iteratorVar } = fileHandleVarNames(fileName);

  const dest = readDestination({ into: null }, fileName);
  const recordNameUpper = String(FILE_RECORD_REGISTRY.get(fileNameUpper) || '').toUpperCase();
  const sdGroupKey = resolveGroupKey(String(sortInfo.recordNameUpper || '').toUpperCase());
  const pairs = recordNameUpper ? positionalPairs(resolveGroupKey(recordNameUpper), sdGroupKey) : [];

  const lines = [];
  lines.push(generateMergeUsingFileOpenLines(fileName, indent));
  lines.push(`${indentStr}while ${iteratorVar}.hasNext do`);
  const bi = `${indentStr}  `;
  lines.push(`${bi}val _mergeLine = ${iteratorVar}.next()`);
  lines.push(...readAssignLines(dest, '_mergeLine', bi));
  if (pairs.length > 0) {
    for (const pair of pairs) {
      lines.push(`${bi}${pair.targetCamel} = ${coerceCorrespondingValue(pair)}`);
    }
  } else if (dest.mode === 'elementary' && dest.camel && sdGroupKey && GROUP_REGISTRY.has(sdGroupKey)) {
    // round-19 finding 1: a USING file's FD record that is FLAT/ELEMENTARY
    // (no named children of its own - e.g. `01 IN-REC-1 PIC X(6)`, the
    // ordinary "raw line" FD shape) has no entry in GROUP_REGISTRY at all
    // (that registry only ever holds GROUP items), so positionalPairs -
    // which only walks GROUP_REGISTRY children on both sides - always
    // returned an EMPTY pair list for this shape. The merged record then
    // silently kept the SD record's stale/default field values (never
    // actually assigned from the USING file at all), even though the
    // read/sort/emit ORDERING was already correct - a silent data-loss bug,
    // not a crash. Real cobc treats a flat FD record moved onto a group SD
    // record exactly like any other elementary-source-into-group-target
    // whole-record MOVE: the source's raw text is sliced across the
    // target's own children BY POSITION/WIDTH - the SAME convention
    // generateScalarIntoGroupMove/scatterGroupFromString already implement
    // for MOVE (round-13 finding 4) and generateCall/generateEntryMethod
    // already implement for a group CALL BY REFERENCE operand.
    // readAssignLines (just above) already fitted `dest.camel` to the FD
    // record's own declared width via CobolFmt.fitLeft, so it's already the
    // correctly-sized raw text to scatter here with no further padding.
    const scattered = scatterGroupFromString(sdGroupKey, dest.camel, indent + 1);
    if (scattered) {
      lines.push(...scattered);
    } else {
      lines.push(`${bi}() // TODO: MERGE USING ${fileName}: could not scatter elementary FD record "${dest.camel}" into SD record "${sortInfo.recordNameUpper}" - unsupported child shape (see tests/oracle/README.md known gaps)`);
    }
  }
  const ctorArgs = sortInfo.fields.map(f => f.camel).join(', ');
  lines.push(`${bi}${sortInfo.bufferVar} += ${sortInfo.caseClassName}(${ctorArgs})`);
  lines.push(generateClose({ files: [fileName] }, indent));

  return lines.join('\n');
}

/**
 * Generate RELEASE statement: snapshot the SD record's current field values
 * (whatever was last MOVEd into them) as a new row appended to the sort
 * buffer. RELEASE ... FROM first performs the implicit structural MOVE of
 * the given source's fields into the SD record's fields, matched BY
 * POSITION (declared order) - see positionalPairs's doc comment for why
 * this is not name-matched like MOVE CORRESPONDING. The FROM source is
 * often itself a subscripted table element (`RELEASE rec FROM
 * tbl-entry(idx)`, the common "release one row of a WORKING-STORAGE table
 * into the sort file" idiom) - its subscript, if any, applies uniformly to
 * every sibling field (Vector.apply reads are valid directly, unlike a
 * subscripted *write* - see renderCamelAssignment - so no special handling
 * is needed on this read side beyond appending the same suffix to each).
 */
function generateRelease(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const info = lookupSortFile(statement.recordName);
  if (!info) {
    return `${indentStr}() // RELEASE ${statement.recordName}: no matching SD record found`;
  }

  const lines = [];
  if (statement.from) {
    const fromUpper = String(statement.from.name || statement.from || '').toUpperCase();
    const recordUpper = String(statement.recordName || '').toUpperCase();
    const fromSuffix = subscriptSuffixExpr(statement.from.subscripts);
    const pairs = positionalPairs(resolveGroupKey(fromUpper), resolveGroupKey(recordUpper));
    for (const pair of pairs) {
      const sourceExpr = coerceCorrespondingValue({ ...pair, sourceCamel: `${pair.sourceCamel}${fromSuffix}` });
      lines.push(`${indentStr}${pair.targetCamel} = ${sourceExpr}`);
    }
  }

  const ctorArgs = info.fields.map(f => f.camel).join(', ');
  lines.push(`${indentStr}${info.bufferVar} += ${info.caseClassName}(${ctorArgs})`);
  return lines.join('\n');
}

/**
 * Generate RETURN statement: pop the next row (in sorted order, since SORT
 * already sorted the buffer before the OUTPUT PROCEDURE runs) off the sort
 * buffer into the SD record fields and run the NOT AT END statements, or run
 * the AT END statements once the buffer is exhausted.
 */
function generateReturn(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const info = lookupSortFile(statement.fileName);
  if (!info) {
    return `${indentStr}() // RETURN ${statement.fileName}: no matching SD record found`;
  }

  const bi = '  '.repeat(indent + 1);
  const lines = [`${indentStr}if ${info.idxVar} < ${info.bufferVar}.length then`];
  lines.push(`${bi}val _rec = ${info.bufferVar}(${info.idxVar})`);
  lines.push(`${bi}${info.idxVar} = ${info.idxVar} + 1`);
  for (const f of info.fields) {
    lines.push(`${bi}${f.camel} = _rec.${f.camel}`);
  }

  if (statement.into) {
    // RETURN ... INTO's implicit structural MOVE - the mirror image of
    // RELEASE ... FROM above (position-matched, not name-matched; see
    // positionalPairs). The INTO target is often itself a subscripted table
    // element (`RETURN sortfile INTO tbl-entry(idx)`) - unlike RELEASE's
    // subscripted *read* side, a subscripted *write* needs
    // renderCamelAssignment's `.updated(...)` rebuild (a Vector has no index
    // setter).
    const intoUpper = String(statement.into.name || statement.into || '').toUpperCase();
    const recordUpper = info.recordNameUpper || '';
    const intoSubscripts = statement.into.subscripts;
    const pairs = positionalPairs(resolveGroupKey(recordUpper), resolveGroupKey(intoUpper));
    for (const pair of pairs) {
      lines.push(`${bi}${renderCamelAssignment(pair.targetCamel, intoSubscripts, coerceCorrespondingValue(pair))}`);
    }
  }

  const notAtEnd = statement.notAtEnd || [];
  lines.push(notAtEnd.length > 0 ? notAtEnd.map(s => generateExpression(s, indent + 1)).join('\n') : `${bi}()`);

  lines.push(`${indentStr}else`);
  const atEnd = statement.atEnd || [];
  lines.push(atEnd.length > 0 ? atEnd.map(s => generateExpression(s, indent + 1)).join('\n') : `${bi}()`);

  return lines.join('\n');
}

/**
 * The read destination for READ ... INTO (or a plain READ with no INTO,
 * which implicitly loads the FD's own 01 record) - round-5 finding 1a/1b's
 * file-registry work applied to READ: an INTO target always wins when
 * present; otherwise the FD's own first record (looked up via
 * FILE_RECORD_REGISTRY, keyed by the file name the READ names) is the
 * implicit destination.
 *
 * Returns one of:
 *   - `{ mode: 'elementary', camel, width }` - the destination is a plain
 *     flat field with its own FIELD_REGISTRY entry (the pre-round-7 case,
 *     unchanged).
 *   - `{ mode: 'group', className, width, children }` - round-7 finding 8's
 *     companion fix (surfaced by promoting u12-batch-realistic.cbl, whose FD
 *     record SALES-REC is a group with no INTO clause): a group has no flat
 *     Scala var of its own to assign (see groupDisplayValueExpr's doc
 *     comment - only its children are real vars), so the whole record must
 *     decode into each named child instead. Reuses the same byte-level
 *     round-trip idiom generateGroupMove already established for MOVE
 *     CORRESPONDING between two groups: the group's own generated case class
 *     (case-class-gen.js) already has a `.parse(bytes)` that decodes each
 *     child via CobolCodecs.zonedDecode - for an unsigned field (the only
 *     kind this path supports, see the guard below) that decodes plain ASCII
 *     digit bytes with no overpunch, i.e. exactly the bytes
 *     CobolFmt.digitsOf/groupDisplayValueExpr produce when *writing* the
 *     same group (generateWriteStatement's WRITE path) - so parsing the
 *     line straight back through the case class round-trips correctly.
 *     `children` is `groupChildInfos(...)`'s list, pre-filtered to ones this
 *     path actually knows how to assign back.
 *   - `{ mode: 'unsupported', camel, width: 0 }` - resolved to *something*
 *     (a name) but not a shape this generator can safely assign into (e.g. a
 *     group containing a FILLER, a nested subgroup, or an OCCURS table -
 *     none of which participate in a plain `_parsed.<child>` assignment the
 *     way generateGroupMove's own guard already declines for the same
 *     reasons). generateReadStatement emits a visible TODO instead of a
 *     wrong or non-compiling assignment for this case.
 *   - `{ mode: 'none', camel: null, width: 0 }` - nothing could be resolved
 *     at all (matches the old `{ camel: null, width: 0 }` return exactly).
 */
function readDestination(statement, fileName) {
  const recordNameRaw = statement.into
    ? (statement.into.name || statement.into)
    : FILE_RECORD_REGISTRY.get(String(fileName || '').toUpperCase());
  if (!recordNameRaw) return { mode: 'none', camel: null, width: 0 };

  const info = statement.into ? lookupFieldForRef(statement.into) : lookupField(recordNameRaw);
  if (info) {
    return { mode: 'elementary', camel: toCamelCase(recordNameRaw), width: info.picLength || 0 };
  }

  const recordNameUpper = String(recordNameRaw).toUpperCase();
  if (GROUP_REGISTRY.has(recordNameUpper) && !AMBIGUOUS_GROUP_CLASS_NAMES.has(toPascalCase(recordNameUpper))) {
    const children = groupChildInfos(recordNameUpper);
    const usable = children.length > 0 && children.every(c => c.info && !c.isGroup && !c.isFiller && c.ccField);
    if (usable) {
      const lenRaw = GROUP_BYTE_LENGTH_REGISTRY.get(recordNameUpper);
      const width = lenRaw ? Number(lenRaw) : 0;
      return { mode: 'group', className: toPascalCase(recordNameUpper), width, children };
    }
  }

  return { mode: 'unsupported', camel: toCamelCase(recordNameRaw), width: 0 };
}

/**
 * Lines to assign a just-read text line (`lineExpr`, e.g. `_record`) into its
 * READ destination, at `indentStr` - shared by every branch of
 * generateReadStatement (AT END/NOT AT END, FILE-STATUS-only, and fully
 * unconditional) so the elementary/group/unsupported handling in
 * readDestination only has to be threaded through once. Returns `[]` (no
 * lines) for `mode: 'none'` - callers already treat "nothing to assign" as a
 * no-op the same way the old `if (destCamel)` guard did.
 */
function readAssignLines(dest, lineExpr, indentStr) {
  if (dest.mode === 'elementary') {
    const rhs = dest.width > 0 ? `CobolFmt.fitLeft(${lineExpr}, ${dest.width})` : lineExpr;
    return [`${indentStr}${dest.camel} = ${rhs}`];
  }
  if (dest.mode === 'group') {
    const fitted = dest.width > 0 ? `CobolFmt.fitLeft(${lineExpr}, ${dest.width})` : lineExpr;
    // round-10 finding 3 companion: explicit ISO-8859-1 (not the platform
    // default charset) so this matches the identity byte<->char mapping the
    // file's own reader now uses (generateOpen's INPUT case) - required for
    // a non-DISPLAY (COMP-3/binary) child's raw bytes to decode correctly;
    // a no-op for a plain-ASCII (DISPLAY-only) group, which is what every
    // existing corpus program exercising this path (e.g. u12) already is.
    const lines = [
      `${indentStr}val _parsed = ${dest.className}.parse((${fitted}).getBytes(java.nio.charset.StandardCharsets.ISO_8859_1))`,
    ];
    for (const c of dest.children) {
      lines.push(`${indentStr}${c.camel} = _parsed.${c.ccField}`);
    }
    return lines;
  }
  if (dest.mode === 'unsupported') {
    return [`${indentStr}() // TODO: READ into group record "${dest.camel}" with a FILLER/nested-group/OCCURS child is not supported (see tests/oracle/README.md known gaps); record left unchanged`];
  }
  return [];
}

/**
 * Generate READ statement wrapper
 */
function generateReadStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = statement.fileName || statement.file || 'file';
  const { iteratorVar } = fileHandleVarNames(fileName);
  const dest = readDestination(statement, fileName);
  // round-6 finding 2/3 companion (t04): a registered FILE STATUS field must
  // become "00" on a successful READ and "10" once the iterator is
  // exhausted - including for a *bare* READ with no AT END clause at all
  // (t04's own idiom, and the single most common real-world reason a
  // program declares FILE STATUS to begin with: detecting EOF without an
  // AT END clause). Absent (null) for a file with no FILE STATUS clause -
  // every branch below degrades to the exact pre-round-6 generated code in
  // that case, so this is a pure addition with zero effect on any program
  // that doesn't declare FILE STATUS.
  const statusVar = fileStatusVarFor(fileName);

  const lines = [];

  // round-7 finding 6 (MOST DANGEROUS): `options.atEnd`/`options.notAtEnd`
  // default to `[]` in ast.js's ReadStatement constructor, and `[] || x` is
  // truthy in JS - so the old `if (statement.atEnd || statement.notAtEnd)`
  // was *always* true, even for a bare `READ file.` with no AT END clause at
  // all. That routed every bare READ through the if/hasNext/else branch
  // below with BOTH branches empty (no real AT END/NOT AT END statements to
  // emit), which - because Scala 3 uses significant indentation - produces
  // an `else` with nothing indented under it. The statements that lexically
  // follow (the *next* COBOL statement after the READ) then render at the
  // same indent as that empty `else` and get silently absorbed as if they
  // were unconditional, when they were actually meant to be the NOT AT END
  // path. Checking `.length > 0` instead of bare truthiness routes a true
  // bare READ to the unconditional-read branch (`else` below) instead.
  const hasAtEnd = Array.isArray(statement.atEnd) && statement.atEnd.length > 0;
  const hasNotAtEnd = Array.isArray(statement.notAtEnd) && statement.notAtEnd.length > 0;

  if (hasAtEnd || hasNotAtEnd) {
    lines.push(`${indentStr}if ${iteratorVar}.hasNext then`);
    lines.push(`${indentStr}  val _record = ${iteratorVar}.next()`);

    lines.push(...readAssignLines(dest, '_record', `${indentStr}  `));
    if (statusVar) {
      lines.push(`${indentStr}  ${statusVar} = "00"`);
    }

    if (hasNotAtEnd) {
      for (const stmt of statement.notAtEnd) {
        lines.push(generateExpression(stmt, indent + 1));
      }
    }
    // (no `else ()` placeholder needed here: the `val _record = ...next()`
    // line above always makes this branch non-empty regardless.)

    lines.push(`${indentStr}else`);

    if (statusVar) {
      lines.push(`${indentStr}  ${statusVar} = "10"`);
    }

    if (hasAtEnd) {
      for (const stmt of statement.atEnd) {
        lines.push(generateExpression(stmt, indent + 1));
      }
    } else if (!statusVar) {
      // Neither a real AT END clause nor a FILE STATUS assignment - this
      // branch would otherwise be completely empty. Always emit the `()`
      // placeholder (not conditionally per some other flag) so the `else`
      // can never swallow a subsequent statement via indentation.
      lines.push(`${indentStr}  () // AT END`);
    }
  } else if (statusVar) {
    // Bare READ, no AT END clause, but FILE STATUS IS declared: FILE STATUS
    // is this program's ONLY way to detect end-of-file, so (unlike the
    // no-FILE-STATUS branch below, which can get away with silently
    // no-op-ing past EOF) this must branch on `.hasNext` explicitly.
    lines.push(`${indentStr}if ${iteratorVar}.hasNext then`);
    lines.push(`${indentStr}  val _record = ${iteratorVar}.next()`);
    lines.push(...readAssignLines(dest, '_record', `${indentStr}  `));
    lines.push(`${indentStr}  ${statusVar} = "00"`);
    lines.push(`${indentStr}else`);
    lines.push(`${indentStr}  ${statusVar} = "10"`);
    // round-10 finding 1: no AT END clause on this READ means nothing else
    // handles the end-of-file condition - a registered DECLARATIVES
    // handler for this file (or its INPUT mode generically) fires here,
    // exactly like an OPEN failure does (file-io-gen.js's generateOpen).
    const readHandler = declarativeHandlerFor(fileName, 'INPUT');
    if (readHandler) {
      lines.push(`${indentStr}  ${readHandler}()`);
    }
  } else {
    lines.push(`${indentStr}val _record = ${iteratorVar}.nextOption()`);
    if (dest.mode !== 'none') {
      const assignLines = readAssignLines(dest, 'r', `${indentStr}  `);
      if (assignLines.length === 1) {
        // Elementary/unsupported case: a single-line body still fits neatly
        // as `.foreach(r => <line>)` (matches the exact pre-round-7 output
        // for every existing corpus program - none of which hit the group
        // path here).
        const body = assignLines[0].trim();
        lines.push(`${indentStr}_record.foreach(r => ${body})`);
      } else {
        lines.push(`${indentStr}_record.foreach { r =>`);
        lines.push(...assignLines);
        lines.push(`${indentStr}}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * round-10 finding 3/4: decide (and build) how a WRITE of `recordName`
 * should render its record content:
 *   - `{ mode: 'elementary', expr }` - `recordName` is itself a plain
 *     elementary flat var (unchanged pre-round-10 behavior).
 *   - `{ mode: 'bytes', className, ctorArgs }` - a group containing at least
 *     one non-DISPLAY (packed/binary/float) child (groupContainsNonDisplay):
 *     the record's own on-disk bytes are the ONLY correct representation
 *     (x03) - generateWriteStatement routes this through the case class's
 *     own `.format(...)`, written as raw (ISO-8859-1-identity-mapped) bytes,
 *     never through display-text concatenation.
 *   - `{ mode: 'bytes-unsupported' }` - needed byte-level (non-DISPLAY child
 *     present) but groupChildConstructorExpr couldn't safely build the
 *     constructor call (a FILLER, an OCCURS table, or an ambiguous nested
 *     group name got in the way) - generateWriteStatement emits a visible,
 *     compiling TODO marker instead of a wrong/guessed byte layout.
 *   - `{ mode: 'text', expr }` - pure-DISPLAY group (including one with a
 *     DISPLAY-only OCCURS ... DEPENDING ON child, x04 - odoDisplayValueExpr)
 *     or a group groupDisplayValueExpr can otherwise render - the existing,
 *     unchanged display-text concatenation path (trailing-space stripping
 *     at the WRITE call site is what every existing DISPLAY-only file-I/O
 *     corpus program, e.g. s01/t01-t06/u12, already depends on).
 *   - `{ mode: 'text', expr: <bare camelCase fallback> }` - nothing else
 *     resolved (matches the old, pre-round-10 fallback exactly).
 */
/**
 * Plan for `WRITE rec FROM <literal>` (a string/numeric/figurative-constant
 * literal operand, not an identifier) - round-18 finding 2's g12 companion
 * gap. Real COBOL semantics: the literal is implicitly MOVEd into `rec`
 * (fit/padded to `rec`'s own total declared width, exactly like an ordinary
 * `MOVE "..." TO rec` would) before the record is written - so this reuses
 * `renderLiteralForTarget` (the exact same literal-into-alphanumeric-target
 * rendering `generateScalarIntoGroupMove`'s MOVE-into-a-whole-group path
 * already uses) against a synthetic alphanumeric target descriptor sized to
 * `rec`'s own width (its elementary FIELD_REGISTRY width, or - for a group
 * record - GROUP_BYTE_LENGTH_REGISTRY's total byte length), producing a
 * compile-time-constant, already-fitted Scala string literal - never a
 * plain unpadded/untruncated literal, and never the record's own (unrelated,
 * default-initialized) current field values the way falling through to
 * writeRecordPlan(recordName) would.
 *
 * Returns null when `rec`'s width can't be resolved at all (not a
 * registered elementary field or group) - callers fall back to
 * writeRecordPlan's own pre-existing (non-literal) handling in that case.
 */
function writeFromLiteralPlan(literal, recordName) {
  const info = lookupField(recordName);
  let width = null;
  if (info) {
    width = info.picLength || null;
  } else {
    const nameUpper = String(recordName || '').toUpperCase();
    const lenRaw = GROUP_BYTE_LENGTH_REGISTRY.get(nameUpper);
    width = lenRaw != null ? Number(lenRaw) : null;
  }
  if (width == null) return null;

  const syntheticInfo = { scalaType: 'String', dataType: 'alphanumeric', picLength: width, justified: false };
  return { mode: 'text', expr: renderLiteralForTarget(literal, syntheticInfo) };
}

function writeRecordPlan(recordName) {
  const info = lookupField(recordName);
  if (info) {
    const camel = info.camel;
    if (info.dataType === 'numeric') {
      const asBigDecimal = info.scalaType === 'BigDecimal' ? camel : `BigDecimal(${camel})`;
      return { mode: 'elementary', expr: `CobolFmt.num(${asBigDecimal}, ${info.integerDigits}, ${info.decimalDigits}, ${info.signed}, ${DECIMAL_POINT_IS_COMMA})` };
    }
    return { mode: 'elementary', expr: camel };
  }

  const nameUpper = String(recordName || '').toUpperCase();
  const groupKey = resolveGroupKey(nameUpper);
  const isGroup = GROUP_REGISTRY.has(groupKey) && !AMBIGUOUS_GROUP_CLASS_NAMES.has(toPascalCase(nameUpper));

  if (isGroup && groupContainsNonDisplay(groupKey)) {
    const ctorArgs = groupChildConstructorExpr(groupKey);
    if (ctorArgs == null) return { mode: 'bytes-unsupported' };
    return { mode: 'bytes', className: toPascalCase(nameUpper), ctorArgs };
  }

  if (isGroup) {
    const odoExpr = odoDisplayValueExpr(groupKey);
    if (odoExpr) return { mode: 'text', expr: `(${odoExpr})` };
    const groupExpr = groupDisplayValueExpr(groupKey);
    if (groupExpr) return { mode: 'text', expr: `(${groupExpr})` };
  }

  return { mode: 'text', expr: toCamelCase(recordName) };
}

/**
 * Generate WRITE statement wrapper. `WRITE record-name [FROM identifier]`
 * writes through the *file's* own writer (looked up via
 * fileNameForRecord/RECORD_FILE_REGISTRY - round-5 finding 1b: the FD record
 * name and the SELECT's file name are routinely different, most WRITE
 * statements name the record, not the file, and OPEN's writer handle is
 * keyed by the file name), never the record's own name directly.
 *
 * LINE SEQUENTIAL (this generator's only supported file organization) writes
 * strip trailing spaces (verified against installed GnuCOBOL: a PIC X(20)
 * record holding a 15-character value round-trips through cobc as a
 * 15-character physical line, not a space-padded 20-character one) - round-5
 * finding 1/s01.
 *
 * ADVANCING (round-6 finding 1) - `WRITE ... AFTER/BEFORE ADVANCING n LINES`/
 * `PAGE` - is captured by the parser (`statement.advancing`) but was
 * previously ignored here entirely; a correct-looking handler existed in
 * file-io-gen.js's generateWrite, but that function is dead code (never
 * called from the live dispatch - see generateExpression's 'WRITE' case,
 * which always calls this function instead). Compiler-verified against
 * installed GnuCOBOL (see tests/round6-fixes.test.js and t01's oracle
 * output) that the real model is NOT "println with N-1 leading blank
 * lines"; it's a deferred-terminator, carriage-control-style model:
 *   - `AFTER ADVANCING n LINES` (n>=1): emit exactly n newline characters,
 *     THEN the record text, with NO trailing terminator of its own - the
 *     record's own line ending is whatever the *next* WRITE (or CLOSE, for
 *     the last one) contributes as ITS leading separator.
 *   - `... ADVANCING 0 LINES`: emit a single carriage return ("\r", same-line
 *     overprint), then the text - not the same as "no separator at all".
 *   - `... ADVANCING PAGE`: emits a form feed ("\f") then the text (not
 *     independently verified against cobc - no corpus program exercises
 *     PAGE - but consistent with the same deferred-separator model and
 *     conventional carriage-control PAGE semantics).
 *   - `BEFORE ADVANCING ...`: the record text is written first (with
 *     whatever separator is already pending from an earlier statement),
 *     and THIS statement's own separator is appended immediately
 *     afterward, self-terminating (confirmed empirically: a BEFORE-ADVANCING
 *     write's own newline appears right after its own text, not deferred to
 *     the next statement).
 *   - A WRITE with NO ADVANCING clause at all, to a file that has ADVANCING
 *     used somewhere else, contributes a bare empty separator (confirmed
 *     empirically - this is genuinely different from, and less than, the
 *     ordinary one-newline-per-record behavior such a file would get if
 *     ADVANCING were never used on it anywhere at all).
 *
 * Because mixing ADVANCING and non-ADVANCING writes to the *same* file
 * changes the whole file's write model (see ADVANCING_FILES' doc comment),
 * this only activates for a file that has at least one ADVANCING WRITE
 * anywhere in the program (`ADVANCING_FILES`, built once by
 * scala-generator.js's collectAdvancingFileNames()); every other file's
 * WRITE is completely unaffected - the exact pre-round-6 `println` call -
 * which is what keeps every one of the 93 pre-existing corpus programs
 * (none of which use ADVANCING) byte-for-byte unchanged.
 *
 * The deferred model leaves the file's very last physical line
 * unterminated whenever the last WRITE used AFTER-ADVANCING (or no
 * ADVANCING clause at all) - CLOSE emits the final newline for such files
 * (see file-io-gen.js's generateClose). A last WRITE using BEFORE-ADVANCING
 * already self-terminates, so that combination (last write is
 * BEFORE-ADVANCING) would get one extra trailing blank line from CLOSE's
 * unconditional final newline - a known, narrow, unverified edge case no
 * corpus program exercises (see tests/oracle/README.md's "Known gaps").
 */
function generateWriteStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const recordName = statement.recordName || statement.record || 'record';
  const fileName = fileNameForRecord(recordName);
  const { writerVar } = fileHandleVarNames(fileName);
  // round-18 finding 2's g12 companion gap: `WRITE rec FROM "literal"` (a
  // string/numeric/figurative-constant literal, not an identifier) needs its
  // own plan - see writeFromLiteralPlan's doc comment. Falls back to the
  // ordinary identifier-FROM/no-FROM plan whenever the literal's own target
  // width can't be resolved (should not happen for any registered record,
  // but never silently substitutes the wrong value in that case either).
  const literalPlan = statement.from && statement.from.type === 'Literal'
    ? writeFromLiteralPlan(statement.from, recordName)
    : null;
  const sourceName = statement.from ? (statement.from.name || statement.from) : recordName;
  const plan = literalPlan || writeRecordPlan(sourceName);
  // round-6 finding 2/3 companion: this generator never models a WRITE
  // failure path, so a registered FILE STATUS field always goes to "00"
  // (successful write) here - see FILE_STATUS_REGISTRY's doc comment.
  const statusVar = fileStatusVarFor(fileName);
  const statusSuffix = statusVar ? ` ${statusVar} = "00"` : '';

  // round-10 finding 3: a record containing a non-DISPLAY (packed/binary/
  // float) child must be written through its own byte-level format(), not
  // the display-text concatenation path below - see writeRecordPlan's doc
  // comment. Not modeled against the ADVANCING carriage-control model at all
  // (no corpus program combines the two - packed/binary FD records with
  // ADVANCING WRITE - so this always uses the plain "bytes + one newline"
  // shape cobc itself produces for LINE SEQUENTIAL, x03).
  if (plan.mode === 'bytes') {
    const bytesExpr = `${plan.className}.format(${plan.className}(${plan.ctorArgs}))`;
    const textExpr = `new String(${bytesExpr}, java.nio.charset.StandardCharsets.ISO_8859_1)`;
    return statusVar
      ? `${indentStr}{ ${writerVar}.print(${textExpr}); ${writerVar}.print("\\n");${statusSuffix} }`
      : `${indentStr}{ ${writerVar}.print(${textExpr}); ${writerVar}.print("\\n") }`;
  }
  if (plan.mode === 'bytes-unsupported') {
    return (
      `${indentStr}() // TODO: WRITE ${sourceName}: a byte-level (non-DISPLAY-child) record with a FILLER/OCCURS ` +
      'child is not supported (see tests/oracle/README.md known gaps); record not written'
    );
  }

  const contentExpr = plan.expr;

  if (!ADVANCING_FILES.has(String(fileName || '').toUpperCase())) {
    return statusVar
      ? `${indentStr}{ ${writerVar}.println((${contentExpr}).stripTrailing());${statusSuffix} }`
      : `${indentStr}${writerVar}.println((${contentExpr}).stripTrailing())`;
  }

  const textExpr = `(${contentExpr}).stripTrailing()`;
  const adv = statement.advancing;
  let sepExpr = '""';
  let position = 'AFTER';
  if (adv) {
    position = adv.position === 'BEFORE' ? 'BEFORE' : 'AFTER';
    if (adv.type === 'PAGE') {
      sepExpr = '"\\f"';
    } else {
      const nExpr = convertArithmeticExpression(adv.value);
      sepExpr = `CobolFmt.advanceSep((${nExpr}).toInt)`;
    }
  }

  if (position === 'BEFORE') {
    return `${indentStr}{ ${writerVar}.print(${textExpr}); ${writerVar}.print(${sepExpr});${statusSuffix} }`;
  }
  return `${indentStr}{ ${writerVar}.print(${sepExpr}); ${writerVar}.print(${textExpr});${statusSuffix} }`;
}

/**
 * Generate REWRITE statement wrapper
 */
function generateRewriteStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const recordName = toCamelCase(statement.recordName || statement.record || 'record');

  return `${indentStr}// REWRITE ${recordName} - update current record in file`;
}

/**
 * Generate DELETE statement wrapper
 */
function generateDeleteStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = toCamelCase(statement.fileName || statement.file || 'file');

  return `${indentStr}// DELETE record from ${fileName}`;
}

/**
 * Generate START statement wrapper
 */
function generateStartStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = toCamelCase(statement.fileName || statement.file || 'file');

  return `${indentStr}// START ${fileName} - position file for reading`;
}

/**
 * Generate PERFORM statement nested inside another statement (an IF/
 * EVALUATE/SEARCH branch body, etc. - a *top-level* paragraph's own PERFORM
 * statements go through method-gen.js's generatePerformFromAST instead, via
 * generateMethodBody's own PERFORM case). Target-paragraph references use
 * paragraphMethodName (not toCamelCase) for the exact same reason
 * method-gen.js's toMethodName does: a paragraph name with a leading numeric
 * prefix (e.g. "1000-RECURSE") must have that prefix stripped before
 * camelCasing, or `toCamelCase` alone leaves the leading digits in place
 * (`1000Recurse`), which both isn't a legal Scala method-call target and
 * doesn't match the actual generated method name (`recurse`) - see
 * tests/corpus/proc/r09-perf-nested.cbl (a paragraph that PERFORMs itself
 * from inside a nested IF).
 */
function generatePerform(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];
  const testBefore = statement.testBefore !== false;

  function body(bodyIndent) {
    const bodyLines = [];
    if (statement.targetParagraph) {
      bodyLines.push(`${'  '.repeat(bodyIndent)}${performTargetCallExpr(statement)}`);
    }
    if (statement.statements) {
      for (const stmt of statement.statements) {
        bodyLines.push(generateExpression(stmt, bodyIndent));
      }
    }
    if (bodyLines.length === 0) bodyLines.push(`${'  '.repeat(bodyIndent)}()`);
    return bodyLines.join('\n');
  }

  // Every looping/bodied form below (times/until/varying/bare-inline) wraps
  // its body in `scala.util.boundary { ... }` so EXIT PERFORM (generateExit)
  // can render as `scala.util.boundary.break()`: that unwinds to exactly
  // this nearest lexically-enclosing boundary block (nested PERFORMs each
  // get their own, so an EXIT PERFORM inside a nested loop only ever exits
  // the innermost one), then execution simply continues with whatever
  // follows this whole PERFORM statement - unlike a bare `return` (the
  // pre-fix behavior), which incorrectly unwound all the way out of the
  // enclosing paragraph/method, skipping every statement after END-PERFORM
  // too. The out-of-line 'simple' form has no body of its own here (it just
  // calls the target paragraph's method) and an EXIT PERFORM textually
  // inside that *paragraph* is a separate, out-of-scope case (see
  // generateExit's doc comment) - so it needs no boundary.
  if (statement.performType === 'simple') {
    lines.push(`${indentStr}${performTargetCallExpr(statement)}`);
  } else if (statement.performType === 'times') {
    const times = statement.times?.value || statement.times || '1';
    const bi = '  '.repeat(indent + 1);
    lines.push(`${indentStr}scala.util.boundary {`);
    lines.push(`${bi}(1 to ${times}).foreach { _ =>`);
    lines.push(body(indent + 2));
    lines.push(`${bi}}`);
    lines.push(`${indentStr}}`);
  } else if (statement.performType === 'until') {
    const condition = convertCondition(statement.until);
    const bi = '  '.repeat(indent + 1);
    lines.push(`${indentStr}scala.util.boundary {`);
    if (testBefore) {
      lines.push(`${bi}while !(${condition}) do`);
      lines.push(body(indent + 2));
    } else {
      // WITH TEST AFTER: Scala 3 has no do-while postfix loop syntax at all
      // (removed, not just restyled) - see method-gen.js's generatePerformFromAST
      // for the identical rewrite this mirrors: fold the body into the
      // while-condition block itself (so it always runs at least once before
      // the first test) and leave the loop's own `do` body empty.
      lines.push(`${bi}while`);
      lines.push(body(indent + 2));
      lines.push(`${'  '.repeat(indent + 2)}!(${condition})`);
      lines.push(`${bi}do ()`);
    }
    lines.push(`${indentStr}}`);
  } else if (statement.performType === 'varying') {
    const varying = statement.varying;
    const varName = toCamelCase(varying?.variable || 'i');
    const from = varyingOperandExprLocal(varying?.from, 1);
    const by = varyingOperandExprLocal(varying?.by, 1);
    const until = convertCondition(varying?.until);
    const bi = '  '.repeat(indent + 1);
    const bi2 = '  '.repeat(indent + 2);

    // The loop-control variable is a WORKING-STORAGE item (declared once as
    // a flat var elsewhere) - assign it here rather than redeclaring with
    // `var`, so repeated PERFORM VARYING over the same variable in one
    // method body doesn't produce a duplicate-declaration compile error.
    lines.push(`${indentStr}scala.util.boundary {`);
    lines.push(`${bi}${varName} = ${from}`);
    if (testBefore) {
      lines.push(`${bi}while !(${until}) do`);
      lines.push(body(indent + 2));
      lines.push(`${bi2}${varName} = ${varName} + ${by}`);
    } else {
      // WITH TEST AFTER VARYING: the UNTIL test happens *before* the
      // increment, against the still-current value - the increment only
      // happens if the loop continues (verified against installed GnuCOBOL -
      // see method-gen.js's generateVaryingNest, which this mirrors, for the
      // full trace). Body+test fold into the while-condition block; the
      // increment moves into the `do` body so it's skipped after the final,
      // test-failing round.
      lines.push(`${bi}while`);
      lines.push(body(indent + 2));
      lines.push(`${bi2}!(${until})`);
      lines.push(`${bi}do`);
      lines.push(`${bi2}${varName} = ${varName} + ${by}`);
    }
    lines.push(`${indentStr}}`);
  } else if (statement.statements) {
    // Inline PERFORM with no TIMES/UNTIL/VARYING clause: executes its body
    // exactly once, like a scope - still boundary-wrapped so a bare EXIT
    // PERFORM inside it only skips the rest of this one execution.
    lines.push(`${indentStr}scala.util.boundary {`);
    for (const stmt of statement.statements) {
      lines.push(generateExpression(stmt, indent + 1));
    }
    lines.push(`${indentStr}}`);
  } else if (statement.targetParagraph) {
    lines.push(`${indentStr}${performTargetCallExpr(statement)}`);
  }

  return lines.join('\n');
}

/**
 * Scala expression for a PERFORM VARYING FROM/BY operand, mirroring
 * method-gen.js's varyingOperandExpr (duplicated locally for the same reason
 * paragraphMethodName is - see that function's doc comment - method-gen.js
 * imports from this module, so the reverse import would cycle).
 */
function varyingOperandExprLocal(operand, fallback) {
  if (operand == null) return String(fallback);
  if (typeof operand === 'object') {
    if (operand.type === 'Literal') return String(operand.value);
    if (operand.name) return toCamelCase(operand.name);
  }
  return String(operand);
}

/**
 * Generate CALL statement.
 *
 * round-7 finding 1: previously *every* CALL rendered as a bare
 * `cleanName(args)` invocation regardless of whether any such method/function
 * actually existed anywhere in the generated file - for a literal program
 * name (the overwhelmingly common case: `CALL "ADDER" USING ...`) that was
 * always a hard "not found" Scala compile error, since this generator never
 * emitted anything named after an *external* subprogram, and even a
 * same-file sibling PROGRAM-ID (multi-program source) had no corresponding
 * callable method generated for it at all before this fix.
 *
 * Two cases, resolved via CALL_PROGRAM_REGISTRY (populated only in
 * multi-PROGRAM-ID mode - see scala-generator.js's generateMultiProgramScala,
 * which builds it from every PROGRAM-ID parsed out of the same source,
 * *before* generating any program's method bodies, so a forward reference -
 * calling a program declared later in the file, as in u01's own repro shape -
 * still resolves):
 *
 *   - Known sibling program: emits `<ObjectName>.entry(<args>)` - see
 *     generateEntryMethod's doc comment for what that method does on the
 *     callee side. BY REFERENCE semantics (COBOL's default absent an
 *     explicit BY CONTENT/VALUE on this CALL's own USING operand) need the
 *     callee's post-call value to flow back into the *caller's* variable;
 *     since a called COBOL subprogram can arbitrarily mutate its LINKAGE
 *     SECTION parameters and the caller must see those mutations, and Scala
 *     has no native by-reference parameter passing, the pragmatic mapping
 *     this generator uses is: pass each argument's *current value* in, and
 *     have `entry(...)` return every LINKAGE parameter's *final value* back
 *     out as a tuple (or a bare scalar for a single-parameter callee) -
 *     assigned back into each BY REFERENCE operand's own caller-side
 *     variable. A BY CONTENT/VALUE operand is passed the same way but its
 *     slot in the returned tuple is simply not written back (matches real
 *     COBOL: the callee's own copy is local to that call).
 *   - Unrecognized name (a genuinely external subprogram this source doesn't
 *     define, or a dynamic `CALL <data-name>` naming a variable rather than
 *     a literal - out of scope, no corpus program exercises it): emits a
 *     visible, still-compiling `() // TODO` marker instead (round-7 finding
 *     1c) - never a bare call to a name nothing in the file defines.
 *
 * round-12 findings 3/4: a real CALL's USING list need not supply a value
 * for every one of the callee's declared LINKAGE SECTION items - either
 * because the caller simply passes fewer arguments than the callee declares
 * (legal COBOL: an un-passed trailing LINKAGE item is not addressable at
 * all per the standard, not a compile error), or because a specific
 * positional argument is spelled `OMITTED`. Both pragmatically resolve to
 * "that parameter starts at its type's zero/spaces default and is never
 * written back": the fewer-args case is handled by simply not padding
 * `argExprs` out to the callee's full arity at all - generateEntryMethod
 * gives every trailing parameter its own Scala default value, so Scala's
 * ordinary default-parameter mechanism covers any missing *trailing*
 * arguments for free - while `OMITTED` (which can appear anywhere in the
 * list, not only trailing) explicitly substitutes the default expression in
 * that exact positional slot below, since Scala can't skip a middle
 * positional argument the way a plain shorter argument list skips trailing
 * ones.
 */
function generateCall(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const rawProgramName = statement.programName?.value || statement.programName || 'subprogram';
  const nameUpper = String(rawProgramName).replace(/['"]/g, '').toUpperCase();
  const target = CALL_PROGRAM_REGISTRY.get(nameUpper);

  const usingParams = statement.using || [];

  if (!target) {
    return `${indentStr}() // TODO: CALL "${rawProgramName}" - external subprogram not available for conversion (no PROGRAM-ID "${nameUpper}" found in this source); call skipped - see tests/oracle/README.md known gaps`;
  }

  // round-8 finding 1: a bare (no subscripts) reference to a registered
  // GROUP name - as opposed to an elementary field - needs the same
  // concatenated-raw-storage-text treatment DISPLAY/group MOVE already use
  // (groupDisplayValueExpr): a group has no flat Scala var of its own to
  // pass as an argument (see that function's own doc comment), only its
  // children do.
  const argExprs = usingParams.map((param, i) => {
    // round-12 finding 4: CALL ... USING ... OMITTED ... - the parser
    // (parser/procedure-parser.js's parseCallStatement) records this
    // positional operand as `{ omitted: true, value: null }` rather than
    // dropping it (dropping it would shift every argument after it into the
    // wrong callee parameter slot). There is no caller-side value to pass at
    // all, so this slot gets the callee's own declared parameter's
    // zero/spaces default instead - see defaultZeroValueForScalaType's doc
    // comment; refWriters below already skips write-back for it for free
    // (param.value is null, so its `name` lookup is null too).
    if (param.omitted) {
      const paramType = target.paramTypes?.[i] || 'String';
      return defaultZeroValueForScalaType(paramType);
    }
    const name = param.value?.name;
    const hasSubscripts = Array.isArray(param.value?.subscripts) && param.value.subscripts.length > 0;
    if (name && param.value?.refMod) {
      // round-16 finding 3: reference modification (`identifier(start:
      // length)`, Known Gap #1) used as a CALL ... USING argument. Before
      // this fix, this branch fell straight through to the plain
      // `if (name) return toCamelCase(name)` case below, which passes the
      // callee the FULL base variable - silently ignoring the (start:length)
      // clause entirely rather than the slice the COBOL source actually
      // names. Unlike the "not found" compile crashes ref-mod hits
      // elsewhere, this compiled and ran - just with the WRONG value handed
      // to the callee, no marker at all (e06: E06SUB received all of
      // WS-SRC's 10 characters instead of the 5-character slice
      // WS-SRC(3:5) names). Ref-mod's own slicing semantics stay exactly as
      // out of scope as everywhere else this gap surfaces (see Known Gap
      // #1) - the fix is only to stop passing a silently-wrong value: a
      // concrete, String-typed, visibly-marked placeholder instead, the same
      // honest-decline shape round-15 finding 8/round-16 finding 2 already
      // use for a ref-mod'd STRING-segment/comparison operand. round-17:
      // the shared refModGapComment helper supplies the common suffix text;
      // this call site prepends its own CALL-specific context.
      return `("" /* TODO: CALL "${rawProgramName}" USING ${name}(...): ${refModGapComment('a CALL argument')} */)`;
    }
    if (name && !hasSubscripts && isRegisteredGroupName(String(name).toUpperCase())) {
      const groupExpr = groupDisplayValueExpr(resolveGroupKey(String(name).toUpperCase()));
      if (groupExpr) return `(${groupExpr})`;
      // round-13 finding 1: groupDisplayValueExpr bails to null for a group
      // containing an OCCURS table (it has no scalar concatenation - see its
      // own doc comment), and there was previously no fallback here at all:
      // execution fell through to the plain `if (name) return
      // toCamelCase(name)` branch below, which for a GROUP name (as opposed
      // to an elementary field) references a Scala identifier that was never
      // declared (a group has no flat var of its own - only its children
      // do), a hard "not found" compile error at the CALL's own call site
      // (r1303c: `CALL ... USING BY REFERENCE WS-TABLE` where WS-TABLE is a
      // group whose only child is an OCCURS table). generateEntryMethod
      // (scala-generator.js) already has exactly this same fallback on the
      // callee side (its own return-expression branch: `"" /* TODO: group
      // return unsupported for this shape */`) - mirrored here so the
      // argument-construction side degrades the same honest way: a
      // same-typed (String) placeholder plus a visible, compiling TODO
      // comment, never an undeclared-identifier crash. True marshalling of
      // an OCCURS-bearing group across a CALL boundary (concatenating the
      // table elements' own display forms, then scattering them back out
      // symmetrically on writeback) is left as a documented gap - see
      // tests/oracle/README.md's known gaps.
      return `("" /* TODO: CALL "${rawProgramName}" USING ${name}: group argument marshalling not supported for a group containing an OCCURS table - see tests/oracle/README.md known gaps */)`;
    }
    // round-19 finding 3: a single already-subscripted SCALAR element of an
    // OCCURS table (`WS-VAL(2)`) used as a CALL argument - distinct from the
    // whole-group-containing-an-OCCURS-table gap above (that one has no flat
    // Scala var to reference at all; this one is an ordinary scalar read,
    // just at a computed index into the table's flat `Vector[...]` var).
    // Before this fix, this fell straight into the plain `toCamelCase(name)`
    // branch below, passing the WHOLE table Vector instead of the one
    // requested element - a hard "Found: Vector[String], Required: String"
    // compile crash at the call site. convertIdentifier already builds the
    // correct `wsVal(idx)` scalar-read expression for a subscripted
    // reference (the same helper MOVE/STRING/INSPECT of a subscripted
    // element already reuse) - dispatch to it here instead of the bare name.
    if (name && hasSubscripts && !isRegisteredGroupName(String(name).toUpperCase())) {
      return convertIdentifier(param.value);
    }
    if (name) return toCamelCase(name);
    return convertArithmeticExpression(param.value || param);
  });

  // round-21 finding 2 (extended by round-22 finding 1 for a GROUP LINKAGE
  // parameter - see below): a RECURSIVE target (scala-generator.js's
  // generateRecursiveEntryMethod - see its own doc comment) does not take
  // plain values at all; it takes a getter/setter CLOSURE pair per LEAF
  // parameter, so its own LINKAGE item can be a live alias of whatever
  // variable THIS specific CALL actually names, instead of a module-level
  // var every recursive activation would otherwise stomp on. A plain,
  // unsubscripted, non-ref-mod, BY REFERENCE variable operand (COBOL's
  // default - the overwhelmingly common shape, and the only one this fix
  // extends true aliasing to) gets a LIVE getter/setter pair that reads/
  // writes that exact variable; every other operand shape (BY CONTENT/
  // VALUE, a literal/computed expression, OMITTED, or one of the rarer
  // ref-mod/subscripted-scalar operand shapes handled above) gets a getter
  // that returns its own already-computed `argExprs[i]` value (a snapshot,
  // taken once - real BY VALUE/CONTENT semantics, and the closest safe
  // approximation for the rarer shapes this fix doesn't extend true aliasing
  // to) and a no-op setter, matching "the callee's own copy is local to that
  // call" exactly like the ordinary (non-recursive) CALL convention already
  // does for those same shapes.
  //
  // round-22 finding 1: a GROUP LINKAGE parameter has no single flat Scala
  // var of its own to alias this same way (see flattenGroupLeaves's own doc
  // comment) - only its children do. `target.paramLeafShapes[i]` (built by
  // generateMultiProgramScala, scala-generator.js, from the SAME
  // flattenGroupLeaves traversal the callee's own generateRecursiveEntryMethod
  // uses) is the callee's own ordered leaf list for this USING position: a
  // 1-element list `[{ scalaType }]` for a plain scalar parameter, or an
  // N-element list (one per elementary child, recursing into any nested
  // group) for a GROUP parameter. A plain named GROUP operand (REFERENCE or
  // CONTENT/VALUE - reading a caller-side child var is always safe, since the
  // caller is blocked for the whole duration of this CALL) gets ITS OWN
  // per-child aliasing, one getter/setter pair per leaf, keyed off that same
  // operand's own children (flattenGroupLeaves again, this time over the
  // CALLER's group) - the exact per-scalar aliasing above, just fanned out
  // over every leaf instead of one flat var. Only a BY REFERENCE operand's
  // setter actually writes back; BY CONTENT/VALUE's setter is a no-op,
  // exactly like the plain-scalar case. Any shape that can't be aliased this
  // way (no caller-side name at all - OMITTED/literal/computed - a ref-mod'd
  // or subscripted operand, or a caller/callee leaf-count mismatch) falls
  // back to each leaf's own zero/spaces default and a no-op setter, matching
  // the callee's own default-parameter convention for an un-supplied
  // argument.
  if (target.recursive) {
    const closureArgs = [];
    usingParams.forEach((param, i) => {
      const leafShapes = target.paramLeafShapes?.[i] || [{ scalaType: target.paramTypes?.[i] || 'String' }];
      const mode = String(param.mode || 'REFERENCE').toUpperCase();
      const name = !param.omitted ? param.value?.name : null;
      const hasSubscripts = Array.isArray(param.value?.subscripts) && param.value.subscripts.length > 0;
      const isNamedGroup = name && !param.value?.refMod && !hasSubscripts &&
        isRegisteredGroupName(String(name).toUpperCase());
      const isPlainRefVar = name && !param.value?.refMod && !hasSubscripts && !isNamedGroup;

      if (isPlainRefVar) {
        const camel = toCamelCase(name);
        const scalaType = leafShapes[0]?.scalaType || target.paramTypes?.[i] || 'String';
        const setter = mode === 'REFERENCE' ? `(v: ${scalaType}) => ${camel} = v` : `(_: ${scalaType}) => ()`;
        closureArgs.push(`() => ${camel}, ${setter}`);
        return;
      }

      if (isNamedGroup) {
        const callerLeaves = flattenGroupLeaves(resolveGroupKey(String(name).toUpperCase()));
        if (callerLeaves && callerLeaves.length === leafShapes.length) {
          callerLeaves.forEach(leaf => {
            const setter = mode === 'REFERENCE' ? `(v: ${leaf.scalaType}) => ${leaf.camel} = v` : `(_: ${leaf.scalaType}) => ()`;
            closureArgs.push(`() => ${leaf.camel}, ${setter}`);
          });
          return;
        }
        // Shape mismatch (defensive - not exercised by any corpus program):
        // falls through to the zero-default fallback below, one entry per
        // callee-declared leaf.
      }

      leafShapes.forEach(leaf => {
        const scalaType = leaf.scalaType || 'String';
        closureArgs.push(`() => (${leafShapes.length === 1 ? argExprs[i] : defaultZeroValueForScalaType(scalaType)}), (_: ${scalaType}) => ()`);
      });
    });
    return `${indentStr}${target.objectName}.entry(${closureArgs.join(', ')})`;
  }

  const callExpr = `${target.objectName}.entry(${argExprs.join(', ')})`;

  // Which caller-side variable (if any) each USING operand writes its
  // post-call value back into: only a BY REFERENCE operand (COBOL's default
  // when no BY CONTENT/VALUE is written) that is itself a plain variable
  // reference (a literal/expression operand has nowhere to write back to,
  // same as real COBOL - only a data-name can be passed BY REFERENCE). A
  // group-shaped operand (round-8 finding 1) gets a `{ kind: 'group',
  // groupKey }` "scatter" writer instead of a plain `{ kind: 'scalar',
  // camel }` one - see renderWriteback/scatterGroupFromString.
  const refWriters = usingParams.map(param => {
    const mode = String(param.mode || 'REFERENCE').toUpperCase();
    if (mode !== 'REFERENCE') return null;
    const name = param.value?.name;
    if (!name) return null;
    // round-16 finding 3: a ref-mod'd BY REFERENCE argument has no real
    // caller-side slice to write back into either (see the argExprs branch
    // above) - writing the callee's returned value into the FULL base
    // variable (the pre-fix behavior, since this only ever matched the plain
    // `{ kind: 'scalar', camel: toCamelCase(name) }` case below) would
    // silently corrupt the base variable's untouched bytes outside the
    // named slice. Route through a dedicated writer kind that renders a
    // visible, compiling no-op marker instead (see renderWriteback below).
    if (param.value?.refMod) {
      return { kind: 'refmod-unsupported', name };
    }
    const hasSubscripts = Array.isArray(param.value?.subscripts) && param.value.subscripts.length > 0;
    const nameUpperParam = String(name).toUpperCase();
    if (!hasSubscripts && isRegisteredGroupName(nameUpperParam)) {
      return { kind: 'group', groupKey: resolveGroupKey(nameUpperParam) };
    }
    // round-19 finding 3: a subscripted scalar element's BY REFERENCE
    // writeback must land back in that SAME element (`.updated(idx, ...)`),
    // not overwrite the whole table var with a scalar value (the pre-fix
    // `{ kind: 'scalar', camel: toCamelCase(name) }` path did exactly that -
    // `wsVal = <scalar return>` against a `Vector[String]` var, a second
    // "Found: String, Required: Vector[String]" compile crash alongside the
    // argument-side one above).
    if (hasSubscripts && !isRegisteredGroupName(nameUpperParam)) {
      return { kind: 'scalar-subscripted', ref: param.value };
    }
    return { kind: 'scalar', camel: toCamelCase(name) };
  });

  // Render one BY REFERENCE operand's writeback from `sourceExpr` - a plain
  // Scala expression (a var name, or `_callRet`/`_callRet._n`) that is
  // always cheap and side-effect-free to re-evaluate, since
  // scatterGroupFromString may reference it more than once for a
  // multi-child group (never the raw `callExpr`/method-call text itself -
  // see the paramCount===1 group branch and the multi-param `_callRet`
  // path below, both of which evaluate the call exactly once first).
  const renderWriteback = (writer, sourceExpr) => {
    if (writer.kind === 'scalar') return [`${indentStr}${writer.camel} = ${sourceExpr}`];
    if (writer.kind === 'scalar-subscripted') return [`${indentStr}${renderAssignment(writer.ref, sourceExpr)}`];
    if (writer.kind === 'refmod-unsupported') {
      return [
        `${indentStr}() // TODO: CALL ... USING BY REFERENCE ${writer.name}(...): reference modification not ` +
          'implemented for CALL argument writeback - see tests/oracle/README.md known gaps',
      ];
    }
    const scattered = scatterGroupFromString(writer.groupKey, sourceExpr, indent);
    if (scattered == null) {
      return [
        `${indentStr}() // TODO: CALL ... USING BY REFERENCE ${writer.groupKey}: group writeback not ` +
          'supported for this shape (an OCCURS child, or a child with no registered field info) - value left unchanged',
      ];
    }
    return scattered;
  };

  if (target.paramCount === 0 || refWriters.every(w => w === null)) {
    return `${indentStr}${callExpr}`;
  }

  if (target.paramCount === 1) {
    const w = refWriters.find(Boolean);
    if (!w) return `${indentStr}${callExpr}`;
    if (w.kind === 'scalar') return `${indentStr}${w.camel} = ${callExpr}`;
    const retName = nextCallRetName();
    return [`${indentStr}val ${retName} = ${callExpr}`, ...renderWriteback(w, retName)].join('\n');
  }

  const retName = nextCallRetName();
  const lines = [`${indentStr}val ${retName} = ${callExpr}`];
  refWriters.forEach((w, i) => {
    if (w) lines.push(...renderWriteback(w, `${retName}._${i + 1}`));
  });
  return lines.join('\n');
}

/**
 * Generate GO TO statement.
 *
 * Every paragraph becomes its own Scala method (method-gen.js's
 * generateMethod for a standalone paragraph, or a nested local `def` inside
 * a PERFORM...THRU-synthesized wrapper method - see
 * generatePerformThruMethod), so "transfer control to paragraph X" is
 * `return x()`: `return` exits *this* paragraph's method immediately
 * (skipping any statements after the GO TO in its own paragraph, exactly
 * like COBOL), and the call executes X - including whatever
 * fallthrough/further GO TOs X's own body contains - before control unwinds
 * back up the call stack. This requires the enclosing method to declare an
 * explicit result type (`return` inside a method with an *inferred* result
 * type is a Scala compile error) - see method-gen.js's generateMethod and
 * generatePerformThruMethod, which both always annotate `: Unit` for this
 * reason.
 *
 * GO TO ... DEPENDING ON: a matched case transfers immediately (`return`);
 * an out-of-range selector value matches no case, falls through with no
 * transfer at all, and execution simply continues with the *next* statement
 * in this same paragraph - per COBOL-85 semantics, and exactly what leaving
 * the unmatched arm as `()` (a plain no-op, not wrapped in `return`) does
 * here, since this whole match expression is just one statement among
 * others in the paragraph's statement sequence, not itself in tail position.
 *
 * round-19 finding 2: a target this `return x()` translation can't actually
 * honor - one lying OUTSIDE a PERFORM ... THRU range this GO TO is textually
 * inside - is a documented, honest non-fix (see method-gen.js's
 * annotateGoToThruEscapes, which runs before this function and tags the
 * affected AST node(s)): the generated code is otherwise UNCHANGED (still
 * silently resumes after the PERFORM once nested calls unwind, rather than
 * never returning like real cobc), but gets a visible, compiling comment
 * marking exactly which target(s) are affected, so this is grep-able as a
 * known gap rather than invisible.
 */
function generateGoTo(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const targets = statement.targets && statement.targets.length > 0 ? statement.targets : [statement.target];
  // round-21 finding 3: index-aligned with `targets` (see GoToStatement's
  // own doc comment, parser/ast.js, and parseGoToStatement's own comment,
  // parser/procedure-parser.js) - an explicit `OF`/`IN` qualifier
  // disambiguating a bare paragraph name that collides across sections
  // (`GO TO para OF section`), exactly mirroring how PERFORM's own
  // targetSection/throughSection qualifier (rounds 12/14) already resolves
  // the identical ambiguity for PERFORM - see paragraphMethodName's own doc
  // comment above for the shared resolution logic both statements now use.
  // Falls back to an all-null list for a statement built via the older
  // `.target` (singular) shape, or one with no targetSections recorded at
  // all, so every pre-existing (unqualified) GO TO is completely unaffected.
  const targetSections = statement.targetSections && statement.targetSections.length > 0
    ? statement.targetSections
    : targets.map(() => null);
  const escapeTargets = statement._thruEscapeTargets;
  const escapeNote = (target) => escapeTargets && escapeTargets.has(target)
    ? ` // TODO(round-19 finding 2): "${target}" lies outside the enclosing PERFORM ${statement._thruEscapeRange} range - real COBOL never returns to the PERFORM's caller once this fires, but this generator's method-call-based PERFORM model silently resumes there once nested calls unwind - see tests/oracle/README.md known gaps`
    : '';

  if (!statement.dependingOn) {
    return `${indentStr}return ${paragraphMethodName(targets[0], targetSections[0])}() // GO TO${escapeNote(targets[0])}`;
  }

  const dependingOn = convertArithmeticExpression(statement.dependingOn);
  const lines = [`${indentStr}${dependingOn} match`];

  targets.forEach((target, idx) => {
    lines.push(`${indentStr}  case ${idx + 1} => return ${paragraphMethodName(target, targetSections[idx])}()${escapeNote(target)}`);
  });

  lines.push(`${indentStr}  case _ => ()`);

  return lines.join('\n');
}

/**
 * Generate STOP statement
 */
function generateStop(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  if (statement.returnCode) {
    const code = convertArithmeticExpression(statement.returnCode);
    return `${indentStr}sys.exit(${code})`;
  }

  return `${indentStr}sys.exit(0)`;
}

/**
 * Generate GOBACK statement
 */
function generateGoback(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  if (statement.returnCode) {
    const code = convertArithmeticExpression(statement.returnCode);
    return `${indentStr}return ${code}`;
  }

  return `${indentStr}return`;
}

/**
 * Generate EXIT statement
 */
function generateExit(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const exitType = statement.exitType?.toUpperCase() || 'PARAGRAPH';

  switch (exitType) {
    case 'PROGRAM':
      return `${indentStr}return // EXIT PROGRAM`;
    case 'PERFORM':
      // Exits only the nearest enclosing *inline* PERFORM loop, not the
      // whole paragraph/method (round-3 finding 1) - generatePerform's
      // times/until/varying/bare-inline branches each wrap their body in
      // `scala.util.boundary { ... }`; break() unwinds to exactly that
      // nearest lexically-enclosing boundary (nested loops each get their
      // own, so a nested EXIT PERFORM only ever exits the innermost one),
      // after which execution simply falls through to whatever statement
      // follows this whole PERFORM - unlike the pre-fix bare `return`, which
      // incorrectly unwound all the way out of the enclosing method,
      // skipping every statement after END-PERFORM too. An EXIT PERFORM
      // textually inside an out-of-line performed paragraph (no lexically
      // enclosing boundary at all in that paragraph's own method) is a
      // separate, narrower COBOL usage this fix intentionally does not
      // cover - see generatePerform's 'simple' branch.
      return `${indentStr}scala.util.boundary.break() // EXIT PERFORM`;
    case 'SECTION':
      return `${indentStr}return // EXIT SECTION`;
    default:
      // EXIT PARAGRAPH: every paragraph is its own Scala method (see
      // method-gen.js's generateMethod, and generateGoTo's doc comment for
      // why `return` is exactly the right translation for "transfer/skip
      // within this paragraph") - `return` here skips only the rest of
      // *this* paragraph's own statements (correct - distinct from EXIT
      // PERFORM above, which must NOT unwind the whole method since a loop
      // is not a paragraph boundary). The pre-fix behavior emitted a no-op
      // comment, so nothing after an EXIT PARAGRAPH was ever actually
      // skipped (round-3 finding 2).
      return `${indentStr}return // EXIT PARAGRAPH`;
  }
}

/**
 * Generate SET statement
 */
function generateSet(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const targets = statement.targets || [statement.target];

  for (const target of targets) {
    const targetNameUpper = bareVariableNameUpper(target) || String(target?.name || target || '').toUpperCase();
    const l88 = statement.value?.type === 'TRUE' ? level88FirstValueAssignment(targetNameUpper) : null;
    const l88False = statement.value?.type === 'FALSE' ? level88FalseValueAssignment(targetNameUpper) : null;

    if (l88) {
      // SET condition-name-1 TO TRUE: the condition name itself has no
      // Scala var (see level88FirstValueAssignment's doc comment) - assign
      // its parent field the condition's first declared VALUE instead of
      // emitting `<condition-name camelCase> = true`, which referenced a
      // nonexistent identifier (e.g. `wsStatusActive = true` when only
      // `wsStatus` - the *parent* PIC X(1) field - actually exists).
      lines.push(`${indentStr}${l88.camel} = ${l88.literal}`);
    } else if (l88False) {
      // SET condition-name-1 TO FALSE, mirroring the TRUE branch above
      // (round-12 finding 1): assign the parent field its own declared
      // `WHEN SET TO FALSE IS literal-3` value, not the Scala boolean
      // `false` - the parent is a COBOL data item (e.g. PIC X(1)), not a
      // boolean var, so `<parent> = false` was never valid Scala for it
      // either (a compile error the pre-fix path never even reached, since
      // the parser hung indefinitely on this exact 88-level shape).
      lines.push(`${indentStr}${l88False.camel} = ${l88False.literal}`);
    } else if (statement.value?.type === 'TRUE') {
      lines.push(`${indentStr}${renderAssignment(target, 'true')}`);
    } else if (statement.value?.type === 'FALSE') {
      lines.push(`${indentStr}${renderAssignment(target, 'false')}`);
    } else if (statement.setType === 'index') {
      const amount = convertArithmeticExpression(statement.value);
      const current = convertIdentifier(target);
      const expr = statement.upDown === 'UP' ? `${current} + ${amount}` : `${current} - ${amount}`;
      lines.push(`${indentStr}${renderAssignment(target, expr)}`);
    } else {
      const value = convertArithmeticExpression(statement.value);
      lines.push(`${indentStr}${renderAssignment(target, value)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Whether a REPLACING clause's category list applies to a leaf of the given
 * CATEGORY (`info.dataType`) - COBOL's own INITIALIZE REPLACING rule matches
 * by category name, not by a field's specific PICTURE. Numeric-edited
 * (`'edited'`) counts as NUMERIC here: this parser's REPLACING clause only
 * ever recognizes the bare ALPHABETIC/ALPHANUMERIC/NUMERIC category keywords
 * (see parser/procedure-parser.js's parseInitializeStatement), never the
 * ALPHANUMERIC-EDITED/NUMERIC-EDITED forms, so there is no more specific
 * category for an edited field to match against.
 */
function initializeCategoryMatches(dataType, categories) {
  const cats = (categories || []).map(c => String(c).toUpperCase());
  if (dataType === 'alphanumeric') return cats.includes('ALPHANUMERIC');
  if (dataType === 'alphabetic') return cats.includes('ALPHABETIC');
  if (dataType === 'numeric' || dataType === 'edited') return cats.includes('NUMERIC');
  return false;
}

/**
 * Scalar (one-occurrence) INITIALIZE value for a single elementary leaf
 * (round-5 finding 4), or `null` when this leaf must be left completely
 * untouched. Two cases:
 *   - No REPLACING clause at all: every leaf gets COBOL's ordinary
 *     INITIALIZE default - ALPHABETIC/ALPHANUMERIC -> SPACES, NUMERIC/
 *     NUMERIC-EDITED -> ZERO (PICTURE-formatted for an edited item) -
 *     reusing the exact same repeatedCharLiteralFor/zeroLiteralFor helpers
 *     MOVE SPACES/MOVE ZERO already use, so all three stay consistent.
 *   - A REPLACING clause IS present: only a leaf whose CATEGORY matches one
 *     of the REPLACING phrases is touched at all (the value is coerced to
 *     the leaf's own type/width exactly like an ordinary MOVE source -
 *     renderMoveSource already does this for a Literal or VariableReference
 *     operand, the only two forms parseInitializeStatement's `parseOperand`
 *     can produce) - a leaf whose category ISN'T mentioned by any REPLACING
 *     phrase is left holding whatever value it already had (verified against
 *     installed GnuCOBOL: `INITIALIZE WS-GROUP REPLACING ALPHANUMERIC DATA
 *     BY "Q"` leaves a NUMERIC sibling at its own VALUE-clause value, not
 *     reset to zero - see tests/corpus/proc/s07-initialize-group-
 *     replacing.cbl's WS-AMOUNT). This is COBOL's actual REPLACING rule, not
 *     "REPLACING overrides the default for its categories, default still
 *     applies to the rest" as might be assumed from the phrase's name alone.
 */
function initializeLeafValueExpr(info, replacing) {
  const match = (replacing || []).find(r => initializeCategoryMatches(info.dataType, r.category));
  if (match) return renderMoveSource(match.value, info);
  if (replacing && replacing.length > 0) return null;
  if (info.dataType === 'numeric' || info.dataType === 'edited') return zeroLiteralFor(info);
  return repeatedCharLiteralFor(' ', info);
}

/**
 * Wrap a scalar INITIALIZE value in nested `Vector.fill(...)` per the leaf's
 * own OCCURS ancestry - outermost dimension first, mirroring
 * scala-generator.js's buildFieldRegistry's own `defaultExpr` nesting
 * exactly (same `occursCounts` array, same fold direction), so every element
 * of a table nested inside (or itself) an INITIALIZE target is set, not just
 * a single scalar assigned to what is actually a `Vector[...]`-typed var.
 *
 * `skipDims` (round-11 finding 3) is the count of *outermost* OCCURS
 * dimensions to leave un-wrapped - i.e. already consumed by an explicit
 * subscript on the INITIALIZE target itself (`INITIALIZE WS-ENTRY(WS-I)`),
 * for which renderAssignment's own `.updated(...)` rebuild (not a fresh
 * `Vector.fill`) supplies that dimension instead - see
 * initializeAssignmentLines/generateInitialize's subscripted branches. `0`
 * (the default) wraps every dimension, exactly the prior unconditional
 * behavior for an un-subscripted target.
 */
function wrapInitializeOccurs(scalarExpr, info, skipDims = 0) {
  let expr = scalarExpr;
  const counts = info.occursCounts || [];
  for (let i = counts.length - 1; i >= skipDims; i--) {
    expr = `Vector.fill(${counts[i]})(${expr})`;
  }
  return expr;
}

/**
 * One assignment line per elementary leaf reachable from `groupKey`
 * (recursing into any nested-group child via GROUP_REGISTRY, exactly like
 * correspondingPairs' own recursion). A FILLER child (round-5 finding 3's
 * `isFiller` GROUP_REGISTRY entries) is skipped entirely - COBOL INITIALIZE
 * never touches FILLER, it has no addressable identity to assign through in
 * the first place.
 *
 * `subscripts` (round-11 finding 3) is the INITIALIZE target's own subscript
 * list when the target itself is a subscripted OCCURS group element
 * (`INITIALIZE WS-ENTRY(WS-I)` - `WS-ENTRY` is the OCCURS-bearing group,
 * `WS-I` selects ONE row of it). Previously this recursion always emitted a
 * bare `<child camel> = Vector.fill(<full count>)(...)` for every leaf -
 * i.e. it silently ignored the target's own subscript entirely and wiped
 * EVERY row of the table, ready for the INITIALIZE to have been of the
 * table's bare (unsubscripted) name - ` INITIALIZE WS-ENTRY(2)` produced
 * exactly the same generated code as `INITIALIZE WS-ENTRY`, ignoring the row
 * a real cobc INITIALIZE targets. When `subscripts` is present, each leaf's
 * assignment instead goes through renderAssignment (the same `.updated(idx,
 * value)` per-row rebuild any subscripted MOVE target uses) so only the
 * selected row's copy of that leaf changes, wrapping the value in
 * Vector.fill for any *further* nested OCCURS dimension inside this leaf
 * beyond what `subscripts` already selects (wrapInitializeOccurs's
 * `skipDims`) - this is what makes a multi-dimensional OCCURS (an
 * INITIALIZE target subscripted only down to an outer dimension, leaving an
 * inner OCCURS dimension unindexed) reset that leaf's entire remaining
 * inner structure, not a single scalar.
 */
function initializeAssignmentLines(groupKey, replacing, indentStr, subscripts) {
  const children = GROUP_REGISTRY.get(groupKey) || [];
  const lines = [];
  const hasSubscripts = Array.isArray(subscripts) && subscripts.length > 0;
  for (const c of children) {
    if (c.isFiller) continue;
    if (c.groupKey) {
      lines.push(...initializeAssignmentLines(c.groupKey, replacing, indentStr, subscripts));
      continue;
    }
    const info = c.info || lookupField(c.nameUpper);
    if (!info) continue;
    const scalarExpr = initializeLeafValueExpr(info, replacing);
    if (scalarExpr == null) continue; // REPLACING present but this leaf's category wasn't mentioned - leave it untouched
    if (hasSubscripts) {
      const wrapped = wrapInitializeOccurs(scalarExpr, info, subscripts.length);
      const syntheticTarget = { name: c.nameUpper, subscripts };
      lines.push(`${indentStr}${renderAssignment(syntheticTarget, wrapped)}`);
    } else {
      lines.push(`${indentStr}${c.camel} = ${wrapInitializeOccurs(scalarExpr, info)}`);
    }
  }
  return lines;
}

/**
 * Generate INITIALIZE statement (round-5 finding 4). Previously emitted
 * `<target> = <target>.copy() // INITIALIZE with defaults` unconditionally -
 * always broken, since every WORKING-STORAGE item this generator declares is
 * a flat `var` of a primitive/String/BigDecimal/Vector type, never a case
 * class - `.copy()` isn't a member of any of them, a guaranteed compile
 * error on every single INITIALIZE statement regardless of target shape.
 * Implements the real per-category default rules (via
 * initializeLeafValueExpr) for both a GROUP target (recursing over its
 * children through GROUP_REGISTRY, honoring OCCURS/FILLER/REPLACING - see
 * initializeAssignmentLines) and a plain elementary target.
 *
 * round-11 finding 3: a target's own subscript list (`INITIALIZE
 * WS-ENTRY(WS-I)` for an OCCURS group, or `INITIALIZE WS-ELEM(WS-I)` for a
 * directly OCCURS-bearing elementary item) is threaded through to both the
 * group-recursion path (initializeAssignmentLines) and the elementary path
 * below, so only the ONE indexed row/element is rebuilt via renderAssignment
 * (the same subscripted-MOVE-target `.updated(idx, value)` convention),
 * never the whole table.
 */
function generateInitialize(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const targets = statement.targets && statement.targets.length > 0 ? statement.targets : [statement.target].filter(Boolean);
  const lines = [];

  for (const target of targets) {
    const nameUpper = String(target?.name || target || '').toUpperCase();
    const groupKey = resolveGroupKey(nameUpper);
    const subscripts = target && typeof target === 'object' && Array.isArray(target.subscripts) && target.subscripts.length > 0
      ? target.subscripts
      : null;

    if (GROUP_REGISTRY.has(groupKey)) {
      const groupLines = initializeAssignmentLines(groupKey, statement.replacing, indentStr, subscripts);
      lines.push(...(groupLines.length > 0 ? groupLines : [`${indentStr}() // INITIALIZE ${nameUpper}: no addressable children found`]));
      continue;
    }

    const info = lookupFieldForRef(target);
    if (!info) {
      lines.push(`${indentStr}() // INITIALIZE ${nameUpper}: not found in field registry`);
      continue;
    }
    const scalarExpr = initializeLeafValueExpr(info, statement.replacing);
    if (scalarExpr == null) {
      lines.push(`${indentStr}() // INITIALIZE ${nameUpper}: REPLACING present, this item's category not mentioned - left untouched`);
      continue;
    }
    const skipDims = subscripts ? subscripts.length : 0;
    lines.push(`${indentStr}${renderAssignment(target, wrapInitializeOccurs(scalarExpr, info, skipDims))}`);
  }

  return lines.length > 0 ? lines.join('\n') : `${indentStr}()`;
}

export default {
  convertArithmeticExpression,
  convertCondition,
  generateExpression,
  generateCompute,
  generateMove,
  generateMoveCorresponding,
  generateIf,
  generateEvaluate,
  generateString,
  generateUnstring,
  generateInspect,
  generatePerform,
  generateCall,
  setFieldRegistry,
  generateCobolFmtHelper,
  generateCobolInspectHelper,
  generateCobolUnstringHelper,
  formatEditedPicture,
};
