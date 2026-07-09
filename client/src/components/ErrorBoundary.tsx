import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Optional name for this boundary (helps identify which section crashed) */
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  errorCount: number;
}

/** Generate a short unique error ID for tracking */
function generateErrorId(): string {
  return `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorId: generateErrorId() };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorId = this.state.errorId || generateErrorId();
    const errorLog = {
      errorId,
      boundary: this.props.name || "unknown",
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
      componentStack: errorInfo.componentStack?.split("\n").slice(0, 5).join("\n"),
      route: typeof window !== "undefined" ? window.location.pathname : "unknown",
      browser: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      timestamp: new Date().toISOString(),
      memoryUsage: (performance as any)?.memory?.usedJSHeapSize
        ? `${Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)}MB`
        : "N/A",
    };

    // Log to console for debugging
    console.error(`[ErrorBoundary:${errorLog.boundary}] ${errorId}`, errorLog);

    // Store in sessionStorage for admin debug panel access
    try {
      const existingLogs = JSON.parse(sessionStorage.getItem("__error_log") || "[]");
      existingLogs.push(errorLog);
      // Keep only last 10 errors to prevent storage bloat
      if (existingLogs.length > 10) existingLogs.shift();
      sessionStorage.setItem("__error_log", JSON.stringify(existingLogs));
    } catch {
      // sessionStorage might be full or unavailable
    }
  }

  handleReset = () => {
    this.setState(prev => ({
      hasError: false,
      error: null,
      errorId: null,
      errorCount: prev.errorCount + 1,
    }));
  };

  handleGoHome = () => {
    // Use soft navigation instead of hard reload to prevent crash loops
    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    // Reset error state after navigation
    this.setState({ hasError: false, error: null, errorId: null, errorCount: 0 });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // If error keeps repeating (>5 times), show minimal fallback to prevent memory issues
      if (this.state.errorCount > 5) {
        return (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Dieser Bereich ist vorübergehend nicht verfügbar.
            </p>
            <button
              onClick={this.handleGoHome}
              className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg"
            >
              Zur Startseite
            </button>
          </div>
        );
      }

      return (
        <div className="flex items-center justify-center min-h-[300px] p-6">
          <div className="flex flex-col items-center w-full max-w-md p-6 rounded-lg border bg-card text-card-foreground">
            <AlertTriangle
              size={36}
              className="text-destructive mb-3 flex-shrink-0"
            />

            <h2 className="text-base font-semibold mb-1">
              Dieser Bereich konnte nicht geladen werden
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
            </p>

            {this.state.errorId && (
              <p className="text-xs text-muted-foreground/60 mb-3 font-mono">
                Fehler-ID: {this.state.errorId}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer transition-opacity",
                  "active:scale-[0.97] transition-transform duration-150"
                )}
              >
                <RotateCcw size={14} />
                Erneut versuchen
              </button>
              <button
                onClick={this.handleGoHome}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
                  "border border-border bg-background text-foreground",
                  "hover:bg-accent cursor-pointer transition-colors",
                  "active:scale-[0.97] transition-transform duration-150"
                )}
              >
                <Home size={14} />
                Startseite
              </button>
            </div>

            {this.state.errorCount > 2 && (
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Der Fehler tritt wiederholt auf. Versuchen Sie, die Seite zu wechseln.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
