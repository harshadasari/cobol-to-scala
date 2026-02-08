import { Program } from '../models/Program.js';

/**
 * COBOL Parser
 * Parses COBOL programs to extract:
 * - PROGRAM-ID
 * - CALL statements
 * - COPY statements
 */
export class CobolParser {
  /**
   * Parse COBOL program
   */
  static parse(filePath, content) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0423fc58-f186-4cd7-8469-e50b73c0f1dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cobol.parser.js:14',message:'parse entry',data:{filePath,contentLength:content?.length||0,contentLines:content?.split('\n').length||0,hasContent:!!content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const program = new Program({
      filePath,
      content,
      type: 'program'
    });

    // Extract PROGRAM-ID
    program.name = this.extractProgramId(content);
    
    // Extract CALL statements
    program.calls = this.extractCalls(content);
    
    // Extract COPY statements
    program.copybooks = this.extractCopybooks(content);
    
    // Extract metadata
    program.metadata = this.extractMetadata(content);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0423fc58-f186-4cd7-8469-e50b73c0f1dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cobol.parser.js:33',message:'parse exit',data:{filePath,programName:program.name,metadataLines:program.metadata?.lines,contentLength:program.content?.length||0,contentLines:program.content?.split('\n').length||0,hasContent:!!program.content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    return program;
  }

  /**
   * Extract PROGRAM-ID
   */
  static extractProgramId(content) {
    // Match PROGRAM-ID. program-name
    const match = content.match(/PROGRAM-ID\.\s+([A-Z0-9-]+)/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract CALL statements
   */
  static extractCalls(content) {
    const calls = [];
    
    // Match CALL 'program-name' or CALL WS-VARIABLE
    // Pattern: CALL ['"]?([A-Z0-9-]+)['"]?
    const callRegex = /CALL\s+['"]?([A-Z0-9-]+)['"]?/gi;
    let match;
    
    while ((match = callRegex.exec(content)) !== null) {
      const programName = match[1].trim();
      if (programName && !calls.includes(programName)) {
        calls.push(programName);
      }
    }
    
    return calls;
  }

  /**
   * Extract COPY statements
   */
  static extractCopybooks(content) {
    const copybooks = [];
    
    // Match COPY copybook-name or COPY copybook-name REPLACING
    // Pattern: COPY\s+([A-Z0-9-]+)
    const copyRegex = /COPY\s+([A-Z0-9-]+)/gi;
    let match;
    
    while ((match = copyRegex.exec(content)) !== null) {
      const copybookName = match[1].trim();
      if (copybookName && !copybooks.includes(copybookName)) {
        copybooks.push(copybookName);
      }
    }
    
    return copybooks;
  }

  /**
   * Extract metadata
   */
  static extractMetadata(content) {
    const metadata = {};
    
    // Extract divisions
    const divisions = {
      identification: /IDENTIFICATION\s+DIVISION/i.test(content),
      environment: /ENVIRONMENT\s+DIVISION/i.test(content),
      data: /DATA\s+DIVISION/i.test(content),
      procedure: /PROCEDURE\s+DIVISION/i.test(content)
    };
    
    metadata.divisions = divisions;
    metadata.lines = content.split('\n').length;
    
    return metadata;
  }
}

export default CobolParser;

