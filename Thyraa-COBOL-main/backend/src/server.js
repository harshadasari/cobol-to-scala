import express from 'express';
import cors from 'cors';
import { analysisRoutes } from '../api/routes/analysis.routes.js';
import { conversionRoutes } from '../api/routes/conversion.routes.js';
import { createAnalysisQueue } from '../core/processing/queue-manager.js';
import { appConfig } from '../config/app.config.js';

const app = express();
const PORT = appConfig.server.port;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize job queue (with error handling)
let analysisQueue;
try {
  analysisQueue = createAnalysisQueue();
  // Note: Redis connection errors will be handled by queue event listeners
} catch (error) {
  console.error('Failed to initialize queue:', error.message);
  console.warn('Running without job queue. Analysis features will not work.');
  // Create a mock queue for graceful degradation
  analysisQueue = {
    add: async () => { 
      throw new Error('Redis not available. Please start Redis to use job queue.');
    },
    getJob: async () => null,
    close: async () => {},
    on: () => {},
    process: () => {}
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    queue: analysisQueue ? 'connected' : 'disconnected'
  });
});

// Routes
app.use('/api', analysisRoutes(analysisQueue));
app.use('/api/convert', conversionRoutes());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: err.message || 'Internal server error' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${appConfig.server.env}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await analysisQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  await analysisQueue.close();
  process.exit(0);
});

