/**
 * Waiter_shift.tsx – Professionelle Stempeluhr für Kellner
 *
 * Features:
 * - Einstempeln / Ausstempeln mit 4-stelligem PIN
 * - Pause starten / beenden (Pflichtpause-Warnung nach CH ArG Art. 15)
 * - Live-Timer (aktualisiert jede Sekunde)
 * - Schicht-Verlauf (letzte 30 Schichten)
 * - Monatsstatistiken (Arbeitsstunden, Pausen, Überstunden)
 * - Anti-Betrug: PIN-Lockout nach 5 Fehlversuchen
 * - Gesetzliche Compliance-Anzeige
 */

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Clock, Play, Square, Coffee, ChevronRight, AlertTriangle,
  CheckCircle2, Timer, TrendingUp, Calendar, Shield, Lock,
  BarChart3, Info, RefreshCw, Wallet, Coins,
} from "lucide-react";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} Min.`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
}

/** Pflichtpause nach CH ArG Art. 15 */
function getRequiredBreak(workMinutes: number): { minutes: number; label: string } {
  if (workMinutes >= 9 * 60) return { minutes: 60, label: "60 Min. (ab 9h)" };
  if (workMinutes >= 7 * 60) return { minutes: 30, label: "30 Min. (ab 7h)" };
  if (workMinutes >= 5.5 * 60) return { minutes: 15, label: "15 Min. (ab 5.5h)" };
  return { minutes: 0, label: "keine Pflicht" };
}

// ─── PIN-Dialog ───────────────────────────────────────────────────────────────

interface PinDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => void;
  title: string;
  description: string;
  loading?: boolean;
  error?: string | null;
}

function PinDialog({ open, onClose, onConfirm, title, description, loading, error }: PinDialogProps) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!open) setPin("");
  }, [open]);

  const handleComplete = useCallback((value: string) => {
    if (value.length === 4) {
      onConfirm(value);
    }
  }, [onConfirm]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
            <Shield className="h-4 w-4" />
            <span>Persönlicher PIN – nicht weitergeben</span>
          </div>
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={setPin}
            onComplete={handleComplete}
            disabled={loading}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg w-full">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Wird verarbeitet...</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>Abbrechen</Button>
          <Button onClick={() => onConfirm(pin)} disabled={pin.length < 4 || loading}>
            Bestätigen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PIN einrichten Dialog ────────────────────────────────────────────────────

function SetPinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [firstPin, setFirstPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const setPin = trpc.shifts.setPin.useMutation({
    onSuccess: () => {
      toast.success("PIN erfolgreich gesetzt!");
      utils.shifts.hasPinSet.invalidate();
      onClose();
      setStep("enter");
      setFirstPin("");
      setConfirmPin("");
    },
    onError: (e) => setError(e.message),
  });

  const handleFirstPin = (pin: string) => {
    setFirstPin(pin);
    setStep("confirm");
    setError(null);
  };

  const handleConfirmPin = (pin: string) => {
    setConfirmPin(pin);
    if (pin !== firstPin) {
      setError("PINs stimmen nicht überein. Bitte erneut versuchen.");
      setStep("enter");
      setFirstPin("");
      setConfirmPin("");
      return;
    }
    setPin.mutate({ pin });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            PIN einrichten
          </DialogTitle>
          <DialogDescription>
            {step === "enter"
              ? "Wähle einen 4-stelligen PIN für die Stempeluhr."
              : "PIN zur Bestätigung erneut eingeben."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="flex gap-2">
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${step === "enter" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <span>1</span> <span>PIN wählen</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground self-center" />
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${step === "confirm" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <span>2</span> <span>Bestätigen</span>
            </div>
          </div>
          <InputOTP
            maxLength={4}
            value={step === "enter" ? firstPin : confirmPin}
            onChange={step === "enter" ? setFirstPin : setConfirmPin}
            onComplete={step === "enter" ? handleFirstPin : handleConfirmPin}
            disabled={setPin.isPending}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg w-full">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg w-full space-y-1">
            <p className="font-medium">Sicherheitshinweise:</p>
            <p>• Verwende keinen einfachen PIN (z.B. 1234, 0000)</p>
            <p>• Teile deinen PIN mit niemandem</p>
            <p>• Nach 5 Fehlversuchen wird der PIN 15 Min. gesperrt</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Live-Timer ───────────────────────────────────────────────────────────────

function LiveTimer({ startedAt, breakMinutes, isOnBreak, breakStartedAt }: {
  startedAt: Date | string;
  breakMinutes: number;
  isOnBreak: boolean;
  breakStartedAt?: Date | string | null;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const total = Math.floor((now - new Date(startedAt).getTime()) / 1000);
      setElapsed(total);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const currentBreakSecs = isOnBreak && breakStartedAt
    ? Math.floor((Date.now() - new Date(breakStartedAt).getTime()) / 1000)
    : 0;

  const totalBreakSecs = breakMinutes * 60 + currentBreakSecs;
  const netSecs = Math.max(0, elapsed - totalBreakSecs);

  const fmt = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="text-center space-y-1">
      <div className="text-5xl font-mono font-bold tracking-tight tabular-nums text-foreground">
        {fmt(netSecs)}
      </div>
      <div className="text-xs text-muted-foreground">
        Netto-Arbeitszeit · Gesamt: {fmt(elapsed)} · Pause: {fmt(totalBreakSecs)}
      </div>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function Waiter_shift() {
  const [pinDialog, setPinDialog] = useState<"clockIn" | "clockOut" | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [showSetPin, setShowSetPin] = useState(false);
  const [activeTab, setActiveTab] = useState<"shift" | "history" | "stats">("shift");

  // Bargeld-States
  const [cashStartInput, setCashStartInput] = useState("");
  const [cashEndInput, setCashEndInput] = useState("");
  const [showCashStartDialog, setShowCashStartDialog] = useState(false);
  const [showCashEndDialog, setShowCashEndDialog] = useState(false);
  const [pendingPin, setPendingPin] = useState<string | null>(null);

  // Pflicht-Notiz-Dialog (bei Schicht > 10h)
  const [requiresNoteDialog, setRequiresNoteDialog] = useState(false);
  const [pendingClockOutShiftId, setPendingClockOutShiftId] = useState<number | null>(null);
  const [longShiftNote, setLongShiftNote] = useState("");

  const updateNotesMutation = trpc.shifts.updateShiftNotes.useMutation({
    onSuccess: () => {
      toast.success("Notiz gespeichert.");
      setRequiresNoteDialog(false);
      setLongShiftNote("");
    },
    onError: (e) => toast.error(e.message),
  });
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: hasPinData } = trpc.shifts.hasPinSet.useQuery();
  const { data: currentShift } = trpc.shifts.getCurrentShift.useQuery(
    undefined, { refetchInterval: 30000 }
  );
  const { data: historyData } = trpc.shifts.getMyShifts.useQuery({ limit: 30 });
  const { data: monthStats } = trpc.shifts.getMonthStats.useQuery({});

  // ── Mutations ─────────────────────────────────────────────────────────────
  const clockIn = trpc.shifts.clockIn.useMutation({
    onSuccess: () => {
      const cashMsg = cashStartInput ? ` | Startbargeld: CHF ${parseFloat(cashStartInput).toFixed(2)}` : "";
      toast.success(`Schicht gestartet! Guten Dienst 👋${cashMsg}`);
      setPinDialog(null);
      setPinError(null);
      setShowCashStartDialog(false);
      setCashStartInput("");
      setPendingPin(null);
      utils.shifts.getCurrentShift.invalidate();
      utils.shifts.getMyShifts.invalidate();
    },
    onError: (e) => { setPinError(e.message); setShowCashStartDialog(false); },
  });

  const clockOut = trpc.shifts.clockOut.useMutation({
    onSuccess: (data) => {
      const msg = data.breakCompliant
        ? `Schicht beendet. Netto: ${formatMinutes(data.netWorkMinutes)} ✓`
        : `Schicht beendet. ⚠️ Pflichtpause von ${data.requiredBreakMinutes} Min. nicht eingehalten!`;
      toast[data.breakCompliant ? "success" : "warning"](msg);
      // Trinkgeld anzeigen wenn berechnet
      if (data.tipAmount != null && data.tipAmount > 0) {
        toast.info(`Trinkgeld dieser Schicht: CHF ${data.tipAmount.toFixed(2)} 🎉`);
      }
      setPinDialog(null);
      setPinError(null);
      setShowCashEndDialog(false);
      setCashEndInput("");
      setPendingPin(null);
      utils.shifts.getCurrentShift.invalidate();
      utils.shifts.getMyShifts.invalidate();
      utils.shifts.getMonthStats.invalidate();
      // Pflicht-Notiz bei Schicht > 10h
      if (data.requiresNote && data.shiftId) {
        setPendingClockOutShiftId(data.shiftId);
        setRequiresNoteDialog(true);
      }
    },
    onError: (e) => { setPinError(e.message); setShowCashEndDialog(false); },
  });

  // Bargeld-Dialoge Handler
  const handleClockInWithCash = (pin: string) => {
    // Nach PIN-Eingabe: Bargeld-Dialog öffnen
    setPendingPin(pin);
    setPinDialog(null);
    setShowCashStartDialog(true);
  };

  const handleConfirmCashStart = () => {
    const cash = cashStartInput ? parseFloat(cashStartInput) : undefined;
    clockIn.mutate({ pin: pendingPin ?? undefined, cashStart: cash, staffRole: "kellner" });
  };

  const handleClockOutWithCash = (pin: string) => {
    // Nach PIN-Eingabe: Bargeld-Dialog öffnen
    setPendingPin(pin);
    setPinDialog(null);
    setShowCashEndDialog(true);
  };

  const handleConfirmCashEnd = () => {
    const cash = cashEndInput ? parseFloat(cashEndInput) : undefined;
    clockOut.mutate({ pin: pendingPin ?? undefined, cashEnd: cash });
  };

  const startBreak = trpc.shifts.startBreak.useMutation({
    onSuccess: () => {
      toast.info("Pause gestartet. Erhol dich gut! ☕");
      utils.shifts.getCurrentShift.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const endBreak = trpc.shifts.endBreak.useMutation({
    onSuccess: (data) => {
      toast.success(`Pause beendet (${formatMinutes(data.durationMinutes)})`);
      utils.shifts.getCurrentShift.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Aktuelle Schicht-Daten ────────────────────────────────────────────────
  const isWorking = !!currentShift;
  const isOnBreak = currentShift?.isOnBreak ?? false;
  const breakDue = currentShift?.breakDue ?? false;
  const overdue = currentShift?.overdue ?? false;

  const requiredBreak = currentShift
    ? getRequiredBreak(currentShift.netWorkMinutes)
    : { minutes: 0, label: "keine Pflicht" };

  const breakProgress = requiredBreak.minutes > 0
    ? Math.min(100, ((currentShift?.totalBreakMinutes ?? 0) / requiredBreak.minutes) * 100)
    : 100;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Stempeluhr
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowSetPin(true)}>
          <Shield className="h-4 w-4 mr-1" />
          PIN {hasPinData?.hasPinSet ? "ändern" : "einrichten"}
        </Button>
      </div>

      {/* PIN nicht gesetzt – Warnung */}
      {!hasPinData?.hasPinSet && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-sm">Kein PIN gesetzt</p>
                <p className="text-xs text-muted-foreground">
                  Du musst zuerst einen persönlichen 4-stelligen PIN einrichten, bevor du stempeln kannst.
                </p>
                <Button size="sm" className="mt-2" onClick={() => setShowSetPin(true)}>
                  PIN jetzt einrichten
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Überfällig-Warnung */}
      {overdue && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                Schicht läuft seit über 12 Stunden! Bitte ausstempeln.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pflichtpause-Warnung */}
      {breakDue && !isOnBreak && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Coffee className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Pflichtpause fällig!</p>
                <p className="text-xs text-muted-foreground">
                  Nach CH ArG Art. 15 ist jetzt eine Pause von {requiredBreak.label} vorgeschrieben.
                </p>
                <Button size="sm" variant="outline" className="mt-2 bg-background"
                  onClick={() => startBreak.mutate({ breakType: "mandatory" })}>
                  <Coffee className="h-3 w-3 mr-1" />
                  Pflichtpause starten
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {[
          { id: "shift", label: "Aktuelle Schicht", icon: Clock },
          { id: "history", label: "Verlauf", icon: Calendar },
          { id: "stats", label: "Statistiken", icon: BarChart3 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Aktuelle Schicht ────────────────────────────────────────── */}
      {activeTab === "shift" && (
        <div className="space-y-4">

          {/* Haupt-Stempeluhr-Karte */}
          <Card className={`${isWorking ? (isOnBreak ? "border-amber-500/50" : "border-green-500/50") : ""}`}>
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col items-center gap-6">

                {/* Status-Badge */}
                <Badge variant={isWorking ? (isOnBreak ? "outline" : "default") : "secondary"}
                  className={`text-sm px-4 py-1 ${
                    isWorking && !isOnBreak ? "bg-green-500 hover:bg-green-500 text-white" :
                    isOnBreak ? "border-amber-500 text-amber-600" : ""
                  }`}>
                  {isWorking ? (isOnBreak ? "☕ Pause" : "🟢 Im Dienst") : "⚫ Nicht eingestempelt"}
                </Badge>

                {/* Timer */}
                {isWorking && currentShift ? (
                  <LiveTimer
                    startedAt={currentShift.shift.startedAt}
                    breakMinutes={currentShift.totalBreakMinutes - (currentShift.isOnBreak
                      ? Math.floor((Date.now() - new Date(currentShift.currentBreak?.startedAt ?? Date.now()).getTime()) / 60000)
                      : 0)}
                    isOnBreak={isOnBreak}
                    breakStartedAt={currentShift.currentBreak?.startedAt}
                  />
                ) : (
                  <div className="text-center space-y-1">
                    <div className="text-5xl font-mono font-bold tracking-tight text-muted-foreground">
                      --:--:--
                    </div>
                    <div className="text-xs text-muted-foreground">Nicht eingestempelt</div>
                  </div>
                )}

                {/* Schicht-Details */}
                {isWorking && currentShift && (
                  <div className="space-y-3 w-full">
                    <div className="grid grid-cols-3 gap-4 w-full text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Beginn</p>
                        <p className="font-semibold">{formatTime(currentShift.shift.startedAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pausen</p>
                        <p className="font-semibold">{formatMinutes(currentShift.totalBreakMinutes)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Netto</p>
                        <p className="font-semibold">{formatMinutes(currentShift.netWorkMinutes)}</p>
                      </div>
                    </div>
                    {/* Startbargeld-Anzeige (nur wenn erfasst) */}
                    {currentShift.shift.cashStart != null && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20">
                        <div className="flex items-center gap-2 text-sm">
                          <Wallet className="h-4 w-4 text-green-600" />
                          <span className="text-muted-foreground">Startbargeld</span>
                        </div>
                        <span className="font-semibold text-green-700 dark:text-green-400">
                          CHF {parseFloat(String(currentShift.shift.cashStart)).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Pflichtpausen-Fortschritt */}
                {isWorking && requiredBreak.minutes > 0 && (
                  <div className="w-full space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Pflichtpause ({requiredBreak.label})</span>
                      <span className={breakProgress >= 100 ? "text-green-500" : "text-amber-500"}>
                        {breakProgress >= 100 ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Erfüllt</span>
                        ) : (
                          `${Math.round(breakProgress)}%`
                        )}
                      </span>
                    </div>
                    <Progress value={breakProgress} className={`h-2 ${breakProgress >= 100 ? "[&>div]:bg-green-500" : "[&>div]:bg-amber-500"}`} />
                  </div>
                )}

                {/* Aktions-Buttons */}
                <div className="flex gap-3 w-full">
                  {!isWorking ? (
                    <Button
                      className="flex-1 h-14 text-base font-semibold bg-green-600 hover:bg-green-700"
                      onClick={() => { setPinError(null); setPinDialog("clockIn"); }}
                      disabled={!hasPinData?.hasPinSet}
                    >
                      <Play className="h-5 w-5 mr-2" />
                      Einst\u00ADempeln
                    </Button>
                  ) : (
                    <>
                      {!isOnBreak ? (
                        <Button
                          variant="outline"
                          className="flex-1 h-14 border-amber-500 text-amber-600 hover:bg-amber-50"
                          onClick={() => startBreak.mutate({ breakType: "voluntary" })}
                          disabled={startBreak.isPending}
                        >
                          <Coffee className="h-5 w-5 mr-2" />
                          Pause
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="flex-1 h-14 border-green-500 text-green-600 hover:bg-green-50"
                          onClick={() => endBreak.mutate()}
                          disabled={endBreak.isPending}
                        >
                          <Play className="h-5 w-5 mr-2" />
                          Weiter\u00ADarbeiten
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        className="flex-1 h-14 text-base font-semibold"
                        onClick={() => { setPinError(null); setPinDialog("clockOut"); }}
                      >
                        <Square className="h-5 w-5 mr-2" />
                        Ausstempeln
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gesetzliche Info */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Pflichtpausen nach CH ArG Art. 15:</p>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <div className="bg-background rounded p-2 text-center">
                      <p className="font-semibold">15 Min.</p>
                      <p>ab 5.5h</p>
                    </div>
                    <div className="bg-background rounded p-2 text-center">
                      <p className="font-semibold">30 Min.</p>
                      <p>ab 7h</p>
                    </div>
                    <div className="bg-background rounded p-2 text-center">
                      <p className="font-semibold">60 Min.</p>
                      <p>ab 9h</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: Verlauf ────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {historyData?.stats && (
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold">{formatMinutes(historyData.stats.weekNetMinutes)}</p>
                  <p className="text-xs text-muted-foreground">Diese Woche</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold">{historyData.stats.weekShifts}</p>
                  <p className="text-xs text-muted-foreground">Schichten diese Woche</p>
                </CardContent>
              </Card>
            </div>
          )}

          {historyData?.shifts.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Noch keine Schichten erfasst</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {historyData?.shifts.map((shift) => {
                const isActive = !shift.endedAt;
                const required = getRequiredBreak(shift.netWorkMinutes ?? 0);
                const compliant = required.minutes === 0 || (shift.breakMinutes ?? 0) >= required.minutes;

                return (
                  <Card key={shift.id} className={isActive ? "border-green-500/50" : ""}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{formatDate(shift.startedAt)}</span>
                            {isActive && <Badge className="text-xs bg-green-500 hover:bg-green-500">Aktiv</Badge>}
                            {!isActive && !compliant && (
                              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                                Pause fehlt
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatTime(shift.startedAt)} – {shift.endedAt ? formatTime(shift.endedAt) : "läuft"}</span>
                            {shift.breakMinutes > 0 && <span>☕ {formatMinutes(shift.breakMinutes)}</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">
                            {shift.netWorkMinutes != null ? formatMinutes(shift.netWorkMinutes) : "–"}
                          </p>
                          <p className="text-xs text-muted-foreground">Netto</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Statistiken ────────────────────────────────────────────── */}
      {activeTab === "stats" && monthStats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {new Date(monthStats.year, monthStats.month - 1).toLocaleDateString("de-CH", { month: "long", year: "numeric" })}
            </h3>
            {monthStats.nonCompliantShifts > 0 && (
              <Badge variant="outline" className="border-amber-500 text-amber-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {monthStats.nonCompliantShifts} Schicht{monthStats.nonCompliantShifts > 1 ? "en" : ""} ohne Pflichtpause
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Timer className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{formatMinutes(monthStats.totalNetMinutes)}</p>
                <p className="text-xs text-muted-foreground">Netto-Arbeitszeit</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Calendar className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{monthStats.workDays}</p>
                <p className="text-xs text-muted-foreground">Arbeitstage</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Coffee className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                <p className="text-2xl font-bold">{formatMinutes(monthStats.totalBreakMinutes)}</p>
                <p className="text-xs text-muted-foreground">Gesamtpausen</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-500" />
                <p className="text-2xl font-bold">{formatMinutes(monthStats.avgNetMinutes)}</p>
                <p className="text-xs text-muted-foreground">Ø Schichtdauer</p>
              </CardContent>
            </Card>
          </div>

          {monthStats.overtimeMinutes > 0 && (
            <Card className="border-blue-500/50 bg-blue-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-sm">Überstunden diesen Monat</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMinutes(monthStats.overtimeMinutes)} über dem Ziel (8h/Schicht)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {monthStats.nonCompliantShifts === 0 && monthStats.totalShifts > 0 && (
            <Card className="border-green-500/50 bg-green-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-sm">Alle Pflichtpausen eingehalten ✓</p>
                    <p className="text-xs text-muted-foreground">
                      Vollständige Compliance mit CH ArG Art. 15 diesen Monat.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Schichten diesen Monat</p>
            {monthStats.shifts.filter((s: typeof monthStats.shifts[0]) => s.status === "completed").map((shift: typeof monthStats.shifts[0]) => (
              <div key={shift.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{formatDate(shift.startedAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(shift.startedAt)} – {shift.endedAt ? formatTime(shift.endedAt) : "–"}
                    {(shift.breakMinutes ?? 0) > 0 && ` · ☕ ${formatMinutes(shift.breakMinutes ?? 0)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMinutes(shift.netWorkMinutes ?? 0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dialoge ──────────────────────────────────────────────────────── */}
      <SetPinDialog open={showSetPin} onClose={() => setShowSetPin(false)} />

      <PinDialog
        open={pinDialog === "clockIn"}
        onClose={() => { setPinDialog(null); setPinError(null); }}
        onConfirm={handleClockInWithCash}
        title="Einst\u00ADempeln"
        description="Gib deinen persönlichen PIN ein, um die Schicht zu starten."
        loading={clockIn.isPending}
        error={pinError}
      />

      <PinDialog
        open={pinDialog === "clockOut"}
        onClose={() => { setPinDialog(null); setPinError(null); }}
        onConfirm={handleClockOutWithCash}
        title="Ausstempeln"
        description="Gib deinen PIN ein, um die Schicht zu beenden."
        loading={clockOut.isPending}
        error={pinError}
      />

      {/* Bargeld-Start Dialog */}
      <Dialog open={showCashStartDialog} onOpenChange={(v) => { if (!v) { setShowCashStartDialog(false); setCashStartInput(""); setPendingPin(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-600" />
              Startbargeld erfassen
            </DialogTitle>
            <DialogDescription>
              Wie viel Bargeld hast du zu Beginn der Schicht im Portemonnaie?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cashStart">Startbargeld (CHF)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">CHF</span>
                <Input
                  id="cashStart"
                  type="number"
                  min="0"
                  step="0.05"
                  value={cashStartInput}
                  onChange={(e) => setCashStartInput(e.target.value)}
                  placeholder="0.00"
                  className="pl-12 text-lg font-mono"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Dieser Betrag wird beim Ausstempeln mit dem Endbetrag verglichen, um das Trinkgeld zu berechnen.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => clockIn.mutate({ pin: pendingPin ?? undefined, staffRole: "kellner" })}
                disabled={clockIn.isPending}
              >
                Überspringen
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleConfirmCashStart}
                disabled={clockIn.isPending}
              >
                {clockIn.isPending ? "Starte..." : "Schicht starten"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bargeld-End Dialog */}
      <Dialog open={showCashEndDialog} onOpenChange={(v) => { if (!v) { setShowCashEndDialog(false); setCashEndInput(""); setPendingPin(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-600" />
              Endbargeld & Trinkgeld
            </DialogTitle>
            <DialogDescription>
              Wie viel Bargeld hast du am Ende der Schicht im Portemonnaie?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cashEnd">Endbargeld (CHF)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">CHF</span>
                <Input
                  id="cashEnd"
                  type="number"
                  min="0"
                  step="0.05"
                  value={cashEndInput}
                  onChange={(e) => setCashEndInput(e.target.value)}
                  placeholder="0.00"
                  className="pl-12 text-lg font-mono"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Das Trinkgeld wird automatisch berechnet: Endbargeld − Startbargeld − Barzahlungen der Schicht.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => clockOut.mutate({ pin: pendingPin ?? undefined })}
                disabled={clockOut.isPending}
              >
                Überspringen
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleConfirmCashEnd}
                disabled={clockOut.isPending}
              >
                {clockOut.isPending ? "Ausstempeln..." : "Ausstempeln"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pflicht-Notiz-Dialog bei Schicht > 10h */}
      <Dialog open={requiresNoteDialog} onOpenChange={(v) => { if (!v) { setRequiresNoteDialog(false); setLongShiftNote(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              ⚠️ Lange Schicht – Notiz erforderlich
            </DialogTitle>
            <DialogDescription>
              Diese Schicht dauerte über 10 Stunden. Bitte hinterlasse eine kurze Begründung (z.B. Personalengpass, Veranstaltung).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              value={longShiftNote}
              onChange={e => setLongShiftNote(e.target.value)}
              placeholder="Begründung für die lange Schicht..."
              rows={4}
              maxLength={500}
              className="resize-none"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{longShiftNote.length}/500</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setRequiresNoteDialog(false); setLongShiftNote(""); }}
                >
                  Überspringen
                </Button>
                <Button
                  size="sm"
                  disabled={longShiftNote.trim().length < 5 || updateNotesMutation.isPending}
                  onClick={() => {
                    if (pendingClockOutShiftId) {
                      updateNotesMutation.mutate({ shiftId: pendingClockOutShiftId, notes: longShiftNote });
                    }
                  }}
                >
                  {updateNotesMutation.isPending ? "Speichern..." : "Notiz speichern"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
