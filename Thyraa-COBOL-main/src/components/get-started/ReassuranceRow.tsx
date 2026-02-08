import { Eye, Clock, Shield } from "lucide-react";

const ReassuranceRow = () => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 mb-8 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-primary/70" />
        <span>Read-only access</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary/70" />
        <span>No code conversion yet</span>
      </div>
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary/70" />
        <span>You stay in control</span>
      </div>
    </div>
  );
};

export default ReassuranceRow;
