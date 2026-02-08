/**
 * Graph Algorithms
 * Common graph algorithms for dependency analysis
 */
export class GraphAlgorithms {
  /**
   * Depth-First Search
   */
  static dfs(graph, startNode, visited = new Set(), result = []) {
    visited.add(startNode);
    result.push(startNode);
    
    const dependencies = graph.getDependencies(startNode);
    dependencies.forEach(dep => {
      if (!visited.has(dep)) {
        this.dfs(graph, dep, visited, result);
      }
    });
    
    return result;
  }

  /**
   * Breadth-First Search
   */
  static bfs(graph, startNode) {
    const visited = new Set();
    const queue = [startNode];
    const result = [];
    
    visited.add(startNode);
    
    while (queue.length > 0) {
      const node = queue.shift();
      result.push(node);
      
      const dependencies = graph.getDependencies(node);
      dependencies.forEach(dep => {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      });
    }
    
    return result;
  }

  /**
   * Find connected components
   */
  static findConnectedComponents(graph) {
    const components = [];
    const visited = new Set();
    const allNodes = graph.getAllNodes();
    
    allNodes.forEach(node => {
      if (!visited.has(node.name)) {
        const component = this.dfs(graph, node.name, visited);
        components.push(component);
      }
    });
    
    return components;
  }

  /**
   * Topological sort
   */
  static topologicalSort(graph) {
    const sorted = [];
    const visited = new Set();
    const tempMark = new Set();
    const allNodes = graph.getAllNodes();
    
    const visit = (nodeName) => {
      if (tempMark.has(nodeName)) {
        throw new Error('Circular dependency detected');
      }
      if (visited.has(nodeName)) {
        return;
      }
      
      tempMark.add(nodeName);
      const dependencies = graph.getDependencies(nodeName);
      dependencies.forEach(dep => visit(dep));
      tempMark.delete(nodeName);
      visited.add(nodeName);
      sorted.unshift(nodeName);
    };
    
    allNodes.forEach(node => {
      if (!visited.has(node.name)) {
        visit(node.name);
      }
    });
    
    return sorted;
  }
}

export default GraphAlgorithms;

