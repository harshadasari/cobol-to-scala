import { parentPort, workerData } from 'worker_threads';
import { CobolParser } from '../../packages/cobol-analysis/parsers/cobol.parser.js';
import { JclParser } from '../../packages/cobol-analysis/parsers/jcl.parser.js';
import { FileDetector } from '../../packages/cobol-analysis/parsers/file-detector.js';

/**
 * Worker thread for parsing files
 */
const { files, parserType } = workerData;

try {
  const results = files.map(file => {
    try {
      const fileType = FileDetector.detectType(file.path);
      
      if (fileType === 'cobol') {
        return CobolParser.parse(file.path, file.content || '');
      } else if (fileType === 'jcl') {
        return JclParser.parse(file.path, file.content || '');
      } else if (fileType === 'copybook') {
        return {
          name: file.path.split('/').pop().replace(/\.cpy$/i, ''),
          filePath: file.path,
          type: 'copybook',
          content: file.content || ''
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error parsing ${file.path}:`, error);
      return null;
    }
  }).filter(result => result !== null);
  
  parentPort.postMessage(results);
} catch (error) {
  parentPort.postMessage({ error: error.message });
}

