import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Download, RefreshCw, GitBranch, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAnalysis } from "@/contexts/AnalysisContext";

interface ResultsHeaderProps {
  onExport?: () => void;
  onReanalyze?: () => void;
}

export function ResultsHeader({ onExport, onReanalyze }: ResultsHeaderProps) {
  const { analysisResult } = useAnalysis();

  const extractRepoInfo = (url: string) => {
    try {
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    } catch {
      // ignore
    }
    return { owner: '', repo: url };
  };

  const repoInfo = analysisResult?.repoUrl 
    ? extractRepoInfo(analysisResult.repoUrl) 
    : { owner: '', repo: 'Unknown Repository' };

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="w-full mx-auto flex h-16 items-center justify-between px-6 md:px-12 lg:px-16">
        {/* Left: Logo & Back */}
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[hsl(190,80%,45%)] flex items-center justify-center">
              <span className="font-display font-bold text-primary-foreground text-sm">M</span>
            </div>
            <span className="font-display font-semibold text-lg hidden sm:inline">ModernizeAI</span>
          </Link>

          <div className="h-6 w-px bg-border hidden sm:block" />

          <Link 
            to="/get-started" 
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">New Analysis</span>
          </Link>
        </div>

        {/* Center: Repository Info */}
        <div className="flex items-center gap-3">
          {analysisResult?.repoUrl && (
            <a
              href={analysisResult.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
            >
              <span className="font-medium text-sm md:text-base">
                {repoInfo.owner && <span className="text-muted-foreground">{repoInfo.owner}/</span>}
                {repoInfo.repo}
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          )}

          {analysisResult?.branch && (
            <Badge variant="secondary" className="gap-1">
              <GitBranch className="h-3 w-3" />
              {analysisResult.branch}
            </Badge>
          )}

          {analysisResult?.timestamp && (
            <Badge variant="outline" className="gap-1 hidden md:flex">
              <Clock className="h-3 w-3" />
              {formatTimestamp(analysisResult.timestamp)}
            </Badge>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="hidden sm:flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReanalyze}
            className="hidden sm:flex items-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Re-analyze
          </Button>
        </div>
      </div>
    </header>
  );
}

export default ResultsHeader;
