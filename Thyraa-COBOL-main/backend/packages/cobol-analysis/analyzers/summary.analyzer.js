/**
 * Summary Analyzer
 * Generates summary statistics and formatted output
 */
export class SummaryAnalyzer {
  /**
   * Generate summary from flows, graph, and programs
   */
  generate(flows, graph, programs) {
    const programsList = programs.filter(p => p.type === 'program');
    const copybooks = programs.filter(p => p.type === 'copybook');
    const jclFiles = programs.filter(p => p.type === 'jcl');
    
    const statistics = graph.getStatistics();
    
    const summary = {
      cobolPrograms: programsList.length,
      copybooks: copybooks.length,
      batchFlows: flows.filter(f => f.type === 'batch').length,
      totalFlows: flows.length,
      dependenciesMapped: statistics.totalEdges,
      callDependencies: statistics.callEdges,
      copyDependencies: statistics.copyEdges,
      entryPoints: statistics.entryPoints,
      jclFiles: jclFiles.length
    };
    
    return summary;
  }

  /**
   * Format output for frontend
   */
  formatOutput(summary, flows, graph) {
    return {
      summary: {
        cobolPrograms: summary.cobolPrograms,
        copybooks: summary.copybooks,
        batchFlows: summary.batchFlows,
        dependenciesMapped: summary.dependenciesMapped
      },
      flows: flows.map(f => f.toJSON()),
      dependencyGraph: graph.toJSON(),
      statistics: summary
    };
  }
}

export default SummaryAnalyzer;

