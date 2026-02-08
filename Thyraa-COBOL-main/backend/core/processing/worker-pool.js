import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Worker Pool
 * Manages worker threads for parallel processing
 */
export class WorkerPool {
  constructor(size = 4) {
    this.size = size;
    this.workers = [];
    this.queue = [];
    this.active = 0;
    // Get absolute path to worker file
    this.workerPath = join(__dirname, 'worker.js');
  }

  /**
   * Process files in parallel using worker threads
   */
  async processFiles(files, parserType = 'cobol') {
    // For small files, process directly without workers
    if (files.length < 10) {
      return this.processDirectly(files);
    }
    
    const chunks = this.chunkArray(files, Math.ceil(files.length / this.size));
    const results = await Promise.all(
      chunks.map(chunk => this.processChunk(chunk, parserType))
    );
    
    return results.flat();
  }

  /**
   * Process files directly without workers (for small batches)
   */
  async processDirectly(files) {
    const { CobolParser } = await import('../../packages/cobol-analysis/parsers/cobol.parser.js');
    const { JclParser } = await import('../../packages/cobol-analysis/parsers/jcl.parser.js');
    const { FileDetector } = await import('../../packages/cobol-analysis/parsers/file-detector.js');
    const { Program } = await import('../../packages/cobol-analysis/models/Program.js');
    
    return files.map(file => {
      try {
        const fileType = FileDetector.detectType(file.path);
        
        // Log warning if content is missing
        if (!file.content || file.content.trim() === '') {
          console.warn(`Warning: File ${file.path} has no content`);
        }
        
        if (fileType === 'cobol') {
          return CobolParser.parse(file.path, file.content || '');
        } else if (fileType === 'jcl') {
          return JclParser.parse(file.path, file.content || '');
        } else if (fileType === 'copybook') {
          return new Program({
            name: file.path.split('/').pop().replace(/\.cpy$/i, ''),
            filePath: file.path,
            type: 'copybook',
            content: file.content || '',
            calls: [],  // Copybooks don't have calls
            copybooks: []  // But they might use other copybooks
          });
        }
        
        return null;
      } catch (error) {
        console.error(`Error parsing ${file.path}:`, error);
        return null;
      }
    }).filter(result => result !== null);
  }

  /**
   * Process a chunk of files
   */
  async processChunk(chunk, parserType) {
    // For now, process directly to avoid worker thread path issues
    // Workers can be added later with proper setup
    try {
      return await this.processDirectly(chunk);
    } catch (error) {
      console.error('Error processing chunk:', error);
      // Fallback: process directly
      return this.processDirectly(chunk);
    }
  }

  /**
   * Chunk array into smaller arrays
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

export default WorkerPool;

