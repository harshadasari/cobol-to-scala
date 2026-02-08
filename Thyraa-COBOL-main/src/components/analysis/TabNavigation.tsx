import { 
  BarChart3, 
  FileCode, 
  Code, 
  GitFork, 
  Network, 
  Files, 
  Share2 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalysis } from "@/contexts/AnalysisContext";
import { Badge } from "@/components/ui/badge";

const tabs = [
  { id: 'overview', label: 'Overview', icon: BarChart3, countKey: null },
  { id: 'programs', label: 'Programs', icon: FileCode, countKey: 'cobolPrograms' },
  { id: 'code-viewer', label: 'Code Viewer', icon: Code, countKey: null },
  { id: 'flows', label: 'Flows', icon: GitFork, countKey: 'batchFlows' },
  { id: 'dependencies', label: 'Dependencies', icon: Network, countKey: 'dependenciesMapped' },
  { id: 'copybooks', label: 'Copybooks', icon: Files, countKey: 'copybooks' },
  { id: 'graph', label: 'Graph View', icon: Share2, countKey: null },
] as const;

export function TabNavigation() {
  const { activeTab, setActiveTab, analysisResult } = useAnalysis();
  const summary = analysisResult?.summary;
  const nodes = analysisResult?.dependencyGraph?.nodes || [];
  const flows = analysisResult?.flows || [];
  const edges = analysisResult?.dependencyGraph?.edges || [];

  // Calculate counts from actual data as fallback
  const calculatedCounts = {
    cobolPrograms: nodes.filter(n => n.type === 'program').length,
    copybooks: nodes.filter(n => n.type === 'copybook').length,
    batchFlows: flows.filter(f => f.type === 'batch').length,
    dependenciesMapped: edges.length
  };

  const getCount = (countKey: string | null): number | null => {
    if (!countKey) return null;
    
    // Always use calculated values from actual graph data for accuracy
    // This ensures counts match what's actually in the dependency graph
    const calculatedValue = calculatedCounts[countKey as keyof typeof calculatedCounts];
    return calculatedValue !== undefined ? calculatedValue : null;
  };

  return (
    <div className="border-b border-border bg-background/50 backdrop-blur-sm sticky top-16 z-40">
      <div className="w-full mx-auto px-6 md:px-12 lg:px-16">
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide py-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const count = getCount(tab.countKey);
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                  "hover:bg-muted/50",
                  isActive 
                    ? "bg-primary/10 text-primary border border-primary/20" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {count !== null && (
                  <Badge 
                    variant={isActive ? "default" : "secondary"} 
                    className="h-5 px-1.5 text-xs"
                  >
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default TabNavigation;
