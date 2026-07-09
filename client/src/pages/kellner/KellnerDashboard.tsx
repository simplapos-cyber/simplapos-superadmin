import { useState, useEffect, useRef, useCallback, memo } from "react";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useSSE } from "@/hooks/useSSE";
import { useSoundAlert } from "@/hooks/useSoundAlert";
import { SoundAlertToggle } from "@/components/SoundAlertToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, Minus,
  UtensilsCrossed, CreditCard, Users, Clock, Activity,
  Wifi, WifiOff, AlertTriangle, Download,
  ChevronRight, RefreshCw, CheckCircle2, Circle,
  BarChart2, Zap, Star, Calendar, Coffee,
  ArrowUpRight, ArrowDownRight, Banknote, Receipt, LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWaiterPin } from "@/contexts/WaiterPinContext";
import { WaiterPinOverlay } from "@/components/WaiterPinOverlay";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Typen ───────────────────────────────────────────────────────────────────
type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "offline";

interface NetworkMeasurement {
  timestamp: number;
  latency: number;
  success: boolean;
}
interface SpeedMeasurement {
  timestamp: number;
  downloadMbps: number;
  success: boolean;
}
interface NetworkState {
  isOnline: boolean;
  latency: number | null;
  avgLatency: number | null;
  jitter: number | null;
  packetLoss: number;
  downloadSpeed: number | null;
  quality: ConnectionQuality;
  lastMeasured: number | null;
  history: NetworkMeasurement[];
  speedHistory: SpeedMeasurement[];
}

// ─── Konstanten ──────────────────────────────────────────────────────────────
const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const PING_INTERVAL = isIOS ? 30000 : 15000;
const SPEED_TEST_INTERVAL = isIOS ? 180000 : 90000;
const HISTORY_LENGTH = isIOS ? 20 : 60;
const SPEED_HISTORY_LENGTH = isIOS ? 5 : 10;
const SPEED_TEST_SIZE_KB = isIOS ? 50 : 200;

const QUALITY_THRESHOLDS = {
  excellent: { maxLatency: 80, minSpeed: 5, maxPacketLoss: 0 },
  good: { maxLatency: 150, minSpeed: 2, maxPacketLoss: 2 },
  fair: { maxLatency: 300, minSpeed: 1, maxPacketLoss: 5 },
  poor: { maxLatency: Infinity, minSpeed: 0, maxPacketLoss: 100 },
};

function determineQuality(
  latency: number | null,
  downloadSpeed: number | null,
  packetLoss: number,
  isOnline: boolean
): ConnectionQuality {
  if (!isOnline) return "offline";
  if (latency === null) return "fair";
  if (
    latency <= QUALITY_THRESHOLDS.excellent.maxLatency &&
    packetLoss <= QUALITY_THRESHOLDS.excellent.maxPacketLoss &&
    (downloadSpeed === null || downloadSpeed >= QUALITY_THRESHOLDS.excellent.minSpeed)
  ) return "excellent";
  if (
    latency <= QUALITY_THRESHOLDS.good.maxLatency &&
    packetLoss <= QUALITY_THRESHOLDS.good.maxPacketLoss &&
    (downloadSpeed === null || downloadSpeed >= QUALITY_THRESHOLDS.good.minSpeed)
  ) return "good";
  if (
    latency <= QUALITY_THRESHOLDS.fair.maxLatency &&
    packetLoss <= QUALITY_THRESHOLDS.fair.maxPacketLoss &&
    (downloadSpeed === null || downloadSpeed >= QUALITY_THRESHOLDS.fair.minSpeed)
  ) return "fair";
  return "poor";
}

function calculateJitter(history: NetworkMeasurement[]): number | null {
  const successful = history.filter((m) => m.success).slice(-10);
  if (successful.length < 2) return null;
  let totalDiff = 0;
  for (let i = 1; i < successful.length; i++) {
    totalDiff += Math.abs(successful[i].latency - successful[i - 1].latency);
  }
  return Math.round(totalDiff / (successful.length - 1));
}

function getQualityConfig(quality: ConnectionQuality) {
  switch (quality) {
    case "excellent":
      return { color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", labelKey: "common.excellent" as const, icon: Wifi, dot: "bg-emerald-500" };
    case "good":
      return { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", labelKey: "common.good" as const, icon: Wifi, dot: "bg-blue-500" };
    case "fair":
      return { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", labelKey: "network.fair" as const, icon: AlertTriangle, dot: "bg-amber-500" };
    case "poor":
      return { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", labelKey: "common.poor" as const, icon: AlertTriangle, dot: "bg-red-500" };
    case "offline":
      return { color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-300", labelKey: "common.offline" as const, icon: WifiOff, dot: "bg-slate-500" };
  }
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
const Sparkline = memo(({ data, maxValue, color }: { data: number[]; maxValue: number; color: string }) => {
  if (data.length < 2) return null;
  const width = 80;
  const height = 24;
  const pad = 2;
  const ew = width - pad * 2;
  const eh = height - pad * 2;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * ew;
    const y = pad + eh - (Math.min(v, maxValue) / maxValue) * eh;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(" L ")}`;
  const areaD = `${pathD} L ${pad + ew},${height - pad} L ${pad},${height - pad} Z`;
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color.replace("#", "")})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});
Sparkline.displayName = "Sparkline";

// ─── Netzwerk-Widget (kompakt) ────────────────────────────────────────────────
function NetworkWidget() {
  const { t } = useLanguage();
  const [state, setState] = useState<NetworkState>({
    isOnline: navigator.onLine,
    latency: null,
    avgLatency: null,
    jitter: null,
    packetLoss: 0,
    downloadSpeed: null,
    quality: navigator.onLine ? "good" : "offline",
    lastMeasured: null,
    history: [],
    speedHistory: [],
  });

  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsRef = useRef(0);
  const mountedRef = useRef(true);

  const measurePing = useCallback(async () => {
    if (!mountedRef.current) return;
    const start = performance.now();
    let success = false;
    let latency = 0;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`/api/network/ping?_=${Date.now()}`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(t);
      if (res.ok) { latency = Math.round(performance.now() - start); success = true; failsRef.current = 0; }
      else failsRef.current++;
    } catch { failsRef.current++; }
    if (!mountedRef.current) return;
    setState((prev) => {
      const newH: NetworkMeasurement[] = [...prev.history, { timestamp: Date.now(), latency, success }].slice(-HISTORY_LENGTH);
      const successful = newH.filter((m) => m.success);
      const avgLatency = successful.length > 0 ? Math.round(successful.slice(-20).reduce((s, m) => s + m.latency, 0) / Math.min(successful.length, 20)) : null;
      const packetLoss = newH.length > 0 ? Math.round((newH.filter((m) => !m.success).length / newH.length) * 100) : 0;
      const jitter = calculateJitter(newH);
      const quality = determineQuality(success ? latency : prev.latency, prev.downloadSpeed, packetLoss, prev.isOnline);
      return { ...prev, latency: success ? latency : prev.latency, avgLatency, packetLoss, jitter, quality, lastMeasured: Date.now(), history: newH };
    });
  }, []);

  const measureSpeed = useCallback(async () => {
    if (!mountedRef.current) return;
    const start = performance.now();
    let downloadMbps = 0;
    let success = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`/api/network/speed-test?size=${SPEED_TEST_SIZE_KB * 1024}&_=${Date.now()}`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(t);
      if (res.ok) {
        await res.arrayBuffer();
        const elapsed = (performance.now() - start) / 1000;
        downloadMbps = parseFloat(((SPEED_TEST_SIZE_KB * 8) / 1024 / elapsed).toFixed(1));
        success = true;
      }
    } catch { /* ignore */ }
    if (!mountedRef.current) return;
    setState((prev) => {
      const newSH: SpeedMeasurement[] = [...prev.speedHistory, { timestamp: Date.now(), downloadMbps, success }].slice(-SPEED_HISTORY_LENGTH);
      const quality = determineQuality(prev.latency, success ? downloadMbps : prev.downloadSpeed, prev.packetLoss, prev.isOnline);
      return { ...prev, downloadSpeed: success ? downloadMbps : prev.downloadSpeed, speedHistory: newSH, quality };
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    measurePing();
    pingRef.current = setInterval(measurePing, PING_INTERVAL);
    speedTimerRef.current = setTimeout(() => { measureSpeed(); speedRef.current = setInterval(measureSpeed, SPEED_TEST_INTERVAL); }, 3000);
    const handleOnline = () => { setState((p) => ({ ...p, isOnline: true, quality: "good" })); measurePing(); };
    const handleOffline = () => setState((p) => ({ ...p, isOnline: false, quality: "offline" }));
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (pingRef.current) clearInterval(pingRef.current);
      if (speedRef.current) clearInterval(speedRef.current);
      if (speedTimerRef.current) clearTimeout(speedTimerRef.current);
    };
  }, [measurePing, measureSpeed]);

  const cfg = getQualityConfig(state.quality);
  const StatusIcon = cfg.icon;
  const latencyData = state.history.filter((m) => m.success).slice(-20).map((m) => m.latency);
  const latencyTrend = latencyData.length >= 5
    ? latencyData.slice(-5).reduce((s, v) => s + v, 0) / 5 - latencyData.slice(-10, -5).reduce((s, v) => s + v, 0) / Math.max(latencyData.slice(-10, -5).length, 1)
    : 0;

  return (
    <Card className={`${cfg.bg} ${cfg.border} border transition-colors duration-300`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse`} />
            <span className={`text-sm font-semibold ${cfg.color}`}>{t("settings.internet")}</span>
          </div>
          <div className="flex items-center gap-1">
            <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
            <Badge variant="outline" className={`text-xs ${cfg.color} border-current`}>{t(cfg.labelKey)}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Clock className="w-3 h-3" /> {t("network.latency")}</p>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">{state.latency !== null ? state.latency : "—"}</span>
              <span className="text-xs text-muted-foreground">ms</span>
              {latencyTrend > 10 && <TrendingUp className="w-3 h-3 text-red-500" />}
              {latencyTrend < -10 && <TrendingDown className="w-3 h-3 text-emerald-500" />}
              {Math.abs(latencyTrend) <= 10 && latencyData.length >= 5 && <Minus className="w-3 h-3 text-muted-foreground" />}
            </div>
            {state.avgLatency !== null && <p className="text-[10px] text-muted-foreground">Ø {state.avgLatency}ms</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Download className="w-3 h-3" /> {t("network.download")}</p>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">{state.downloadSpeed !== null ? state.downloadSpeed : "—"}</span>
              <span className="text-xs text-muted-foreground">Mbit/s</span>
            </div>
            {state.packetLoss > 0 && <p className="text-[10px] text-red-500">{state.packetLoss}% {t("network.loss")}</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Activity className="w-3 h-3" /> {t("network.history")}</p>
            {latencyData.length >= 2 ? (
              <Sparkline data={latencyData} maxValue={Math.max(...latencyData, 200)}
                color={state.quality === "excellent" ? "#059669" : state.quality === "good" ? "#2563eb" : state.quality === "fair" ? "#d97706" : "#dc2626"} />
            ) : (
              <p className="text-xs text-muted-foreground pt-1">{t("network.measuring")}</p>
            )}
          </div>
        </div>
        {!state.isOnline && (
          <div className="mt-2 p-2 bg-slate-200 border border-slate-300 rounded text-xs font-medium text-slate-800">
            🔌 {t("network.noConnectionOffline")}
          </div>
        )}
        {state.quality === "poor" && state.isOnline && (
          <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-xs font-medium text-red-800">
            ⚠️ {t("network.unstable")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Status-Badge für Bestellungen ───────────────────────────────────────────
// STATUS_LABEL wird dynamisch in der Komponente gebaut
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800",
  preparing: "bg-yellow-100 text-yellow-800",
  ready: "bg-green-100 text-green-800",
  served: "bg-purple-100 text-purple-800",
  paid: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-800",
};

// ─── Umsatz-Karte ─────────────────────────────────────────────────────────────
function RevenueCard({ label, revenue, tips, ordersCount, guests, highlight = false }: {
  label: string; revenue: number; tips: number; ordersCount: number; guests: number; highlight?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Card className={highlight ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
        <p className={`text-2xl font-bold ${highlight ? "text-primary" : ""}`}>
          CHF {revenue.toFixed(2)}
        </p>
        <div className="mt-2 space-y-1">
          {tips > 0 && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <Star className="w-3 h-3" /> {t("cashier.tip")}: CHF {tips.toFixed(2)}
            </p>
          )}
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Receipt className="w-3 h-3" /> {ordersCount} {t("nav.orders")}</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {guests} {t("kellner.guests")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Haupt-Dashboard ──────────────────────────────────────────────────────────
export default function KellnerDashboard() {
  const { t } = useLanguage();
  const STATUS_LABEL: Record<string, string> = {
    pending: t("orders.pending"),
    preparing: t("kitchen.preparing"),
    ready: t("tables.ready"),
    served: t("tables.served"),
    paid: t("cashier.paid"),
    cancelled: t("orders.cancelled"),
  };
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { activeWaiter, logout } = useWaiterPin();
  const [currentTime, setCurrentTime] = useState(new Date());

  // OAuth-Kellner-Rollen brauchen kein PIN-Overlay – sie sind bereits authentifiziert
  const DIRECT_ACCESS_ROLES = ["kellner", "barkeeper", "koch", "buchhalter", "manager"];
  const isOAuthKellner = user != null && DIRECT_ACCESS_ROLES.includes(user.role ?? "");

  // effectiveWaiter: entweder PIN-Session oder synthetisches Objekt aus OAuth-User
  const effectiveWaiter = activeWaiter ?? (isOAuthKellner && user
    ? { id: user.id, name: user.name ?? "Kellner", role: user.role ?? "kellner", avatarUrl: (user as Record<string, unknown>).avatarUrl as string | null ?? null, loginAt: Date.now() }
    : null);

  // Warten bis Auth geladen ist
  if (authLoading) {
    return null;
  }

  // Wenn kein Kellner eingeloggt (und kein OAuth-Kellner): PIN-Overlay anzeigen
  if (!effectiveWaiter) {
    return <WaiterPinOverlay fullscreen={false} />;
  }

  // Uhr aktualisieren
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Kellner-Statistiken laden
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } =
    trpc.order.getWaiterStats.useQuery(undefined, { refetchInterval: 30_000 });

  // Offene Schicht-Tausch-Anfragen (Badge)
  const { data: mySwapRequests } =
    trpc.shiftSwap.getMySwapRequests.useQuery({ limit: 20 }, { refetchInterval: 60_000 });
  const pendingSwaps = (mySwapRequests ?? []).filter(
    (r: { status: string }) => r.status === "pending_admin"
  ).length;

  // Tischplan-Status (für offene Tische)
  const { data: planGroups = [], isLoading: tablesLoading, refetch: refetchTables } =
    trpc.order.getTableStatus.useQuery(undefined, { refetchInterval: 15_000 });

  const allTables = planGroups.flatMap((g: { tables: Array<{ currentOrder: { status: string } | null }> }) => g.tables);
  const occupiedCount = allTables.filter((t) => t.currentOrder && !["paid", "cancelled"].includes(t.currentOrder.status)).length;
  const readyCount = allTables.filter((t) => t.currentOrder?.status === "ready").length;

  const handleRefresh = () => {
    refetchStats();
    refetchTables();
    t("cashier.dataUpdated");
  };

  // ── Echtzeit-Ton bei order_ready (Gericht fertig) ──────────────────────────
  const { enabled: soundEnabled, volume, setEnabled: setSoundEnabled, setVolume, playAlert } = useSoundAlert({ variant: "bar" });
  const utils = trpc.useUtils();
  const handleSSEEvent = useCallback((event: { type: string; payload: Record<string, unknown> }) => {
    if (event.type === "order_ready") {
      playAlert();
      setTimeout(() => playAlert(), 500);
      const tableLabel = (event.payload?.tableLabel as string | null) ?? "";
      toast.success(
        tableLabel ? `\u2705 Bereit \u2013 ${tableLabel}` : "\u2705 Gericht bereit",
        { description: t("kellner.bringToTable"), duration: 6000, position: "top-center" }
      );
    }
    utils.order.getTableStatus.invalidate();
    utils.order.getWaiterStats.invalidate();
  }, [utils, playAlert]);

  const restaurantId = user?.restaurantId ?? null;
  useSSE(restaurantId, { channels: ["floor", "order"], onEvent: handleSSEEvent });

  // Offline-Sync: synchronisiert ausstehende Bestellungen wenn Internet zurückkommt
  useOfflineSync(restaurantId ?? undefined);

  // Schicht-Info: Angemeldete Zeit (seit Seitenaufruf als Proxy)
  const [shiftStart] = useState(() => new Date());
  const shiftMinutes = Math.floor((currentTime.getTime() - shiftStart.getTime()) / 60000);
  const shiftHours = Math.floor(shiftMinutes / 60);
  const shiftMins = shiftMinutes % 60;

  // Wochentag und Datum
  const weekday = currentTime.toLocaleDateString(undefined, { weekday: "long" });
  const dateStr = currentTime.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = currentTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Performance-Score (0–100) basierend auf Bestelldauer
  const perfScore = stats?.avgOrderDurationMin != null
    ? Math.max(0, Math.min(100, Math.round(100 - (stats.avgOrderDurationMin - 15) * 2)))
    : null;

  const perfLabel = perfScore == null ? "—"
    : perfScore >= 80 ? t("perf.veryGood")
    : perfScore >= 60 ? t("common.good")
    : perfScore >= 40 ? t("perf.medium")
    : t("perf.needsImprovement");

  const perfColor = perfScore == null ? "text-muted-foreground"
    : perfScore >= 80 ? "text-emerald-600"
    : perfScore >= 60 ? "text-blue-600"
    : perfScore >= 40 ? "text-amber-600"
    : "text-red-600";

  return (
    <>
      {/* Offline-Banner: erscheint automatisch wenn kein Internet */}
      <OfflineBanner className="-mx-4 -mt-4 mb-2 sticky top-0 z-50" />

      {/* ── Header ─────────────────────────────────────────────────────────────────── */}
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {currentTime.getHours() < 12 ? t("greeting.morning") : currentTime.getHours() < 18 ? t("greeting.day") : t("greeting.evening")},{" "}
              {effectiveWaiter.name.split(" ")[0]} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {weekday}, {dateStr} · {timeStr}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SoundAlertToggle
              enabled={soundEnabled}
              volume={volume}
              onToggle={setSoundEnabled}
              onVolumeChange={setVolume}
              onTestSound={playAlert}
            />
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
            </Button>
{activeWaiter && (
            <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => { logout(); }}>
              <LogOut className="h-4 w-4" />
              <span className="text-xs">Abmelden</span>
            </Button>
            )}
          </div>
        </div>

        {/* ── Schnell-Aktionen ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Button
            className="h-16 flex-col gap-1 bg-primary hover:bg-primary/90"
            onClick={() => navigate("/kellner/tables")}
          >
            <UtensilsCrossed className="h-5 w-5" />
            <span className="text-xs font-medium">{t("nav.tables")}</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex-col gap-1"
            onClick={() => navigate("/kellner/checkout")}
          >
            <CreditCard className="h-5 w-5" />
            <span className="text-xs font-medium">{t("nav.cashier")}</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex-col gap-1"
            onClick={() => navigate("/kellner/orders")}
          >
            <Receipt className="h-5 w-5" />
            <span className="text-xs font-medium">{t("nav.orders")}</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex-col gap-1"
            onClick={() => navigate("/kellner/history")}
          >
            <Clock className="h-5 w-5" />
            <span className="text-xs font-medium">{t("common.history")}</span>
          </Button>
        </div>

        {/* ── Schicht-Tausch-Badge ─────────────────────────────────────────── */}
        {pendingSwaps > 0 && (
          <div
            className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50 border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
            onClick={() => navigate("/kellner/shift-swap")}
          >
            <div className="relative flex-shrink-0">
              <ArrowUpRight className="h-5 w-5 text-amber-600" />
              <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pendingSwaps}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {pendingSwaps} {t("kellner.shiftSwapPending")}
              </p>
              <p className="text-xs text-amber-600">{t("kellner.tapShiftSwap")}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-600" />
          </div>
        )}

        {/* ── Schnell-Aktionen 2. Reihe (Schicht & Ferien) ────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        </div>

        {/* ── Alerts: Tische bereit ────────────────────────────────────────── */}
        {readyCount > 0 && (
          <div
            className="flex items-center gap-3 p-3 rounded-lg border bg-green-50 border-green-200 cursor-pointer hover:bg-green-100 transition-colors"
            onClick={() => navigate("/kellner/tables")}
          >
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800">
                {readyCount} {t("kellner.ordersReadyForPickup")}
              </p>
              <p className="text-xs text-green-600">{t("kellner.tapFloorPlan")}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-green-600" />
          </div>
        )}

        {/* ── Tisch-Übersicht (kompakt) ────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{tablesLoading ? "—" : occupiedCount}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("kellner.occupiedTables")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className={`text-3xl font-bold ${readyCount > 0 ? "text-green-600" : ""}`}>{tablesLoading ? "—" : readyCount}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("tables.ready")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">{statsLoading ? "—" : (stats?.openOrders?.length ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("kellner.myOpen")}</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Umsatz-Statistiken ───────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4" /> {t("kellner.myRevenue")}
          </h2>
          {statsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : statsError ? (
            <Card className="border-destructive/30">
              <CardContent className="p-4 text-center text-destructive text-sm">
                {t("common.dataLoadError")}
                <Button variant="link" size="sm" onClick={() => refetchStats()}>{t("common.retry")}</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <RevenueCard
                label={t("common.today")}
                revenue={stats?.today.revenue ?? 0}
                tips={stats?.today.tips ?? 0}
                ordersCount={stats?.today.orders ?? 0}
                guests={stats?.today.guests ?? 0}
                highlight
              />
              <RevenueCard
                label={t("common.thisWeek")}
                revenue={stats?.week.revenue ?? 0}
                tips={stats?.week.tips ?? 0}
                ordersCount={stats?.week.orders ?? 0}
                guests={stats?.week.guests ?? 0}
              />
              <RevenueCard
                label={t("common.thisMonth")}
                revenue={stats?.month.revenue ?? 0}
                tips={stats?.month.tips ?? 0}
                ordersCount={stats?.month.orders ?? 0}
                guests={stats?.month.guests ?? 0}
              />
            </div>
          )}
        </div>

        {/* ── Schicht & Performance ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Schicht-Info */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Coffee className="h-4 w-4 text-amber-600" /> {t("kellner.currentShift")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{shiftHours}h {shiftMins < 10 ? `0${shiftMins}` : shiftMins}min</p>
                  <p className="text-xs text-muted-foreground">
                    {t("kellner.shiftStart")}: {shiftStart.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} Uhr
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-600">{t("kellner.active")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {currentTime.toLocaleDateString(undefined, { weekday: "short" })}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t("kellner.shiftProgress")}</span>
                  <span>{Math.min(100, Math.round((shiftMinutes / 480) * 100))}%</span>
                </div>
                <Progress value={Math.min(100, (shiftMinutes / 480) * 100)} className="h-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold">{stats?.today.orders ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{t("nav.orders")}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold">{stats?.today.guests ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{t("kellner.guestsServed")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" /> {t("kellner.myPerformance")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-bold ${perfColor}`}>{perfLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    Ø {t("kellner.avgOrderDuration")}: {stats?.avgOrderDurationMin != null ? `${stats.avgOrderDurationMin} Min.` : t("kellner.noData")}
                  </p>
                </div>
                {perfScore != null && (
                  <div className="relative w-14 h-14">
                    <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/20" />
                      <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5"
                        stroke={perfScore >= 80 ? "#059669" : perfScore >= 60 ? "#2563eb" : perfScore >= 40 ? "#d97706" : "#dc2626"}
                        strokeDasharray={`${perfScore} ${100 - perfScore}`}
                        strokeLinecap="round" />
                    </svg>
                    <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${perfColor}`}>
                      {perfScore}
                    </span>
                  </div>
                )}
              </div>
              {/* Zahlungsmethoden heute */}
              {stats?.paymentMethodCounts && Object.keys(stats.paymentMethodCounts).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("cashier.paymentMethodsToday")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(stats.paymentMethodCounts).map(([method, count]) => (
                      <Badge key={method} variant="secondary" className="text-xs">
                        {method === "cash" ? t("checkout.cash") : method === "card" ? t("checkout.card") : method === "twint" ? t("checkout.twint") : method === "invoice" ? t("checkout.invoice") : method}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold text-emerald-600">
                    CHF {(stats?.today.tips ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("cashier.tipToday")}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold">
                    {stats?.today.orders && stats.today.guests
                      ? (stats.today.guests / stats.today.orders).toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("kellner.avgGuests")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Offene Bestellungen ──────────────────────────────────────────── */}
        {!statsLoading && (stats?.openOrders?.length ?? 0) > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Circle className="h-4 w-4 text-blue-500" /> {t("kellner.myOpenOrders")}
            </h2>
            <div className="space-y-2">
              {stats!.openOrders.map((order: { id: number; orderNumber: string | null; status: string; totalAmount: string | null; guestCount: number | null; createdAt: Date }) => {
                const ageMin = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
                return (
                  <Card
                    key={order.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/kellner/order?orderId=${order.id}`)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{order.orderNumber}</span>
                          <Badge className={`text-xs ${STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABEL[order.status] ?? order.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {order.guestCount ?? 0} {t("kellner.guests")} · {t("kellner.agoPrefix")} {ageMin < 60 ? `${ageMin} Min.` : `${Math.floor(ageMin / 60)}h ${ageMin % 60}min`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">CHF {parseFloat(order.totalAmount ?? "0").toFixed(2)}</p>
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto mt-0.5" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Letzte Aktivitäten ───────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> {t("kellner.recentCompleted")}
          </h2>
          {statsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : (stats?.recentPaid?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Banknote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("kellner.noCompletedThisMonth")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {stats!.recentPaid.map((order: { id: number; orderNumber: string | null; paidAt: Date | null; totalAmount: string | null; tipAmount: string | null; guestCount: number | null }) => {
                const paidAt = order.paidAt ? new Date(order.paidAt) : null;
                const timeLabel = paidAt
                  ? paidAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                  : "—";
                const dateLabel = paidAt
                  ? paidAt.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })
                  : "";
                const isToday = paidAt && paidAt >= new Date(new Date().setHours(0, 0, 0, 0));
                return (
                  <div key={order.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {isToday ? `${t("common.today")} ${timeLabel}` : `${dateLabel} ${timeLabel}`}
                        {order.guestCount ? ` · ${order.guestCount} ${t("kellner.guests")}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-emerald-600">
                        + CHF {parseFloat(order.totalAmount ?? "0").toFixed(2)}
                      </p>
                      {order.tipAmount && parseFloat(order.tipAmount) > 0 && (
                        <p className="text-xs text-amber-600">
                          + CHF {parseFloat(order.tipAmount).toFixed(2)} TG
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Ferien / Abwesenheiten ───────────────────────────────────────── */}
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("kellner.vacationAbsences")}</p>
                  <p className="text-xs text-muted-foreground">{t("kellner.vacationManage")}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info(t("kellner.vacationComingSoon"))}
              >
                Anfragen
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Netzwerk & System ────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Wifi className="h-4 w-4" /> {t("settings.internet")}
          </h2>
          <NetworkWidget />
        </div>

        {/* ── Monatliche Vergleich ─────────────────────────────────────────── */}
        {!statsLoading && stats && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> {t("kellner.monthOverview")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("kellner.totalRevenue")}</p>
                  <p className="text-xl font-bold">CHF {stats.month.revenue.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("cashier.tip")}</p>
                  <p className="text-xl font-bold text-amber-600">CHF {stats.month.tips.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("nav.orders")}</p>
                  <p className="text-xl font-bold">{stats.month.orders}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("kellner.guestsServed")}</p>
                  <p className="text-xl font-bold">{stats.month.guests}</p>
                </div>
              </div>
              {stats.month.orders > 0 && (
                <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("kellner.avgRevenuePerOrder")}</p>
                    <p className="font-semibold">CHF {(stats.month.revenue / stats.month.orders).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("kellner.avgOrderDuration")}</p>
                    <p className="font-semibold">{stats.avgOrderDurationMin != null ? `${stats.avgOrderDurationMin} Min.` : "—"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

    </>
  );
}
