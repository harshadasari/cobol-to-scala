import { Database, FileText, Cog, Binary, Code2, CheckCircle2 } from "lucide-react";

const pipelineSteps = [
  {
    icon: Database,
    title: "Legacy Code",
    description: "Connect your COBOL repository",
  },
  {
    icon: FileText,
    title: "System Understanding",
    description: "AI analyzes structure & dependencies",
  },
  {
    icon: FileText,
    title: "Functional Documentation",
    description: "Business logic documented clearly",
  },
  {
    icon: Cog,
    title: "Technical Design",
    description: "Architecture & patterns defined",
  },
  {
    icon: Binary,
    title: "Pseudocode / IR",
    description: "Language-neutral representation",
  },
  {
    icon: Code2,
    title: "Target Code",
    description: "Clean, maintainable output",
  },
];

const PipelineSection = () => {
  return (
    <section id="how-it-works" className="section-viewport-auto relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[100px]" />

      <div className="w-full mx-auto px-6 md:px-12 lg:px-16 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              We don't convert code.
              <br />
              <span className="text-gradient">We convert understanding.</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Every step produces reviewable artifacts. Stop after docs, regenerate code 
              without re-analyzing—you're in control.
            </p>
          </div>

          {/* Pipeline visualization */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-8 md:left-1/2 md:-translate-x-px top-0 bottom-0 w-0.5 pipeline-line hidden md:block" />

            <div className="space-y-6 md:space-y-0">
              {pipelineSteps.map((step, index) => {
                const Icon = step.icon;
                const isEven = index % 2 === 0;

                return (
                  <div
                    key={index}
                    className={`relative flex items-center gap-6 md:gap-0 ${
                      isEven ? "md:flex-row" : "md:flex-row-reverse"
                    }`}
                  >
                    {/* Content card */}
                    <div className={`flex-1 ${isEven ? "md:pr-12 md:text-right" : "md:pl-12 md:text-left"}`}>
                      <div
                        className={`glass-card p-6 rounded-2xl inline-block ${
                          isEven ? "md:ml-auto" : "md:mr-auto"
                        } animate-fade-up`}
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className={`flex items-center gap-3 mb-2 ${isEven ? "md:flex-row-reverse" : ""}`}>
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <h3 className="font-display font-semibold text-lg">{step.title}</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">{step.description}</p>
                      </div>
                    </div>

                    {/* Center dot */}
                    <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-background border-2 border-primary items-center justify-center z-10">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>

                    {/* Empty space for alternating layout */}
                    <div className="hidden md:block flex-1" />
                  </div>
                );
              })}
            </div>

            {/* Final checkmark */}
            <div className="hidden md:flex justify-center mt-8">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center glow-effect">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PipelineSection;
