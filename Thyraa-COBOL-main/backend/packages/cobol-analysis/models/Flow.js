/**
 * Flow model
 * Represents a logical flow of programs (batch job, transaction, etc.)
 */
export class Flow {
  constructor(data = {}) {
    this.id = data.id || `flow-${Date.now()}`;
    this.name = data.name || '';
    this.type = data.type || 'unknown'; // 'batch' | 'online' | 'unknown'
    this.programs = data.programs || []; // Program names in this flow
    this.entryPoint = data.entryPoint || null; // Entry program
    this.jclFile = data.jclFile || null; // Associated JCL file if any
    this.metadata = data.metadata || {};
  }

  /**
   * Add a program to the flow
   */
  addProgram(programName) {
    if (!this.programs.includes(programName)) {
      this.programs.push(programName);
    }
  }

  /**
   * Set entry point
   */
  setEntryPoint(programName) {
    this.entryPoint = programName;
    if (!this.programs.includes(programName)) {
      this.programs.unshift(programName);
    }
  }

  /**
   * Get flow size
   */
  getSize() {
    return this.programs.length;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      programs: this.programs,
      entryPoint: this.entryPoint,
      jclFile: this.jclFile,
      metadata: this.metadata
    };
  }
}

export default Flow;

