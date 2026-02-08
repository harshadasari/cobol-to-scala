import { WorkerPool } from './worker-pool.js';
import { GraphBuilder } from '../graph/graph-builder.js';

/**
 * Batch Processor
 * Orchestrates parallel processing of files
 */
export class BatchProcessor {
  constructor(options = {}) {
    this.workerPool = new WorkerPool(options.workerSize || 4);
    this.graphBuilder = new GraphBuilder();
    this.chunkSize = options.chunkSize || 1000;
  }

  /**
   * Process files in batches
   */
  async process(files, parserType = 'cobol', onProgress = null) {
    const chunks = this.chunkArray(files, this.chunkSize);
    const allResults = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Process chunk in parallel
      const results = await this.workerPool.processFiles(chunk, parserType);
      allResults.push(...results);
      
      // Incrementally build graph
      this.graphBuilder.addNodes(results);
      
      // Report progress
      if (onProgress) {
        onProgress({
          processed: allResults.length,
          total: files.length,
          percentage: Math.round((allResults.length / files.length) * 100)
        });
      }
    }
    
    return {
      programs: allResults,
      graph: this.graphBuilder.build()
    };
  }

  /**
   * Chunk array
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

export default BatchProcessor;

