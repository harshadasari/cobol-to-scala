# COBOL-to-Scala

> **AI-powered enterprise COBOL to Scala 3 conversion platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

Transform legacy COBOL applications into modern, idiomatic Scala 3 code with the power of AI-assisted conversion.

---

> ### ✅ Engine status (2026-07-23)
> The **conversion engine** (`Thyraa-COBOL-main/backend/packages/cobol-to-scala/`) has been hardened through a **40-round autonomous adversarial-verification campaign**: every generated Scala program is diffed byte-for-byte against real GnuCOBOL (`cobc`) output.
>
> - **574 COBOL programs** oracle-verified against a real compiler
> - **~2,017 automated tests**, **0 failures**, 45 honest/documented open-work markers
> - **241 silent-divergence bugs** found and fixed at root cause across 40 rounds
>
> The campaign was **engine-only** — the surrounding *platform* (auth, CI/CD, containerization, observability, compliance, and much of the UI/API) is still aspirational and is the real gating work before production use. The roadmap and feature list below describe the intended full product; see **[docs/PROGRESS_STATUS.md](docs/PROGRESS_STATUS.md)** (closing report) and **[docs/CAPABILITY_AUDIT_AND_ROADMAP.md](docs/CAPABILITY_AUDIT_AND_ROADMAP.md)** for a precise, honest statement of what is *built and verified* today versus *vision*.

---

## 🎯 Overview

**COBOL-to-Scala** is an enterprise-grade platform that automatically converts COBOL applications to Scala 3, preserving business logic while enabling cloud-native architectures. Unlike existing tools that convert COBOL to Java, we target **Scala 3** - the language already used by major financial institutions for new development.

### The Problem We Solve

- **220-250 billion lines** of COBOL in production globally
- **$3 trillion** in daily transactions through COBOL systems
- **92% of COBOL developers** retire by 2027
- **No existing COBOL-to-Scala tools** in the market

### Why Scala?

Major banks (JPMorgan, Morgan Stanley, Deutsche Bank) already use Scala for new systems. Converting COBOL to Scala enables:

- ✅ Modern developers can maintain the code
- ✅ Functional programming patterns match financial logic
- ✅ Type safety reduces bugs in critical systems
- ✅ Seamless integration with existing Scala infrastructure
- ✅ Cloud-native deployment capabilities

---

## ✨ Features

### 🎯 Core Conversion Engine

- **Full COBOL Parsing**: Supports all 4 divisions (IDENTIFICATION, ENVIRONMENT, DATA, PROCEDURE)
- **Smart Type Mapping**: PIC clauses → Scala types with COBOL semantics preserved
- **Statement Conversion**: PERFORM → loops, EVALUATE → pattern matching, MOVE → type-safe assignments
- **File I/O Abstraction**: Sequential files → fs2 Streams, VSAM → key-value abstractions
- **Database Migration**: EXEC SQL → Doobie/Slick queries

### 🤖 AI-Powered Enhancements

- **Hybrid Architecture**: Deterministic core + AI assistance layer
- **Documentation Generation**: Auto-generates markdown docs and business rule extraction
- **Idiomatic Scala**: Suggests functional patterns and best practices
- **Complex Pattern Recognition**: Flags unusual code for human review

### 🎨 Modern Web Interface

- **Side-by-side Editor**: COBOL input → Scala output with Monaco editor
- **Project Management**: Track multiple conversion projects
- **Code Review Dashboard**: Review and refine generated code
- **Download & Export**: Get Scala files, sbt config, and runtime library

### 🔒 Enterprise-Ready

- **On-Premise Deployment**: Docker containers for air-gapped environments
- **BYOC Support**: Deploy in customer's own cloud account
- **Auditability**: Deterministic core ensures reproducible conversions
- **Validation Suite**: Dual-run comparison, golden file testing, byte-level verification

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or bun
- (Optional) Redis for job queue

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/cobol-to-scala.git
cd cobol-to-scala

# Install dependencies for frontend
npm install

# Install dependencies for backend
cd Thyraa-COBOL-main/backend
npm install
cd ../..
```

### Running the Application

**Start Backend:**
```bash
cd Thyraa-COBOL-main/backend
npm start
# Backend runs on http://localhost:3000
```

**Start Frontend:**
```bash
cd Thyraa-COBOL-main
npm run dev
# Frontend runs on http://localhost:5173
```

**Access the Application:**
- Open browser to `http://localhost:5173`
- Navigate to `/convert` for the Scala conversion interface
- Paste COBOL code or upload `.cbl` files
- Get idiomatic Scala 3 output instantly

---

## 📖 Documentation

- **[Documentation Index](docs/)** - Complete documentation hub
- **[Progress Status & Closing Report](docs/PROGRESS_STATUS.md)** - The verified engine's current state, headline numbers, and the full 40-round campaign retrospective *(start here)*
- **[Capability Audit & Coverage Roadmap](docs/CAPABILITY_AUDIT_AND_ROADMAP.md)** - Statement-by-statement audit of what the engine does today, plus the risk-ordered Known Gaps list
- **[Verification Ledger](Thyraa-COBOL-main/backend/packages/cobol-to-scala/tests/oracle/README.md)** - Every finding → fix → corpus program, round by round (all 40)
- **[COBOL Reference Guide](cobol-reference/)** - Complete COBOL language reference
- **[Architecture Overview](docs/UNIFIED_PLATFORM_ARCHITECTURE.md)** - System design and product vision (annotated built-vs-vision)
- **[Examples](examples/)** - Sample COBOL programs and conversions
- **[Runnable demo](demo/)** - `convert-demo.sh`: COBOL in → verified-equivalent Scala out

---

## 🏗️ Project Structure

```
cobol-to-scala/
├── Thyraa-COBOL-main/              # Main application
│   ├── backend/                    # Node.js backend
│   │   ├── packages/
│   │   │   └── cobol-to-scala/     # ⭐ Core conversion engine (the verified heart)
│   │   │       └── tests/oracle/   #    Compiler-oracle harness + 40-round ledger
│   │   ├── routes/                 # API routes
│   │   └── server.ts               # Express server
│   └── src/                        # React frontend
│       ├── pages/
│       │   └── ScalaConverter.tsx  # Conversion UI
│       ├── components/             # UI components
│       └── lib/
│           └── conversion-api.ts   # API client
├── docs/                           # Documentation
│   ├── PROGRESS_STATUS.md          #    Current state + 40-round closing report
│   ├── CAPABILITY_AUDIT_AND_ROADMAP.md
│   ├── ADVERSARIAL_ROUNDS_REPORT.md
│   ├── AUTONOMOUS_BUILD_LOG.md
│   ├── UNIFIED_PLATFORM_ARCHITECTURE.md
│   └── ...                         #    (market analysis, enterprise gaps, sprint plans)
├── examples/                       # Sample conversions
│   └── basic-conversion/           # Simple example with test script
├── demo/                           # Runnable demo (convert-demo.sh)
├── cobol-reference/                # COBOL language documentation
├── README.md                       # This file
├── CONTRIBUTING.md                 # Contribution guidelines
└── LICENSE                         # MIT License
```

---

## 🔧 How It Works

### Conversion Pipeline

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   COBOL     │  →   │   PARSER     │  →   │    AST      │
│   Source    │      │   (Lexer)    │      │  (Tree)     │
└─────────────┘      └──────────────┘      └─────────────┘
                                                   ↓
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Scala 3   │  ←   │  GENERATOR   │  ←   │  CONVERTER  │
│   Output    │      │ (Code Gen)   │      │ (Transform) │
└─────────────┘      └──────────────┘      └─────────────┘
                            ↓
                   ┌──────────────┐
                   │  AI LAYER    │
                   │ (Enhance)    │
                   └──────────────┘
```

### Example Conversion

**Input (COBOL):**
```cobol
       01  CUSTOMER-RECORD.
           05  CUST-ID             PIC 9(10).
           05  CUST-NAME           PIC X(50).
           05  CUST-BALANCE        PIC S9(9)V99 COMP-3.
           05  CUST-STATUS         PIC X(01).
               88  STATUS-ACTIVE       VALUE "A".
               88  STATUS-CLOSED       VALUE "C".
```

**Output (Scala 3):**
```scala
enum CustomerStatus(val code: Char):
  case Active extends CustomerStatus('A')
  case Closed extends CustomerStatus('C')

case class CustomerRecord(
  custId: Long,
  custName: FixedString,
  custBalance: BigDecimal,
  custStatus: CustomerStatus
)

object CustomerRecord:
  def parse(bytes: Array[Byte]): CustomerRecord = ???
  def format(record: CustomerRecord): Array[Byte] = ???
```

---

## 🎯 Roadmap

*Reflects the actual verified state as of the round-40 campaign (2026-07-23). For the precise, statement-level breakdown and the risk-ordered Known Gaps list, see [docs/CAPABILITY_AUDIT_AND_ROADMAP.md](docs/CAPABILITY_AUDIT_AND_ROADMAP.md).*

### ✅ Phase 1 — Data-layer truth (verified)
- [x] COBOL lexer + parser (all 4 divisions, PIC-aware tokenization)
- [x] Byte-accurate record layouts + `parse`/`format` codecs (packed decimal / binary / zoned / EBCDIC cp037 / IEEE-754 COMP-1/COMP-2)
- [x] Copybook expansion (COPY REPLACING, nested, cycle-safe) + standalone copybook parse
- [x] REDEFINES-as-views, byte-verified round-trip test suite
- [ ] OCCURS DEPENDING ON dynamic sizing — *open, fixed-max only (visibly marked)*

### ✅ Phase 2 — Batch-complete procedure coverage (verified)
- [x] Control flow, data movement, arithmetic (with real ROUNDED/truncation + multi-target ON SIZE ERROR semantics)
- [x] STRING/UNSTRING/INSPECT, SEARCH/SEARCH ALL, SORT/MERGE via INPUT/OUTPUT PROCEDURE
- [x] Real file I/O: LINE SEQUENTIAL + RELATIVE (fixed-width byte-record model), REWRITE/DELETE/START, LINAGE, FILE STATUS lifecycle
- [x] RECURSIVE programs, multi-`PROGRAM-ID` interop, CALL BY REFERENCE/CONTENT/VALUE
- [x] **40 rounds of adversarial verification** — 574 corpus programs, ~2,017 tests, 241 bugs fixed
- [ ] Reference modification, INDEXED/VSAM files, `SORT ... USING/GIVING`, general GO TO webs — *open (see Known Gaps)*

### 🟡 Phase 3 — Database layer (parser/generator done, wiring open)
- [x] DCLGEN ingestion, EXEC SQL → compile-verified Doobie generation (standalone)
- [x] JCL structural parse + dataset-lineage JSON
- [ ] Splice SQL generation into the main output path; JCL → sbt/pipeline skeletons

### 🟡 Phase 4 — Online systems (honest skeleton, not behavioral conversion)
- [x] EXEC CICS classifier + BMS parser + service-skeleton generator (bodies are explicit `???`, never faked)
- [ ] Behavioral CICS conversion, IMS DL/I

### ⬜ Platform (not started — the real gating work for production)
- [ ] Authentication, CI/CD, containerization, observability, compliance, hardened UI/API — see [docs/ENTERPRISE_READINESS_GAP_ANALYSIS.md](docs/ENTERPRISE_READINESS_GAP_ANALYSIS.md)

---

## 🧪 Testing

```bash
# Run backend tests
cd Thyraa-COBOL-main/backend
npm test

# Run example conversion
cd examples/basic-conversion
node run-conversion.js
```

---

## 🤝 Contributing

We welcome contributions! Whether you're fixing bugs, improving documentation, or adding features:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows our style guide and includes tests.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by the urgent need to modernize legacy COBOL systems
- Built with Claude Code AI assistance
- Uses open-source tools: React, Node.js, Monaco Editor, shadcn/ui

---

## 📞 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/cobol-to-scala/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/cobol-to-scala/discussions)
- **Documentation**: [Full Docs](docs/)

---

## 🌟 Star History

If you find this project useful, please consider giving it a star ⭐

---

**Built with ❤️ for the mainframe modernization community**
