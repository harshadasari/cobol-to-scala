import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Github, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RepositoryInputProps {
  onBack: () => void;
  onConfirm: (repoUrl: string, branch: string) => void;
  onTrySample: () => void;
}

type DetectedProvider = "github" | "gitlab" | "bitbucket" | null;

const GitLabIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
  </svg>
);

const BitbucketIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
    <path d="M.778 1.211a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z"/>
  </svg>
);

const detectProvider = (url: string): DetectedProvider => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("github.com")) return "github";
  if (lowerUrl.includes("gitlab.com") || lowerUrl.includes("gitlab.")) return "gitlab";
  if (lowerUrl.includes("bitbucket.org")) return "bitbucket";
  return null;
};

const isValidRepoUrl = (url: string): boolean => {
  if (!url.trim()) return false;
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    return pathParts.length >= 2; // needs at least org/repo
  } catch {
    return false;
  }
};

const ProviderIcon = ({ provider }: { provider: DetectedProvider }) => {
  if (!provider) return null;
  
  const icons = {
    github: <Github className="h-5 w-5" />,
    gitlab: <GitLabIcon />,
    bitbucket: <BitbucketIcon />,
  };

  const colors = {
    github: "text-foreground",
    gitlab: "text-orange-400",
    bitbucket: "text-blue-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`${colors[provider]}`}
    >
      {icons[provider]}
    </motion.div>
  );
};

const RepositoryInput = ({ onBack, onConfirm, onTrySample }: RepositoryInputProps) => {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");

  const detectedProvider = useMemo(() => detectProvider(repoUrl), [repoUrl]);
  const isValid = useMemo(() => isValidRepoUrl(repoUrl), [repoUrl]);

  const handleSubmit = () => {
    if (isValid) {
      onConfirm(repoUrl, branch || "main");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">
          Connect a repository for analysis
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Paste the URL of your repository. We analyze COBOL code in read-only mode to understand structure, logic, and dependencies.
        </p>
      </div>

      {/* Input section */}
      <div className="max-w-xl mx-auto space-y-6">
        {/* Repository URL input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Repository URL
          </label>
          <div className="relative">
            <Input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/your-org/your-repo"
              className="h-12 pl-4 pr-12 bg-secondary/30 border-border/50 focus:border-primary/50 text-base"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <AnimatePresence mode="wait">
                {detectedProvider && (
                  <ProviderIcon provider={detectedProvider} />
                )}
              </AnimatePresence>
            </div>
          </div>
          {repoUrl && !isValid && (
            <p className="text-sm text-muted-foreground">
              Enter a valid repository URL (e.g., https://github.com/org/repo)
            </p>
          )}
        </div>

        {/* Branch input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Branch <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            className="h-12 bg-secondary/30 border-border/50 focus:border-primary/50"
          />
          <p className="text-sm text-muted-foreground">
            Leave empty to use the repository's default branch.
          </p>
        </div>

        {/* Primary action */}
        <Button
          onClick={handleSubmit}
          disabled={!isValid}
          className="w-full h-12 text-base font-medium"
          variant="hero"
        >
          Start analysis
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>

        {/* Secondary option */}
        <div className="text-center pt-2">
          <button
            onClick={onTrySample}
            className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2"
          >
            <FlaskConical className="h-4 w-4" />
            Prefer not to connect a repository? Try a sample COBOL system
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default RepositoryInput;
