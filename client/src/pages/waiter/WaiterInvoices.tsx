import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  FileText, AlertCircle, RefreshCw, Search, Clock, AlertTriangle, CheckCircle2,
  XCircle, Mail, Send, ChevronDown, ChevronUp, CalendarDays, User, Banknote, Eye, Loader2, CreditCard
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Invoice = {
  id: number;
  invoiceNumber: string | null;
  status: string;
  recipientName: string | null;
  recipientEmail: string | null;
  totalAmount: string;
  dueDate: Date | null;
  sentAt: Date | null;
  dunningFee: string | null;
  paidAmount: string | null;
  currency: string | null;
  additionalInfo: string | null;
  createdAt: Date;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  draft:    { label: "Entwurf",      color: "text-gray-600",   icon: FileText,      bg: "bg-gray-100" },
  sent:     { label: "Versendet",    color: "text-blue-600",   icon: Mail,          bg: "bg-blue-50" },
  dunning1: { label: "1. Mahnung",   color: "text-orange-600", icon: AlertTriangle, bg: "bg-orange-50" },
  dunning2: { label: "2. Mahnung",   color: "text-red-600",    icon: AlertTriangle, bg: "bg-red-50" },
  paid:     { label: "Bezahlt",      color: "text-emerald-600",icon: CheckCircle2,  bg: "bg-emerald-50" },
  partial:  { label: "Teilbezahlt",  color: "text-yellow-700", icon: Banknote,      bg: "bg-yellow-50" },
  cancelled:{ label: "Storniert",    color: "text-gray-500",   icon: XCircle,       bg: "bg-gray-50" },
  credited: { label: "Gutgeschrieben",color:"text-purple-600", icon: FileText,      bg: "bg-purple-50" },
  overdue:  { label: "Überfällig",   color: "text-red-700",    icon: Clock,         bg: "bg-red-100" },
};

function isOverdue(invoice: Invoice): boolean {
  if (!invoice.dueDate) return false;
  if (["paid", "cancelled", "credited", "partial"].includes(invoice.status)) return false;
  return new Date(invoice.dueDate) < new Date();
}

function formatDate(d: Date | null | string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-CH");
}

function daysOverdue(dueDate: Date | null): number {
  if (!dueDate) return 0;
  const diff = Date.now() - new Date(dueDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function InvoiceCard({ invoice, restaurantId, onPaid, canRecordPayment = true, canSendInvoiceEmail = true, canViewDunningPdf = true }: { invoice: Invoice; restaurantId: number; onPaid?: () => void; canRecordPayment?: boolean; canSendInvoiceEmail?: boolean; canViewDunningPdf?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [dunningPdfLoading, setDunningPdfLoading] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "twint" | "bank_transfer" | "other">("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const overdue = isOverdue(invoice);
  const effectiveStatus = overdue && invoice.status === "sent" ? "overdue" : invoice.status;
  const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG["draft"];
  const StatusIcon = cfg.icon;
  const total = parseFloat(invoice.totalAmount);
  const dunningFee = parseFloat(invoice.dunningFee ?? "0");
  const grandTotal = total + dunningFee;

  const markAsPaidMutation = trpc.invoicing.markAsPaid.useMutation({
    onSuccess: (data) => {
      setPayDialogOpen(false);
      toast.success(data.newStatus === "paid" ? "Rechnung als bezahlt markiert" : "Teilzahlung erfasst");
      onPaid?.();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleMarkAsPaid() {
    const amount = payAmount ? parseFloat(payAmount) : grandTotal;
    if (isNaN(amount) || amount <= 0) { toast.error("Ungültiger Betrag"); return; }
    markAsPaidMutation.mutate({ invoiceId: invoice.id, restaurantId, amount, method: payMethod, notes: payNotes || undefined });
  }

  const sendMutation = trpc.invoicing.generateAndSendInvoice.useMutation({
    onSuccess: (data) => {
      setSending(false);
      if (data.emailSent) toast.success("Rechnung per E-Mail versendet");
      else toast.error("E-Mail konnte nicht versendet werden");
    },
    onError: (e) => { setSending(false); toast.error(e.message); },
  });

  const pdfMutation = trpc.invoicing.generateAndSendInvoice.useMutation({
    onSuccess: (data) => {
      setPdfLoading(false);
      if (data.pdfUrl) {
        setPdfUrl(data.pdfUrl);
        window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("PDF konnte nicht generiert werden");
      }
    },
    onError: (e) => { setPdfLoading(false); toast.error(e.message); },
  });

  function handleOpenPdf() {
    if (pdfUrl) { window.open(pdfUrl, "_blank", "noopener,noreferrer"); return; }
    setPdfLoading(true);
    pdfMutation.mutate({ invoiceId: invoice.id, restaurantId, sendEmail: false });
  }

  const dunningPdfQuery = trpc.invoicing.getDunningPdf.useQuery(
    { invoiceId: invoice.id, restaurantId, level: invoice.status === "dunning2" ? 2 : 1 },
    { enabled: false }
  );
  async function handleOpenDunningPdf() {
    setDunningPdfLoading(true);
    try {
      const result = await dunningPdfQuery.refetch();
      if (result.data?.pdfUrl) {
        window.open(result.data.pdfUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Mahnungs-PDF konnte nicht generiert werden");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Fehler beim Laden des Mahnungs-PDFs");
    } finally {
      setDunningPdfLoading(false);
    }
  }

  function handleSend() {
    if (!invoice.recipientEmail) {
      toast.error("Keine E-Mail-Adresse hinterlegt");
      return;
    }
    setSending(true);
    sendMutation.mutate({ invoiceId: invoice.id, restaurantId, sendEmail: true });
  }

  return (
    <>
    <Card className={cn("border-l-4 transition-shadow hover:shadow-md", {
      "border-l-blue-400": effectiveStatus === "sent",
      "border-l-orange-400": effectiveStatus === "dunning1",
      "border-l-red-500": effectiveStatus === "dunning2" || effectiveStatus === "overdue",
      "border-l-emerald-400": effectiveStatus === "paid",
      "border-l-yellow-400": effectiveStatus === "partial",
      "border-l-gray-300": ["draft", "cancelled", "credited"].includes(effectiveStatus),
    })}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-blue-700">
                {invoice.invoiceNumber ?? `#${invoice.id}`}
              </span>
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full", cfg.bg, cfg.color)}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>
              {overdue && invoice.status !== "overdue" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  <Clock className="h-3 w-3" />
                  {daysOverdue(invoice.dueDate)} Tage überfällig
                </span>
              )}
            </div>
            <p className="text-sm font-medium mt-1 flex items-center gap-1.5 text-foreground">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              {invoice.recipientName ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <CalendarDays className="h-3 w-3" />
              Fällig: {formatDate(invoice.dueDate)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-lg">
              CHF {grandTotal.toFixed(2)}
            </p>
            {dunningFee > 0 && (
              <p className="text-xs text-red-500">+ CHF {dunningFee.toFixed(2)} Mahngebühr</p>
            )}
            {invoice.status === "partial" && invoice.paidAmount && (
              <div className="text-right">
                <p className="text-xs text-yellow-700">Bezahlt: CHF {parseFloat(invoice.paidAmount).toFixed(2)}</p>
                <p className="text-xs text-orange-600 font-semibold">Offen: CHF {Math.max(0, grandTotal - parseFloat(invoice.paidAmount)).toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Expand-Button */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Weniger" : "Details"}
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Erstellt</p>
                <p className="font-medium">{formatDate(invoice.createdAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Versendet</p>
                <p className="font-medium">{formatDate(invoice.sentAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Betrag</p>
                <p className="font-medium">CHF {total.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Währung</p>
                <p className="font-medium">{invoice.currency ?? "CHF"}</p>
              </div>
            </div>
            {invoice.recipientEmail && (
              <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
                <Mail className="h-3 w-3" />
                {invoice.recipientEmail}
              </p>
            )}
            {invoice.additionalInfo && (
              <p className="text-xs text-muted-foreground italic">"{invoice.additionalInfo}"</p>
            )}

                        {/* PDF-Vorschau */}
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2 text-slate-600 border-slate-200 hover:bg-slate-50"
              onClick={handleOpenPdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              {pdfLoading ? "PDF wird generiert..." : pdfUrl ? "PDF erneut öffnen" : "PDF anzeigen"}
            </Button>

            {/* Mahnungs-PDF (nur bei dunning1/dunning2 und wenn berechtigt) */}
            {canViewDunningPdf && ["dunning1", "dunning2"].includes(invoice.status) && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2 text-orange-700 border-orange-200 hover:bg-orange-50"
                onClick={handleOpenDunningPdf}
                disabled={dunningPdfLoading}
              >
                {dunningPdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {dunningPdfLoading
                  ? "Mahnungs-PDF wird generiert..."
                  : `${invoice.status === "dunning2" ? "2." : "1."} Mahnungs-PDF anzeigen`}
              </Button>
            )}

            {/* Zahlungsbestätigung (nur wenn berechtigt) */}
            {canRecordPayment && !["paid", "cancelled", "credited"].includes(invoice.status) && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                onClick={() => { setPayAmount(grandTotal.toFixed(2)); setPayDialogOpen(true); }}
              >
                <CreditCard className="h-3.5 w-3.5" />
                Als bezahlt markieren
              </Button>
            )}

            {/* E-Mail-Versand (nur wenn berechtigt) */}
            {canSendInvoiceEmail && !["paid", "cancelled", "credited"].includes(invoice.status) && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={handleSend}
                disabled={sending || !invoice.recipientEmail}
              >
                <Send className="h-3.5 w-3.5" />
                {sending ? "Wird gesendet..." : "Rechnung per E-Mail senden"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Zahlungs-Dialog */}
    <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            Zahlung erfassen
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">{invoice.invoiceNumber ?? `#${invoice.id}`}</p>
            <p className="text-muted-foreground">{invoice.recipientName}</p>
            <p className="font-bold text-emerald-700 mt-1">CHF {grandTotal.toFixed(2)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Zahlungsart</Label>
            <Select value={payMethod} onValueChange={(v) => setPayMethod(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Bargeld</SelectItem>
                <SelectItem value="card">Karte</SelectItem>
                <SelectItem value="twint">TWINT</SelectItem>
                <SelectItem value="bank_transfer">Überweisung</SelectItem>
                <SelectItem value="other">Sonstiges</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Betrag (CHF)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder={grandTotal.toFixed(2)}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leer lassen für Vollzahlung (CHF {grandTotal.toFixed(2)})</p>
          </div>
          <div className="space-y-1.5">
            <Label>Notiz (optional)</Label>
            <Input
              placeholder="z.B. Quittung Nr. 42"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Abbrechen</Button>
          <Button
            onClick={handleMarkAsPaid}
            disabled={markAsPaidMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {markAsPaidMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Zahlung bestätigen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export default function WaiterInvoices() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  // Kellner-Berechtigungen aus Restaurant-Einstellungen
  const { data: settings } = trpc.restaurantAdmin.getSettings.useQuery(undefined, { enabled: !!restaurantId });
  const waiterPerms = (() => {
    try { return JSON.parse((settings as any)?.waiterPermissions ?? '{}'); } catch { return {}; }
  })();
  const canRecordPayment = waiterPerms.canRecordPayment !== false;
  const canSendInvoiceEmail = waiterPerms.canSendInvoiceEmail !== false;
  const canViewDunningPdf = waiterPerms.canViewDunningPdf !== false;
  // Offene Rechnungen: sent + dunning1 + dunning2
  const openStatuses = ["sent", "dunning1", "dunning2"];

  const { data: allInvoices = [], isLoading, isError, refetch } = trpc.invoicing.listInvoices.useQuery(
    { restaurantId, limit: 100, offset: 0 },
    { enabled: !!restaurantId, refetchInterval: 30_000 }
  );

  const filtered = (allInvoices as Invoice[]).filter((inv) => {
    const matchesStatus =
      statusFilter === "all" ? true :
      statusFilter === "open" ? openStatuses.includes(inv.status) :
      statusFilter === "overdue" ? isOverdue(inv) :
      inv.status === statusFilter;
    const matchesSearch = !search.trim() ||
      (inv.recipientName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (inv.invoiceNumber ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const openCount = (allInvoices as Invoice[]).filter(inv => openStatuses.includes(inv.status)).length;
  const overdueCount = (allInvoices as Invoice[]).filter(inv => isOverdue(inv)).length;
  const totalOpen = (allInvoices as Invoice[])
    .filter(inv => openStatuses.includes(inv.status))
    .reduce((sum, inv) => sum + parseFloat(inv.totalAmount) + parseFloat(inv.dunningFee ?? "0"), 0);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Offene Rechnungen
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Rechnungsstatus für Gäste einsehen
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Aktualisieren
        </Button>
      </div>

      {/* Statistik-Karten */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{openCount}</p>
          <p className="text-xs text-muted-foreground">Offen</p>
        </div>
        <div className="rounded-xl border p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
          <p className="text-xs text-muted-foreground">Überfällig</p>
        </div>
        <div className="rounded-xl border p-3 text-center">
          <p className="text-lg font-bold text-foreground">
            {totalOpen > 0 ? `CHF ${totalOpen.toFixed(0)}` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Offen CHF</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Name oder Rechnungsnummer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Offen</SelectItem>
            <SelectItem value="overdue">Überfällig</SelectItem>
            <SelectItem value="sent">Versendet</SelectItem>
            <SelectItem value="dunning1">1. Mahnung</SelectItem>
            <SelectItem value="dunning2">2. Mahnung</SelectItem>
            <SelectItem value="paid">Bezahlt</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Liste */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}
      {isError && (
        <div className="p-6 text-center text-destructive border rounded-xl">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p className="font-medium">Daten konnten nicht geladen werden</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Erneut versuchen
          </Button>
        </div>
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="p-10 text-center text-muted-foreground border rounded-xl">
          <Banknote className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Keine Rechnungen gefunden</p>
          <p className="text-sm mt-1">
            {statusFilter === "open" ? "Keine offenen Rechnungen vorhanden." : "Keine Rechnungen für diesen Filter."}
          </p>
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((inv) => (
          <InvoiceCard key={inv.id} invoice={inv} restaurantId={restaurantId} canRecordPayment={canRecordPayment} canSendInvoiceEmail={canSendInvoiceEmail} canViewDunningPdf={canViewDunningPdf} />
        ))}
      </div>
    </div>
  );
}
