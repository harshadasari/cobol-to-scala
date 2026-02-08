package com.cobol2scala.parser

/**
 * Abstract Syntax Tree definitions for COBOL programs.
 *
 * Focuses primarily on DATA DIVISION structures for the MVP,
 * with placeholders for PROCEDURE DIVISION.
 */

// =============================================================================
// PIC Clause Representation
// =============================================================================

/**
 * Represents a parsed PIC clause with its semantic meaning.
 *
 * Examples:
 *   PIC X(10)           -> PicClause(Alphanumeric, 10, 0, false, false)
 *   PIC 9(5)            -> PicClause(Numeric, 5, 0, false, false)
 *   PIC S9(7)V99        -> PicClause(Numeric, 9, 2, true, false)
 *   PIC S9(11)V99 COMP-3 -> handled by Usage enum
 */
case class PicClause(
  dataType: PicType,
  totalDigits: Int,        // Total digits/characters
  decimalDigits: Int,      // Digits after implied decimal (V)
  signed: Boolean,         // Has S prefix
  isEdited: Boolean,       // Contains edit characters ($, Z, etc.)
  rawPattern: String       // Original pattern for reference
):
  def integerDigits: Int = totalDigits - decimalDigits
  def displayLength: Int = totalDigits + (if signed then 1 else 0)

enum PicType:
  case Alphanumeric  // X
  case Alphabetic    // A
  case Numeric       // 9
  case NumericEdited // 9 with edit chars
  case AlphanumericEdited // X with edit chars

// =============================================================================
// Usage Clause (COMP types)
// =============================================================================

enum Usage:
  case Display          // Default, 1 byte per character
  case Comp             // Binary (COMP, COMP-4, BINARY)
  case Comp1            // Single precision float (4 bytes)
  case Comp2            // Double precision float (8 bytes)
  case Comp3            // Packed decimal (BCD)
  case Comp5            // Native binary
  case PackedDecimal    // Same as COMP-3
  case Index            // Index data item

object Usage:
  def bytesRequired(usage: Usage, totalDigits: Int): Int = usage match
    case Display => totalDigits
    case Comp | Comp5 =>
      if totalDigits <= 4 then 2
      else if totalDigits <= 9 then 4
      else 8
    case Comp1 => 4
    case Comp2 => 8
    case Comp3 | PackedDecimal => (totalDigits + 2) / 2
    case Index => 4

// =============================================================================
// OCCURS Clause
// =============================================================================

case class OccursClause(
  times: Int,                           // Fixed number of occurrences
  dependingOn: Option[String] = None,   // Variable length (ODO)
  minTimes: Option[Int] = None,         // Minimum for ODO
  indexedBy: List[String] = Nil,        // Index names
  keys: List[OccursKey] = Nil           // For SEARCH ALL
)

case class OccursKey(
  ascending: Boolean,
  fieldName: String
)

// =============================================================================
// Level 88 Condition Names
// =============================================================================

case class ConditionValue(
  values: List[ConditionValueItem]
)

enum ConditionValueItem:
  case Single(value: LiteralValue)
  case Range(from: LiteralValue, to: LiteralValue)

enum LiteralValue:
  case StringLit(value: String)
  case NumericLit(value: BigDecimal)
  case FigurativeConstant(name: String)  // ZERO, SPACES, etc.

// =============================================================================
// Data Items (01-49, 66, 77, 88 levels)
// =============================================================================

/**
 * Represents a single data item in the DATA DIVISION.
 */
case class DataItem(
  level: Int,                              // 01-49, 66, 77, 88
  name: Option[String],                    // None for FILLER
  pic: Option[PicClause] = None,           // PIC clause (elementary items)
  usage: Usage = Usage.Display,            // USAGE clause
  value: Option[LiteralValue] = None,      // VALUE clause
  occurs: Option[OccursClause] = None,     // OCCURS clause
  redefines: Option[String] = None,        // REDEFINES clause
  renames: Option[RenamesClause] = None,   // RENAMES clause (level 66)
  conditions: List[Level88] = Nil,         // Associated 88 levels
  children: List[DataItem] = Nil,          // Subordinate items (for groups)
  position: Option[Position] = None        // Source position
):
  def isGroup: Boolean = pic.isEmpty && level != 88 && level != 66
  def isElementary: Boolean = pic.isDefined
  def isFiller: Boolean = name.isEmpty
  def isCondition: Boolean = level == 88

  /** Calculate byte length of this item */
  def byteLength: Int =
    if isGroup then children.map(_.byteLength).sum
    else pic match
      case Some(p) => Usage.bytesRequired(usage, p.totalDigits)
      case None => 0

case class Level88(
  name: String,
  values: ConditionValue,
  position: Option[Position] = None
)

case class RenamesClause(
  fromField: String,
  toField: Option[String]  // None if single field, Some if THRU
)

// =============================================================================
// Copybook / DATA DIVISION Structure
// =============================================================================

/**
 * A complete copybook or DATA DIVISION section.
 */
case class Copybook(
  name: Option[String],
  records: List[DataItem],              // Top-level 01/77 items
  sourceFile: Option[String] = None
):
  def allItems: List[DataItem] =
    def flatten(item: DataItem): List[DataItem] =
      item :: item.children.flatMap(flatten)
    records.flatMap(flatten)

// =============================================================================
// PROCEDURE DIVISION (Placeholder for Phase 2)
// =============================================================================

enum Statement:
  case Move(from: Expression, to: List[String])
  case Compute(target: String, expression: Expression, rounded: Boolean)
  case If(condition: Expression, thenBlock: List[Statement], elseBlock: List[Statement])
  case Evaluate(subject: Expression, whenClauses: List[WhenClause])
  case Perform(paragraphName: String, times: Option[Int], until: Option[Expression])
  case Call(programName: String, using: List[String])
  case Display(items: List[Expression])
  case Accept(target: String)
  case Read(fileName: String, intoVar: Option[String], atEnd: List[Statement])
  case Write(recordName: String, from: Option[String])
  case Open(mode: OpenMode, files: List[String])
  case Close(files: List[String])
  case StopRun
  case Goback
  case Continue
  case ExecSql(sql: String)
  case ExecCics(command: String)

case class WhenClause(
  conditions: List[Expression],
  statements: List[Statement]
)

enum OpenMode:
  case Input, Output, IO, Extend

enum Expression:
  case Identifier(name: String)
  case Literal(value: LiteralValue)
  case BinaryOp(left: Expression, op: String, right: Expression)
  case UnaryOp(op: String, operand: Expression)
  case FunctionCall(name: String, args: List[Expression])
  case RefMod(base: String, start: Expression, length: Option[Expression])

case class Paragraph(
  name: String,
  statements: List[Statement]
)

case class Section(
  name: String,
  paragraphs: List[Paragraph]
)

// =============================================================================
// Complete COBOL Program
// =============================================================================

case class CobolProgram(
  programId: String,
  dataDivision: Option[Copybook],
  procedureDivision: List[Section],
  sourceFile: Option[String] = None
)
