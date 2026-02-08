# Thyraa: Unified COBOL Modernization Platform

## Product Vision

**Thyraa** is an enterprise-grade platform that transforms legacy COBOL systems into modern Scala applications through a human-in-the-loop, AI-assisted pipeline.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                         T H Y R A A                                         │
│              COBOL → Scala Modernization Platform                           │
│                                                                             │
│   "Understand First, Convert Confidently, Deploy Safely"                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THYRAA PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     PRESENTATION LAYER                               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   Web UI     │  │   VS Code    │  │     CLI      │               │   │
│  │  │   (React)    │  │  Extension   │  │   (Scala)    │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      API GATEWAY LAYER                               │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │                   REST API (Express)                          │   │   │
│  │  │  • /api/projects      - Project management                    │   │   │
│  │  │  • /api/analyze       - Analysis pipeline                     │   │   │
│  │  │  • /api/convert       - Conversion pipeline                   │   │   │
│  │  │  • /api/validate      - Validation & testing                  │   │   │
│  │  │  • /api/ai            - AI assistance                         │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATION LAYER                               │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │   │
│  │  │   Job Queue    │  │   Workflow     │  │    Event       │         │   │
│  │  │    (Bull)      │  │   Engine       │  │    Bus         │         │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│           ┌────────────────────────┼────────────────────────┐              │
│           ▼                        ▼                        ▼              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  ANALYSIS       │    │  CONVERSION     │    │  VALIDATION     │        │
│  │  ENGINE         │    │  ENGINE         │    │  ENGINE         │        │
│  │  (Node.js)      │    │  (Scala/JVM)    │    │  (Scala/JVM)    │        │
│  │                 │    │                 │    │                 │        │
│  │  • Ingestion    │    │  • Parser       │    │  • Dual-run     │        │
│  │  • Parsing      │    │  • TypeMapper   │    │  • Comparison   │        │
│  │  • Graph Build  │    │  • Generator    │    │  • Reports      │        │
│  │  • Flow ID      │    │  • Runtime      │    │  • Metrics      │        │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│           │                        │                        │              │
│           └────────────────────────┼────────────────────────┘              │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        AI LAYER                                      │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │   │
│  │  │  Documentation │  │   Business     │  │   Code         │         │   │
│  │  │  Generator     │  │   Rule Extract │  │   Explanation  │         │   │
│  │  │  (Claude)      │  │   (Claude)     │  │   (Claude)     │         │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      DATA LAYER                                      │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │   │
│  │  │   PostgreSQL   │  │     Redis      │  │   File Store   │         │   │
│  │  │   (Projects,   │  │   (Cache,      │  │   (Source,     │         │   │
│  │  │    Results)    │  │    Queue)      │  │    Output)     │         │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## User Journey & Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MODERNIZATION WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: INGEST                                                             │
│  ─────────────────                                                          │
│  User provides: GitHub URL / File Upload / Local Path                       │
│         ↓                                                                   │
│  System: Discovers all COBOL files (.cbl, .cob, .cpy, .jcl)                │
│         ↓                                                                   │
│  Output: File inventory, initial statistics                                 │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  STEP 2: ANALYZE (Thyraa Analysis Engine)                                   │
│  ─────────────────────────────────────────                                  │
│  • Parse all programs and copybooks                                         │
│  • Build dependency graph (calls, copies)                                   │
│  • Identify circular dependencies                                           │
│  • Discover business flows from JCL                                         │
│  • Generate documentation with AI                                           │
│         ↓                                                                   │
│  Output: Interactive dashboard with graphs, flows, documentation            │
│         ↓                                                                   │
│  👤 HUMAN REVIEW: Approve analysis, select programs to convert              │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  STEP 3: CONVERT (cobol2scala Engine)                                       │
│  ─────────────────────────────────────                                      │
│  • Deep parse copybooks (full PIC, COMP, OCCURS, REDEFINES)                │
│  • Map COBOL types to Scala types                                           │
│  • Generate Scala 3 case classes                                            │
│  • Generate enums from level 88s                                            │
│  • Create runtime library integration                                       │
│  • Convert PROCEDURE DIVISION (Phase 2)                                     │
│  • AI-enhanced documentation                                                │
│         ↓                                                                   │
│  Output: Scala source code, build files, runtime library                    │
│         ↓                                                                   │
│  👤 HUMAN REVIEW: Review generated code, approve or request changes         │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  STEP 4: VALIDATE                                                           │
│  ─────────────────                                                          │
│  • Compile generated Scala code                                             │
│  • Run unit tests                                                           │
│  • Dual-run comparison (COBOL vs Scala with same input)                    │
│  • Byte-level verification for file I/O                                     │
│  • Performance benchmarking                                                 │
│         ↓                                                                   │
│  Output: Validation report, test results, comparison metrics                │
│         ↓                                                                   │
│  👤 HUMAN REVIEW: Approve for production or iterate                         │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│  STEP 5: DEPLOY                                                             │
│  ─────────────────                                                          │
│  • Package Scala application                                                │
│  • Generate Docker containers                                               │
│  • CI/CD pipeline integration                                               │
│  • Production deployment                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Integration

### How the Engines Connect

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INTEGRATION FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌───────────────────┐                               │
│                         │    Web UI         │                               │
│                         │    (React)        │                               │
│                         └─────────┬─────────┘                               │
│                                   │                                         │
│                                   ▼                                         │
│                         ┌───────────────────┐                               │
│                         │   API Gateway     │                               │
│                         │   (Express)       │                               │
│                         └─────────┬─────────┘                               │
│                                   │                                         │
│              ┌────────────────────┼────────────────────┐                   │
│              ▼                    ▼                    ▼                   │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│    │                 │  │                 │  │                 │          │
│    │  POST /analyze  │  │  POST /convert  │  │ POST /validate  │          │
│    │                 │  │                 │  │                 │          │
│    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│             │                    │                    │                    │
│             ▼                    ▼                    ▼                    │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│    │   Bull Queue    │  │   Bull Queue    │  │   Bull Queue    │          │
│    │  "analysis"     │  │  "conversion"   │  │  "validation"   │          │
│    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│             │                    │                    │                    │
│             ▼                    ▼                    ▼                    │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│    │                 │  │                 │  │                 │          │
│    │  ANALYSIS       │  │  CONVERSION     │  │  VALIDATION     │          │
│    │  ENGINE         │  │  ENGINE         │  │  ENGINE         │          │
│    │  (Node.js)      │  │  (Scala JVM)    │  │  (Scala JVM)    │          │
│    │                 │  │                 │  │                 │          │
│    │  Thyraa's       │  │  cobol2scala    │  │  Test runner    │          │
│    │  existing code  │  │  integrated     │  │  + comparator   │          │
│    │                 │  │                 │  │                 │          │
│    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│             │                    │                    │                    │
│             ▼                    ▼                    ▼                    │
│    ┌─────────────────────────────────────────────────────────┐            │
│    │                                                         │            │
│    │                    SHARED DATA STORE                    │            │
│    │                                                         │            │
│    │  • PostgreSQL: Projects, results, audit trail           │            │
│    │  • Redis: Job queues, caching                           │            │
│    │  • File Store: Source files, generated code             │            │
│    │                                                         │            │
│    └─────────────────────────────────────────────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Scala Engine Integration

### Option A: HTTP Microservice (Recommended)

cobol2scala runs as a separate JVM service that the Node.js backend calls via HTTP.

```
┌─────────────────┐         ┌─────────────────┐
│   Node.js       │  HTTP   │   Scala         │
│   Backend       │ ──────► │   Service       │
│   (Express)     │  REST   │   (http4s)      │
└─────────────────┘         └─────────────────┘

Endpoints:
  POST /parse     - Parse COBOL and return AST
  POST /convert   - Convert AST to Scala code
  POST /generate  - Full pipeline: parse + convert
  GET  /health    - Health check
```

**Pros:**
- Language isolation (Node.js doesn't need JVM)
- Independent scaling
- Easy to deploy as separate container
- Clear API boundary

**Cons:**
- Network overhead
- Additional service to manage

### Option B: Native Integration via GraalVM

Compile Scala to native image, call from Node.js via child process.

```
┌─────────────────┐         ┌─────────────────┐
│   Node.js       │  exec   │   Native        │
│   Backend       │ ──────► │   Binary        │
│                 │ stdin/  │   (GraalVM)     │
│                 │ stdout  │                 │
└─────────────────┘         └─────────────────┘
```

**Pros:**
- Fast startup
- No network overhead
- Single deployment unit

**Cons:**
- GraalVM complexity
- Limited reflection support

### Option C: JVM Bridge (node-java)

Direct JVM calls from Node.js using node-java bridge.

**Not recommended** - complex, fragile, hard to debug.

---

## Data Models

### Shared Data Contract

```typescript
// TypeScript interface for data exchange

interface Project {
  id: string;
  name: string;
  source: SourceConfig;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface SourceConfig {
  type: 'github' | 'upload' | 'local';
  url?: string;
  branch?: string;
  path?: string;
}

type ProjectStatus =
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'converting'
  | 'converted'
  | 'validating'
  | 'validated'
  | 'failed';

// Analysis output (from Thyraa engine)
interface AnalysisResult {
  projectId: string;
  programs: Program[];
  copybooks: Copybook[];
  dependencies: Dependency[];
  flows: Flow[];
  statistics: Statistics;
  graph: GraphData;
}

interface Program {
  name: string;
  filePath: string;
  calls: string[];
  copies: string[];
  lines: number;
  divisions: Division[];
}

// Conversion input (to Scala engine)
interface ConversionRequest {
  projectId: string;
  files: FileToConvert[];
  options: ConversionOptions;
}

interface FileToConvert {
  path: string;
  content: string;
  type: 'program' | 'copybook';
}

interface ConversionOptions {
  packageName: string;
  generateTests: boolean;
  aiDocumentation: boolean;
  targetDialect: 'scala3' | 'scala2';
}

// Conversion output (from Scala engine)
interface ConversionResult {
  projectId: string;
  files: GeneratedFile[];
  errors: ConversionError[];
  warnings: ConversionWarning[];
  statistics: ConversionStats;
}

interface GeneratedFile {
  path: string;
  content: string;
  type: 'case-class' | 'enum' | 'object' | 'runtime' | 'test';
  sourceFile: string;
}
```

---

## API Specification

### New Endpoints for Unified Platform

```yaml
# Analysis (existing Thyraa endpoints)
POST /api/projects
  - Create new project

POST /api/projects/{id}/analyze
  - Start analysis job

GET /api/projects/{id}/analysis
  - Get analysis results

# Conversion (NEW - calls Scala engine)
POST /api/projects/{id}/convert
  - Start conversion job
  Request:
    {
      "files": ["CUSTOMER.cpy", "TRANSACTION.cpy"],
      "options": {
        "packageName": "com.bank.models",
        "generateTests": true,
        "aiDocumentation": true
      }
    }
  Response:
    {
      "jobId": "conv-123",
      "status": "queued"
    }

GET /api/projects/{id}/conversion
  - Get conversion results
  Response:
    {
      "status": "completed",
      "files": [
        {
          "path": "Customer.scala",
          "content": "case class Customer...",
          "type": "case-class"
        }
      ]
    }

# Validation (NEW)
POST /api/projects/{id}/validate
  - Start validation job

GET /api/projects/{id}/validation
  - Get validation results

# AI Enhancement
POST /api/ai/document
  - Generate documentation for code

POST /api/ai/explain
  - Explain COBOL code in plain English

POST /api/ai/extract-rules
  - Extract business rules from code
```

---

## Directory Structure (Unified)

```
thyraa/
├── frontend/                    # React Web UI (existing Thyraa)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Index.tsx
│   │   │   ├── GetStarted.tsx
│   │   │   ├── AnalysisResults.tsx
│   │   │   ├── ConversionResults.tsx    # NEW
│   │   │   └── ValidationResults.tsx    # NEW
│   │   ├── components/
│   │   │   ├── analysis/
│   │   │   ├── conversion/              # NEW
│   │   │   └── validation/              # NEW
│   │   └── lib/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                     # Node.js API (existing Thyraa)
│   ├── src/
│   │   └── server.js
│   ├── api/
│   │   ├── routes/
│   │   │   ├── analyze.routes.js
│   │   │   ├── convert.routes.js        # NEW
│   │   │   └── validate.routes.js       # NEW
│   │   └── controllers/
│   ├── packages/
│   │   ├── github-ingestion/
│   │   └── cobol-analysis/
│   ├── services/
│   │   └── scala-engine.service.js      # NEW - calls Scala service
│   └── package.json
│
├── scala-engine/                # Scala Conversion Engine (cobol2scala)
│   ├── build.sbt
│   ├── src/main/scala/
│   │   └── com/thyraa/
│   │       ├── Main.scala               # HTTP server entry
│   │       ├── api/
│   │       │   └── ConversionApi.scala  # REST endpoints
│   │       ├── parser/
│   │       │   ├── Lexer.scala
│   │       │   ├── CopybookParser.scala
│   │       │   └── Ast.scala
│   │       ├── analyzer/
│   │       │   └── TypeMapper.scala
│   │       ├── generator/
│   │       │   └── ScalaGenerator.scala
│   │       └── runtime/
│   │           └── CobolTypes.scala
│   └── Dockerfile
│
├── ai-service/                  # AI Enhancement Service (optional)
│   ├── src/
│   │   ├── documentation.py
│   │   ├── explanation.py
│   │   └── rule_extraction.py
│   └── Dockerfile
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── nginx/
│       └── nginx.conf
│
├── k8s/                         # Kubernetes manifests
│   ├── frontend.yaml
│   ├── backend.yaml
│   ├── scala-engine.yaml
│   ├── redis.yaml
│   └── postgres.yaml
│
└── docs/
    ├── architecture.md
    ├── api.md
    └── deployment.md
```

---

## Deployment Architecture

### Docker Compose (Development/Small Scale)

```yaml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "3002:3002"
    environment:
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=postgres://postgres:5432/thyraa
      - SCALA_ENGINE_URL=http://scala-engine:8080
    depends_on:
      - redis
      - postgres
      - scala-engine

  scala-engine:
    build: ./scala-engine
    ports:
      - "8080:8080"
    environment:
      - AI_API_KEY=${CLAUDE_API_KEY}

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=thyraa
      - POSTGRES_USER=thyraa
      - POSTGRES_PASSWORD=thyraa
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Kubernetes (Production/Enterprise)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KUBERNETES CLUSTER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   Ingress        │  thyraa.company.com                                  │
│  │   Controller     │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ├──────────────────┬──────────────────┐                          │
│           ▼                  ▼                  ▼                          │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│  │   Frontend      │ │   Backend       │ │   Scala Engine  │              │
│  │   (3 replicas)  │ │   (3 replicas)  │ │   (3 replicas)  │              │
│  │                 │ │                 │ │                 │              │
│  │   React SPA     │ │   Node.js API   │ │   JVM Service   │              │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘              │
│                              │                  │                          │
│                              ▼                  ▼                          │
│  ┌─────────────────────────────────────────────────────────┐              │
│  │                     StatefulSets                        │              │
│  │                                                         │              │
│  │  ┌─────────────────┐  ┌─────────────────┐              │              │
│  │  │     Redis       │  │   PostgreSQL    │              │              │
│  │  │   (HA Cluster)  │  │   (HA Cluster)  │              │              │
│  │  └─────────────────┘  └─────────────────┘              │              │
│  │                                                         │              │
│  └─────────────────────────────────────────────────────────┘              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────┐              │
│  │                   Persistent Volumes                    │              │
│  │                                                         │              │
│  │  • Source files    • Generated code    • Audit logs     │              │
│  └─────────────────────────────────────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  NETWORK SECURITY                                                           │
│  ─────────────────                                                          │
│  • TLS 1.3 everywhere                                                       │
│  • Network policies (pod-to-pod isolation)                                  │
│  • Private subnets for databases                                            │
│  • WAF at ingress                                                           │
│                                                                             │
│  AUTHENTICATION                                                             │
│  ──────────────────                                                         │
│  • OAuth 2.0 / OIDC (enterprise SSO)                                        │
│  • SAML 2.0 support                                                         │
│  • API key authentication for CLI                                           │
│  • JWT tokens with short expiry                                             │
│                                                                             │
│  AUTHORIZATION                                                              │
│  ─────────────────                                                          │
│  • RBAC (Admin, Developer, Viewer)                                          │
│  • Project-level access control                                             │
│  • Audit logging for all actions                                            │
│                                                                             │
│  DATA PROTECTION                                                            │
│  ─────────────────                                                          │
│  • Encryption at rest (AES-256)                                             │
│  • Encryption in transit (TLS)                                              │
│  • No source code leaves customer environment (on-premise)                  │
│  • Automatic PII detection and masking                                      │
│                                                                             │
│  COMPLIANCE                                                                 │
│  ───────────                                                                │
│  • SOC 2 Type II                                                            │
│  • ISO 27001                                                                │
│  • GDPR compliant                                                           │
│  • Full audit trail                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Integration Foundation (2-3 weeks)
- [ ] Set up monorepo structure
- [ ] Create Scala HTTP service wrapper around cobol2scala
- [ ] Add conversion endpoints to Node.js backend
- [ ] Create service communication layer
- [ ] Docker Compose for local development

### Phase 2: Unified UI (2-3 weeks)
- [ ] Add conversion workflow to React UI
- [ ] Create code review component
- [ ] Add side-by-side COBOL/Scala view
- [ ] Implement conversion progress tracking
- [ ] Add download/export functionality

### Phase 3: AI Enhancement (1-2 weeks)
- [ ] Integrate Claude API for documentation
- [ ] Add "Explain this code" feature
- [ ] Implement business rule extraction
- [ ] Create inline documentation generation

### Phase 4: Validation Engine (2-3 weeks)
- [ ] Build Scala test runner
- [ ] Implement dual-run comparison
- [ ] Create validation dashboard
- [ ] Add metrics and reporting

### Phase 5: Enterprise Features (2-3 weeks)
- [ ] Add user authentication (OAuth/SAML)
- [ ] Implement RBAC
- [ ] Create audit logging
- [ ] Add project management features
- [ ] Kubernetes deployment manifests

### Phase 6: Polish & Launch (1-2 weeks)
- [ ] Documentation
- [ ] Performance optimization
- [ ] Security audit
- [ ] Beta testing with pilot customer

---

## Technology Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React + TypeScript + Tailwind | User interface |
| API Gateway | Express.js | Route handling, orchestration |
| Analysis Engine | Node.js | GitHub ingestion, dependency analysis |
| Conversion Engine | Scala 3 + http4s | COBOL parsing, Scala generation |
| Job Queue | Bull + Redis | Async job processing |
| Database | PostgreSQL | Project data, results, audit |
| Cache | Redis | API caching, session store |
| AI | Claude API | Documentation, explanation |
| Container | Docker | Packaging |
| Orchestration | Kubernetes | Production deployment |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Analysis accuracy | 99% (dependency detection) |
| Conversion success rate | 95% (copybooks), 85% (programs) |
| Processing speed | 10,000 LOC/minute |
| UI response time | < 200ms |
| API response time | < 500ms |
| Validation pass rate | 98% |
| Customer satisfaction | 4.5/5 |

---

## Next Steps

1. **Share this architecture with your friend**
2. **Agree on the integration approach** (HTTP microservice recommended)
3. **Set up the monorepo structure**
4. **Create the Scala HTTP service**
5. **Build the integration layer in Node.js**
6. **Iterate on the unified workflow**

**Ready to build? Let's start with Phase 1!**
