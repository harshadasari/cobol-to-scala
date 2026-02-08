import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  Search, 
  ArrowRight,
  Network,
  Code,
  ChevronDown
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useAnalysis } from "@/contexts/AnalysisContext";
import { ReadyToExplore } from "@/components/analysis/ReadyToExplore";

export function DependenciesTab() {
  const { analysisResult, setActiveTab, setSelectedFile } = useAnalysis();
  const [search, setSearch] = useState('');
  const [depType, setDepType] = useState<'call' | 'copy'>('call');

  const edges = analysisResult?.dependencyGraph?.edges || [];
  const nodes = analysisResult?.dependencyGraph?.nodes || [];
  const statistics = analysisResult?.statistics;

  // Filter and process dependencies
  const filteredDeps = useMemo(() => {
    const typeFilter = depType === 'call' ? 'CALL' : 'COPY';
    let deps = edges.filter(e => e.type === typeFilter);

    if (search) {
      const searchLower = search.toLowerCase();
      deps = deps.filter(d => 
        d.from.toLowerCase().includes(searchLower) ||
        d.to.toLowerCase().includes(searchLower)
      );
    }

    return deps;
  }, [edges, depType, search]);

  // Calculate most called/used
  const topTargets = useMemo(() => {
    const typeFilter = depType === 'call' ? 'CALL' : 'COPY';
    const counts: Record<string, number> = {};
    
    edges.filter(e => e.type === typeFilter).forEach(e => {
      counts[e.to] = (counts[e.to] || 0) + 1;
    });

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }, [edges, depType]);

  const handleViewProgram = (programName: string) => {
    setSelectedFile(programName);
    setActiveTab('code-viewer');
  };

  const handleViewGraph = () => {
    setActiveTab('graph');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">CALL Dependencies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display text-blue-500">
              {edges.filter(e => e.type === 'CALL').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">COPY Dependencies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display text-green-500">
              {edges.filter(e => e.type === 'COPY').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Dependencies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-display">
              {edges.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dependency Table */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs value={depType} onValueChange={(v) => setDepType(v as 'call' | 'copy')}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="call" className="gap-2">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                    CALL
                  </Badge>
                  Dependencies
                </TabsTrigger>
                <TabsTrigger value="copy" className="gap-2">
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                    COPY
                  </Badge>
                  Dependencies
                </TabsTrigger>
              </TabsList>
              
              <Button variant="outline" size="sm" onClick={handleViewGraph}>
                <Network className="h-4 w-4 mr-1" />
                View Graph
              </Button>
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search dependencies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <TabsContent value="call" className="mt-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Source Program</TableHead>
                      <TableHead className="w-[50px] text-center">→</TableHead>
                      <TableHead>Target Program</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeps.length > 0 ? (
                      filteredDeps.slice(0, 50).map((dep, idx) => (
                        <TableRow key={`${dep.from}-${dep.to}-${idx}`} className="hover:bg-muted/30">
                          <TableCell>
                            <button
                              onClick={() => handleViewProgram(dep.from)}
                              className="font-mono text-sm hover:text-primary transition-colors"
                            >
                              {dep.from}
                            </button>
                          </TableCell>
                          <TableCell className="text-center">
                            <ArrowRight className="h-4 w-4 text-blue-500 mx-auto" />
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => handleViewProgram(dep.to)}
                              className="font-mono text-sm hover:text-primary transition-colors"
                            >
                              {dep.to}
                            </button>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewProgram(dep.from)}
                              className="h-7 w-7 p-0"
                            >
                              <Code className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                          {search ? 'No matching dependencies found' : 'No CALL dependencies'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {filteredDeps.length > 50 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Showing 50 of {filteredDeps.length} dependencies
                </p>
              )}
            </TabsContent>

            <TabsContent value="copy" className="mt-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Program</TableHead>
                      <TableHead className="w-[50px] text-center">→</TableHead>
                      <TableHead>Copybook</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeps.length > 0 ? (
                      filteredDeps.slice(0, 50).map((dep, idx) => (
                        <TableRow key={`${dep.from}-${dep.to}-${idx}`} className="hover:bg-muted/30">
                          <TableCell>
                            <button
                              onClick={() => handleViewProgram(dep.from)}
                              className="font-mono text-sm hover:text-primary transition-colors"
                            >
                              {dep.from}
                            </button>
                          </TableCell>
                          <TableCell className="text-center">
                            <ArrowRight className="h-4 w-4 text-green-500 mx-auto" />
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => handleViewProgram(dep.to)}
                              className="font-mono text-sm hover:text-primary transition-colors"
                            >
                              {dep.to}
                            </button>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewProgram(dep.from)}
                              className="h-7 w-7 p-0"
                            >
                              <Code className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                          {search ? 'No matching dependencies found' : 'No COPY dependencies'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {filteredDeps.length > 50 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Showing 50 of {filteredDeps.length} dependencies
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Top Targets Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {depType === 'call' ? (
                  <>
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                      TOP
                    </Badge>
                    Most Called Programs
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                      TOP
                    </Badge>
                    Most Used Copybooks
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topTargets.length > 0 ? (
                  topTargets.map((target, idx) => (
                    <div
                      key={target.name}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleViewProgram(target.name)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-5">
                          {idx + 1}.
                        </span>
                        <span className="font-mono text-sm">{target.name}</span>
                      </div>
                      <Badge variant="secondary">
                        {target.count}×
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No dependencies found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Ready to Explore - Common across all tabs */}
      <ReadyToExplore />
    </motion.div>
  );
}

export default DependenciesTab;
