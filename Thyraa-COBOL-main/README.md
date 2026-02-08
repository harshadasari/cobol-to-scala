# Thyraa-COBOL-main

Main application for the COBOL-to-Scala conversion platform.

## Overview

This directory contains the complete web application including:
- **Backend**: Node.js/Express server with COBOL-to-Scala conversion engine
- **Frontend**: React/TypeScript web interface with Monaco editor

## Project Structure

```
Thyraa-COBOL-main/
├── backend/                    # Node.js backend
│   ├── packages/
│   │   └── cobol-to-scala/     # Core conversion engine
│   ├── routes/                 # API routes
│   ├── server.ts               # Express server
│   └── package.json
├── src/                        # React frontend
│   ├── pages/
│   │   └── ScalaConverter.tsx  # Conversion UI
│   ├── components/             # UI components
│   ├── lib/
│   │   └── conversion-api.ts   # API client
│   └── App.tsx
└── package.json
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or bun

### Backend Setup

```bash
cd backend
npm install
npm start
# Server runs on http://localhost:3000
```

### Frontend Setup

```bash
npm install
npm run dev
# App runs on http://localhost:5173
```

## Technologies Used

**Backend:**
- Node.js + Express
- TypeScript
- Custom COBOL parser and Scala code generator

**Frontend:**
- React 18
- TypeScript
- Vite
- Monaco Editor (code editor)
- shadcn/ui components
- Tailwind CSS

## API Endpoints

See [INTEGRATION.md](INTEGRATION.md) for complete API documentation.

**Main Conversion Endpoint:**
```
POST /api/convert/scala
Body: { source: string, options: {...} }
Response: { scala: string, metadata: {...} }
```

## Development

**Run Backend Tests:**
```bash
cd backend
npm test
```

**Run Frontend in Development:**
```bash
npm run dev
```

**Build for Production:**
```bash
npm run build
```

## Documentation

- **[Integration Guide](INTEGRATION.md)** - API endpoints and integration
- **[Main README](../README.md)** - Project overview
- **[Architecture](../docs/UNIFIED_PLATFORM_ARCHITECTURE.md)** - System design
- **[Examples](../examples/)** - Sample conversions

## Contributing

See the main [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../LICENSE)
