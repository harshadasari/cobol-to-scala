import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, FolderArchive, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InputSelectionProps {
  onSelectRepo: () => void;
  onSelectUpload: () => void;
}

const InputSelection = ({ onSelectRepo, onSelectUpload }: InputSelectionProps) => {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {/* Back to home link */}
      <Link 
        to="/" 
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to home
      </Link>

      {/* Title Section */}
      <div className="text-center mb-12">
        <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
          Select a code source for analysis
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          We analyze your COBOL code in read-only mode to understand structure, logic, and dependencies.
        </p>
      </div>

      {/* Input Method Cards */}
      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {/* Connect Repository Card - Primary */}
        <motion.div
          className={`relative group cursor-pointer rounded-xl border-2 p-6 transition-all duration-300 ${
            hoveredCard === "repo"
              ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
              : "border-border/50 bg-card hover:border-primary/30"
          }`}
          onMouseEnter={() => setHoveredCard("repo")}
          onMouseLeave={() => setHoveredCard(null)}
          onClick={onSelectRepo}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Primary badge */}
          <div className="absolute -top-3 left-4">
            <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
              Recommended
            </span>
          </div>

          <div className="mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <GitBranch className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              Connect a repository
            </h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground mb-4">
              <li>GitHub, GitLab, Bitbucket</li>
              <li>Read-only access</li>
              <li>Best for large systems</li>
            </ul>
          </div>

          <Button 
            variant="hero" 
            className="w-full group/btn"
          >
            Connect repository
            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
          </Button>

          {/* Hover guidance */}
          <AnimatePresence>
            {hoveredCard === "repo" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    After connecting:
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      We scan programs and copybooks
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      Build a dependency map
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      Generate a system overview
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Upload Codebase Card - Secondary */}
        <motion.div
          className={`relative group cursor-pointer rounded-xl border-2 p-6 transition-all duration-300 ${
            hoveredCard === "upload"
              ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
              : "border-border/50 bg-card hover:border-primary/30"
          }`}
          onMouseEnter={() => setHoveredCard("upload")}
          onMouseLeave={() => setHoveredCard(null)}
          onClick={onSelectUpload}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="mb-4">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
              <FolderArchive className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              Upload codebase
            </h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground mb-4">
              <li>ZIP or folder</li>
              <li>COBOL programs, copybooks, JCL</li>
              <li>Ideal for offline or legacy exports</li>
            </ul>
          </div>

          <Button 
            variant="outline" 
            className="w-full group/btn"
          >
            Upload files
            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
          </Button>

          {/* Hover guidance */}
          <AnimatePresence>
            {hoveredCard === "upload" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    After uploading:
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      Files are securely stored
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      We parse and categorize code
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary" />
                      Analysis begins automatically
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default InputSelection;
