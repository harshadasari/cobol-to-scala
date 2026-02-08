import express from 'express';
import { AnalysisController } from '../controllers/analysis.controller.js';

// Track if processor is already registered
let processorRegistered = false;

/**
 * Analysis Routes
 */
export function analysisRoutes(analysisQueue) {
  const router = express.Router();
  const controller = new AnalysisController(analysisQueue);

  // Process analysis jobs (register only once)
  if (!processorRegistered) {
    analysisQueue.process('analysis', async (job) => {
      return controller.processAnalysis(job);
    });
    processorRegistered = true;
  }

  // POST /api/analyze - Start analysis
  router.post('/analyze', (req, res) => controller.startAnalysis(req, res));

  // DELETE /api/analyze/cache - Clear all cache (must be before parameterized routes)
  router.delete('/analyze/cache', (req, res) => 
    controller.clearCache(req, res)
  );

  // GET /api/analyze/:jobId/status - Get job status
  router.get('/analyze/:jobId/status', (req, res) => 
    controller.getJobStatus(req, res)
  );

  // GET /api/analyze/:jobId/result - Get job result
  router.get('/analyze/:jobId/result', (req, res) => 
    controller.getJobResult(req, res)
  );

  return router;
}

export default analysisRoutes;

