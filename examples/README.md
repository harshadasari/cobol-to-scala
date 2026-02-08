# COBOL-to-Scala Examples

This directory contains example COBOL programs and their generated Scala outputs.

## 📁 Directory Structure

```
examples/
├── basic-conversion/       # Simple COBOL program conversion example
│   ├── sample-program.cobol
│   ├── sample-program.scala
│   └── run-conversion.js
└── README.md
```

## 🚀 Running Examples

### Using the Script

```bash
cd examples/basic-conversion
node run-conversion.js
```

### Using the Web UI

1. Start the backend and frontend:
   ```bash
   # Terminal 1 - Backend
   cd Thyraa-COBOL-main/backend
   npm start

   # Terminal 2 - Frontend
   cd Thyraa-COBOL-main
   npm run dev
   ```

2. Open browser to `http://localhost:5173/convert`

3. Copy the COBOL code from `basic-conversion/sample-program.cobol`

4. Paste into the editor and click "Convert"

## 📝 Example Programs

### Basic Conversion

**Input:** `basic-conversion/sample-program.cobol`
- Demonstrates: Data structures, variables, procedures
- Features: WORKING-STORAGE SECTION, PROCEDURE DIVISION, DISPLAY, MOVE, PERFORM, ADD

**Output:** `basic-conversion/sample-program.scala`
- Shows: Case classes, methods, Scala 3 syntax
- Demonstrates: Auto-generated parse/format methods

## 🎯 Adding Your Own Examples

To add a new example:

1. Create a new directory: `examples/your-example-name/`
2. Add your COBOL file: `your-example-name/input.cobol`
3. Run the conversion and save output: `your-example-name/output.scala`
4. (Optional) Add a README explaining the example

## 💡 Tips

- Start with simple examples to understand the conversion patterns
- Check generated Scala for idiomatic patterns
- Compare COBOL statements to their Scala equivalents
- Look for conversion quality issues to report

## 🐛 Known Issues in Examples

The basic-conversion example demonstrates some current limitations:

1. **Record Lengths**: Currently show `0`, should calculate from PIC clauses
2. **Complex Expressions**: Some show `[object Object]` instead of proper values
3. **Data Structures**: Over-engineered nested case classes for simple fields

These are being worked on in upcoming releases.

## 📚 Learn More

- See `../cobol-reference/` for complete COBOL language documentation
- See `../docs/UNIFIED_PLATFORM_ARCHITECTURE.md` for technical details
- See main `../README.md` for full project documentation
- See `../docs/` for all technical documentation
