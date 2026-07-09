/**
 * SSEStatusBadge – Zeigt den aktuellen SSE-Verbindungsstatus an.
 *
 * Grün  = verbunden
 * Gelb  = Verbindung wird wiederhergestellt
 * Rot   = getrennt
 */
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SSEConnectionStatus } from "@/hooks/useSSE";

interface SSEStatusBadgeProps {
  status: SSEConnectionStatus;
  retryCount?: number;
  /** Optionaler Label-Text neben dem Icon (default: keiner) */
  showLabel?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<
  SSEConnectionStatus,
  { icon: React.ReactNode; label: string; tooltip: string; color: string }
> = {
  connected: {
    icon: <Wifi className="h-3.5 w-3.5" />,
    label: "Echtzeit",
    tooltip: "Echtzeit-Verbindung aktiv",
    color: "text-green-600",
  },
  reconnecting: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    label: "Verbinde…",
    tooltip: "Verbindung wird hergestellt…",
    color: "text-yellow-600",
  },
  disconnected: {
    icon: <WifiOff className="h-3.5 w-3.5" />,
    label: "Getrennt",
    tooltip: "Keine Echtzeit-Verbindung – Daten werden alle 30s aktualisiert",
    color: "text-red-500",
  },
};

export function SSEStatusBadge({
  status,
  retryCount = 0,
  showLabel = true,
  className = "",
}: SSEStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  const tooltipText =
    status === "disconnected" && retryCount > 0
      ? `${cfg.tooltip} (Versuch ${retryCount})`
      : cfg.tooltip;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium select-none cursor-default ${cfg.color} ${className}`}
          >
            {cfg.icon}
            {showLabel && <span>{cfg.label}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
