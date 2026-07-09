/**
 * WaiterAbsences.tsx – Ferien & Abwesenheiten (Kellner-Sicht)
 *
 * Der Kellner kann:
 * - Ferien/Abwesenheitsanfragen stellen
 * - Status seiner Anfragen einsehen
 * - Anfragen stornieren (solange pending)
 * - Seinen Abwesenheits-Kalender sehen
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Calendar, Plus, Clock, CheckCircle2, XCircle, AlertCircle,
  Palmtree, Stethoscope, Baby, Umbrella, Trash2,
} from "lucide-react";

const ABSENCE_TYPES = [
  { value: "vacation", label: "Ferien", icon: Palmtree, color: "bg-blue-100 text-blue-700" },
  { value: "sick", label: "Krankheit", icon: Stethoscope, color: "bg-red-100 text-red-700" },
  { value: "parental", label: "Elternzeit", icon: Baby, color: "bg-pink-100 text-pink-700" },
  { value: "unpaid", label: "Unbezahlter Urlaub", icon: Umbrella, color: "bg-gray-100 text-gray-700" },
  { value: "other", label: "Sonstiges", icon: Calendar, color: "bg-purple-100 text-purple-700" },
];

const STATUS_CONFIG = {
  pending: { label: "Ausstehend", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  approved: { label: "Genehmigt", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  rejected: { label: "Abgelehnt", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  cancelled: { label: "Storniert", color: "bg-gray-100 text-gray-800 border-gray-200", icon: AlertCircle },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-CH", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function getDayCount(from: string, to: string): number {
  if (!from || !to) return 0;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
}

export default function WaiterAbsences() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: "vacation",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const absencesQuery = trpc.absences.getMyAbsences.useQuery({});
  const absencesData = absencesQuery.data;
  const createMutation = trpc.absences.requestAbsence.useMutation({
    onSuccess: () => {
      toast.success("Anfrage eingereicht – der Admin wird benachrichtigt");
      setShowForm(false);
      setForm({ type: "vacation", startDate: "", endDate: "", reason: "" });
      absencesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelMutation = trpc.absences.cancelAbsence.useMutation({
    onSuccess: () => {
      toast.success("Anfrage storniert");
      absencesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const absences = absencesData?.absences ?? [];
  const pending = absences.filter((a: any) => a.status === "pending");
  const approved = absences.filter((a: any) => a.status === "approved");
  const totalApprovedDays = absencesData?.totalApprovedDays ?? 0;
  const dayCount = getDayCount(form.startDate, form.endDate);

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ferien & Abwesenheiten</h1>
          <p className="text-muted-foreground text-sm mt-1">Anfragen stellen und Status verfolgen</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Anfrage stellen
        </Button>
      </div>

      {/* Statistik-Karten */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Ausstehend</p>
            <p className="text-2xl font-bold text-yellow-600">{pending.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Anfragen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Genehmigte Tage</p>
            <p className="text-2xl font-bold text-green-600">{totalApprovedDays}</p>
            <p className="text-xs text-muted-foreground mt-1">Dieses Jahr</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Gesamt Anfragen</p>
            <p className="text-2xl font-bold">{absences.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Anfragen-Liste */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Meine Anfragen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {absences.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Palmtree className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Noch keine Anfragen</p>
              <p className="text-sm mt-1">Stelle deine erste Ferien-Anfrage</p>
            </div>
          ) : (
            <div className="space-y-3">
              {absences.map((absence: any) => {
                const typeInfo = ABSENCE_TYPES.find(t => t.value === absence.type) ?? ABSENCE_TYPES[0];
                const statusInfo = STATUS_CONFIG[absence.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                const StatusIcon = statusInfo.icon;
                const TypeIcon = typeInfo.icon;
                const days = getDayCount(absence.startDate, absence.endDate);

                return (
                  <div key={absence.id} className="flex items-start justify-between p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                        <TypeIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{typeInfo.label}</p>
                          <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {formatDate(absence.startDate)} – {formatDate(absence.endDate)}
                          <span className="ml-2 font-medium text-foreground">{days} Tag{days !== 1 ? "e" : ""}</span>
                        </p>
                        {absence.reason && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{absence.reason}"</p>
                        )}
                        {absence.adminNote && (
                          <p className="text-xs mt-1 text-blue-700 bg-blue-50 px-2 py-1 rounded">
                            Admin: {absence.adminNote}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Eingereicht: {new Date(absence.createdAt).toLocaleDateString("de-CH")}
                        </p>
                      </div>
                    </div>
                    {absence.status === "pending" && (
                      <Button
                        variant="ghost" size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => cancelMutation.mutate({ absenceId: absence.id })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Neue Anfrage Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Neue Abwesenheitsanfrage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Art der Abwesenheit</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <t.icon className="w-4 h-4" />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Von</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  min={today}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Bis</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || today}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>

            {dayCount > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800 text-center">
                <strong>{dayCount} Tag{dayCount !== 1 ? "e" : ""}</strong> Abwesenheit
              </div>
            )}

            <div className="space-y-2">
              <Label>Begründung <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                placeholder="Kurze Begründung für den Admin..."
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="p-3 bg-yellow-50 rounded-lg text-xs text-yellow-800">
              Deine Anfrage wird dem Admin zur Genehmigung weitergeleitet. Du erhältst eine Benachrichtigung sobald eine Entscheidung getroffen wurde.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
            <Button
              onClick={() => createMutation.mutate({
                type: form.type as any,
                startDate: form.startDate,
                endDate: form.endDate,
                reason: form.reason || undefined,
              })}
              disabled={!form.startDate || !form.endDate || createMutation.isPending}
            >
              {createMutation.isPending ? "Wird eingereicht..." : "Anfrage einreichen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
