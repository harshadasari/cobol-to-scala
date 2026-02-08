import { FileText, GitBranch, Search, Layers } from "lucide-react";

const artifacts = [
  {
    icon: FileText,
    title: "Functional Specification",
    description: "Complete business logic documentation that non-technical stakeholders can review and approve.",
  },
  {
    icon: Layers,
    title: "Technical Design Document",
    description: "Architecture decisions, patterns, and implementation strategy fully documented.",
  },
  {
    icon: GitBranch,
    title: "Pseudocode & IR",
    description: "Language-neutral intermediate representation for validation before final conversion.",
  },
  {
    icon: Search,
    title: "Traceability Links",
    description: "Complete mapping from COBOL → pseudocode → target language. Audit-ready.",
  },
];

const ArtifactsSection = () => {
  return (
    <section id="platform" className="section-viewport-auto bg-secondary/30">
      <div className="w-full mx-auto px-6 md:px-12 lg:px-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Complete artifacts at every stage
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Nothing is black-boxed. Every decision is documented and traceable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {artifacts.map((artifact, index) => {
              const Icon = artifact.icon;
              return (
                <div
                  key={index}
                  className="glass-card p-8 rounded-2xl group hover:border-primary/30 transition-all duration-300 animate-fade-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-xl mb-2">{artifact.title}</h3>
                  <p className="text-muted-foreground">{artifact.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ArtifactsSection;
