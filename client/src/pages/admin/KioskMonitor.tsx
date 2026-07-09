/**
 * KioskMonitor – Echtzeit-Kassenüberwachung für Admin und Kellner
 * - Live-Kassenicons (grau=frei, orange=aktiv, rot=service/alkohol, lila=stichprobe)
 * - Session-Timeline mit Events
 * - Stichproben-Panel (bestätigen/ablehnen)
 * - Manuelle Bestellung per Text/Sprache → QR-Code für Gast
 * Polling alle 5 Sekunden
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Monitor,
  Clock,
  AlertTriangle,
  Bell,
  CheckCircle2,
  XCircle,
  Search,
  Mic,
  MicOff,
  Send,
  QrCode,
  ShoppingCart,
  Wine,
  RotateCcw,
  ChevronRight,
  Loader2,
  Activity,
  Users,
  TrendingUp,
  Eye,
  Lock,
  LockOpen,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

// ─── Typen ────────────────────────────────────────────────────────────────────
type DisplayStatus = "idle" | "active" | "service_called" | "age_check" | "spot_check";

interface LiveStation {
  station: { id: number; name: string; qrToken: string; isActive: boolean };
  session: {
    sessionId: string; stationId: number; status: string;
    scanCount: number; abortCount: number; serviceCallCount: number;
    startedAt: string; totalAmount: string | null; paymentStatus: string;
  } | null;
  spotCheck: { id: number; triggerReason: string; triggeredAt: string } | null;
  durationSec: number;
  displayStatus: DisplayStatus;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusColor(status: DisplayStatus) {
  switch (status) {
    case "idle": return "bg-gray-100 border-gray-200 text-gray-500";
    case "active": return "bg-orange-50 border-orange-300 text-orange-700";
    case "service_called": return "bg-red-50 border-red-400 text-red-700";
    case "age_check": return "bg-amber-50 border-amber-400 text-amber-700";
    case "spot_check": return "bg-purple-50 border-purple-400 text-purple-700";
  }
}

function statusLabel(status: DisplayStatus) {
  switch (status) {
    case "idle": return "Frei";
    case "active": return "Aktiv";
    case "service_called": return "Service gerufen";
    case "age_check": return "Alterscheck";
    case "spot_check": return "Stichprobe!";
  }
}

function statusDot(status: DisplayStatus) {
  switch (status) {
    case "idle": return "bg-gray-300";
    case "active": return "bg-orange-400 animate-pulse";
    case "service_called": return "bg-red-500 animate-pulse";
    case "age_check": return "bg-amber-500 animate-pulse";
    case "spot_check": return "bg-purple-500 animate-pulse";
  }
}

function eventIcon(eventType: string) {
  switch (eventType) {
    case "session_started": return "🟢";
    case "scan_started": return "📷";
    case "scan_completed": return "✅";
    case "scan_repeated": return "🔄";
    case "payment_started": return "💳";
    case "payment_completed": return "✅";
    case "payment_aborted": return "❌";
    case "service_called": return "🔔";
    case "age_verification_requested": return "🍷";
    case "age_verification_approved": return "✅";
    case "age_verification_rejected": return "❌";
    case "spot_check_triggered": return "🔍";
    case "spot_check_passed": return "✅";
    case "session_ended": return "🏁";
    default: return "•";
  }
}

// ─── Lock-Status-Typ ─────────────────────────────────────────────────────────
interface LockInfo {
  id: number;
  name: string;
  isLocked: boolean;
  lockedSince: number | null;
  lockedUntil: number | null;
}

// ─── Kassen-Icon-Karte ────────────────────────────────────────────────────────
function StationIcon({ data, selected, onClick, lockInfo, onForceRelease, isAdmin }: {
  data: LiveStation;
  selected: boolean;
  onClick: () => void;
  lockInfo?: LockInfo;
  onForceRelease?: (stationId: number) => void;
  isAdmin?: boolean;
}) {
  const { station, session, displayStatus, durationSec, spotCheck } = data;
  const isLocked = lockInfo?.isLocked ?? false;
  const lockedSec = lockInfo?.lockedSince ? Math.floor((Date.now() - lockInfo.lockedSince) / 1000) : 0;

  return (
    <div className="relative" style={{ minWidth: 110 }}>
      <button
        onClick={onClick}
        className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 hover:scale-105 active:scale-95 w-full ${
          statusColor(displayStatus)
        } ${selected ? "ring-2 ring-offset-2 ring-primary shadow-lg" : "shadow-sm"}`}
      >
        {/* Status-Dot */}
        <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${statusDot(displayStatus)}`} />

        {/* Lock-Badge */}
        {isLocked && (
          <div className="absolute top-2 left-2 flex items-center gap-0.5 bg-blue-600 text-white text-[9px] rounded-full px-1.5 py-0.5 font-bold">
            <Lock className="h-2.5 w-2.5" />
            {lockedSec > 0 ? `${lockedSec}s` : ""}
          </div>
        )}

        {/* Kassen-Icon */}
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold ${
          displayStatus === "idle" ? "bg-gray-200 text-gray-400" :
          displayStatus === "active" ? "bg-orange-200 text-orange-700" :
          displayStatus === "service_called" ? "bg-red-200 text-red-700" :
          displayStatus === "age_check" ? "bg-amber-200 text-amber-700" :
          "bg-purple-200 text-purple-700"
        }`}>
          <Monitor className="h-7 w-7" />
        </div>

        {/* Name */}
        <p className="text-xs font-semibold text-center leading-tight">{station.name}</p>

        {/* Status-Label */}
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
          displayStatus === "idle" ? "border-gray-300 text-gray-400" :
          displayStatus === "active" ? "border-orange-300 text-orange-600" :
          displayStatus === "service_called" ? "border-red-400 text-red-600" :
          displayStatus === "age_check" ? "border-amber-400 text-amber-600" :
          "border-purple-400 text-purple-600"
        }`}>
          {statusLabel(displayStatus)}
        </Badge>

        {/* Dauer */}
        {session && (
          <p className="text-[10px] text-gray-500 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {formatDuration(durationSec)}
          </p>
        )}

        {/* Stichprobe-Warnung */}
        {spotCheck && (
          <div className="absolute -top-1 -left-1 bg-purple-500 text-white text-[9px] rounded-full w-5 h-5 flex items-center justify-center font-bold">!</div>
        )}
      </button>

      {/* Force-Release-Button (nur Admin, nur wenn gesperrt) */}
      {isAdmin && isLocked && onForceRelease && (
        <button
          onClick={(e) => { e.stopPropagation(); onForceRelease(station.id); }}
          className="mt-1 w-full flex items-center justify-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg py-1 transition-colors"
          title="Lock manuell aufheben"
        >
          <LockOpen className="h-2.5 w-2.5" />
          Lock aufheben
        </button>
      )}
    </div>
  );
}

// ─── Session-Detail-Panel ─────────────────────────────────────────────────────
function SessionDetailPanel({ station, onClose }: { station: LiveStation; onClose: () => void }) {
  const { data: events, refetch } = trpc.kiosk.getSessionEvents.useQuery(
    { sessionId: station.session?.sessionId ?? "" },
    { enabled: !!station.session?.sessionId, refetchInterval: 5000 }
  );
  const resolveSpotCheck = trpc.kiosk.resolveSpotCheck.useMutation({
    onSuccess: () => { toast.success("Stichprobe abgeschlossen"); refetch(); },
  });
  const triggerSpotCheck = trpc.kiosk.triggerManualSpotCheck.useMutation({
    onSuccess: () => toast.success("Manuelle Stichprobe ausgelöst"),
  });

  const sess = station.session;
  if (!sess) return (
    <div className="p-6 text-center text-gray-400">
      <Monitor className="h-10 w-10 mx-auto mb-2 opacity-30" />
      <p>Keine aktive Session</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-bold text-gray-800">{station.station.name}</h3>
          <p className="text-xs text-gray-500">Session: {sess.sessionId.slice(0, 8)}…</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <XCircle className="h-5 w-5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 p-4 border-b">
        <div className="text-center">
          <p className="text-2xl font-bold text-orange-500">{sess.scanCount}</p>
          <p className="text-xs text-gray-500">Scans</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-500">{sess.abortCount}</p>
          <p className="text-xs text-gray-500">Abbrüche</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-500">{sess.serviceCallCount}</p>
          <p className="text-xs text-gray-500">Service-Rufe</p>
        </div>
      </div>

      {/* Stichprobe-Aktionen */}
      {station.spotCheck && (
        <div className="m-4 p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-purple-600" />
            <p className="text-sm font-semibold text-purple-700">Stichprobe erforderlich</p>
          </div>
          <p className="text-xs text-purple-600 mb-3">{station.spotCheck.triggerReason}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              onClick={() => resolveSpotCheck.mutate({ spotCheckId: station.spotCheck!.id, status: "passed" })}
              disabled={resolveSpotCheck.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Bestanden
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => resolveSpotCheck.mutate({ spotCheckId: station.spotCheck!.id, status: "failed" })}
              disabled={resolveSpotCheck.isPending}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Nicht bestanden
            </Button>
          </div>
        </div>
      )}

      {/* Manuelle Stichprobe */}
      {!station.spotCheck && (
        <div className="px-4 pb-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full border-purple-300 text-purple-600 hover:bg-purple-50"
            onClick={() => triggerSpotCheck.mutate({ stationId: station.station.id, sessionId: sess.sessionId })}
            disabled={triggerSpotCheck.isPending}
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            Manuelle Stichprobe auslösen
          </Button>
        </div>
      )}

      {/* Event-Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Event-Timeline</p>
        <div className="space-y-2">
          {(events ?? []).map((ev: { eventType: string; createdAt: string }, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-base shrink-0 mt-0.5">{eventIcon(ev.eventType)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 capitalize">
                  {ev.eventType.replace(/_/g, " ")}
                </p>
                <p className="text-[10px] text-gray-400">
                  {new Date(ev.createdAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          {(!events || events.length === 0) && (
            <p className="text-xs text-gray-400 text-center py-4">Keine Events</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Manuelle Bestellung Panel ────────────────────────────────────────────────
function ManualOrderPanel({ station, onClose }: { station: LiveStation; onClose: () => void }) {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<{ products: Array<{ name: string; price: number; quantity: number }>; totalAmount: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const createOrder = trpc.kiosk.createManualOrder.useMutation({
    onSuccess: async (data) => {
      setQrUrl(data.qrPayUrl);
      setOrderResult({ products: data.products, totalAmount: data.totalAmount });
      // QR-Code generieren
      try {
        const dataUrl = await QRCode.toDataURL(data.qrPayUrl, { width: 300, margin: 2 });
        setQrDataUrl(dataUrl);
      } catch { /* ignore */ }
      toast.success("Bestellung erstellt – QR-Code für Gast bereit");
    },
    onError: (err) => toast.error(err.message),
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        // Blob → base64 → send to transcription
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            const res = await fetch("/api/trpc/kiosk.transcribeVoice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ json: { audioBase64: base64 } }),
            });
            const data = await res.json() as { result?: { data?: { text?: string } } };
            const text = data?.result?.data?.text ?? "";
            if (text) setInputText(prev => prev ? `${prev} ${text}` : text);
          } catch { toast.error("Spracherkennung fehlgeschlagen"); }
        };
        reader.readAsDataURL(blob);
        setIsRecording(false);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch { toast.error("Mikrofon konnte nicht geöffnet werden"); }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  if (qrDataUrl && orderResult) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-gray-800">QR-Code für Gast</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <img src={qrDataUrl} alt="QR-Code" className="w-48 h-48 rounded-xl shadow-md" />
          <p className="text-sm text-center text-gray-600">Gast scannt diesen QR-Code und bezahlt direkt online</p>
          <div className="w-full bg-gray-50 rounded-xl p-3 space-y-1">
            {orderResult.products.map((p, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{p.quantity}× {p.name}</span>
                <span className="font-medium">CHF {(p.price * p.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t pt-1 flex justify-between font-bold">
              <span>Total</span>
              <span>CHF {orderResult.totalAmount.toFixed(2)}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={() => { setQrUrl(null); setQrDataUrl(null); setOrderResult(null); setInputText(""); }}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Neue Bestellung
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-bold text-gray-800">Manuelle Bestellung</h3>
          <p className="text-xs text-gray-500">{station.station.name}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <XCircle className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-4">
        <p className="text-sm text-gray-600">
          Beschreiben Sie die Bestellung in natürlicher Sprache. Die KI erkennt die Produkte aus der Speisekarte.
        </p>

        {/* Text-Eingabe */}
        <div className="relative">
          <textarea
            className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            rows={4}
            placeholder="z.B. '2 Coca-Cola, 1 Wasser, 3 Bier' oder sprechen Sie die Bestellung ein…"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
          />
        </div>

        {/* Sprach-Button */}
        <Button
          variant={isRecording ? "destructive" : "outline"}
          className={`w-full ${isRecording ? "animate-pulse" : ""}`}
          onClick={isRecording ? stopRecording : startRecording}
        >
          {isRecording ? (
            <><MicOff className="h-4 w-4 mr-2" />Aufnahme stoppen</>
          ) : (
            <><Mic className="h-4 w-4 mr-2" />Sprachbestellung aufnehmen</>
          )}
        </Button>

        {/* Absenden */}
        <Button
          className="w-full"
          onClick={() => createOrder.mutate({ stationId: station.station.id, inputText, origin: window.location.origin })}
          disabled={!inputText.trim() || createOrder.isPending}
        >
          {createOrder.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />KI analysiert Bestellung…</>
          ) : (
            <><QrCode className="h-4 w-4 mr-2" />QR-Code generieren</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Hilfsfunktion für VAPID ─────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function KioskMonitor() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedStation, setSelectedStation] = useState<LiveStation | null>(null);
  const [rightPanel, setRightPanel] = useState<"session" | "order" | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const subscribeKioskPush = trpc.kiosk.subscribeKioskPush.useMutation();
  const unsubscribeKioskPush = trpc.kiosk.unsubscribeKioskPush.useMutation();
  const { data: vapidData } = trpc.kiosk.getKioskVapidKey.useQuery();

  // Prüfen ob Push bereits aktiv
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => setPushEnabled(!!sub));
    });
  }, []);

  const togglePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push-Benachrichtigungen werden in diesem Browser nicht unterstützt");
      return;
    }
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribeKioskPush.mutateAsync({ endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        toast.success("Push-Benachrichtigungen deaktiviert");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast.error("Benachrichtigungen blockiert – bitte in Browser-Einstellungen erlauben");
          return;
        }
        const publicKey = vapidData?.publicKey;
        if (!publicKey) { toast.error("VAPID-Key nicht verfügbar"); return; }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const json = sub.toJSON();
        await subscribeKioskPush.mutateAsync({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        });
        setPushEnabled(true);
        toast.success("🔔 Push-Benachrichtigungen aktiviert! Sie werden bei Service-Rufen und Altersverifikationen benachrichtigt.");
      }
    } catch {
      toast.error("Push-Registrierung fehlgeschlagen");
    } finally {
      setPushLoading(false);
    }
  };

  const { data: liveStations = [], refetch } = trpc.kiosk.getLiveStations.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const { data: spotChecks = [] } = trpc.kiosk.getPendingSpotChecks.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const { data: recentSessions = [] } = trpc.kiosk.getRecentSessions.useQuery({ limit: 20 });

  const utils = trpc.useUtils();
  const { data: lockStatuses = [] } = trpc.kiosk.getLockStatus.useQuery(
    { restaurantId: user?.restaurantId ?? 0 },
    { enabled: !!user?.restaurantId, refetchInterval: 5000 }
  );
  const forceReleaseLock = trpc.kiosk.forceReleaseLock.useMutation({
    onSuccess: () => {
      toast.success("Lock aufgehoben – Kasse ist wieder frei");
      utils.kiosk.getLockStatus.invalidate();
      utils.kiosk.getLiveStations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const getLockInfo = (stationId: number): LockInfo | undefined =>
    (lockStatuses as LockInfo[]).find((l: LockInfo) => l.id === stationId);

  // Statistiken
  const totalActive = (liveStations as LiveStation[]).filter((s: LiveStation) => s.displayStatus !== "idle").length;
  const totalSpotChecks = spotChecks.length;
  const totalServiceCalls = (liveStations as LiveStation[]).filter((s: LiveStation) => s.displayStatus === "service_called").length;

  const handleStationClick = (s: LiveStation) => {
    setSelectedStation(s);
    setRightPanel("session");
  };

  // Automatisch Stichprobe-Panel öffnen wenn neue Stichprobe
  useEffect(() => {
    if (totalSpotChecks > 0 && !selectedStation) {
      const withSpot = (liveStations as LiveStation[]).find((s: LiveStation) => s.spotCheck);
      if (withSpot) {
        setSelectedStation(withSpot);
        setRightPanel("session");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSpotChecks]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Kiosk-Überwachung
            </h1>
            <p className="text-sm text-gray-500">Echtzeit-Kassenmonitoring · Aktualisierung alle 5s</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={pushEnabled ? "default" : "outline"}
              size="sm"
              onClick={togglePush}
              disabled={pushLoading}
              title={pushEnabled ? "Push-Benachrichtigungen deaktivieren" : "Push-Benachrichtigungen aktivieren"}
              className={pushEnabled ? "bg-green-500 hover:bg-green-600 text-white" : ""}
            >
              {pushLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bell className={`h-4 w-4 ${pushEnabled ? "" : "mr-1"}`} />
              )}
              {!pushEnabled && !pushLoading && "Alerts aktivieren"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Aktualisieren
            </Button>
          </div>
        </div>

        {/* Schnell-Statistiken */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{totalActive}</p>
            <p className="text-xs text-orange-500">Aktive Kassen</p>
          </div>
          <div className={`${totalServiceCalls > 0 ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200"} border rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${totalServiceCalls > 0 ? "text-red-600" : "text-gray-400"}`}>{totalServiceCalls}</p>
            <p className={`text-xs ${totalServiceCalls > 0 ? "text-red-500" : "text-gray-400"}`}>Service-Rufe</p>
          </div>
          <div className={`${totalSpotChecks > 0 ? "bg-purple-50 border-purple-300" : "bg-gray-50 border-gray-200"} border rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${totalSpotChecks > 0 ? "text-purple-600" : "text-gray-400"}`}>{totalSpotChecks}</p>
            <p className={`text-xs ${totalSpotChecks > 0 ? "text-purple-500" : "text-gray-400"}`}>Stichproben</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Linke Spalte: Kassen-Grid */}
        <div className={`flex flex-col ${selectedStation ? "w-1/2 lg:w-3/5" : "w-full"} overflow-y-auto p-4`}>

          {/* Kassen-Icons */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Kassenstationen ({liveStations.length})
            </p>
            {liveStations.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Monitor className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Keine Kiosk-Stationen konfiguriert</p>
                <p className="text-xs mt-1">Stationen unter Admin → Kiosk einrichten</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {(liveStations as LiveStation[]).map((s: LiveStation) => (
                  <StationIcon
                    key={s.station.id}
                    data={s}
                    selected={selectedStation?.station.id === s.station.id}
                    onClick={() => handleStationClick(s)}
                    lockInfo={getLockInfo(s.station.id)}
                    onForceRelease={(stationId) => forceReleaseLock.mutate({ stationId })}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Offene Stichproben */}
          {spotChecks.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-3 flex items-center gap-1">
                <Search className="h-3.5 w-3.5" />
                Offene Stichproben ({spotChecks.length})
              </p>
              <div className="space-y-2">
                {(spotChecks as Array<{ check: { id: number; stationId: number; triggerReason: string; triggeredAt: string }; stationName: string | null }>).map((sc) => (
                  <Card key={sc.check.id} className="border-purple-200 bg-purple-50">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-purple-700">{sc.stationName ?? `Kasse ${sc.check.stationId}`}</p>
                        <p className="text-xs text-purple-600">{sc.check.triggerReason}</p>
                        <p className="text-[10px] text-purple-400">
                          {new Date(sc.check.triggeredAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-purple-500 hover:bg-purple-600 text-white"
                        onClick={() => {
                          const st = (liveStations as LiveStation[]).find((s: LiveStation) => s.station.id === sc.check.stationId);
                          if (st) { setSelectedStation(st); setRightPanel("session"); }
                        }}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Prüfen
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Letzte Sessions */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Letzte Sessions
            </p>
            <div className="space-y-2">
              {(recentSessions as Array<{ session: { sessionId: string; status: string; scanCount: number; paymentStatus: string; startedAt: string; totalAmount: string | null }; stationName: string | null }>).slice(0, 10).map((row, i) => (
                <div key={i} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                  <div className={`w-2 h-8 rounded-full ${
                    row.session.paymentStatus === "paid" ? "bg-green-400" :
                    row.session.status === "aborted" ? "bg-red-300" :
                    row.session.status === "active" ? "bg-orange-400" : "bg-gray-200"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{row.stationName ?? "Unbekannte Kasse"}</p>
                    <p className="text-xs text-gray-400">
                      {row.session.scanCount} Scans ·{" "}
                      {new Date(row.session.startedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="text-right">
                    {row.session.totalAmount && (
                      <p className="text-sm font-bold text-gray-700">CHF {Number(row.session.totalAmount).toFixed(2)}</p>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${
                      row.session.paymentStatus === "paid" ? "border-green-300 text-green-600" :
                      row.session.status === "aborted" ? "border-red-300 text-red-500" :
                      "border-gray-200 text-gray-400"
                    }`}>
                      {row.session.paymentStatus === "paid" ? "Bezahlt" :
                       row.session.status === "aborted" ? "Abgebrochen" :
                       row.session.status === "active" ? "Aktiv" : "Beendet"}
                    </Badge>
                  </div>
                </div>
              ))}
              {recentSessions.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Noch keine Sessions</p>
              )}
            </div>
          </div>
        </div>

        {/* Rechte Spalte: Detail-Panel */}
        {selectedStation && (
          <div className="w-1/2 lg:w-2/5 border-l bg-white flex flex-col overflow-hidden">
            {/* Panel-Tabs */}
            <div className="flex border-b">
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${rightPanel === "session" ? "border-b-2 border-primary text-primary" : "text-gray-500 hover:text-gray-700"}`}
                onClick={() => setRightPanel("session")}
              >
                <Activity className="h-4 w-4 inline mr-1" />
                Session
              </button>
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${rightPanel === "order" ? "border-b-2 border-primary text-primary" : "text-gray-500 hover:text-gray-700"}`}
                onClick={() => setRightPanel("order")}
              >
                <ShoppingCart className="h-4 w-4 inline mr-1" />
                Bestellung
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {rightPanel === "session" && (
                <SessionDetailPanel
                  station={selectedStation}
                  onClose={() => { setSelectedStation(null); setRightPanel(null); }}
                />
              )}
              {rightPanel === "order" && (
                <ManualOrderPanel
                  station={selectedStation}
                  onClose={() => { setSelectedStation(null); setRightPanel(null); }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
