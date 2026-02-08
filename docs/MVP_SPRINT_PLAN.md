# Thyraa MVP Sprint Plan
## 10-20 Hours to Working Product

---

## Core Constraints

- **Time**: 10-20 hours ONLY
- **Scalability**: COBOL → Scala/Java/Python/Kotlin (pluggable targets)
- **Future-proof**: MCP server + Agent-ready architecture
- **Leverage**: Use existing Thyraa frontend/backend

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
[ ] Set up conversion service in Thyraa backend
[ ] Create /api/convert endpoint
[ ] Define AST JSON schema (language-agnostic)
[ ] Add target language parameter
```

### Hour 2-6: Universal COBOL Parser (Node.js)
**Goal**: Parse COBOL → JSON AST

```
[ ] Port/simplify cobol2scala parser to TypeScript
[ ] Output language-agnostic AST as JSON
[ ] Handle: DATA DIVISION, PIC, COMP, OCCURS, level 88
[ ] MCP tool: parse_cobol
```

### Hour 6-10: Scala Plugin
**Goal**: First target language working

```
[ ] AST → Scala 3 case classes
[ ] AST → Scala enums (level 88)
[ ] Generate companion objects
[ ] MCP tool: convert_to_scala
```

### Hour 10-14: Java Plugin (Copy + Modify)
**Goal**: Prove multi-target works

```
[ ] Copy Scala plugin structure
[ ] AST → Java records/classes
[ ] AST → Java enums
[ ] MCP tool: convert_to_java
```

### Hour 14-18: UI Integration
**Goal**: Working end-to-end flow

```
[ ] Add "Convert" tab to analysis results
[ ] Target language selector dropdown
[ ] Code preview with syntax highlighting
[ ] Download generated code
```

### Hour 18-20: MCP Server + Polish
**Goal**: Agent-ready deployment

```
[ ] Create MCP server wrapper
[ ] Expose all tools via MCP protocol
[ ] Docker compose for full stack
[ ] Basic documentation
```

---

## Simplified File Structure

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

| Feature | Included |
|---------|----------|
| COBOL Parser (copybooks) | ✅ |
| Universal JSON AST | ✅ |
| Scala generator | ✅ |
| Java generator | ✅ |
| REST API | ✅ |
| MCP Server | ✅ |
| Plugin architecture | ✅ |
| Basic UI integration | ✅ |
| Multi-target support | ✅ |
| Agent-ready tools | ✅ |

| Feature | NOT Included (Future) |
|---------|----------------------|
| PROCEDURE DIVISION | ❌ |
| Full program conversion | ❌ |
| Python/Kotlin plugins | ❌ (easy to add) |
| Validation engine | ❌ |
| AI documentation | ❌ |

---

## Adding New Target Languages (5 min each)

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
