import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Send, CheckCircle, Clock, AlertTriangle,
  Download, Eye, CreditCard, Building2, RefreshCw, Trash2, Edit,
  ChevronDown, ChevronUp, QrCode, Mail, Ban, RotateCcw, TrendingUp,
  Users, DollarSign, Calendar, ReceiptText, BarChart2
} from "lucide-react";

// ─── Typen ────────────────────────────────────────────────────────────────────
type Invoice = {
  id: number;
  invoiceNumber: string;
  restaurantId: number;
  recipientName: string;
  recipientEmail: string | null;
  recipientAddress: string;
  totalAmount: string;
  paidAmount: string | null;
  status: string;
  dueDate: number | null;
  issueDate: number;
  currency: string;
  notes: string | null;
  pdfUrl: string | null;
  signatureUrl: string | null;
  signatureLat?: string | null;
  signatureLng?: string | null;
  signatureAddress?: string | null;
  signatureTimestamp?: number | null;
};

type Mandate = {
  id: number;
  restaurantId: number;
  restaurantName: string;
  mandateType: string;
  status: string;
  iban: string;
  accountHolder: string;
  signedAt: number | null;
  validFrom: number | null;
  validUntil: number | null;
  reference: string | null;
};

// ─── Status-Hilfsfunktionen ───────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf", sent: "Versendet", reminded: "Erinnert",
  dunning1: "Mahnung 1", dunning2: "Mahnung 2", paid: "Bezahlt",
  overdue: "Überfällig", cancelled: "Storniert", credited: "Gutgeschrieben",
  partial: "Teilbezahlt",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "secondary", sent: "default", reminded: "outline", dunning1: "destructive",
  dunning2: "destructive", paid: "default", overdue: "destructive",
  cancelled: "secondary", credited: "secondary", partial: "outline",
};
const statusBadge = (s: string) => (
  <Badge variant={STATUS_COLORS[s] as any || "secondary"} className={
    s === "paid" ? "bg-green-100 text-green-800 border-green-200" :
    s === "overdue" || s === "dunning1" || s === "dunning2" ? "bg-red-100 text-red-800 border-red-200" :
    s === "sent" ? "bg-blue-100 text-blue-800 border-blue-200" :
    s === "reminded" ? "bg-yellow-100 text-yellow-800 border-yellow-200" : ""
  }>
    {STATUS_LABELS[s] || s}
  </Badge>
);
const fmt = (v: number | string) => `CHF ${Number(v).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`;
const fmtDate = (ts: number | null) => ts ? new Date(ts).toLocaleDateString("de-CH") : "–";

// ─── Neue Rechnungsposition ───────────────────────────────────────────────────
type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; taxRate: number };
const emptyItem = (): LineItem => ({ description: "", quantity: 1, unit: "Stk.", unitPrice: 0, taxRate: 8.1 });

// ─── Mahnungs-PDF-Button ─────────────────────────────────────────────────────
function DunningPdfButton({ invoiceId, restaurantId, level }: { invoiceId: number; restaurantId: number; level: 1 | 2 }) {
  const [loading, setLoading] = useState(false);
  const query = trpc.invoicing.getDunningPdf.useQuery(
    { invoiceId, restaurantId, level },
    { enabled: false }
  );
  async function handleClick() {
    setLoading(true);
    try {
      const result = await query.refetch();
      if (result.data?.pdfUrl) {
        window.open(result.data.pdfUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Mahnungs-PDF konnte nicht generiert werden");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Fehler beim Laden des Mahnungs-PDFs");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button
      size="icon"
      variant="outline"
      title={`${level}. Mahnungs-PDF anzeigen`}
      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
      onClick={handleClick}
      disabled={loading}
    >
      {loading
        ? <span className="h-3.5 w-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin inline-block" />
        : <AlertTriangle className="h-3.5 w-3.5" />}
    </Button>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function AdminInvoicing() {
  const [tab, setTab] = useState("invoices");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<Invoice | null>(null);
  const [showPayment, setShowPayment] = useState<Invoice | null>(null);
  const [showMandate, setShowMandate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreditNote, setShowCreditNote] = useState<Invoice | null>(null);

  // Queries
  const { data: restaurants } = trpc.restaurants.list.useQuery();
  const [selectedRestaurant, setSelectedRestaurant] = useState<number | null>(null);

  const { data: invoiceList, refetch: refetchInvoices } = trpc.invoicing.listInvoices.useQuery(
    { restaurantId: selectedRestaurant ?? 0, searchQuery: search || undefined, status: statusFilter !== "all" ? statusFilter : undefined },
    { enabled: !!selectedRestaurant }
  );
  const { data: mandateList, refetch: refetchMandates } = trpc.invoicing.listMandates.useQuery(
    { restaurantId: selectedRestaurant ?? 0 },
    { enabled: !!selectedRestaurant }
  );
  const { data: stats } = trpc.invoicing.getStats.useQuery(
    { restaurantId: selectedRestaurant ?? 0 },
    { enabled: !!selectedRestaurant }
  );

  // Mutations
  const createMutation = trpc.invoicing.createInvoice.useMutation({
    onSuccess: () => { toast("Rechnung erstellt"); refetchInvoices(); setShowCreate(false); }
  });
  const sendMutation = trpc.invoicing.generateAndSendInvoice.useMutation({
    onSuccess: () => { toast("Rechnung versendet"); refetchInvoices(); }
  });
  const remindMutation = trpc.invoicing.sendReminder.useMutation({
    onSuccess: () => { toast("Erinnerung gesendet"); refetchInvoices(); }
  });
  const confirmPaymentMutation = trpc.invoicing.confirmPayment.useMutation({
    onSuccess: () => { toast("Zahlung bestätigt"); refetchInvoices(); setShowPayment(null); }
  });
  const cancelMutation = trpc.invoicing.cancelInvoice.useMutation({
    onSuccess: () => { toast("Rechnung storniert"); refetchInvoices(); }
  });
  const recordPaymentMutation = trpc.invoicing.recordPayment.useMutation({
    onSuccess: (data) => {
      toast.success(data.isPaid ? "Rechnung vollständig bezahlt ✓" : `Teilzahlung erfasst (CHF ${data.totalPaid} bezahlt)`);
      refetchInvoices();
      setShowRecordPayment(null);
      setPaymentForm({ amount: "", method: "bank", paidAt: new Date().toISOString().slice(0, 10), notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const [showRecordPayment, setShowRecordPayment] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "bank", paidAt: new Date().toISOString().slice(0, 10), notes: "" });
  const generatePdfMutation = trpc.invoicing.generateAndSendInvoice.useMutation({
    onSuccess: (data: any) => {
      if (data?.pdfUrl) window.open(data.pdfUrl, "_blank");
      refetchInvoices();
    }
  });
  const createMandateMutation = trpc.invoicing.createMandate.useMutation({
    onSuccess: () => { toast("Mandat erstellt"); refetchMandates(); setShowMandate(false); }
  });
  const revokeMandateMutation = trpc.invoicing.updateMandateStatus.useMutation({
    onSuccess: () => { toast("Mandat widerrufen"); refetchMandates(); }
  });
  const creditNoteMutation = trpc.invoicing.createCreditNote.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Gutschrift ${data.creditNumber} erstellt`);
      refetchInvoices();
      setShowCreditNote(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Gefilterte Rechnungen
  const filtered = useMemo(() => {
    return (invoiceList ?? []).filter((inv: Invoice) => {
      const matchSearch = !search || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        inv.recipientName.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [invoiceList, search, statusFilter]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" /> Rechnungswesen & Debitoren
          </h1>
          <p className="text-muted-foreground text-sm">Schweizer QR-Rechnungen, Mandate und Zahlungsmanagement</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowMandate(true)} className="gap-2">
            <Building2 className="h-4 w-4" /> Mandat
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2" disabled={!selectedRestaurant}>
            <Plus className="h-4 w-4" /> Neue Rechnung
          </Button>
        </div>
      </div>

      {/* Restaurant-Auswahl */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap font-medium">Restaurant:</Label>
            <Select value={selectedRestaurant?.toString() ?? ""} onValueChange={(v) => setSelectedRestaurant(Number(v))}>
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Restaurant auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {(restaurants ?? []).map((r: any) => (
                  <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Statistiken */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><FileText className="h-3 w-3" /> Total Rechnungen</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="h-3 w-3" /> Offen</div>
              <div className="text-2xl font-bold text-orange-600">{fmt(stats.openAmount)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><AlertTriangle className="h-3 w-3" /> Überfällig</div>
              <div className="text-2xl font-bold text-red-600">{fmt(stats.overdueAmount)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CheckCircle className="h-3 w-3" /> Bezahlt</div>
              <div className="text-2xl font-bold text-green-600">{fmt(stats.paidAmount)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="invoices" className="gap-2"><FileText className="h-4 w-4" /> Rechnungen</TabsTrigger>
          <TabsTrigger value="mandates" className="gap-2"><Building2 className="h-4 w-4" /> Mandate</TabsTrigger>
          <TabsTrigger value="aging" className="gap-2"><BarChart2 className="h-4 w-4" /> Aging-Report</TabsTrigger>
        </TabsList>

        {/* ─── Rechnungen ─── */}
        <TabsContent value="invoices" className="space-y-4 mt-4">
          {/* Filter */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Suche..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetchInvoices()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Rechnungsliste */}
          {!selectedRestaurant ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Bitte Restaurant auswählen</CardContent></Card>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Keine Rechnungen gefunden</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((inv: Invoice) => {
                const isExpanded = expandedId === inv.id;
                const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && !["paid", "cancelled", "credited"].includes(inv.status);
                return (
                  <Card key={inv.id} className={isOverdue ? "border-red-200" : ""}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <button onClick={() => setExpandedId(isExpanded ? null : inv.id)} className="text-muted-foreground hover:text-foreground">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <div>
                            <div className="font-semibold text-sm">{inv.invoiceNumber}</div>
                            <div className="text-xs text-muted-foreground">{inv.recipientName}</div>
                          </div>
                          {statusBadge(inv.status)}
                          {isOverdue && <Badge variant="destructive" className="text-xs">ÜBERFÄLLIG</Badge>}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="font-bold">{fmt(inv.totalAmount)}</div>
                            <div className="text-xs text-muted-foreground">Fällig: {fmtDate(inv.dueDate)}</div>
                          </div>
                          {/* Aktionen */}
                          <div className="flex gap-1">
                            {inv.pdfUrl ? (
                              <Button size="icon" variant="outline" title="PDF herunterladen" onClick={() => window.open(inv.pdfUrl!, "_blank")}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="outline" title="PDF generieren" onClick={() => generatePdfMutation.mutate({ invoiceId: inv.id, restaurantId: inv.restaurantId })} disabled={generatePdfMutation.isPending}>
                                <QrCode className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {inv.status === "draft" && (
                              <Button size="icon" variant="outline" title="Versenden" onClick={() => sendMutation.mutate({ invoiceId: inv.id, restaurantId: inv.restaurantId })} disabled={sendMutation.isPending}>
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {["sent", "reminded", "overdue"].includes(inv.status) && (
                              <Button size="icon" variant="outline" title="Erinnerung senden" onClick={() => remindMutation.mutate({ invoiceId: inv.id, restaurantId: inv.restaurantId })} disabled={remindMutation.isPending}>
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                            )}
                                                        {!["paid", "cancelled", "credited"].includes(inv.status) && (
                              <Button size="icon" variant="outline" title="Zahlung bestätigen" className="text-green-600 hover:text-green-700" onClick={() => setShowPayment(inv)}>
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {!["paid", "cancelled", "credited"].includes(inv.status) && (
                              <Button size="icon" variant="outline" title="Zahlungseingang erfassen" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => { setShowRecordPayment(inv); setPaymentForm({ amount: inv.totalAmount, method: "bank", paidAt: new Date().toISOString().slice(0, 10), notes: "" }); }}>
                                <DollarSign className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {inv.status === "draft" && (
                              <Button size="icon" variant="outline" title="Stornieren" className="text-red-600 hover:text-red-700" onClick={() => cancelMutation.mutate({ invoiceId: inv.id, restaurantId: inv.restaurantId })} disabled={cancelMutation.isPending}>
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {["dunning1", "dunning2"].includes(inv.status) && (
                              <DunningPdfButton invoiceId={inv.id} restaurantId={inv.restaurantId} level={inv.status === "dunning2" ? 2 : 1} />
                            )}
                            {["paid", "sent", "partial", "dunning1", "dunning2"].includes(inv.status) && (
                              <Button size="icon" variant="outline" title="Gutschrift erstellen" className="text-purple-600 hover:text-purple-700" onClick={() => setShowCreditNote(inv)}>
                                <ReceiptText className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Erweiterte Details */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><span className="text-muted-foreground">Ausgestellt:</span><br />{fmtDate(inv.issueDate)}</div>
                            <div><span className="text-muted-foreground">Fällig:</span><br />{fmtDate(inv.dueDate)}</div>
                            <div><span className="text-muted-foreground">Bezahlt:</span><br />{fmt(inv.paidAmount ?? 0)}</div>
                            <div><span className="text-muted-foreground">Offen:</span><br />{fmt(Number(inv.totalAmount) - Number(inv.paidAmount ?? 0))}</div>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Empfänger:</span><br />
                            <span className="whitespace-pre-line">{inv.recipientAddress}</span>
                          </div>
                          {inv.notes && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Notizen:</span><br />
                              {inv.notes}
                            </div>
                          )}
                          {(inv as any).signatureUrl && (
                            <div className="mt-2 space-y-1">
                              <span className="text-muted-foreground text-sm">Digitale Unterschrift:</span>
                              <div className="mt-1 flex items-start gap-3">
                                <img
                                  src={(inv as any).signatureUrl}
                                  alt="Unterschrift"
                                  className="border border-border rounded bg-white p-1 max-h-14 max-w-[200px] object-contain"
                                />
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-xs mt-1">
                                  <CheckCircle className="h-3 w-3" /> Unterschrift vorhanden
                                </Badge>
                              </div>
                              {(inv as any).signatureTimestamp && (
                                <p className="text-xs text-muted-foreground">
                                  🕐 {new Date((inv as any).signatureTimestamp).toLocaleString("de-CH", { timeZone: "Europe/Zurich" })} (Schweizer Zeit)
                                </p>
                              )}
                              {((inv as any).signatureLat && (inv as any).signatureLng) && (
                                <p className="text-xs text-muted-foreground">
                                  📍 GPS: {parseFloat((inv as any).signatureLat).toFixed(5)}, {parseFloat((inv as any).signatureLng).toFixed(5)}
                                  {" "}
                                  <a
                                    href={`https://www.google.com/maps?q=${(inv as any).signatureLat},${(inv as any).signatureLng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 underline"
                                  >
                                    Karte
                                  </a>
                                </p>
                              )}
                              {(inv as any).signatureAddress && (
                                <p className="text-xs text-muted-foreground truncate max-w-xs" title={(inv as any).signatureAddress}>
                                  🏠 {(inv as any).signatureAddress}
                                </p>
                              )}
                            </div>
                          )}
                          {inv.status === "credited" && (
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200 gap-1">
                                <ReceiptText className="h-3 w-3" /> Gutschrift ausgestellt
                              </Badge>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Mandate ─── */}
        <TabsContent value="mandates" className="space-y-4 mt-4">
          {!selectedRestaurant ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Bitte Restaurant auswählen</CardContent></Card>
          ) : (mandateList ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">Keine Mandate vorhanden</p>
                <Button className="mt-4 gap-2" onClick={() => setShowMandate(true)}>
                  <Plus className="h-4 w-4" /> Mandat erstellen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(mandateList ?? []).map((m: Mandate) => (
                <Card key={m.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-semibold">{m.accountHolder}</div>
                        <div className="text-sm text-muted-foreground font-mono">{m.iban}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {m.mandateType === "lsv" ? "LSV+" : m.mandateType === "direct_debit" ? "Lastschrift" : "Dauerauftrag"} •
                          Gültig ab {fmtDate(m.validFrom)} {m.validUntil ? `bis ${fmtDate(m.validUntil)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={m.status === "active" ? "default" : "secondary"} className={m.status === "active" ? "bg-green-100 text-green-800" : ""}>
                          {m.status === "active" ? "Aktiv" : m.status === "revoked" ? "Widerrufen" : "Ausstehend"}
                        </Badge>
                        {m.status === "active" && (
                          <Button size="sm" variant="outline" className="text-red-600 gap-1" onClick={() => revokeMandateMutation.mutate({ mandateId: m.id, restaurantId: m.restaurantId, status: 'cancelled' })}>
                            <Ban className="h-3 w-3" /> Widerrufen
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Aging-Report ─── */}
        <TabsContent value="aging" className="space-y-4 mt-4">
          <AgingReportTab restaurantId={selectedRestaurant} />
        </TabsContent>
      </Tabs>

      {/* ─── Dialog: Neue Rechnung ─────────────────────────────────────────── */}
      <CreateInvoiceDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        restaurantId={selectedRestaurant}
        restaurants={restaurants ?? []}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {/* ─── Dialog: Zahlung bestätigen ───────────────────────────────────── */}
      {showPayment && (
        <PaymentConfirmDialog
          invoice={showPayment}
          onClose={() => setShowPayment(null)}
          onConfirm={(data) => confirmPaymentMutation.mutate(data)}
          isPending={confirmPaymentMutation.isPending}
        />
      )}

      {/* ─── Dialog: Mandat erstellen ─────────────────────────────────────── */}
      {showMandate && (
        <CreateMandateDialog
          open={showMandate}
          onClose={() => setShowMandate(false)}
          restaurantId={selectedRestaurant}
          restaurants={restaurants ?? []}
          onSubmit={(data) => createMandateMutation.mutate(data)}
          isPending={createMandateMutation.isPending}
        />
      )}

      {/* ─── Dialog: Gutschrift erstellen ─────────────────────────────────── */}
      {showCreditNote && (
        <CreditNoteDialog
          invoice={showCreditNote}
          onClose={() => setShowCreditNote(null)}
          onConfirm={(data) => creditNoteMutation.mutate(data)}
          isPending={creditNoteMutation.isPending}
        />
      )}
      {/* ─── Dialog: Zahlungseingang erfassen ─────────────────────────────── */}
      {showRecordPayment && (
        <Dialog open onOpenChange={() => setShowRecordPayment(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" /> Zahlungseingang erfassen
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 text-sm">
                <div className="font-medium">{showRecordPayment.invoiceNumber} – {showRecordPayment.recipientName}</div>
                <div className="text-muted-foreground mt-1">
                  Rechnungsbetrag: <span className="font-semibold">{fmt(showRecordPayment.totalAmount)}</span>
                  {showRecordPayment.paidAmount && Number(showRecordPayment.paidAmount) > 0 && (
                    <span className="ml-2 text-green-600">· Bereits bezahlt: {fmt(showRecordPayment.paidAmount)}</span>
                  )}
                </div>
              </div>
              <div>
                <Label>Betrag (CHF) *</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Zahlungsart</Label>
                <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm(f => ({ ...f, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Banküberweisung</SelectItem>
                    <SelectItem value="cash">Bar</SelectItem>
                    <SelectItem value="card">Karte</SelectItem>
                    <SelectItem value="twint">TWINT</SelectItem>
                    <SelectItem value="lsv">LSV/Lastschrift</SelectItem>
                    <SelectItem value="other">Sonstiges</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Zahlungsdatum</Label>
                <Input
                  type="date"
                  value={paymentForm.paidAt}
                  onChange={(e) => setPaymentForm(f => ({ ...f, paidAt: e.target.value }))}
                />
              </div>
              <div>
                <Label>Notizen (optional)</Label>
                <Textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="z.B. Referenznummer, Bemerkung..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRecordPayment(null)}>Abbrechen</Button>
              <Button
                onClick={() => recordPaymentMutation.mutate({
                  invoiceId: showRecordPayment.id,
                  restaurantId: showRecordPayment.restaurantId,
                  amount: Number(paymentForm.amount),
                  method: paymentForm.method as "bank" | "cash" | "card" | "twint" | "other",
                  paidAt: paymentForm.paidAt,
                  notes: paymentForm.notes || undefined,
                })}
                disabled={recordPaymentMutation.isPending || !paymentForm.amount || Number(paymentForm.amount) <= 0}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <DollarSign className="h-4 w-4" />
                {recordPaymentMutation.isPending ? "Speichere..." : "Zahlung erfassen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Dialog: Neue Rechnung erstellen ─────────────────────────────────────────
function CreateInvoiceDialog({ open, onClose, restaurantId, restaurants, onSubmit, isPending }: {
  open: boolean; onClose: () => void; restaurantId: number | null;
  restaurants: any[]; onSubmit: (d: any) => void; isPending: boolean;
}) {
  const [form, setForm] = useState({
    restaurantId: restaurantId ?? 0,
    recipientName: "", recipientEmail: "", recipientAddress: "",
    creditorName: "SimplaPos AG", creditorAddress: "Bahnhofstrasse 1\n8001 Zürich",
    iban: "CH56 0483 5012 3456 7800 9",
    currency: "CHF", paymentTermDays: 30, notes: "",
    additionalInfo: "",
  });
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tax = items.reduce((s, i) => s + i.quantity * i.unitPrice * i.taxRate / 100, 0);
  const total = subtotal + tax;

  const handleSubmit = () => {
    if (!form.recipientName || items.some(i => !i.description)) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    onSubmit({ ...form, items });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Neue QR-Rechnung erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Restaurant */}
          <div>
            <Label>Restaurant *</Label>
            <Select value={form.restaurantId.toString()} onValueChange={(v) => setForm(f => ({ ...f, restaurantId: Number(v) }))}>
              <SelectTrigger><SelectValue placeholder="Restaurant wählen..." /></SelectTrigger>
              <SelectContent>
                {restaurants.map((r: any) => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Empfänger */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Empfänger Name *</Label>
              <Input value={form.recipientName} onChange={(e) => setForm(f => ({ ...f, recipientName: e.target.value }))} placeholder="Max Muster AG" />
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input value={form.recipientEmail} onChange={(e) => setForm(f => ({ ...f, recipientEmail: e.target.value }))} placeholder="rechnung@firma.ch" type="email" />
            </div>
          </div>
          <div>
            <Label>Empfänger Adresse *</Label>
            <Textarea value={form.recipientAddress} onChange={(e) => setForm(f => ({ ...f, recipientAddress: e.target.value }))} placeholder={"Musterstrasse 1\n8000 Zürich"} rows={2} />
          </div>

          {/* Gläubiger (Zahlungsempfänger) */}
          <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
            <div className="text-sm font-medium text-muted-foreground">Gläubiger (Zahlungsempfänger)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={form.creditorName} onChange={(e) => setForm(f => ({ ...f, creditorName: e.target.value }))} />
              </div>
              <div>
                <Label>IBAN *</Label>
                <Input value={form.iban} onChange={(e) => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="CH56 0483 5012 3456 7800 9" className="font-mono text-sm" />
              </div>
            </div>
            <div>
              <Label>Adresse</Label>
              <Textarea value={form.creditorAddress} onChange={(e) => setForm(f => ({ ...f, creditorAddress: e.target.value }))} rows={2} />
            </div>
          </div>

          {/* Positionen */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Rechnungspositionen *</Label>
              <Button size="sm" variant="outline" onClick={() => setItems(i => [...i, emptyItem()])}>
                <Plus className="h-3 w-3 mr-1" /> Position
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                  <Input className="col-span-4" placeholder="Beschreibung" value={item.description} onChange={(e) => setItems(it => it.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                  <Input className="col-span-2" type="number" placeholder="Menge" value={item.quantity} onChange={(e) => setItems(it => it.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
                  <Input className="col-span-2" placeholder="Einheit" value={item.unit} onChange={(e) => setItems(it => it.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))} />
                  <Input className="col-span-2" type="number" placeholder="Preis" value={item.unitPrice} onChange={(e) => setItems(it => it.map((x, i) => i === idx ? { ...x, unitPrice: Number(e.target.value) } : x))} />
                  <div className="col-span-1 text-xs text-right text-muted-foreground">{(item.quantity * item.unitPrice).toFixed(2)}</div>
                  <Button size="icon" variant="ghost" className="col-span-1 h-8 w-8 text-red-500" onClick={() => setItems(it => it.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Zusammenfassung */}
          <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>MWST (Ø)</span><span>{fmt(tax)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>Total</span><span>{fmt(total)}</span></div>
          </div>

          {/* Zahlungsziel & Notizen */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Zahlungsziel (Tage)</Label>
              <Input type="number" value={form.paymentTermDays} onChange={(e) => setForm(f => ({ ...f, paymentTermDays: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Währung</Label>
              <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHF">CHF</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notizen / Zahlungszweck</Label>
            <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optionale Notizen..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
            <FileText className="h-4 w-4" /> {isPending ? "Erstelle..." : "Rechnung erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog: Zahlung bestätigen ───────────────────────────────────────────────
function PaymentConfirmDialog({ invoice, onClose, onConfirm, isPending }: {
  invoice: Invoice; onClose: () => void; onConfirm: (d: any) => void; isPending: boolean;
}) {
  const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount ?? 0);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-600" /> Zahlung bestätigen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/30 rounded-lg p-3 text-sm">
            <div className="font-medium">{invoice.invoiceNumber} – {invoice.recipientName}</div>
            <div className="text-muted-foreground">Offen: <span className="font-bold text-foreground">{fmt(remaining)}</span></div>
          </div>
          <div>
            <Label>Betrag (CHF) *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.05" />
          </div>
          <div>
            <Label>Zahlungsmethode</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Banküberweisung</SelectItem>
                <SelectItem value="qr_payment">QR-Zahlung (E-Banking)</SelectItem>
                <SelectItem value="cash">Barzahlung</SelectItem>
                <SelectItem value="card">Karte</SelectItem>
                <SelectItem value="lsv">LSV+</SelectItem>
                <SelectItem value="direct_debit">Lastschrift</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Referenz / Transaktions-ID</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="z.B. QR-Referenz oder IBAN-Referenz" />
          </div>
          <div>
            <Label>Notizen</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onConfirm({ invoiceId: invoice.id, amount: Number(amount), paymentMethod: method, reference, notes })} disabled={isPending || !amount} className="gap-2 bg-green-600 hover:bg-green-700">
            <CheckCircle className="h-4 w-4" /> {isPending ? "Bestätige..." : "Zahlung bestätigen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog: Mandat erstellen ─────────────────────────────────────────────────
function CreateMandateDialog({ open, onClose, restaurantId, restaurants, onSubmit, isPending }: {
  open: boolean; onClose: () => void; restaurantId: number | null;
  restaurants: any[]; onSubmit: (d: any) => void; isPending: boolean;
}) {
  const [form, setForm] = useState({
    restaurantId: restaurantId ?? 0,
    mandateType: "lsv" as "lsv" | "direct_debit" | "standing_order",
    iban: "", accountHolder: "", bankName: "", bankBic: "",
    signedAt: new Date().toISOString().split("T")[0],
    notes: "",
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Mandat erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Restaurant *</Label>
            <Select value={form.restaurantId.toString()} onValueChange={(v) => setForm(f => ({ ...f, restaurantId: Number(v) }))}>
              <SelectTrigger><SelectValue placeholder="Restaurant wählen..." /></SelectTrigger>
              <SelectContent>
                {restaurants.map((r: any) => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mandat-Typ</Label>
            <Select value={form.mandateType} onValueChange={(v: any) => setForm(f => ({ ...f, mandateType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lsv">LSV+ (Lastschriftverfahren)</SelectItem>
                <SelectItem value="direct_debit">Direktlastschrift</SelectItem>
                <SelectItem value="standing_order">Dauerauftrag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>IBAN *</Label>
            <Input value={form.iban} onChange={(e) => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="CH56 0483 5012 3456 7800 9" className="font-mono" />
          </div>
          <div>
            <Label>Kontoinhaber *</Label>
            <Input value={form.accountHolder} onChange={(e) => setForm(f => ({ ...f, accountHolder: e.target.value }))} placeholder="Max Muster AG" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bank</Label>
              <Input value={form.bankName} onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="UBS AG" />
            </div>
            <div>
              <Label>BIC/SWIFT</Label>
              <Input value={form.bankBic} onChange={(e) => setForm(f => ({ ...f, bankBic: e.target.value }))} placeholder="UBSWCHZH80A" className="font-mono" />
            </div>
          </div>
          <div>
            <Label>Unterzeichnet am</Label>
            <Input type="date" value={form.signedAt} onChange={(e) => setForm(f => ({ ...f, signedAt: e.target.value }))} />
          </div>
          <div>
            <Label>Notizen</Label>
            <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onSubmit(form)} disabled={isPending || !form.iban || !form.accountHolder} className="gap-2">
            <Building2 className="h-4 w-4" /> {isPending ? "Erstelle..." : "Mandat erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog: Gutschrift erstellen ────────────────────────────────────────────
function CreditNoteDialog({ invoice, onClose, onConfirm, isPending }: {
  invoice: Invoice;
  onClose: () => void;
  onConfirm: (data: { originalInvoiceId: number; restaurantId: number; amount: number; reason: string }) => void;
  isPending: boolean;
}) {
  const maxAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount ?? 0);
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const [reason, setReason] = useState("");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700">
            <ReceiptText className="h-5 w-5" /> Gutschrift erstellen
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Rechnungsinfo */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
            <div className="font-semibold text-purple-900">{invoice.invoiceNumber}</div>
            <div className="text-purple-700">{invoice.recipientName}</div>
            <div className="text-purple-600 mt-1">
              Total: <span className="font-bold">{fmt(invoice.totalAmount)}</span>
              {Number(invoice.paidAmount) > 0 && (
                <span className="ml-2">· Bezahlt: {fmt(invoice.paidAmount ?? 0)}</span>
              )}
            </div>
          </div>

          {/* Gutschriftbetrag */}
          <div>
            <Label>Gutschriftbetrag (CHF) *</Label>
            <Input
              type="number"
              step="0.05"
              min="0.05"
              max={maxAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximaler Betrag: CHF {maxAmount.toFixed(2)}
            </p>
          </div>

          {/* Grund */}
          <div>
            <Label>Grund der Gutschrift *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z.B. Doppelzahlung, Stornierung, Rabatt nachträglich..."
              rows={3}
            />
          </div>

          {/* Hinweis */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>Hinweis:</strong> Die Gutschrift wird als neue Rechnung mit negativem Betrag (GS-{invoice.invoiceNumber}) erstellt.
            Die Original-Rechnung wird als «Gutgeschrieben» markiert.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={() => onConfirm({
              originalInvoiceId: invoice.id,
              restaurantId: invoice.restaurantId,
              amount: Number(amount),
              reason,
            })}
            disabled={isPending || !reason.trim() || Number(amount) <= 0}
            className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <ReceiptText className="h-4 w-4" />
            {isPending ? "Erstelle Gutschrift..." : "Gutschrift erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Aging-Report Komponente ───────────────────────────────────────────────────
function AgingReportTab({ restaurantId }: { restaurantId: number | null }) {
  const { data: report, isLoading, refetch } = trpc.invoicing.getAgingReport.useQuery(
    { restaurantId: restaurantId! },
    { enabled: !!restaurantId }
  );

  if (!restaurantId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Bitte Restaurant auswählen um den Aging-Report zu laden</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Card key={i}><CardContent className="py-6"><div className="h-6 bg-muted animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (!report) return null;

  const { summary, buckets, generatedAt } = report;

  type BucketEntry = {
    invoiceId: number;
    invoiceNumber: string;
    recipientName: string;
    recipientEmail: string | null;
    totalAmount: string;
    paidAmount: string;
    dunningFee: string;
    openAmount: number;
    dueDate: Date | null;
    daysOverdue: number;
    status: string;
    dunningLevel: number;
  };

  const bucketDefs: { key: keyof typeof buckets; label: string; color: string; bgColor: string; barColor: string }[] = [
    { key: "current", label: "Noch nicht fällig", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200", barColor: "bg-blue-500" },
    { key: "days0_30", label: "0–30 Tage überfällig", color: "text-yellow-700", bgColor: "bg-yellow-50 border-yellow-200", barColor: "bg-yellow-500" },
    { key: "days31_60", label: "31–60 Tage überfällig", color: "text-orange-700", bgColor: "bg-orange-50 border-orange-200", barColor: "bg-orange-500" },
    { key: "days61_90", label: "61–90 Tage überfällig", color: "text-red-600", bgColor: "bg-red-50 border-red-200", barColor: "bg-red-500" },
    { key: "days90plus", label: "> 90 Tage überfällig", color: "text-red-900", bgColor: "bg-red-100 border-red-300", barColor: "bg-red-800" },
  ];

  const summaryTotals = [
    { key: "currentTotal", label: "Noch nicht fällig", value: summary.currentTotal },
    { key: "days0_30Total", label: "0–30 Tage", value: summary.days0_30Total },
    { key: "days31_60Total", label: "31–60 Tage", value: summary.days31_60Total },
    { key: "days61_90Total", label: "61–90 Tage", value: summary.days61_90Total },
    { key: "days90plusTotal", label: "> 90 Tage", value: summary.days90plusTotal },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-blue-600" />
            Debitorenliste – Aging-Report
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generiert: {new Date(generatedAt).toLocaleString("de-CH")} · {summary.invoiceCount} offene Rechnungen
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Aktualisieren
        </Button>
      </div>

      {/* Zusammenfassung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Gesamtübersicht offene Posten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            {summaryTotals.map(({ key, label, value }) => (
              <div key={key} className="text-center p-3 rounded-lg bg-muted/40">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className={`font-bold text-sm ${value > 0 && key !== "currentTotal" ? "text-red-600" : "text-foreground"}`}>
                  {fmt(value)}
                </div>
              </div>
            ))}
          </div>
          {/* Balkendiagramm */}
          {summary.totalOpen > 0 && (
            <div className="space-y-1.5">
              {summaryTotals.map(({ key, label, value }, idx) => {
                const pct = summary.totalOpen > 0 ? (value / summary.totalOpen) * 100 : 0;
                const colors = ["bg-blue-500", "bg-yellow-500", "bg-orange-500", "bg-red-500", "bg-red-800"];
                return pct > 0 ? (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-28 text-xs text-muted-foreground truncate">{label}</div>
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors[idx]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs font-medium w-12 text-right">{pct.toFixed(1)}%</div>
                  </div>
                ) : null;
              })}
            </div>
          )}
          <div className="mt-3 pt-3 border-t flex justify-between items-center">
            <span className="text-sm font-medium">Total offene Posten</span>
            <span className="text-lg font-bold text-orange-600">{fmt(summary.totalOpen)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Buckets */}
      {bucketDefs.map(({ key, label, color, bgColor }) => {
        const entries = buckets[key] as BucketEntry[];
        if (entries.length === 0) return null;
        return (
          <Card key={key} className={`border ${bgColor}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm flex items-center justify-between ${color}`}>
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {label}
                  <Badge variant="outline" className="ml-1 text-xs">{entries.length}</Badge>
                </span>
                <span className="font-bold">{fmt(entries.reduce((s, e) => s + e.openAmount, 0))}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div key={entry.invoiceId} className="flex items-center justify-between p-2 rounded-md bg-background/60 border text-sm gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-xs">{entry.invoiceNumber}</div>
                        <div className="text-xs text-muted-foreground truncate">{entry.recipientName}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {entry.dueDate && (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(entry.dueDate).toLocaleDateString("de-CH")}
                        </span>
                      )}
                      {entry.daysOverdue > 0 && (
                        <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                          +{entry.daysOverdue}d
                        </Badge>
                      )}
                      {entry.dunningLevel > 0 && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-orange-400 text-orange-700">
                          Mahnung {entry.dunningLevel}
                        </Badge>
                      )}
                      <span className="font-semibold">{fmt(entry.openAmount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {summary.invoiceCount === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
            <p className="font-medium">Keine offenen Posten</p>
            <p className="text-xs mt-1">Alle Rechnungen sind bezahlt oder storniert.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
