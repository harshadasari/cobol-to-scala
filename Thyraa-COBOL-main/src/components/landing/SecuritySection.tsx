import { Shield, Server, Lock, Eye } from "lucide-react";

const securityFeatures = [
  {
    icon: Server,
    title: "Your Infrastructure",
    description: "Deploy on your cloud, on-prem, or air-gapped environments.",
  },
  {
    icon: Lock,
    title: "Open-Source Models",
    description: "Support for LLaMA, Mistral, and other self-hosted models.",
  },
  {
    icon: Eye,
    title: "No Training on Your Data",
    description: "Your code is never used to train any model. Full data isolation.",
  },
];

const SecuritySection = () => {
  return (
    <section id="security" className="section-viewport-auto relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-primary/5 blur-[100px]" />

      <div className="w-full mx-auto px-6 md:px-12 lg:px-16 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">Enterprise Security</span>
            </div>
            
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Built for regulated environments
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Your code stays yours. Deploy where you need, with the models you trust.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {securityFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="glass-card p-8 rounded-2xl text-center animate-fade-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SecuritySection;
