/**
 * COBOL AST (Abstract Syntax Tree) Type Definitions
 * Defines all node types for representing parsed COBOL programs
 */

/**
 * Base AST Node
 */
export class ASTNode {
  constructor(type, location = null) {
    this.type = type;
    this.location = location;
  }

  toJSON() {
    return { ...this };
  }
}

// ============================================================================
// DATA DIVISION AST NODES
// ============================================================================

/**
 * PIC Clause representation
 */
export class PicClause extends ASTNode {
  constructor(options = {}) {
    super('PicClause', options.location);
    this.pattern = options.pattern || '';           // Original PIC pattern (e.g., "X(10)", "S9(5)V99")
    this.dataType = options.dataType || 'alphanumeric'; // alphanumeric, numeric, alphabetic, edited
    this.length = options.length || 0;              // Total length in characters
    this.integerDigits = options.integerDigits || 0; // Digits before decimal
    this.decimalDigits = options.decimalDigits || 0; // Digits after decimal
    this.signed = options.signed || false;          // Has sign (S)
    this.signSeparate = options.signSeparate || false;
    this.signLeading = options.signLeading || true;
    this.impliedDecimal = options.impliedDecimal || false; // Has V
    this.editPattern = options.editPattern || null; // For edited numerics
  }
}

/**
 * OCCURS Clause representation
 */
export class OccursClause extends ASTNode {
  constructor(options = {}) {
    super('OccursClause', options.location);
    this.times = options.times || 0;                // Fixed number of occurrences
    this.minTimes = options.minTimes || null;       // For DEPENDING ON (minimum)
    this.maxTimes = options.maxTimes || null;       // For DEPENDING ON (maximum)
    this.dependingOn = options.dependingOn || null; // Variable-length array control field
    this.indexedBy = options.indexedBy || [];       // Index names
    this.ascending = options.ascending || [];       // ASCENDING KEY fields
    this.descending = options.descending || [];     // DESCENDING KEY fields
  }
}

/**
 * Level 88 condition name
 */
export class Level88 extends ASTNode {
  constructor(options = {}) {
    super('Level88', options.location);
    this.name = options.name || '';
    this.values = options.values || [];             // Array of values or value ranges
    this.through = options.through || null;         // THROUGH value for ranges
    this.falseValue = options.falseValue || null;   // FALSE IS value
  }
}

/**
 * Data Item (variable) definition
 */
export class DataItem extends ASTNode {
  constructor(options = {}) {
    super('DataItem', options.location);
    this.level = options.level || 1;
    this.name = options.name || '';
    this.pic = options.pic || null;                 // PicClause
    this.usage = options.usage || 'DISPLAY';        // COMP, COMP-3, BINARY, etc.
    this.occurs = options.occurs || null;           // OccursClause
    this.redefines = options.redefines || null;     // Name of redefined field
    this.renames = options.renames || null;         // For level 66
    this.renamesThrough = options.renamesThrough || null;
    this.value = options.value || null;             // Initial value
    this.children = options.children || [];         // Nested data items
    this.conditions = options.conditions || [];     // Level 88 conditions
    this.isFiller = options.isFiller || false;
    this.isExternal = options.isExternal || false;
    this.isGlobal = options.isGlobal || false;
    this.blankWhenZero = options.blankWhenZero || false;
    this.justified = options.justified || null;     // LEFT or RIGHT
    this.sync = options.sync || false;
    this.sign = options.sign || null;               // { separate: bool, leading: bool }
  }

  /**
   * Get the total size of this data item in bytes
   */
  getSize() {
    if (this.pic) {
      let size = this.pic.length;
      if (this.usage === 'COMP-3' || this.usage === 'PACKED-DECIMAL') {
        size = Math.ceil((this.pic.length + 1) / 2);
      } else if (this.usage === 'COMP' || this.usage === 'BINARY') {
        if (this.pic.integerDigits <= 4) size = 2;
        else if (this.pic.integerDigits <= 9) size = 4;
        else size = 8;
      }
      if (this.occurs) {
        size *= this.occurs.times || this.occurs.maxTimes || 1;
      }
      return size;
    }
    // Group item - sum of children
    return this.children.reduce((sum, child) => sum + child.getSize(), 0);
  }

  /**
   * Check if this is a group item
   */
  isGroup() {
    return this.children.length > 0;
  }

  /**
   * Check if this is an elementary item
   */
  isElementary() {
    return this.children.length === 0;
  }
}

/**
 * File Description (FD) entry
 */
export class FileDescription extends ASTNode {
  constructor(options = {}) {
    super('FileDescription', options.location);
    this.name = options.name || '';
    this.type = options.type || 'FD';               // FD or SD
    this.blockContains = options.blockContains || null;
    this.recordContains = options.recordContains || null;
    this.labelRecords = options.labelRecords || 'STANDARD';
    this.dataRecords = options.dataRecords || [];
    this.records = options.records || [];           // Array of DataItem (01-level records)
    // round-32 finding 1 (hh01): `LINAGE IS <n> LINES` page size, a plain
    // integer literal only (a data-name-driven LINAGE, e.g. `LINAGE IS
    // WS-PAGE-SIZE LINES`, is parsed as `null` here - not exercised by any
    // corpus program) - drives WRITE's own AT END-OF-PAGE/NOT AT END-OF-PAGE
    // clause (see generator/expression-gen.js's generateWriteStatement).
    this.linageLines = options.linageLines || null;
    // round-33 finding 1 (ii01): `WITH FOOTING AT <m>` - a plain integer
    // literal only (mirroring linageLines' own scope), the line number
    // (measured from the running per-page line counter) at which the
    // footing area begins. Real cobc fires AT END-OF-PAGE once the counter
    // reaches (linageLines - linageFootingLines), not linageLines itself -
    // see generator/expression-gen.js's linageEopLines. `null` (no FOOTING
    // clause at all) keeps the pre-existing bare-LINAGE comparison against
    // linageLines unchanged.
    this.linageFootingLines = options.linageFootingLines || null;
  }
}

/**
 * Working-Storage Section
 */
export class WorkingStorageSection extends ASTNode {
  constructor(options = {}) {
    super('WorkingStorageSection', options.location);
    this.items = options.items || [];
  }
}

/**
 * Linkage Section
 */
export class LinkageSection extends ASTNode {
  constructor(options = {}) {
    super('LinkageSection', options.location);
    this.items = options.items || [];
  }
}

/**
 * File Section
 */
export class FileSection extends ASTNode {
  constructor(options = {}) {
    super('FileSection', options.location);
    this.files = options.files || [];               // Array of FileDescription
  }
}

/**
 * Local-Storage Section
 */
export class LocalStorageSection extends ASTNode {
  constructor(options = {}) {
    super('LocalStorageSection', options.location);
    this.items = options.items || [];
  }
}

// ============================================================================
// PROCEDURE DIVISION AST NODES
// ============================================================================

/**
 * Procedure (paragraph or section)
 */
export class Procedure extends ASTNode {
  constructor(options = {}) {
    super('Procedure', options.location);
    this.name = options.name || '';
    this.procedureType = options.procedureType || 'paragraph'; // paragraph or section
    this.statements = options.statements || [];
    this.paragraphs = options.paragraphs || [];     // For sections containing paragraphs
    // round-10 finding 1: only ever set on a DECLARATIVES SECTION (see
    // ProcedureDivision.declaratives below) - the section's own mandatory
    // USE statement, e.g. `{ kind: 'ERROR', after: true, targets: [{ kind:
    // 'FILE', name: 'IN-FILE' }] }` for `USE AFTER STANDARD ERROR PROCEDURE
    // ON IN-FILE` - or `{ kind: 'UNSUPPORTED' }` for any other USE form
    // (USE FOR DEBUGGING, USE BEFORE REPORTING, ...), which this generator
    // parses (so it doesn't corrupt the token stream) but never wires into
    // any invocation path. `null` for every ordinary (non-declarative)
    // section/paragraph - unaffected by this addition.
    this.useClause = options.useClause || null;
  }
}

/**
 * Base class for statements
 */
export class Statement extends ASTNode {
  constructor(type, options = {}) {
    super(type, options.location);
  }
}

/**
 * PERFORM statement
 */
export class PerformStatement extends Statement {
  constructor(options = {}) {
    super('PerformStatement', options);
    this.performType = options.performType || 'simple'; // simple, times, until, varying, inline
    this.targetParagraph = options.targetParagraph || null;
    // OF/IN qualifier explicitly disambiguating targetParagraph when its bare
    // name collides across sections (round-12 bonus finding, z12) - e.g.
    // `PERFORM PARA-ONE OF SECTION-B`. Null for the (overwhelmingly common)
    // unqualified form.
    this.targetSection = options.targetSection || null;
    this.throughParagraph = options.throughParagraph || null;
    this.throughSection = options.throughSection || null;
    this.times = options.times || null;             // Expression for TIMES
    this.until = options.until || null;             // Condition for UNTIL
    this.testBefore = options.testBefore !== false; // WITH TEST BEFORE/AFTER
    this.varying = options.varying || null;         // VaryingClause
    this.statements = options.statements || [];     // For inline PERFORM
  }
}

/**
 * VARYING clause for PERFORM
 */
export class VaryingClause extends ASTNode {
  constructor(options = {}) {
    super('VaryingClause', options.location);
    this.variable = options.variable || '';
    this.from = options.from || null;
    this.by = options.by || null;
    this.until = options.until || null;
    this.after = options.after || [];               // Additional AFTER clauses
  }
}

/**
 * IF statement
 */
export class IfStatement extends Statement {
  constructor(options = {}) {
    super('IfStatement', options);
    this.condition = options.condition || null;
    this.thenStatements = options.thenStatements || [];
    this.elseStatements = options.elseStatements || [];
  }
}

/**
 * EVALUATE statement
 */
export class EvaluateStatement extends Statement {
  constructor(options = {}) {
    super('EvaluateStatement', options);
    this.subjects = options.subjects || [];         // What we're evaluating (ALSO support)
    this.whenClauses = options.whenClauses || [];   // Array of WhenClause
    this.whenOther = options.whenOther || null;     // WHEN OTHER statements
  }
}

/**
 * WHEN clause for EVALUATE
 */
export class WhenClause extends ASTNode {
  constructor(options = {}) {
    super('WhenClause', options.location);
    this.conditions = options.conditions || [];     // Conditions to match (ALSO support)
    this.statements = options.statements || [];
  }
}

/**
 * MOVE statement
 */
export class MoveStatement extends Statement {
  constructor(options = {}) {
    super('MoveStatement', options);
    this.source = options.source || null;
    this.targets = options.targets || [];
    this.corresponding = options.corresponding || false;
  }
}

/**
 * COMPUTE statement
 */
export class ComputeStatement extends Statement {
  constructor(options = {}) {
    super('ComputeStatement', options);
    this.targets = options.targets || [];           // Variables being assigned
    this.expression = options.expression || null;   // Arithmetic expression
    this.rounded = options.rounded || false;
    this.onSizeError = options.onSizeError || [];
    this.notOnSizeError = options.notOnSizeError || [];
  }
}

/**
 * Arithmetic expression
 */
export class ArithmeticExpression extends ASTNode {
  constructor(options = {}) {
    super('ArithmeticExpression', options.location);
    this.operator = options.operator || null;       // +, -, *, /, **
    this.left = options.left || null;
    this.right = options.right || null;
    this.value = options.value || null;             // For literals
    this.variable = options.variable || null;       // For variable references
    this.functionCall = options.functionCall || null; // FUNCTION intrinsic call
    this.unaryMinus = options.unaryMinus || false;
  }
}

/**
 * FUNCTION intrinsic call, e.g. FUNCTION UPPER-CASE(WS-TEXT),
 * FUNCTION MOD(17, 5). Appears anywhere an operand/expression is legal
 * (MOVE source, COMPUTE expression, DISPLAY operand, condition subject).
 */
export class FunctionCall extends ASTNode {
  constructor(options = {}) {
    super('FunctionCall', options.location);
    this.name = options.name || '';
    this.arguments = options.arguments || [];
  }
}

/**
 * ADD statement
 */
export class AddStatement extends Statement {
  constructor(options = {}) {
    super('AddStatement', options);
    this.addends = options.addends || [];
    this.to = options.to || [];
    this.giving = options.giving || [];
    this.rounded = options.rounded || false;
    this.corresponding = options.corresponding || false;
    this.onSizeError = options.onSizeError || [];
    this.notOnSizeError = options.notOnSizeError || [];
  }
}

/**
 * SUBTRACT statement
 */
export class SubtractStatement extends Statement {
  constructor(options = {}) {
    super('SubtractStatement', options);
    this.subtrahends = options.subtrahends || [];
    this.from = options.from || [];
    this.giving = options.giving || [];
    this.rounded = options.rounded || false;
    this.corresponding = options.corresponding || false;
    this.onSizeError = options.onSizeError || [];
    this.notOnSizeError = options.notOnSizeError || [];
  }
}

/**
 * MULTIPLY statement
 */
export class MultiplyStatement extends Statement {
  constructor(options = {}) {
    super('MultiplyStatement', options);
    this.multiplicand = options.multiplicand || null;
    this.by = options.by || [];
    this.giving = options.giving || [];
    this.rounded = options.rounded || false;
    this.onSizeError = options.onSizeError || [];
    this.notOnSizeError = options.notOnSizeError || [];
  }
}

/**
 * DIVIDE statement
 */
export class DivideStatement extends Statement {
  constructor(options = {}) {
    super('DivideStatement', options);
    this.dividend = options.dividend || null;
    this.divisor = options.divisor || null;
    this.into = options.into || [];
    this.giving = options.giving || [];
    this.remainder = options.remainder || null;
    this.rounded = options.rounded || false;
    this.onSizeError = options.onSizeError || [];
    this.notOnSizeError = options.notOnSizeError || [];
  }
}

/**
 * STRING statement
 */
export class StringStatement extends Statement {
  constructor(options = {}) {
    super('StringStatement', options);
    this.sources = options.sources || [];           // Array of { value, delimitedBy }
    this.into = options.into || null;
    this.pointer = options.pointer || null;
    this.onOverflow = options.onOverflow || [];
    this.notOnOverflow = options.notOnOverflow || [];
  }
}

/**
 * UNSTRING statement
 */
export class UnstringStatement extends Statement {
  constructor(options = {}) {
    super('UnstringStatement', options);
    this.source = options.source || null;
    this.delimiters = options.delimiters || [];
    this.into = options.into || [];                 // Array of { target, delimiter, count }
    this.pointer = options.pointer || null;
    this.tallying = options.tallying || null;
    this.onOverflow = options.onOverflow || [];
    this.notOnOverflow = options.notOnOverflow || [];
  }
}

/**
 * INSPECT statement
 */
export class InspectStatement extends Statement {
  constructor(options = {}) {
    super('InspectStatement', options);
    this.target = options.target || null;
    this.inspectType = options.inspectType || 'tallying'; // tallying, replacing, converting
    this.tallying = options.tallying || [];
    this.replacing = options.replacing || [];
    this.converting = options.converting || null;
  }
}

/**
 * SEARCH / SEARCH ALL statement
 */
export class SearchStatement extends Statement {
  constructor(options = {}) {
    super('SearchStatement', options);
    this.searchAll = options.searchAll || false;    // true for SEARCH ALL (binary search)
    this.target = options.target || null;           // VariableReference to the OCCURS table/index-name
    this.varying = options.varying || null;         // VARYING identifier (linear SEARCH only)
    this.atEnd = options.atEnd || [];               // AT END imperative statements
    this.whenClauses = options.whenClauses || [];   // Array of SearchWhenClause
  }
}

/**
 * WHEN clause for SEARCH / SEARCH ALL
 */
export class SearchWhenClause extends ASTNode {
  constructor(options = {}) {
    super('SearchWhenClause', options.location);
    this.condition = options.condition || null;
    this.statements = options.statements || [];
  }
}

/**
 * SORT statement (table sort or file sort with
 * USING/GIVING/INPUT PROCEDURE/OUTPUT PROCEDURE)
 */
export class SortStatement extends Statement {
  constructor(options = {}) {
    super('SortStatement', options);
    this.fileName = options.fileName || null;       // Table name or SD file name
    this.keys = options.keys || [];                 // Array of { order, fields }
    this.duplicates = options.duplicates || false;  // WITH DUPLICATES IN ORDER
    this.collatingSequence = options.collatingSequence || null;
    this.using = options.using || [];               // Array of file names (USING form)
    this.inputProcedure = options.inputProcedure || null;   // { procedure, through }
    this.giving = options.giving || [];              // Array of file names (GIVING form)
    this.outputProcedure = options.outputProcedure || null; // { procedure, through }
  }
}

/**
 * MERGE statement
 */
export class MergeStatement extends Statement {
  constructor(options = {}) {
    super('MergeStatement', options);
    this.fileName = options.fileName || null;
    this.keys = options.keys || [];
    this.collatingSequence = options.collatingSequence || null;
    this.using = options.using || [];
    this.giving = options.giving || [];
    this.outputProcedure = options.outputProcedure || null; // { procedure, through }
  }
}

/**
 * RELEASE statement (writes a record to a SORT work file from an
 * INPUT PROCEDURE)
 */
export class ReleaseStatement extends Statement {
  constructor(options = {}) {
    super('ReleaseStatement', options);
    this.recordName = options.recordName || null;
    this.from = options.from || null;
  }
}

/**
 * RETURN statement (reads the next sorted/merged record inside an
 * OUTPUT PROCEDURE)
 */
export class ReturnStatement extends Statement {
  constructor(options = {}) {
    super('ReturnStatement', options);
    this.fileName = options.fileName || null;
    this.into = options.into || null;
    this.atEnd = options.atEnd || [];
    this.notAtEnd = options.notAtEnd || [];
  }
}

/**
 * CALL statement
 */
export class CallStatement extends Statement {
  constructor(options = {}) {
    super('CallStatement', options);
    this.programName = options.programName || null; // Can be literal or variable
    this.using = options.using || [];               // Array of { mode, value }
    this.returning = options.returning || null;
    this.onException = options.onException || [];
    this.notOnException = options.notOnException || [];
    this.onOverflow = options.onOverflow || [];
  }
}

/**
 * Parameter passing mode for CALL
 */
export class CallParameter extends ASTNode {
  constructor(options = {}) {
    super('CallParameter', options.location);
    this.mode = options.mode || 'REFERENCE';        // REFERENCE, CONTENT, VALUE
    this.value = options.value || null;
    this.length = options.length || null;           // LENGTH OF clause
    // CALL ... USING ... OMITTED (round-12 finding 4): this positional
    // argument was explicitly not supplied. `value` stays null; codegen
    // passes the callee parameter's own zero/spaces default in this slot and
    // never writes a post-call value back (there is no caller-side operand
    // to write back into - see generator/expression-gen.js's generateCall).
    this.omitted = options.omitted || false;
  }
}

// ============================================================================
// FILE I/O STATEMENTS
// ============================================================================

/**
 * OPEN statement
 */
export class OpenStatement extends Statement {
  constructor(options = {}) {
    super('OpenStatement', options);
    this.files = options.files || [];               // Array of { mode, fileName }
  }
}

/**
 * CLOSE statement
 */
export class CloseStatement extends Statement {
  constructor(options = {}) {
    super('CloseStatement', options);
    this.files = options.files || [];
  }
}

/**
 * READ statement
 */
export class ReadStatement extends Statement {
  constructor(options = {}) {
    super('ReadStatement', options);
    this.fileName = options.fileName || null;
    this.into = options.into || null;
    this.key = options.key || null;
    this.next = options.next || false;
    this.previous = options.previous || false;
    this.atEnd = options.atEnd || [];
    this.notAtEnd = options.notAtEnd || [];
    this.invalidKey = options.invalidKey || [];
    this.notInvalidKey = options.notInvalidKey || [];
  }
}

/**
 * WRITE statement
 */
export class WriteStatement extends Statement {
  constructor(options = {}) {
    super('WriteStatement', options);
    this.recordName = options.recordName || null;
    this.from = options.from || null;
    this.advancing = options.advancing || null;     // { type, value }
    this.atEndOfPage = options.atEndOfPage || [];
    this.notAtEndOfPage = options.notAtEndOfPage || [];
    this.invalidKey = options.invalidKey || [];
    this.notInvalidKey = options.notInvalidKey || [];
  }
}

/**
 * REWRITE statement
 */
export class RewriteStatement extends Statement {
  constructor(options = {}) {
    super('RewriteStatement', options);
    this.recordName = options.recordName || null;
    this.from = options.from || null;
    this.invalidKey = options.invalidKey || [];
    this.notInvalidKey = options.notInvalidKey || [];
  }
}

/**
 * DELETE statement
 */
export class DeleteStatement extends Statement {
  constructor(options = {}) {
    super('DeleteStatement', options);
    this.fileName = options.fileName || null;
    this.invalidKey = options.invalidKey || [];
    this.notInvalidKey = options.notInvalidKey || [];
  }
}

/**
 * START statement
 */
export class StartStatement extends Statement {
  constructor(options = {}) {
    super('StartStatement', options);
    this.fileName = options.fileName || null;
    this.key = options.key || null;                 // { operator, field }
    this.invalidKey = options.invalidKey || [];
    this.notInvalidKey = options.notInvalidKey || [];
  }
}

// ============================================================================
// CONTROL FLOW STATEMENTS
// ============================================================================

/**
 * GO TO statement
 */
export class GoToStatement extends Statement {
  constructor(options = {}) {
    super('GoToStatement', options);
    this.targets = options.targets || [];
    // round-21 finding 3: index-aligned with `targets` - an explicit OF/IN
    // section qualifier on a given target (`GO TO para OF section`), or null
    // where a target carries none. Mirrors PerformStatement's own
    // targetSection/throughSection qualifier (see parsePerformStatement),
    // extended to GO TO's own (possibly multi-target, DEPENDING ON) form.
    this.targetSections = options.targetSections || [];
    this.dependingOn = options.dependingOn || null;
  }
}

/**
 * STOP RUN statement
 */
export class StopStatement extends Statement {
  constructor(options = {}) {
    super('StopStatement', options);
    this.stopType = options.stopType || 'RUN';      // RUN or literal
    this.returnCode = options.returnCode || null;
  }
}

/**
 * GOBACK statement
 */
export class GobackStatement extends Statement {
  constructor(options = {}) {
    super('GobackStatement', options);
    this.returnCode = options.returnCode || null;
  }
}

/**
 * EXIT statement
 */
export class ExitStatement extends Statement {
  constructor(options = {}) {
    super('ExitStatement', options);
    this.exitType = options.exitType || 'PARAGRAPH'; // PARAGRAPH, SECTION, PROGRAM, PERFORM
  }
}

/**
 * CONTINUE statement
 */
export class ContinueStatement extends Statement {
  constructor(options = {}) {
    super('ContinueStatement', options);
  }
}

/**
 * NEXT SENTENCE statement
 */
export class NextSentenceStatement extends Statement {
  constructor(options = {}) {
    super('NextSentenceStatement', options);
  }
}

/**
 * Placeholder for a statement the parser does not (yet) recognize.
 * Captures its raw token values verbatim, up to a safe boundary (period,
 * next recognized statement keyword, an enclosing block's terminator, or
 * a paragraph/section name) so that unsupported verbs are visible in the
 * AST instead of silently vanishing or corrupting a neighboring
 * statement's operand list (see tests/corpus/README.md).
 */
export class UnknownStatement extends Statement {
  constructor(options = {}) {
    super('UnknownStatement', options);
    this.keyword = options.keyword || '';           // First token's raw value
    this.tokens = options.tokens || [];              // All captured raw token values
  }
}

// ============================================================================
// OTHER STATEMENTS
// ============================================================================

/**
 * INITIALIZE statement
 */
export class InitializeStatement extends Statement {
  constructor(options = {}) {
    super('InitializeStatement', options);
    this.targets = options.targets || [];
    this.replacing = options.replacing || [];       // Array of { category, value }
  }
}

/**
 * SET statement
 */
export class SetStatement extends Statement {
  constructor(options = {}) {
    super('SetStatement', options);
    this.setType = options.setType || 'value';      // value, index, condition, pointer
    this.targets = options.targets || [];
    this.value = options.value || null;
    this.upDown = options.upDown || null;           // UP BY or DOWN BY
  }
}

/**
 * ACCEPT statement
 */
export class AcceptStatement extends Statement {
  constructor(options = {}) {
    super('AcceptStatement', options);
    this.target = options.target || null;
    this.from = options.from || null;               // DATE, TIME, DAY, etc.
  }
}

/**
 * DISPLAY statement
 */
export class DisplayStatement extends Statement {
  constructor(options = {}) {
    super('DisplayStatement', options);
    this.values = options.values || [];
    this.upon = options.upon || null;               // Device name
    this.noAdvancing = options.noAdvancing || false;
  }
}

// ============================================================================
// SQL/CICS STATEMENTS
// ============================================================================

/**
 * EXEC SQL statement
 */
export class SqlStatement extends Statement {
  constructor(options = {}) {
    super('SqlStatement', options);
    this.sqlType = options.sqlType || 'unknown';    // SELECT, INSERT, UPDATE, DELETE, etc.
    this.rawSql = options.rawSql || '';
    this.hostVariables = options.hostVariables || [];
    this.cursorName = options.cursorName || null;
    this.intoClause = options.intoClause || [];
    this.tables = options.tables || [];
    this.whereClause = options.whereClause || null;
  }
}

/**
 * EXEC CICS statement
 */
export class CicsStatement extends Statement {
  constructor(options = {}) {
    super('CicsStatement', options);
    this.command = options.command || '';           // SEND, RECEIVE, READ, WRITE, etc.
    this.rawCics = options.rawCics || '';
    this.options = options.options || {};           // Command options
  }
}

// ============================================================================
// CONDITION EXPRESSIONS
// ============================================================================

/**
 * Condition expression
 */
export class Condition extends ASTNode {
  constructor(options = {}) {
    super('Condition', options.location);
    this.conditionType = options.conditionType || 'simple'; // simple, compound, class, sign, relation
    this.operator = options.operator || null;       // AND, OR, NOT
    this.left = options.left || null;
    this.right = options.right || null;
    this.negated = options.negated || false;
  }
}

/**
 * Relational condition
 */
export class RelationalCondition extends Condition {
  constructor(options = {}) {
    super({ ...options, conditionType: 'relation' });
    this.type = 'RelationalCondition';
    this.subject = options.subject || null;
    this.relationalOperator = options.relationalOperator || null; // =, >, <, >=, <=, <>
    this.object = options.object || null;
  }
}

/**
 * Class condition
 */
export class ClassCondition extends Condition {
  constructor(options = {}) {
    super({ ...options, conditionType: 'class' });
    this.type = 'ClassCondition';
    this.subject = options.subject || null;
    this.classType = options.classType || null;     // NUMERIC, ALPHABETIC, etc.
  }
}

/**
 * Sign condition
 */
export class SignCondition extends Condition {
  constructor(options = {}) {
    super({ ...options, conditionType: 'sign' });
    this.type = 'SignCondition';
    this.subject = options.subject || null;
    this.signType = options.signType || null;       // POSITIVE, NEGATIVE, ZERO
  }
}

// ============================================================================
// COPYBOOK
// ============================================================================

/**
 * Copybook representation
 */
export class Copybook extends ASTNode {
  constructor(options = {}) {
    super('Copybook', options.location);
    this.name = options.name || '';
    this.library = options.library || null;
    this.records = options.records || [];           // Array of DataItem
    this.procedures = options.procedures || [];     // Array of Procedure
    this.replacing = options.replacing || [];       // Replacement rules
  }
}

/**
 * COPY statement
 */
export class CopyStatement extends Statement {
  constructor(options = {}) {
    super('CopyStatement', options);
    this.copybookName = options.copybookName || '';
    this.library = options.library || null;
    this.replacing = options.replacing || [];       // Array of { from, to }
  }
}

// ============================================================================
// PROGRAM STRUCTURE
// ============================================================================

/**
 * Complete COBOL program
 */
export class CobolProgram extends ASTNode {
  constructor(options = {}) {
    super('CobolProgram', options.location);
    this.programId = options.programId || '';
    this.identificationDivision = options.identificationDivision || {};
    this.environmentDivision = options.environmentDivision || null;
    this.dataDivision = options.dataDivision || null;
    this.procedureDivision = options.procedureDivision || null;
  }
}

/**
 * Data Division
 */
export class DataDivision extends ASTNode {
  constructor(options = {}) {
    super('DataDivision', options.location);
    this.fileSection = options.fileSection || null;
    this.workingStorageSection = options.workingStorageSection || null;
    this.localStorageSection = options.localStorageSection || null;
    this.linkageSection = options.linkageSection || null;
    this.screenSection = options.screenSection || null;
    this.reportSection = options.reportSection || null;
  }
}

/**
 * Procedure Division
 */
export class ProcedureDivision extends ASTNode {
  constructor(options = {}) {
    super('ProcedureDivision', options.location);
    this.using = options.using || [];               // USING parameters
    this.returning = options.returning || null;
    this.sections = options.sections || [];
    this.paragraphs = options.paragraphs || [];
    // round-10 finding 1: DECLARATIVES ... END DECLARATIVES SECTIONs, kept
    // entirely separate from `sections`/`paragraphs` above (and so excluded
    // from ordinary top-to-bottom program flow - see
    // scala-generator.js/method-gen.js, which only ever flatten `sections`/
    // `paragraphs` into the main fall-through chain). Each entry is a
    // `Procedure` (procedureType: 'section') with its own `useClause` and
    // nested `paragraphs`, exactly like an ordinary section - see
    // parser/procedure-parser.js's parseDeclaratives.
    this.declaratives = options.declaratives || [];
  }
}

// ============================================================================
// VARIABLE REFERENCE
// ============================================================================

/**
 * Variable reference (possibly qualified)
 */
export class VariableReference extends ASTNode {
  constructor(options = {}) {
    super('VariableReference', options.location);
    this.name = options.name || '';
    this.qualifiers = options.qualifiers || [];     // OF/IN qualifiers
    this.subscripts = options.subscripts || [];     // Array subscripts
    this.refMod = options.refMod || null;           // Reference modification (start:length)
  }
}

/**
 * Literal value
 */
export class Literal extends ASTNode {
  constructor(options = {}) {
    super('Literal', options.location);
    this.literalType = options.literalType || 'string'; // string, numeric, figurative
    this.value = options.value;
    this.all = options.all || false;                // ALL literal
  }
}

export default {
  // Base
  ASTNode,

  // Data Division
  PicClause,
  OccursClause,
  Level88,
  DataItem,
  FileDescription,
  WorkingStorageSection,
  LinkageSection,
  FileSection,
  LocalStorageSection,

  // Procedure Division
  Procedure,
  Statement,
  PerformStatement,
  VaryingClause,
  IfStatement,
  EvaluateStatement,
  WhenClause,
  MoveStatement,
  ComputeStatement,
  ArithmeticExpression,
  AddStatement,
  SubtractStatement,
  MultiplyStatement,
  DivideStatement,
  StringStatement,
  UnstringStatement,
  InspectStatement,
  CallStatement,
  CallParameter,
  FunctionCall,
  SearchStatement,
  SearchWhenClause,
  SortStatement,
  MergeStatement,
  ReleaseStatement,
  ReturnStatement,

  // File I/O
  OpenStatement,
  CloseStatement,
  ReadStatement,
  WriteStatement,
  RewriteStatement,
  DeleteStatement,
  StartStatement,

  // Control Flow
  GoToStatement,
  StopStatement,
  GobackStatement,
  ExitStatement,
  ContinueStatement,
  NextSentenceStatement,
  UnknownStatement,

  // Other Statements
  InitializeStatement,
  SetStatement,
  AcceptStatement,
  DisplayStatement,

  // SQL/CICS
  SqlStatement,
  CicsStatement,

  // Conditions
  Condition,
  RelationalCondition,
  ClassCondition,
  SignCondition,

  // Copybook
  Copybook,
  CopyStatement,

  // Program Structure
  CobolProgram,
  DataDivision,
  ProcedureDivision,

  // References
  VariableReference,
  Literal,
};
