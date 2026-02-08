import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import Editor from "@monaco-editor/react";
import { 
  Search, 
  FileCode, 
  Files, 
  FileText,
  ChevronDown,
  Check,
  Sun,
  Moon,
  PanelBottomClose,
  PanelBottomOpen,
  ExternalLink
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAnalysis, ProgramNode } from "@/contexts/AnalysisContext";
import { ReadyToExplore } from "@/components/analysis/ReadyToExplore";

const typeConfig = {
  program: { icon: FileCode, color: 'text-blue-500', label: 'Program' },
  copybook: { icon: Files, color: 'text-green-500', label: 'Copybook' },
  jcl: { icon: FileText, color: 'text-orange-500', label: 'JCL' },
};

// COBOL language configuration for Monaco
const cobolLanguageConfig = {
  keywords: [
    'IDENTIFICATION', 'DIVISION', 'PROGRAM-ID', 'AUTHOR', 'ENVIRONMENT',
    'CONFIGURATION', 'SECTION', 'SOURCE-COMPUTER', 'OBJECT-COMPUTER',
    'INPUT-OUTPUT', 'FILE-CONTROL', 'DATA', 'FILE', 'WORKING-STORAGE',
    'LINKAGE', 'PROCEDURE', 'PERFORM', 'MOVE', 'ADD', 'SUBTRACT',
    'MULTIPLY', 'DIVIDE', 'COMPUTE', 'IF', 'ELSE', 'END-IF', 'EVALUATE',
    'WHEN', 'END-EVALUATE', 'GO', 'TO', 'STOP', 'RUN', 'CALL', 'COPY',
    'USING', 'GIVING', 'RETURNING', 'PIC', 'PICTURE', 'VALUE', 'OCCURS',
    'TIMES', 'INDEXED', 'BY', 'REDEFINES', 'FILLER', 'DISPLAY', 'ACCEPT',
    'OPEN', 'CLOSE', 'READ', 'WRITE', 'REWRITE', 'DELETE', 'START',
    'RETURN', 'RELEASE', 'SORT', 'MERGE', 'STRING', 'UNSTRING', 'INSPECT',
    'INITIALIZE', 'SET', 'EXIT', 'CONTINUE', 'GOBACK', 'EXEC', 'END-EXEC',
    'SQL', 'CICS', 'FD', 'SD', 'COPY', 'REPLACING', 'THRU', 'THROUGH',
    'NOT', 'AND', 'OR', 'EQUAL', 'GREATER', 'LESS', 'THAN', 'ZERO',
    'ZEROS', 'ZEROES', 'SPACE', 'SPACES', 'HIGH-VALUE', 'HIGH-VALUES',
    'LOW-VALUE', 'LOW-VALUES', 'QUOTE', 'QUOTES', 'ALL', 'TRUE', 'FALSE'
  ],
  typeKeywords: [
    'PIC', 'PICTURE', 'COMP', 'COMP-1', 'COMP-2', 'COMP-3', 'COMP-4',
    'COMP-5', 'BINARY', 'PACKED-DECIMAL', 'DISPLAY', 'POINTER'
  ]
};

export function CodeViewerTab() {
  const { 
    analysisResult, 
    selectedFile, 
    setSelectedFile,
    getProgramByName,
    getProgramDependencies,
    setActiveTab 
  } = useAnalysis();
  
  const [fileOpen, setFileOpen] = useState(false);
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [panelOpen, setPanelOpen] = useState(true);

  const nodes = analysisResult?.dependencyGraph?.nodes || [];
  
  // Group nodes by type
  const groupedNodes = useMemo(() => {
    const programs = nodes.filter(n => n.type === 'program');
    const copybooks = nodes.filter(n => n.type === 'copybook');
    const jcl = nodes.filter(n => n.type === 'jcl');
    return { programs, copybooks, jcl };
  }, [nodes]);

  const selectedProgram = selectedFile ? getProgramByName(selectedFile) : null;
  const dependencies = selectedFile ? getProgramDependencies(selectedFile) : null;

  // Get code content with fallback
  const codeContent = useMemo(() => {
    if (!selectedProgram) {
      return '* Select a file from the dropdown above to view its contents\n* \n* Available files:\n' + 
        nodes.slice(0, 10).map(n => `*   - ${n.name}`).join('\n');
    }
    
    if (selectedProgram.content) {
      return selectedProgram.content;
    }
    
    // Generate placeholder COBOL structure
    return `      * ============================================
      * PROGRAM: ${selectedProgram.name}
      * FILE: ${selectedProgram.filePath || 'N/A'}
      * LINES: ${selectedProgram.metadata?.lines || 'Unknown'}
      * ============================================
      *
      * Note: Source code content not available.
      * The backend needs to include 'content' in the response.
      *
      * DEPENDENCIES:
      * -------------
${(selectedProgram.calls || []).map(c => `      * CALL '${c}'`).join('\n') || '      * (no CALL dependencies)'}
      *
      * COPYBOOKS:
      * ----------
${(selectedProgram.copybooks || []).map(c => `      * COPY ${c}`).join('\n') || '      * (no COPY dependencies)'}
      *
       IDENTIFICATION DIVISION.
       PROGRAM-ID. ${selectedProgram.name}.
      *
       ENVIRONMENT DIVISION.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
      *
       PROCEDURE DIVISION.
           DISPLAY "Program ${selectedProgram.name}".
           STOP RUN.
`;
  }, [selectedProgram, nodes]);

  const handleSelectFile = (nodeName: string) => {
    setSelectedFile(nodeName);
    setFileOpen(false);
  };

  const handleDependencyClick = (name: string) => {
    setSelectedFile(name);
  };

  const handleViewInGraph = () => {
    setActiveTab('graph');
  };

  // Configure Monaco editor
  const handleEditorMount = useCallback((editor: unknown, monaco: unknown) => {
    // Register COBOL language if monaco is available
    const monacoInstance = monaco as {
      languages: {
        register: (lang: { id: string }) => void;
        setMonarchTokensProvider: (id: string, def: object) => void;
      };
    };
    
    if (monacoInstance?.languages) {
      monacoInstance.languages.register({ id: 'cobol' });
      monacoInstance.languages.setMonarchTokensProvider('cobol', {
        ignoreCase: true,
        keywords: cobolLanguageConfig.keywords,
        typeKeywords: cobolLanguageConfig.typeKeywords,
        tokenizer: {
          root: [
            [/^\s{6}\*.*$/, 'comment'],
            [/^\d{6}/, 'comment.sequence'],
            [/'[^']*'/, 'string'],
            [/"[^"]*"/, 'string'],
            [/\bCALL\s+'[^']+'/, 'keyword'],
            [/\bCOPY\s+[A-Z0-9-]+/, 'keyword'],
            [/\bPROGRAM-ID\.[\s]*[A-Z0-9-]+/, 'keyword'],
            [/\b[A-Z][A-Z0-9-]*\b/, {
              cases: {
                '@keywords': 'keyword',
                '@typeKeywords': 'type',
                '@default': 'identifier'
              }
            }],
            [/[0-9]+/, 'number'],
            [/\./, 'delimiter'],
            [/\s+/, 'white'],
          ]
        }
      });
    }
  }, []);

  return (
    <div className="flex flex-col">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-[calc(100vh-16rem)] flex flex-col px-6"
      >
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-4 border-b border-border bg-background">
        {/* File Selector */}
        <Popover open={fileOpen} onOpenChange={setFileOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={fileOpen}
              className="w-[300px] justify-between font-mono"
            >
              {selectedProgram ? (
                <div className="flex items-center gap-2">
                  {(() => {
                    const config = typeConfig[selectedProgram.type] || typeConfig.program;
                    const Icon = config.icon;
                    return <Icon className={`h-4 w-4 ${config.color}`} />;
                  })()}
                  <span className="truncate">{selectedProgram.name}</span>
                </div>
              ) : (
                <span className="text-muted-foreground">Select a file...</span>
              )}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search files..." />
              <CommandList>
                <CommandEmpty>No files found.</CommandEmpty>
                {groupedNodes.programs.length > 0 && (
                  <CommandGroup heading="Programs">
                    {groupedNodes.programs.map((node) => (
                      <CommandItem
                        key={node.name}
                        value={node.name}
                        onSelect={() => handleSelectFile(node.name)}
                        className="flex items-center gap-2"
                      >
                        <FileCode className="h-4 w-4 text-blue-500" />
                        <span className="font-mono text-sm">{node.name}</span>
                        {node.name === selectedFile && (
                          <Check className="ml-auto h-4 w-4" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {groupedNodes.copybooks.length > 0 && (
                  <CommandGroup heading="Copybooks">
                    {groupedNodes.copybooks.map((node) => (
                      <CommandItem
                        key={node.name}
                        value={node.name}
                        onSelect={() => handleSelectFile(node.name)}
                        className="flex items-center gap-2"
                      >
                        <Files className="h-4 w-4 text-green-500" />
                        <span className="font-mono text-sm">{node.name}</span>
                        {node.name === selectedFile && (
                          <Check className="ml-auto h-4 w-4" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {groupedNodes.jcl.length > 0 && (
                  <CommandGroup heading="JCL Files">
                    {groupedNodes.jcl.map((node) => (
                      <CommandItem
                        key={node.name}
                        value={node.name}
                        onSelect={() => handleSelectFile(node.name)}
                        className="flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4 text-orange-500" />
                        <span className="font-mono text-sm">{node.name}</span>
                        {node.name === selectedFile && (
                          <Check className="ml-auto h-4 w-4" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Actions */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'vs-dark' ? 'light' : 'vs-dark')}
        >
          {theme === 'vs-dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {panelOpen ? <PanelBottomClose className="h-4 w-4" /> : <PanelBottomOpen className="h-4 w-4" />}
        </Button>
        {selectedProgram && (
          <Button variant="outline" size="sm" onClick={handleViewInGraph}>
            <ExternalLink className="h-4 w-4 mr-1" />
            View in Graph
          </Button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="cobol"
          theme={theme}
          value={codeContent}
          onMount={handleEditorMount}
          options={{
            readOnly: true,
            minimap: { enabled: true },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
          }}
        />
      </div>

      {/* Dependency Panel */}
      <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
        <CollapsibleContent>
          <div className="border-t border-border bg-muted/30 p-4">
            {selectedProgram && dependencies ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Outgoing Calls */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                      CALL
                    </Badge>
                    Calls ({dependencies.calls.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {dependencies.calls.length > 0 ? (
                      dependencies.calls.map((dep) => (
                        <button
                          key={dep.name}
                          onClick={() => handleDependencyClick(dep.name)}
                          className="block w-full text-left px-2 py-1 rounded text-sm font-mono hover:bg-muted transition-colors"
                        >
                          {dep.name}
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No outgoing calls</p>
                    )}
                  </div>
                </div>

                {/* Outgoing Copies */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                      COPY
                    </Badge>
                    Copybooks ({dependencies.copybooks.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {dependencies.copybooks.length > 0 ? (
                      dependencies.copybooks.map((dep) => (
                        <button
                          key={dep.name}
                          onClick={() => handleDependencyClick(dep.name)}
                          className="block w-full text-left px-2 py-1 rounded text-sm font-mono hover:bg-muted transition-colors"
                        >
                          {dep.name}
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No copybooks used</p>
                    )}
                  </div>
                </div>

                {/* Incoming Calls */}
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Called By ({dependencies.calledBy.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {dependencies.calledBy.length > 0 ? (
                      dependencies.calledBy.map((dep) => (
                        <button
                          key={dep.name}
                          onClick={() => handleDependencyClick(dep.name)}
                          className="block w-full text-left px-2 py-1 rounded text-sm font-mono hover:bg-muted transition-colors"
                        >
                          {dep.name}
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Entry point</p>
                    )}
                  </div>
                </div>

                {/* Incoming Copies */}
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Used By ({dependencies.usedBy.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {dependencies.usedBy.length > 0 ? (
                      dependencies.usedBy.map((dep) => (
                        <button
                          key={dep.name}
                          onClick={() => handleDependencyClick(dep.name)}
                          className="block w-full text-left px-2 py-1 rounded text-sm font-mono hover:bg-muted transition-colors"
                        >
                          {dep.name}
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Not used as copybook</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Select a file to view its dependencies
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      </motion.div>
      
      {/* Ready to Explore - Common across all tabs */}
      <div className="p-6 pt-0">
        <ReadyToExplore />
      </div>
    </div>
  );
}

export default CodeViewerTab;
