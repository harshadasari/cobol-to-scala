/**
 * File detector
 * Detects file types and routes to appropriate parser
 */
export class FileDetector {
  /**
   * Detect file type from extension
   */
  static detectType(filePath) {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    const typeMap = {
      'cbl': 'cobol',
      'cob': 'cobol',
      'cpy': 'copybook',
      'jcl': 'jcl',
      'jclproc': 'jcl'
    };
    
    return typeMap[extension] || 'unknown';
  }

  /**
   * Check if file is COBOL program
   */
  static isCobolProgram(filePath) {
    return /\.(cbl|cob)$/i.test(filePath);
  }

  /**
   * Check if file is copybook
   */
  static isCopybook(filePath) {
    return /\.cpy$/i.test(filePath);
  }

  /**
   * Check if file is JCL
   */
  static isJcl(filePath) {
    return /\.(jcl|jclproc)$/i.test(filePath);
  }

  /**
   * Check if file is COBOL-related
   */
  static isCobolRelated(filePath) {
    return /\.(cbl|cob|cpy|jcl|jclproc)$/i.test(filePath);
  }
}

export default FileDetector;

