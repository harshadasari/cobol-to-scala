import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  ReactFlow,
  ReactFlowProvider,
  Node,
  Edge,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { 
  Search, 
  ZoomIn,
  ZoomOut,
  Maximize,
  FileCode,
  Files,
  FileText,
  ChevronDown,
  Layout,
  Network
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnalysis, ProgramNode } from "@/contexts/AnalysisContext";
import { ReadyToExplore } from "@/components/analysis/ReadyToExplore";

type FilterType = 'all' | 'program' | 'copybook' | 'jcl';
type LayoutType = 'hierarchical' | 'grid' | 'circular';

const nodeColors = {
  program: { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },
  copybook: { bg: '#10b981', border: '#059669', text: '#ffffff' },
  jcl: { bg: '#f97316', border: '#ea580c', text: '#ffffff' },
};

const edgeColors = {
  CALL: '#3b82f6',
  COPY: '#10b981',
};

// Hierarchical layout calculation
function calculateHierarchicalLayout(nodes: ProgramNode[], edges: any[]) {
  // Build dependency graph
  const nodeMap = new Map(nodes.map(n => [n.name.toUpperCase(), n]));
  const incomingEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, string[]>();
  
  // Only use CALL edges for hierarchy, COPY edges are informational
  const callEdges = edges.filter(e => e.type === 'CALL');
  
  callEdges.forEach(edge => {
    const from = edge.from.toUpperCase();
    const to = edge.to.toUpperCase();
    
    if (!incomingEdges.has(to)) incomingEdges.set(to, []);
    if (!outgoingEdges.has(from)) outgoingEdges.set(from, []);
    
    incomingEdges.get(to)!.push(from);
    outgoingEdges.get(from)!.push(to);
  });
  
  // Find entry points (nodes with no incoming CALL edges)
  const entryPoints = nodes
    .filter(n => !incomingEdges.has(n.name.toUpperCase()))
    .map(n => n.name.toUpperCase());
  
  // Assign levels using BFS from entry points
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ name: string; level: number }> = [];
  
  entryPoints.forEach(name => {
    queue.push({ name, level: 0 });
    visited.add(name);
  });
  
  // If no entry points, start with nodes that have fewest dependencies
  if (entryPoints.length === 0) {
    nodes.forEach(n => {
      const name = n.name.toUpperCase();
      const incoming = incomingEdges.get(name)?.length || 0;
      if (incoming === 0 || incoming === 1) {
        queue.push({ name, level: 0 });
        visited.add(name);
      }
    });
  }
  
  // BFS to assign levels
  while (queue.length > 0) {
    const { name, level } = queue.shift()!;
    levels.set(name, level);
    
    const outgoing = outgoingEdges.get(name) || [];
    outgoing.forEach(child => {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push({ name: child, level: level + 1 });
      }
    });
  }
  
  // Assign remaining nodes to max level + 1
  const maxLevel = Math.max(...Array.from(levels.values()), -1);
  nodes.forEach(n => {
    const name = n.name.toUpperCase();
    if (!levels.has(name)) {
      levels.set(name, maxLevel + 1);
    }
  });
  
  // Group nodes by level
  const levelGroups = new Map<number, string[]>();
  nodes.forEach(n => {
    const name = n.name.toUpperCase();
    const level = levels.get(name) || 0;
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(n.name);
  });
  
  // Calculate positions
  const positions = new Map<string, { x: number; y: number }>();
  const nodeHeight = 60;
  const nodeWidth = 150;
  const levelSpacing = 250;
  const nodeSpacing = 180;
  
  levelGroups.forEach((nodeNames, level) => {
    const y = level * levelSpacing;
    const totalWidth = nodeNames.length * nodeSpacing;
    const startX = -(totalWidth / 2) + (nodeSpacing / 2);
    
    nodeNames.forEach((name, index) => {
      positions.set(name.toUpperCase(), {
        x: startX + index * nodeSpacing,
        y
      });
    });
  });
  
  return positions;
}

// Circular layout calculation
function calculateCircularLayout(nodes: ProgramNode[]) {
  const positions = new Map<string, { x: number; y: number }>();
  const radius = Math.max(200, nodes.length * 30);
  const angleStep = (2 * Math.PI) / nodes.length;
  
  nodes.forEach((node, index) => {
    const angle = index * angleStep;
    positions.set(node.name.toUpperCase(), {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    });
  });
  
  return positions;
}

// Inner component that has access to ReactFlow context
function GraphContent({
  nodes: initialNodes,
  edges: initialEdges,
  selectedFile,
  setSelectedFile,
  setActiveTab,
}: {
  nodes: Node[];
  edges: Edge[];
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  setActiveTab: (tab: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowInstance = useReactFlow();

  // Update when data changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Fit view after nodes are set
  useEffect(() => {
    if (nodes.length > 0 && reactFlowInstance) {
      const timer = setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, reactFlowInstance]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedFile(node.id);
  }, [setSelectedFile]);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedFile(node.id);
    setActiveTab('code-viewer');
  }, [setSelectedFile, setActiveTab]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Controls showInteractive={false} />
        <MiniMap 
          nodeColor={(node) => {
            const type = (node.data as { type?: string })?.type as keyof typeof nodeColors || 'program';
            return nodeColors[type]?.bg || '#888';
          }}
          maskColor="rgba(0,0,0,0.1)"
        />
        <Background gap={20} size={1} />
      </ReactFlow>

      {/* Selected Node Info */}
      {selectedFile && (
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Selected:</span>
              <span className="font-mono font-medium">{selectedFile}</span>
            </div>
            <Button size="sm" onClick={() => setActiveTab('code-viewer')}>
              View Code
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export function GraphViewTab() {
  const { analysisResult, selectedFile, setSelectedFile, setActiveTab } = useAnalysis();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [layoutType, setLayoutType] = useState<LayoutType>('hierarchical');
  
  const graphNodes = analysisResult?.dependencyGraph?.nodes || [];
  const graphEdges = analysisResult?.dependencyGraph?.edges || [];

  // Convert to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    let filteredNodes = [...graphNodes];
    
    // Apply type filter
    if (filterType !== 'all') {
      filteredNodes = filteredNodes.filter(n => n.type === filterType);
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filteredNodes = filteredNodes.filter(n => 
        n.name.toLowerCase().includes(searchLower)
      );
    }

    const nodeNames = new Set(filteredNodes.map(n => n.name.toUpperCase()));
    
    // Calculate positions based on layout type
    let positions: Map<string, { x: number; y: number }>;
    
    if (layoutType === 'hierarchical') {
      positions = calculateHierarchicalLayout(filteredNodes, graphEdges);
    } else if (layoutType === 'circular') {
      positions = calculateCircularLayout(filteredNodes);
    } else {
      // Grid layout
      positions = new Map();
      const cols = Math.ceil(Math.sqrt(filteredNodes.length));
      filteredNodes.forEach((node, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        positions.set(node.name.toUpperCase(), {
          x: col * 200,
          y: row * 120
        });
      });
    }

    // Calculate connection counts for node sizing
    const connectionCounts = new Map<string, number>();
    filteredNodes.forEach(node => {
      const name = node.name.toUpperCase();
      const outgoing = graphEdges.filter(e => 
        e.from?.toUpperCase() === name && nodeNames.has(e.to?.toUpperCase())
      ).length;
      const incoming = graphEdges.filter(e => 
        e.to?.toUpperCase() === name && nodeNames.has(e.from?.toUpperCase())
      ).length;
      connectionCounts.set(name, outgoing + incoming);
    });

    // Create nodes with calculated positions
    const nodes: Node[] = filteredNodes.map((node) => {
      const colors = nodeColors[node.type] || nodeColors.program;
      const nameUpper = node.name.toUpperCase();
      const position = positions.get(nameUpper) || { x: 0, y: 0 };
      const connections = connectionCounts.get(nameUpper) || 0;
      
      // Size nodes based on connections (more connections = larger)
      const baseWidth = 120;
      const baseHeight = 50;
      const connectionWidth = Math.min(connections * 5, 60);
      const width = baseWidth + connectionWidth;
      const height = baseHeight;

      return {
        id: node.name,
        position,
        data: { 
          label: node.name,
          type: node.type,
          node: node,
          connections
        },
        style: {
          background: colors.bg,
          color: colors.text,
          border: `2px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '10px 15px',
          fontSize: '12px',
          fontFamily: 'monospace',
          fontWeight: 500,
          width: `${width}px`,
          height: `${height}px`,
          textAlign: 'center' as const,
          boxShadow: selectedFile === node.name 
            ? `0 0 0 3px ${colors.bg}40` 
            : '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.2s ease',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });

    // Create edges (only for visible nodes)
    const edges: Edge[] = graphEdges
      .filter(e => 
        nodeNames.has(e.from.toUpperCase()) && 
        nodeNames.has(e.to.toUpperCase())
      )
      .map((edge, index) => ({
        id: `${edge.from}-${edge.to}-${index}`,
        source: edge.from,
        target: edge.to,
        type: 'smoothstep',
        animated: edge.type === 'CALL',
        style: {
          stroke: edgeColors[edge.type] || '#888',
          strokeWidth: 2,
          strokeDasharray: edge.type === 'COPY' ? '5,5' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColors[edge.type] || '#888',
        },
        label: edge.type,
        labelStyle: { 
          fontSize: 10, 
          fontWeight: 500,
          fill: edgeColors[edge.type] || '#888' 
        },
        labelBgStyle: { 
          fill: 'white', 
          fillOpacity: 0.8 
        },
      }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [graphNodes, graphEdges, filterType, search, selectedFile, layoutType]);

  // Handle layout change
  const handleLayoutChange = useCallback((newLayout: LayoutType) => {
    setLayoutType(newLayout);
  }, []);

  if (graphNodes.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-[calc(100vh-8rem)] flex flex-col items-center justify-center"
      >
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Files className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No Graph Data</h3>
          <p className="text-muted-foreground">
            No programs or dependencies to visualize.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-[calc(100vh-16rem)] flex flex-col px-6"
      >
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-4 border-b border-border bg-background">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              {filterType === 'all' ? 'All Types' : filterType.charAt(0).toUpperCase() + filterType.slice(1)}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterType('all')}>
              All Types
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType('program')}>
              <FileCode className="h-4 w-4 mr-2 text-blue-500" />
              Programs Only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType('copybook')}>
              <Files className="h-4 w-4 mr-2 text-green-500" />
              Copybooks Only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType('jcl')}>
              <FileText className="h-4 w-4 mr-2 text-orange-500" />
              JCL Only
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Layout className="h-4 w-4" />
              {layoutType === 'hierarchical' ? 'Hierarchical' : layoutType === 'circular' ? 'Circular' : 'Grid'}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleLayoutChange('hierarchical')}>
              <Network className="h-4 w-4 mr-2" />
              Hierarchical (Top-Down)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleLayoutChange('circular')}>
              <Maximize className="h-4 w-4 mr-2" />
              Circular
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleLayoutChange('grid')}>
              <Layout className="h-4 w-4 mr-2" />
              Grid
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* Legend */}
        <div className="hidden md:flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span>Program</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span>Copybook</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-orange-500" />
            <span>JCL</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-blue-500" />
            <span>CALL</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-green-500 border-dashed border-t-2 border-green-500" style={{ borderStyle: 'dashed' }} />
            <span>COPY</span>
          </div>
        </div>

        <Badge variant="secondary">
          {initialNodes.length} nodes
        </Badge>
      </div>

      {/* Graph */}
      <div className="flex-1">
        <ReactFlowProvider>
          <GraphContent
            nodes={initialNodes}
            edges={initialEdges}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            setActiveTab={setActiveTab}
          />
        </ReactFlowProvider>
      </div>
      </motion.div>
      
      {/* Ready to Explore - Common across all tabs */}
      <div className="p-6 pt-0">
        <ReadyToExplore />
      </div>
    </div>
  );
}

export default GraphViewTab;
