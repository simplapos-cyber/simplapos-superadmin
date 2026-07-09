/**
 * KioskGuestPage – Gast-Kiosk-Flow (Self-Service)
 * 1. Datenschutz-Hinweis akzeptieren
 * 2. Kamera öffnen & Produkte im Rahmen fotografieren
 * 3. KI erkennt Produkte → Bestätigungsliste
 * 4. Online bezahlen (Stripe) → Bestellung automatisch im POS
 *
 * Schutzmechanismen:
 * - Session-Timeout (3 Min. Inaktivität)
 * - Bildschirm-Erkennung (KI)
 * - Altersverifikation bei Alkohol
 * - Preis-Schwellenwert (CHF 50)
 * - Mengenplausibilität (max. 10 Produkte)
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Bell,
  Loader2,
  ChevronRight,
  ScanLine,
  CreditCard,
  XCircle,
  Wine,
  Clock,
  MonitorSmartphone,
  MessageCircle,
  Send,
  UserCheck,
  Utensils,
  Plus,
  Minus,
  Sparkles,
  Tag,
  Package,
  Heart,
  Gift,
  Share2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const SESSION_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const PRICE_THRESHOLD_CHF = 50; // CHF 50 requires staff confirmation

type Step = "loading" | "error" | "consent" | "busy" | "camera" | "scanning" | "confirm" | "age_verification" | "paying" | "success" | "cancelled" | "service_waiting";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface RecognizedProduct {
  id: number;
  name: string;
  price: number;
  quantity: number;
  confidence: string;
  matched?: boolean;
  requiresAgeVerification?: boolean;
}

// Animated scanning progress screen
function ScanningScreen({ capturedImage, onRetry }: { capturedImage: string | null; onRetry?: () => void }) {
  const steps = [
    { label: "Foto wird vorbereitet…", duration: 800 },
    { label: "Referenzbilder werden geladen…", duration: 2500 },
    { label: "KI analysiert Produkte…", duration: 3500 },
    { label: "Ergebnisse werden aufbereitet…", duration: 1200 },
  ];
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  // RU-4: Retry-Button nach 20s
  const [showRetryButton, setShowRetryButton] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setShowSlowWarning(true), 8000);
    const t2 = setTimeout(() => setShowRetryButton(true), 20000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    let elapsed = 0;
    const total = steps.reduce((s, x) => s + x.duration, 0);
    const interval = setInterval(() => {
      elapsed += 80;
      setProgress(Math.min(95, (elapsed / total) * 100));
      let acc = 0;
      for (let i = 0; i < steps.length; i++) {
        acc += steps[i].duration;
        if (elapsed < acc) { setStepIndex(i); break; }
      }
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      {capturedImage && (
        <div className="w-full max-w-sm rounded-2xl overflow-hidden mb-6 shadow-md relative">
          <img src={capturedImage} alt="Scan" className="w-full h-48 object-cover" />
          <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
            <ScanLine className="h-16 w-16 text-primary animate-pulse" />
          </div>
        </div>
      )}
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-1">Produkte werden erkannt</h2>
          <p className="text-sm text-primary font-medium min-h-[20px] transition-all duration-300">
            {steps[stepIndex]?.label}
          </p>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Step indicators */}
        <div className="flex justify-between">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`w-3 h-3 rounded-full transition-all duration-300 ${
                i < stepIndex ? "bg-green-500" :
                i === stepIndex ? "bg-primary animate-pulse" :
                "bg-gray-200"
              }`} />
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400">Dies kann 5–10 Sekunden dauern</p>
        {/* Timeout-Indikator: erscheint nach 8 Sekunden */}
        {showSlowWarning && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700 animate-in fade-in duration-500">
            <Clock className="h-4 w-4 shrink-0 text-amber-500" />
            <span>Die KI braucht etwas länger – bitte warten Sie noch einen Moment.</span>
          </div>
        )}
        {/* RU-4: Retry-Button erscheint nach 20s */}
        {showRetryButton && onRetry && (
          <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <p className="text-xs text-gray-500 text-center">
              Die KI antwortet nicht. Möchten Sie es nochmals versuchen?
            </p>
            <button
              onClick={onRetry}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium shadow hover:bg-primary/90 active:scale-95 transition-all duration-150"
            >
              <RotateCcw className="h-4 w-4" />
              Nochmals fotografieren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KioskGuestPage() {
  const { token } = useParams<{ token: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("session_id");
  const cancelled = params.get("cancelled");

  const [step, setStep] = useState<Step>("loading");
  const [products, setProducts] = useState<RecognizedProduct[]>([]);
  const [unrecognized, setUnrecognized] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [paidProducts, setPaidProducts] = useState<RecognizedProduct[]>([]);
  const [paidTotal, setPaidTotal] = useState<number>(0);
  const [paidAt, setPaidAt] = useState<Date | null>(null);
  const [pickupNumber, setPickupNumber] = useState<number | null>(null);
  // Gemischter Warenkorb: Essen-Bestellungen
  interface FoodCartItem { menuItemId: number; name: string; price: number; quantity: number; }
  const [foodCart, setFoodCart] = useState<FoodCartItem[]>([]);
  const [showFoodMenu, setShowFoodMenu] = useState(false);
  const [ageVerificationId, setAgeVerificationId] = useState<string | null>(null);
  const [ageVerificationPending, setAgeVerificationPending] = useState(false);
  const [sessionTimeoutWarning, setSessionTimeoutWarning] = useState(false);
  // Live-Rahmenerkennung: true = physischer weisser Rahmen erkannt, null = noch nicht geprüft
  const [frameDetected, setFrameDetected] = useState<boolean | null>(null);
  // Session-Lock: exklusiver Zugang zur Kasse
  const [lockToken, setLockToken] = useState<string | null>(null);
  const [lockBusyWaitSec, setLockBusyWaitSec] = useState<number>(0);
  // LL-8: Wartezeit-Tracking – Zeitstempel wenn Busy-Screen erscheint
  const waitStartedAtRef = useRef<number | null>(null);
  // lockToken in Ref spiegeln damit Callbacks immer den aktuellen Wert sehen
  useEffect(() => { lockTokenRef.current = lockToken; }, [lockToken]);
  // Session-Tracking
  const [kioskSessionId, setKioskSessionId] = useState<string | null>(null);
  // Service-Warte-Screen
  const [serviceWaitCountdown, setServiceWaitCountdown] = useState(20);
  // KI-Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCheckCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCheckInProgressRef = useRef(false);
  // Ref für lockToken damit Session-Timeout-Callback immer den aktuellen Wert sieht
  const lockTokenRef = useRef<string | null>(null);

  // Load station info
  const { data: station, error: stationError } = trpc.kiosk.getStationByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  // Handle URL params: success or cancelled redirect from Stripe
  useEffect(() => {
    if (sessionId && token && station) {
      setStep("paying");
    } else if (cancelled && station) {
      setStep("cancelled");
    } else if (station) {
      setStep("consent");
    }
  }, [station, sessionId, cancelled, token]);

  useEffect(() => {
    if (stationError) setStep("error");
  }, [stationError]);

  // ── Session timeout ──────────────────────────────────────────────────────
  const resetSessionTimer = useCallback(() => {
    setSessionTimeoutWarning(false);
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    // Warn at 2:30
    warningTimerRef.current = setTimeout(() => {
      setSessionTimeoutWarning(true);
    }, SESSION_TIMEOUT_MS - 30000);

    // Reset at 3:00
    sessionTimerRef.current = setTimeout(() => {
      // Stop camera if open
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setProducts([]);
      setCapturedImage(null);
      setSessionTimeoutWarning(false);
      // Lock freigeben bei Session-Timeout (lockTokenRef hat immer den aktuellen Wert)
      if (token && lockTokenRef.current) {
        releaseLockMutation.mutate({ token, lockToken: lockTokenRef.current });
        lockTokenRef.current = null;
        setLockToken(null);
      }
      setStep("consent");
      toast.info("Sitzung abgelaufen. Bitte neu starten.");
    }, SESSION_TIMEOUT_MS);
  }, []);

  // Session starten wenn Gast Kamera öffnet (LL-8: Wartezeit-Daten mitsenden)
  useEffect(() => {
    if (step === "camera" && token && !kioskSessionId) {
      const waitStartedAt = pendingWaitStartedAtRef.current;
      const waitEndedAt = pendingWaitEndedAtRef.current;
      pendingWaitStartedAtRef.current = undefined;
      pendingWaitEndedAtRef.current = undefined;
      startSessionMutation.mutateAsync({ token, waitStartedAt, waitEndedAt })
        .then(res => setKioskSessionId(res.sessionId))
        .catch(() => {}); // silent fail
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, token]);

  // Start session timer when leaving consent
  useEffect(() => {
    if (step !== "consent" && step !== "loading" && step !== "success" && step !== "error") {
      resetSessionTimer();
    } else {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      setSessionTimeoutWarning(false);
    }
    return () => {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [step, resetSessionTimer]);

  const scanMutation = trpc.kiosk.scanProducts.useMutation();
  const checkoutMutation = trpc.kiosk.createKioskCheckout.useMutation();
  // Upselling-Vorschläge nach Scan (nur wenn Produkte erkannt)
  const scannedLabels = useMemo(() => products.map(p => p.name), [products]);
  const scannedProductIds = useMemo(() => products.filter(p => p.id > 0).map(p => p.id), [products]);
  const upsellingQuery = trpc.upselling.getSuggestions.useQuery(
    { sessionId: kioskSessionId ?? "", scannedLabels, scannedProductIds },
    { enabled: step === "confirm" && !!kioskSessionId && products.length > 0, staleTime: 30000, retry: false, throwOnError: false }
  );
  // Speisekarte für Essen-Tab
  const menuQuery = trpc.pickup.getKioskMenu.useQuery(
    { sessionId: kioskSessionId ?? "" },
    { enabled: showFoodMenu && !!kioskSessionId, staleTime: 60000, retry: false, throwOnError: false }
  );
  const confirmPaymentMutation = trpc.kiosk.confirmKioskPayment.useMutation();
  const callServiceMutation = trpc.kiosk.callService.useMutation();
  const requestAgeVerificationMutation = trpc.kiosk.requestAgeVerification.useMutation();
  const checkFrameMutation = trpc.kiosk.checkFrame.useMutation();
  const startSessionMutation = trpc.kiosk.startSession.useMutation();
  const logEventMutation = trpc.kiosk.logEvent.useMutation();
  const endSessionMutation = trpc.kiosk.endSession.useMutation();
  const acquireLockMutation = trpc.kiosk.acquireLock.useMutation();
  const releaseLockMutation = trpc.kiosk.releaseLock.useMutation();
  const checkLockQuery = trpc.kiosk.checkLock.useQuery(
    { token: token ?? "" },
    { enabled: step === "busy" && !!token, refetchInterval: 3000, throwOnError: false }
  );

  // PCF-3: Marketing-Config laden (nur wenn success-Screen angezeigt wird)
  const marketingQuery = trpc.kiosk.getMarketingConfig.useQuery(
    { token: token ?? "" },
    { enabled: step === "success" && !!token, staleTime: 300000, retry: false, throwOnError: false }
  );

  // Wenn Kasse frei wird (busy-Screen polling), automatisch zur Kamera wechseln
  useEffect(() => {
    if (step === "busy" && checkLockQuery.data?.free) {
      handleStartCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checkLockQuery.data]);

  // LL-8: Wartezeit-Tracking – waitStartedAt setzen wenn Busy-Screen erscheint
  useEffect(() => {
    if (step === "busy" && !waitStartedAtRef.current) {
      waitStartedAtRef.current = Date.now();
    } else if (step !== "busy") {
      waitStartedAtRef.current = null;
    }
  }, [step]);
  // checkAgeVerificationStatus is polled manually via fetch in the age_verification useEffect

  // Confirm payment after Stripe redirect
  useEffect(() => {
    if (step === "paying" && sessionId && token) {
      // PCF-1+PCF-2: gespeicherte Daten aus sessionStorage wiederherstellen
      const saveKey = `kiosk_pre_stripe_${token}`;
      let savedLockToken: string | null = null;
      let savedProducts: RecognizedProduct[] = [];
      try {
        const raw = sessionStorage.getItem(saveKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { lockToken?: string; products?: RecognizedProduct[] };
          savedLockToken = parsed.lockToken ?? null;
          savedProducts = parsed.products ?? [];
          sessionStorage.removeItem(saveKey);
        }
      } catch { /* ignore */ }
      // PCF-1: Lock sofort freigeben (vor API-Call, damit Kasse nicht blockiert bleibt)
      if (token && savedLockToken) {
        releaseLockMutation.mutate({ token, lockToken: savedLockToken });
        setLockToken(null);
        lockTokenRef.current = null;
      }
      confirmPaymentMutation.mutateAsync({ token, sessionId })
        .then((result) => {
          setOrderNumber(result.orderNumber);
          // PCF-2: Produkte aus sessionStorage verwenden (State ist nach Redirect leer)
          const allProducts = savedProducts.length > 0 ? savedProducts : products;
          setPaidProducts(allProducts.filter((p) => p.id !== -1));
          setPaidTotal(result.total);
          setPaidAt(new Date());
          if ((result as { pickupNumber?: number }).pickupNumber) {
            setPickupNumber((result as { pickupNumber?: number }).pickupNumber ?? null);
          }
          setStep("success");
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Zahlung konnte nicht bestätigt werden";
          toast.error(msg);
          setStep("confirm");
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Poll age verification status
  useEffect(() => {
    if (step !== "age_verification" || !ageVerificationId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/trpc/kiosk.checkAgeVerificationStatus?input=${encodeURIComponent(JSON.stringify({ sessionToken: ageVerificationId }))}`);
        const json = await res.json() as { result?: { data?: { status?: string } } };
        const status = json?.result?.data?.status;
        if (status === "approved") {
          clearInterval(interval);
          setAgeVerificationPending(false);
          handlePayAfterAgeVerification();
        } else if (status === "rejected" || status === "expired") {
          clearInterval(interval);
          setAgeVerificationPending(false);
          toast.error("Altersverifikation abgelehnt. Alkoholische Produkte können nicht verkauft werden.");
          setStep("confirm");
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ageVerificationId]);

  // ── Live-Rahmenerkennung: alle 2s ein kleines Vorschaubild aus dem Video-Stream an KI senden ──
  useEffect(() => {
    if (step !== "camera" || !token) {
      // Kamera-Schritt verlassen: Intervall stoppen und Status zurücksetzen
      if (frameCheckIntervalRef.current) {
        clearInterval(frameCheckIntervalRef.current);
        frameCheckIntervalRef.current = null;
      }
      setFrameDetected(null);
      return;
    }

    // Kurz warten bis Video-Stream läuft, dann ersten Check starten
    const startChecking = () => {
      if (frameCheckIntervalRef.current) clearInterval(frameCheckIntervalRef.current);

      frameCheckIntervalRef.current = setInterval(async () => {
        if (frameCheckInProgressRef.current) return; // vorherigen Check nicht unterbrechen
        const video = videoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;

        frameCheckInProgressRef.current = true;
        try {
          // Kleines Vorschaubild erstellen (320x240) für schnelle Übertragung
          const previewCanvas = frameCheckCanvasRef.current;
          if (!previewCanvas) return;
          previewCanvas.width = 320;
          previewCanvas.height = 240;
          const ctx = previewCanvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, 320, 240);
          const dataUrl = previewCanvas.toDataURL("image/jpeg", 0.5);
          // data:image/jpeg;base64,<base64> → nur den base64-Teil
          const base64 = dataUrl.split(",")[1];
          if (!base64) return;

          const result = await checkFrameMutation.mutateAsync({ token, imageBase64: base64 });
          setFrameDetected(result.frameDetected);
        } catch {
          // Netzwerkfehler ignorieren, Status nicht ändern
        } finally {
          frameCheckInProgressRef.current = false;
        }
      }, 2000); // alle 2 Sekunden
    };

    // 500ms Verzögerung damit der Video-Stream Zeit hat zu starten
    const startDelay = setTimeout(startChecking, 500);
    return () => {
      clearTimeout(startDelay);
      if (frameCheckIntervalRef.current) {
        clearInterval(frameCheckIntervalRef.current);
        frameCheckIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, token]);

  // Kasse reservieren und dann Kamera starten
  const handleStartCamera = useCallback(async () => {
    if (!token) return;
    try {
      const res = await acquireLockMutation.mutateAsync({ token });
      setLockToken(res.lockToken);
      // LL-8: Wartezeit beenden und an startSession übergeben
      const waitEndedAt = waitStartedAtRef.current ? Date.now() : undefined;
      const waitStartedAt = waitStartedAtRef.current ?? undefined;
      waitStartedAtRef.current = null;
      startCamera(waitStartedAt, waitEndedAt);
    } catch (err: unknown) {
      // CONFLICT = Kasse belegt
      const trpcErr = err as { data?: { code?: string }; message?: string };
      if (trpcErr?.data?.code === "CONFLICT") {
        const waitSec = parseInt((trpcErr.message ?? "").match(/(\d+)/)?.[1] ?? "60");
        setLockBusyWaitSec(waitSec);
        setStep("busy");
      } else {
        toast.error("Kasse konnte nicht gestartet werden. Bitte erneut versuchen.");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Lock freigeben (nach Zahlung, Reset oder Abbruch)
  const releaseLock = useCallback(() => {
    if (token && lockToken) {
      releaseLockMutation.mutate({ token, lockToken });
      setLockToken(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, lockToken]);

  // Start camera: stop old stream, get new one, assign to video immediately if mounted
  const pendingStreamRef = useRef<MediaStream | null>(null);

  // LL-8: Wartezeit-Refs für startSession
  const pendingWaitStartedAtRef = useRef<number | undefined>(undefined);
  const pendingWaitEndedAtRef = useRef<number | undefined>(undefined);

  const startCamera = useCallback(async (waitStartedAt?: number, waitEndedAt?: number) => {
    // LL-8: Wartezeiten für nächsten startSession-Aufruf merken
    pendingWaitStartedAtRef.current = waitStartedAt;
    pendingWaitEndedAtRef.current = waitEndedAt;
    // Always stop existing stream before starting a new one
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      // If video element is already in the DOM (retake case), assign directly
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        pendingStreamRef.current = null;
      } else {
        // First time: video not yet mounted, store for the useEffect below
        pendingStreamRef.current = stream;
      }
      setStep("camera");
    } catch {
      toast.error("Kamera konnte nicht geöffnet werden. Bitte Kamera-Berechtigung erlauben.");
    }
  }, []);

  // After step=camera, video element is mounted for the first time – assign pending stream
  useEffect(() => {
    if (step === "camera" && pendingStreamRef.current && videoRef.current) {
      const video = videoRef.current;
      const stream = pendingStreamRef.current;
      pendingStreamRef.current = null;
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [step]);

  // Stop camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Capture photo and send to AI
  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !token) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // Max 1200px Breite, 75% JPEG-Qualität – gute Erkennungsqualität
    // (Lernbilder werden serverseitig auf 400px komprimiert um Gesamtgrösse zu begrenzen)
    const MAX_WIDTH = 1200;
    const scale = video.videoWidth > MAX_WIDTH ? MAX_WIDTH / video.videoWidth : 1;
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.75);
    setCapturedImage(imageBase64);
    stopCamera();
    setStep("scanning");

    // Event loggen
    if (kioskSessionId && token) {
      const isRepeat = capturedImage !== null;
      logEventMutation.mutate({
        token,
        sessionId: kioskSessionId,
        eventType: isRepeat ? "scan_repeated" : "scan_started",
        payload: {},
      });
    }

    try {
      const result = await scanMutation.mutateAsync({ token, imageBase64 });

      const prods = (result.products ?? []).filter(Boolean) as RecognizedProduct[];
      setProducts(prods);
      setUnrecognized(result.unrecognized ?? 0);

      if (prods.length === 0) {
        const unrecog = result.unrecognized ?? 0;
        if (unrecog > 0) {
          toast.warning(`${unrecog} Produkt${unrecog > 1 ? "e" : ""} erkannt, aber nicht in der Speisekarte. Bitte Service rufen oder nochmals fotografieren.`);
        } else {
          toast.warning("Keine Produkte erkannt. Bitte Produkte deutlich sichtbar fotografieren und nochmals versuchen.");
        }
        setStep("camera");
        await startCamera();
        return;
      }
      if (kioskSessionId && token) {
        logEventMutation.mutate({ token, sessionId: kioskSessionId, eventType: "scan_completed", payload: { productCount: prods.length } });
      }
      setStep("confirm");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      toast.error(`Fehler: ${msg.slice(0, 120)}`);
      setStep("camera");
      await startCamera();
    }
  }, [token, kioskSessionId, capturedImage, scanMutation, logEventMutation, stopCamera, startCamera]);

  const handleRetake = useCallback(async () => {
    setProducts([]);
    setCapturedImage(null);
    setStep("camera");
    await startCamera();
  }, [startCamera]);

  // Service-Warte-Countdown
  useEffect(() => {
    if (step !== "service_waiting") return;
    setServiceWaitCountdown(20);
    const interval = setInterval(() => {
      setServiceWaitCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // KI-Chat: Nachricht senden
  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/trpc/kiosk.guestChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { message: userMsg, restaurantName: station?.restaurantName ?? "" } }),
      });
      const data = await res.json() as { result?: { data?: { reply?: string } } };
      const reply = data?.result?.data?.reply ?? "Ich konnte Ihre Frage leider nicht beantworten. Bitte rufen Sie den Service.";
      setChatMessages(prev => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", text: "Verbindungsfehler. Bitte Service rufen." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, station]);

  const handleCallService = useCallback(async () => {
    if (!token) return;
    try {
      await callServiceMutation.mutateAsync({ token, sessionId: kioskSessionId ?? undefined });
      setStep("service_waiting");
      setShowChat(false);
      setChatMessages([]);
    } catch {
      toast.error("Fehler beim Rufen des Services");
    }
  }, [token, callServiceMutation, kioskSessionId]);

  const kioskTotal = useMemo(() => products.reduce((sum, p) => sum + p.price * p.quantity, 0), [products]);
  const foodTotal = useMemo(() => foodCart.reduce((sum, f) => sum + f.price * f.quantity, 0), [foodCart]);
  const total = useMemo(() => kioskTotal + foodTotal, [kioskTotal, foodTotal]);
  const hasUnmatched = useMemo(() => products.some((p) => p.id === -1), [products]);
  const payableProducts = useMemo(() => products.filter((p) => p.id !== -1), [products]);
  const hasAgeRestricted = useMemo(() => products.some((p) => p.requiresAgeVerification), [products]);
  const hasAlcohol = hasAgeRestricted; // kept for compatibility
  const exceedsPriceThreshold = useMemo(() => total > PRICE_THRESHOLD_CHF, [total]);

  // Internal pay function (called after age verification if needed)
  const handlePayAfterAgeVerification = useCallback(async () => {
    if (!token || (payableProducts.length === 0 && foodCart.length === 0)) {
      toast.error("Keine bezahlbaren Produkte. Bitte Service rufen.");
      return;
    }
    const foodTotal = foodCart.reduce((s, f) => s + f.price * f.quantity, 0);
    const kioskTotal = payableProducts.reduce((s, p) => s + p.price * p.quantity, 0);
    if (kioskSessionId) {
      logEventMutation.mutate({ token, sessionId: kioskSessionId, eventType: "payment_started", payload: { total: kioskTotal + foodTotal } });
    }
    try {
      const result = await checkoutMutation.mutateAsync({
        token,
        products: payableProducts.map((p) => ({ id: p.id, name: p.name, price: p.price, quantity: p.quantity })),
        foodItems: foodCart,
        sessionId: kioskSessionId ?? undefined,
        origin: window.location.origin,
      });
      // PCF-1+PCF-2: lockToken und Produkte vor Stripe-Redirect in sessionStorage sichern
      const saveKey = `kiosk_pre_stripe_${token}`;
      sessionStorage.setItem(saveKey, JSON.stringify({
        lockToken: lockTokenRef.current,
        products: payableProducts,
      }));
      window.location.href = result.checkoutUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Fehler beim Erstellen der Zahlung";
      toast.error(msg);
      if (kioskSessionId) {
        logEventMutation.mutate({ token, sessionId: kioskSessionId, eventType: "payment_aborted", payload: { reason: msg } });
      }
    }
  }, [token, kioskSessionId, payableProducts, foodCart, checkoutMutation, logEventMutation]);

  // Pay button handler – checks age verification and price threshold first
  const handlePay = useCallback(async () => {
    if (!token || payableProducts.length === 0) {
      toast.error("Keine bezahlbaren Produkte. Bitte Service rufen.");
      return;
    }

    // Price threshold check
    if (exceedsPriceThreshold) {
      toast.warning(`Betrag über CHF ${PRICE_THRESHOLD_CHF}. Bitte Service rufen für Bestätigung.`);
      handleCallService();
      return;
    }

    // Alcohol age verification check
    if (hasAlcohol) {
      try {
        const result = await requestAgeVerificationMutation.mutateAsync({
          token,
          products: payableProducts.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            quantity: p.quantity,
            requiresAgeVerification: p.requiresAgeVerification,
          })),
        });
        setAgeVerificationId(result.sessionToken);
        setAgeVerificationPending(true);
        setStep("age_verification");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Fehler bei Altersverifikation";
        toast.error(msg);
      }
      return;
    }

    await handlePayAfterAgeVerification();
  }, [token, payableProducts, hasAlcohol, exceedsPriceThreshold, products, requestAgeVerificationMutation, handleCallService, handlePayAfterAgeVerification]);

  // ─── Render helpers ────────────────────────────────────────────────────────

  // ─── Busy screen (Kasse belegt) ──────────────────────────────────────────
  if (step === "busy") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-50 p-6 text-center">
        <div className="bg-orange-100 rounded-full p-6 mb-6">
          <Clock className="h-16 w-16 text-orange-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Kasse ist gerade belegt</h1>
        <p className="text-gray-500 mb-2">Ein anderer Gast bezahlt gerade an dieser Kasse.</p>
        <p className="text-sm text-gray-400 mb-8">Die Seite prüft automatisch alle 3 Sekunden ob die Kasse frei ist.</p>
        <div className="flex items-center gap-3 text-orange-600 mb-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Warte auf freie Kasse…</span>
        </div>
        <Button
          variant="outline"
          className="border-orange-300 text-orange-700"
          onClick={() => setStep("consent")}
        >
          Abbrechen
        </Button>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (step === "error" || stationError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Station nicht gefunden</h1>
        <p className="text-gray-500">Dieser QR-Code ist ungültig oder die Station wurde deaktiviert.</p>
      </div>
    );
  }

  // ─── Paying (confirming Stripe payment) ───────────────────────────────────
  if (step === "paying") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Zahlung wird bestätigt…</h2>
        <p className="text-gray-500 text-sm">Bitte warten Sie einen Moment.</p>
      </div>
    );
  }

  // ─── Age verification waiting screen ─────────────────────────────────────
  if (step === "age_verification") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-amber-50 p-6 text-center">
        <div className="bg-amber-100 rounded-full p-6 mb-6">
          <Wine className="h-16 w-16 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Altersverifikation erforderlich</h1>
        <p className="text-gray-600 mb-4">
          Ihre Bestellung enthält altersbeschränkte Produkte (Alkohol oder Tabak). Ein Servicemitarbeiter kommt, um Ihr Alter zu bestätigen.
        </p>

        <div className="bg-white rounded-2xl shadow-sm p-4 w-full max-w-sm mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">Altersbeschränkte Produkte (18+):</p>
          {products.filter((p) => p.requiresAgeVerification).map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <Wine className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-sm text-gray-700">{p.name}</span>
            </div>
          ))}
        </div>

        {ageVerificationPending && (
          <div className="flex items-center gap-3 text-amber-700 mb-6">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Warte auf Bestätigung durch Servicemitarbeiter…</span>
          </div>
        )}

        <Button
          variant="outline"
          className="border-amber-300 text-amber-700 hover:bg-amber-50"
          onClick={() => {
            setAgeVerificationId(null);
            setAgeVerificationPending(false);
            setStep("confirm");
          }}
        >
          Abbrechen
        </Button>
      </div>
    );
  }

  // ─── Success screen ────────────────────────────────────────────────────────
  if (step === "success") {
    const totalItemCount = paidProducts.reduce((sum, p) => sum + p.quantity, 0);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Green header */}
        <div className="bg-green-500 text-white p-6 text-center">
          <CheckCircle2 className="h-14 w-14 mx-auto mb-2" />
          <h1 className="text-2xl font-bold">Bezahlt ✓</h1>
          <p className="text-green-100 text-sm mt-1">Zahlung erfolgreich verarbeitet</p>
        </div>

        {/* ── Abholnummer-Banner (wenn Essen bestellt) ── */}
        {pickupNumber && (
          <div className="bg-orange-500 text-white px-4 py-5 text-center">
            <Utensils className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm font-medium text-orange-100 mb-1">Ihre Abholnummer</p>
            <p className="text-7xl font-black leading-none tracking-tight">{pickupNumber}</p>
            <p className="text-orange-100 text-sm mt-2">Bitte holen Sie Ihr Essen an der Theke ab, wenn Ihre Nummer aufgerufen wird.</p>
          </div>
        )}

        {/* ── Stichproben-Banner ── */}
        <div className="bg-white border-b-4 border-green-400 px-4 py-5 text-center">
          <p className="text-8xl font-black text-green-600 leading-none tracking-tight">
            {totalItemCount}
          </p>
          <p className="text-xl font-bold text-gray-700 mt-1 uppercase tracking-wide">
            {totalItemCount === 1 ? "Produkt" : "Produkte"}
          </p>
          {/* Produkt-Tags für schnelle Stichproben-Kontrolle */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {paidProducts.map((p, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-green-50 border border-green-300 rounded-full px-3 py-1.5 text-sm font-semibold text-green-900"
              >
                <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {p.quantity}
                </span>
                {p.name}
              </span>
            ))}
          </div>
        </div>

        {/* Receipt card */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-md max-w-sm mx-auto overflow-hidden">
            {/* Receipt header */}
            <div className="border-b border-dashed border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Quittung</p>
              {orderNumber && (
                <p className="text-lg font-bold text-gray-800">{orderNumber}</p>
              )}
              {paidAt && (
                <p className="text-xs text-gray-400 mt-1">
                  {paidAt.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  {" "}
                  {paidAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>

            {/* Product list */}
            <div className="p-4 space-y-3">
              {paidProducts.length > 0 ? paidProducts.map((p, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    {p.quantity > 1 && (
                      <p className="text-xs text-gray-400">{p.quantity} × CHF {p.price.toFixed(2)}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                    CHF {(p.price * p.quantity).toFixed(2)}
                  </p>
                </div>
              )) : (
                <p className="text-sm text-gray-400 text-center py-2">Produktliste nicht verfügbar</p>
              )}
            </div>

            {/* Total */}
            <div className="border-t border-dashed border-gray-200 p-4">
              <div className="flex justify-between items-center">
                <p className="text-base font-bold text-gray-800">Total</p>
                <p className="text-xl font-bold text-green-600">CHF {paidTotal.toFixed(2)}</p>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <CreditCard className="h-3 w-3" />
                <span>Online bezahlt</span>
              </div>
            </div>

            {/* BEZAHLT stamp */}
            <div className="border-t border-gray-100 bg-green-50 p-4 text-center">
              <div className="inline-flex items-center gap-2 border-2 border-green-500 rounded-xl px-6 py-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-green-600 font-bold text-lg tracking-widest">BEZAHLT</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">Zeigen Sie diese Quittung dem Personal</p>
            </div>
          </div>
        </div>

        {/* ── Marketing-Block ── */}
        {marketingQuery.data && (
          <div className="px-4 pb-4 max-w-sm mx-auto w-full space-y-3">
            {/* Treuepunkte-CTA */}
            {marketingQuery.data.loyaltyEnabled && (
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="h-5 w-5 text-pink-300" />
                  <p className="font-bold text-base">{marketingQuery.data.loyaltyTitle || "Treuepunkte sammeln"}</p>
                </div>
                <p className="text-sm text-purple-100 mb-3">{marketingQuery.data.loyaltyText || "Melden Sie sich an und sammeln Sie Punkte bei jedem Einkauf!"}</p>
                {marketingQuery.data.loyaltyUrl && (
                  <a
                    href={marketingQuery.data.loyaltyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-white text-purple-700 font-semibold text-sm rounded-xl px-4 py-2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Jetzt anmelden
                  </a>
                )}
              </div>
            )}

            {/* Social Media */}
            {(marketingQuery.data.instagramUrl || marketingQuery.data.facebookUrl || marketingQuery.data.tiktokUrl) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Share2 className="h-4 w-4 text-gray-500" />
                  <p className="font-semibold text-sm text-gray-700">Folgen Sie uns</p>
                </div>
                <div className="flex gap-3">
                  {marketingQuery.data.instagramUrl && (
                    <a href={marketingQuery.data.instagramUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-xl py-2 text-sm font-semibold">
                      Instagram
                    </a>
                  )}
                  {marketingQuery.data.facebookUrl && (
                    <a href={marketingQuery.data.facebookUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 text-white rounded-xl py-2 text-sm font-semibold">
                      Facebook
                    </a>
                  )}
                  {marketingQuery.data.tiktokUrl && (
                    <a href={marketingQuery.data.tiktokUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 bg-black text-white rounded-xl py-2 text-sm font-semibold">
                      TikTok
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Custom CTA */}
            {marketingQuery.data.customCtaEnabled && marketingQuery.data.customCtaTitle && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-5 w-5 text-amber-600" />
                  <p className="font-bold text-sm text-amber-900">{marketingQuery.data.customCtaTitle}</p>
                </div>
                {marketingQuery.data.customCtaText && (
                  <p className="text-sm text-amber-800 mb-3">{marketingQuery.data.customCtaText}</p>
                )}
                {marketingQuery.data.customCtaUrl && marketingQuery.data.customCtaButtonLabel && (
                  <a
                    href={marketingQuery.data.customCtaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-amber-500 text-white font-semibold text-sm rounded-xl px-4 py-2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {marketingQuery.data.customCtaButtonLabel}
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom action */}
        <div className="p-4 bg-white border-t">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              releaseLock();
              window.history.replaceState({}, "", `/kiosk/${token}`);
              setProducts([]);
              setPaidProducts([]);
              setPaidTotal(0);
              setPaidAt(null);
              setOrderNumber(null);
              setStep("consent");
            }}
          >
            Neuer Scan
          </Button>
        </div>
      </div>
    );
  }

  // ─── Service-Warte-Screen ─────────────────────────────────────────────────
  if (step === "service_waiting") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        {/* Animated icon */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center">
            <UserCheck className="h-12 w-12 text-orange-500" />
          </div>
          <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
            {serviceWaitCountdown > 0 ? serviceWaitCountdown : "✓"}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-2">Service ist auf dem Weg</h1>
        <p className="text-gray-500 mb-1">Ein Mitarbeiter kommt in ca. 20 Sekunden zu Ihnen.</p>
        <p className="text-sm text-gray-400 mb-8">Bitte bleiben Sie an der Station.</p>

        {/* Countdown-Balken */}
        <div className="w-full max-w-xs bg-gray-100 rounded-full h-2 mb-8">
          <div
            className="bg-orange-400 h-2 rounded-full transition-all duration-1000"
            style={{ width: `${(serviceWaitCountdown / 20) * 100}%` }}
          />
        </div>

        {/* KI-Chat Toggle */}
        {!showChat ? (
          <div className="w-full max-w-sm space-y-3">
            <button
              className="w-full flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-left hover:bg-blue-100 transition-colors"
              onClick={() => {
                setShowChat(true);
                if (chatMessages.length === 0) {
                  setChatMessages([{ role: "assistant", text: "Hallo! Ich bin Ihr digitaler Assistent. Wie kann ich Ihnen helfen, während Sie auf den Service warten?" }]);
                }
              }}
            >
              <MessageCircle className="h-6 w-6 text-blue-500 shrink-0" />
              <div>
                <p className="font-medium text-blue-800 text-sm">Haben Sie Fragen?</p>
                <p className="text-xs text-blue-600">KI-Assistent – sofort antworten</p>
              </div>
            </button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setStep(products.length > 0 ? "confirm" : "consent");
              }}
            >
              Zurück zur Bestellung
            </Button>
          </div>
        ) : (
          <div className="w-full max-w-sm flex flex-col" style={{ height: 320 }}>
            {/* Chat-Verlauf */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-3 p-3 bg-gray-50 rounded-2xl">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white rounded-br-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
            </div>
            {/* Eingabe */}
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Ihre Frage…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleChatSend()}
              />
              <button
                className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center disabled:opacity-50"
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <button className="mt-2 text-xs text-gray-400 text-center" onClick={() => setShowChat(false)}>Chat schliessen</button>
          </div>
        )}
      </div>
    );
  }

  // ─── Cancelled screen ─────────────────────────────────────────────────────
  if (step === "cancelled") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-50 p-6 text-center">
        <XCircle className="h-16 w-16 text-orange-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Zahlung abgebrochen</h1>
        <p className="text-gray-500 mb-6">Die Zahlung wurde nicht abgeschlossen.</p>
        <Button
          size="lg"
          onClick={() => {
            window.history.replaceState({}, "", `/kiosk/${token}`);
            if (products.length > 0) {
              setStep("confirm");
            } else {
              setStep("consent");
            }
          }}
        >
          Nochmals versuchen
        </Button>
      </div>
    );
  }

  // ─── Consent screen ────────────────────────────────────────────────────────
  if (step === "consent") {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-6 text-center">
          <ScanLine className="h-10 w-10 mx-auto mb-2" />
          <h1 className="text-2xl font-bold">{station?.restaurantName}</h1>
          <p className="text-sm opacity-80 mt-1">Kiosk-Scan · {station?.name}</p>
        </div>

        <div className="flex-1 p-6 flex flex-col gap-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">So funktioniert es</h2>
            <p className="text-gray-500 text-sm">Legen Sie Ihre Produkte in den Rahmen auf dem Tisch und fotografieren Sie sie ab.</p>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {[
              { icon: "1", text: "Alle Produkte vollständig in den Rahmen legen" },
              { icon: "2", text: "Foto aufnehmen" },
              { icon: "3", text: "Liste prüfen & bestätigen" },
              { icon: "4", text: "Online bezahlen (Karte / TWINT)" },
            ].map((s) => (
              <div key={s.icon} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                  {s.icon}
                </div>
                <span className="text-gray-700">{s.text}</span>
              </div>
            ))}
          </div>

          {/* Privacy notice */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800 mb-1">Datenschutz & Sicherheit</p>
                  <p className="text-xs text-blue-700">
                    Fotos werden ausschliesslich für die Produkterkennung verwendet und sofort danach gelöscht.
                    Bei Alkohol und Tabakprodukten ist eine Altersverifikation (18+) erforderlich.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            size="lg"
            className="w-full h-14 text-base font-semibold"
            onClick={handleStartCamera}
          >
            <Camera className="mr-2 h-5 w-5" />
            Verstanden – Kamera öffnen
            <ChevronRight className="ml-auto h-5 w-5" />
          </Button>

          <p className="text-center text-xs text-gray-400">
            Mit dem Fortfahren akzeptieren Sie die Nutzungsbedingungen und den Datenschutzhinweis.
          </p>
        </div>
      </div>
    );
  }

  // ─── Camera screen ─────────────────────────────────────────────────────────
  if (step === "camera") {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        {/* Session timeout warning */}
        {sessionTimeoutWarning && (
          <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
            <Clock className="h-4 w-4" />
            Sitzung läuft in 30 Sekunden ab
          </div>
        )}

        {/* Rahmen-Status-Banner */}
        <div className={`px-4 py-2 text-center text-sm flex items-center justify-center gap-2 transition-colors duration-300 ${
          frameDetected === true
            ? "bg-green-600 text-white"
            : frameDetected === false
            ? "bg-red-600 text-white"
            : "bg-gray-800 text-white/70"
        }`}>
          {frameDetected === true && (
            <><CheckCircle2 className="h-4 w-4" /><span>Weisser Rahmen erkannt – Foto aufnehmen!</span></>
          )}
          {frameDetected === false && (
            <><AlertTriangle className="h-4 w-4" /><span>Weissen Rahmen im Bild positionieren</span></>
          )}
          {frameDetected === null && (
            <><Loader2 className="h-4 w-4 animate-spin" /><span>Rahmen wird gesucht…</span></>
          )}
        </div>

        <div className="p-4 text-white text-center">
          <p className="text-sm opacity-80">Alle Produkte vollständig im weissen Rahmen platzieren</p>
        </div>

        <div className="flex-1 relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {/* Frame overlay – Farbe je nach Erkennungsstatus */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-4/5 aspect-[4/3] border-4 rounded-2xl relative transition-colors duration-300 ${
              frameDetected === true
                ? "border-green-400 opacity-90"
                : frameDetected === false
                ? "border-red-400 opacity-90"
                : "border-white opacity-60"
            }`}>
              {/* Ecken */}
              <div className={`absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg transition-colors duration-300 ${
                frameDetected === true ? "border-green-400" : frameDetected === false ? "border-red-400" : "border-primary"
              }`} />
              <div className={`absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg transition-colors duration-300 ${
                frameDetected === true ? "border-green-400" : frameDetected === false ? "border-red-400" : "border-primary"
              }`} />
              <div className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg transition-colors duration-300 ${
                frameDetected === true ? "border-green-400" : frameDetected === false ? "border-red-400" : "border-primary"
              }`} />
              <div className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 rounded-br-lg transition-colors duration-300 ${
                frameDetected === true ? "border-green-400" : frameDetected === false ? "border-red-400" : "border-primary"
              }`} />
              {/* Hinweistext in der Mitte */}
              <div className="absolute inset-0 flex items-center justify-center">
                {frameDetected === false && (
                  <p className="text-white text-xs bg-red-600/80 px-3 py-1 rounded-full">
                    Weissen Rahmen positionieren
                  </p>
                )}
                {frameDetected === null && (
                  <p className="text-white text-xs bg-black/40 px-3 py-1 rounded-full">
                    Alle Produkte hier platzieren
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Versteckte Canvas-Elemente */}
        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={frameCheckCanvasRef} className="hidden" />

        <div className="p-6 bg-black">
          <Button
            size="lg"
            className={`w-full h-16 text-lg font-bold rounded-2xl transition-all duration-300 ${
              frameDetected === true
                ? "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/40"
                : "opacity-40 cursor-not-allowed"
            }`}
            onClick={captureAndScan}
            disabled={frameDetected !== true}
          >
            <Camera className="mr-2 h-6 w-6" />
            {frameDetected === true ? "Foto aufnehmen" : "Weissen Rahmen positionieren…"}
          </Button>
          <button
            className="w-full mt-3 text-white/60 text-sm py-2"
            onClick={() => { releaseLock(); stopCamera(); setStep("consent"); }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  // ─── Scanning screen ───────────────────────────────────────────────────────
  if (step === "scanning") {
    // RU-4: Retry-Handler – bricht den laufenden Scan ab und kehrt zur Kamera zurück
    const handleScanRetry = async () => {
      scanMutation.reset();
      setCapturedImage(null);
      setStep("camera");
      await startCamera();
    };
    return <ScanningScreen capturedImage={capturedImage} onRetry={handleScanRetry} />;
  }

  // ─── Confirm screen ────────────────────────────────────────────────────────
  if (step === "confirm") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Session timeout warning */}
        {sessionTimeoutWarning && (
          <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
            <Clock className="h-4 w-4" />
            Sitzung läuft in 30 Sekunden ab
          </div>
        )}

        {/* Header */}
        <div className="bg-white border-b p-4 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-1" />
          <h1 className="text-lg font-bold text-gray-800">Erkannte Produkte</h1>
          <p className="text-sm text-gray-500">Bitte prüfen Sie die Liste</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {products.map((p, i) => (
            <Card key={i} className={`border-0 shadow-sm ${
              p.id === -1 ? "border border-orange-200 bg-orange-50" :
              p.requiresAgeVerification ? "border border-amber-200 bg-amber-50" : ""
            }`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800">{p.name}</p>
                    {p.requiresAgeVerification && (
                      <Wine className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {p.id === -1 ? (
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                        Nicht in Speisekarte
                      </Badge>
                    ) : (
                      <Badge
                        variant={p.confidence === "high" ? "default" : p.confidence === "medium" ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {p.confidence === "high" ? "Sicher" : p.confidence === "medium" ? "Wahrscheinlich" : "Unsicher"}
                      </Badge>
                    )}
                    {p.requiresAgeVerification && (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        18+
                      </Badge>
                    )}
                  </div>
                  {/* Mengen-Korrektur */}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center text-gray-600 hover:border-red-400 hover:text-red-500 active:scale-95 transition-all text-lg font-bold"
                      onClick={() => setProducts(prev => {
                        const updated = [...prev];
                        if (updated[i].quantity <= 1) {
                          // Produkt entfernen
                          updated.splice(i, 1);
                        } else {
                          updated[i] = { ...updated[i], quantity: updated[i].quantity - 1 };
                        }
                        return updated;
                      })}
                      aria-label="Menge reduzieren"
                    >
                      −
                    </button>
                    <span className="text-base font-bold text-gray-800 min-w-[1.5rem] text-center">{p.quantity}</span>
                    <button
                      className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center text-gray-600 hover:border-green-400 hover:text-green-500 active:scale-95 transition-all text-lg font-bold"
                      onClick={() => setProducts(prev => {
                        const updated = [...prev];
                        updated[i] = { ...updated[i], quantity: updated[i].quantity + 1 };
                        return updated;
                      })}
                      aria-label="Menge erhöhen"
                    >
                      +
                    </button>
                    <span className="text-xs text-gray-400 ml-1">× CHF {p.price.toFixed(2)}</span>
                  </div>
                </div>
                <p className={`font-bold text-lg shrink-0 ${p.id === -1 ? "text-orange-500" : "text-gray-800"}`}>
                  {p.id === -1 ? "Preis fehlt" : `${station?.currency ?? "CHF"} ${(p.price * p.quantity).toFixed(2)}`}
                </p>
              </CardContent>
            </Card>
          ))}

          {unrecognized > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
                <p className="text-sm text-orange-700">
                  {unrecognized} Produkt{unrecognized > 1 ? "e" : ""} nicht in der Speisekarte. Bitte Service rufen.
                </p>
              </CardContent>
            </Card>
          )}

          {hasAlcohol && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4 flex items-center gap-3">
                <Wine className="h-5 w-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700">
                  Altersbeschränktes Produkt erkannt (18+) – Altersverifikation durch Servicemitarbeiter erforderlich.
                </p>
              </CardContent>
            </Card>
          )}

          {exceedsPriceThreshold && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">
                  Betrag über CHF {PRICE_THRESHOLD_CHF} – Servicemitarbeiter wird benachrichtigt.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── UPSELLING-WIDGET ── */}
          {upsellingQuery.data && (
            <div className="mt-2 space-y-2">
              {/* Ablaufende Lagerartikel */}
              {/* Backend-Format: { inventoryItemId, name, expiresAt, discountPct, daysLeft, type } */}
              {(upsellingQuery.data.expiringDeals?.length ?? 0) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Sonderangebot – Bald ablaufend</span>
                  </div>
                  <div className="space-y-2">
                    {upsellingQuery.data.expiringDeals!.map((deal: { inventoryItemId: number; name: string; expiresAt: Date | string | null; discountPct: number; daysLeft: number | null; type: string }) => (
                      <div key={deal.inventoryItemId} className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">{deal.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {deal.discountPct > 0 && (
                              <Badge className="text-xs bg-amber-500 text-white">-{deal.discountPct}% Rabatt</Badge>
                            )}
                            {deal.daysLeft !== null && deal.daysLeft !== undefined && (
                              <span className="text-xs text-amber-600">Noch {deal.daysLeft} Tag{deal.daysLeft !== 1 ? "e" : ""}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regelbasierte Empfehlungen */}
              {/* Backend-Format: { ruleId, label, comboPrice, discountPct, suggestedMenuItemId, menuItemPrice, menuItemImage, type } */}
              {(upsellingQuery.data.ruleBasedSuggestions?.length ?? 0) > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">Passt dazu</span>
                  </div>
                  <div className="space-y-2">
                    {upsellingQuery.data.ruleBasedSuggestions!.map((s: { ruleId: number; label: string; comboPrice: number | null; discountPct: number | null; suggestedMenuItemId: number | null; menuItemPrice: number | null; menuItemImage: string | null; type: string }) => {
                      const displayPrice = s.menuItemPrice ?? 0;
                      const finalPrice = s.comboPrice ?? displayPrice;
                      const hasDiscount = s.discountPct != null && s.discountPct > 0;
                      return (
                        <div key={s.ruleId} className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">{s.label}</p>
                            {displayPrice > 0 && (
                              hasDiscount ? (
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs line-through text-gray-400">CHF {displayPrice.toFixed(2)}</span>
                                  <span className="text-sm font-bold text-blue-700">CHF {finalPrice.toFixed(2)}</span>
                                  <Badge className="text-xs bg-blue-500 text-white">Kombi -{s.discountPct}%</Badge>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 mt-0.5">CHF {displayPrice.toFixed(2)}</p>
                              )
                            )}
                          </div>
                          {s.suggestedMenuItemId != null && displayPrice > 0 && (
                            <button
                              className="ml-3 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center active:scale-95 transition-transform"
                              onClick={() => setFoodCart(prev => {
                                const price = hasDiscount ? finalPrice : displayPrice;
                                const existing = prev.find(f => f.menuItemId === s.suggestedMenuItemId!);
                                if (existing) return prev.map(f => f.menuItemId === s.suggestedMenuItemId! ? { ...f, quantity: f.quantity + 1 } : f);
                                return [...prev, { menuItemId: s.suggestedMenuItemId!, name: s.label, price, quantity: 1 }];
                              })}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* KI-Empfehlung */}
              {upsellingQuery.data.aiSuggestion && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-semibold text-purple-800">KI empfiehlt</span>
                  </div>
                  <p className="text-sm text-purple-700">{(upsellingQuery.data.aiSuggestion as { label: string; reason: string }).label}</p>
                  <p className="text-xs text-purple-500 mt-1">{(upsellingQuery.data.aiSuggestion as { label: string; reason: string }).reason}</p>
                </div>
              )}
            </div>
          )}

          {/* ── ESSEN-TAB ── */}
          <div className="mt-2">
            <button
              className="w-full flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-2xl active:scale-[0.98] transition-transform"
              onClick={() => setShowFoodMenu(v => !v)}
            >
              <div className="flex items-center gap-3">
                <Utensils className="h-5 w-5 text-green-600" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-green-800">Essen bestellen</p>
                  <p className="text-xs text-green-600">
                    {foodCart.length > 0 ? `${foodCart.reduce((s, f) => s + f.quantity, 0)} Artikel im Warenkorb` : "Pommes, Nuggets & mehr direkt dazubestellen"}
                  </p>
                </div>
              </div>
              <ChevronRight className={`h-5 w-5 text-green-600 transition-transform duration-200 ${showFoodMenu ? "rotate-90" : ""}`} />
            </button>

            {showFoodMenu && (
              <div className="mt-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {menuQuery.isLoading ? (
                  <div className="p-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : menuQuery.data?.categories?.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 text-center">Keine Speisekarte verfügbar.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {menuQuery.data?.categories?.map((cat: { id: number; name: string; items: { id: number; name: string; description: string | null; price: number }[] }) => (
                      <div key={cat.id}>
                        <div className="px-4 py-2 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat.name}</p>
                        </div>
                        {cat.items.map((item: { id: number; name: string; description: string | null; price: number }) => {
                          const inCart = foodCart.find(f => f.menuItemId === item.id);
                          return (
                            <div key={item.id} className="flex items-center justify-between p-4">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-800">{item.name}</p>
                                {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                                <p className="text-sm font-semibold text-gray-700 mt-1">CHF {item.price.toFixed(2)}</p>
                              </div>
                              <div className="flex items-center gap-2 ml-3">
                                {inCart ? (
                                  <>
                                    <button
                                      className="w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center active:scale-95 transition-transform"
                                      onClick={() => setFoodCart(prev => {
                                        const updated = prev.map(f => f.menuItemId === item.id ? { ...f, quantity: f.quantity - 1 } : f).filter(f => f.quantity > 0);
                                        return updated;
                                      })}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="text-sm font-bold w-5 text-center">{inCart.quantity}</span>
                                  </>
                                ) : null}
                                <button
                                  className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center active:scale-95 transition-transform"
                                  onClick={() => setFoodCart(prev => {
                                    const existing = prev.find(f => f.menuItemId === item.id);
                                    if (existing) return prev.map(f => f.menuItemId === item.id ? { ...f, quantity: f.quantity + 1 } : f);
                                    return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
                                  })}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* foodCart-Zusammenfassung */}
          {foodCart.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Utensils className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">Essensbestellung</span>
                <Badge className="ml-auto bg-green-500 text-white text-xs">Abholung an Theke</Badge>
              </div>
              {foodCart.map(f => (
                <div key={f.menuItemId} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <button
                      className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 active:scale-95"
                      onClick={() => setFoodCart(prev => prev.map(x => x.menuItemId === f.menuItemId ? { ...x, quantity: x.quantity - 1 } : x).filter(x => x.quantity > 0))}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-xs font-bold w-4 text-center">{f.quantity}</span>
                    <span className="text-sm text-gray-700">{f.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">CHF {(f.price * f.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-green-200 mt-2 pt-2 flex justify-between">
                <span className="text-xs text-green-700">Essen-Subtotal</span>
                <span className="text-sm font-bold text-green-800">CHF {foodTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Total + Actions */}
        <div className="bg-white border-t p-4 space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-lg font-semibold text-gray-700">Total</span>
            <span className="text-2xl font-bold text-gray-900">
              {station?.currency ?? "CHF"} {total.toFixed(2)}
            </span>
          </div>

          {hasUnmatched && payableProducts.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
              <strong>Hinweis:</strong> Produkte ohne Preis werden nicht verrechnet. Bitte Service rufen für diese Artikel.
            </div>
          )}

          {/* Online Pay button */}
          <Button
            size="lg"
            className="w-full h-14 text-base font-bold"
            onClick={handlePay}
            disabled={checkoutMutation.isPending || requestAgeVerificationMutation.isPending || payableProducts.length === 0}
          >
            {(checkoutMutation.isPending || requestAgeVerificationMutation.isPending) ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : hasAlcohol ? (
              <Wine className="mr-2 h-5 w-5" />
            ) : (
              <CreditCard className="mr-2 h-5 w-5" />
            )}
            {payableProducts.length === 0
              ? "Keine Preise verfügbar"
              : hasAlcohol
              ? `Altersverifikation & bezahlen · ${station?.currency ?? "CHF"} ${total.toFixed(2)}`
              : `Online bezahlen · ${station?.currency ?? "CHF"} ${total.toFixed(2)}`}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-12"
              onClick={handleRetake}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Nochmals
            </Button>
            <Button
              variant="outline"
              className="h-12 border-orange-300 text-orange-600 hover:bg-orange-50"
              onClick={handleCallService}
              disabled={callServiceMutation.isPending}
            >
              {callServiceMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bell className="mr-2 h-4 w-4" />
              )}
              Service rufen
            </Button>
          </div>

          <p className="text-center text-xs text-gray-400">
            Zahlung erfolgt sicher über Stripe · Karte oder TWINT
          </p>
        </div>
      </div>
    );
  }

  return null;
}
