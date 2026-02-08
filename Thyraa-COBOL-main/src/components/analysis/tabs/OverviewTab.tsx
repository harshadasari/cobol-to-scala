import { motion } from "framer-motion";
import React, { useMemo, useEffect } from "react";
import { 
  FileCode, 
  Files, 
  GitFork, 
  Network, 
  Play, 
  Hash,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnalysis } from "@/contexts/AnalysisContext";
import { ReadyToExplore } from "@/components/analysis/ReadyToExplore";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export function OverviewTab() {
  const { analysisResult, setActiveTab } = useAnalysis();
  const flows = analysisResult?.flows || [];
  const nodes = analysisResult?.dependencyGraph?.nodes || [];
  const edges = analysisResult?.dependencyGraph?.edges || [];

  // Calculate derived stats
  const programs = nodes.filter(n => n.type === 'program');
  const copybooks = nodes.filter(n => n.type === 'copybook');
  const jclFiles = nodes.filter(n => n.type === 'jcl');
  const totalLines = nodes.reduce((acc, n) => {
    // ALWAYS calculate from GitHub content only - never use cached metadata.lines
    if (n.content && n.content.trim()) {
      return acc + n.content.split('\n').length;
    }
    // If content not available, don't count it (return 0 for this node)
    // This ensures we only show lines from actual GitHub source code
    // Only warn for REAL nodes (with filePath) - placeholder nodes (like MISSINGCOPY) are expected to not have content
    if ((n.type === 'program' || n.type === 'copybook') && n.filePath) {
      console.warn(`Node ${n.name} (${n.type}) has no content but has filePath: ${n.filePath}. This should not happen for real files.`);
    }
    return acc;
  }, 0);
  
  // DEBUG: Log summary of content availability (only for real nodes with filePath)
  useEffect(() => {
    if (nodes.length > 0) {
      const realNodes = nodes.filter(n => n.filePath);
      const placeholderNodes = nodes.filter(n => !n.filePath);
      const withContent = realNodes.filter(n => n.content && n.content.trim()).length;
      const withoutContent = realNodes.filter(n => !n.content || !n.content.trim()).length;
      console.log(`[OverviewTab] Total nodes: ${nodes.length} (${realNodes.length} real, ${placeholderNodes.length} placeholders), Real nodes with content: ${withContent}, Real nodes without content: ${withoutContent}`);
      if (withoutContent > 0) {
        const missing = realNodes.filter(n => !n.content || !n.content.trim()).map(n => n.name);
        console.warn(`[OverviewTab] REAL nodes missing content (this is an error):`, missing);
      }
      if (placeholderNodes.length > 0) {
        console.log(`[OverviewTab] Placeholder nodes (expected to have no content):`, placeholderNodes.map(n => n.name));
      }
    }
  }, [nodes]);

  // Most used copybooks - count usage from both edges and node references
  const copybookUsage = copybooks.map(cb => {
    const usageFromEdges = edges.filter(e => 
      e.type === 'COPY' && e.to?.toUpperCase() === cb.name.toUpperCase()
    ).length;
    const usageFromNodes = nodes.filter(n => 
      n.copybooks?.some((copyName: string) => copyName.toUpperCase() === cb.name.toUpperCase())
    ).length;
    // Use edges for accuracy, fallback to nodes if no edges
    const usedBy = usageFromEdges > 0 ? usageFromEdges : usageFromNodes;
    return {
      name: cb.name,
      usedBy
    };
  }).sort((a, b) => b.usedBy - a.usedBy).slice(0, 5);

  // Most connected programs - count connections from edges for accuracy
  const connectedPrograms = programs.map(p => {
    const outgoingEdges = edges.filter(e => 
      e.from?.toUpperCase() === p.name.toUpperCase()
    ).length;
    // Fallback to node's arrays if no edges available
    const nodeConnections = (p.calls?.length || 0) + (p.copybooks?.length || 0);
    const connections = outgoingEdges > 0 ? outgoingEdges : nodeConnections;
    return {
      name: p.name,
      connections
    };
  }).sort((a, b) => b.connections - a.connections).slice(0, 5);

  // Calculate entry points: programs with no incoming CALL edges
  const entryPoints = useMemo(() => {
    const programNames = programs.map(p => p.name);
    const calledPrograms = new Set(
      edges.filter(e => e.type === 'CALL').map(e => e.to?.toUpperCase())
    );
    return programNames.filter(name => !calledPrograms.has(name?.toUpperCase())).length;
  }, [programs, edges]);

  // Calculate programs with calls
  const programsWithCalls = programs.filter(p => 
    edges.some(e => e.type === 'CALL' && e.from?.toUpperCase() === p.name.toUpperCase())
  ).length;

  // Calculate CALL and COPY counts from edges
  const callCount = edges.filter(e => e.type === 'CALL').length;
  const copyCount = edges.filter(e => e.type === 'COPY').length;

  const statsCards = [
    {
      title: "COBOL Programs",
      value: programs.length,
      icon: FileCode,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      description: `${programsWithCalls} with calls`,
      action: () => setActiveTab('programs'),
    },
    {
      title: "Copybooks",
      value: copybooks.length,
      icon: Files,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      description: copybookUsage[0] ? `Most used: ${copybookUsage[0].name}` : "No copybooks",
      action: () => setActiveTab('copybooks'),
    },
    {
      title: "Batch Flows",
      value: flows.length,
      icon: GitFork,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      description: flows.length > 0 ? flows.slice(0, 2).map(f => f.name).join(", ") : "No flows detected",
      action: () => setActiveTab('flows'),
    },
    {
      title: "Dependencies",
      value: edges.length,
      icon: Network,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      description: `${callCount} CALL, ${copyCount} COPY`,
      action: () => setActiveTab('dependencies'),
    },
    {
      title: "Entry Points",
      value: entryPoints,
      icon: Play,
      color: "text-teal-500",
      bgColor: "bg-teal-500/10",
      description: "Programs with no incoming calls",
      action: () => setActiveTab('flows'),
    },
    {
      title: "Total Lines",
      value: totalLines.toLocaleString(),
      icon: Hash,
      color: "text-pink-500",
      bgColor: "bg-pink-500/10",
      description: `Across ${nodes.length} files`,
      action: () => setActiveTab('programs'),
    },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 p-6"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.title} variants={item}>
              <Card 
                className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all group"
                onClick={stat.action}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold font-display">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {stat.description}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    View details <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Quick Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Connected Programs */}
        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                Most Connected Programs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {connectedPrograms.length > 0 ? (
                  connectedPrograms.map((prog, idx) => (
                    <div 
                      key={prog.name}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        setActiveTab('code-viewer');
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-5">
                          {idx + 1}.
                        </span>
                        <span className="font-mono text-sm">{prog.name}</span>
                      </div>
                      <Badge variant="secondary">
                        {prog.connections} deps
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No programs analyzed yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Most Used Copybooks */}
        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Files className="h-5 w-5 text-green-500" />
                Most Used Copybooks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {copybookUsage.length > 0 ? (
                  copybookUsage.map((cb, idx) => (
                    <div 
                      key={cb.name}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        setActiveTab('copybooks');
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-5">
                          {idx + 1}.
                        </span>
                        <span className="font-mono text-sm">{cb.name}</span>
                      </div>
                      <Badge variant="secondary">
                        {cb.usedBy} uses
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No copybooks found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Ready to Explore - Common across all tabs */}
      <motion.div variants={item}>
        <ReadyToExplore />
      </motion.div>
    </motion.div>
  );
}

export default OverviewTab;
