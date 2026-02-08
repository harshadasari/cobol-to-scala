import { GitBranch, Terminal, Users, FolderGit2 } from "lucide-react";

const features = [
  {
    icon: Terminal,
    title: "VS Code Integration",
    description: "Work in your familiar environment with full IDE support.",
  },
  {
    icon: FolderGit2,
    title: "Git-Native Workflow",
    description: "All artifacts version-controlled. Review diffs, not just output.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Multiple reviewers can approve documentation before conversion.",
  },
  {
    icon: GitBranch,
    title: "Incremental Migration",
    description: "Convert module by module, validate at each step.",
  },
];

const WorkflowSection = () => {
  return (
    <section className="section-viewport-auto bg-secondary/30">
      <div className="w-full mx-auto px-6 md:px-12 lg:px-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Fits into your existing workflow
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No new tools to learn. Works with your IDE, your Git repos, your team processes.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="text-center p-6 animate-fade-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkflowSection;
