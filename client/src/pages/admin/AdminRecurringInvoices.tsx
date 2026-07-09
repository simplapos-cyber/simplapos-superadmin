import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw, Plus, Pencil, Trash2, Play, Pause, Calendar, User, Repeat,
  ChevronDown, ChevronUp, AlertCircle, Loader2, FileText, CreditCard, Eye
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; taxRate: number };

type RecurringInvoice = {
  id: number;
  description: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientAddress: string | null;
  creditorName: string;
  creditorAddress: string;
  iban: string;
  currency: string;
  interval: string;
  intervalDay: number;
  discountPercent: string;
  paymentTermDays: number;
  additionalInfo: string | null;
  internalNotes: string | null;
  lineItems: LineItem[];
  active: boolean;
  nextDueDate: string;
  startDate: string | null;
  endDate: string | null;
  maxOccurrences: number | null;
  totalCreated: number;
  createdAt: Date;
};

const INTERVAL_LABELS: Record<string, string> = {
  daily: "Täglich", weekly: "Wöchentlich", monthly: "Monatlich",
  quarterly: "Vierteljährlich", yearly: "Jährlich",
};

function calcTotal(items: LineItem[], discountPercent: number): number {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice * (1 + i.taxRate / 100), 0);
  return subtotal * (1 - discountPercent / 100);
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-CH");
}

// ─── Formular-Standardwerte ────────────────────────────────────────────────────
const DEFAULT_FORM = {
  description: "",
  recipientName: "",
  recipientEmail: "",
  recipientAddress: "",
  creditorName: "",
  creditorAddress: "",
  iban: "",
  currency: "CHF",
  interval: "monthly" as const,
  intervalDay: 1,
  discountPercent: 0,
  paymentTermDays: 30,
  additionalInfo: "",
  internalNotes: "",
  nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  startDate: "",
  endDate: "",
  maxOccurrences: "",
  lineItems: [{ description: "", quantity: 1, unit: "Stk.", unitPrice: 0, taxRate: 8.1 }] as LineItem[],
};

// ─── Einzelkarte ──────────────────────────────────────────────────────────────
function RecurringCard({
  rec, restaurantId, onEdit, onRefresh, onPreview,
}: {
  rec: RecurringInvoice; restaurantId: number;
  onEdit: (r: RecurringInvoice) => void;
  onRefresh: () => void;
  onPreview: (r: RecurringInvoice) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = calcTotal(rec.lineItems, parseFloat(rec.discountPercent));

  const toggleMutation = trpc.recurringInvoices.toggleActive.useMutation({
    onSuccess: () => { toast.success(rec.active ? "Pausiert" : "Aktiviert"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.recurringInvoices.delete.useMutation({
    onSuccess: () => { toast.success("Abonnement gelöscht"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className={cn("border-l-4 transition-shadow hover:shadow-md", {
      "border-l-emerald-400": rec.active,
      "border-l-gray-300": !rec.active,
    })}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{rec.description}</span>
              <Badge variant={rec.active ? "default" : "secondary"} className="text-xs">
                {rec.active ? "Aktiv" : "Pausiert"}
              </Badge>
              <Badge variant="outline" className="text-xs gap-1">
                <Repeat className="h-3 w-3" />
                {INTERVAL_LABELS[rec.interval] ?? rec.interval}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {rec.recipientName}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Calendar className="h-3 w-3" />
              Nächste Rechnung: {formatDate(rec.nextDueDate)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-base">CHF {total.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{rec.totalCreated} erstellt</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={() => onEdit(rec)} className="gap-1.5 flex-1">
            <Pencil className="h-3.5 w-3.5" /> Bearbeiten
          </Button>
          <Button size="sm" variant="outline" onClick={() => onPreview(rec)} className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50">
            <Eye className="h-3.5 w-3.5" /> Vorschau
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("gap-1.5", rec.active ? "text-orange-600 border-orange-200 hover:bg-orange-50" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50")}
            onClick={() => toggleMutation.mutate({ id: rec.id, restaurantId, active: !rec.active })}
            disabled={toggleMutation.isPending}
          >
            {rec.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {rec.active ? "Pausieren" : "Aktivieren"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => {
              if (confirm(`Abonnement "${rec.description}" wirklich löschen?`)) {
                deleteMutation.mutate({ id: rec.id, restaurantId });
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Weniger" : "Details"}
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-muted-foreground">IBAN</p><p className="font-mono font-medium">{rec.iban}</p></div>
              <div><p className="text-muted-foreground">Zahlungsfrist</p><p className="font-medium">{rec.paymentTermDays} Tage</p></div>
              <div><p className="text-muted-foreground">Rabatt</p><p className="font-medium">{rec.discountPercent}%</p></div>
              <div><p className="text-muted-foreground">Erstellt</p><p className="font-medium">{formatDate(rec.createdAt as any)}</p></div>
              {rec.endDate && <div><p className="text-muted-foreground">Enddatum</p><p className="font-medium">{formatDate(rec.endDate)}</p></div>}
              {rec.maxOccurrences && <div><p className="text-muted-foreground">Max. Rechnungen</p><p className="font-medium">{rec.maxOccurrences}</p></div>}
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Positionen</p>
              {rec.lineItems.map((item, i) => (
                <div key={i} className="flex justify-between py-0.5 border-b last:border-0">
                  <span>{item.description} ({item.quantity} {item.unit})</span>
                  <span className="font-medium">CHF {(item.quantity * item.unitPrice).toFixed(2)}</span>
                </div>
              ))}
            </div>
            {rec.internalNotes && (
              <p className="text-muted-foreground italic">Notiz: {rec.internalNotes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Formular-Dialog ──────────────────────────────────────────────────────────
function RecurringFormDialog({
  open, onClose, restaurantId, editData, onSuccess,
}: {
  open: boolean; onClose: () => void;
  restaurantId: number; editData?: RecurringInvoice | null;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState(() => editData ? {
    description: editData.description,
    recipientName: editData.recipientName,
    recipientEmail: editData.recipientEmail ?? "",
    recipientAddress: editData.recipientAddress ?? "",
    creditorName: editData.creditorName,
    creditorAddress: editData.creditorAddress,
    iban: editData.iban,
    currency: editData.currency,
    interval: editData.interval as any,
    intervalDay: editData.intervalDay,
    discountPercent: parseFloat(editData.discountPercent),
    paymentTermDays: editData.paymentTermDays,
    additionalInfo: editData.additionalInfo ?? "",
    internalNotes: editData.internalNotes ?? "",
    nextDueDate: editData.nextDueDate,
    startDate: editData.startDate ?? "",
    endDate: editData.endDate ?? "",
    maxOccurrences: editData.maxOccurrences ? String(editData.maxOccurrences) : "",
    lineItems: editData.lineItems,
  } : { ...DEFAULT_FORM });

  const createMutation = trpc.recurringInvoices.create.useMutation({
    onSuccess: () => { toast.success("Abonnement erstellt"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.recurringInvoices.update.useMutation({
    onSuccess: () => { toast.success("Abonnement aktualisiert"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  function addLineItem() {
    setForm(f => ({ ...f, lineItems: [...f.lineItems, { description: "", quantity: 1, unit: "Stk.", unitPrice: 0, taxRate: 8.1 }] }));
  }

  function removeLineItem(i: number) {
    setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }));
  }

  function updateLineItem(i: number, field: keyof LineItem, value: string | number) {
    setForm(f => {
      const items = [...f.lineItems];
      items[i] = { ...items[i], [field]: value };
      return { ...f, lineItems: items };
    });
  }

  function handleSubmit() {
    if (!form.description.trim()) { toast.error("Bezeichnung erforderlich"); return; }
    if (!form.recipientName.trim()) { toast.error("Empfängername erforderlich"); return; }
    if (!form.iban.trim()) { toast.error("IBAN erforderlich"); return; }
    if (form.lineItems.length === 0) { toast.error("Mindestens eine Position erforderlich"); return; }
    if (form.lineItems.some(i => !i.description.trim())) { toast.error("Alle Positionen benötigen eine Beschreibung"); return; }

    const payload = {
      restaurantId,
      description: form.description,
      recipientName: form.recipientName,
      recipientEmail: form.recipientEmail || undefined,
      recipientAddress: form.recipientAddress || undefined,
      creditorName: form.creditorName,
      creditorAddress: form.creditorAddress,
      iban: form.iban,
      currency: form.currency,
      interval: form.interval,
      intervalDay: form.intervalDay,
      discountPercent: form.discountPercent,
      paymentTermDays: form.paymentTermDays,
      additionalInfo: form.additionalInfo || undefined,
      internalNotes: form.internalNotes || undefined,
      lineItems: form.lineItems,
      nextDueDate: form.nextDueDate,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      maxOccurrences: form.maxOccurrences ? parseInt(form.maxOccurrences) : undefined,
    };

    if (editData) {
      updateMutation.mutate({ ...payload, id: editData.id });
    } else {
      createMutation.mutate(payload);
    }
  }

  const total = calcTotal(form.lineItems, form.discountPercent);
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-blue-600" />
            {editData ? "Abonnement bearbeiten" : "Neues Abonnement erstellen"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Grunddaten */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Grunddaten</h3>
            <div className="space-y-1.5">
              <Label>Bezeichnung *</Label>
              <Input placeholder="z.B. Monatliche Servicepauschale" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Intervall *</Label>
                <Select value={form.interval} onValueChange={v => setForm(f => ({ ...f, interval: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTERVAL_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tag im Monat (1–28)</Label>
                <Input type="number" min={1} max={28} value={form.intervalDay} onChange={e => setForm(f => ({ ...f, intervalDay: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Erste Rechnung am *</Label>
                <Input type="date" value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Zahlungsfrist (Tage)</Label>
                <Input type="number" min={1} value={form.paymentTermDays} onChange={e => setForm(f => ({ ...f, paymentTermDays: parseInt(e.target.value) || 30 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Enddatum (optional)</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max. Rechnungen (optional)</Label>
                <Input type="number" min={1} placeholder="Unbegrenzt" value={form.maxOccurrences} onChange={e => setForm(f => ({ ...f, maxOccurrences: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Empfänger */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Empfänger</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name / Firma *</Label>
                <Input placeholder="Max Muster AG" value={form.recipientName} onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>E-Mail</Label>
                <Input type="email" placeholder="max@example.ch" value={form.recipientEmail} onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Textarea placeholder={"Musterstrasse 1\n8000 Zürich"} value={form.recipientAddress} onChange={e => setForm(f => ({ ...f, recipientAddress: e.target.value }))} rows={2} />
            </div>
          </div>

          {/* Bankverbindung */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bankverbindung (Kreditor)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kontoinhaber *</Label>
                <Input placeholder="Restaurant Muster AG" value={form.creditorName} onChange={e => setForm(f => ({ ...f, creditorName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>IBAN *</Label>
                <Input placeholder="CH56 0483 5012 3456 7800 9" value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Kreditor-Adresse *</Label>
              <Textarea placeholder={"Musterstrasse 1\n8000 Zürich"} value={form.creditorAddress} onChange={e => setForm(f => ({ ...f, creditorAddress: e.target.value }))} rows={2} />
            </div>
          </div>

          {/* Positionen */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Positionen</h3>
              <Button type="button" size="sm" variant="outline" onClick={addLineItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Position hinzufügen
              </Button>
            </div>
            {form.lineItems.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border bg-muted/30">
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">Beschreibung *</Label>
                  <Input placeholder="Servicepauschale" value={item.description} onChange={e => updateLineItem(i, "description", e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Menge</Label>
                  <Input type="number" min={0.01} step={0.01} value={item.quantity} onChange={e => updateLineItem(i, "quantity", parseFloat(e.target.value) || 1)} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Einzelpreis</Label>
                  <Input type="number" min={0} step={0.01} value={item.unitPrice} onChange={e => updateLineItem(i, "unitPrice", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">MWST %</Label>
                  <Input type="number" min={0} max={100} step={0.1} value={item.taxRate} onChange={e => updateLineItem(i, "taxRate", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="col-span-1 text-right text-xs font-medium pt-5">
                  CHF {(item.quantity * item.unitPrice).toFixed(2)}
                </div>
                <div className="col-span-1 flex justify-end">
                  {form.lineItems.length > 1 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeLineItem(i)} className="text-red-500 hover:text-red-700 p-1 h-auto">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 justify-end text-sm">
              <span className="text-muted-foreground">Rabatt %</span>
              <Input type="number" min={0} max={100} step={0.1} value={form.discountPercent} onChange={e => setForm(f => ({ ...f, discountPercent: parseFloat(e.target.value) || 0 }))} className="w-24" />
              <span className="font-bold text-base">CHF {total.toFixed(2)}</span>
            </div>
          </div>

          {/* Notizen */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mitteilung (auf Rechnung)</Label>
              <Input placeholder="max. 140 Zeichen" maxLength={140} value={form.additionalInfo} onChange={e => setForm(f => ({ ...f, additionalInfo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Interne Notiz</Label>
              <Input placeholder="Nur intern sichtbar" value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {editData ? "Speichern" : "Abonnement erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function AdminRecurringInvoices() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState<RecurringInvoice | null>(null);
  const [previewData, setPreviewData] = useState<RecurringInvoice | null>(null);
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading, isError, refetch } = trpc.recurringInvoices.list.useQuery(
    { restaurantId },
    { enabled: !!restaurantId }
  );

  const { data: stats } = trpc.recurringInvoices.getStats.useQuery(
    { restaurantId },
    { enabled: !!restaurantId }
  );

  const filtered = useMemo(() =>
    (items as RecurringInvoice[]).filter(r =>
      !search.trim() ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.recipientName.toLowerCase().includes(search.toLowerCase())
    ), [items, search]);

  function handleEdit(r: RecurringInvoice) {
    setEditData(r);
    setDialogOpen(true);
  }

  function handleNew() {
    setEditData(null);
    setDialogOpen(true);
  }

  function handlePreview(r: RecurringInvoice) {
    setPreviewData(r);
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Repeat className="h-5 w-5 text-blue-600" />
            Wiederkehrende Rechnungen
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Abonnements und Dauerschuldverhältnisse verwalten
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={handleNew} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Neues Abonnement
          </Button>
        </div>
      </div>

      {/* Statistik-Karten */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Gesamt</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Aktiv</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.dueSoon}</p>
            <p className="text-xs text-muted-foreground">Fällig</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.totalCreated}</p>
            <p className="text-xs text-muted-foreground">Erstellt gesamt</p>
          </div>
        </div>
      )}

      {/* Suche */}
      <div className="relative">
        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Bezeichnung oder Empfänger suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Liste */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}
      {isError && (
        <div className="p-6 text-center text-destructive border rounded-xl">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p className="font-medium">Daten konnten nicht geladen werden</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Erneut versuchen</Button>
        </div>
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="p-10 text-center text-muted-foreground border rounded-xl">
          <Repeat className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Keine Abonnements vorhanden</p>
          <p className="text-sm mt-1">Erstellen Sie ein neues wiederkehrendes Rechnungsabonnement.</p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={handleNew}>
            <Plus className="h-3.5 w-3.5" /> Erstes Abonnement erstellen
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((rec) => (
          <RecurringCard
            key={rec.id}
            rec={rec as RecurringInvoice}
            restaurantId={restaurantId}
            onEdit={handleEdit}
            onRefresh={refetch}
            onPreview={handlePreview}
          />
        ))}
      </div>

      {/* Formular-Dialog */}
      <RecurringFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditData(null); }}
        restaurantId={restaurantId}
        editData={editData}
        onSuccess={refetch}
      />

      {/* Vorschau-Dialog */}
      {previewData && (
        <Dialog open={!!previewData} onOpenChange={(o) => { if (!o) setPreviewData(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-600" />
                Vorschau nächste Rechnung
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Abonnement</span>
                  <span className="font-medium">{previewData.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empfänger</span>
                  <span className="font-medium">{previewData.recipientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nächstes Fälligkeitsdatum</span>
                  <span className="font-medium">{formatDate(previewData.nextDueDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Zahlungsfrist</span>
                  <span className="font-medium">{previewData.paymentTermDays} Tage</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IBAN</span>
                  <span className="font-mono text-xs">{previewData.iban}</span>
                </div>
              </div>
              <div>
                <p className="font-medium mb-2">Rechnungspositionen</p>
                <div className="space-y-1 rounded-lg border overflow-hidden">
                  {previewData.lineItems.map((item, i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-2 even:bg-muted/20">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} × CHF {item.unitPrice.toFixed(2)} (MwSt. {item.taxRate}%)</p>
                      </div>
                      <span className="font-medium">CHF {(item.quantity * item.unitPrice * (1 + item.taxRate / 100)).toFixed(2)}</span>
                    </div>
                  ))}
                  {parseFloat(previewData.discountPercent) > 0 && (
                    <div className="flex justify-between items-center px-3 py-2 bg-emerald-50 text-emerald-700">
                      <span>Rabatt ({previewData.discountPercent}%)</span>
                      <span>− CHF {(calcTotal(previewData.lineItems, 0) * parseFloat(previewData.discountPercent) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center px-3 py-2 bg-primary/5 font-bold">
                    <span>Gesamtbetrag</span>
                    <span>CHF {calcTotal(previewData.lineItems, parseFloat(previewData.discountPercent)).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {previewData.additionalInfo && (
                <p className="text-muted-foreground text-xs italic border-t pt-2">{previewData.additionalInfo}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewData(null)}>Schliessen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
