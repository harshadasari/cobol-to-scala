const Footer = () => {
  return (
    <footer className="py-12 border-t border-border">
      <div className="w-full mx-auto px-6 md:px-12 lg:px-16">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[hsl(190,80%,45%)] flex items-center justify-center">
              <span className="font-display font-bold text-primary-foreground text-sm">M</span>
            </div>
            <span className="font-display font-semibold">ModernizeAI</span>
          </div>

          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Documentation</a>
            <a href="#" className="hover:text-foreground transition-colors">Security</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </nav>

          <p className="text-sm text-muted-foreground">
            © 2026 ModernizeAI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
