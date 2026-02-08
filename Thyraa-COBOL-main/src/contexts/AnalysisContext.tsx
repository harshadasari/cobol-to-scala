import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

// Types based on backend response structure
export interface ProgramNode {
  name: string;
  filePath: string;
  type: 'program' | 'copybook' | 'jcl';
  calls: string[];
  copybooks: string[];
  metadata: {
    divisions?: {
      identification?: boolean;
      environment?: boolean;
      data?: boolean;
      procedure?: boolean;
    };
    lines?: number;
  };
  flowId: string | null;
  content?: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'CALL' | 'COPY';
}

export interface Flow {
  id: string;
  name: string;
  type: 'batch' | 'online' | 'unknown';
  programs: string[];
  entryPoint: string;
  jclFile: string | null;
  metadata: Record<string, unknown>;
}

export interface AnalysisSummary {
  cobolPrograms: number;
  copybooks: number;
  batchFlows: number;
  dependenciesMapped: number;
}

export interface AnalysisStatistics {
  callDependencies: number;
  copyDependencies: number;
  entryPoints: number;
  totalLines?: number;
  programsWithCalls?: number;
  programsWithCopybooks?: number;
}

export interface AnalysisResult {
  jobId: string;
  repoUrl: string;
  branch?: string;
  timestamp: string;
  summary: AnalysisSummary;
  statistics: AnalysisStatistics;
  flows: Flow[];
  dependencyGraph: {
    nodes: ProgramNode[];
    edges: DependencyEdge[];
  };
}

interface AnalysisContextType {
  analysisResult: AnalysisResult | null;
  setAnalysisResult: (result: AnalysisResult) => void;
  
  // Navigation state
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // Helper functions
  getProgramByName: (name: string) => ProgramNode | undefined;
  getProgramDependencies: (name: string) => { calls: ProgramNode[]; copybooks: ProgramNode[]; calledBy: ProgramNode[]; usedBy: ProgramNode[] };
  getFlowById: (flowId: string) => Flow | undefined;
}

// Create context with a default value structure to prevent undefined errors during HMR
const defaultContextValue: AnalysisContextType = {
  analysisResult: null,
  setAnalysisResult: () => {},
  selectedFile: null,
  setSelectedFile: () => {},
  activeTab: 'overview',
  setActiveTab: () => {},
  getProgramByName: () => undefined,
  getProgramDependencies: () => ({ calls: [], copybooks: [], calledBy: [], usedBy: [] }),
  getFlowById: () => undefined,
};

const AnalysisContext = createContext<AnalysisContextType>(defaultContextValue);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [analysisResult, setAnalysisResultState] = useState<AnalysisResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');

  const setAnalysisResult = useCallback((result: AnalysisResult) => {
    // Normalize nodes - always recalculate lines from content if available
    if (result.dependencyGraph?.nodes) {
      const normalizedNodes = result.dependencyGraph.nodes.map(node => {
        if (node.content && node.content.trim()) {
          const recalculatedLines = node.content.split('\n').length;
          return {
            ...node,
            metadata: {
              ...node.metadata,
              lines: recalculatedLines
            }
          };
        }
        return node;
      });
      
      const edges = result.dependencyGraph?.edges || [];
      const flows = result.flows || [];
      
      const recalculatedSummary = {
        cobolPrograms: normalizedNodes.filter(n => n.type === 'program').length,
        copybooks: normalizedNodes.filter(n => n.type === 'copybook').length,
        batchFlows: flows.filter(f => f.type === 'batch').length,
        dependenciesMapped: edges.length
      };
      
      const normalizedResult: AnalysisResult = {
        ...result,
        summary: recalculatedSummary,
        dependencyGraph: {
          ...result.dependencyGraph,
          nodes: normalizedNodes
        }
      };
      
      setAnalysisResultState(normalizedResult);
    } else {
      setAnalysisResultState(result);
    }
    
    // Auto-select first program if available
    if (result.dependencyGraph?.nodes?.length > 0) {
      const firstProgram = result.dependencyGraph.nodes.find(n => n.type === 'program');
      if (firstProgram) {
        setSelectedFile(firstProgram.name);
      }
    }
  }, [setSelectedFile]);

  const getProgramByName = useCallback((name: string): ProgramNode | undefined => {
    return analysisResult?.dependencyGraph?.nodes?.find(
      n => n.name.toUpperCase() === name.toUpperCase()
    );
  }, [analysisResult]);

  const getProgramDependencies = useCallback((name: string) => {
    if (!analysisResult?.dependencyGraph) {
      return { calls: [], copybooks: [], calledBy: [], usedBy: [] };
    }

    const { nodes, edges } = analysisResult.dependencyGraph;
    const program = getProgramByName(name);
    
    if (!program) {
      return { calls: [], copybooks: [], calledBy: [], usedBy: [] };
    }

    // Outgoing dependencies
    const calls = (program.calls || [])
      .map(callName => nodes.find(n => n.name.toUpperCase() === callName.toUpperCase()))
      .filter((n): n is ProgramNode => n !== undefined);
    
    const copybooks = (program.copybooks || [])
      .map(copyName => nodes.find(n => n.name.toUpperCase() === copyName.toUpperCase()))
      .filter((n): n is ProgramNode => n !== undefined);

    // Incoming dependencies (who calls/uses this program)
    const calledBy = edges
      .filter(e => e.type === 'CALL' && e.to.toUpperCase() === name.toUpperCase())
      .map(e => nodes.find(n => n.name.toUpperCase() === e.from.toUpperCase()))
      .filter((n): n is ProgramNode => n !== undefined);

    const usedBy = edges
      .filter(e => e.type === 'COPY' && e.to.toUpperCase() === name.toUpperCase())
      .map(e => nodes.find(n => n.name.toUpperCase() === e.from.toUpperCase()))
      .filter((n): n is ProgramNode => n !== undefined);

    return { calls, copybooks, calledBy, usedBy };
  }, [analysisResult, getProgramByName]);

  const getFlowById = useCallback((flowId: string): Flow | undefined => {
    return analysisResult?.flows?.find(f => f.id === flowId);
  }, [analysisResult]);

  // Create context value - ensure it's always defined
  // Using useMemo to prevent unnecessary re-renders, but ensure value is always available
  const contextValue = useMemo(() => {
    const value = {
      analysisResult,
      setAnalysisResult,
      selectedFile,
      setSelectedFile,
      activeTab,
      setActiveTab,
      getProgramByName,
      getProgramDependencies,
      getFlowById,
    };
    // Ensure value is never undefined
    if (!value) {
      console.error('Context value is undefined!');
    }
    return value;
  }, [
    analysisResult,
    setAnalysisResult,
    selectedFile,
    setSelectedFile,
    activeTab,
    setActiveTab,
    getProgramByName,
    getProgramDependencies,
    getFlowById,
  ]);

  // Ensure contextValue is always defined before rendering
  if (!contextValue) {
    console.error('Context value is undefined in AnalysisProvider!');
    return <>{children}</>; // Fallback to render children without provider
  }

  return (
    <AnalysisContext.Provider value={contextValue}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  // With default value, context should never be undefined
  // Check if we're actually inside a provider by verifying the setAnalysisResult is not the default no-op
  // The default no-op does nothing, so we check if analysisResult state management is active
  const isDefaultContext = context.setAnalysisResult === defaultContextValue.setAnalysisResult;
  
  if (isDefaultContext) {
    // This means we're using the default context value, not the provider value
    throw new Error('useAnalysis must be used within an AnalysisProvider');
  }
  
  return context;
}
