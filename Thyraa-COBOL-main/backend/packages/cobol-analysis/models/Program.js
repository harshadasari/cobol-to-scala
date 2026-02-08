/**
 * Program model
 * Represents a COBOL program with its dependencies
 */
export class Program {
  constructor(data = {}) {
    this.name = data.name || '';
    this.filePath = data.filePath || '';
    this.type = data.type || 'program'; // 'program' | 'copybook' | 'jcl'
    this.calls = data.calls || []; // Programs called by this program
    this.copybooks = data.copybooks || []; // Copybooks used
    this.metadata = data.metadata || {};
    this.content = data.content || '';
    this.flowId = data.flowId || null; // Which flow this belongs to
  }

  /**
   * Add a call dependency
   */
  addCall(programName) {
    if (!this.calls.includes(programName)) {
      this.calls.push(programName);
    }
  }

  /**
   * Add a copybook dependency
   */
  addCopybook(copybookName) {
    if (!this.copybooks.includes(copybookName)) {
      this.copybooks.push(copybookName);
    }
  }

  /**
   * Check if program has dependencies
   */
  hasDependencies() {
    return this.calls.length > 0 || this.copybooks.length > 0;
  }

  /**
   * Get all dependencies (calls + copybooks)
   */
  getAllDependencies() {
    return [...this.calls, ...this.copybooks];
  }

  toJSON() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0423fc58-f186-4cd7-8469-e50b73c0f1dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Program.js:49',message:'toJSON called',data:{name:this.name,filePath:this.filePath,metadataLines:this.metadata?.lines,contentLength:this.content?.length||0,contentLines:this.content?.split('\n').length||0,hasContent:!!this.content,hasContentInJSON:!!this.content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return {
      name: this.name,
      filePath: this.filePath,
      type: this.type,
      calls: this.calls,
      copybooks: this.copybooks,
      metadata: this.metadata,
      content: this.content,
      flowId: this.flowId
    };
  }
}

export default Program;

