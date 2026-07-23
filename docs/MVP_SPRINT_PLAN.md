# Thyraa MVP Sprint Plan
## 10-20 Hours to Working Product

**Originally authored:** 2026-02-08
**Status updated:** 2026-07-23

---

## Core Constraints

- **Time**: 10-20 hours ONLY
- **Scalability**: COBOL → Scala/Java/Python/Kotlin (pluggable targets)
- **Future-proof**: MCP server + Agent-ready architecture
- **Leverage**: Use existing Thyraa frontend/backend

---

## STATUS AS OF 2026-07-23

> This plan was written on 2026-02-08 as a forward-looking 10-20 hour sprint
> proposal, **before any of the work below happened**. Nothing in the
> original text below has been deleted — every checklist item, table, and
> code sample is preserved as the historical plan and annotated inline with
> ✅ DONE / 🟡 PARTIAL / ⬜ NOT STARTED / OUT OF SCOPE. Read this section
> first for the honest headline; read the annotations inline for the
> item-by-item truth.

**What actually happened instead:** rather than a 10-20 hour integration
sprint, an autonomous adversarial-verification campaign rebuilt and hardened
the COBOL→Scala **conversion engine** at
`Thyraa-COBOL-main/backend/packages/cobol-to-scala/` far beyond this plan's
original scope — while almost everything this plan called "the product"
(MCP server, Java/Python/Kotlin plugins, Docker/full-stack deployment,
target-language dropdown, agent tooling) was **not** attempted, by design:
the campaign was scoped to the engine only. The campaign ran in two phases:
an initial 14 rounds (~22 hours, 2026-07-10 → 2026-07-11), paused by owner
decision, then resumed at the owner's explicit request and run to completion
at round 40 (closing 2026-07-23).

**Headline numbers (verified, not projected):**
- **574** oracle-verified COBOL programs (563 `.cbl` clean under real `cobc` + 11
  `.cbl.txt` whose correct behavior is a nonzero cobc exit/compile rejection) — up
  from 48 at campaign start and 209 at the round-14 pause point
- **~2,017** automated tests (898 unit + 1,119 oracle), 0 failures, 45 honest
  documented `t.todo()` entries — up from 879/879 at round 14
- **241** silent-divergence ("dishonest") bugs found and fixed across the campaign
  (110 in rounds 1-14, 131 more in rounds 15-40)
- **40** adversarial-refutation rounds total, each writing new hostile COBOL,
  compiling with real GnuCOBOL (`cobc`), and diffing byte-for-byte against
  generated-then-compiled Scala output
- The campaign's own convergence bar (0-2 findings for two consecutive rounds) was
  met once, briefly, at rounds 36-37, before rounds 38-40 deliberately broadened
  the search and found real bugs again at an increasing rate (6, 7, 8) — including
  two previously entirely-unimplemented statements (`REPLACE`,
  `PROGRAM-ID ... INITIAL`) discovered as late as round 40. Read this as the
  broadened strategy working, not quality regressing — not as "adversarially
  exhausted."

**What got built (all 4 of the roadmap's later phases, not just this plan's Hour 0-20 scope):**
1. **Data layer** — byte-level codecs for packed decimal/COMP-3, binary, zoned decimal, EBCDIC (cp037), real IEEE-754 COMP-1/COMP-2 codecs; PIC/COMP parsing; copybook expansion. ✅ Oracle-verified.
2. **Procedure logic** — the full statement set: all PERFORM forms, IF/EVALUATE, SEARCH/SEARCH ALL, SORT/MERGE, STRING/UNSTRING/INSPECT, arithmetic with ROUNDED, MOVE (incl. CORRESPONDING), file I/O (incl. a full RELATIVE-organization storage-model rewrite in round 29, LINAGE, FILE STATUS lifecycle), DECLARATIVES, multi-program CALL, SECTIONs, real RECURSIVE-program support (built rounds 15-40). ✅ Oracle-verified.
3. **SQL/JCL** — EXEC SQL → typed Doobie code (compile-verified against real `doobie-core`), JCL step/DD/PROC parsing with dataset-lineage JSON. 🟡 Built as an MVP; **the SQL generator is not yet wired into the main conversion pipeline** — a real, disclosed gap.
4. **CICS** — EXEC CICS command classification, BMS screen-map parsing, Scala service-skeleton generation. 🟡 Scaffolding only — explicitly **not** a behavioral CICS converter (every risky method body is an honest `???`).

**What this plan asked for that remains genuinely undone:** the surrounding
**product** — a generic multi-target (`Scala`/`Java`/`Python`/`Kotlin`)
plugin registry, an MCP server exposing these as agent tools, a
target-language dropdown UI, and a full Docker-composed stack — was
**intentionally out of scope** for the engine-hardening campaign and remains
unbuilt (see item-by-item annotations below for what partial UI/API
integration does exist). **The engine now far exceeds this plan's original
"10-20 hour MVP" bar for its one target language (Scala); the productized,
multi-language, agent-ready platform this plan envisioned was not built.**

**Known, disclosed engine gaps, top three by risk** (i.e., NOT silent bugs —
each surfaces a visible marker or documented decline): (1) **reference
modification** (`field(start:length)`) still degrades to a placeholder for
its actual value almost everywhere — the single largest remaining risk; (2)
`ORGANIZATION IS INDEXED` (VSAM-style keyed) files are unimplemented and
unverifiable in this project's own sandbox; (3) `CALL BY REFERENCE`/`CONTENT`
of a GROUP containing an OCCURS table into an ordinary (non-recursive)
subprogram silently passes empty/default data. Also still open: EXEC SQL not
wired into the main generator; EXEC CICS behavioral conversion; SORT
`USING`/`GIVING`; OCCURS DEPENDING ON dynamic sizing; general (non-THRU-scoped)
inter-paragraph GO TO webs; JCL→sbt pipeline skeletons. The verification
oracle throughout is GnuCOBOL, not IBM Enterprise COBOL. The campaign was
**engine-only** — auth, CI/CD, containerization, observability, compliance,
frontend, and API were not touched and remain the gating production
blockers; the engine is no longer the weakest link.

**For full detail, see:**
- `docs/PROGRESS_STATUS.md` — the closing report: full campaign retrospective, headline numbers, process lessons, recommended next steps
- `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` — statement-by-statement audit of what the engine handles today vs. the 4-phase "don't miss any aspect of COBOL" roadmap
- `tests/oracle/README.md` — the complete round-by-round (1-40) finding→fix→program ledger
- `docs/AUTONOMOUS_BUILD_LOG.md` — the full autonomous run activity log
- `docs/ADVERSARIAL_ROUNDS_REPORT.md` — the original rounds 1-14 campaign report (methodology, narrative, bug-impact ranking)

---

## Architecture: Plugin-Based Conversion

```
┌─────────────────────────────────────────────────────────────────┐
│                    THYRAA CORE                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 COBOL PARSER (Universal)                 │   │
│  │                                                          │   │
│  │  Input: COBOL Source                                     │   │
│  │  Output: Language-Agnostic AST (JSON)                    │   │
│  │                                                          │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              TARGET LANGUAGE PLUGINS                     │   │
│  │                                                          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │  Scala  │ │  Java   │ │ Python  │ │ Kotlin  │        │   │
│  │  │ Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin  │        │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  │                                                          │   │
│  │  Each plugin: AST → Target Language Code                 │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## MCP + Agent-Ready Design

Every function is designed as an **MCP Tool** that agents can call:

```typescript
// All functions follow MCP tool pattern
interface MCPTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
  handler: (input: any) => Promise<any>;
}

// Example tools we'll build:
const tools = [
  {
    name: "parse_cobol",
    description: "Parse COBOL source code into AST",
    input_schema: { source: "string", options?: {...} },
    handler: parseCobol
  },
  {
    name: "convert_to_scala",
    description: "Convert COBOL AST to Scala code",
    input_schema: { ast: "object", package?: "string" },
    handler: convertToScala
  },
  {
    name: "convert_to_java",
    description: "Convert COBOL AST to Java code",
    input_schema: { ast: "object", package?: "string" },
    handler: convertToJava
  },
  {
    name: "analyze_dependencies",
    description: "Analyze COBOL program dependencies",
    input_schema: { source: "string" },
    handler: analyzeDependencies
  },
  {
    name: "explain_cobol",
    description: "Explain COBOL code in plain English",
    input_schema: { source: "string" },
    handler: explainCobol
  }
];
```

---

## 10-20 Hour Sprint Breakdown

### Hour 0-2: Setup & Integration Layer
**Goal**: Connect existing pieces

```
[x] Set up conversion service in Thyraa backend       -- 🟡 PARTIAL: real service exists (Thyraa-COBOL-main/backend/packages/cobol-to-scala/index.js: parseCobol, convertToScala), wired into the backend API — but it grew into a ~9,500-line engine, not the thin "connect existing pieces" service this line implied.
[x] Create /api/convert endpoint                      -- 🟡 PARTIAL: real routes exist (Thyraa-COBOL-main/backend/api/routes/conversion.routes.js + conversion.controller.js: POST /parse, /scala, /batch, GET /runtime) — but hardcoded to Scala only, no generic target-selectable /api/convert as envisioned below.
[ ] Define AST JSON schema (language-agnostic)         -- ⬜ NOT STARTED as a decoupled, published, multi-language schema: the internal AST is COBOL-specific and tightly coupled to the Scala generator, not designed for reuse across pluggable target languages.
[ ] Add target language parameter                      -- ⬜ NOT STARTED: only Scala is a supported target; there is no target-language parameter/dispatch anywhere in the stack.
```

### Hour 2-6: Universal COBOL Parser (Node.js)
**Goal**: Parse COBOL → JSON AST

```
[x] Port/simplify cobol2scala parser to TypeScript     -- 🟡 PARTIAL: the parser was massively expanded, not simplified — lexer.js, data-division-parser.js, procedure-parser.js, sql-parser.js, jcl-parser.js, cics-parser.js, bms-parser.js, dclgen-parser.js, copybook-resolver.js — but it stayed in plain JS (Node.js), not TypeScript.
[ ] Output language-agnostic AST as JSON               -- 🟡 PARTIAL: an internal AST exists and is used directly by the Scala generator; it was never published/decoupled as a reusable "language-agnostic" JSON contract for other-language plugins (there are no other-language plugins to consume it).
[x] Handle: DATA DIVISION, PIC, COMP, OCCURS, level 88  -- ✅ DONE, far exceeded: full WORKING-STORAGE/FILE/LINKAGE/LOCAL-STORAGE parsing, PIC 9/X/A/S/V/P/Z/*/+/-/$/,/./B/0//CR/DB, USAGE DISPLAY..COMP-5/BINARY/PACKED-DECIMAL/INDEX/POINTER, OCCURS (incl. DEPENDING ON, INDEXED BY, KEY), REDEFINES, RENAMES (66), level 88, byte-level codecs. See docs/CAPABILITY_AUDIT_AND_ROADMAP.md §1.1.
[ ] MCP tool: parse_cobol                              -- ⬜ NOT STARTED: no MCP server exists anywhere in the repo. The equivalent REST call is POST /api/convert/parse.
```

### Hour 6-10: Scala Plugin
**Goal**: First target language working

```
[x] AST → Scala 3 case classes         -- ✅ DONE, far exceeded: byte-accurate recordLength/parse/format companions backed by real byte-level codecs (packed decimal, binary, zoned, EBCDIC cp037), not just plain field mapping. See generator/case-class-gen.js, generator/codecs.js.
[x] AST → Scala enums (level 88)       -- ✅ DONE: level-88 → enum generation. See generator/enum-gen.js.
[x] Generate companion objects         -- ✅ DONE: companions carry parse/format/recordLength, plus an embeddable runtime helper library (runtime/).
[ ] MCP tool: convert_to_scala         -- ⬜ NOT STARTED: no MCP server. REST equivalent: POST /api/convert/scala (conversion.controller.js).
```

### Hour 10-14: Java Plugin (Copy + Modify)
**Goal**: Prove multi-target works

```
[ ] Copy Scala plugin structure    -- ⬜ NOT STARTED
[ ] AST → Java records/classes     -- ⬜ NOT STARTED
[ ] AST → Java enums               -- ⬜ NOT STARTED
[ ] MCP tool: convert_to_java      -- ⬜ NOT STARTED
```
**This entire section remains undone.** No Java, Python, or Kotlin generator exists anywhere in the repo — the engine is, and has only ever been, single-target (COBOL → Scala). The "prove multi-target works" goal was never attempted; all 40 rounds of the later campaign (14 initial + 26 resumed) hardened the one Scala target rather than proving the plugin architecture across languages.

### Hour 14-18: UI Integration
**Goal**: Working end-to-end flow

```
[x] Add "Convert" tab to analysis results   -- 🟡 PARTIAL: a real, working UI was built (Thyraa-COBOL-main/src/pages/ScalaConverter.tsx, 313 lines, wired to the real backend via src/lib/conversion-api.ts) reachable at the /convert route — but as a standalone page, not a tab embedded inside the analysis-results view.
[ ] Target language selector dropdown       -- ⬜ NOT STARTED: no dropdown; the UI only ever produces Scala (matches the single-target reality above).
[ ] Code preview with syntax highlighting   -- ⬜ NOT STARTED: output is shown in a plain <textarea>, not a syntax-highlighted code viewer (no Monaco/Prism/CodeMirror in this page).
[x] Download generated code                 -- ✅ DONE: real Blob-based download button (handleDownload in ScalaConverter.tsx) plus a copy-to-clipboard action.
```

### Hour 18-20: MCP Server + Polish
**Goal**: Agent-ready deployment

```
[ ] Create MCP server wrapper           -- ⬜ NOT STARTED: no mcp/ directory or MCP dependency exists anywhere in the repo.
[ ] Expose all tools via MCP protocol   -- ⬜ NOT STARTED: no agent/MCP tool exposure of any kind; a CLI-style demo (demo/convert-demo.sh, demo/convert.mjs) is the closest thing to an "agent-usable" entry point, and it is not MCP.
[ ] Docker compose for full stack       -- ⬜ NOT STARTED: no docker-compose file exists in the repo.
[x] Basic documentation                 -- ✅ DONE, vastly exceeded: docs/ADVERSARIAL_ROUNDS_REPORT.md, docs/CAPABILITY_AUDIT_AND_ROADMAP.md, docs/PROGRESS_STATUS.md, docs/AUTONOMOUS_BUILD_LOG.md, plus tests/oracle/README.md's per-round finding tables and demo/README.md.
```

---

## Simplified File Structure

> **Status:** 🟡 PARTIAL — illustrative, not what was actually built. The
> real conversion engine lives at
> `Thyraa-COBOL-main/backend/packages/cobol-to-scala/` with
> `parser/`, `generator/`, `runtime/`, and `tests/` directories (no
> `cobol-parser`/`code-generators` split, no `java.js`, no `mcp/`). The real
> API layer is `Thyraa-COBOL-main/backend/api/routes/conversion.routes.js` +
> `conversion.controller.js`. The real frontend piece is
> `Thyraa-COBOL-main/src/pages/ScalaConverter.tsx` at the `/convert` route.
> No `docker-compose.yml` exists.

```
thyraa/
├── frontend/                    # EXISTING - minimal changes
│   └── src/
│       └── components/
│           └── conversion/      # NEW: ConversionTab.tsx
│
├── backend/
│   ├── src/
│   │   └── server.js           # EXISTING
│   ├── api/
│   │   └── routes/
│   │       └── convert.js      # NEW: conversion endpoints
│   ├── packages/
│   │   ├── cobol-parser/       # NEW: Universal parser
│   │   │   ├── index.js
│   │   │   ├── lexer.js
│   │   │   ├── parser.js
│   │   │   └── ast.js          # JSON AST schema
│   │   └── code-generators/    # NEW: Target plugins
│   │       ├── index.js        # Plugin registry
│   │       ├── scala.js        # Scala generator
│   │       ├── java.js         # Java generator
│   │       └── base.js         # Base generator class
│   └── mcp/                    # NEW: MCP Server
│       ├── server.js
│       └── tools.js
│
└── docker-compose.yml          # Full stack
```

---

## The Universal AST (JSON)

> **Status:** 🟡 PARTIAL — this sketch is far simpler than what was actually
> built. The real internal AST carries byte-level codec metadata (COMP-3/
> binary/zoned/EBCDIC), REDEFINES/RENAMES/OCCURS DEPENDING ON shapes, and
> full PROCEDURE DIVISION statement trees — but it was never published as a
> standalone, decoupled "language-agnostic" schema like this one, since only
> one target language (Scala) consumes it. See
> `docs/CAPABILITY_AUDIT_AND_ROADMAP.md` §1.1 for the real shape.

```json
{
  "type": "copybook",
  "name": "CUSTOMER-RECORD",
  "records": [
    {
      "type": "record",
      "level": 1,
      "name": "CUSTOMER-RECORD",
      "children": [
        {
          "type": "field",
          "level": 5,
          "name": "CUST-ID",
          "dataType": "numeric",
          "length": 10,
          "decimals": 0,
          "signed": false,
          "usage": "display"
        },
        {
          "type": "field",
          "level": 5,
          "name": "CUST-BALANCE",
          "dataType": "numeric",
          "length": 13,
          "decimals": 2,
          "signed": true,
          "usage": "comp3"
        },
        {
          "type": "field",
          "level": 5,
          "name": "CUST-STATUS",
          "dataType": "alphanumeric",
          "length": 1,
          "conditions": [
            { "name": "ACTIVE", "value": "A" },
            { "name": "CLOSED", "value": "C" }
          ]
        }
      ]
    }
  ]
}
```

---

## Plugin Interface (Simple)

> **Status:** 🟡 PARTIAL / ⬜ — the Scala side of this toy sketch was built
> and then vastly outgrown it (real files: `generator/case-class-gen.js`,
> `generator/codecs.js`, `generator/enum-gen.js`, `generator/expression-gen.js`,
> `generator/file-io-gen.js`, `generator/method-gen.js`,
> `generator/scala-generator.js`, `generator/sql-gen.js`,
> `generator/cics-gen.js`, `generator/layout.js` — not one flat `scala.js`).
> The `java.js` generator shown here was **never built** — ⬜ NOT STARTED,
> confirmed no Java/Python/Kotlin generator exists in the repo.

```javascript
// base.js - All generators extend this
class BaseGenerator {
  constructor(options = {}) {
    this.options = options;
  }

  // Override in each plugin
  generate(ast) {
    throw new Error('Not implemented');
  }

  // Common helpers
  toCamelCase(cobolName) {
    return cobolName.toLowerCase()
      .split('-')
      .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }

  toPascalCase(cobolName) {
    return cobolName.toLowerCase()
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }

  mapType(field) {
    // Override per language
    throw new Error('Not implemented');
  }
}

// scala.js
class ScalaGenerator extends BaseGenerator {
  generate(ast) {
    return ast.records.map(r => this.generateRecord(r)).join('\n\n');
  }

  generateRecord(record) {
    const className = this.toPascalCase(record.name);
    const fields = record.children
      .filter(c => c.type === 'field')
      .map(f => `  ${this.toCamelCase(f.name)}: ${this.mapType(f)}`)
      .join(',\n');

    return `case class ${className}(\n${fields}\n)`;
  }

  mapType(field) {
    if (field.conditions?.length > 0) return this.toPascalCase(field.name);
    if (field.dataType === 'alphanumeric') return 'String';
    if (field.usage === 'comp3' || field.decimals > 0) return 'BigDecimal';
    if (field.length <= 9) return 'Int';
    return 'Long';
  }
}

// java.js
class JavaGenerator extends BaseGenerator {
  generate(ast) {
    return ast.records.map(r => this.generateRecord(r)).join('\n\n');
  }

  generateRecord(record) {
    const className = this.toPascalCase(record.name);
    const fields = record.children
      .filter(c => c.type === 'field')
      .map(f => `    ${this.mapType(f)} ${this.toCamelCase(f.name)}`)
      .join(',\n');

    return `public record ${className}(\n${fields}\n) {}`;
  }

  mapType(field) {
    if (field.conditions?.length > 0) return this.toPascalCase(field.name);
    if (field.dataType === 'alphanumeric') return 'String';
    if (field.usage === 'comp3' || field.decimals > 0) return 'BigDecimal';
    if (field.length <= 9) return 'int';
    return 'long';
  }
}
```

---

## MCP Server (Agent-Ready)

> **Status:** ⬜ NOT STARTED — no MCP server, no `@modelcontextprotocol/sdk`
> dependency, and no `mcp/` directory exist anywhere in the repo. This
> entire code sample remains aspirational as of 2026-07-23 (the campaign, now
> run to completion at round 40, was engine-only and never touched this). The closest
> thing to an agent-usable entry point is the CLI demo
> (`demo/convert-demo.sh`, `demo/convert.mjs`) — not MCP.

```javascript
// mcp/server.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseCobol } from '../packages/cobol-parser/index.js';
import { generators } from '../packages/code-generators/index.js';

const server = new Server({
  name: 'thyraa-cobol',
  version: '1.0.0',
}, {
  capabilities: { tools: {} }
});

// Tool: Parse COBOL
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'parse_cobol':
      return { content: [{ type: 'text', text: JSON.stringify(parseCobol(args.source)) }] };

    case 'convert_to_scala':
      return { content: [{ type: 'text', text: generators.scala.generate(args.ast) }] };

    case 'convert_to_java':
      return { content: [{ type: 'text', text: generators.java.generate(args.ast) }] };

    case 'list_targets':
      return { content: [{ type: 'text', text: JSON.stringify(Object.keys(generators)) }] };
  }
});

// List available tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'parse_cobol',
      description: 'Parse COBOL source code into a language-agnostic AST',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'COBOL source code' }
        },
        required: ['source']
      }
    },
    {
      name: 'convert_to_scala',
      description: 'Convert COBOL AST to Scala 3 code',
      inputSchema: {
        type: 'object',
        properties: {
          ast: { type: 'object', description: 'Parsed COBOL AST' },
          package: { type: 'string', description: 'Scala package name' }
        },
        required: ['ast']
      }
    },
    {
      name: 'convert_to_java',
      description: 'Convert COBOL AST to Java code',
      inputSchema: {
        type: 'object',
        properties: {
          ast: { type: 'object', description: 'Parsed COBOL AST' },
          package: { type: 'string', description: 'Java package name' }
        },
        required: ['ast']
      }
    },
    {
      name: 'list_targets',
      description: 'List available target languages',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}));

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## API Endpoints (REST + MCP Compatible)

> **Status:** 🟡 PARTIAL — a real REST API was built
> (`Thyraa-COBOL-main/backend/api/routes/conversion.routes.js` +
> `conversion.controller.js`) with `POST /parse`, `POST /scala`,
> `POST /batch` (a feature this plan didn't even ask for), and
> `GET /runtime`. It is **not** the generic multi-target
> `/api/convert` + `/api/transform` + `/api/targets` design sketched below —
> there is no `target` parameter and no `generators` registry, because only
> Scala was ever built as a target. There is no MCP compatibility layer.

```javascript
// api/routes/convert.js
import { parseCobol } from '../../packages/cobol-parser/index.js';
import { generators } from '../../packages/code-generators/index.js';

export default function(app) {

  // Parse COBOL → AST
  app.post('/api/parse', (req, res) => {
    const { source } = req.body;
    const ast = parseCobol(source);
    res.json({ ast });
  });

  // Convert AST → Target Language
  app.post('/api/convert', (req, res) => {
    const { ast, target, options } = req.body;

    const generator = generators[target];
    if (!generator) {
      return res.status(400).json({
        error: `Unknown target: ${target}`,
        available: Object.keys(generators)
      });
    }

    const code = generator.generate(ast, options);
    res.json({ code, target });
  });

  // Full pipeline: Source → Target Code
  app.post('/api/transform', (req, res) => {
    const { source, target, options } = req.body;

    const ast = parseCobol(source);
    const generator = generators[target];

    if (!generator) {
      return res.status(400).json({
        error: `Unknown target: ${target}`,
        available: Object.keys(generators)
      });
    }

    const code = generator.generate(ast, options);
    res.json({ ast, code, target });
  });

  // List available targets
  app.get('/api/targets', (req, res) => {
    res.json({
      targets: Object.keys(generators).map(key => ({
        id: key,
        name: generators[key].name,
        description: generators[key].description
      }))
    });
  });
}
```

---

## What You Get in 20 Hours

*(Original plan's projection vs. actual status after the full 40-round campaign, 2026-07-23. This table was the plan's forecast, not a completed checklist — every "✅" below is what the plan **expected**; the new "Actual status" column is the truth.)*

| Feature | Planned as Included | Actual status (2026-07-23) |
|---------|----------|-----------------------------|
| COBOL Parser (copybooks) | ✅ | ✅ DONE — far exceeded: full lexer/parser incl. byte-level codecs, not just copybooks |
| Universal JSON AST | ✅ | 🟡 PARTIAL — rich internal AST exists but was never decoupled/published as a multi-language schema |
| Scala generator | ✅ | ✅ DONE — far exceeded: 574 oracle-verified programs, ~2,017 tests passing, 0 failures |
| Java generator | ✅ | ⬜ NOT STARTED — no Java generator exists |
| REST API | ✅ | 🟡 PARTIAL — real endpoints exist (`/parse`, `/scala`, `/batch`, `/runtime`) but Scala-only, no generic target dispatch |
| MCP Server | ✅ | ⬜ NOT STARTED — no MCP server anywhere in the repo |
| Plugin architecture | ✅ | ⬜ NOT STARTED — single-target only; the pluggable-generator design was never built |
| Basic UI integration | ✅ | 🟡 PARTIAL — a real `/convert` page exists (`ScalaConverter.tsx`), but standalone, not a tab in analysis results, and no language selector |
| Multi-target support | ✅ | ⬜ NOT STARTED — Scala only |
| Agent-ready tools | ✅ | ⬜ NOT STARTED — no MCP/agent tool surface; only a CLI demo script |

| Feature | Planned as NOT Included (Future) | Actual status (2026-07-23) |
|---------|----------------------|-----------------------------|
| PROCEDURE DIVISION | ❌ | ✅ DONE — the single biggest surprise: full statement-level PROCEDURE DIVISION support, oracle-verified against real GnuCOBOL (see docs/CAPABILITY_AUDIT_AND_ROADMAP.md §1.1) |
| Full program conversion | ❌ | 🟡 PARTIAL — batch/data-layer programs convert and are oracle-verified end to end; CICS/online programs get scaffolding only, not behavioral conversion |
| Python/Kotlin plugins | ❌ (easy to add) | ⬜ NOT STARTED — still not built (nor is Java) |
| Validation engine | ❌ | ✅ DONE — far exceeded: the 40-round adversarial oracle-verification harness against real `cobc` (241 findings fixed), described in `docs/PROGRESS_STATUS.md` and `tests/oracle/README.md`, is a full validation engine this plan didn't even scope |
| AI documentation | ❌ | ⬜ NOT STARTED as a product feature — extensive documentation was produced (see docs/PROGRESS_STATUS.md etc.) but as project docs authored by the build process, not an in-product "explain this COBOL" AI documentation feature |

---

## Adding New Target Languages (5 min each)

> **Status:** ⬜ NOT STARTED — this remains purely aspirational. No second
> target-language generator (Python, Java, or Kotlin) was ever added; the
> `generators` registry pattern shown below does not exist in the real
> codebase (there is nothing to register a second generator into).

```javascript
// To add Python support:

// 1. Create python.js
class PythonGenerator extends BaseGenerator {
  generate(ast) {
    return ast.records.map(r => this.generateDataclass(r)).join('\n\n');
  }

  generateDataclass(record) {
    const className = this.toPascalCase(record.name);
    const fields = record.children
      .filter(c => c.type === 'field')
      .map(f => `    ${this.toSnakeCase(f.name)}: ${this.mapType(f)}`)
      .join('\n');

    return `@dataclass\nclass ${className}:\n${fields}`;
  }

  mapType(field) {
    if (field.dataType === 'alphanumeric') return 'str';
    if (field.decimals > 0) return 'Decimal';
    return 'int';
  }
}

// 2. Register in index.js
import { PythonGenerator } from './python.js';
export const generators = {
  scala: new ScalaGenerator(),
  java: new JavaGenerator(),
  python: new PythonGenerator(),  // ← Add this
};

// Done! Python support added.
```

---

## Immediate Next Step

Ready to start? I'll begin with:

1. **Create the universal COBOL parser** in TypeScript (reuse Thyraa's existing parser, enhance it)
2. **Create the plugin system** with Scala and Java generators
3. **Add the MCP server wrapper**
4. **Integrate with Thyraa's existing backend**

Should I start coding now?

---

> **Historical note (2026-07-23):** this closing prompt is preserved as
> written on 2026-02-08. What actually happened next was not this four-step
> plan — steps 1 and 4 were pursued (an enhanced parser, integrated with the
> backend), but step 2 stopped at Scala only (no Java plugin), and step 3
> (MCP server) was never started. Instead, five months later, a separate
> adversarial-verification campaign — 14 rounds, paused, then resumed at the
> owner's request and run to completion at round 40 — went deep on hardening
> the single Scala target against real COBOL semantics rather than wide
> across multiple target languages. See `docs/PROGRESS_STATUS.md` for what
> actually happened and what remains open.
