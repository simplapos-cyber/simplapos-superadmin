/**
 * KuecheCheckIn – Stempeluhr für Köche
 *
 * Kein PIN, kein Bargeld – nur Zeitstempel.
 * Gesetzliche Grundlage: CH ArG Art. 46 (Arbeitszeitaufzeichnung)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Clock, Play, Square, Coffee, ChevronRight, AlertTriangle,
  CheckCircle2, Info, Timer, Calendar,
} from "lucide-react";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "short" });
}

function getRequiredBreak(netMinutes: number): { minutes: number; label: string } {
  if (netMinutes >= 9 * 60) return { minutes: 60, label: "60 Min." };
  if (netMinutes >= 7 * 60) return { minutes: 30, label: "30 Min." };
  if (netMinutes >= 5.5 * 60) return { minutes: 15, label: "15 Min." };
  return { minutes: 0, label: "keine Pflicht" };
}

// ─── Live-Timer ───────────────────────────────────────────────────────────────

function LiveTimer({
  startedAt,
  breakMinutes,
  isOnBreak,
  breakStartedAt,
}: {
  startedAt: Date | string;
  breakMinutes: number;
  isOnBreak: boolean;
  breakStartedAt?: Date | string | null;
}) {
  const [, forceUpdate] = useState(0);
  // Tick every second
  useState(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(id);
  });

  const now = Date.now();
  const totalMs = now - new Date(startedAt).getTime();
  const breakMs = breakMinutes * 60 * 1000;
  const currentBreakMs = isOnBreak && breakStartedAt
    ? now - new Date(breakStartedAt).getTime()
    : 0;
  const netMs = Math.max(0, totalMs - breakMs - currentBreakMs);

  const display = isOnBreak ? currentBreakMs : netMs;
  const h = Math.floor(display / 3600000);
  const m = Math.floor((display % 3600000) / 60000);
  const s = Math.floor((display % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="text-center space-y-1">
      <div className={`text-5xl font-mono font-bold tracking-tight ${isOnBreak ? "text-amber-500" : "text-foreground"}`}>
        {pad(h)}:{pad(m)}:{pad(s)}
      </div>
      <div className="text-xs text-muted-foreground">
        {isOnBreak ? "Pause läuft" : "Netto-Arbeitszeit"}
      </div>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function KuecheCheckIn() {
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: currentShift } = trpc.shifts.getCurrentShift.useQuery(
    undefined, { refetchInterval: 30000 }
  );
  const { data: historyData } = trpc.shifts.getMyShifts.useQuery({ limit: 20 });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const clockIn = trpc.shifts.clockIn.useMutation({
    onSuccess: () => {
      toast.success("Schicht gestartet! Guten Dienst 👨‍🍳");
      utils.shifts.getCurrentShift.invalidate();
      utils.shifts.getMyShifts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const clockOut = trpc.shifts.clockOut.useMutation({
    onSuccess: (data) => {
      const msg = data.breakCompliant
        ? `Schicht beendet. Netto: ${formatMinutes(data.netWorkMinutes)} ✓`
        : `Schicht beendet. ⚠️ Pflichtpause von ${data.requiredBreakMinutes} Min. nicht eingehalten!`;
      toast[data.breakCompliant ? "success" : "warning"](msg);
      utils.shifts.getCurrentShift.invalidate();
      utils.shifts.getMyShifts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

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

  return (
    <div className="space-y-6 p-4 max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          Stempeluhr – Küche
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

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
                  onClick={() => clockIn.mutate({ staffRole: "koch" })}
                  disabled={clockIn.isPending}
                >
                  <Play className="h-5 w-5 mr-2" />
                  {clockIn.isPending ? "Starte..." : "Einstempeln"}
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
                      Weiter­arbeiten
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    className="flex-1 h-14 text-base font-semibold"
                    onClick={() => clockOut.mutate({})}
                    disabled={clockOut.isPending}
                  >
                    <Square className="h-5 w-5 mr-2" />
                    {clockOut.isPending ? "Ausstempeln..." : "Ausstempeln"}
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

      {/* Schicht-Verlauf */}
      {historyData && historyData.shifts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Letzte Schichten</h2>
          </div>
          <div className="space-y-2">
            {historyData.shifts.filter((s: typeof historyData.shifts[0]) => s.status === "completed").slice(0, 5).map((shift: typeof historyData.shifts[0]) => (
              <div key={shift.id} className="flex items-center justify-between py-2 px-3 rounded-md border bg-card">
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
    </div>
  );
}
