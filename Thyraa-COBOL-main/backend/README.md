# Thyraa COBOL Backend

Scalable backend for analyzing COBOL codebases from GitHub repositories.

## Architecture

- **packages/github-ingestion**: All GitHub API operations
- **packages/cobol-analysis**: COBOL parsing and analysis
- **core/processing**: Parallel processing and job queues
- **core/graph**: Dependency graph algorithms
- **core/cache**: Caching service
- **api**: REST API endpoints

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your GitHub token and Redis configuration
```

3. Start Redis (required for job queue):
```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or install Redis locally
```

4. Start the server:
```bash
npm run dev
```

## API Endpoints

### POST /api/analyze
Start analysis of a GitHub repository.

**Request:**
```json
{
  "repoUrl": "https://github.com/owner/repo",
  "branch": "main"
}
```

**Response:**
```json
{
  "jobId": "job-1234567890-abc",
  "status": "queued",
  "message": "Analysis job queued successfully"
}
```

### GET /api/analyze/:jobId/status
Get the status of an analysis job.

**Response:**
```json
{
  "jobId": "job-1234567890-abc",
  "status": "processing",
  "progress": {
    "processed": 5000,
    "total": 10000,
    "percentage": 50
  }
}
```

### GET /api/analyze/:jobId/result
Get the result of a completed analysis.

**Response:**
```json
{
  "jobId": "job-1234567890-abc",
  "status": "complete",
  "result": {
    "summary": {
      "cobolPrograms": 5000,
      "copybooks": 2000,
      "batchFlows": 150,
      "dependenciesMapped": 50000
    },
    "flows": [...],
    "dependencyGraph": {...}
  }
}
```

## Environment Variables

- `GITHUB_TOKEN`: GitHub personal access token (required)
- `REDIS_HOST`: Redis host (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `REDIS_PASSWORD`: Redis password (optional)
- `PORT`: Server port (default: 3001)
- `CACHE_TTL`: Cache TTL in seconds (default: 3600)

## Features

- ✅ Scalable to 100,000+ files
- ✅ Parallel processing with worker threads
- ✅ Job queue for async processing
- ✅ Caching for faster re-analysis
- ✅ Dependency graph analysis
- ✅ Flow identification
- ✅ Support for COBOL, JCL, and copybooks

## License

MIT

