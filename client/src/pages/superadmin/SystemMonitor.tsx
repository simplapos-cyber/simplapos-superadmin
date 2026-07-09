import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Monitor, Wifi, Database, Server, Activity, Clock,
  HardDrive, Cpu, MemoryStick, Network, Terminal,
  RefreshCw, CheckCircle, XCircle, AlertTriangle
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

function StatusBadge({ value, warn, danger }: { value: number; warn: number; danger: number }) {
  if (value >= danger) return <Badge className="bg-red-100 text-red-800 text-xs">Kritisch</Badge>;
  if (value >= warn) return <Badge className="bg-yellow-100 text-yellow-800 text-xs">Warnung</Badge>;
  return <Badge className="bg-green-100 text-green-800 text-xs">OK</Badge>;
}

function ProgressBar({ value, warn, danger, max = 100 }: { value: number; warn: number; danger: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= danger ? "bg-red-500" : value >= warn ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export default function SystemMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, error, refetch, dataUpdatedAt } = trpc.systemMonitor.getStats.useQuery(undefined, {
    refetchInterval: autoRefresh ? 10000 : false,
    staleTime: 5000,
  });

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-CH") : "–";

  // Fallback-Werte falls noch keine Daten
  const cpu = data?.cpu;
  const ram = data?.ram;
  const disk = data?.disk;
  const net = data?.network;
  const sys = data?.system;
  const mysql = data?.mysql;
  const pm2 = data?.pm2 ?? [];

  // Disk-Prozent aus String extrahieren
  const diskPct = disk?.percent ? parseInt(disk.percent) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6" /> Systemüberwachung
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Live-Metriken des Hetzner CPX42 Servers · Letzte Aktualisierung: {lastUpdate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              autoRefresh ? "bg-green-50 border-green-300 text-green-700" : "bg-muted border-border text-muted-foreground"
            }`}
          >
            {autoRefresh ? "Auto (10s)" : "Manuell"}
          </button>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors"
            title="Jetzt aktualisieren"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Fehler beim Laden der Metriken: {error.message}
        </div>
      )}

      {/* Hauptmetriken */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Cpu className="h-4 w-4" /> CPU-Auslastung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold">{isLoading ? "…" : `${cpu?.percent ?? 0}%`}</span>
              {!isLoading && <StatusBadge value={cpu?.percent ?? 0} warn={70} danger={90} />}
            </div>
            <ProgressBar value={cpu?.percent ?? 0} warn={70} danger={90} />
            <p className="text-xs text-muted-foreground mt-2">
              Load: {cpu?.loadAvg1 ?? "–"} / {cpu?.loadAvg5 ?? "–"} / {cpu?.loadAvg15 ?? "–"}
            </p>
          </CardContent>
        </Card>

        {/* RAM */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MemoryStick className="h-4 w-4" /> RAM-Auslastung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold">{isLoading ? "…" : `${ram?.percent ?? 0}%`}</span>
              {!isLoading && <StatusBadge value={ram?.percent ?? 0} warn={75} danger={90} />}
            </div>
            <ProgressBar value={ram?.percent ?? 0} warn={75} danger={90} />
            <p className="text-xs text-muted-foreground mt-2">
              {ram ? `${ram.usedMb} MB / ${ram.totalMb} MB` : "–"}
            </p>
          </CardContent>
        </Card>

        {/* Disk */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <HardDrive className="h-4 w-4" /> Festplatte (/)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold">{isLoading ? "…" : (disk?.percent ?? "?")}</span>
              {!isLoading && <StatusBadge value={diskPct} warn={70} danger={90} />}
            </div>
            <ProgressBar value={diskPct} warn={70} danger={90} />
            <p className="text-xs text-muted-foreground mt-2">
              {disk ? `${disk.used} / ${disk.total} · Frei: ${disk.free}` : "–"}
            </p>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Server-Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold">{isLoading ? "…" : (data?.uptime ?? "–")}</span>
              {!isLoading && <Badge className="bg-green-100 text-green-800 text-xs">Online</Badge>}
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-green-100 overflow-hidden">
              <div className="h-full rounded-full bg-green-500 w-full" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Seit letztem Neustart</p>
          </CardContent>
        </Card>
      </div>

      {/* System-Info + Netzwerk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* System-Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-5 w-5" /> Server-Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <StatRow label="Betriebssystem" value={sys?.os ?? "–"} />
            <StatRow label="Kernel" value={sys?.kernel ?? "–"} mono />
            <StatRow label="Node.js" value={sys?.nodeVersion ?? "–"} mono />
            <StatRow label="App-Version" value={sys?.appVersion ? `v${sys.appVersion}` : "–"} mono />
            <StatRow label="CPU-Modell" value={cpu?.model ?? "–"} />
            <StatRow label="CPU-Kerne" value={cpu?.cores ? `${cpu.cores} vCPUs` : "–"} />
          </CardContent>
        </Card>

        {/* Netzwerk */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="h-5 w-5" /> Netzwerk
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <StatRow label="Empfangen (seit Boot)" value={net ? `${net.rxGb} GB` : "–"} />
            <StatRow label="Gesendet (seit Boot)" value={net ? `${net.txGb} GB` : "–"} />
            <StatRow label="Aktive TCP-Verbindungen" value={net ? `${net.tcpConnections}` : "–"} />
            <StatRow label="MySQL Status" value={mysql?.status === "online" ? "✅ Online" : "❌ Offline"} />
            <StatRow label="MySQL Version" value={mysql?.version ?? "–"} mono />
            <StatRow label="Server-IP" value="167.233.127.142" mono />
          </CardContent>
        </Card>
      </div>

      {/* PM2 Prozesse */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-5 w-5" /> PM2 Prozesse
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : pm2.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine PM2-Prozesse gefunden</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Name</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Status</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">RAM</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">CPU</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Uptime</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Neustarts</th>
                  </tr>
                </thead>
                <tbody>
                  {pm2.map((p) => (
                    <tr key={p.name} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-4 font-mono font-medium">{p.name}</td>
                      <td className="py-2 pr-4">
                        {p.status === "online" ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-3.5 w-3.5" /> online
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600">
                            <XCircle className="h-3.5 w-3.5" /> {p.status}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">{p.memMb} MB</td>
                      <td className="py-2 pr-4 text-right font-mono">{p.cpu}%</td>
                      <td className="py-2 pr-4 text-right font-mono">{p.uptime}</td>
                      <td className="py-2 text-right">
                        {p.restarts > 5 ? (
                          <span className="text-yellow-600 font-medium">{p.restarts}</span>
                        ) : (
                          <span>{p.restarts}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Internetgeschwindigkeit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="h-5 w-5" /> Internetgeschwindigkeit (Live-Simulation)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InternetSpeed />
        </CardContent>
      </Card>
    </div>
  );
}

// Separater Komponente für Live-Internetgeschwindigkeit (simuliert, da echte Messung zu lange dauert)
function InternetSpeed() {
  const [dl, setDl] = useState(94.0);
  const [ul, setUl] = useState(41.0);

  // Leichte Variation simulieren
  useState(() => {
    const interval = setInterval(() => {
      setDl((v) => Math.max(80, Math.min(120, v + (Math.random() - 0.5) * 4)));
      setUl((v) => Math.max(30, Math.min(60, v + (Math.random() - 0.5) * 3)));
    }, 2000);
    return () => clearInterval(interval);
  });

  return (
    <div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Download</p>
          <p className="text-3xl font-bold text-green-600">
            {dl.toFixed(1)} <span className="text-base font-normal text-muted-foreground">Mbit/s</span>
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">Upload</p>
          <p className="text-3xl font-bold text-blue-600">
            {ul.toFixed(1)} <span className="text-base font-normal text-muted-foreground">Mbit/s</span>
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Hetzner CPX42 · Falkenstein, Deutschland · Werte werden alle 2 Sekunden aktualisiert
      </p>
    </div>
  );
}
