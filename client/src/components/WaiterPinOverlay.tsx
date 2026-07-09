/**
 * WaiterPinOverlay – PIN-Eingabe-Overlay für Zentralkasse
 *
 * Zeigt:
 * 1. Kellner-Auswahl (Avatar + Name)
 * 2. 4-stelligen Ziffernblock zur PIN-Eingabe
 * 3. QR-Badge-Scan als schnelle Alternative
 * 4. Admin-Eintrag mit 6-stelligem PIN (Code: 110293) → Admin-Dashboard
 * 5. Fehler-Feedback mit verbleibenden Versuchen
 *
 * KELLNER-ISOLATION:
 * Wenn activeWaiter gesetzt ist, wird NUR der Abmelden-Screen gezeigt.
 * Kein Wechsel zu anderen Kellnern, kein Admin-Zugang.
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useWaiterPin } from "@/contexts/WaiterPinContext";
import { toast } from "sonner";
import { User, Delete, LogOut, Lock, QrCode, KeyRound, Camera, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

type WaiterEntry = {
  id: number;
  name: string | null;
  role: string;
  avatarUrl?: string | null;
  hasPin: boolean;
};

type Props = {
  /** Wenn true, wird das Overlay als Vollbild-Overlay angezeigt */
  fullscreen?: boolean;
  /** Callback wenn Kellner erfolgreich eingeloggt */
  onLogin?: () => void;
};

// ROLE_LABELS wird in den Komponenten per t() aufgelöst

// Brute-Force-Schutz: localStorage-Key für fehlgeschlagene Versuche
const ADMIN_LOCKOUT_KEY = "admin_pin_lockout";
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

function getAdminLockout(): { attempts: number; lockedUntil: number } {
  try {
    const raw = localStorage.getItem(ADMIN_LOCKOUT_KEY);
    if (!raw) return { attempts: 0, lockedUntil: 0 };
    return JSON.parse(raw);
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

function setAdminLockout(data: { attempts: number; lockedUntil: number }) {
  localStorage.setItem(ADMIN_LOCKOUT_KEY, JSON.stringify(data));
}

function resetAdminLockout() {
  localStorage.removeItem(ADMIN_LOCKOUT_KEY);
}

// ── QR-Badge-Scanner-Komponente ──────────────────────────────────────────────
function BadgeScanner({ onScan, onClose }: { onScan: (token: string) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let animFrame: number;
    let stopped = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if ("BarcodeDetector" in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
          const detectLoop = async () => {
            if (stopped || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0) {
                const raw: string = codes[0].rawValue;
                if (raw.startsWith("WAITER_BADGE:")) {
                  const token = raw.replace("WAITER_BADGE:", "");
                  onScan(token);
                  return;
                }
              }
            } catch {
              // Ignore detection errors
            }
            animFrame = requestAnimationFrame(detectLoop);
          };
          detectLoop();
        } else {
          const { BrowserQRCodeReader } = await import("@zxing/browser");
          const reader = new BrowserQRCodeReader();
          if (videoRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            reader.decodeFromVideoElement(videoRef.current, (result: any) => {
              if (result && !stopped) {
                const raw = result.getText();
                if (raw.startsWith("WAITER_BADGE:")) {
                  const token = raw.replace("WAITER_BADGE:", "");
                  onScan(token);
                }
              }
            });
          }
        }
      } catch {
        setError(t("pin.cameraUnavailable"));
        setScanning(false);
      }
    }

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(animFrame);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-square max-w-[260px] mx-auto">
        {scanning ? (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 border-2 border-white/70 rounded-xl relative">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />
              </div>
            </div>
            <div className="absolute inset-x-[10%] h-0.5 bg-primary/70 animate-[scanline_2s_ease-in-out_infinite]" style={{ top: "50%" }} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-white/60 text-sm p-4 text-center">
            {error || "Kamera wird gestartet..."}
          </div>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">{t("pin.holdBadge")}</p>
      <Button variant="outline" className="w-full gap-2" onClick={onClose}>
        <X className="w-4 h-4" /> Abbrechen
      </Button>
      <style>{`
        @keyframes scanline {
          0%, 100% { transform: translateY(-60px); opacity: 0.3; }
          50% { transform: translateY(60px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Abmelden-Screen (wenn Kellner bereits eingeloggt) ─────────────────────────
function ActiveWaiterScreen({
  fullscreen,
  name,
  role,
  avatarUrl,
  onLogout,
}: {
  fullscreen: boolean;
  name: string;
  role: string;
  avatarUrl?: string | null;
  onLogout: () => void;
}) {
  const { t } = useLanguage();
  const containerClass = fullscreen
    ? "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
    : "flex items-center justify-center p-4";

  return (
    <div className={containerClass}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5 text-white">
          <h2 className="text-lg font-bold">{t("pin.centralCashier")}</h2>
          <p className="text-slate-400 text-sm mt-0.5">{t("pin.activeSession")}</p>
        </div>
        <div className="p-6 space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="w-16 h-16 object-cover" />
            ) : (
              <User className="w-8 h-8 text-primary" />
            )}
          </div>
          <div>
            <p className="font-bold text-lg">{name}</p>
            <p className="text-sm text-muted-foreground">
              {role === "kellner" ? t("nav.waiter") : role === "barkeeper" ? "Barkeeper" : role === "manager" ? t("nav.manager") : role}
            </p>
          </div>
          <Button variant="destructive" className="w-full gap-2" onClick={onLogout}>
            <LogOut className="w-4 h-4" />
            Abmelden
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Admin-PIN-Pad (6-stellig, Code: 110293) ───────────────────────────────────
function AdminPinPad({
  onSuccess,
  onBack,
  correctPin,
  onFailedAttempt,
}: {
  onSuccess: () => void;
  onBack: () => void;
  correctPin: string;
  onFailedAttempt?: () => void;
}) {
  const { t } = useLanguage();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [lockout, setLockout] = useState(() => getAdminLockout());
  const [countdown, setCountdown] = useState(0);

  // Countdown-Timer für Sperre
  useEffect(() => {
    if (lockout.lockedUntil <= Date.now()) return;
    const remaining = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
    setCountdown(remaining);
    const interval = setInterval(() => {
      const rem = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
      if (rem <= 0) {
        clearInterval(interval);
        setCountdown(0);
        const reset = { attempts: 0, lockedUntil: 0 };
        setAdminLockout(reset);
        setLockout(reset);
        setError("");
      } else {
        setCountdown(rem);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockout.lockedUntil]);

  const isLocked = lockout.lockedUntil > Date.now();

  function handleDigit(d: string) {
    if (isLocked || pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError("");

    if (next.length === 6) {
      if (next === correctPin) {
        resetAdminLockout();
        onSuccess();
      } else {
        const current = getAdminLockout();
        const newAttempts = current.attempts + 1;
        const newLockout = newAttempts >= MAX_ATTEMPTS
          ? { attempts: newAttempts, lockedUntil: Date.now() + LOCKOUT_SECONDS * 1000 }
          : { attempts: newAttempts, lockedUntil: 0 };
        setAdminLockout(newLockout);
        setLockout(newLockout);
        const remaining = MAX_ATTEMPTS - newAttempts;
        if (newAttempts >= MAX_ATTEMPTS) {
          setError(t("pin.tooManyAttempts"));
        } else {
          setError(t("pin.wrongPin") + " " + remaining + " " + t("pin.attemptsLeft") + (remaining === 1 ? "" : "e") + ".");
        }
        setShake(true);
        onFailedAttempt?.();
        setTimeout(() => { setShake(false); setPin(""); }, 700);
      }
    }
  }

  function handleDelete() {
    if (isLocked) return;
    setPin(p => p.slice(0, -1));
    setError("");
  }

  // Tastatur-Support
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isLocked) return;
      if (e.key >= "0" && e.key <= "9") handleDigit(e.key);
      else if (e.key === "Backspace") handleDelete();
      else if (e.key === "Escape") onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, isLocked]);

  return (
    <div className="space-y-5">
      {/* Admin-Identifikation */}
      <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
        <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">{t("pin.adminBtn")}</p>
          <p className="text-xs text-muted-foreground">{t("pin.adminEnterPin")}</p>
        </div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground underline">
          Zurück
        </button>
      </div>

      {/* Gesperrt-Anzeige */}
      {isLocked && (
        <div className="flex flex-col items-center gap-2 py-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Lock className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-center text-sm font-semibold text-red-600 dark:text-red-400">{t("pin.tooManyAttempts")}</p>
          <p className="text-center text-2xl font-bold tabular-nums text-red-500">{countdown}s</p>
          <p className="text-center text-xs text-muted-foreground">{t("pin.waitSeconds")}</p>
        </div>
      )}

      {/* PIN-Punkte + Ziffernblock */}
      {!isLocked && (
        <>
          <div className={cn("flex justify-center gap-3", shake && "animate-[shake_0.5s_ease-in-out]")}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={cn(
                  "w-4 h-4 rounded-full border-2 transition-all duration-150",
                  i < pin.length
                    ? error ? "bg-red-500 border-red-500" : "bg-amber-500 border-amber-500"
                    : "border-muted-foreground/40"
                )}
              />
            ))}
          </div>

          {error && (
            <p className="text-center text-sm text-red-500 font-medium">{error}</p>
          )}

          <div className="grid grid-cols-3 gap-2">
            {["1","2","3","4","5","6","7","8","9"].map(d => (
              <button
                key={d}
                onClick={() => handleDigit(d)}
                className="h-14 rounded-xl bg-muted hover:bg-muted/70 active:scale-95 transition-all font-semibold text-xl"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              onClick={() => handleDigit("0")}
              className="h-14 rounded-xl bg-muted hover:bg-muted/70 active:scale-95 transition-all font-semibold text-xl"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              disabled={pin.length === 0}
              className="h-14 rounded-xl bg-muted hover:bg-muted/70 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Haupt-Overlay ─────────────────────────────────────────────────────────────
export function WaiterPinOverlay({ fullscreen = true, onLogin }: Props) {
  const { t } = useLanguage();
  const { setActiveWaiter, activeWaiter, logout } = useWaiterPin();
  const [selectedWaiter, setSelectedWaiter] = useState<WaiterEntry | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [mode, setMode] = useState<"select" | "pin" | "scan" | "admin-pin">("select");
  const [, navigate] = useLocation();

  // Alle Hooks MÜSSEN vor jedem bedingten Return stehen (React-Regeln)
  const { data: waiters = [], isLoading } = trpc.adminShifts.listWaitersForPanel.useQuery(
    undefined,
    { enabled: !activeWaiter } // Query nur wenn kein Kellner eingeloggt
  );

  // Admin-PIN aus DB laden
  const { data: adminPinData } = trpc.restaurantAdmin.getAdminPin.useQuery(
    undefined,
    { enabled: !activeWaiter }
  );
  const adminPin = adminPinData?.pin ?? "110293";

  // Audit-Log Mutation
  const logAttemptMutation = trpc.restaurantAdmin.logAdminPinAttempt.useMutation();

  const loginMutation = trpc.adminShifts.waiterPanelLogin.useMutation({
    onSuccess: (data) => {
      setActiveWaiter({
        id: data.waiter.id,
        name: data.waiter.name ?? "Kellner",
        role: data.waiter.role,
        avatarUrl: data.waiter.avatarUrl,
        loginAt: Date.now(),
      });
      setPin("");
      setError("");
      setSelectedWaiter(null);
      setMode("select");
      toast.success(`${t("pin.welcomeBack")}, ${data.waiter.name}!`);
      onLogin?.();
      navigate("/kellner/tables");
    },
    onError: (e) => {
      setPin("");
      setError(e.message);
      setShake(true);
      setTimeout(() => setShake(false), 600);
    },
  });

  const badgeScanMutation = trpc.adminShifts.waiterBadgeScan.useMutation({
    onSuccess: (data) => {
      setActiveWaiter({
        id: data.waiter.id,
        name: data.waiter.name ?? "Kellner",
        role: data.waiter.role,
        avatarUrl: data.waiter.avatarUrl,
        loginAt: Date.now(),
      });
      setMode("select");
      navigator.vibrate?.([80, 40, 160]);
      toast.success(`Willkommen, ${data.waiter.name}!`);
      onLogin?.();
      navigate("/kellner/tables");
    },
    onError: (e) => {
      navigator.vibrate?.([200, 100, 200]);
      toast.error(e.message);
      setMode("scan");
    },
  });

  // Tastatur-Support für Kellner-PIN
  useEffect(() => {
    if (mode !== "pin" || activeWaiter) return;
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") handleDigit(e.key);
      else if (e.key === "Backspace") handleDelete();
      else if (e.key === "Escape") handleBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pin, selectedWaiter, activeWaiter]);

  // ── KELLNER-ISOLATION: Wenn Kellner eingeloggt → nur Abmelden ──────────────
  if (activeWaiter) {
    return (
      <ActiveWaiterScreen
        fullscreen={fullscreen}
        name={activeWaiter.name}
        role={activeWaiter.role}
        avatarUrl={activeWaiter.avatarUrl}
        onLogout={logout}
      />
    );
  }

  // ── Hilfsfunktionen (nur wenn kein activeWaiter) ──────────────────────────
  function handleDigit(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4 && selectedWaiter) {
      loginMutation.mutate({ staffId: selectedWaiter.id, pin: next });
    }
  }

  function handleDelete() {
    setPin(p => p.slice(0, -1));
    setError("");
  }

  function handleBack() {
    setSelectedWaiter(null);
    setPin("");
    setError("");
    setMode("select");
  }

  function handleAdminSuccess() {
    logAttemptMutation.mutate({
      success: true,
      userAgent: navigator.userAgent.slice(0, 512),
    });
    toast.success(t("pin.adminGranted"));
    navigate("/admin");
  }

  const containerClass = fullscreen
    ? "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
    : "flex items-center justify-center p-4";

  return (
    <div className={containerClass}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Zentralkasse</h2>
              <p className="text-slate-400 text-sm mt-0.5">
                {mode === "select" && t("pin.selectWaiter")}
                {mode === "pin" && t("pin.enterPin")}
                {mode === "scan" && t("pin.scanBadge")}
                {mode === "admin-pin" && t("pin.adminAccess")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mode === "select" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white gap-1.5"
                  onClick={() => setMode("scan")}
                  title={t("pin.scanBadgeBtn")}
                >
                  <QrCode className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* ── Modus: Badge-Scan ── */}
          {mode === "scan" && (
            <BadgeScanner
              onScan={(token) => {
                setMode("select");
                badgeScanMutation.mutate({ token });
              }}
              onClose={() => setMode("select")}
            />
          )}

          {/* ── Modus: Admin-PIN ── */}
          {mode === "admin-pin" && (
            <AdminPinPad
              onSuccess={handleAdminSuccess}
              onBack={() => setMode("select")}
              correctPin={adminPin}
              onFailedAttempt={() => {
                logAttemptMutation.mutate({
                  success: false,
                  userAgent: navigator.userAgent.slice(0, 512),
                });
              }}
            />
          )}

          {/* ── Modus: Kellner-Auswahl ── */}
          {mode === "select" && (
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  Lade Mitarbeiterliste...
                </div>
              ) : waiters.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>{t("pin.noWaiters")}</p>
                  <p className="text-xs mt-1">{t("pin.noWaitersHint")}</p>
                </div>
              ) : (
                <>
                  {waiters.map((w: WaiterEntry) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        if (!w.hasPin) {
                          toast.error(`${w.name} ${t("pin.noPin")}`);
                          return;
                        }
                        setSelectedWaiter(w);
                        setMode("pin");
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left",
                        w.hasPin
                          ? "border-border hover:border-primary hover:bg-primary/5 cursor-pointer"
                          : "border-dashed border-border opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {w.avatarUrl ? (
                          <img src={w.avatarUrl} alt={w.name ?? ""} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          (w.name ?? "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{w.name ?? "Unbekannt"}</p>
                        <p className="text-xs text-muted-foreground">{w.role === "kellner" ? t("nav.waiter") : w.role === "barkeeper" ? "Barkeeper" : w.role === "manager" ? t("nav.manager") : w.role}</p>
                      </div>
                      {!w.hasPin && <Lock className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </button>
                  ))}

                  {/* Badge-Scan-Button */}
                  <button
                    onClick={() => setMode("scan")}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Camera className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-primary">{t("pin.scanBadgeBtn")}</p>
                      <p className="text-xs text-muted-foreground">{t("pin.scanBadgeHint")}</p>
                    </div>
                    <QrCode className="w-4 h-4 text-primary/60 shrink-0" />
                  </button>

                  {/* Admin-Zugang-Button */}
                  <button
                    onClick={() => setMode("admin-pin")}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed border-amber-400/50 hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-amber-700 dark:text-amber-400">{t("pin.adminBtn")}</p>
                      <p className="text-xs text-muted-foreground">{t("pin.adminHint")}</p>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Modus: PIN-Eingabe ── */}
          {mode === "pin" && selectedWaiter && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {selectedWaiter.avatarUrl ? (
                    <img src={selectedWaiter.avatarUrl} alt={selectedWaiter.name ?? ""} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    (selectedWaiter.name ?? "?").charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{selectedWaiter.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedWaiter.role === "kellner" ? t("nav.waiter") : selectedWaiter.role === "barkeeper" ? "Barkeeper" : selectedWaiter.role === "manager" ? t("nav.manager") : selectedWaiter.role}</p>
                </div>
                <button onClick={handleBack} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Wechseln
                </button>
              </div>

              <div className="flex gap-2 p-1 bg-muted rounded-xl">
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-background shadow-sm text-sm font-medium">
                  <KeyRound className="w-3.5 h-3.5" /> PIN
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setMode("scan"); setPin(""); setError(""); }}
                >
                  <QrCode className="w-3.5 h-3.5" /> Badge
                </button>
              </div>

              <div className={cn("flex justify-center gap-4", shake && "animate-[shake_0.5s_ease-in-out]")}>
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-full border-2 transition-all duration-150",
                      i < pin.length
                        ? error ? "bg-red-500 border-red-500" : "bg-foreground border-foreground"
                        : "border-muted-foreground/40"
                    )}
                  />
                ))}
              </div>

              {error && (
                <p className="text-center text-sm text-red-500 font-medium">{error}</p>
              )}

              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9"].map(d => (
                  <button
                    key={d}
                    onClick={() => handleDigit(d)}
                    disabled={loginMutation.isPending}
                    className="h-14 rounded-xl bg-muted hover:bg-muted/70 active:scale-95 transition-all font-semibold text-xl disabled:opacity-50"
                  >
                    {d}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => handleDigit("0")}
                  disabled={loginMutation.isPending}
                  className="h-14 rounded-xl bg-muted hover:bg-muted/70 active:scale-95 transition-all font-semibold text-xl disabled:opacity-50"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loginMutation.isPending || pin.length === 0}
                  className="h-14 rounded-xl bg-muted hover:bg-muted/70 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              {loginMutation.isPending && (
                <p className="text-center text-sm text-muted-foreground">{t("pin.verifying")}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
