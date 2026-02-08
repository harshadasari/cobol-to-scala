import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  Search, 
  FileCode, 
  Files, 
  FileText,
  ArrowUpDown,
  Code,
  Network,
  ChevronDown
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnalysis, ProgramNode } from "@/contexts/AnalysisContext";
import { ReadyToExplore } from "@/components/analysis/ReadyToExplore";

type SortKey = 'name' | 'type' | 'calls' | 'copybooks' | 'lines';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | 'program' | 'copybook' | 'jcl';

const typeConfig = {
  program: { icon: FileCode, color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Program' },
  copybook: { icon: Files, color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Copybook' },
  jcl: { icon: FileText, color: 'text-orange-500', bgColor: 'bg-orange-500/10', label: 'JCL' },
};

export function ProgramsTab() {
  const { analysisResult, setActiveTab, setSelectedFile } = useAnalysis();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterType, setFilterType] = useState<FilterType>('all');

  const nodes = analysisResult?.dependencyGraph?.nodes || [];
  const edges = analysisResult?.dependencyGraph?.edges || [];

  const filteredAndSortedNodes = useMemo(() => {
    let result = [...nodes];

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter(n => n.type === filterType);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(n => 
        n.name.toLowerCase().includes(searchLower) ||
        n.filePath?.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'calls':
          comparison = edges.filter(e => 
            e.type === 'CALL' && e.from?.toUpperCase() === a.name.toUpperCase()
          ).length - edges.filter(e => 
            e.type === 'CALL' && e.from?.toUpperCase() === b.name.toUpperCase()
          ).length;
          break;
        case 'copybooks':
          comparison = edges.filter(e => 
            e.type === 'COPY' && e.from?.toUpperCase() === a.name.toUpperCase()
          ).length - edges.filter(e => 
            e.type === 'COPY' && e.from?.toUpperCase() === b.name.toUpperCase()
          ).length;
          break;
        case 'lines':
          const getLines = (node: ProgramNode) => {
            // ALWAYS calculate from GitHub content only - never use cached metadata.lines
            if (node.content && node.content.trim()) {
              return node.content.split('\n').length;
            }
            // If content not available, return 0 (sort these to the end)
            return 0;
          };
          comparison = getLines(a) - getLines(b);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [nodes, edges, search, sortKey, sortOrder, filterType]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const handleViewCode = (node: ProgramNode) => {
    setSelectedFile(node.name);
    setActiveTab('code-viewer');
  };

  const handleViewGraph = (node: ProgramNode) => {
    setSelectedFile(node.name);
    setActiveTab('graph');
  };

  const SortButton = ({ column, label }: { column: SortKey; label: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleSort(column)}
      className="h-8 gap-1 -ml-3"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === column ? 'text-primary' : 'text-muted-foreground'}`} />
    </Button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 space-y-4"
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search programs, copybooks, files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              {filterType === 'all' ? 'All Types' : typeConfig[filterType].label}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterType('all')}>
              All Types
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType('program')}>
              <FileCode className="h-4 w-4 mr-2 text-blue-500" />
              Programs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType('copybook')}>
              <Files className="h-4 w-4 mr-2 text-green-500" />
              Copybooks
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType('jcl')}>
              <FileText className="h-4 w-4 mr-2 text-orange-500" />
              JCL Files
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredAndSortedNodes.length} of {nodes.length} items
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[250px]">
                <SortButton column="name" label="Name" />
              </TableHead>
              <TableHead className="w-[100px]">
                <SortButton column="type" label="Type" />
              </TableHead>
              <TableHead className="hidden md:table-cell">Path</TableHead>
              <TableHead className="w-[80px] text-center">
                <SortButton column="calls" label="Calls" />
              </TableHead>
              <TableHead className="w-[80px] text-center">
                <SortButton column="copybooks" label="Copies" />
              </TableHead>
              <TableHead className="w-[80px] text-center hidden sm:table-cell">
                <SortButton column="lines" label="Lines" />
              </TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedNodes.length > 0 ? (
              filteredAndSortedNodes.map((node) => {
                const config = typeConfig[node.type] || typeConfig.program;
                const Icon = config.icon;

                return (
                  <TableRow 
                    key={node.name} 
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => handleViewCode(node)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${config.color}`} />
                        <span className="font-mono text-sm font-medium">{node.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`${config.bgColor} ${config.color} border-0`}>
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
                        {node.filePath || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {(analysisResult?.dependencyGraph?.edges || []).filter(e => 
                          e.type === 'CALL' && e.from?.toUpperCase() === node.name.toUpperCase()
                        ).length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {(analysisResult?.dependencyGraph?.edges || []).filter(e => 
                          e.type === 'COPY' && e.from?.toUpperCase() === node.name.toUpperCase()
                        ).length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {(() => {
                          // ALWAYS calculate from GitHub content only - never use cached metadata.lines
                          if (node.content && node.content.trim()) {
                            const calculatedLines = node.content.split('\n').length;
                            // #region agent log
                            if (node.name === 'MAINPGM') {
                              fetch('http://127.0.0.1:7242/ingest/0423fc58-f186-4cd7-8469-e50b73c0f1dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ProgramsTab.tsx:render',message:'displaying lines for MAINPGM',data:{nodeName:node.name,calculatedLines,metadataLines:node.metadata?.lines,contentLength:node.content.length,contentLines:node.content.split('\n').length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                            }
                            // #endregion
                            return calculatedLines.toLocaleString();
                          }
                          // If content not available, show '-' to indicate data not loaded from GitHub
                          return '-';
                        })()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewCode(node)}
                          className="h-7 w-7 p-0"
                        >
                          <Code className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewGraph(node)}
                          className="h-7 w-7 p-0"
                        >
                          <Network className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {search || filterType !== 'all' 
                    ? 'No matching items found' 
                    : 'No programs analyzed yet'}
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

export default ProgramsTab;
