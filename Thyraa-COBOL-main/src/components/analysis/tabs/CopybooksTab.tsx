import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  Search, 
  Files,
  Code,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAnalysis } from "@/contexts/AnalysisContext";
import { cn } from "@/lib/utils";
import { ReadyToExplore } from "@/components/analysis/ReadyToExplore";

export function CopybooksTab() {
  const { analysisResult, setActiveTab, setSelectedFile } = useAnalysis();
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const nodes = analysisResult?.dependencyGraph?.nodes || [];
  const edges = analysisResult?.dependencyGraph?.edges || [];

  // Get all copybooks with usage info
  const copybooks = useMemo(() => {
    const copybookNodes = nodes.filter(n => n.type === 'copybook');
    
    return copybookNodes.map(cb => {
      // Find all programs that use this copybook
      const usedBy = edges
        .filter(e => e.type === 'COPY' && e.to.toUpperCase() === cb.name.toUpperCase())
        .map(e => e.from);
      
      return {
        ...cb,
        usedBy: [...new Set(usedBy)],
        usageCount: usedBy.length
      };
    }).sort((a, b) => b.usageCount - a.usageCount);
  }, [nodes, edges]);

  // Filter copybooks
  const filteredCopybooks = useMemo(() => {
    if (!search) return copybooks;
    
    const searchLower = search.toLowerCase();
    return copybooks.filter(cb => 
      cb.name.toLowerCase().includes(searchLower) ||
      cb.filePath?.toLowerCase().includes(searchLower) ||
      cb.usedBy.some(p => p.toLowerCase().includes(searchLower))
    );
  }, [copybooks, search]);

  const toggleRow = (name: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleViewCode = (name: string) => {
    setSelectedFile(name);
    setActiveTab('code-viewer');
  };

  if (copybooks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-6 flex flex-col items-center justify-center min-h-[400px]"
      >
        <Files className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium mb-2">No Copybooks Found</h3>
        <p className="text-muted-foreground text-center max-w-md">
          Copybooks are shared code files included via COPY statements. 
          None were detected in this repository.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            {copybooks.length} copybook{copybooks.length !== 1 ? 's' : ''}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {edges.filter(e => e.type === 'COPY').length} total usages
          </span>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search copybooks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Copybook Name</TableHead>
              <TableHead className="hidden md:table-cell">File Path</TableHead>
              <TableHead className="w-[100px] text-center">Usage Count</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCopybooks.length > 0 ? (
              filteredCopybooks.map((cb) => {
                const isExpanded = expandedRows.has(cb.name);

                return (
                  <Collapsible key={cb.name} open={isExpanded} onOpenChange={() => toggleRow(cb.name)} asChild>
                    <>
                      <TableRow className="hover:bg-muted/30">
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <ChevronRight className={cn(
                                "h-4 w-4 transition-transform",
                                isExpanded && "rotate-90"
                              )} />
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Files className="h-4 w-4 text-green-500" />
                            <span className="font-mono text-sm font-medium">{cb.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
                            {cb.filePath || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant={cb.usageCount > 5 ? "default" : "secondary"}
                            className={cb.usageCount > 5 ? "bg-green-500" : ""}
                          >
                            {cb.usageCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewCode(cb.name)}
                            className="h-7 w-7 p-0"
                          >
                            <Code className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={5} className="p-0">
                            <div className="px-8 py-3">
                              <p className="text-sm font-medium mb-2">Used by {cb.usedBy.length} program(s):</p>
                              <div className="flex flex-wrap gap-2">
                                {cb.usedBy.map(program => (
                                  <Button
                                    key={program}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewCode(program)}
                                    className="h-7 font-mono text-xs"
                                  >
                                    {program}
                                  </Button>
                                ))}
                                {cb.usedBy.length === 0 && (
                                  <span className="text-sm text-muted-foreground">
                                    No programs using this copybook were found
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {search ? 'No matching copybooks found' : 'No copybooks available'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Ready to Explore - Common across all tabs */}
      <ReadyToExplore />
    </motion.div>
  );
}

export default CopybooksTab;
