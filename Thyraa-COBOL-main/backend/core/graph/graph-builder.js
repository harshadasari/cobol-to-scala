import { DependencyGraph } from '../../packages/cobol-analysis/models/DependencyGraph.js';

/**
 * Graph Builder
 * Builds dependency graph incrementally
 */
export class GraphBuilder {
  constructor() {
    this.graph = new DependencyGraph();
  }

  /**
   * Add nodes from parsed programs
   */
  addNodes(programs) {
    programs.forEach(program => {
      // Skip if program is null/undefined
      if (!program) return;
      
      this.graph.addNode(program);
      
      // Add edges for calls (ensure calls is an array)
      const calls = program.calls || [];
      calls.forEach(calledProgram => {
        this.graph.addEdge(program.name, calledProgram, 'CALL');
      });
      
      // Add edges for copybooks (ensure copybooks is an array)
      const copybooks = program.copybooks || [];
      copybooks.forEach(copybook => {
        this.graph.addEdge(program.name, copybook, 'COPY');
      });
    });
  }

  /**
   * Build final graph
   */
  build() {
    return this.graph;
  }

  /**
   * Get current graph
   */
  getGraph() {
    return this.graph;
  }
}

export default GraphBuilder;

