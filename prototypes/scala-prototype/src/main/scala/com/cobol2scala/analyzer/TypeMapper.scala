package com.cobol2scala.analyzer

import com.cobol2scala.parser.*

/**
 * Maps COBOL data types to Scala types.
 */
object TypeMapper:

  /**
   * Represents a Scala type with its properties.
   */
  case class ScalaType(
    typeName: String,           // The Scala type name
    needsImport: Boolean,       // Whether it needs an import
    importPath: Option[String], // The import path if needed
    defaultValue: String        // Default value expression
  )

  /**
   * Map a COBOL data item to a Scala type.
   */
  def mapDataItem(item: DataItem): ScalaType =
    item.pic match
      case Some(pic) => mapPicClause(pic, item.usage)
      case None =>
        // Group item - will be a case class
        ScalaType("/* group */", false, None, "null")

  /**
   * Map a PIC clause with USAGE to a Scala type.
   */
  def mapPicClause(pic: PicClause, usage: Usage): ScalaType =
    pic.dataType match
      case PicType.Alphanumeric | PicType.Alphabetic | PicType.AlphanumericEdited =>
        mapAlphanumeric(pic)

      case PicType.Numeric | PicType.NumericEdited =>
        mapNumeric(pic, usage)

  /**
   * Map alphanumeric PIC to Scala type.
   */
  private def mapAlphanumeric(pic: PicClause): ScalaType =
    if pic.totalDigits == 1 then
      ScalaType("Char", false, None, "' '")
    else
      ScalaType("String", false, None, "\"\"")

  /**
   * Map numeric PIC to Scala type.
   */
  private def mapNumeric(pic: PicClause, usage: Usage): ScalaType =
    usage match
      case Usage.Comp1 =>
        ScalaType("Float", false, None, "0.0f")

      case Usage.Comp2 =>
        ScalaType("Double", false, None, "0.0")

      case Usage.Comp3 | Usage.PackedDecimal =>
        // COMP-3 always uses BigDecimal for precision
        ScalaType("BigDecimal", false, None, "BigDecimal(0)")

      case Usage.Comp | Usage.Comp5 =>
        // Binary - size depends on digits
        mapBinaryNumeric(pic)

      case Usage.Display =>
        // Display numeric - check if needs decimal
        if pic.decimalDigits > 0 then
          ScalaType("BigDecimal", false, None, "BigDecimal(0)")
        else
          mapIntegralNumeric(pic)

      case Usage.Index =>
        ScalaType("Int", false, None, "0")

  /**
   * Map binary (COMP) numeric to appropriate integer type.
   */
  private def mapBinaryNumeric(pic: PicClause): ScalaType =
    if pic.decimalDigits > 0 then
      // Has decimal places - use BigDecimal
      ScalaType("BigDecimal", false, None, "BigDecimal(0)")
    else
      // Integer type based on size
      mapIntegralNumeric(pic)

  /**
   * Map integral numeric to Scala integer type.
   */
  private def mapIntegralNumeric(pic: PicClause): ScalaType =
    val digits = pic.integerDigits
    if digits <= 4 then
      ScalaType("Short", false, None, "0")
    else if digits <= 9 then
      ScalaType("Int", false, None, "0")
    else if digits <= 18 then
      ScalaType("Long", false, None, "0L")
    else
      ScalaType("BigDecimal", false, None, "BigDecimal(0)")

  /**
   * Convert COBOL identifier to Scala identifier.
   * COBOL uses hyphens, Scala uses camelCase.
   */
  def toScalaName(cobolName: String): String =
    val parts = cobolName.toLowerCase.split("-")
    if parts.length == 1 then parts.head
    else parts.head + parts.tail.map(_.capitalize).mkString

  /**
   * Convert COBOL identifier to Scala type name (PascalCase).
   */
  def toScalaTypeName(cobolName: String): String =
    cobolName.toLowerCase.split("-").map(_.capitalize).mkString

  /**
   * Get the byte length for reading/writing.
   */
  def byteLength(pic: PicClause, usage: Usage): Int =
    Usage.bytesRequired(usage, pic.totalDigits)

  /**
   * Generate parsing code for a field.
   */
  def generateParseExpression(pic: PicClause, usage: Usage, offset: Int): String =
    val scalaType = mapPicClause(pic, usage)

    usage match
      case Usage.Comp3 | Usage.PackedDecimal =>
        val len = (pic.totalDigits + 2) / 2
        s"PackedDecimal.decode(bytes, $offset, $len, ${pic.decimalDigits})"

      case Usage.Comp | Usage.Comp5 =>
        val len = Usage.bytesRequired(usage, pic.totalDigits)
        if pic.decimalDigits > 0 then
          s"BinaryNumeric.decodeBigDecimal(bytes, $offset, $len, ${pic.decimalDigits})"
        else
          len match
            case 2 => s"BinaryNumeric.decodeShort(bytes, $offset)"
            case 4 => s"BinaryNumeric.decodeInt(bytes, $offset)"
            case 8 => s"BinaryNumeric.decodeLong(bytes, $offset)"
            case _ => s"BinaryNumeric.decodeInt(bytes, $offset)"

      case Usage.Comp1 =>
        s"BinaryNumeric.decodeFloat(bytes, $offset)"

      case Usage.Comp2 =>
        s"BinaryNumeric.decodeDouble(bytes, $offset)"

      case Usage.Display =>
        pic.dataType match
          case PicType.Alphanumeric | PicType.Alphabetic | PicType.AlphanumericEdited =>
            if pic.totalDigits == 1 then
              s"DisplayNumeric.decodeChar(bytes, $offset)"
            else
              s"DisplayNumeric.decodeString(bytes, $offset, ${pic.totalDigits})"

          case PicType.Numeric | PicType.NumericEdited =>
            if pic.decimalDigits > 0 then
              s"DisplayNumeric.decodeBigDecimal(bytes, $offset, ${pic.totalDigits}, ${pic.decimalDigits}, ${pic.signed})"
            else if pic.integerDigits <= 9 then
              s"DisplayNumeric.decodeInt(bytes, $offset, ${pic.totalDigits}, ${pic.signed})"
            else
              s"DisplayNumeric.decodeLong(bytes, $offset, ${pic.totalDigits}, ${pic.signed})"

      case Usage.Index =>
        s"BinaryNumeric.decodeInt(bytes, $offset)"

  /**
   * Generate formatting code for a field.
   */
  def generateFormatExpression(
    fieldName: String,
    pic: PicClause,
    usage: Usage,
    offset: Int
  ): String =
    usage match
      case Usage.Comp3 | Usage.PackedDecimal =>
        val len = (pic.totalDigits + 2) / 2
        s"PackedDecimal.encode($fieldName, bytes, $offset, $len, ${pic.decimalDigits})"

      case Usage.Comp | Usage.Comp5 =>
        val len = Usage.bytesRequired(usage, pic.totalDigits)
        s"BinaryNumeric.encode($fieldName, bytes, $offset, $len)"

      case Usage.Comp1 =>
        s"BinaryNumeric.encodeFloat($fieldName, bytes, $offset)"

      case Usage.Comp2 =>
        s"BinaryNumeric.encodeDouble($fieldName, bytes, $offset)"

      case Usage.Display =>
        pic.dataType match
          case PicType.Alphanumeric | PicType.Alphabetic | PicType.AlphanumericEdited =>
            s"DisplayNumeric.encodeString($fieldName, bytes, $offset, ${pic.totalDigits})"

          case PicType.Numeric | PicType.NumericEdited =>
            s"DisplayNumeric.encodeNumeric($fieldName, bytes, $offset, ${pic.totalDigits}, ${pic.decimalDigits}, ${pic.signed})"

      case Usage.Index =>
        s"BinaryNumeric.encodeInt($fieldName, bytes, $offset)"
