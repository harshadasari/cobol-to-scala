import { convertToScala, parseCobol } from '../../packages/cobol-to-scala/index.js';
import fs from 'fs/promises';
import path from 'path';

export class ConversionController {
  constructor() {}

  // POST /api/convert/parse - Parse COBOL to AST
  async parseCobol(req, res) {
    try {
      const { source } = req.body;
      if (!source) {
        return res.status(400).json({ error: 'source is required' });
      }
      const ast = parseCobol(source);
      res.json({ success: true, ast });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // POST /api/convert/scala - Convert COBOL to Scala
  async convertToScala(req, res) {
    try {
      const { source, options = {} } = req.body;
      if (!source) {
        return res.status(400).json({ error: 'source is required' });
      }
      const result = convertToScala(source, options);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // POST /api/convert/batch - Convert multiple files
  async convertBatch(req, res) {
    try {
      const { files, options = {} } = req.body;
      if (!files || !Array.isArray(files)) {
        return res.status(400).json({ error: 'files array is required' });
      }

      const results = files.map(file => {
        try {
          const result = convertToScala(file.source, {
            ...options,
            filename: file.filename
          });
          return { filename: file.filename, success: true, ...result };
        } catch (error) {
          return { filename: file.filename, success: false, error: error.message };
        }
      });

      res.json({
        success: true,
        results,
        summary: {
          total: files.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // GET /api/convert/runtime - Get Scala runtime library
  async getRuntime(req, res) {
    try {
      const runtimeDir = path.join(process.cwd(), 'packages/cobol-to-scala/runtime');
      const files = await fs.readdir(runtimeDir);
      const scalaFiles = files.filter(f => f.endsWith('.scala'));

      const runtime = {};
      for (const file of scalaFiles) {
        const content = await fs.readFile(path.join(runtimeDir, file), 'utf-8');
        runtime[file] = content;
      }

      res.json({ success: true, runtime });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
