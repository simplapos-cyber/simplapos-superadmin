/**
 * WaiterPlannedShifts.tsx – Geplante Schichten (Kellner-Sicht)
 *
 * Der Kellner sieht:
 * - Nächste Schicht (prominent)
 * - Alle kommenden Schichten (2 Wochen)
 * - Bestätigungs-Button pro Schicht
 * - Eigene Verfügbarkeit setzen
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Calendar, Clock, CheckCircle2, AlertCircle, Settings2, Loader2,
} from "lucide-react";

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-CH", {
    weekday: "long", day: "2-digit", month: "long",
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function WaiterPlannedShifts() {
  const [showAvailability, setShowAvailability] = useState(false);
  const [availability, setAvailability] = useState(
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      isAvailable: i >= 1 && i <= 5,
      availableFrom: "09:00",
      availableTo: "22:00",
    }))
  );

  const shiftsQuery = trpc.aiPlanning.getMyPlannedShifts.useQuery({ weeksAhead: 3 });
  const availabilityQuery = trpc.aiPlanning.getMyAvailability.useQuery();

  const confirmMutation = trpc.aiPlanning.confirmShift.useMutation({
    onSuccess: () => {
      toast.success("Schicht bestätigt");
      shiftsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveAvailabilityMutation = trpc.aiPlanning.setMyAvailability.useMutation({
    onSuccess: () => {
      toast.success("Verfügbarkeit gespeichert");
      setShowAvailability(false);
      availabilityQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const shifts = shiftsQuery.data?.shifts ?? [];
  const nextShift = shiftsQuery.data?.nextShift;

  // Verfügbarkeit aus DB laden
  const dbAvailability = availabilityQuery.data ?? [];

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mein Dienstplan</h1>
          <p className="text-muted-foreground text-sm mt-1">Geplante Schichten und Verfügbarkeit</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAvailability(true)}>
          <Settings2 className="w-4 h-4" /> Verfügbarkeit
        </Button>
      </div>

      {/* Nächste Schicht – prominent */}
      {nextShift ? (
        <Card className="border-2 border-blue-200 bg-blue-50/30">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Nächste Schicht</p>
                <p className="text-xl font-bold mt-1">{formatDate((nextShift as any).date)}</p>
                <p className="text-3xl font-bold text-blue-700 mt-1">
                  {(nextShift as any).startTime} – {(nextShift as any).endTime}
                </p>
                {(nextShift as any).breakMinutes > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    inkl. {(nextShift as any).breakMinutes} Min. Pause
                  </p>
                )}
                {(nextShift as any).aiNote && (
                  <p className="text-xs text-blue-700 mt-2 italic">"{(nextShift as any).aiNote}"</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-blue-600">
                  {getDaysUntil((nextShift as any).date) === 0 ? "Heute" :
                   getDaysUntil((nextShift as any).date) === 1 ? "Morgen" :
                   `In ${getDaysUntil((nextShift as any).date)} Tagen`}
                </div>
                {!(nextShift as any).confirmedByStaff ? (
                  <Button
                    size="sm"
                    className="mt-3 gap-1"
                    onClick={() => confirmMutation.mutate({ shiftId: (nextShift as any).id })}
                    disabled={confirmMutation.isPending}
                  >
                    {confirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Bestätigen
                  </Button>
                ) : (
                  <Badge className="mt-3 bg-green-100 text-green-700 border-green-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Bestätigt
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Keine geplanten Schichten</p>
            <p className="text-sm mt-1">Der Admin hat noch keinen Dienstplan veröffentlicht</p>
          </CardContent>
        </Card>
      )}

      {/* Alle Schichten */}
      {shifts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Kommende Schichten ({shifts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {shifts.map((shift: any) => {
                const daysUntil = getDaysUntil(shift.date);
                const isToday = daysUntil === 0;
                const isTomorrow = daysUntil === 1;
                return (
                  <div
                    key={shift.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isToday ? "bg-green-50 border-green-200" :
                      isTomorrow ? "bg-blue-50 border-blue-200" :
                      "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold ${
                        isToday ? "bg-green-500 text-white" :
                        isTomorrow ? "bg-blue-500 text-white" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        <span>{DAY_SHORT[new Date(shift.date).getDay()]}</span>
                        <span>{new Date(shift.date).getDate()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{formatDateShort(shift.date)}</p>
                        <p className="text-sm text-muted-foreground">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {shift.startTime} – {shift.endTime}
                          {shift.breakMinutes > 0 && ` (${shift.breakMinutes}m Pause)`}
                        </p>
                        {shift.aiNote && (
                          <p className="text-xs text-muted-foreground italic mt-0.5">{shift.aiNote}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{shift.netHours}h</span>
                      {shift.confirmedByStaff ? (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> OK
                        </Badge>
                      ) : (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => confirmMutation.mutate({ shiftId: shift.id })}
                          disabled={confirmMutation.isPending}
                        >
                          <AlertCircle className="w-3 h-3 text-orange-500" /> Bestätigen
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verfügbarkeits-Dialog */}
      <Dialog open={showAvailability} onOpenChange={setShowAvailability}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              Meine Verfügbarkeit
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Teile dem Admin mit, wann du verfügbar bist. Die KI berücksichtigt diese Angaben bei der Dienstplanung.
            </p>
            {availability.map((day, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg border">
                <div className="w-8 text-xs font-medium text-center">{DAY_NAMES[i].slice(0, 2)}</div>
                <Switch
                  checked={day.isAvailable}
                  onCheckedChange={v => setAvailability(a => a.map((d, j) => j === i ? { ...d, isAvailable: v } : d))}
                />
                {day.isAvailable ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="time"
                      value={day.availableFrom}
                      onChange={e => setAvailability(a => a.map((d, j) => j === i ? { ...d, availableFrom: e.target.value } : d))}
                      className="h-7 text-xs w-24"
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={day.availableTo}
                      onChange={e => setAvailability(a => a.map((d, j) => j === i ? { ...d, availableTo: e.target.value } : d))}
                      className="h-7 text-xs w-24"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground flex-1">Nicht verfügbar</span>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAvailability(false)}>Abbrechen</Button>
            <Button
              onClick={() => saveAvailabilityMutation.mutate({ availability })}
              disabled={saveAvailabilityMutation.isPending}
            >
              {saveAvailabilityMutation.isPending ? "Wird gespeichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
