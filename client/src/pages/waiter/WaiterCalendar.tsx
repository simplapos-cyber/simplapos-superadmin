/**
 * WaiterCalendar.tsx
 * Monatskalender für den Kellner – zeigt geplante Schichten, geleistete Schichten,
 * Ferien/Abwesenheiten und Verfügbarkeit auf einen Blick.
 */

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft, ChevronRight, Clock, CalendarDays, Palmtree,
  CheckCircle2, Circle, Briefcase, AlertCircle, TrendingUp,
  Star, Sun, Moon, Pencil, Save, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── Konstanten ───────────────────────────────────────────────────────────────

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAYS_LONG  = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const ABSENCE_COLORS: Record<string, string> = {
  vacation: "bg-emerald-100 text-emerald-800 border-emerald-300",
  sick:     "bg-red-100 text-red-800 border-red-300",
  personal: "bg-purple-100 text-purple-800 border-purple-300",
  unpaid:   "bg-orange-100 text-orange-800 border-orange-300",
  other:    "bg-gray-100 text-gray-800 border-gray-300",
};
const ABSENCE_LABELS: Record<string, string> = {
  vacation: "Ferien",
  sick:     "Krank",
  personal: "Persönlich",
  unpaid:   "Unbezahlt",
  other:    "Abwesend",
};

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ─── Tages-Detail-Panel ───────────────────────────────────────────────────────

type DayData = {
  date: string;
  dayOfWeek: number;
  workedShifts: any[];
  plannedShifts: any[];
  absences: any[];
  isAvailable: boolean | null;
  availableFrom: string | null;
  availableTo: string | null;
  totalWorkedMinutes: number;
  isToday: boolean;
  isPast: boolean;
};

function DayDetailPanel({ day, onClose, onNotesUpdated }: { day: DayData; onClose: () => void; onNotesUpdated?: (shiftId: number, notes: string | null) => void }) {
  const dateObj = new Date(day.date + "T12:00:00");
  const hasWorked = day.workedShifts.length > 0;
  const hasPlanned = day.plannedShifts.length > 0;
  const hasAbsence = day.absences.length > 0;

  // Kommentar-State pro Schicht (shiftId → editMode/text)
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // Bewertungs-State pro Schicht
  const [ratingShiftId, setRatingShiftId] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [selectedMood, setSelectedMood] = useState<"great" | "good" | "neutral" | "tired" | "stressed">("neutral");
  const [ratingComment, setRatingComment] = useState("");
  const [submittedRatings, setSubmittedRatings] = useState<Record<number, number>>({});

  const rateShiftMutation = trpc.shifts.rateShift.useMutation({
    onSuccess: (result) => {
      toast.success("Bewertung gespeichert!");
      setSubmittedRatings(prev => ({ ...prev, [result.shiftId]: result.rating }));
      setRatingShiftId(null);
      setSelectedRating(0);
      setRatingComment("");
    },
    onError: (err) => toast.error(err.message || "Fehler beim Speichern"),
  });

  const openRating = useCallback((shift: any) => {
    setRatingShiftId(shift.id);
    setSelectedRating(shift.rating ?? 0);
    setSelectedMood(shift.mood ?? "neutral");
    setRatingComment(shift.ratingComment ?? "");
  }, []);

  const utils = trpc.useUtils();
  const updateNotesMutation = trpc.shifts.updateShiftNotes.useMutation({
    onSuccess: (result) => {
      toast.success(result.notes ? "Notiz gespeichert" : "Notiz gelöscht");
      setEditingShiftId(null);
      utils.shifts.getMyCalendar.invalidate();
      onNotesUpdated?.(result.shiftId, result.notes);
    },
    onError: (err) => {
      toast.error(err.message || "Fehler beim Speichern");
    },
  });

  function startEdit(shift: any) {
    setEditingShiftId(shift.id);
    setEditText(shift.notes ?? "");
  }

  function cancelEdit() {
    setEditingShiftId(null);
    setEditText("");
  }

  function saveNotes(shiftId: number) {
    updateNotesMutation.mutate({ shiftId, notes: editText });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <p className="text-sm text-muted-foreground">{WEEKDAYS_LONG[day.dayOfWeek]}</p>
            <h2 className="text-xl font-bold">
              {dateObj.getDate()}. {MONTHS[dateObj.getMonth()]} {dateObj.getFullYear()}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            ✕
          </Button>
        </div>

        <div className="p-5 space-y-4">
          {/* Abwesenheiten */}
          {hasAbsence && day.absences.map((a: any, i: number) => (
            <div key={i} className={cn(
              "rounded-xl border p-4",
              ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.other
            )}>
              <div className="flex items-center gap-2 font-semibold">
                <Palmtree className="h-4 w-4" />
                {ABSENCE_LABELS[a.type] ?? a.type}
                <Badge variant="outline" className="ml-auto text-xs">
                  {a.status === "approved" ? "Genehmigt" : a.status === "pending" ? "Ausstehend" : "Abgelehnt"}
                </Badge>
              </div>
              {a.reason && <p className="text-sm mt-1 opacity-80">{a.reason}</p>}
              <p className="text-xs mt-1 opacity-70">{a.startDate} – {a.endDate}</p>
            </div>
          ))}

          {/* Geplante Schichten */}
          {hasPlanned && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <CalendarDays className="h-4 w-4" /> Geplante Schicht
              </h3>
              {day.plannedShifts.map((s: any, i: number) => (
                <div key={i} className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-blue-800">
                      <Sun className="h-4 w-4" />
                      {s.startTime} – {s.endTime}
                    </div>
                    <Badge className="bg-blue-600 text-white text-xs">
                      {s.role ?? "Kellner"}
                    </Badge>
                  </div>
                  {s.notes && <p className="text-sm text-blue-700 mt-1">{s.notes}</p>}
                  {s.confirmed && (
                    <div className="flex items-center gap-1 text-xs text-green-700 mt-2">
                      <CheckCircle2 className="h-3 w-3" /> Bestätigt
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Geleistete Schichten */}
          {hasWorked && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Clock className="h-4 w-4" /> Geleistete Schicht
              </h3>
              {day.workedShifts.map((s: any, i: number) => (
                <div key={i} className="rounded-xl bg-green-50 border border-green-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-green-800">
                      <CheckCircle2 className="h-4 w-4" />
                      {new Date(s.startedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                      {s.endedAt && ` – ${new Date(s.endedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                    <Badge className="bg-green-600 text-white text-xs">
                      {s.status === "completed" ? "Abgeschlossen" : "Aktiv"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs">Netto</p>
                      <p className="font-semibold text-green-800">{formatMinutes(s.netWorkMinutes ?? 0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs">Pause</p>
                      <p className="font-semibold">{formatMinutes(s.breakMinutes ?? 0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground text-xs">Gesamt</p>
                      <p className="font-semibold">{formatMinutes(s.durationMinutes ?? 0)}</p>
                    </div>
                  </div>

                  {/* Bewertungs-Bereich */}
                  <div className="mt-3 border-t border-green-200 pt-3">
                    {ratingShiftId === s.id ? (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-green-800">Schicht bewerten</p>
                        {/* Sterne */}
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(star => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setSelectedRating(star)}
                              className={cn(
                                "text-2xl transition-transform hover:scale-110",
                                star <= selectedRating ? "text-yellow-400" : "text-gray-300"
                              )}
                            >★</button>
                          ))}
                          <span className="ml-2 text-sm text-muted-foreground self-center">
                            {selectedRating > 0 ? ["Schlecht","Geht so","Ok","Gut","Super!"][selectedRating-1] : "Auswählen"}
                          </span>
                        </div>
                        {/* Stimmung */}
                        <div className="flex flex-wrap gap-1">
                          {(["great","good","neutral","tired","stressed"] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setSelectedMood(m)}
                              className={cn(
                                "px-2 py-0.5 rounded-full text-xs border transition-colors",
                                selectedMood === m
                                  ? "bg-green-600 text-white border-green-600"
                                  : "bg-white text-green-800 border-green-300 hover:bg-green-50"
                              )}
                            >
                              {{ great:"😄 Super", good:"😊 Gut", neutral:"😐 Ok", tired:"😴 Müde", stressed:"😓 Gestresst" }[m]}
                            </button>
                          ))}
                        </div>
                        {/* Kommentar */}
                        <Textarea
                          value={ratingComment}
                          onChange={e => setRatingComment(e.target.value)}
                          placeholder="Optionaler Kommentar..."
                          className="text-xs resize-none bg-white border-green-300"
                          rows={2}
                          maxLength={500}
                        />
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setRatingShiftId(null)}>
                            <X className="h-3 w-3 mr-1" /> Abbrechen
                          </Button>
                          <Button
                            size="sm"
                            className="text-xs h-7 bg-yellow-500 hover:bg-yellow-600 text-white"
                            disabled={selectedRating === 0 || rateShiftMutation.isPending}
                            onClick={() => rateShiftMutation.mutate({ shiftId: s.id, rating: selectedRating, mood: selectedMood, comment: ratingComment || undefined })}
                          >
                            <Star className="h-3 w-3 mr-1" />
                            {rateShiftMutation.isPending ? "Speichern..." : "Bewertung speichern"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(star => (
                            <span key={star} className={cn(
                              "text-sm",
                              star <= (submittedRatings[s.id] ?? s.rating ?? 0) ? "text-yellow-400" : "text-gray-300"
                            )}>★</span>
                          ))}
                          {!(submittedRatings[s.id] ?? s.rating) && (
                            <span className="text-xs text-muted-foreground ml-1 self-center">Noch nicht bewertet</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50"
                          onClick={() => openRating(s)}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          {(submittedRatings[s.id] ?? s.rating) ? "Neu bewerten" : "Bewerten"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Kommentar-Bereich */}
                  <div className="mt-3 border-t border-green-200 pt-3">
                    {editingShiftId === s.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          placeholder="Notiz zur Schicht (z.B. Spätschicht übernommen von Max)..."
                          className="text-sm resize-none bg-white border-green-300 focus:border-green-500"
                          rows={3}
                          maxLength={1000}
                          autoFocus
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{editText.length}/1000</span>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEdit}
                              className="text-xs h-7 px-2"
                            >
                              <X className="h-3 w-3 mr-1" /> Abbrechen
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveNotes(s.id)}
                              disabled={updateNotesMutation.isPending}
                              className="text-xs h-7 px-3 bg-green-600 hover:bg-green-700 text-white"
                            >
                              <Save className="h-3 w-3 mr-1" />
                              {updateNotesMutation.isPending ? "Speichern..." : "Speichern"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {s.notes ? (
                            <p className="text-xs text-green-800 italic leading-relaxed">
                              „{s.notes}“
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">Keine Notiz vorhanden</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(s)}
                          className="text-xs h-7 px-2 text-green-700 hover:text-green-900 hover:bg-green-100 flex-shrink-0"
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          {s.notes ? "Bearbeiten" : "Notiz hinzufügen"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Verfügbarkeit */}
          {!hasAbsence && !hasWorked && !hasPlanned && (
            <div className={cn(
              "rounded-xl border p-4 text-center",
              day.isAvailable === false
                ? "bg-gray-50 border-gray-200 text-gray-500"
                : day.isAvailable === true
                  ? "bg-sky-50 border-sky-200 text-sky-700"
                  : "bg-muted/30 border-border text-muted-foreground"
            )}>
              {day.isAvailable === false ? (
                <><Moon className="h-5 w-5 mx-auto mb-1" /><p className="font-medium">Nicht verfügbar</p></>
              ) : day.isAvailable === true ? (
                <>
                  <Sun className="h-5 w-5 mx-auto mb-1" />
                  <p className="font-medium">Verfügbar</p>
                  {day.availableFrom && day.availableTo && (
                    <p className="text-sm mt-1">{day.availableFrom} – {day.availableTo}</p>
                  )}
                </>
              ) : (
                <><Circle className="h-5 w-5 mx-auto mb-1" /><p>Kein Eintrag</p></>
              )}
            </div>
          )}

          {/* Aktionen */}
          <div className="flex gap-2 pt-2">
            <Link href="/kellner/absences" className="flex-1">
              <Button variant="outline" size="sm" className="w-full text-xs">
                <Palmtree className="h-3 w-3 mr-1" /> Abwesenheit beantragen
              </Button>
            </Link>
            <Link href="/kellner/planned-shifts" className="flex-1">
              <Button variant="outline" size="sm" className="w-full text-xs">
                <CalendarDays className="h-3 w-3 mr-1" /> Dienstplan
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Kalender-Zelle ───────────────────────────────────────────────────────────

function CalendarCell({
  day,
  onClick,
}: {
  day: DayData;
  onClick: () => void;
}) {
  const dateNum = parseInt(day.date.split("-")[2]);
  const hasWorked = day.workedShifts.length > 0;
  const hasPlanned = day.plannedShifts.length > 0;
  const hasAbsence = day.absences.length > 0;
  const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative min-h-[72px] sm:min-h-[90px] rounded-xl border p-1.5 sm:p-2 text-left transition-all",
        "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
        day.isToday
          ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/30"
          : isWeekend
            ? "bg-muted/20 border-border/50"
            : "bg-background border-border/50 hover:border-primary/30",
        day.isPast && !day.isToday && "opacity-60",
      )}
    >
      {/* Tageszahl */}
      <div className={cn(
        "text-sm font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full",
        day.isToday
          ? "bg-primary text-primary-foreground"
          : isWeekend
            ? "text-muted-foreground"
            : "text-foreground"
      )}>
        {dateNum}
      </div>

      {/* Badges */}
      <div className="space-y-0.5">
        {hasAbsence && day.absences.slice(0, 1).map((a: any, i: number) => (
          <div key={i} className={cn(
            "text-[10px] font-medium px-1 py-0.5 rounded truncate border",
            ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.other
          )}>
            <Palmtree className="h-2.5 w-2.5 inline mr-0.5" />
            {ABSENCE_LABELS[a.type] ?? "Abwesend"}
          </div>
        ))}

        {hasPlanned && !hasAbsence && day.plannedShifts.slice(0, 1).map((s: any, i: number) => (
          <div key={i} className="text-[10px] font-medium px-1 py-0.5 rounded truncate bg-blue-100 text-blue-800 border border-blue-200">
            <CalendarDays className="h-2.5 w-2.5 inline mr-0.5" />
            {s.startTime}–{s.endTime}
          </div>
        ))}

        {hasWorked && (
          <div className="text-[10px] font-medium px-1 py-0.5 rounded truncate bg-green-100 text-green-800 border border-green-200">
            <CheckCircle2 className="h-2.5 w-2.5 inline mr-0.5" />
            {formatMinutes(day.totalWorkedMinutes)}
          </div>
        )}

        {!hasWorked && !hasPlanned && !hasAbsence && day.isAvailable === false && (
          <div className="text-[10px] px-1 py-0.5 rounded text-gray-400">
            <Moon className="h-2.5 w-2.5 inline" />
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function WaiterCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  const { data, isLoading } = trpc.shifts.getMyCalendar.useQuery({ year, month });

  // Vorherigen / nächsten Monat navigieren
  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Wochentag des 1. des Monats (0=So → Montag-basiert: Mo=0)
  const firstDayOfWeek = useMemo(() => {
    const d = new Date(year, month - 1, 1).getDay();
    return (d + 6) % 7; // Montag = 0
  }, [year, month]);

  const stats = data?.stats;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Mein Kalender
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Schichten, Ferien und Verfügbarkeit auf einen Blick
          </p>
        </div>
        <Link href="/kellner/planned-shifts">
          <Button variant="outline" size="sm" className="hidden sm:flex gap-1">
            <Briefcase className="h-4 w-4" /> Dienstplan
          </Button>
        </Link>
      </div>

      {/* Monats-Navigation */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-full">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-center">
              <h2 className="text-lg font-bold">{MONTHS[month - 1]} {year}</h2>
              {stats && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stats.totalWorkedShifts} Schichten · {stats.totalWorkedHours}h geleistet
                  {stats.totalAbsenceDays > 0 && ` · ${stats.totalAbsenceDays} Ferientage`}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-full">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Wochentag-Header */}
          <div className="grid grid-cols-7 mb-2">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(d => (
              <div key={d} className={cn(
                "text-center text-xs font-semibold py-1",
                d === "Sa" || d === "So" ? "text-muted-foreground" : "text-foreground"
              )}>
                {d}
              </div>
            ))}
          </div>

          {/* Kalender-Grid */}
          {isLoading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="min-h-[72px] rounded-xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {/* Leere Zellen vor dem 1. */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[72px]" />
              ))}

              {/* Tages-Zellen */}
              {data?.days.map((day) => (
                <CalendarCell
                  key={day.date}
                  day={day}
                  onClick={() => setSelectedDay(day)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legende */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-200 border border-green-300" />
          Geleistete Schicht
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-200 border border-blue-300" />
          Geplante Schicht
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300" />
          Ferien (genehmigt)
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-200 border border-red-300" />
          Krank
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-primary border border-primary" />
          Heute
        </div>
      </div>

      {/* Monats-Statistiken */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-green-800">{stats.totalWorkedHours}h</p>
              <p className="text-xs text-green-700">Geleistet</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-center">
              <CalendarDays className="h-5 w-5 text-blue-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-blue-800">{stats.totalWorkedShifts}</p>
              <p className="text-xs text-blue-700">Schichten</p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-4 text-center">
              <Palmtree className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-800">{stats.totalAbsenceDays}</p>
              <p className="text-xs text-emerald-700">Ferientage</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4 text-center">
              <Star className="h-5 w-5 text-purple-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-purple-800">{stats.totalPlannedShifts}</p>
              <p className="text-xs text-purple-700">Geplant</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Schnell-Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href="/kellner/shift">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium">Stempeluhr</p>
              <p className="text-xs text-muted-foreground">Ein-/Ausstempeln</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/kellner/absences">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
            <CardContent className="p-4 text-center">
              <Palmtree className="h-6 w-6 mx-auto mb-2 text-emerald-600" />
              <p className="text-sm font-medium">Ferien beantragen</p>
              <p className="text-xs text-muted-foreground">Abwesenheitsantrag</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/kellner/shift-swap">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed col-span-2 sm:col-span-1">
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 text-orange-500" />
              <p className="text-sm font-medium">Schicht tauschen</p>
              <p className="text-xs text-muted-foreground">Tausch-Anfragen</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Tages-Detail-Panel */}
      {selectedDay && (
        <DayDetailPanel day={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
