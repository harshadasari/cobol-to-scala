# Prototypes

This directory contains early prototypes and experimental implementations.

## scala-prototype/

Early Scala-based implementation of the COBOL-to-Scala converter.

**Status:** Archived prototype
**Current Implementation:** See `Thyraa-COBOL-main/backend/packages/cobol-to-scala/`

This Scala prototype explored:
- Parser written in Scala 3
- Type-safe AST representation
- Runtime library for COBOL types (PackedDecimal, etc.)
- SBT build configuration

The current production implementation uses JavaScript/TypeScript for broader accessibility and faster development iteration.

### Running the Scala Prototype

```bash
cd prototypes/scala-prototype
sbt compile
sbt test
```

See `scala-prototype/CLAUDE.md` for more details.

---

**Note:** These prototypes are kept for historical reference and architectural ideas. The main implementation is in `Thyraa-COBOL-main/`.
