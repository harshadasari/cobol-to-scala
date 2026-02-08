import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { AnalysisProvider, useAnalysis } from "@/contexts/AnalysisContext";
import { getAnalysisResult } from "@/lib/api";
import { ResultsHeader } from "@/components/analysis/ResultsHeader";
import { TabNavigation } from "@/components/analysis/TabNavigation";
import { OverviewTab } from "@/components/analysis/tabs/OverviewTab";
import { ProgramsTab } from "@/components/analysis/tabs/ProgramsTab";
import { CodeViewerTab } from "@/components/analysis/tabs/CodeViewerTab";
import { FlowsTab } from "@/components/analysis/tabs/FlowsTab";
import { DependenciesTab } from "@/components/analysis/tabs/DependenciesTab";
import { CopybooksTab } from "@/components/analysis/tabs/CopybooksTab";
import { GraphViewTab } from "@/components/analysis/tabs/GraphViewTab";

function AnalysisResultsContent() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { analysisResult, setAnalysisResult, activeTab, setActiveTab, setSelectedFile } = useAnalysis();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync tab from URL
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const fileParam = searchParams.get('file');
    
    if (tabParam) {
      setActiveTab(tabParam);
    }
    if (fileParam) {
      setSelectedFile(fileParam);
    }
  }, [searchParams, setActiveTab, setSelectedFile]);

  // Update URL when tab changes
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== activeTab) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  // Check if result exists in context first, otherwise fetch from API
  useEffect(() => {
    if (!jobId) {
      setError('No job ID provided');
      setLoading(false);
      return;
    }

    // Check if result is already in context (from AnalysisProgress)
    if (analysisResult && analysisResult.jobId === jobId) {
      setError(null);
      setLoading(false);
      return;
    }

    // If jobId starts with "cached-", it means it was a cached result from backend
    // Cached jobs don't exist in the job queue, so we can't fetch them
    // If we don't have it in context, we need to ask user to re-analyze
    if (jobId.startsWith('cached-')) {
      setError('Cached analysis result not available. Please run a new analysis.');
      setLoading(false);
      return;
    }

    // Fetch from API for real job IDs
    const fetchResult = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch result directly from API
        const response = await getAnalysisResult(jobId);
        
        // API returns: { jobId, status, result: { summary, flows, dependencyGraph, ... } }
        const apiResult = response.result || response;
        
        // Set result in context - context will normalize it
        setAnalysisResult({
          jobId: response.jobId || jobId,
          repoUrl: apiResult.repoUrl || '',
          branch: apiResult.branch || 'main',
          timestamp: apiResult.timestamp || new Date().toISOString(),
          summary: apiResult.summary || {
            cobolPrograms: 0,
            copybooks: 0,
            batchFlows: 0,
            dependenciesMapped: 0
          },
          statistics: apiResult.statistics || {
            callDependencies: 0,
            copyDependencies: 0,
            entryPoints: 0
          },
          flows: apiResult.flows || [],
          dependencyGraph: apiResult.dependencyGraph || { nodes: [], edges: [] }
        });
        
        setError(null);
      } catch (err: any) {
        console.error('Error fetching analysis result:', err);
        setError(err.message || 'Failed to load analysis result. Please run a new analysis.');
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [jobId, analysisResult, setAnalysisResult]);

  const handleExport = () => {
    if (!analysisResult) return;
    
    const dataStr = JSON.stringify(analysisResult, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-${jobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReanalyze = async () => {
    if (!analysisResult) return;
    
    // Extract repo and branch from current analysis
    const repoUrl = analysisResult.repoUrl || '';
    const branch = analysisResult.branch || 'main';
    
    // Navigate to get-started with repo and branch as query params
    navigate(`/get-started?repo=${encodeURIComponent(repoUrl)}&branch=${encodeURIComponent(branch)}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading analysis results...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !analysisResult) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md p-8"
        >
          <h2 className="text-xl font-display font-semibold mb-2">Analysis Not Found</h2>
          <p className="text-muted-foreground mb-6">
            {error || 'The requested analysis could not be loaded.'}
          </p>
          <button
            onClick={() => navigate('/get-started')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Start New Analysis
          </button>
        </motion.div>
      </div>
    );
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'programs':
        return <ProgramsTab />;
      case 'code-viewer':
        return <CodeViewerTab />;
      case 'flows':
        return <FlowsTab />;
      case 'dependencies':
        return <DependenciesTab />;
      case 'copybooks':
        return <CopybooksTab />;
      case 'graph':
        return <GraphViewTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ResultsHeader onExport={handleExport} onReanalyze={handleReanalyze} />
      <TabNavigation />
      <main className="flex-1 overflow-auto">
        {renderActiveTab()}
      </main>
    </div>
  );
}

function AnalysisResults() {
  return (
    <AnalysisProvider>
      <AnalysisResultsContent />
    </AnalysisProvider>
  );
}

export default AnalysisResults;
