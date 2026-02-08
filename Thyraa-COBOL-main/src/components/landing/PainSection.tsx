import { motion } from "framer-motion";

const painPoints = [
  "Generated code nobody trusts",
  "Zero documentation after conversion",
  "Business logic lost in translation",
  "Auditors ask 'how do you know this is equivalent?'",
  "Modernization stalled because risk is too high",
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
};

const item = {
  hidden: { opacity: 0, x: -30, filter: "blur(10px)" },
  show: { 
    opacity: 1, 
    x: 0, 
    filter: "blur(0px)",
    transition: {
      type: "spring" as const,
      damping: 20,
      stiffness: 100,
    },
  },
};

const PainSection = () => {
  return (
    <section className="section-viewport-auto relative overflow-hidden">
      {/* Subtle ambient glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full mx-auto px-6 md:px-12 lg:px-16">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <span className="inline-block px-3 py-1 text-xs font-medium uppercase tracking-wider text-amber-700 bg-amber-100 rounded-full border border-amber-300 mb-6">
              We've been there
            </span>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Sound familiar?
            </h2>
            <p className="text-muted-foreground text-lg">
              Traditional COBOL converters create more problems than they solve.
            </p>
          </motion.div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
            className="space-y-4"
          >
            {painPoints.map((pain, index) => (
              <motion.div
                key={index}
                variants={item}
                whileHover={{ 
                  x: 8,
                  transition: { type: "spring", stiffness: 400, damping: 25 }
                }}
                className="group relative flex items-center gap-5 p-5 rounded-2xl bg-white/80 border border-border hover:border-amber-500/50 hover:bg-slate-50 shadow-sm transition-all duration-300 cursor-default"
              >
                {/* Animated line indicator */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 group-hover:h-8 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full transition-all duration-300" />
                
                {/* Glowing dot */}
                <div className="relative">
                  <span className="block w-2.5 h-2.5 rounded-full bg-amber-500/60 group-hover:bg-amber-400 transition-colors duration-300" />
                  <span className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping opacity-0 group-hover:opacity-30" />
                </div>
                
                <span className="text-slate-700 text-lg group-hover:text-slate-900 transition-colors duration-300">
                  {pain}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PainSection;
