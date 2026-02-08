package com.cobol2scala

import com.monovore.decline.*
import com.monovore.decline.effect.*
import cats.implicits.*
import java.nio.file.{Files, Path, Paths}
import com.cobol2scala.parser.*
import com.cobol2scala.generator.*

/**
 * COBOL-to-Scala CLI Tool
 *
 * Commands:
 *   cobol2scala copybook --input <file> [--output <file>] [--package <pkg>]
 *   cobol2scala analyze --input <file>
 */
object Main extends CommandApp(
  name = "cobol2scala",
  header = "Convert COBOL copybooks and programs to Scala 3",
  main = {
    val copybookCmd = Opts.subcommand("copybook", "Convert a COBOL copybook to Scala case classes") {
      (
        Opts.option[String]("input", short = "i", help = "Input COBOL copybook file"),
        Opts.option[String]("output", short = "o", help = "Output Scala file").orNone,
        Opts.option[String]("package", short = "p", help = "Package name for generated code").orNone
      ).mapN { (input, output, pkg) =>
        runCopybook(input, output, pkg)
      }
    }

    val analyzeCmd = Opts.subcommand("analyze", "Analyze a COBOL file and show its structure") {
      Opts.option[String]("input", short = "i", help = "Input COBOL file").map { input =>
        runAnalyze(input)
      }
    }

    val versionOpt = Opts.flag("version", short = "v", help = "Show version").map { _ =>
      println("cobol2scala version 0.1.0")
    }

    copybookCmd orElse analyzeCmd orElse versionOpt
  }
)

def runCopybook(inputPath: String, outputPath: Option[String], packageName: Option[String]): Unit =
  println(s"Converting copybook: $inputPath")

  val source = try
    scala.io.Source.fromFile(inputPath).mkString
  catch
    case e: Exception =>
      println(s"Error reading file: ${e.getMessage}")
      sys.exit(1)

  val config = GeneratorConfig(packageName = packageName)

  ScalaGenerator.generateFromSource(source, config) match
    case Right(scalaCode) =>
      outputPath match
        case Some(outPath) =>
          try
            Files.writeString(Paths.get(outPath), scalaCode)
            println(s"Generated Scala code written to: $outPath")
          catch
            case e: Exception =>
              println(s"Error writing file: ${e.getMessage}")
              sys.exit(1)

        case None =>
          println("\n--- Generated Scala Code ---\n")
          println(scalaCode)

    case Left(error) =>
      println(s"Error parsing copybook: $error")
      sys.exit(1)

def runAnalyze(inputPath: String): Unit =
  println(s"Analyzing: $inputPath")

  val source = try
    scala.io.Source.fromFile(inputPath).mkString
  catch
    case e: Exception =>
      println(s"Error reading file: ${e.getMessage}")
      sys.exit(1)

  // Tokenize
  val tokens = Lexer.tokenize(source)
  println(s"\nTokens: ${tokens.length}")
  tokens.take(20).foreach { t =>
    println(s"  ${t.start}: ${t.value}")
  }
  if tokens.length > 20 then
    println(s"  ... and ${tokens.length - 20} more")

  // Parse
  CopybookParser.parse(source) match
    case Right(copybook) =>
      println(s"\nRecords: ${copybook.records.length}")
      copybook.records.foreach { record =>
        printDataItem(record, 0)
      }

    case Left(error) =>
      println(s"\nParse error: $error")

def printDataItem(item: DataItem, indent: Int): Unit =
  val prefix = "  " * indent
  val name = item.name.getOrElse("FILLER")
  val picStr = item.pic.map(p => s" PIC ${p.rawPattern}").getOrElse("")
  val usageStr = item.usage match
    case Usage.Display => ""
    case u => s" $u"
  val occursStr = item.occurs.map(o => s" OCCURS ${o.times}").getOrElse("")

  println(s"$prefix${item.level} $name$picStr$usageStr$occursStr")

  item.conditions.foreach { cond =>
    println(s"$prefix  88 ${cond.name}")
  }

  item.children.foreach(child => printDataItem(child, indent + 1))
