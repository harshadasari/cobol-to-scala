import { Bot, Cpu, FileSearch, Shield, RefreshCcw } from "lucide-react";

const agents = [
  { icon: FileSearch, name: "Analysis Agent", role: "Understands code structure" },
  { icon: Bot, name: "Documentation Agent", role: "Generates specifications" },
  { icon: Shield, name: "Validation Agent", role: "Ensures correctness" },
  { icon: RefreshCcw, name: "Conversion Agent", role: "Produces target code" },
];

const AgenticSection = () => {
  return (
    <section className="section-viewport-auto relative overflow-hidden">
      <div className="w-full mx-auto px-6 md:px-12 lg:px-16">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-6">
                <Cpu className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">Agentic Architecture</span>
              </div>
              
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
                Specialized AI agents with{" "}
                <span className="text-gradient">clear responsibilities</span>
              </h2>
              
              <p className="text-muted-foreground text-lg mb-6">
                Not autonomous black boxes. Each agent has a specific role, deterministic parsers 
                ensure correctness, and you can inspect every decision.
              </p>

              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  AI assists, doesn't replace correctness logic
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Deterministic parsers + rules still exist
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Every step is inspectable and overridable
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {agents.map((agent, index) => {
                const Icon = agent.icon;
                return (
                  <div
                    key={index}
                    className="glass-card p-6 rounded-2xl text-center hover:border-primary/30 transition-all duration-300 animate-fade-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="font-display font-semibold mb-1">{agent.name}</h3>
                    <p className="text-sm text-muted-foreground">{agent.role}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AgenticSection;
