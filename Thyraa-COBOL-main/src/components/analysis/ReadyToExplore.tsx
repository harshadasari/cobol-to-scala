import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAnalysis } from "@/contexts/AnalysisContext";

/**
 * Ready to Explore section
 * Displays action button to proceed to next step
 * This component appears at the bottom of all analysis tabs
 */
export function ReadyToExplore() {
  const { setActiveTab } = useAnalysis();

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 mb-6">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-semibold text-lg">Ready to explore?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              View the interactive dependency graph or dive into the code
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setActiveTab('code-viewer')}>
              Proceed to Next Step
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ReadyToExplore;

