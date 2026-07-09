import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

import { Receipt, CreditCard, AlertCircle, Banknote, Smartphone, FileText, ArrowLeft, CheckCircle2, Printer, User, Mail, MapPin, CalendarDays, Info, Send, AlertTriangle, ExternalLink, Eye, Loader2, Search, BookUser, Plus, Gift, QrCode, ScanLine, Star } from "lucide-react";
import { VoucherScanner } from "@/components/VoucherScanner";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWaiterPin } from "@/contexts/WaiterPinContext";
import { cn } from "@/lib/utils";
import { type ReceiptData } from "@/components/ReceiptPrint";
import { SignaturePad, type SignatureData } from "@/components/SignaturePad";
import { Link, useLocation } from "wouter";

type TableEntry = {
  id: number; sourceType: string; label: string; seats: number;
  currentOrder: { id: number; status: string; totalAmount: string | null; guestCount: number | null } | null;
};

type PayMethod = "cash" | "card" | "twint" | "invoice";

type InvoiceGuestData = {
  recipientName: string;
  recipientEmail: string;
  recipientAddress: string;
  dueDate: string;
  additionalInfo: string;
  discountPercent: number;
};

const PAY_METHODS: { value: PayMethod; label: string; icon: React.ElementType }[] = [
  { value: "cash",    label: "Bar",      icon: Banknote },
  { value: "card",    label: "Karte",    icon: CreditCard },
  { value: "twint",   label: "TWINT",    icon: Smartphone },
  { value: "invoice", label: "Rechnung", icon: FileText },
];

function roundCHF(amount: number): number {
  return Math.round(amount * 20) / 20;
}

function quickAmounts(total: number): number[] {
  const candidates = [5, 10, 20, 50, 100, 200];
  const result: number[] = [];
  for (const c of candidates) {
    if (c >= total && result.length < 4) result.push(c);
  }
  const exact = roundCHF(total);
  if (!result.includes(exact)) result.unshift(exact);
  return result.slice(0, 5);
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

export default function Waiter_checkout() {
  const { user } = useAuth();
  const { activeWaiter } = useWaiterPin();
  const restaurantId = user?.restaurantId ?? 0;

  const [selectedTable, setSelectedTable] = useState<TableEntry | null>(null);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [cashGiven, setCashGiven] = useState<string>("");
  const [tip, setTip] = useState<string>("");
  const [success, setSuccess] = useState<{
    change: number; total: number; tip: number;
    receiptData?: ReceiptData;
    invoiceId?: number;
    invoiceNumber?: string;
    recipientEmail?: string;
  } | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Gastdaten-Dialog
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showDebtorOverlay, setShowDebtorOverlay] = useState(false);
  const [debtorSearch, setDebtorSearch] = useState("");
  const [showDebtorDropdown, setShowDebtorDropdown] = useState(false);
  const [saveAsDebtor, setSaveAsDebtor] = useState(false);
  const [newDebtorIban, setNewDebtorIban] = useState("");
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);

  // Treuepunkte
  const [showLoyaltyDialog, setShowLoyaltyDialog] = useState(false);
  const [loyaltyEmail, setLoyaltyEmail] = useState("");
  const [loyaltyLookup, setLoyaltyLookup] = useState<{ id: number; firstName: string; lastName: string; totalPoints: number; tier: string; token?: string } | null>(null);
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState("");
  const [loyaltyMode, setLoyaltyMode] = useState<"earn" | "redeem">("earn");
  const [showLoyaltyScanner, setShowLoyaltyScanner] = useState(false);
  const [selectedRewardId, setSelectedRewardId] = useState<number | null>(null);
  const [showRegQr, setShowRegQr] = useState(false);
  const regQrOrigin = "https://simplapos.com";

  // Geschenkkarten-Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [showGiftCardDialog, setShowGiftCardDialog] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardAmount, setGiftCardAmount] = useState("");
  const [giftCardLookup, setGiftCardLookup] = useState<{ id: number; code: string; remainingBalance: string; issuedTo: string | null } | null>(null);
  const [giftCardRedeemMode, setGiftCardRedeemMode] = useState<"sell" | "redeem">("sell");
  const [guestData, setGuestData] = useState<InvoiceGuestData>({
    recipientName: "",
    recipientEmail: "",
    recipientAddress: "",
    dueDate: defaultDueDate(),
    additionalInfo: "",
    discountPercent: 0,
  });

  const utils = trpc.useUtils();
  const { data: regQrData } = trpc.loyalty.getRegistrationQr.useQuery({ origin: regQrOrigin }, { enabled: showRegQr });

  // Geschenkkarten-Mutations
  const redeemGiftCard = trpc.voucher.redeemGiftCard.useMutation({
    onSuccess: (data) => {
      toast.success(`Geschenkkarte eingelöst! CHF ${data.amountDeducted.toFixed(2)} abgezogen. Restguthaben: CHF ${data.balanceAfter.toFixed(2)}`);
      setShowGiftCardDialog(false);
      setGiftCardCode("");
      setGiftCardAmount("");
      setGiftCardLookup(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const lookupGiftCard = trpc.voucher.checkGiftCardBalance.useQuery(
    { code: giftCardCode.trim().toUpperCase() },
    { enabled: false }
  );

  const [, navigate] = useLocation();

  const sellGiftCard = trpc.voucher.create.useMutation({
    onSuccess: (data) => {
      const v = data.created[0];
      toast.success(`Geschenkkarte ${v?.code} über CHF ${giftCardAmount} erstellt – Druckvorschau wird geöffnet...`);
      setShowGiftCardDialog(false);
      setGiftCardCode("");
      setGiftCardAmount("");
      setGiftCardLookup(null);
      utils.voucher.list.invalidate();
      // Nach kurzem Delay zur Druckvorschau navigieren
      if (v?.id) {
        setTimeout(() => navigate(`/admin/vouchers/${v.id}/print`), 400);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  function handleScanResult(raw: string) {
    setShowScanner(false);
    // Normalisieren: falls volle URL /gift/CODE, nur Code extrahieren
    let code = raw;
    const match = raw.match(/\/gift\/([A-Z0-9\-]+)$/i);
    if (match) code = match[1].toUpperCase();
    setGiftCardCode(code);
    setGiftCardRedeemMode("redeem");
    setShowGiftCardDialog(true);
  }

  // Treuepunkte-Mutations
  const [loyaltySearchResult, setLoyaltySearchResult] = useState<any[]>([]);
  const { refetch: runLoyaltySearch, isFetching: loyaltySearching } = trpc.loyalty.lookupCustomer.useQuery(
    { query: loyaltyEmail },
    { enabled: false, retry: false }
  );
  async function handleLoyaltySearch() {
    if (!loyaltyEmail) return;
    const res = await runLoyaltySearch();
    const results = res.data ?? [];
    if (results.length === 1) setLoyaltyLookup(results[0]);
    else if (results.length === 0) toast.error("Kein Treuekunden-Konto gefunden");
    else setLoyaltySearchResult(results);
  }

  const earnLoyaltyPoints = trpc.loyalty.earnPoints.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.earnedPoints} Punkte gutgeschrieben! Guthaben: ${data.newBalance} Punkte`);
      setShowLoyaltyDialog(false);
      setLoyaltyEmail("");
      setLoyaltyLookup(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const redeemLoyaltyPoints = trpc.loyalty.redeemPoints.useMutation({
    onSuccess: (data) => {
      toast.success(`Punkte eingelöst – CHF ${data.discountChf.toFixed(2)} Rabatt!`);
      setShowLoyaltyDialog(false);
      setLoyaltyEmail("");
      setLoyaltyLookup(null);
      setLoyaltyRedeemPoints("");
    },
    onError: (e) => toast.error(e.message),
  });

  // Prämien-Einlösung direkt beim Checkout
  const { data: availableRewards } = trpc.loyalty.listRewards.useQuery(undefined, {
    enabled: !!loyaltyLookup && loyaltyMode === "redeem",
  });
  const redeemRewardMutation = trpc.loyalty.redeemReward.useMutation({
    onSuccess: (data) => {
      toast.success(`Prämie "${data.rewardName}" eingelöst!`, { duration: 4000 });
      setShowLoyaltyDialog(false);
      setLoyaltyEmail("");
      setLoyaltyLookup(null);
      setSelectedRewardId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Debitor direkt aus Checkout erstellen
  const createDebtorMutation = trpc.debtors.create.useMutation({
    onSuccess: () => toast.success("Debitor im Stamm gespeichert"),
    onError: (e) => toast.error(`Debitor konnte nicht gespeichert werden: ${e.message}`),
  });

  // Debitorenstamm laden (für Overlay)
  const [debtorOverlaySearch, setDebtorOverlaySearch] = useState("");
  const { data: allDebtors = [], isLoading: allDebtorsLoading } = trpc.debtors.listForSelect.useQuery(
    { restaurantId, searchQuery: debtorOverlaySearch },
    { enabled: !!restaurantId && showDebtorOverlay }
  );

  // Einstellungen laden (IBAN-Prüfung)
  const { data: settings } = trpc.restaurantAdmin.getSettings.useQuery(undefined, {
    enabled: !!restaurantId,
  });
  const hasIban = !!(settings as any)?.invoiceIban;
  const requireSignature = (() => {
    try { return JSON.parse((settings as any)?.waiterPermissions ?? '{}').requireSignature === true; } catch { return false; }
  })();

  const { data: planGroups = [], isLoading, isError, refetch } = trpc.order.getTableStatus.useQuery(undefined, { refetchInterval: 15_000 });

  // Druck via Local Connect Queue: Server speichert Job, App druckt im WLAN
  const printReceiptJobMutation = trpc.printer.createReceiptPrintJob.useMutation();
  const printReceiptJob = {
    mutate: async (input: { orderId: number; paymentMethod?: string; amountPaid?: number; tip?: number }) => {
      try {
        await printReceiptJobMutation.mutateAsync(input);
        toast.success('Bon wird gedruckt – Local Connect App druckt in wenigen Sekunden.');
      } catch (e: any) {
        if (e?.message?.includes('Local Connect')) {
          toast.error('Drucken nicht möglich: Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.');
        } else {
          toast.error(`Bondrucker: ${e?.message}`);
        }
      }
    },
  };

  const close = trpc.order.closeOrder.useMutation({
    onSuccess: (data) => {
      const tipVal = parseFloat(tip) || 0;
      const cashVal = parseFloat(cashGiven) || 0;
      const change = method === "cash" ? Math.max(0, cashVal - data.totalAmount - tipVal) : 0;
      const receiptData: ReceiptData = {
        tableLabel: selectedTable?.label ?? "",
        orderNumber: String(selectedTable?.currentOrder?.id ?? ""),
        items: [],
        subtotal: data.totalAmount - tipVal,
        tip: tipVal,
        total: data.totalAmount - tipVal,
        paymentMethod: method,
        cashGiven: cashVal > 0 ? cashVal : undefined,
        change: roundCHF(change),
      };
      setSuccess({ change: roundCHF(change), total: data.totalAmount - tipVal, tip: tipVal, receiptData });
      utils.order.getTableStatus.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createInvoiceFromOrder = trpc.invoicing.createInvoiceFromOrder.useMutation({
    onSuccess: (data) => {
      if (selectedTable?.currentOrder) {
        close.mutate({
          orderId: selectedTable.currentOrder.id,
          paymentMethod: "invoice",
          tipAmount: 0,
        });
      }
      setShowInvoiceDialog(false);
      setSuccess(prev => ({
        ...(prev ?? { change: 0, total: parseFloat(selectedTable?.currentOrder?.totalAmount ?? "0"), tip: 0 }),
        invoiceId: data.invoiceId,
        invoiceNumber: data.invoiceNumber,
        recipientEmail: guestData.recipientEmail || undefined,
      }));
      toast.success(`Rechnung ${data.invoiceNumber} erstellt`);
      utils.order.getTableStatus.invalidate();
      // Browser-Notification auslösen
      const amount = parseFloat(selectedTable?.currentOrder?.totalAmount ?? "0");
      triggerBrowserNotification(data.invoiceNumber, amount);
    },
    onError: (e) => {
      toast.error(e.message);
      setShowInvoiceDialog(false);
    },
  });

  // PDF abrufen (lazy – nur wenn Button geklickt)
  const getInvoicePdfMutation = trpc.invoicing.generateAndSendInvoice.useMutation({
    onSuccess: (data) => {
      setPdfLoading(false);
      if (data.pdfUrl) {
        setPdfUrl(data.pdfUrl);
        window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("PDF konnte nicht generiert werden");
      }
    },
    onError: (e) => {
      setPdfLoading(false);
      toast.error(e.message);
    },
  });

  function handleOpenPdf() {
    if (!success?.invoiceId) return;
    // Falls PDF bereits geladen, direkt öffnen
    if (pdfUrl) {
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setPdfLoading(true);
    // generateAndSendInvoice ohne E-Mail-Versand – generiert PDF und gibt URL zurück
    getInvoicePdfMutation.mutate({
      invoiceId: success.invoiceId,
      restaurantId,
      sendEmail: false,
    });
  }

  // E-Mail-Versand nach Rechnungserstellung
  const sendEmailMutation = trpc.invoicing.generateAndSendInvoice.useMutation({
    onSuccess: (data) => {
      setEmailSending(false);
      if (data.emailSent) {
        setEmailSent(true);
        toast.success("Rechnung per E-Mail versendet");
      } else {
        toast.error("E-Mail konnte nicht versendet werden (kein SMTP konfiguriert oder keine E-Mail-Adresse)");
      }
    },
    onError: (e) => {
      setEmailSending(false);
      toast.error(e.message);
    },
  });

  const readyToPay = (planGroups as Array<{ tables: TableEntry[] }>)
    .flatMap((g) => g.tables)
    .filter((t) => t.currentOrder && !["paid", "cancelled"].includes(t.currentOrder.status));

  const total = parseFloat(selectedTable?.currentOrder?.totalAmount ?? "0");
  const tipVal = parseFloat(tip) || 0;
  const cashVal = parseFloat(cashGiven) || 0;
  const grandTotal = total + tipVal;
  const change = method === "cash" && cashVal > 0 ? Math.max(0, cashVal - grandTotal) : 0;
  const changeRounded = roundCHF(change);
  const canPay = method !== "cash" || cashVal >= grandTotal;

  const quickAmts = useMemo(() => quickAmounts(grandTotal), [grandTotal]);

  function handlePay() {
    if (!selectedTable?.currentOrder) return;
    if (method === "invoice") {
      setShowInvoiceDialog(true);
      return;
    }
    close.mutate({
      orderId: selectedTable.currentOrder.id,
      paymentMethod: method,
      tipAmount: tipVal,
    });
  }

  function handleInvoiceSubmit() {
    if (!selectedTable?.currentOrder) return;
    if (!guestData.recipientName.trim()) {
      toast.error("Bitte Name des Rechnungsempfängers eingeben");
      return;
    }
    if (requireSignature && !signatureData) {
      toast.error("Unterschrift des Gastes ist obligatorisch — bitte unterschreiben lassen");
      return;
    }
    // Debitor im Stamm speichern wenn Checkbox aktiv
    if (saveAsDebtor) {
      if (!newDebtorIban.trim()) {
        toast.error("IBAN ist Pflichtfeld für Debitor-Speicherung");
        return;
      }
      const cleanIban = newDebtorIban.replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(cleanIban)) {
        toast.error("Ungültiges IBAN-Format");
        return;
      }
      createDebtorMutation.mutate({
        restaurantId,
        name: guestData.recipientName.trim(),
        email: guestData.recipientEmail.trim() || undefined,
        address: guestData.recipientAddress.trim() || undefined,
        iban: cleanIban,
        country: "CH",
      });
    }
    createInvoiceFromOrder.mutate({
      orderId: selectedTable.currentOrder.id,
      restaurantId,
      recipientName: guestData.recipientName.trim(),
      recipientEmail: guestData.recipientEmail.trim() || undefined,
      recipientAddress: guestData.recipientAddress.trim() || undefined,
      dueDate: guestData.dueDate || undefined,
      additionalInfo: guestData.additionalInfo.trim() || undefined,
      discountPercent: guestData.discountPercent,
      signatureDataUrl: signatureData?.dataUrl || undefined,
      signatureLat: signatureData?.lat,
      signatureLng: signatureData?.lng,
      signatureAddress: signatureData?.address,
      signatureTimestamp: signatureData?.timestamp,
    });
  }

  function handleSendEmail() {
    if (!success?.invoiceId) return;
    setEmailSending(true);
    sendEmailMutation.mutate({
      invoiceId: success.invoiceId,
      restaurantId,
      sendEmail: true,
    });
  }

  // Browser-Notification bei Rechnungserstellung
  function triggerBrowserNotification(invoiceNumber: string, amount: number) {
    if ("Notification" in window) {
      const show = () => {
        new Notification("Rechnung erstellt", {
          body: `${invoiceNumber} – CHF ${amount.toFixed(2)} wurde erfolgreich erstellt.`,
          icon: "/favicon.ico",
        });
      };
      if (Notification.permission === "granted") {
        show();
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => { if (p === "granted") show(); });
      }
    }
  }

  function fillFromDebtor(debtor: typeof allDebtors[number]) {
    const addressParts = [
      debtor.address,
      debtor.zip && debtor.city ? `${debtor.zip} ${debtor.city}` : debtor.city || debtor.zip,
    ].filter(Boolean);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (debtor.paymentTermDays || 30));
    setGuestData(d => ({
      ...d,
      recipientName: debtor.company ? `${debtor.name} / ${debtor.company}` : debtor.name,
      recipientEmail: debtor.email || d.recipientEmail,
      recipientAddress: addressParts.join("\n") || d.recipientAddress,
      dueDate: dueDate.toISOString().split("T")[0],
    }));
    setDebtorSearch("");
    setShowDebtorDropdown(false);
  }

  function resetAndGoBack() {
    setSelectedTable(null);
    setMethod("cash");
    setCashGiven("");
    setTip("");
    setSuccess(null);
    setEmailSent(false);
    setEmailSending(false);
    setPdfUrl(null);
    setPdfLoading(false);
    setDebtorSearch("");
    setShowDebtorDropdown(false);
    setShowDebtorOverlay(false);
    setDebtorOverlaySearch("");
    setSaveAsDebtor(false);
    setNewDebtorIban("");
    setSignatureData(null);
    setShowGiftCardDialog(false);
    setGiftCardCode("");
    setGiftCardAmount("");
    setGiftCardLookup(null);
    setScannedCode("");
    setGuestData({
      recipientName: "",
      recipientEmail: "",
      recipientAddress: "",
      dueDate: defaultDueDate(),
      additionalInfo: "",
      discountPercent: 0,
    });
  }

  // ── SUCCESS SCREEN ─────────────────────────────────────────────────────────
  if (success) {
    const isInvoice = method === "invoice";
    return (
      <div className="max-w-sm mx-auto text-center space-y-5 pt-8">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-emerald-700">
            {isInvoice ? "Rechnung erstellt!" : "Bezahlt!"}
          </h2>
          {isInvoice ? (
            <div className="mt-2 space-y-1">
              {success.invoiceNumber && (
                <p className="text-sm font-mono text-blue-600 font-semibold">{success.invoiceNumber}</p>
              )}
              <p className="text-muted-foreground text-sm">
                Schweizer QR-Rechnung über <strong>CHF {success.total.toFixed(2)}</strong> erstellt.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground mt-1">CHF {success.total.toFixed(2)} erhalten</p>
          )}
        </div>

        {success.tip > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-700 font-medium">Trinkgeld</p>
            <p className="text-2xl font-bold text-amber-600">CHF {success.tip.toFixed(2)}</p>
          </div>
        )}
        {success.change > 0 && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm text-blue-700 font-medium">Wechselgeld zurückgeben</p>
            <p className="text-4xl font-bold text-blue-700">CHF {success.change.toFixed(2)}</p>
          </div>
        )}

        {/* E-Mail-Versand-Bereich (nur bei Rechnung) */}
        {isInvoice && success.invoiceId && (
          <div className="rounded-xl border p-4 space-y-3 text-left">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-blue-500" />
              Rechnung per E-Mail senden
            </p>
            {emailSent ? (
              <div className="flex items-center gap-2 text-emerald-600 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                E-Mail erfolgreich versendet
              </div>
            ) : (
              <>
                {success.recipientEmail ? (
                  <p className="text-xs text-muted-foreground">
                    An: <span className="font-mono">{success.recipientEmail}</span>
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">
                    Keine E-Mail-Adresse hinterlegt – Rechnung kann trotzdem versendet werden, wenn eine Adresse in der Rechnung gespeichert ist.
                  </p>
                )}
                <Button
                  size="sm"
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                  onClick={handleSendEmail}
                  disabled={emailSending}
                >
                  <Send className="h-4 w-4" />
                  {emailSending ? "Wird gesendet..." : "Jetzt per E-Mail senden"}
                </Button>
              </>
            )}
          </div>
        )}

        {/* PDF-Vorschau-Button (nur bei Rechnung) */}
        {isInvoice && success.invoiceId && (
          <Button
            variant="outline"
            className="w-full gap-2 mb-1"
            onClick={handleOpenPdf}
            disabled={pdfLoading}
          >
            {pdfLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {pdfLoading ? "PDF wird generiert..." : pdfUrl ? "PDF erneut öffnen" : "PDF anzeigen"}
          </Button>
        )}

        {/* Treueprogramm-Registrierungs-CTA */}
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 p-4 text-left space-y-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-purple-500" />
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Treueprogramm</p>
          </div>
          {!showRegQr ? (
            <>
              <p className="text-xs text-muted-foreground">Kunden können sich jetzt für das Treueprogramm registrieren und Punkte sammeln.</p>
              <Button size="sm" variant="outline" className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-100" onClick={() => setShowRegQr(true)}>
                <QrCode className="h-4 w-4" />QR-Code anzeigen
              </Button>
            </>
          ) : (
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">Kunden scannt und registriert sich direkt</p>
              {regQrData ? (
                <img src={regQrData.qrDataUrl} alt="QR Registrierung" className="mx-auto w-36 h-36 rounded-lg border" />
              ) : (
                <div className="w-36 h-36 mx-auto rounded-lg bg-muted animate-pulse" />
              )}
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setShowRegQr(false)}>Ausblenden</Button>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {success.receiptData && !isInvoice && (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                if (selectedTable?.currentOrder?.id) {
                  printReceiptJob.mutate({
                    orderId: selectedTable.currentOrder.id,
                    paymentMethod: method,
                    amountPaid: parseFloat(cashGiven) || undefined,
                    tip: parseFloat(tip) || undefined,
                  });
                  toast.success("Bon wird gedruckt");
                }
              }}
            >
              <Printer className="h-4 w-4" /> Bon drucken
            </Button>
          )}
          <Button className="flex-1" onClick={resetAndGoBack}>
            Nächste Rechnung
          </Button>
        </div>
      </div>
    );
  }

  // ── TABLE SELECTION ────────────────────────────────────────────────────────
  if (!selectedTable) {
    return (
      <div className="space-y-5 max-w-2xl mx-auto">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600" /> Kassieren
          </h1>
          <p className="text-sm text-muted-foreground">{readyToPay.length} Tische mit offener Rechnung</p>
        </div>
        {isLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>}
        {isError && (
          <div className="p-6 text-center text-destructive border rounded-lg">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p className="font-medium">Daten konnten nicht geladen werden</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Erneut versuchen</Button>
          </div>
        )}
        {!isLoading && readyToPay.length === 0 && (
          <div className="p-10 text-center text-muted-foreground border rounded-lg">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Keine offenen Rechnungen</p>
          </div>
        )}
        <div className="space-y-3">
          {readyToPay.map((table) => {
            const order = table.currentOrder!;
            return (
              <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow border-blue-100"
                onClick={() => { setSelectedTable(table); setMethod("cash"); setCashGiven(""); setTip(""); setSuccess(null); setEmailSent(false); }}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{table.label}</p>
                    <p className="text-xs text-muted-foreground">Bestellung #{order.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">CHF {parseFloat(order.totalAmount ?? "0").toFixed(2)}</p>
                    <Badge className="text-xs bg-blue-100 text-blue-800">Offen</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ── PAYMENT SCREEN ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-4 max-w-sm mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={resetAndGoBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{selectedTable.label}</h1>
            <p className="text-xs text-muted-foreground">Bestellung #{selectedTable.currentOrder!.id}</p>
          </div>
        </div>

        {/* Total */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white p-5 text-center">
          <p className="text-sm opacity-80 mb-1">Zu bezahlen</p>
          <p className="text-4xl font-bold">CHF {total.toFixed(2)}</p>
          {tipVal > 0 && <p className="text-sm opacity-80 mt-1">+ CHF {tipVal.toFixed(2)} Trinkgeld = CHF {grandTotal.toFixed(2)}</p>}
        </div>

        {/* Payment methods */}
        <div className="grid grid-cols-4 gap-2">
          {PAY_METHODS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMethod(value); setCashGiven(""); }}
              className={cn(
                "h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-2 text-xs font-medium transition-all",
                method === value
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-border text-muted-foreground hover:border-blue-300"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Hinweis bei Rechnung */}
        {method === "invoice" && (
          <div className={`rounded-xl p-4 flex gap-3 ${!hasIban ? "bg-amber-50 border border-amber-200" : "bg-blue-50 border border-blue-200"}`}>
            {!hasIban
              ? <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              : <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />}
            <div className={`text-sm ${!hasIban ? "text-amber-800" : "text-blue-700"}`}>
              <p className="font-medium mb-1">Kauf auf Rechnung</p>
              <p className="text-xs opacity-80">
                {!hasIban
                  ? "Keine IBAN hinterlegt – Rechnung wird ohne QR-Code erstellt. Bankverbindung in den Einstellungen ergänzen."
                  : "Nach dem Kassieren öffnet sich ein Formular für die Debitor-Angaben. Eine Schweizer QR-Rechnung wird automatisch erstellt."}
              </p>
            </div>
          </div>
        )}

        {/* Cash: Betrag eingeben + Wechselgeld */}
        {method === "cash" && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Erhaltener Betrag (CHF)</label>
              <input
                type="number"
                inputMode="decimal"
                value={cashGiven}
                onChange={(e) => setCashGiven(e.target.value)}
                placeholder={grandTotal.toFixed(2)}
                className="w-full h-12 rounded-xl border-2 px-4 text-xl font-bold bg-background focus:border-blue-500 outline-none"
                style={{ fontSize: "20px" }}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {quickAmts.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setCashGiven(amt.toString())}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
                    parseFloat(cashGiven) === amt
                      ? "border-blue-500 bg-blue-100 text-blue-700"
                      : "border-border text-muted-foreground hover:border-blue-300"
                  )}
                >
                  CHF {amt}
                </button>
              ))}
            </div>
            {cashVal > 0 && (
              <div className={cn(
                "rounded-xl p-4 text-center transition-colors",
                changeRounded > 0 ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
              )}>
                {changeRounded > 0 ? (
                  <>
                    <p className="text-xs text-emerald-700 font-medium">Wechselgeld</p>
                    <p className="text-3xl font-bold text-emerald-700">CHF {changeRounded.toFixed(2)}</p>
                  </>
                ) : (
                  <p className="text-sm text-red-600 font-medium">
                    Zu wenig – noch CHF {(grandTotal - cashVal).toFixed(2)} fehlen
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Trinkgeld (nicht bei Rechnung) */}
        {method !== "invoice" && (
          <div>
            <label className="text-sm font-medium mb-1.5 block">Trinkgeld (optional)</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                inputMode="decimal"
                value={tip}
                onChange={(e) => setTip(e.target.value)}
                placeholder="0.00"
                className="flex-1 h-10 rounded-xl border px-3 text-sm bg-background focus:border-blue-500 outline-none"
                style={{ fontSize: "16px" }}
              />
              {[1, 2, 5].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTip(t.toString())}
                  className={cn(
                    "h-10 px-3 rounded-xl border text-sm font-medium transition-all",
                    parseFloat(tip) === t ? "border-amber-500 bg-amber-100 text-amber-700" : "border-border text-muted-foreground"
                  )}
                >
                  +{t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pay button */}
        <Button
          className={cn(
            "w-full h-14 text-lg font-bold",
            method === "invoice"
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-emerald-600 hover:bg-emerald-700"
          )}
          disabled={
            !canPay ||
            close.isPending ||
            createInvoiceFromOrder.isPending
          }
          onClick={handlePay}
        >
          {method === "invoice" ? (
            <>
              <FileText className="h-5 w-5 mr-2" />
              {createInvoiceFromOrder.isPending ? "Erstelle Rechnung..." : "Auf Rechnung abschliessen"}
            </>
          ) : (
            <>
              <CreditCard className="h-5 w-5 mr-2" />
              {close.isPending ? "Verarbeite..." : `CHF ${grandTotal.toFixed(2)} kassieren`}
            </>
          )}
        </Button>
        {method === "cash" && !canPay && cashVal > 0 && (
          <p className="text-xs text-center text-red-500">Betrag nicht ausreichend</p>
        )}

        {/* Treuepunkte-Aktionen */}
        <div className="grid grid-cols-2 gap-2 mb-1">
          <button
            type="button"
            onClick={() => { setLoyaltyMode("earn"); setLoyaltyEmail(""); setLoyaltyLookup(null); setShowLoyaltyDialog(true); }}
            className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-yellow-200 bg-yellow-50 text-yellow-700 text-sm font-medium hover:bg-yellow-100 transition-all"
          >
            <Star className="h-4 w-4" />
            Punkte sammeln
          </button>
          <button
            type="button"
            onClick={() => { setLoyaltyMode("redeem"); setLoyaltyEmail(""); setLoyaltyLookup(null); setLoyaltyRedeemPoints(""); setShowLoyaltyDialog(true); }}
            className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-orange-200 bg-orange-50 text-orange-700 text-sm font-medium hover:bg-orange-100 transition-all"
          >
            <Gift className="h-4 w-4" />
            Punkte einlösen
          </button>
        </div>

        {/* Geschenkkarten-Aktionen */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setGiftCardRedeemMode("redeem"); setGiftCardCode(""); setGiftCardLookup(null); setShowGiftCardDialog(true); }}
            className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-purple-200 bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 transition-all"
          >
            <Gift className="h-4 w-4" />
            GK einlösen
          </button>
          <button
            type="button"
            onClick={() => { setGiftCardRedeemMode("sell"); setGiftCardCode(""); setGiftCardAmount(""); setGiftCardLookup(null); setShowGiftCardDialog(true); }}
            className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-all"
          >
            <Plus className="h-4 w-4" />
            GK verkaufen
          </button>
        </div>
      </div>

      {/* ── GESCHENKKARTEN-DIALOG */}
      <Dialog open={showGiftCardDialog} onOpenChange={(o) => { setShowGiftCardDialog(o); if (!o) { setGiftCardLookup(null); setGiftCardCode(""); setGiftCardAmount(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {giftCardRedeemMode === "redeem" ? (
                <><Gift className="h-5 w-5 text-purple-600" /> Geschenkkarte einlösen</>
              ) : (
                <><Plus className="h-5 w-5 text-emerald-600" /> Geschenkkarte verkaufen</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {giftCardRedeemMode === "redeem" ? (
              <>
                <div className="space-y-2">
                  <Label>Gutschein-Code</Label>
                  <div className="flex gap-2">
                    <Input
                      value={giftCardCode}
                      onChange={(e) => { setGiftCardCode(e.target.value.toUpperCase()); setGiftCardLookup(null); }}
                      placeholder="z.B. X64D-E3HM"
                      className="font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border-2 border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
                    >
                      <ScanLine className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {giftCardLookup && (
                  <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 space-y-1">
                    <p className="text-xs text-purple-600 font-medium">Gefunden: {giftCardLookup.issuedTo || giftCardLookup.code}</p>
                    <p className="text-2xl font-bold text-purple-700">CHF {parseFloat(giftCardLookup.remainingBalance).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Restguthaben</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Einzulösender Betrag (CHF)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={giftCardAmount}
                    onChange={(e) => setGiftCardAmount(e.target.value)}
                    placeholder={giftCardLookup ? parseFloat(giftCardLookup.remainingBalance).toFixed(2) : total.toFixed(2)}
                  />
                  {giftCardLookup && (
                    <div className="flex gap-2 flex-wrap">
                      {[total, parseFloat(giftCardLookup.remainingBalance)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                        <button key={v} type="button" onClick={() => setGiftCardAmount(Math.min(v, parseFloat(giftCardLookup.remainingBalance)).toFixed(2))}
                          className="px-3 py-1 rounded-lg border text-xs font-medium border-purple-200 text-purple-700 hover:bg-purple-50">
                          CHF {Math.min(v, parseFloat(giftCardLookup.remainingBalance)).toFixed(2)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Betrag (CHF) *</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={giftCardAmount}
                    onChange={(e) => setGiftCardAmount(e.target.value)}
                    placeholder="50.00"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {[20, 50, 100, 200].map((v) => (
                      <button key={v} type="button" onClick={() => setGiftCardAmount(v.toString())}
                        className={cn("px-3 py-1 rounded-lg border text-xs font-medium transition-all",
                          parseFloat(giftCardAmount) === v ? "border-emerald-500 bg-emerald-100 text-emerald-700" : "border-border text-muted-foreground hover:border-emerald-300")}>
                        CHF {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Ausgestellt für (optional)</Label>
                  <Input value={giftCardCode} onChange={(e) => setGiftCardCode(e.target.value)} placeholder="Name des Beschenkten" />
                </div>
                <div className="space-y-2">
                  <Label>Zahlungsart</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["cash", "card", "twint"] as const).map((m) => (
                      <button key={m} type="button"
                        onClick={() => setGiftCardRedeemMode(m as any)}
                        className={cn("h-9 rounded-lg border text-xs font-medium transition-all",
                          (giftCardRedeemMode as string) === m ? "border-emerald-500 bg-emerald-100 text-emerald-700" : "border-border text-muted-foreground")}>
                        {m === "cash" ? "Bar" : m === "card" ? "Karte" : "TWINT"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowGiftCardDialog(false)}>Abbrechen</Button>
            {giftCardRedeemMode === "redeem" ? (
              <>
                {!giftCardLookup ? (
                  <Button
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={!giftCardCode.trim()}
                    onClick={async () => {
                      try {
                        const res = await utils.voucher.checkGiftCardBalance.fetch({ code: giftCardCode.trim().toUpperCase() });
                        setGiftCardLookup({ id: res.voucher.id, code: res.voucher.code, remainingBalance: res.voucher.remainingBalance, issuedTo: res.voucher.issuedTo });
                        if (!res.valid) toast.warning("Achtung: Karte nicht einlösbar (abgelaufen/storniert/kein Guthaben)");
                      } catch (e: any) { toast.error(e.message); }
                    }}
                  >
                    Guthaben prüfen
                  </Button>
                ) : (
                  <Button
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={!giftCardAmount || parseFloat(giftCardAmount) <= 0 || redeemGiftCard.isPending}
                    onClick={() => redeemGiftCard.mutate({
                      code: giftCardCode.trim().toUpperCase(),
                      amountToRedeem: parseFloat(giftCardAmount),
                      orderId: selectedTable?.currentOrder?.id,
                      note: `Einlösung an Kasse (Tisch ${selectedTable?.label ?? ""})`
                    })}
                  >
                    {redeemGiftCard.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Einlösen"}
                  </Button>
                )}
              </>
            ) : (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!giftCardAmount || parseFloat(giftCardAmount) <= 0 || sellGiftCard.isPending}
                onClick={() => sellGiftCard.mutate({
                  category: "gift_card",
                  type: "fixed",
                  value: parseFloat(giftCardAmount),
                  validFrom: new Date().toISOString().split("T")[0],
                  issuedTo: giftCardCode.trim() || undefined,
                  purchasePaymentMethod: (giftCardRedeemMode as string) === "card" ? "card" : (giftCardRedeemMode as string) === "twint" ? "twint" : "cash",
                })}
              >
                {sellGiftCard.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verkaufen & ausstellen"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR-Scanner */}
      {showScanner && <VoucherScanner onScan={handleScanResult} onClose={() => setShowScanner(false)} />}

      {/* ── GASTDATEN-DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Rechnungsempfänger erfassen
            </DialogTitle>
            <DialogDescription>
              Angaben des Gastes / Debitors eingeben.
              Eine Schweizer QR-Rechnung über{" "}
              <strong>CHF {total.toFixed(2)}</strong> wird automatisch erstellt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Debitor aus Stamm auswählen */}
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <BookUser className="h-3.5 w-3.5" />
                Aus Debitorenstamm auswählen (optional)
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => { setDebtorOverlaySearch(""); setShowInvoiceDialog(false); setTimeout(() => setShowDebtorOverlay(true), 200); }}
              >
                <Plus className="h-3.5 w-3.5" />
                Debitor auswählen
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-name" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Name / Firma <span className="text-red-500">*</span>
              </Label>
              <Input
                id="inv-name"
                placeholder="Max Mustermann / Muster AG"
                value={guestData.recipientName}
                onChange={(e) => setGuestData(d => ({ ...d, recipientName: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                E-Mail (für Rechnungsversand)
              </Label>
              <Input
                id="inv-email"
                type="email"
                placeholder="max@beispiel.ch"
                value={guestData.recipientEmail}
                onChange={(e) => setGuestData(d => ({ ...d, recipientEmail: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-address" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Adresse
              </Label>
              <Textarea
                id="inv-address"
                placeholder={"Musterstrasse 1\n8000 Zürich"}
                value={guestData.recipientAddress}
                onChange={(e) => setGuestData(d => ({ ...d, recipientAddress: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-due" className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Zahlungsfrist
              </Label>
              <Input
                id="inv-due"
                type="text"
                inputMode="numeric"
                placeholder="TT.MM.JJJJ"
                value={guestData.dueDate ? (() => { const [y,m,d] = guestData.dueDate.split('-'); return `${d}.${m}.${y}`; })() : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = raw.split('.');
                  if (parts.length === 3 && parts[2].length === 4) {
                    setGuestData(d => ({ ...d, dueDate: `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` }));
                  } else {
                    setGuestData(d => ({ ...d, dueDate: e.target.value }));
                  }
                }}
                style={{ fontSize: '16px' }}
              />
              <div className="flex gap-1.5 mt-1">
                {[10, 30, 60].map(days => (
                  <button
                    key={days}
                    type="button"
                    className="flex-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-xs py-1 font-medium transition-colors"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + days);
                      setGuestData(prev => ({ ...prev, dueDate: d.toISOString().split('T')[0] }));
                    }}
                  >
                    +{days} Tage
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-discount">Rabatt (%)</Label>
              <Input
                id="inv-discount"
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="0"
                value={guestData.discountPercent || ""}
                onChange={(e) => setGuestData(d => ({ ...d, discountPercent: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-info" className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Mitteilung (max. 140 Zeichen)
              </Label>
              <Input
                id="inv-info"
                maxLength={140}
                placeholder="z.B. Tisch 5, Geschäftsessen"
                value={guestData.additionalInfo}
                onChange={(e) => setGuestData(d => ({ ...d, additionalInfo: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground text-right">{guestData.additionalInfo.length}/140</p>
            </div>

            {guestData.discountPercent > 0 && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                <p className="font-medium">Rabatt: {guestData.discountPercent}%</p>
                <p>Rechnungsbetrag: CHF {(total * (1 - guestData.discountPercent / 100)).toFixed(2)}</p>
              </div>
            )}

            {/* Als Debitor speichern */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveAsDebtor}
                  onChange={e => setSaveAsDebtor(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                />
                <span className="text-sm font-medium text-blue-800">Als Debitor im Stamm speichern</span>
              </label>
              {saveAsDebtor && (
                <div className="space-y-1">
                  <Label className="text-xs text-blue-700">IBAN <span className="text-red-500">*</span></Label>
                  <Input
                    value={newDebtorIban}
                    onChange={e => setNewDebtorIban(e.target.value)}
                    placeholder="CH56 0483 5012 3456 7800 9"
                    className={`font-mono text-sm h-8 ${
                      newDebtorIban && /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(newDebtorIban.replace(/\s/g, "").toUpperCase())
                        ? "border-green-400"
                        : newDebtorIban ? "border-red-400" : ""
                    }`}
                  />
                  {newDebtorIban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(newDebtorIban.replace(/\s/g, "").toUpperCase()) && (
                    <p className="text-xs text-red-500">Ungültiges IBAN-Format (z.B. CH56 0483 5012 3456 7800 9)</p>
                  )}
                  {newDebtorIban && /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(newDebtorIban.replace(/\s/g, "").toUpperCase()) && (
                    <p className="text-xs text-green-600">✓ Gültiges IBAN-Format</p>
                  )}
                </div>
              )}
            </div>

            {/* Digitale Unterschrift */}
            <div className={`rounded-lg border p-3 ${requireSignature ? 'border-orange-300 bg-orange-50/50' : 'border-gray-200 bg-gray-50/50'}`}>
              {requireSignature && !signatureData && (
                <div className="flex items-center gap-2 mb-2 text-orange-700 text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Unterschrift obligatorisch — ohne Unterschrift kann nicht abgeschlossen werden
                </div>
              )}
              <SignaturePad
                label="Unterschrift des Gastes"
                onSave={(data) => setSignatureData(data)}
                onClear={() => setSignatureData(null)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowInvoiceDialog(false)}
              disabled={createInvoiceFromOrder.isPending}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleInvoiceSubmit}
              disabled={!guestData.recipientName.trim() || createInvoiceFromOrder.isPending || (requireSignature && !signatureData)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createInvoiceFromOrder.isPending ? (
                "Erstelle Rechnung..."
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Rechnung erstellen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debitor-Auswahl-Overlay */}
      {showDebtorOverlay && (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDebtorOverlay(false); }}
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDebtorOverlay(false)} />
          <div className="relative z-10 bg-background rounded-t-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="px-4 pt-4 pb-3 border-b shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-semibold">
                  <BookUser className="h-5 w-5 text-blue-600" />
                  Debitor auswählen
                </div>
                <button
                  type="button"
                  className="rounded-full p-1 hover:bg-muted"
                  onClick={() => { setShowDebtorOverlay(false); setTimeout(() => setShowInvoiceDialog(true), 50); }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Suche nach Name, Firma, E-Mail..."
                  value={debtorOverlaySearch}
                  onChange={(e) => setDebtorOverlaySearch(e.target.value)}
                  className="pl-8"
                  autoComplete="off"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allDebtorsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : allDebtors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BookUser className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">{debtorOverlaySearch ? 'Kein Debitor gefunden' : 'Noch keine Debitoren erfasst'}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {allDebtors.map((d: typeof allDebtors[number]) => (
                    <button
                      key={d.id}
                      type="button"
                      className="w-full text-left px-4 py-3.5 hover:bg-muted/60 active:bg-muted transition-colors"
                      onClick={() => {
                        fillFromDebtor(d);
                        setShowDebtorOverlay(false);
                        setTimeout(() => setShowInvoiceDialog(true), 50);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{d.name}{d.company ? ` / ${d.company}` : ''}</div>
                          {d.email && <div className="text-xs text-muted-foreground mt-0.5">{d.email}</div>}
                          {d.address && <div className="text-xs text-muted-foreground">{d.address}{d.zip ? `, ${d.zip} ${d.city}` : ''}</div>}
                        </div>
                        <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                          {d.name.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TREUEPUNKTE-DIALOG */}
      <Dialog open={showLoyaltyDialog} onOpenChange={(o) => { setShowLoyaltyDialog(o); if (!o) { setLoyaltyLookup(null); setLoyaltyEmail(""); setLoyaltyRedeemPoints(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {loyaltyMode === "earn" ? (
                <><Star className="h-5 w-5 text-yellow-500" /> Punkte sammeln</>
              ) : (
                <><Gift className="h-5 w-5 text-orange-500" /> Punkte einlösen</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!loyaltyLookup ? (
              <>
                <div className="space-y-2">
                  <Label>Kunden-E-Mail oder QR-Code</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="gast@beispiel.ch"
                      value={loyaltyEmail}
                      onChange={(e) => setLoyaltyEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && loyaltyEmail && handleLoyaltySearch()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoyaltyScanner(true)}
                      className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border-2 border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                      title="QR-Code scannen"
                    >
                      <ScanLine className="h-4 w-4" />
                    </button>
                    <Button
                      size="sm"
                      onClick={handleLoyaltySearch}
                      disabled={!loyaltyEmail || loyaltySearching}
                    >
                      {loyaltySearching ? "..." : "Suchen"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Gast gibt seine E-Mail an oder zeigt seinen QR-Code – das System findet seine Treuekarte.
                </p>
              </>
            ) : (
              <>
                <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <p className="font-semibold text-yellow-900">{loyaltyLookup.firstName} {loyaltyLookup.lastName}</p>
                  <p className="text-sm text-yellow-700">{loyaltyLookup.totalPoints.toLocaleString("de-CH")} Punkte Guthaben</p>
                </div>

                {loyaltyMode === "earn" ? (
                  <div className="space-y-2">
                    <Label>Rechnungsbetrag (CHF)</Label>
                    <p className="text-xs text-muted-foreground">
                      Punkte werden automatisch basierend auf CHF {total.toFixed(2)} berechnet.
                    </p>
                    <Button
                      className="w-full bg-yellow-500 hover:bg-yellow-600 text-white"
                      onClick={() => earnLoyaltyPoints.mutate({
                        customerId: loyaltyLookup.id,
                        orderId: selectedTable?.currentOrder?.id,
                        orderAmount: total,
                      })}
                      disabled={earnLoyaltyPoints.isPending}
                    >
                      {earnLoyaltyPoints.isPending ? "..." : `Punkte für CHF ${total.toFixed(2)} gutschreiben`}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Prämien-Einlösung */}
                    {(availableRewards ?? []).filter((r: any) => r.isActive && loyaltyLookup.totalPoints >= r.pointsCost).length > 0 && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1"><Gift className="h-3.5 w-3.5 text-purple-500" /> Prämie einlösen</Label>
                        <div className="space-y-1.5">
                          {(availableRewards ?? []).filter((r: any) => r.isActive && loyaltyLookup.totalPoints >= r.pointsCost).map((r: any) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setSelectedRewardId(selectedRewardId === r.id ? null : r.id)}
                              className={`w-full text-left p-2.5 rounded-lg border-2 transition-colors text-sm ${
                                selectedRewardId === r.id
                                  ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30"
                                  : "border-border hover:border-purple-300 bg-card"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{r.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">{Number(r.pointsCost).toLocaleString("de-CH")} Pkt.</span>
                              </div>
                              {r.value && <p className="text-xs text-green-600 mt-0.5">CHF {parseFloat(r.value).toFixed(2)} Rabatt</p>}
                            </button>
                          ))}
                        </div>
                        {selectedRewardId && (
                          <Button
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={() => redeemRewardMutation.mutate({
                              token: loyaltyLookup.token ?? "",
                              rewardId: selectedRewardId,
                            })}
                            disabled={redeemRewardMutation.isPending}
                          >
                            {redeemRewardMutation.isPending ? "Einlösen..." : `Prämie einlösen`}
                          </Button>
                        )}
                        <div className="flex items-center gap-2 my-1">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground">oder</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      </div>
                    )}

                    {/* Freie Punkte-Einlösung */}
                    <div className="space-y-2">
                      <Label>Punkte frei einlösen</Label>
                      <Input
                        type="number"
                        min="1"
                        max={loyaltyLookup.totalPoints}
                        placeholder={`Max. ${loyaltyLookup.totalPoints} Punkte`}
                        value={loyaltyRedeemPoints}
                        onChange={(e) => setLoyaltyRedeemPoints(e.target.value)}
                      />
                      {loyaltyRedeemPoints && !isNaN(parseInt(loyaltyRedeemPoints)) && (
                        <p className="text-xs text-orange-600 font-medium">
                          = CHF {(parseInt(loyaltyRedeemPoints) / 100).toFixed(2)} Rabatt
                        </p>
                      )}
                    </div>
                    <Button
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                      onClick={() => redeemLoyaltyPoints.mutate({
                        customerId: loyaltyLookup.id,
                        pointsToRedeem: parseInt(loyaltyRedeemPoints),
                        orderId: selectedTable?.currentOrder?.id,
                      })}
                      disabled={!loyaltyRedeemPoints || isNaN(parseInt(loyaltyRedeemPoints)) || redeemLoyaltyPoints.isPending}
                    >
                      {redeemLoyaltyPoints.isPending ? "..." : "Punkte einlösen"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* QR-Scanner für Treuekarte */}
      {showLoyaltyScanner && (
        <VoucherScanner
          onScan={async (raw) => {
            setShowLoyaltyScanner(false);
            // Der QR-Code enthält den Token (z.B. aus /loyalty/:token URL oder direkt)
            const token = raw.includes("/loyalty/") ? raw.split("/loyalty/").pop()?.split("?")[0] ?? raw : raw;
            setLoyaltyEmail(token);
            // Direkt suchen
            const res = await trpc.useUtils().loyalty.lookupCustomer.fetch({ query: token });
            if (res && res.length === 1) {
              // Vibrations-Feedback (kurz-kurz-lang = Erfolg)
              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                navigator.vibrate([80, 40, 80, 40, 200]);
              }
              toast.success(`✓ ${res[0].firstName} ${res[0].lastName ?? ""} – ${res[0].totalPoints.toLocaleString("de-CH")} Punkte`, { duration: 3000 });
              setLoyaltyLookup(res[0]);
            } else if (res && res.length > 1) {
              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                navigator.vibrate([80, 40, 80]);
              }
              setLoyaltySearchResult(res);
            } else {
              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                navigator.vibrate([200, 100, 200]); // Fehler-Muster
              }
              toast.error("Kein Kunde mit diesem QR-Code gefunden.");
            }
          }}
          onClose={() => setShowLoyaltyScanner(false)}
        />
      )}
    </>
  );
}
