/**
 * Dependency Graph model
 * Represents the dependency graph of programs and copybooks
 */
export class DependencyGraph {
  constructor() {
    this.nodes = new Map(); // programName -> Program
    this.edges = []; // { from: string, to: string, type: 'CALL' | 'COPY' }
  }

  /**
   * Add a node (program)
   */
  addNode(program) {
    this.nodes.set(program.name, program);
  }

  /**
   * Get a node
   */
  getNode(name) {
    return this.nodes.get(name);
  }

  /**
   * Add an edge (dependency)
   */
  addEdge(from, to, type = 'CALL') {
    // Check if edge already exists
    const exists = this.edges.some(
      edge => edge.from === from && edge.to === to && edge.type === type
    );
    
    if (!exists) {
      this.edges.push({ from, to, type });
    }
  }

  /**
   * Get all nodes
   */
  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges
   */
  getAllEdges() {
    return this.edges;
  }

  /**
   * Get dependencies of a node
   */
  getDependencies(nodeName) {
    return this.edges
      .filter(edge => edge.from === nodeName)
      .map(edge => edge.to);
  }

  /**
   * Get dependents of a node (reverse dependencies)
   */
  getDependents(nodeName) {
    return this.edges
      .filter(edge => edge.to === nodeName)
      .map(edge => edge.from);
  }

  /**
   * Get entry points (nodes with no incoming edges)
   */
  getEntryPoints() {
    const allNodes = Array.from(this.nodes.keys());
    const nodesWithIncoming = new Set(
      this.edges.map(edge => edge.to)
    );
    
    return allNodes.filter(node => !nodesWithIncoming.has(node));
  }

  /**
   * Build graph from programs
   */
  buildFromPrograms(programs) {
    programs.forEach(program => {
      this.addNode(program);
      
      // Add CALL edges
      program.calls.forEach(calledProgram => {
        this.addEdge(program.name, calledProgram, 'CALL');
      });
      
      // Add COPY edges
      program.copybooks.forEach(copybook => {
        this.addEdge(program.name, copybook, 'COPY');
      });
    });
  }

  /**
   * Get graph statistics
   */
  getStatistics() {
    const programs = this.getAllNodes().filter(n => n.type === 'program');
    const copybooks = this.getAllNodes().filter(n => n.type === 'copybook');
    const callEdges = this.edges.filter(e => e.type === 'CALL');
    const copyEdges = this.edges.filter(e => e.type === 'COPY');
    
    return {
      totalNodes: this.nodes.size,
      programs: programs.length,
      copybooks: copybooks.length,
      totalEdges: this.edges.length,
      callEdges: callEdges.length,
      copyEdges: copyEdges.length,
      entryPoints: this.getEntryPoints().length
    };
  }

  toJSON() {
    return {
      nodes: this.getAllNodes().map(n => n.toJSON()),
      edges: this.edges
    };
  }
}

export default DependencyGraph;

