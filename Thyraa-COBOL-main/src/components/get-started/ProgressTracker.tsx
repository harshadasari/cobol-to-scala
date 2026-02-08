import { motion } from "framer-motion";

const phases = [
  { label: "Connect", key: "connect" },
  { label: "Analyze", key: "analyze" },
  { label: "Generate", key: "generate" },
  { label: "Review", key: "review" },
];

interface ProgressTrackerProps {
  currentPhase?: string;
  currentStep?: string;
}

const ProgressTracker = ({ currentPhase = "analyze", currentStep }: ProgressTrackerProps) => {
  const activeIndex = phases.findIndex(p => p.key === currentPhase);

  return (
    <div className="mb-12">
      {/* Step indicator */}
      {currentStep && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-muted-foreground mb-4"
        >
          <span className="text-primary font-medium">Phase 1</span>
          <span className="mx-2">·</span>
          <span>{currentStep}</span>
        </motion.p>
      )}

      {/* Phase bar */}
      <div className="flex items-center justify-center gap-2 md:gap-4">
        {phases.map((phase, index) => (
          <div key={phase.key} className="flex items-center">
            <div 
              className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-all ${
                index <= activeIndex 
                  ? "bg-primary/20 text-primary border border-primary/30" 
                  : "bg-secondary/50 text-muted-foreground/50"
              }`}
            >
              {phase.label}
            </div>
            {index < phases.length - 1 && (
              <div className={`w-6 md:w-10 h-px mx-1 md:mx-2 ${
                index < activeIndex ? "bg-primary/50" : "bg-border/50"
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProgressTracker;
