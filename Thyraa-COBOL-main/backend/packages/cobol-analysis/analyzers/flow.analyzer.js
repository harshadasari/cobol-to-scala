import { Flow } from '../models/Flow.js';
import { DependencyGraph } from '../models/DependencyGraph.js';

/**
 * Flow Analyzer
 * Groups programs into logical flows
 */
export class FlowAnalyzer {
  /**
   * Identify flows from dependency graph and JCL data
   */
  identifyFlows(graph, jclData = []) {
    const flows = [];
    
    // First, create flows from JCL files
    const jclFlows = this.createFlowsFromJcl(jclData);
    flows.push(...jclFlows);
    
    // Then, identify flows from call chains
    const callFlows = this.identifyFlowsFromCallChains(graph);
    flows.push(...callFlows);
    
    // Merge overlapping flows
    const mergedFlows = this.mergeFlows(flows);
    
    return mergedFlows;
  }

  /**
   * Create flows from JCL files
   */
  createFlowsFromJcl(jclData) {
    const flows = [];
    
    jclData.forEach(jcl => {
      const flow = new Flow({
        id: `flow-jcl-${Date.now()}-${flows.length}`,
        name: jcl.jobName || 'Unnamed Job',
        type: 'batch',
        programs: jcl.programs || [],
        entryPoint: jcl.steps?.[0]?.program || null,
        jclFile: jcl.filePath,
        metadata: { source: 'jcl' }
      });
      
      flows.push(flow);
    });
    
    return flows;
  }

  /**
   * Identify flows from call chains
   */
  identifyFlowsFromCallChains(graph) {
    const flows = [];
    const entryPoints = graph.getEntryPoints();
    const visited = new Set();
    
    entryPoints.forEach(entryPoint => {
      if (visited.has(entryPoint)) return;
      
      // Perform DFS to find all reachable programs
      const programs = this.traceExecutionPath(entryPoint, graph, visited);
      
      if (programs.length > 0) {
        const flow = new Flow({
          id: `flow-call-${Date.now()}-${flows.length}`,
          name: `Flow: ${entryPoint}`,
          type: 'unknown',
          programs: programs,
          entryPoint: entryPoint,
          metadata: { source: 'call-chain' }
        });
        
        flows.push(flow);
      }
    });
    
    return flows;
  }

  /**
   * Trace execution path from entry point
   */
  traceExecutionPath(entryPoint, graph, visited) {
    const programs = [];
    const stack = [entryPoint];
    
    while (stack.length > 0) {
      const current = stack.pop();
      
      if (visited.has(current)) continue;
      visited.add(current);
      programs.push(current);
      
      // Get all CALL dependencies (not COPY)
      const dependencies = graph.getAllEdges()
        .filter(edge => edge.from === current && edge.type === 'CALL')
        .map(edge => edge.to);
      
      dependencies.forEach(dep => {
        if (!visited.has(dep)) {
          stack.push(dep);
        }
      });
    }
    
    return programs;
  }

  /**
   * Merge overlapping flows
   */
  mergeFlows(flows) {
    const merged = [];
    const programToFlow = new Map();
    
    flows.forEach(flow => {
      const overlappingFlows = [];
      
      flow.programs.forEach(program => {
        if (programToFlow.has(program)) {
          overlappingFlows.push(programToFlow.get(program));
        }
      });
      
      if (overlappingFlows.length === 0) {
        // New flow
        merged.push(flow);
        flow.programs.forEach(program => {
          programToFlow.set(program, flow);
        });
      } else {
        // Merge with existing flow
        const targetFlow = overlappingFlows[0];
        flow.programs.forEach(program => {
          targetFlow.addProgram(program);
          programToFlow.set(program, targetFlow);
        });
      }
    });
    
    return merged;
  }
}

export default FlowAnalyzer;

