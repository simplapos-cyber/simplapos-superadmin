import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BellRing, CheckCircle2, AlertTriangle, Info, RefreshCw, ShieldAlert, Clock
} from "lucide-react";

interface AlertRecord {
  id: number;
  title: string;
  message: string;
  severity: string;
  triggeredAt: number;
  isResolved: boolean;
  resolvedAt: number | null;
  resolvedBy: number | null;
  createdAt: number;
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; borderClass: string }> = {
  critical: { label: "Kritisch", color: "text-red-500", icon: <ShieldAlert className="h-4 w-4 text-red-500" />, borderClass: "border-l-red-500" },
  warning:  { label: "Warnung",  color: "text-amber-500", icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, borderClass: "border-l-amber-500" },
  info:     { label: "Info",     color: "text-blue-500", icon: <Info className="h-4 w-4 text-blue-500" />, borderClass: "border-l-blue-500" },
};

export default function SmartBuildingAlerts() {
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "info">("all");

  const allAlerts = trpc.tuya.getAllAlerts.useQuery({
    resolved: filter === "all" ? undefined : filter === "resolved",
  });

  const resolveAlert = trpc.tuya.resolveAlert.useMutation({
    onSuccess: () => { allAlerts.refetch(); toast.success("Alarm als erledigt markiert"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const filtered = (allAlerts.data as AlertRecord[] | undefined)?.filter((a: AlertRecord) =>
    severityFilter === "all" || a.severity === severityFilter
  ) ?? [];

  const openCount = (allAlerts.data as AlertRecord[] | undefined)?.filter((a: AlertRecord) => !a.isResolved).length ?? 0;
  const criticalCount = (allAlerts.data as AlertRecord[] | undefined)?.filter((a: AlertRecord) => !a.isResolved && a.severity === "critical").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-6 w-6 text-amber-500" />
            Alarme & Meldungen
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Alle Alarme und Systembenachrichtigungen der IoT-Geräte
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => allAlerts.refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{allAlerts.data?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground">Alarme total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-amber-500">{openCount}</div>
            <div className="text-xs text-muted-foreground">Offen</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-red-500">{criticalCount}</div>
            <div className="text-xs text-muted-foreground">Kritisch offen</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-500">
              {(allAlerts.data?.length ?? 0) - openCount}
            </div>
            <div className="text-xs text-muted-foreground">Erledigt</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["all", "open", "resolved"] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Alle" : f === "open" ? "Offen" : "Erledigt"}
            </Button>
          ))}
        </div>
        <Select value={severityFilter} onValueChange={v => setSeverityFilter(v as typeof severityFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Schweregrade</SelectItem>
            <SelectItem value="critical">Kritisch</SelectItem>
            <SelectItem value="warning">Warnung</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alarmliste */}
      {allAlerts.isLoading && (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
        </div>
      )}

      {!allAlerts.isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-medium">Keine Alarme gefunden</p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === "open" ? "Alle Alarme sind erledigt." : "Noch keine Alarme vorhanden."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((alert: AlertRecord) => {
          const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
          return (
            <Card key={alert.id} className={`border-l-4 ${cfg.borderClass} ${alert.isResolved ? "opacity-60" : ""}`}>
              <CardContent className="py-4 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">{cfg.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{alert.title}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${cfg.color} border-current/30`}
                        >
                          {cfg.label}
                        </Badge>
                        {alert.isResolved && (
                          <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />Erledigt
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(alert.triggeredAt).toLocaleString("de-CH")}
                        </span>
                        {alert.isResolved && alert.resolvedAt && (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Erledigt: {new Date(alert.resolvedAt).toLocaleString("de-CH")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!alert.isResolved && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => resolveAlert.mutate({ alertId: alert.id })}
                      disabled={resolveAlert.isPending}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Erledigt
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
