# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Note: Prototype Archive

**This is an early Scala-based prototype.** The current production implementation is in:
- `../../Thyraa-COBOL-main/backend/packages/cobol-to-scala/` (JavaScript/TypeScript)

This prototype remains for architectural reference and exploration of alternative approaches.

## Project Overview

COBOL-to-Scala conversion platform (Scala implementation). Parses COBOL copybooks and programs, generates idiomatic Scala 3 case classes with runtime support for COBOL data types (COMP-3, packed decimal, fixed-width records).

## Build Commands

```bash
# Compile
sbt compile

# Run tests
sbt test

# Run a single test class
sbt "testOnly com.cobol2scala.parser.LexerSpec"

# Run the CLI
sbt "run copybook --input samples/copybooks/CUSTOMER.cpy"

# Create fat JAR
sbt assembly
```

## Architecture

```
COBOL Source → Lexer → Tokens → CopybookParser → AST → TypeMapper → ScalaGenerator → Scala Code
```

### Key Components

**Parser Layer** (`src/main/scala/com/cobol2scala/parser/`)
- `Lexer.scala` - Tokenizes COBOL source, handles fixed-format columns (1-72), continuations, comments
- `Token.scala` - Token definitions and COBOL keyword mapping
- `Ast.scala` - AST types: DataItem, PicClause, OccursClause, Level88, Copybook
- `CopybookParser.scala` - Parses DATA DIVISION into hierarchical AST

**Analyzer Layer** (`src/main/scala/com/cobol2scala/analyzer/`)
- `TypeMapper.scala` - Maps COBOL PIC clauses to Scala types (PIC X→String, PIC 9 COMP-3→BigDecimal)

**Generator Layer** (`src/main/scala/com/cobol2scala/generator/`)
- `ScalaGenerator.scala` - Emits Scala 3 case classes, enums from level 88s, companion objects

**Runtime Library** (`src/main/scala/com/cobol2scala/runtime/`)
- `CobolTypes.scala` - PackedDecimal (COMP-3), BinaryNumeric (COMP), DisplayNumeric encoding/decoding

## COBOL Concepts to Know

- **Level Numbers**: 01 = record, 05-49 = hierarchy, 77 = independent, 88 = condition names
- **PIC Clause**: X = alpha, 9 = numeric, S = signed, V = implied decimal
- **COMP Types**: COMP = binary, COMP-3 = packed decimal (2 digits/byte), COMP-1/2 = float/double
- **OCCURS**: Arrays. DEPENDING ON = variable length
- **REDEFINES**: Same memory, different interpretation (→ sealed traits)

## Type Mapping

| COBOL | Scala |
|-------|-------|
| PIC X(n) | String |
| PIC 9(n) | Int/Long |
| PIC S9(n)V99 COMP-3 | BigDecimal |
| COMP-1 | Float |
| COMP-2 | Double |
| Level 88 | Enum |
| OCCURS n TIMES | Vector[T] |

## Testing

Sample copybooks in `samples/copybooks/`. Tests in `src/test/scala/`.

```bash
# Parse and show structure
sbt "run analyze --input samples/copybooks/CUSTOMER.cpy"

# Convert to Scala
sbt "run copybook --input samples/copybooks/CUSTOMER.cpy --output Customer.scala"
```
