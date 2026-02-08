import express from 'express';
import { ConversionController } from '../controllers/conversion.controller.js';

export function conversionRoutes() {
  const router = express.Router();
  const controller = new ConversionController();

  // Parse COBOL to AST
  router.post('/parse', (req, res) => controller.parseCobol(req, res));

  // Convert COBOL to Scala
  router.post('/scala', (req, res) => controller.convertToScala(req, res));

  // Batch conversion
  router.post('/batch', (req, res) => controller.convertBatch(req, res));

  // Get runtime library
  router.get('/runtime', (req, res) => controller.getRuntime(req, res));

  return router;
}

export default conversionRoutes;
