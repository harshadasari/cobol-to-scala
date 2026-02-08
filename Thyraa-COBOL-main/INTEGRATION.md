# Frontend-Backend Integration

## ✅ Integration Complete

The frontend is now fully integrated with the backend API.

### What Was Changed

1. **Created API Service** (`src/lib/api.ts`)
   - `startAnalysis()` - Starts analysis job
   - `getAnalysisStatus()` - Gets job status
   - `getAnalysisResult()` - Gets analysis results
   - `pollAnalysisResult()` - Polls for results with progress updates

2. **Updated AnalysisProgress Component** (`src/components/get-started/AnalysisProgress.tsx`)
   - Replaced mock data with real API calls
   - Added progress tracking
   - Added error handling
   - Maintains backward compatibility with sample/demo repos

### API Endpoints Used

- `POST /api/analyze` - Start analysis
- `GET /api/analyze/:jobId/status` - Get job status
- `GET /api/analyze/:jobId/result` - Get results

### Configuration

**Backend URL**: Set via environment variable
- Default: `http://localhost:3001`
- Configure via `.env` file:
  ```
  VITE_API_URL=http://localhost:3001
  ```

Or set when running:
```bash
VITE_API_URL=http://localhost:3001 npm run dev
```

### Flow

1. User enters GitHub URL and clicks "Start analysis"
2. Frontend calls `POST /api/analyze` with repo URL and branch
3. Backend returns job ID and status "queued"
4. Frontend polls `GET /api/analyze/:jobId/status` every 2 seconds
5. Backend updates progress (0-100%)
6. When status is "complete", frontend calls `GET /api/analyze/:jobId/result`
7. Frontend displays real counts and data

### Error Handling

- Network errors show toast notifications
- Failed jobs display error state
- Sample/demo repos still use mock data (for testing)

### Testing

1. Start backend:
```bash
cd backend
npm run dev
```

2. Start frontend:
```bash
npm run dev
```

3. Test with a real GitHub repo:
   - Go to "Get Started"
   - Enter: `https://github.com/jiuweigui/cobol`
   - Click "Start analysis"
   - Watch real-time progress and results

### Special Cases

- **Sample repos** (`sample://...`): Uses mock data
- **Uploaded codebase** (`uploaded-codebase`): Uses mock data
- **Cached results**: Backend returns immediately if cached
- **No backend**: Will show error toast

