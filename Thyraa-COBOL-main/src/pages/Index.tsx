import Header from "@/components/landing/Header";
import HeroSection from "@/components/landing/HeroSection";
import PainSection from "@/components/landing/PainSection";
import PipelineSection from "@/components/landing/PipelineSection";
import ArtifactsSection from "@/components/landing/ArtifactsSection";
import AgenticSection from "@/components/landing/AgenticSection";
import WorkflowSection from "@/components/landing/WorkflowSection";
import SecuritySection from "@/components/landing/SecuritySection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <PainSection />
        <PipelineSection />
        <ArtifactsSection />
        <AgenticSection />
        <WorkflowSection />
        <SecuritySection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
