import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Code, Shield } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="section-viewport relative pt-16 overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/10 blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="w-full mx-auto px-6 md:px-12 lg:px-16 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary border border-border mb-8 animate-fade-up">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-muted-foreground">Enterprise-Grade COBOL Modernization</span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-up animation-delay-100">
            Modernize COBOL with{" "}
            <span className="text-gradient">confidence</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-fade-up animation-delay-200">
            Documentation, design, and pseudocode before a single line of code is generated. 
            Human-reviewable at every step.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-up animation-delay-300">
            <Button variant="hero" size="xl">
              See How It Works
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="heroOutline" size="xl">
              Try with Sample Repo
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground animate-fade-up animation-delay-400">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span>Complete Documentation</span>
            </div>
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-primary" />
              <span>Traceable Conversion</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>Audit-Ready Output</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
