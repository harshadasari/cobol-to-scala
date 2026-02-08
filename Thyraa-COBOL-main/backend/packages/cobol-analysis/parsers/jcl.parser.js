import { Program } from '../models/Program.js';

/**
 * JCL Parser
 * Parses JCL files to extract:
 * - Job steps
 * - Program names (EXEC PGM=)
 * - Data dependencies
 */
export class JclParser {
  /**
   * Parse JCL file
   */
  static parse(filePath, content) {
    const jcl = {
      filePath,
      content,
      jobName: this.extractJobName(content),
      steps: this.extractSteps(content),
      programs: this.extractPrograms(content),
      metadata: {
        lines: content.split('\n').length
      }
    };

    return jcl;
  }

  /**
   * Extract job name
   */
  static extractJobName(content) {
    // Match //JOBNAME JOB
    const match = content.match(/\/\/([A-Z0-9#@$]+)\s+JOB/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract job steps
   */
  static extractSteps(content) {
    const steps = [];
    const lines = content.split('\n');
    
    let currentStep = null;
    
    for (const line of lines) {
      // Match step definition: //STEPNAME EXEC PGM=program
      const stepMatch = line.match(/\/\/([A-Z0-9#@$]+)\s+EXEC\s+PGM=([A-Z0-9-]+)/i);
      if (stepMatch) {
        if (currentStep) {
          steps.push(currentStep);
        }
        currentStep = {
          stepName: stepMatch[1].trim(),
          program: stepMatch[2].trim(),
          dependencies: []
        };
      }
      
      // Match COND (conditional execution)
      if (currentStep && /COND=/i.test(line)) {
        const condMatch = line.match(/COND=\([^)]*\)/i);
        if (condMatch) {
          currentStep.conditional = condMatch[0];
        }
      }
    }
    
    if (currentStep) {
      steps.push(currentStep);
    }
    
    return steps;
  }

  /**
   * Extract all program names from JCL
   */
  static extractPrograms(content) {
    const programs = [];
    
    // Match EXEC PGM=program-name
    const execRegex = /EXEC\s+PGM=([A-Z0-9-]+)/gi;
    let match;
    
    while ((match = execRegex.exec(content)) !== null) {
      const programName = match[1].trim();
      if (programName && !programs.includes(programName)) {
        programs.push(programName);
      }
    }
    
    return programs;
  }

  /**
   * Build flow from JCL steps
   */
  static buildFlow(jcl, filePath) {
    const flow = {
      id: `flow-${Date.now()}`,
      name: jcl.jobName || 'Unnamed Job',
      type: 'batch',
      programs: jcl.programs,
      entryPoint: jcl.steps[0]?.program || null,
      jclFile: filePath,
      steps: jcl.steps
    };
    
    return flow;
  }
}

export default JclParser;

