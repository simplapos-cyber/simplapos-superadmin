import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Plus, Pencil, Trash2, Search, ChevronDown, ChevronUp,
  Mail, Phone, MapPin, CreditCard, FileText, AlertTriangle, RefreshCw, Building2, Download
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Debtor = {
  id: number;
  restaurantId: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  iban: string | null;
  notes: string | null;
  paymentTermDays: number;
  createdAt: Date;
  updatedAt: Date;
};

// IBAN-Format-Validierung
function isValidIban(iban: string): boolean {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(clean);
}

const DEFAULT_FORM = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address: "",
  zip: "",
  city: "",
  country: "CH",
  iban: "",
  notes: "",
  paymentTermDays: 30,
};

// ─── Debitor-Karte ────────────────────────────────────────────────────────────
function DebtorCard({
  debtor, restaurantId, onEdit, onRefresh, onViewHistory,
}: {
  debtor: Debtor;
  restaurantId: number;
  onEdit: (d: Debtor) => void;
  onRefresh: () => void;
  onViewHistory: (d: Debtor) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const deleteMutation = trpc.debtors.delete.useMutation({
    onSuccess: () => { toast.success("Debitor gelöscht"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-l-4 border-l-blue-400 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{debtor.name}</span>
              {debtor.company && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Building2 className="h-3 w-3" />
                  {debtor.company}
                </Badge>
              )}
            </div>
            {debtor.email && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> {debtor.email}
              </p>
            )}
            {debtor.phone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> {debtor.phone}
              </p>
            )}
            {(debtor.city || debtor.zip) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                {[debtor.zip, debtor.city, debtor.country].filter(Boolean).join(" ")}
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-muted-foreground">Zahlungsfrist</p>
            <p className="font-bold text-sm">{debtor.paymentTermDays} Tage</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => onViewHistory(debtor)} className="gap-1.5 flex-1">
            <FileText className="h-3.5 w-3.5" /> Rechnungshistorie
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEdit(debtor)} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Bearbeiten
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => {
              if (confirm(`Debitor "${debtor.name}" wirklich löschen?`)) {
                deleteMutation.mutate({ id: debtor.id, restaurantId });
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
            {debtor.address && (
              <div>
                <p className="text-muted-foreground">Adresse</p>
                <p className="font-medium whitespace-pre-line">{debtor.address}</p>
              </div>
            )}
            {debtor.iban && (
              <div>
                <p className="text-muted-foreground">IBAN</p>
                <p className="font-mono font-medium">{debtor.iban}</p>
              </div>
            )}
            {debtor.notes && (
              <div>
                <p className="text-muted-foreground">Notizen</p>
                <p className="italic">{debtor.notes}</p>
              </div>
            )}
            <p className="text-muted-foreground">
              Erstellt: {new Date(debtor.createdAt).toLocaleDateString("de-CH")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Formular-Dialog ──────────────────────────────────────────────────────────
function DebtorFormDialog({
  open, onClose, restaurantId, editData, onSuccess,
}: {
  open: boolean; onClose: () => void;
  restaurantId: number; editData?: Debtor | null;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState(() => editData ? {
    name: editData.name,
    company: editData.company ?? "",
    email: editData.email ?? "",
    phone: editData.phone ?? "",
    address: editData.address ?? "",
    zip: editData.zip ?? "",
    city: editData.city ?? "",
    country: editData.country,
    iban: editData.iban ?? "",
    notes: editData.notes ?? "",
    paymentTermDays: editData.paymentTermDays,
  } : { ...DEFAULT_FORM });

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const createMutation = trpc.debtors.create.useMutation({
    onSuccess: () => { toast.success("Debitor erstellt"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.debtors.update.useMutation({
    onSuccess: () => { toast.success("Debitor gespeichert"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Name ist ein Pflichtfeld");
      return;
    }
    if (form.iban && !isValidIban(form.iban)) {
      toast.error("Ungültiges IBAN-Format (z.B. CH56 0483 5012 3456 7800 9)");
      return;
    }
    const payload = {
      restaurantId,
      name: form.name.trim(),
      company: form.company || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      zip: form.zip || undefined,
      city: form.city || undefined,
      country: form.country,
      iban: form.iban ? form.iban.replace(/\s/g, "").toUpperCase() : undefined,
      notes: form.notes || undefined,
      paymentTermDays: form.paymentTermDays,
    };
    if (editData) {
      updateMutation.mutate({ ...payload, id: editData.id });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            {editData ? "Debitor bearbeiten" : "Neuer Debitor"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name / Vorname *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Max Muster" />
            </div>
            <div className="col-span-2">
              <Label>Firma</Label>
              <Input value={form.company} onChange={e => set("company", e.target.value)} placeholder="Muster AG" />
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="max@example.ch" />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+41 79 123 45 67" />
            </div>
          </div>

          <div>
            <Label>Adresse</Label>
            <Textarea value={form.address} onChange={e => set("address", e.target.value)} placeholder="Musterstrasse 1" rows={2} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>PLZ</Label>
              <Input value={form.zip} onChange={e => set("zip", e.target.value)} placeholder="8001" />
            </div>
            <div>
              <Label>Ort</Label>
              <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Zürich" />
            </div>
            <div>
              <Label>Land</Label>
              <Select value={form.country} onValueChange={v => set("country", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CH">CH</SelectItem>
                  <SelectItem value="DE">DE</SelectItem>
                  <SelectItem value="AT">AT</SelectItem>
                  <SelectItem value="FR">FR</SelectItem>
                  <SelectItem value="IT">IT</SelectItem>
                  <SelectItem value="LI">LI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>IBAN <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <div className="relative">
              <Input
                value={form.iban}
                onChange={e => set("iban", e.target.value)}
                placeholder="CH56 0483 5012 3456 7800 9"
                className={`font-mono pr-8 ${
                  form.iban && isValidIban(form.iban)
                    ? "border-green-400 focus-visible:ring-green-400"
                    : form.iban
                    ? "border-red-400 focus-visible:ring-red-400"
                    : ""
                }`}
              />
              {form.iban && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold ${
                  isValidIban(form.iban) ? "text-green-500" : "text-red-500"
                }`}>
                  {isValidIban(form.iban) ? "✓" : "✗"}
                </span>
              )}
            </div>
            {form.iban && !isValidIban(form.iban) && (
              <p className="text-xs text-red-500 mt-1">Ungültiges IBAN-Format (z.B. CH56 0483 5012 3456 7800 9)</p>
            )}
            {form.iban && isValidIban(form.iban) && (
              <p className="text-xs text-green-600 mt-1">✓ Gültiges IBAN-Format</p>
            )}
            {!form.iban && (
              <p className="text-xs text-muted-foreground mt-1">Optional — wird für den Schweizer QR-Code auf der Rechnung benötigt</p>
            )}
          </div>

          <div>
            <Label>Zahlungsfrist (Tage)</Label>
            <Input
              type="number" min={1} max={365}
              value={form.paymentTermDays}
              onChange={e => set("paymentTermDays", parseInt(e.target.value) || 30)}
            />
          </div>

          <div>
            <Label>Interne Notizen</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Interne Bemerkungen..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.name.trim() || (!!form.iban && !isValidIban(form.iban))}>
            {isPending ? "Speichern..." : editData ? "Speichern" : "Debitor erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Zahlungsliste pro Rechnung ───────────────────────────────────────────────
function InvoicePaymentsList({ invoiceId, restaurantId }: { invoiceId: number; restaurantId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = trpc.invoicing.getPayments.useQuery(
    { invoiceId, restaurantId },
    { enabled: open }
  );
  const METHOD_LABELS: Record<string, string> = {
    bank: "Banküberweisung", cash: "Bar", card: "Karte",
    twint: "TWINT", lsv: "LSV", other: "Sonstiges",
  };
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Zahlungen anzeigen
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-emerald-200">
          {isLoading && <p className="text-xs text-muted-foreground">Lade...</p>}
          {data && data.payments.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Keine Zahlungen erfasst</p>
          )}
          {data && data.payments.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {p.paidAt ? new Date(p.paidAt).toLocaleDateString("de-CH") : "–"}
                {" · "}{METHOD_LABELS[p.method] ?? p.method}
                {p.notes && <span className="italic ml-1">({p.notes})</span>}
              </span>
              <span className="font-semibold text-emerald-700">CHF {parseFloat(p.amount).toFixed(2)}</span>
            </div>
          ))}
          {data && data.payments.length > 0 && (
            <div className="flex justify-between text-xs font-bold border-t pt-1 mt-1">
              <span>Total bezahlt</span>
              <span className="text-emerald-700">CHF {data.totalPaid}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rechnungshistorie-Dialog ─────────────────────────────────────────────────
function DebtorHistoryDialog({
  debtor, restaurantId, onClose,
}: {
  debtor: Debtor; restaurantId: number; onClose: () => void;
}) {
  const [statementLoading, setStatementLoading] = useState(false);
  const [triggerStatement, setTriggerStatement] = useState(false);
  trpc.debtors.getStatement.useQuery(
    { id: debtor.id, restaurantId },
    {
      enabled: triggerStatement && !!debtor.id,
      onSuccess: (d: { pdfUrl: string }) => {
        setStatementLoading(false);
        setTriggerStatement(false);
        window.open(d.pdfUrl, "_blank");
      },
      onError: () => {
        setStatementLoading(false);
        setTriggerStatement(false);
        toast.error("Kontoauszug konnte nicht erstellt werden");
      },
    } as Parameters<typeof trpc.debtors.getStatement.useQuery>[1]
  );
  function handleStatementPdf() {
    setStatementLoading(true);
    setTriggerStatement(true);
  }
  const { data, isLoading } = trpc.debtors.getWithHistory.useQuery(
    { id: debtor.id, restaurantId },
    { enabled: !!debtor.id }
  );

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    draft: { label: "Entwurf", color: "bg-gray-100 text-gray-700" },
    sent: { label: "Versendet", color: "bg-blue-100 text-blue-700" },
    paid: { label: "Bezahlt", color: "bg-emerald-100 text-emerald-700" },
    cancelled: { label: "Storniert", color: "bg-red-100 text-red-700" },
    dunning1: { label: "1. Mahnung", color: "bg-orange-100 text-orange-700" },
    dunning2: { label: "2. Mahnung", color: "bg-red-100 text-red-700" },
    credited: { label: "Gutgeschrieben", color: "bg-purple-100 text-purple-700" },
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Rechnungshistorie – {debtor.name}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Statistiken */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold">{data.stats.totalInvoices}</p>
                <p className="text-xs text-muted-foreground">Rechnungen</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-foreground">CHF {data.stats.totalInvoiced}</p>
                <p className="text-xs text-muted-foreground">Fakturiert</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xl font-bold text-emerald-600">CHF {data.stats.totalPaid}</p>
                <p className="text-xs text-muted-foreground">Bezahlt</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className={cn("text-xl font-bold", parseFloat(data.stats.totalOpen) > 0 ? "text-orange-600" : "text-foreground")}>
                  CHF {data.stats.totalOpen}
                </p>
                <p className="text-xs text-muted-foreground">Offen</p>
              </div>
            </div>

            {data.stats.overdueCount > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{data.stats.overdueCount} überfällige Rechnung(en) im Mahnwesen</span>
              </div>
            )}

            {/* Rechnungsliste */}
            {data.invoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>Keine Rechnungen gefunden</p>
                <p className="text-xs mt-1">Rechnungen werden nach E-Mail oder Name zugeordnet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.invoices.map((inv: any) => {
                  const s = STATUS_LABELS[inv.status] ?? { label: inv.status, color: "bg-gray-100 text-gray-700" };
                  return (
                    <div key={inv.id} className="p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{inv.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(inv.createdAt).toLocaleDateString("de-CH")}
                            {inv.dueDate && ` · Fällig: ${new Date(inv.dueDate).toLocaleDateString("de-CH")}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", s.color)}>{s.label}</span>
                          <span className="font-bold text-sm">CHF {parseFloat(inv.totalAmount).toFixed(2)}</span>
                        </div>
                      </div>
                      <InvoicePaymentsList invoiceId={inv.id} restaurantId={restaurantId} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2 justify-between sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleStatementPdf}
            disabled={statementLoading}
            className="gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
          >
            {statementLoading
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            Kontoauszug PDF
          </Button>
          <Button variant="outline" onClick={onClose}>Schliessen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function AdminDebtors() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState<Debtor | null>(null);
  const [historyDebtor, setHistoryDebtor] = useState<Debtor | null>(null);
  const [csvExporting, setCsvExporting] = useState(false);
  const [triggerCsvExport, setTriggerCsvExport] = useState(false);

  const { data: csvData, isError: csvError } = trpc.debtors.exportCsv.useQuery(
    { restaurantId },
    {
      enabled: triggerCsvExport && !!restaurantId,
      onSuccess: (data: { csv: string; filename: string }) => {
        setCsvExporting(false);
        setTriggerCsvExport(false);
        const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("CSV-Export erfolgreich");
      },
    } as Parameters<typeof trpc.debtors.exportCsv.useQuery>[1]
  );

  function handleExportCsv() {
    setCsvExporting(true);
    setTriggerCsvExport(true);
  }

  const { data: debtors = [], isLoading, isError, refetch } = trpc.debtors.list.useQuery(
    { restaurantId, searchQuery: search || undefined },
    { enabled: !!restaurantId }
  );

  const { data: stats } = trpc.debtors.getStats.useQuery(
    { restaurantId },
    { enabled: !!restaurantId }
  );

  const filtered = useMemo(() =>
    (debtors as Debtor[]).filter(d =>
      !search.trim() ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.company ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.city ?? "").toLowerCase().includes(search.toLowerCase())
    ), [debtors, search]);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Debitorenstammdaten
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kundenstamm, Zahlungshistorie und offene Posten
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={csvExporting} className="gap-1.5">
            {csvExporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            CSV
          </Button>
          <Button size="sm" onClick={() => { setEditData(null); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Neuer Debitor
          </Button>
        </div>
      </div>

      {/* Statistik-Karten */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.totalDebtors}</p>
            <p className="text-xs text-muted-foreground">Debitoren</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.openInvoices}</p>
            <p className="text-xs text-muted-foreground">Offene Rechnungen</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className={cn("text-2xl font-bold", stats.overdueInvoices > 0 ? "text-red-600" : "text-foreground")}>
              {stats.overdueInvoices}
            </p>
            <p className="text-xs text-muted-foreground">Im Mahnwesen</p>
          </div>
        </div>
      )}

      {/* Suche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Name, Firma, E-Mail oder Ort suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Liste */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}
      {isError && (
        <div className="p-6 text-center text-destructive border rounded-xl">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="font-medium">Daten konnten nicht geladen werden</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Erneut versuchen</Button>
        </div>
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="p-10 text-center text-muted-foreground border rounded-xl">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{search ? "Keine Debitoren gefunden" : "Noch keine Debitoren"}</p>
          {!search && (
            <>
              <p className="text-sm mt-1">Erfassen Sie Ihre Kunden und Debitoren für eine strukturierte Rechnungsverwaltung.</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => { setEditData(null); setDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> Ersten Debitor erfassen
              </Button>
            </>
          )}
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((d) => (
          <DebtorCard
            key={(d as Debtor).id}
            debtor={d as Debtor}
            restaurantId={restaurantId}
            onEdit={(d) => { setEditData(d); setDialogOpen(true); }}
            onRefresh={refetch}
            onViewHistory={setHistoryDebtor}
          />
        ))}
      </div>

      {/* Formular-Dialog */}
      <DebtorFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditData(null); }}
        restaurantId={restaurantId}
        editData={editData}
        onSuccess={refetch}
      />

      {/* Rechnungshistorie-Dialog */}
      {historyDebtor && (
        <DebtorHistoryDialog
          debtor={historyDebtor}
          restaurantId={restaurantId}
          onClose={() => setHistoryDebtor(null)}
        />
      )}
    </div>
  );
}
