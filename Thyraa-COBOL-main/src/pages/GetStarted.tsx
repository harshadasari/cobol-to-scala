import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import ReassuranceRow from "@/components/get-started/ReassuranceRow";
import ProgressTracker from "@/components/get-started/ProgressTracker";
import InputSelection from "@/components/get-started/InputSelection";
import RepositoryInput from "@/components/get-started/RepositoryInput";
import AnalysisProgress from "@/components/get-started/AnalysisProgress";
import { AnalysisProvider } from "@/contexts/AnalysisContext";

type FlowState = 
  | { step: "selection" }
  | { step: "repository" }
  | { step: "analysis"; repo: string; branch: string }
  | { step: "upload" };

const GetStarted = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [flowState, setFlowState] = useState<FlowState>({ step: "selection" });
  const hasProcessedReanalyze = useRef(false);

  // Check for repo and branch in URL params (for re-analyze) - only once on mount
  useEffect(() => {
    if (hasProcessedReanalyze.current) return;
    
    const repoParam = searchParams.get('repo');
    const branchParam = searchParams.get('branch');
    
    if (repoParam) {
      hasProcessedReanalyze.current = true;
      
      // Auto-start analysis with the provided repo and branch
      setFlowState({ 
        step: "analysis", 
        repo: repoParam, 
        branch: branchParam || 'main' 
      });
      
      // Clear URL params to avoid issues on refresh
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('repo');
      newSearchParams.delete('branch');
      const newSearch = newSearchParams.toString();
      navigate(`/get-started${newSearch ? `?${newSearch}` : ''}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const getCurrentPhase = () => {
    switch (flowState.step) {
      case "selection":
      case "repository":
        return "connect";
      case "analysis":
        return "analyze";
      case "upload":
        return "connect";
      default:
        return "connect";
    }
  };

  const getCurrentStep = () => {
    switch (flowState.step) {
      case "selection":
        return "Select code source";
      case "repository":
        return "Connect repository";
      case "analysis":
        return "Analyzing codebase";
      case "upload":
        return "Upload files";
    }
  };

  const handleSelectRepo = () => {
    setFlowState({ step: "repository" });
  };

  const handleSelectUpload = () => {
    setFlowState({ step: "analysis", repo: "uploaded-codebase", branch: "" });
  };

  const handleConfirmRepo = (repoUrl: string, branch: string) => {
    setFlowState({ step: "analysis", repo: repoUrl, branch });
  };

  const handleTrySample = () => {
    setFlowState({ step: "analysis", repo: "sample://cobol-banking-system", branch: "main" });
  };

  const handleAnalysisComplete = (jobId?: string) => {
    // Navigate to analysis results page
    const id = jobId || `job-${Date.now()}`;
    navigate(`/analysis/${id}`);
  };

  const handleBackToSelection = () => {
    setFlowState({ step: "selection" });
  };

  const handleBackToRepository = () => {
    setFlowState({ step: "repository" });
  };

  return (
    <AnalysisProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="w-full mx-auto flex h-16 items-center justify-between px-6 md:px-12 lg:px-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[hsl(190,80%,45%)] flex items-center justify-center">
                <span className="font-display font-bold text-primary-foreground text-sm">M</span>
              </div>
              <span className="font-display font-semibold text-lg">ModernizeAI</span>
            </Link>
          </div>
        </header>

        <main className="w-full mx-auto px-6 md:px-12 lg:px-16 py-12 md:py-16">
          <div className="max-w-4xl mx-auto">
            {/* Constant elements: Reassurance & Progress */}
            <ReassuranceRow />
            <ProgressTracker currentPhase={getCurrentPhase()} currentStep={getCurrentStep()} />

            {/* Dynamic content based on flow state */}
            <AnimatePresence mode="wait">
              {flowState.step === "selection" && (
                <InputSelection
                  key="selection"
                  onSelectRepo={handleSelectRepo}
                  onSelectUpload={handleSelectUpload}
                />
              )}

              {flowState.step === "repository" && (
                <RepositoryInput
                  key="repository"
                  onBack={handleBackToSelection}
                  onConfirm={handleConfirmRepo}
                  onTrySample={handleTrySample}
                />
              )}

              {flowState.step === "analysis" && (
                <AnalysisProgress
                  key="analysis"
                  repoName={flowState.repo}
                  branchName={flowState.branch}
                  onComplete={handleAnalysisComplete}
                  onBack={handleBackToRepository}
                />
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </AnalysisProvider>
  );
};

export default GetStarted;
