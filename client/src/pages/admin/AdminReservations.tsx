import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Plus, Search, Clock, Users, CheckCircle, Edit, Trash2, Phone, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { format, isToday, isTomorrow, startOfDay, endOfDay, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { ModuleGate } from "@/components/ModuleGate";

type ReservationStatus = "angefragt" | "bestaetigt" | "angekommen" | "abgeschlossen" | "storniert" | "no_show";

const STATUS_LABELS: Record<ReservationStatus, string> = {
  angefragt: "Angefragt",
  bestaetigt: "Bestätigt",
  angekommen: "Erschienen",
  abgeschlossen: "Abgeschlossen",
  storniert: "Storniert",
  no_show: "No-Show",
};

const STATUS_COLORS: Record<ReservationStatus, string> = {
  angefragt: "bg-yellow-100 text-yellow-800 border-yellow-200",
  bestaetigt: "bg-green-100 text-green-800 border-green-200",
  angekommen: "bg-blue-100 text-blue-800 border-blue-200",
  abgeschlossen: "bg-gray-100 text-gray-700 border-gray-200",
  storniert: "bg-red-100 text-red-800 border-red-200",
  no_show: "bg-orange-100 text-orange-800 border-orange-200",
};

const SOURCE_LABELS: Record<string, string> = {
  telefon: "Telefon", online: "Online", walk_in: "Walk-In", app: "App", partner: "Partner",
};

const EMPTY_FORM = {
  guestName: "", guestPhone: "", guestEmail: "", guestCount: 2,
  reservedAt: "", duration: 90, notes: "", guestNotes: "", source: "telefon" as const,
};

function AdminReservationsInner() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [dateFilter, setDateFilter] = useState<string>("alle");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: reservations = [], isLoading, isError, error, refetch } = trpc.reservations.list.useQuery(
    statusFilter !== "alle" ? { status: statusFilter as ReservationStatus } : undefined,
    { refetchInterval: 60_000 }
  );

  const { data: stats } = trpc.reservations.stats.useQuery(undefined, { refetchInterval: 60_000 });

  const createMutation = trpc.reservations.create.useMutation({
    onSuccess: () => { toast.success("Reservierung erstellt"); utils.reservations.list.invalidate(); utils.reservations.stats.invalidate(); setCreateOpen(false); setForm(EMPTY_FORM); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.reservations.update.useMutation({
    onSuccess: () => { toast.success("Reservierung aktualisiert"); utils.reservations.list.invalidate(); setEditOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.reservations.updateStatus.useMutation({
    onSuccess: () => { utils.reservations.list.invalidate(); utils.reservations.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.reservations.delete.useMutation({
    onSuccess: () => { toast.success("Reservierung gelöscht"); utils.reservations.list.invalidate(); utils.reservations.stats.invalidate(); setDeleteOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let list = reservations as any[];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.guestName.toLowerCase().includes(q) || (r.guestPhone ?? "").includes(q) || (r.guestEmail ?? "").toLowerCase().includes(q));
    }
    if (dateFilter === "heute") list = list.filter((r) => isToday(new Date(r.reservedAt)));
    else if (dateFilter === "morgen") list = list.filter((r) => isTomorrow(new Date(r.reservedAt)));
    else if (dateFilter === "woche") {
      const weekEnd = addDays(new Date(), 7);
      list = list.filter((r) => { const d = new Date(r.reservedAt); return d >= startOfDay(new Date()) && d <= endOfDay(weekEnd); });
    }
    return list;
  }, [reservations, search, dateFilter]);

  function openEdit(r: any) {
    setSelectedId(r.id);
    setForm({ guestName: r.guestName, guestPhone: r.guestPhone ?? "", guestEmail: r.guestEmail ?? "", guestCount: r.guestCount, reservedAt: r.reservedAt ? new Date(r.reservedAt).toISOString().slice(0, 16) : "", duration: r.duration ?? 90, notes: r.notes ?? "", guestNotes: r.guestNotes ?? "", source: r.source ?? "telefon" });
    setEditOpen(true);
  }

  function handleCreate() {
    if (!form.guestName.trim()) return toast.error("Name ist erforderlich");
    if (!form.reservedAt) return toast.error("Datum/Uhrzeit ist erforderlich");
    createMutation.mutate({ ...form, reservedAt: new Date(form.reservedAt).toISOString(), guestPhone: form.guestPhone || undefined, guestEmail: form.guestEmail || undefined, notes: form.notes || undefined, guestNotes: form.guestNotes || undefined });
  }

  function handleUpdate() {
    if (!selectedId) return;
    updateMutation.mutate({ id: selectedId, ...form, reservedAt: form.reservedAt ? new Date(form.reservedAt).toISOString() : undefined, guestPhone: form.guestPhone || undefined, guestEmail: form.guestEmail || undefined, notes: form.notes || undefined, guestNotes: form.guestNotes || undefined });
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Calendar className="h-6 w-6" /> Reservierungen</h1>
            <p className="text-muted-foreground mt-1">Tischreservierungen verwalten und bestätigen</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Neue Reservierung</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Calendar, label: "Heute", value: stats?.today ?? 0, color: "text-blue-600" },
            { icon: Clock, label: "Ausstehend", value: stats?.pending ?? 0, color: "text-yellow-600" },
            { icon: CheckCircle, label: "Bestätigt", value: stats?.confirmed ?? 0, color: "text-green-600" },
            { icon: Users, label: "Total", value: stats?.total ?? 0, color: "text-purple-600" },
          ].map((s) => (
            <Card key={s.label}><CardContent className="pt-4"><s.icon className={`h-5 w-5 ${s.color} mb-1`} /><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-bold">{s.value}</p></CardContent></Card>
          ))}
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Name, Telefon oder E-Mail..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Zeitraum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Termine</SelectItem>
                  <SelectItem value="heute">Heute</SelectItem>
                  <SelectItem value="morgen">Morgen</SelectItem>
                  <SelectItem value="woche">Diese Woche</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{filtered.length} Reservierung{filtered.length !== 1 ? "en" : ""}</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Lade Reservierungen...</div>
            ) : isError ? (
              <div className="p-8 text-center text-destructive">
                <p className="font-medium">Fehler beim Laden der Reservierungen</p>
                <p className="text-sm text-muted-foreground mt-1">{(error as any)?.message ?? "Unbekannter Fehler"}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Erneut versuchen</Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground"><Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Keine Reservierungen gefunden</p></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gast</TableHead>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Personen</TableHead>
                      <TableHead>Quelle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.guestName}</div>
                          {r.guestPhone && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {r.guestPhone}</div>}
                          {r.guestEmail && <div className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> {r.guestEmail}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{format(new Date(r.reservedAt), "dd.MM.yyyy", { locale: de })}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(r.reservedAt), "HH:mm")} Uhr · {r.duration} Min.</div>
                        </TableCell>
                        <TableCell><div className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-muted-foreground" />{r.guestCount}</div></TableCell>
                        <TableCell><span className="text-xs text-muted-foreground">{SOURCE_LABELS[r.source] ?? r.source}</span></TableCell>
                        <TableCell>
                          <Select value={r.status} onValueChange={(v) => updateStatusMutation.mutate({ id: r.id, status: v as ReservationStatus })}>
                            <SelectTrigger className={`h-7 text-xs w-[130px] border ${STATUS_COLORS[r.status as ReservationStatus] ?? ""}`}><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(STATUS_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Edit className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { setSelectedId(r.id); setDeleteOpen(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Neue Reservierung</DialogTitle></DialogHeader>
          <ReservationForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>{createMutation.isPending ? "Speichern..." : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Reservierung bearbeiten</DialogTitle></DialogHeader>
          <ReservationForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Abbrechen</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Speichern..." : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reservierung löschen?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => selectedId && deleteMutation.mutate({ id: selectedId })} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "Löschen..." : "Löschen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReservationForm({ form, setForm }: { form: typeof EMPTY_FORM; setForm: (f: typeof EMPTY_FORM) => void }) {
  function set(key: keyof typeof EMPTY_FORM, value: any) { setForm({ ...form, [key]: value }); }
  return (
    <div className="grid gap-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Name des Gastes *</Label>
          <Input value={form.guestName} onChange={(e) => set("guestName", e.target.value)} placeholder="z.B. Familie Müller" />
        </div>
        <div>
          <Label>Telefon</Label>
          <Input value={form.guestPhone} onChange={(e) => set("guestPhone", e.target.value)} placeholder="+41 79 123 45 67" />
        </div>
        <div>
          <Label>E-Mail</Label>
          <Input value={form.guestEmail} onChange={(e) => set("guestEmail", e.target.value)} placeholder="gast@beispiel.ch" type="email" />
        </div>
        <div>
          <Label>Datum & Uhrzeit *</Label>
          <Input type="datetime-local" value={form.reservedAt} onChange={(e) => set("reservedAt", e.target.value)} />
        </div>
        <div>
          <Label>Dauer (Minuten)</Label>
          <Input type="number" min={15} max={480} value={form.duration} onChange={(e) => set("duration", parseInt(e.target.value) || 90)} />
        </div>
        <div>
          <Label>Anzahl Personen</Label>
          <Input type="number" min={1} max={500} value={form.guestCount} onChange={(e) => set("guestCount", parseInt(e.target.value) || 2)} />
        </div>
        <div>
          <Label>Quelle</Label>
          <Select value={form.source} onValueChange={(v) => set("source", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="telefon">Telefon</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="walk_in">Walk-In</SelectItem>
              <SelectItem value="app">App</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Notizen des Gastes (Allergien etc.)</Label>
          <Textarea value={form.guestNotes} onChange={(e) => set("guestNotes", e.target.value)} rows={2} placeholder="Laktoseintoleranz, Geburtstagstisch..." />
        </div>
        <div className="col-span-2">
          <Label>Interne Notizen</Label>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Nur für das Team sichtbar..." />
        </div>
      </div>
    </div>
  );
}

export default function AdminReservations() {
  return (
    <ModuleGate moduleId="tischreservierung">
      <AdminReservationsInner />
    </ModuleGate>
  );
}
