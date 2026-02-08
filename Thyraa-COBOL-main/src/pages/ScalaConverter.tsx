import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Code2, Download, Copy, Upload, FileCode, Play, Settings2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  convertToScala,
  ConversionOptions,
  ConversionResult,
  SAMPLE_COBOL,
} from "@/lib/conversion-api";

type ConversionStatus = "idle" | "converting" | "success" | "error";

const ScalaConverter = () => {
  const [cobolInput, setCobolInput] = useState("");
  const [scalaOutput, setScalaOutput] = useState("");
  const [suggestedFileName, setSuggestedFileName] = useState("Output.scala");
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // Conversion options
  const [packageName, setPackageName] = useState("com.example.cobol");
  const [generateMain, setGenerateMain] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);

  const handleConvert = useCallback(async () => {
    if (!cobolInput.trim()) {
      toast.error("Please enter COBOL code to convert");
      return;
    }

    setStatus("converting");
    setError(null);

    try {
      const options: ConversionOptions = {
        packageName,
        generateMain,
        includeComments,
      };

      const result: ConversionResult = await convertToScala(cobolInput, options);
      setScalaOutput(result.scala);
      setSuggestedFileName(result.suggestedFileName || "Output.scala");
      setStatus("success");
      toast.success("Conversion complete!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversion failed";
      setError(message);
      setStatus("error");
      toast.error(message);
    }
  }, [cobolInput, packageName, generateMain, includeComments]);

  const handleLoadSample = useCallback(() => {
    setCobolInput(SAMPLE_COBOL);
    setScalaOutput("");
    setStatus("idle");
    toast.success("Sample COBOL loaded");
  }, []);

  const handleClear = useCallback(() => {
    setCobolInput("");
    setScalaOutput("");
    setStatus("idle");
    setError(null);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(scalaOutput);
    toast.success("Copied to clipboard");
  }, [scalaOutput]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([scalaOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${suggestedFileName}`);
  }, [scalaOutput, suggestedFileName]);

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setCobolInput(content);
          setScalaOutput("");
          setStatus("idle");
          toast.success(`Loaded ${file.name}`);
        };
        reader.readAsText(file);
      }
    },
    []
  );

  return (
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
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="hidden md:flex gap-1.5 items-center">
              <Code2 className="h-3 w-3" />
              COBOL to Scala
            </Badge>
          </div>
        </div>
      </header>

      <main className="w-full mx-auto px-6 md:px-12 lg:px-16 py-8">
        {/* Title and Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Convert COBOL to Scala</h1>
            <p className="text-muted-foreground">
              Transform your COBOL code into idiomatic Scala 3
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleLoadSample}>
              <FileCode className="h-4 w-4 mr-2" />
              Load Sample
            </Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </span>
              </Button>
              <input
                type="file"
                accept=".cbl,.cob,.cpy,.cobol"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Options Panel */}
        <Collapsible open={showOptions} onOpenChange={setShowOptions} className="mb-6">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <Settings2 className="h-4 w-4" />
              Conversion Options
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showOptions ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2">
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="packageName">Package Name</Label>
                    <Input
                      id="packageName"
                      value={packageName}
                      onChange={(e) => setPackageName(e.target.value)}
                      placeholder="com.example.cobol"
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="generateMain"
                      checked={generateMain}
                      onCheckedChange={setGenerateMain}
                    />
                    <Label htmlFor="generateMain">Generate main method</Label>
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="includeComments"
                      checked={includeComments}
                      onCheckedChange={setIncludeComments}
                    />
                    <Label htmlFor="includeComments">Include comments</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Editor Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* COBOL Input */}
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="flex-shrink-0 py-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  COBOL Input
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <textarea
                value={cobolInput}
                onChange={(e) => setCobolInput(e.target.value)}
                placeholder="Paste your COBOL code here..."
                className="w-full h-full p-4 font-mono text-sm bg-muted/30 border-0 resize-none focus:outline-none focus:ring-0"
                spellCheck={false}
              />
            </CardContent>
          </Card>

          {/* Scala Output */}
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="flex-shrink-0 py-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Scala Output
                  {status === "success" && (
                    <Badge variant="secondary" className="ml-2">
                      {suggestedFileName}
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!scalaOutput}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!scalaOutput}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <textarea
                value={scalaOutput}
                readOnly
                placeholder={
                  status === "converting"
                    ? "Converting..."
                    : status === "error"
                    ? `Error: ${error}`
                    : "Scala output will appear here..."
                }
                className={`w-full h-full p-4 font-mono text-sm bg-muted/30 border-0 resize-none focus:outline-none focus:ring-0 ${
                  status === "error" ? "text-destructive" : ""
                }`}
                spellCheck={false}
              />
            </CardContent>
          </Card>
        </div>

        {/* Convert Button */}
        <div className="flex justify-center mt-6">
          <Button
            size="lg"
            onClick={handleConvert}
            disabled={status === "converting" || !cobolInput.trim()}
            className="min-w-[200px]"
          >
            <Play className="h-4 w-4 mr-2" />
            {status === "converting" ? "Converting..." : "Convert to Scala"}
          </Button>
        </div>

        {/* Status */}
        {status === "success" && (
          <div className="text-center mt-4 text-sm text-muted-foreground">
            Conversion successful! Use the copy or download buttons above.
          </div>
        )}
      </main>
    </div>
  );
};

export default ScalaConverter;
