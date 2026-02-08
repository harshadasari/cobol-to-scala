import { useState } from "react";
import { motion } from "framer-motion";
import { 
  GitFork, 
  Play, 
  FileText, 
  ChevronRight,
  Code,
  Network
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAnalysis, Flow } from "@/contexts/AnalysisContext";
import { cn } from "@/lib/utils";
import { ReadyToExplore } from "@/components/analysis/ReadyToExplore";

const flowTypeConfig = {
  batch: { color: 'bg-purple-500', label: 'Batch' },
  online: { color: 'bg-blue-500', label: 'Online' },
  unknown: { color: 'bg-gray-500', label: 'Unknown' },
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

export function FlowsTab() {
  const { analysisResult, setActiveTab, setSelectedFile } = useAnalysis();
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());

  const flows = analysisResult?.flows || [];

  const toggleFlow = (flowId: string) => {
    setExpandedFlows(prev => {
      const next = new Set(prev);
      if (next.has(flowId)) {
        next.delete(flowId);
      } else {
        next.add(flowId);
      }
      return next;
    });
  };

  const handleViewProgram = (programName: string) => {
    setSelectedFile(programName);
    setActiveTab('code-viewer');
  };

  const handleViewFlowGraph = (flow: Flow) => {
    if (flow.entryPoint) {
      setSelectedFile(flow.entryPoint);
    }
    setActiveTab('graph');
  };

  if (flows.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-6 flex flex-col items-center justify-center min-h-[400px]"
      >
        <GitFork className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium mb-2">No Flows Detected</h3>
        <p className="text-muted-foreground text-center max-w-md">
          Program flows are identified through JCL files and CALL chains. 
          No batch or online flows were detected in this repository.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="p-6 space-y-4"
    >
      {/* Summary */}
      <div className="flex items-center gap-4 mb-6">
        <Badge variant="secondary" className="text-sm">
          {flows.length} flow{flows.length !== 1 ? 's' : ''} detected
        </Badge>
        <Badge variant="outline">
          {flows.filter(f => f.type === 'batch').length} batch
        </Badge>
        <Badge variant="outline">
          {flows.filter(f => f.type === 'online').length} online
        </Badge>
      </div>

      {/* Flow Cards */}
      <div className="grid gap-4">
        {flows.map((flow) => {
          const typeConfig = flowTypeConfig[flow.type] || flowTypeConfig.unknown;
          const isExpanded = expandedFlows.has(flow.id);

          return (
            <motion.div key={flow.id} variants={item}>
              <Card className="overflow-hidden">
                <Collapsible open={isExpanded} onOpenChange={() => toggleFlow(flow.id)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ChevronRight 
                            className={cn(
                              "h-5 w-5 text-muted-foreground transition-transform",
                              isExpanded && "rotate-90"
                            )} 
                          />
                          <GitFork className="h-5 w-5 text-primary" />
                          <div>
                            <CardTitle className="text-base">{flow.name}</CardTitle>
                            {flow.jclFile && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {flow.jclFile}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge className={cn("text-white", typeConfig.color)}>
                            {typeConfig.label}
                          </Badge>
                          <Badge variant="secondary">
                            {flow.programs.length} programs
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4">
                      {/* Entry Point */}
                      {flow.entryPoint && (
                        <div className="mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Play className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">Entry Point:</span>
                              <span className="font-mono text-sm">{flow.entryPoint}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewProgram(flow.entryPoint)}
                            >
                              <Code className="h-4 w-4 mr-1" />
                              View Code
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Program Sequence */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">
                          Program Sequence
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {flow.programs.map((program, idx) => (
                            <div key={program} className="flex items-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewProgram(program)}
                                className="font-mono text-xs h-7"
                              >
                                {program}
                              </Button>
                              {idx < flow.programs.length - 1 && (
                                <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewFlowGraph(flow)}
                        >
                          <Network className="h-4 w-4 mr-1" />
                          View in Graph
                        </Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Ready to Explore - Common across all tabs */}
      <motion.div variants={item}>
        <ReadyToExplore />
      </motion.div>
    </motion.div>
  );
}

export default FlowsTab;
