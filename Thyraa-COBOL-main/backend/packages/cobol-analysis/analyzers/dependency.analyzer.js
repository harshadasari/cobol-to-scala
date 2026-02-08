import { DependencyGraph } from '../models/DependencyGraph.js';
import { Program } from '../models/Program.js';

/**
 * Dependency Analyzer
 * Analyzes dependencies and builds dependency graph
 */
export class DependencyAnalyzer {
  constructor() {
    this.graph = new DependencyGraph();
  }

  /**
   * Analyze dependencies from parsed programs
   */
  analyze(programs) {
    // Build graph from programs
    this.graph.buildFromPrograms(programs);
    
    // Resolve dependencies
    this.resolveDependencies();
    
    // Detect cycles
    const cycles = this.detectCycles();
    
    return {
      graph: this.graph,
      statistics: this.graph.getStatistics(),
      cycles: cycles
    };
  }

  /**
   * Resolve dependencies (handle missing references)
   */
  resolveDependencies() {
    const allNodes = this.graph.getAllNodes();
    const nodeNames = new Set(allNodes.map(n => n.name));
    
    // Check all edges for missing nodes
    this.graph.getAllEdges().forEach(edge => {
      if (!nodeNames.has(edge.to)) {
        // Create placeholder node for missing dependency
        const placeholder = new Program({
          name: edge.to,
          type: edge.type === 'COPY' ? 'copybook' : 'program',
          metadata: { missing: true }
        });
        this.graph.addNode(placeholder);
      }
    });
  }

  /**
   * Detect circular dependencies
   */
  detectCycles() {
    const cycles = [];
    const visited = new Set();
    const recStack = new Set();
    const allNodes = this.graph.getAllNodes();
    
    const dfs = (nodeName, path = []) => {
      visited.add(nodeName);
      recStack.add(nodeName);
      path.push(nodeName);
      
      const dependencies = this.graph.getDependencies(nodeName);
      
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          dfs(dep, [...path]);
        } else if (recStack.has(dep)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          cycles.push(path.slice(cycleStart));
        }
      }
      
      recStack.delete(nodeName);
    };
    
    allNodes.forEach(node => {
      if (!visited.has(node.name)) {
        dfs(node.name);
      }
    });
    
    return cycles;
  }

  /**
   * Get dependency statistics
   */
  getStatistics() {
    return this.graph.getStatistics();
  }
}

export default DependencyAnalyzer;

