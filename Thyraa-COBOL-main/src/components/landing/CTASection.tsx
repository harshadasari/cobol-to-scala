import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Calendar } from "lucide-react";

const CTASection = () => {
  return (
    <section className="section-viewport-auto relative">
      <div className="w-full mx-auto px-6 md:px-12 lg:px-16">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
            Ready to modernize with confidence?
          </h2>
          <p className="text-muted-foreground text-lg mb-10">
            Start with a sample program or book a technical walkthrough. 
            No commitment required.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="hero" size="xl">
              Try with Sample Repo
              <Play className="w-5 h-5" />
            </Button>
            <Button variant="heroOutline" size="xl">
              Book a Walkthrough
              <Calendar className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
