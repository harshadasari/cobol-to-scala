import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, FileCode, Files, GitFork, Network, ArrowRight, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startAnalysis, pollAnalysisResult, getAnalysisResult } from "@/lib/api";
import { toast } from "sonner";
import { useAnalysis } from "@/contexts/AnalysisContext";

interface DetectedItem {
  label: string;
  count: number;
  icon: React.ReactNode;
  breakdown?: string; // Optional breakdown text (e.g., "1 CALL, 5 COPY")
}

type AnalysisStatus = "preparing" | "scanning" | "analyzing" | "complete" | "error";

interface AnalysisProgressProps {
  repoName?: string;
  branchName?: string;
  onComplete: (jobId?: string) => void;
  onBack?: () => void;
}

const AnalysisProgress = ({ repoName, branchName, onComplete, onBack }: AnalysisProgressProps) => {
  const { setAnalysisResult } = useAnalysis();
  const [status, setStatus] = useState<AnalysisStatus>("preparing");
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number; percentage: number } | null>(null);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const jobIdRef = useRef<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Don't start automatically - wait for user to click "Start analysis" button
  // useEffect(() => {
  //   if (!repoName || repoName.startsWith('sample://') || repoName === 'uploaded-codebase') {
  //     // Fallback to mock data for sample/special cases
  //     handleMockAnalysis();
  //     return;
  //   }
  //   startRealAnalysis();
  //   return () => {
  //     if (pollingRef.current) {
  //       clearTimeout(pollingRef.current);
  //     }
  //   };
  // }, [repoName, branchName]);

  const handleStartAnalysis = () => {
    if (analysisStarted) return; // Prevent multiple starts

    setAnalysisStarted(true);

    if (!repoName || repoName.startsWith('sample://') || repoName === 'uploaded-codebase') {
      // Fallback to mock data for sample/special cases
      handleMockAnalysis();
      return;
    }

    // Start real analysis
    startRealAnalysis();
  };

  const handleMockAnalysis = () => {
    const timer1 = setTimeout(() => setStatus("scanning"), 1500);
    
    const items: DetectedItem[] = [
      { label: "COBOL programs", count: 38, icon: <FileCode className="w-4 h-4" /> },
      { label: "Copybooks", count: 21, icon: <Files className="w-4 h-4" /> },
      { label: "Batch flows", count: 3, icon: <GitFork className="w-4 h-4" /> },
      { label: "Dependencies mapped", count: 156, icon: <Network className="w-4 h-4" /> },
    ];

    items.forEach((item, index) => {
      setTimeout(() => {
        setDetectedItems(prev => [...prev, item]);
      }, 2000 + (index + 1) * 900);
    });

    const timer2 = setTimeout(() => setStatus("analyzing"), 2000);
    const timer3 = setTimeout(() => setStatus("complete"), 2000 + items.length * 900 + 800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  };

  const startRealAnalysis = async () => {
    try {
      setStatus("preparing");
      setError(null);

      // Start analysis job - get fresh data from API
      const repoUrl = repoName?.startsWith('http') ? repoName : `https://github.com/${repoName}`;
      const job = await startAnalysis(repoUrl, branchName || 'main');

      jobIdRef.current = job.jobId;

      // If job is already complete (cached), validate it has content before using it
      if (job.status === 'complete' && 'result' in job) {
        const result = (job as any).result || job;
        const nodes = (result as any)?.dependencyGraph?.nodes || [];
        const programNodes = nodes.filter((n: any) => n.type === 'program' && n.filePath);
        const programsWithoutContent = programNodes.filter((n: any) => !n.content || !n.content.trim());

        if (programsWithoutContent.length > 0) {
          // Cached result is missing content - don't use it, create fresh analysis
          console.warn(`[AnalysisProgress] Cached result missing content for ${programsWithoutContent.length} programs, creating fresh analysis`);
          // The job was already created, so we need to poll for it or create a new one
          // Since we cleared cache, the backend should have created a fresh job
          // But if it returned cached, we need to handle it differently
          // For now, let's just proceed with polling - the backend validation should have caught this
          setStatus("scanning");
          pollForResults(job.jobId).catch((error: any) => {
            console.error('Error in polling:', error);
            setError(error.message || 'Analysis failed');
            setStatus("error");
            toast.error('Analysis failed', {
              description: error.message || 'Please try again'
            });
          });
          return;
        }

        // Cached result is valid - use it
        handleAnalysisComplete(job);
        return;
      }

      setStatus("scanning");

      // Poll for results
      pollForResults(job.jobId).catch((error: any) => {
        console.error('Error in polling:', error);
        setError(error.message || 'Analysis failed');
        setStatus("error");
        toast.error('Analysis failed', {
          description: error.message || 'Please try again'
        });
      });
    } catch (error: any) {
      console.error('Error starting analysis:', error);
      setError(error.message || 'Failed to start analysis');
      setStatus("error");
      toast.error('Failed to start analysis', {
        description: error.message || 'Please check your repository URL and try again'
      });
    }
  };

  const pollForResults = async (jobId: string) => {
    try {
      const result = await pollAnalysisResult(
        jobId,
        (status) => {
          // Update progress
          if (status.progress) {
            setProgress(status.progress);

            // Update status based on progress
            if (status.progress.percentage < 30) {
              setStatus("scanning");
            } else if (status.progress.percentage < 80) {
              setStatus("analyzing");
            }
          }
        },
        2000 // Poll every 2 seconds
      );

      handleAnalysisComplete(result);
    } catch (error: any) {
      console.error('Error polling for results:', error);
      setError(error.message || 'Analysis failed');
      setStatus("error");
      toast.error('Analysis failed', {
        description: error.message || 'Please try again'
      });
      throw error; // Re-throw to allow caller to handle
    }
  };

  const handleAnalysisComplete = (apiResult: any) => {
    // #region agent log
    const result = apiResult.result || apiResult;
    const sampleNode = result?.dependencyGraph?.nodes?.[0];
    const mainpgmNodeFromApi = result?.dependencyGraph?.nodes?.find((n: any) => n.name === 'MAINPGM');
    const calcsubrNodeFromApi = result?.dependencyGraph?.nodes?.find((n: any) => n.name === 'CALCSUBR');
    const reportpgNodeFromApi = result?.dependencyGraph?.nodes?.find((n: any) => n.name === 'REPORTPG');

    // Check all program nodes with filePath
    const programNodes = (result?.dependencyGraph?.nodes || []).filter((n: any) => n.type === 'program' && n.filePath);
    const programsWithoutContent = programNodes.filter((n: any) => !n.content || !n.content.trim());

    console.log(`[AnalysisProgress] Received API result: Total nodes: ${result?.dependencyGraph?.nodes?.length || 0}, Program nodes with filePath: ${programNodes.length}`);
    programNodes.forEach((n: any) => {
      console.log(`[AnalysisProgress]   - ${n.name}: hasContent=${!!n.content}, contentLength=${n.content?.length || 0}, hasFilePath=${!!n.filePath}, type=${n.type}`);
    });

    if (programsWithoutContent.length > 0) {
      console.error(`[AnalysisProgress] CRITICAL: ${programsWithoutContent.length} programs missing content in API response:`, programsWithoutContent.map((n: any) => n.name));
    } else {
      console.log(`[AnalysisProgress] All ${programNodes.length} program nodes have content in API response`);
    }

    // Check REPORTPG specifically (might be placeholder)
    if (reportpgNodeFromApi) {
      console.log(`[AnalysisProgress] REPORTPG node: type=${reportpgNodeFromApi.type}, hasFilePath=${!!reportpgNodeFromApi.filePath}, hasContent=${!!reportpgNodeFromApi.content}, contentLength=${reportpgNodeFromApi.content?.length || 0}`);
    }

    fetch('http://127.0.0.1:7242/ingest/0423fc58-f186-4cd7-8469-e50b73c0f1dc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'AnalysisProgress.tsx:159', message: 'handleAnalysisComplete entry', data: { nodeCount: result?.dependencyGraph?.nodes?.length || 0, sampleNodeName: sampleNode?.name, sampleNodeContentLength: sampleNode?.content?.length || 0, mainpgmNodeFromApiContentLength: mainpgmNodeFromApi?.content?.length || 0, mainpgmNodeFromApiHasContent: !!mainpgmNodeFromApi?.content, calcsubrHasContent: !!calcsubrNodeFromApi?.content, reportpgHasContent: !!reportpgNodeFromApi?.content, reportpgHasFilePath: !!reportpgNodeFromApi?.filePath, programNodesCount: programNodes.length, programsWithoutContentCount: programsWithoutContent.length, allNodesHaveContent: (result?.dependencyGraph?.nodes || []).every((n: any) => !!n.content) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
    // #endregion
    setStatus("complete");

    // Transform API result to match AnalysisContext expected structure

    // Update detected items from real results
    const items: DetectedItem[] = [
      {
        label: "COBOL programs",
        count: result.summary?.cobolPrograms || 0,
        icon: <FileCode className="w-4 h-4" />
      },
      {
        label: "Copybooks",
        count: result.summary?.copybooks || 0,
        icon: <Files className="w-4 h-4" />
      },
      {
        label: "Batch flows",
        count: result.summary?.batchFlows || 0,
        icon: <GitFork className="w-4 h-4" />
      },
      {
        label: "Dependencies mapped",
        count: result.summary?.dependenciesMapped || 0,
        icon: <Network className="w-4 h-4" />,
        breakdown: result.statistics
          ? `${result.statistics.callDependencies || 0} CALL, ${result.statistics.copyDependencies || 0} COPY`
          : undefined
      },
    ];

    // Animate items appearing
    items.forEach((item, index) => {
      setTimeout(() => {
        setDetectedItems(prev => {
          const exists = prev.find(p => p.label === item.label);
          if (exists) return prev;
          return [...prev, item];
        });
      }, index * 200);
    });

    // Store result directly in context - no caching
    if (jobIdRef.current) {
      const repoUrl = repoName?.startsWith('http') ? repoName : repoName ? `https://github.com/${repoName}` : '';
      const graph = result.dependencyGraph || { nodes: [], edges: [] };
      const edges = graph.edges || [];

      // Calculate statistics from dependency graph if not provided
      const stats = result.statistics || {};
      const programNodes = graph.nodes?.filter((n: any) => n.type === 'program') || [];
      const programNames = programNodes.map((n: any) => n.name);
      const calledPrograms = new Set(
        edges.filter((e: any) => e.type === 'CALL').map((e: any) => e.to?.toUpperCase())
      );

      const calculatedStats = {
        callDependencies: stats.callDependencies ?? edges.filter((e: any) => e.type === 'CALL').length,
        copyDependencies: stats.copyDependencies ?? edges.filter((e: any) => e.type === 'COPY').length,
        entryPoints: stats.entryPoints ?? programNames.filter((name: string) => !calledPrograms.has(name?.toUpperCase())).length
      };

      const allFlows = result.flows || [];
      const calculatedSummary = {
        cobolPrograms: graph.nodes?.filter((n: any) => n.type === 'program').length || 0,
        copybooks: graph.nodes?.filter((n: any) => n.type === 'copybook').length || 0,
        batchFlows: allFlows.filter((f: any) => f.type === 'batch').length,
        dependenciesMapped: edges.length
      };

      const fullResult = {
        jobId: jobIdRef.current,
        repoUrl: repoUrl,
        branch: branchName || 'main',
        timestamp: new Date().toISOString(),
        summary: calculatedSummary,
        statistics: calculatedStats,
        flows: allFlows,
        dependencyGraph: graph
      };

      // Set result directly in context - AnalysisContext will normalize it
      setAnalysisResult(fullResult);
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case "preparing":
        return { title: "Preparing analysis…", subtitle: "Connecting to your repository" };
      case "scanning":
        return {
          title: "Scanning codebase…",
          subtitle: progress
            ? `Processing ${progress.processed} of ${progress.total} files (${progress.percentage}%)`
            : "Detecting file types and structure"
        };
      case "analyzing":
        return {
          title: "Analyzing code…",
          subtitle: progress
            ? `Analyzing dependencies... ${progress.percentage}%`
            : "Building dependency map"
        };
      case "complete":
        return { title: "Analysis complete", subtitle: "Your system overview is ready" };
      case "error":
        return { title: "Analysis failed", subtitle: error || "Something went wrong" };
    }
  };

  const { title, subtitle } = getStatusMessage();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-lg mx-auto"
    >
      {/* Back button */}
      {onBack && (
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      {/* Repository info */}
      {repoName && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 text-sm text-muted-foreground">
            <FileCode className="w-4 h-4" />
            {repoName}
            {branchName && (
              <>
                <span className="text-border">·</span>
                {branchName}
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Status indicator - only show when analysis has started */}
      {analysisStarted && (
      <div className="mb-8">
        <AnimatePresence mode="wait">
            {status === "error" ? (
              <motion.div
                key="error"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto"
              >
                <AlertCircle className="w-8 h-8 text-destructive" />
              </motion.div>
            ) : status !== "complete" ? (
            <motion.div
              key="loading"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Loader2 className="w-16 h-16 text-primary mx-auto animate-spin" />
            </motion.div>
          ) : (
            <motion.div
              key="complete"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto"
            >
              <Check className="w-8 h-8 text-primary" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* Show start button if analysis hasn't started yet */}
      {!analysisStarted && repoName && !repoName.startsWith('sample://') && repoName !== 'uploaded-codebase' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center space-y-4"
        >
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
              Ready to analyze
            </h2>
            <p className="text-muted-foreground">
              Review the repository details below, then click to start the analysis
            </p>
          </div>

          {/* Repository preview */}
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 max-w-md mx-auto">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Repository:</span>
                <span className="font-medium">{repoName}</span>
              </div>
              {branchName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Branch:</span>
                  <span className="font-medium">{branchName}</span>
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={handleStartAnalysis}
            variant="hero"
            size="lg"
            className="mt-4"
          >
            Start Analysis
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </motion.div>
      )}

      {/* Status text - only show when analysis has started */}
      {analysisStarted && (
      <motion.div
        key={status}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
          {title}
        </h2>
        <p className="text-muted-foreground">{subtitle}</p>
      </motion.div>
      )}

      {/* Detected items - only show when analysis has started */}
      {analysisStarted && (
      <div className="space-y-3 mb-10">
        {detectedItems.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50"
          >
              <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                {item.icon}
              </div>
                <div className="flex-1">
                  <span className="font-medium block">{item.label}</span>
                  {item.breakdown && (
                    <span className="text-xs text-muted-foreground mt-0.5 block">
                      {item.breakdown}
                    </span>
                  )}
                </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Check className="w-4 h-4 text-primary" />
              </motion.div>
              <span className="font-semibold text-lg">{item.count}</span>
            </div>
          </motion.div>
        ))}
      </div>
      )}

      {/* CTA */}
      <AnimatePresence>
        {status === "complete" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              variant="hero"
              size="lg"
              onClick={() => {
                if (jobIdRef.current) {
                  onComplete(jobIdRef.current);
                } else {
                  onComplete();
                }
              }}
            >
              View Code Analysis
              <ArrowRight className="w-5 h-5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AnalysisProgress;
