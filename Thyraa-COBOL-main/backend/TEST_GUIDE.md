# Testing Guide

## Issues Found and Fixed

### ✅ Issue 1: Worker Thread Path Resolution
**Problem**: Worker threads with ES modules need proper file:// URL handling
**Fix**: Simplified to process files directly for now (workers can be added later)

### ✅ Issue 2: Queue Processor Registration
**Problem**: Queue processor was being registered multiple times
**Fix**: Added flag to register only once

### ✅ Issue 3: Redis Connection Handling
**Problem**: Server would crash if Redis wasn't running
**Fix**: Added graceful error handling with fallback

### ✅ Issue 4: Missing Error Handlers
**Fix**: Added error handlers for queue events

## Testing Steps

### 1. Start Redis (Optional but recommended)
```bash
docker run -d -p 6379:6379 redis:latest
```

Or if Redis is not available, the server will still start but job queue won't work.

### 2. Create .env file
Create `backend/.env` with:
```
GITHUB_TOKEN=your_github_token_here
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3001
```

### 3. Start the Server
```bash
cd backend
npm run dev
```

### 4. Test Health Endpoint
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "queue": "connected" // or "disconnected" if Redis not available
}
```

### 5. Test Analysis Endpoint
```bash
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/jiuweigui/cobol",
    "branch": "main"
  }'
```

Expected response:
```json
{
  "jobId": "job-1234567890-abc",
  "status": "queued",
  "message": "Analysis job queued successfully"
}
```

### 6. Check Job Status
```bash
curl http://localhost:3001/api/analyze/job-1234567890-abc/status
```

### 7. Get Results (when complete)
```bash
curl http://localhost:3001/api/analyze/job-1234567890-abc/result
```

## Known Limitations

1. **Without Redis**: Job queue won't work. Analysis requests will fail.
2. **Without GitHub Token**: Public repos work, private repos won't.
3. **Worker Threads**: Currently processing directly (can be optimized later).

## Troubleshooting

### Server won't start
- Check if port 3001 is available
- Check Node.js version (should be 18+)

### Redis connection errors
- Make sure Redis is running: `docker ps`
- Check Redis port (default 6379)
- Server will still start but queue won't work

### Analysis jobs fail
- Check GitHub token is valid
- Check repository URL is correct
- Check repository exists and is accessible

