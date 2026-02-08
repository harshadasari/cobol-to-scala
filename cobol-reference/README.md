# COBOL Technical Reference for Transpiler Development

A comprehensive guide to COBOL language features, patterns, and considerations for building a COBOL-to-Scala transpiler.

## Document Index

### Core Language Reference

| Document | Description |
|----------|-------------|
| [01-program-structure.md](./01-program-structure.md) | The four divisions (IDENTIFICATION, ENVIRONMENT, DATA, PROCEDURE), complete program examples |
| [02-data-division.md](./02-data-division.md) | PICTURE clauses, level numbers (01-49, 66, 77, 88), USAGE/COMP types, OCCURS, REDEFINES |
| [03-copybooks.md](./03-copybooks.md) | Copybook mechanics, COPY/REPLACING, common patterns (record layouts, DCLGEN, SQLCA) |
| [04-procedure-division.md](./04-procedure-division.md) | PERFORM variants, EVALUATE, IF, MOVE, COMPUTE, STRING, UNSTRING, INSPECT, CALL |
| [05-file-handling.md](./05-file-handling.md) | Sequential, indexed (VSAM), relative files; FD entries; READ/WRITE/REWRITE/DELETE |
| [06-cics-db2.md](./06-cics-db2.md) | Embedded SQL, cursors, CICS commands, transaction processing |
| [07-enterprise-patterns.md](./07-enterprise-patterns.md) | Batch processing, report generation, control breaks, validation, pseudo-conversational |
| [08-transpiler-considerations.md](./08-transpiler-considerations.md) | Type mapping, parsing challenges, state management, testing strategies |

---

## Quick Reference

### COBOL Program Structure

```
IDENTIFICATION DIVISION.  <- Program name and metadata
ENVIRONMENT DIVISION.     <- File assignments, special names
DATA DIVISION.            <- All data declarations
PROCEDURE DIVISION.       <- Executable code
```

### Key Data Types to Handle

| COBOL | Bytes | Scala |
|-------|-------|-------|
| `PIC X(n)` | n | `String` |
| `PIC 9(n)` | n | `Int/Long/String` |
| `PIC 9(n) COMP` | 2/4/8 | `Short/Int/Long` |
| `PIC S9(n)V99 COMP-3` | (n+3)/2 | `BigDecimal` |
| `COMP-1` | 4 | `Float` |
| `COMP-2` | 8 | `Double` |

### Critical Parsing Points

1. **Column positions** (fixed format: 1-6, 7, 8-11, 12-72, 73-80)
2. **Continuation lines** (hyphen in column 7)
3. **COPY statements** (text substitution before parsing)
4. **Level numbers** (01-49 hierarchy, 66/77/88 special)
5. **Scope terminators** (END-IF, END-PERFORM, END-READ, etc.)

### Statement Categories

**Data Movement**: MOVE, INITIALIZE, STRING, UNSTRING, INSPECT

**Arithmetic**: ADD, SUBTRACT, MULTIPLY, DIVIDE, COMPUTE

**Control Flow**: PERFORM, IF/EVALUATE, GO TO, STOP RUN, GOBACK

**File I/O**: OPEN, CLOSE, READ, WRITE, REWRITE, DELETE, START

**Program Control**: CALL, CANCEL, ENTRY

**Table Operations**: SEARCH, SET

---

## Common Enterprise Patterns

1. **Master/Transaction Update** - Match sorted files, apply changes
2. **Control Break Reports** - Hierarchical totals on data groups
3. **Table-Driven Processing** - In-memory lookup tables
4. **Validation Frameworks** - Field-by-field error accumulation
5. **Pseudo-Conversational** - CICS state machine pattern
6. **Commit-Frequency Batch** - DB2 batch with periodic commits

---

## Transpiler Development Checklist

### Phase 1: Parsing
- [ ] Handle fixed/free format detection
- [ ] Preprocess continuation lines
- [ ] COPY statement resolution
- [ ] REPLACING text substitution
- [ ] Build complete AST

### Phase 2: Data Structures
- [ ] Map PIC clauses to types
- [ ] Handle COMP/COMP-3/COMP-1/COMP-2
- [ ] Support group/elementary hierarchy
- [ ] Implement REDEFINES (union types)
- [ ] Handle OCCURS (arrays)
- [ ] Support OCCURS DEPENDING ON
- [ ] Map level 88 to boolean methods

### Phase 3: Procedures
- [ ] All PERFORM variants
- [ ] EVALUATE to match expressions
- [ ] IF with complex conditions
- [ ] MOVE with type conversion
- [ ] COMPUTE with expressions
- [ ] STRING/UNSTRING
- [ ] Reference modification

### Phase 4: File I/O
- [ ] Sequential file abstraction
- [ ] Indexed file (key-value) abstraction
- [ ] File status handling
- [ ] AT END / INVALID KEY logic

### Phase 5: DB2
- [ ] Parse EXEC SQL blocks
- [ ] Host variable mapping
- [ ] SQLCODE handling
- [ ] Cursor iteration
- [ ] Indicator variables for NULL

### Phase 6: CICS (if applicable)
- [ ] Parse EXEC CICS blocks
- [ ] Map to REST/service patterns
- [ ] Session state management
- [ ] Screen mapping alternatives

---

## File Locations

All documentation is in: `/Users/hdasari/Desktop/Learning/1/cobol-reference/`

```
cobol-reference/
├── README.md                      <- This file
├── 01-program-structure.md
├── 02-data-division.md
├── 03-copybooks.md
├── 04-procedure-division.md
├── 05-file-handling.md
├── 06-cics-db2.md
├── 07-enterprise-patterns.md
└── 08-transpiler-considerations.md
```
