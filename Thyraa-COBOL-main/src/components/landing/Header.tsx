import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="w-full mx-auto flex h-16 items-center justify-between px-6 md:px-12 lg:px-16">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[hsl(190,80%,45%)] flex items-center justify-center">
            <span className="font-display font-bold text-primary-foreground text-sm">M</span>
          </div>
          <span className="font-display font-semibold text-lg">ModernizeAI</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            How It Works
          </a>
          <a href="#platform" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Platform
          </a>
          <a href="#security" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Security
          </a>
          <Link to="/convert" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Convert to Scala
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
            Documentation
          </Button>
          <Link to="/get-started">
            <Button variant="hero" size="sm">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
