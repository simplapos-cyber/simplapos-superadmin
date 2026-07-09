import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Wifi, WifiOff, AlertTriangle, Activity, Download, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Types ──────────────────────────────────────────────────────────────────
interface NetworkMeasurement {
  timestamp: number;
  latency: number; // ms
  success: boolean;
}

interface SpeedMeasurement {
  timestamp: number;
  downloadMbps: number;
  success: boolean;
}

type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "offline";

interface NetworkState {
  isOnline: boolean;
  latency: number | null;
  avgLatency: number | null;
  jitter: number | null;
  packetLoss: number; // percentage 0-100
  downloadSpeed: number | null; // Mbps
  quality: ConnectionQuality;
  lastMeasured: number | null;
  history: NetworkMeasurement[];
  speedHistory: SpeedMeasurement[];
}

// ─── Constants ──────────────────────────────────────────────────────────────
// Detect iOS/Safari to reduce memory pressure (prevents tab crash loop)
const isIOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);
const PING_INTERVAL = isIOS ? 30000 : 15000; // 30s on iOS, 15s on desktop
const SPEED_TEST_INTERVAL = isIOS ? 180000 : 90000; // 3min on iOS, 90s on desktop
const HISTORY_LENGTH = isIOS ? 20 : 60; // Smaller history on iOS
const SPEED_HISTORY_LENGTH = isIOS ? 5 : 10;
const SPEED_TEST_SIZE_KB = isIOS ? 50 : 200; // 50KB on iOS, 200KB on desktop (not 500KB)

// Quality thresholds (adjusted for cloud server connection, not local speedtest)
const QUALITY_THRESHOLDS = {
  excellent: { maxLatency: 80, minSpeed: 5, maxPacketLoss: 0 },
  good: { maxLatency: 150, minSpeed: 2, maxPacketLoss: 2 },
  fair: { maxLatency: 300, minSpeed: 1, maxPacketLoss: 5 },
  poor: { maxLatency: Infinity, minSpeed: 0, maxPacketLoss: 100 },
};

// ─── Helper Functions ───────────────────────────────────────────────────────
function determineQuality(
  latency: number | null,
  downloadSpeed: number | null,
  packetLoss: number,
  isOnline: boolean
): ConnectionQuality {
  const { t } = useLanguage();
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
  const successful = history.filter(m => m.success).slice(-10);
  if (successful.length < 2) return null;
  let totalDiff = 0;
  for (let i = 1; i < successful.length; i++) {
    totalDiff += Math.abs(successful[i].latency - successful[i - 1].latency);
  }
  return Math.round(totalDiff / (successful.length - 1));
}

function getQualityConfig(quality: ConnectionQuality, t: (key: import("@/lib/i18n").TranslationKey) => string) {
  switch (quality) {
    case "excellent":
      return { color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", label: t("common.excellent"), icon: Wifi, dot: "bg-emerald-500" };
    case "good":
      return { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", label: t("common.good"), icon: Wifi, dot: "bg-blue-500" };
    case "fair":
      return { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", label: t("network.fair"), icon: AlertTriangle, dot: "bg-amber-500" };
    case "poor":
      return { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: t("common.poor"), icon: AlertTriangle, dot: "bg-red-500" };
    case "offline":
      return { color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-300", label: t("common.offline"), icon: WifiOff, dot: "bg-slate-500" };
  }
}

// ─── Mini Sparkline Chart ───────────────────────────────────────────────────
const Sparkline = memo(({ data, maxValue, color }: { data: number[]; maxValue: number; color: string }) => {
  if (data.length < 2) return null;
  const width = 120;
  const height = 32;
  const padding = 2;
  const effectiveWidth = width - padding * 2;
  const effectiveHeight = height - padding * 2;

  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * effectiveWidth;
    const y = padding + effectiveHeight - (Math.min(value, maxValue) / maxValue) * effectiveHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  // Fill area
  const areaD = `${pathD} L ${padding + effectiveWidth},${height - padding} L ${padding},${height - padding} Z`;

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});
Sparkline.displayName = "Sparkline";

// ─── Main Component ─────────────────────────────────────────────────────────
const NetworkMonitor = memo(() => {
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

  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialSpeedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWarningRef = useRef<number>(0);
  const consecutiveFailsRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // ─── Ping Measurement ─────────────────────────────────────────────────
  const measurePing = useCallback(async () => {
    if (!mountedRef.current) return;
    const start = performance.now();
    let success = false;
    let latency = 0;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`/api/network/ping?_=${Date.now()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (response.ok) {
        latency = Math.round(performance.now() - start);
        success = true;
        consecutiveFailsRef.current = 0;
      } else {
        consecutiveFailsRef.current++;
      }
    } catch {
      consecutiveFailsRef.current++;
      latency = 0;
    }

    if (!mountedRef.current) return;

    setState(prev => {
      const newMeasurement: NetworkMeasurement = {
        timestamp: Date.now(),
        latency,
        success,
      };

      const history = [...prev.history, newMeasurement].slice(-HISTORY_LENGTH);
      const recentHistory = history.slice(-20);
      const successfulRecent = recentHistory.filter(m => m.success);
      const failedRecent = recentHistory.filter(m => !m.success);

      const avgLatency = successfulRecent.length > 0
        ? Math.round(successfulRecent.reduce((sum, m) => sum + m.latency, 0) / successfulRecent.length)
        : prev.avgLatency;

      const packetLoss = recentHistory.length > 0
        ? Math.round((failedRecent.length / recentHistory.length) * 100)
        : 0;

      const jitter = calculateJitter(history);
      const isOnline = navigator.onLine && consecutiveFailsRef.current < 5;

      const quality = determineQuality(
        success ? latency : prev.latency,
        prev.downloadSpeed,
        packetLoss,
        isOnline
      );

      // Trigger warnings for degraded connections
      const now = Date.now();
      if (quality === "poor" && now - lastWarningRef.current > 30000) {
        lastWarningRef.current = now;
        toast.warning(t("network.unstable"), {
          description: `${t("network.latency")}: ${latency}ms | ${t("network.loss")}: ${packetLoss}%`,
          duration: 5000,
        });
      }

      if (!isOnline && prev.isOnline) {
        toast.error(t("network.noConnectionOffline"), {
          duration: 10000,
        });
      }

      if (isOnline && !prev.isOnline) {
        toast.success(t("network.reconnected"), {
          duration: 3000,
        });
      }

      return {
        ...prev,
        isOnline,
        latency: success ? latency : prev.latency,
        avgLatency,
        jitter,
        packetLoss,
        quality,
        lastMeasured: Date.now(),
        history,
      };
    });
  }, []);

  // ─── Speed Test ───────────────────────────────────────────────────────
  const measureSpeed = useCallback(async () => {
    if (!mountedRef.current || !navigator.onLine) return;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const start = performance.now();

      const response = await fetch(`/api/network/speed-test?size=${SPEED_TEST_SIZE_KB}&_=${Date.now()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (!response.ok) return;

      const blob = await response.blob();
      const end = performance.now();
      const durationSeconds = (end - start) / 1000;
      const sizeBytes = blob.size;
      const sizeMbits = (sizeBytes * 8) / (1024 * 1024);
      const downloadMbps = Math.round((sizeMbits / durationSeconds) * 10) / 10;

      if (!mountedRef.current) return;

      setState(prev => {
        const newMeasurement: SpeedMeasurement = {
          timestamp: Date.now(),
          downloadMbps,
          success: true,
        };

        const speedHistory = [...prev.speedHistory, newMeasurement].slice(-SPEED_HISTORY_LENGTH);
        const avgSpeed = Math.round(
          (speedHistory.reduce((sum, m) => sum + m.downloadMbps, 0) / speedHistory.length) * 10
        ) / 10;

        const quality = determineQuality(prev.latency, avgSpeed, prev.packetLoss, prev.isOnline);

        return {
          ...prev,
          downloadSpeed: avgSpeed,
          quality,
          speedHistory,
        };
      });
    } catch {
      // Speed test failed - don't update, keep previous value
    }
  }, []);

  // ─── Online/Offline Event Listeners ───────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      consecutiveFailsRef.current = 0;
      measurePing();
    };

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        isOnline: false,
        quality: "offline",
      }));
      toast.error(t("network.noConnectionOffline"), {
        duration: 10000,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial measurements
    measurePing();
    initialSpeedTimerRef.current = setTimeout(() => measureSpeed(), 3000); // Delay speed test to not block initial load

    // Set up intervals – skip measurements when tab is hidden (saves battery + CPU on mobile)
    pingIntervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") measurePing();
    }, PING_INTERVAL);
    speedIntervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") measureSpeed();
    }, SPEED_TEST_INTERVAL);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (speedIntervalRef.current) clearInterval(speedIntervalRef.current);
      if (initialSpeedTimerRef.current) clearTimeout(initialSpeedTimerRef.current);
    };
  }, [measurePing, measureSpeed]);

  // ─── Render ───────────────────────────────────────────────────────────
  const config = getQualityConfig(state.quality, t);
  const StatusIcon = config.icon;

  // Prepare sparkline data
  const latencyData = state.history
    .filter(m => m.success)
    .slice(-30)
    .map(m => m.latency);

  const latencyTrend = latencyData.length >= 5
    ? latencyData.slice(-5).reduce((s, v) => s + v, 0) / 5 - latencyData.slice(-10, -5).reduce((s, v) => s + v, 0) / Math.max(latencyData.slice(-10, -5).length, 1)
    : 0;

  return (
    <Card className={`p-4 ${config.bg} ${config.border} border transition-colors duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${config.dot} animate-pulse`} />
            <span className={`text-sm font-semibold ${config.color}`}>
              {t("network.posConnection")}: {config.label}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 ml-4.5 mt-0.5">{t("network.posDescription")}</p>
        </div>
        <StatusIcon className={`w-4 h-4 ${config.color}`} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Latency */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            <span>{t("network.latency")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-slate-900">
              {state.latency !== null ? `${state.latency}` : "—"}
            </span>
            <span className="text-xs text-slate-500">ms</span>
            {latencyTrend > 10 && <TrendingUp className="w-3 h-3 text-red-500" />}
            {latencyTrend < -10 && <TrendingDown className="w-3 h-3 text-emerald-500" />}
            {Math.abs(latencyTrend) <= 10 && latencyData.length >= 5 && <Minus className="w-3 h-3 text-slate-400" />}
          </div>
          {state.avgLatency !== null && (
            <p className="text-[10px] text-slate-400">Ø {state.avgLatency}ms</p>
          )}
        </div>

        {/* Download Speed */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Download className="w-3 h-3" />
            <span>{t("network.download")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-slate-900">
              {state.downloadSpeed !== null ? `${state.downloadSpeed}` : "—"}
            </span>
            <span className="text-xs text-slate-500">Mbit/s</span>
          </div>
          {state.speedHistory.length > 1 && (
            <p className="text-[10px] text-slate-400">
              {state.speedHistory.length} {t("network.measurements")}
            </p>
          )}
        </div>

        {/* Packet Loss */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Activity className="w-3 h-3" />
            <span>{t("network.packetLoss")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-lg font-bold ${state.packetLoss > 5 ? "text-red-600" : state.packetLoss > 0 ? "text-amber-600" : "text-slate-900"}`}>
              {state.packetLoss}
            </span>
            <span className="text-xs text-slate-500">%</span>
          </div>
          {state.jitter !== null && (
            <p className="text-[10px] text-slate-400">Jitter: {state.jitter}ms</p>
          )}
        </div>

        {/* Sparkline */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Activity className="w-3 h-3" />
            <span>{t("network.history")}</span>
          </div>
          {latencyData.length >= 2 ? (
            <Sparkline
              data={latencyData}
              maxValue={Math.max(...latencyData, 200)}
              color={state.quality === "excellent" ? "#059669" : state.quality === "good" ? "#2563eb" : state.quality === "fair" ? "#d97706" : "#dc2626"}
            />
          ) : (
            <p className="text-xs text-slate-400 pt-1">{t("network.measuring")}</p>
          )}
        </div>
      </div>

      {/* Warning Banner */}
      {state.quality === "poor" && state.isOnline && (
        <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded-md">
          <p className="text-xs font-medium text-red-800">
            ⚠️ {t("network.unstable")} {t("network.checkRouter")}
          </p>
        </div>
      )}

      {!state.isOnline && (
        <div className="mt-3 p-2 bg-slate-200 border border-slate-300 rounded-md">
          <p className="text-xs font-medium text-slate-800">
            🔌 {t("network.noConnectionOffline")}
          </p>
        </div>
      )}

      {state.packetLoss > 5 && state.isOnline && state.quality !== "poor" && (
        <div className="mt-3 p-2 bg-amber-100 border border-amber-200 rounded-md">
          <p className="text-xs font-medium text-amber-800">
            ⚡ {t("network.highPacketLoss").replace("{n}", String(state.packetLoss))}
          </p>
        </div>
      )}
    </Card>
  );
});

NetworkMonitor.displayName = "NetworkMonitor";
export default NetworkMonitor;
