package com.cobol2scala.generator

import com.cobol2scala.parser.*
import com.cobol2scala.analyzer.TypeMapper
import com.cobol2scala.analyzer.TypeMapper.ScalaType

/**
 * Generates Scala 3 code from parsed COBOL structures.
 */
class ScalaGenerator(config: GeneratorConfig = GeneratorConfig.default):

  /**
   * Generate Scala code for a copybook.
   */
  def generate(copybook: Copybook): String =
    val sb = StringBuilder()

    // Package declaration
    config.packageName.foreach(pkg => sb.append(s"package $pkg\n\n"))

    // Imports
    sb.append("import com.cobol2scala.runtime.*\n")
    sb.append("import scala.util.Try\n\n")

    // Generate each top-level record
    copybook.records.foreach { record =>
      if record.level == 77 then
        // Level 77 - independent item, generate as val
        sb.append(generateLevel77(record))
      else
        // Level 01 - record structure, generate as case class
        sb.append(generateRecord(record))
      sb.append("\n")
    }

    sb.toString

  /**
   * Generate a case class for a record structure.
   */
  private def generateRecord(record: DataItem): String =
    val className = TypeMapper.toScalaTypeName(record.name.getOrElse("Record"))
    val sb = StringBuilder()

    // Generate any enums from level 88s first
    val enums = collectEnums(record)
    enums.foreach { case (enumName, enum) =>
      sb.append(generateEnum(enumName, enum))
      sb.append("\n")
    }

    // Generate the case class
    val fields = generateFields(record.children)
    sb.append(s"case class $className(\n")
    sb.append(fields.map(f => s"  ${f.name}: ${f.typeName}").mkString(",\n"))
    sb.append("\n)")

    // Generate companion object
    sb.append(s"\n\nobject $className:\n")
    sb.append(s"  val recordLength: Int = ${calculateRecordLength(record)}\n\n")

    // Parse method
    sb.append(generateParseMethod(className, record))
    sb.append("\n\n")

    // Format method
    sb.append(generateFormatMethod(className, record))

    sb.toString

  /**
   * Generate fields for case class.
   */
  private def generateFields(items: List[DataItem]): List[FieldInfo] =
    items.flatMap { item =>
      if item.level == 88 then
        // Skip - handled separately as enum
        None
      else if item.level == 66 then
        // RENAMES - skip for now
        None
      else if item.isGroup then
        // Group item - nested case class
        val typeName = TypeMapper.toScalaTypeName(item.name.getOrElse("Group"))
        val fieldName = TypeMapper.toScalaName(item.name.getOrElse("group"))
        Some(FieldInfo(fieldName, wrapWithOccurs(typeName, item.occurs), item))
      else if item.isElementary then
        // Elementary item
        val scalaType = TypeMapper.mapDataItem(item)
        val fieldName = TypeMapper.toScalaName(item.name.getOrElse("filler"))

        // Check if this field has level 88s that should become an enum
        val typeName = if item.conditions.nonEmpty then
          TypeMapper.toScalaTypeName(item.name.getOrElse("Status"))
        else
          scalaType.typeName

        Some(FieldInfo(fieldName, wrapWithOccurs(typeName, item.occurs), item))
      else
        None
    }

  private def wrapWithOccurs(typeName: String, occurs: Option[OccursClause]): String =
    occurs match
      case Some(oc) => s"Vector[$typeName]"
      case None => typeName

  /**
   * Generate an enum from level 88 conditions.
   */
  private def generateEnum(enumName: String, conditions: List[Level88]): String =
    val sb = StringBuilder()

    sb.append(s"enum $enumName(val code: String):\n")

    conditions.foreach { cond =>
      val caseName = TypeMapper.toScalaTypeName(cond.name)
      val value = cond.values.values.headOption match
        case Some(ConditionValueItem.Single(LiteralValue.StringLit(s))) => s"\"$s\""
        case Some(ConditionValueItem.Single(LiteralValue.NumericLit(n))) => n.toString
        case _ => "\"\""
      sb.append(s"  case $caseName extends $enumName($value)\n")
    }

    sb.append(s"\nobject $enumName:\n")
    sb.append(s"  def fromCode(code: String): Option[$enumName] =\n")
    sb.append(s"    $enumName.values.find(_.code == code)\n")

    sb.toString

  /**
   * Collect all enums to generate from level 88 conditions.
   */
  private def collectEnums(record: DataItem): List[(String, List[Level88])] =
    def collect(item: DataItem): List[(String, List[Level88])] =
      val thisEnum = if item.conditions.nonEmpty then
        val enumName = TypeMapper.toScalaTypeName(item.name.getOrElse("Status"))
        List((enumName, item.conditions))
      else Nil

      thisEnum ++ item.children.flatMap(collect)

    collect(record)

  /**
   * Generate parse method for companion object.
   */
  private def generateParseMethod(className: String, record: DataItem): String =
    val sb = StringBuilder()

    sb.append(s"  def parse(bytes: Array[Byte]): Try[$className] = Try {\n")
    sb.append(s"    require(bytes.length >= recordLength, s\"Expected at least $$recordLength bytes, got $${bytes.length}\")\n\n")

    // Generate field parsing
    var offset = 0
    val parseExpressions = generateParseExpressions(record.children, offset)

    parseExpressions.foreach { case (fieldName, parseExpr, length) =>
      sb.append(s"    val $fieldName = $parseExpr\n")
    }

    sb.append(s"\n    $className(\n")
    sb.append(parseExpressions.map(_._1).map(n => s"      $n").mkString(",\n"))
    sb.append("\n    )\n")
    sb.append("  }")

    sb.toString

  /**
   * Generate parsing expressions for fields.
   */
  private def generateParseExpressions(
    items: List[DataItem],
    startOffset: Int
  ): List[(String, String, Int)] =
    var offset = startOffset
    val result = scala.collection.mutable.ListBuffer[(String, String, Int)]()

    items.foreach { item =>
      if item.level != 88 && item.level != 66 then
        val fieldName = TypeMapper.toScalaName(item.name.getOrElse("filler"))

        item.pic match
          case Some(pic) =>
            val length = TypeMapper.byteLength(pic, item.usage)
            val parseExpr = TypeMapper.generateParseExpression(pic, item.usage, offset)
            result += ((fieldName, parseExpr, length))
            offset += length

          case None if item.isGroup =>
            // Group - parse as nested
            val typeName = TypeMapper.toScalaTypeName(item.name.getOrElse("Group"))
            result += ((fieldName, s"$typeName.parse(bytes.slice($offset, ${offset + item.byteLength})).get", item.byteLength))
            offset += item.byteLength

          case _ =>
            // Skip
    }

    result.toList

  /**
   * Generate format method for companion object.
   */
  private def generateFormatMethod(className: String, record: DataItem): String =
    val sb = StringBuilder()

    sb.append(s"  def format(record: $className): Array[Byte] = {\n")
    sb.append(s"    val bytes = new Array[Byte](recordLength)\n\n")

    // Generate field formatting
    var offset = 0
    record.children.foreach { item =>
      if item.level != 88 && item.level != 66 then
        val fieldName = TypeMapper.toScalaName(item.name.getOrElse("filler"))

        item.pic match
          case Some(pic) =>
            val length = TypeMapper.byteLength(pic, item.usage)
            val formatExpr = TypeMapper.generateFormatExpression(s"record.$fieldName", pic, item.usage, offset)
            sb.append(s"    $formatExpr\n")
            offset += length

          case None if item.isGroup =>
            val typeName = TypeMapper.toScalaTypeName(item.name.getOrElse("Group"))
            sb.append(s"    System.arraycopy($typeName.format(record.$fieldName), 0, bytes, $offset, ${item.byteLength})\n")
            offset += item.byteLength

          case _ =>
            // Skip
    }

    sb.append("\n    bytes\n")
    sb.append("  }")

    sb.toString

  /**
   * Generate code for a level 77 item.
   */
  private def generateLevel77(item: DataItem): String =
    val fieldName = TypeMapper.toScalaName(item.name.getOrElse("field"))
    val scalaType = TypeMapper.mapDataItem(item)
    val defaultValue = item.value match
      case Some(LiteralValue.StringLit(s)) => s"\"$s\""
      case Some(LiteralValue.NumericLit(n)) =>
        if scalaType.typeName.contains("Decimal") then s"BigDecimal($n)"
        else n.toString
      case Some(LiteralValue.FigurativeConstant("ZERO")) => scalaType.defaultValue
      case Some(LiteralValue.FigurativeConstant("SPACE")) => "\" \""
      case _ => scalaType.defaultValue

    s"val $fieldName: ${scalaType.typeName} = $defaultValue\n"

  /**
   * Calculate total record length in bytes.
   */
  private def calculateRecordLength(record: DataItem): Int =
    record.byteLength

case class FieldInfo(
  name: String,
  typeName: String,
  item: DataItem
)

case class GeneratorConfig(
  packageName: Option[String] = None,
  generateCompanion: Boolean = true,
  generateParseFormat: Boolean = true
)

object GeneratorConfig:
  val default: GeneratorConfig = GeneratorConfig()

object ScalaGenerator:
  def generate(copybook: Copybook, config: GeneratorConfig = GeneratorConfig.default): String =
    ScalaGenerator(config).generate(copybook)

  def generateFromSource(source: String, config: GeneratorConfig = GeneratorConfig.default): Either[String, String] =
    CopybookParser.parse(source).map(cb => generate(cb, config))

  def generateFromFile(path: String, config: GeneratorConfig = GeneratorConfig.default): Either[String, String] =
    CopybookParser.parseFile(path).map(cb => generate(cb, config))
