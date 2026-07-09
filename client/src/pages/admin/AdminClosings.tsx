/**
 * AdminClosings.tsx
 * Tagesabschluss-Verwaltung mit professionellem 9-Sektionen-Bericht
 */

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  BookCheck, Clock, Settings, TrendingUp, AlertCircle, RefreshCw,
  CheckCircle2, FileText, Download, ChevronRight, Package, Users,
  CreditCard, Banknote, Smartphone, Receipt, Star, ShoppingCart,
  AlertTriangle, X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface VatLine {
  rate: string;
  label: string;
  netBase: string;
  vatAmount: string;
  grossAmount: string;
}

interface PaymentLine {
  method: string;
  count: number;
  amount: string;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: string;
}

interface ClosingReport {
  header: {
    restaurantName: string;
    address: string;
    vatNumber: string;
    closingId: number;
    closingNumber: string;
    closingDate: string;
    performedByName: string;
    mode: "auto" | "manual";
    generatedAt: string;
  };
  revenue: {
    grossRevenue: string;
    discounts: string;
    netRevenue: string;
    tips: string;
    totalWithTips: string;
  };
  vat: {
    lines: VatLine[];
    totalNetBase: string;
    totalVatAmount: string;
    totalGross: string;
  };
  payments: {
    lines: PaymentLine[];
    total: string;
  };
  cashBalance: {
    cashExpected: string;
    cashActual: string;
    difference: string;
    hasDifference: boolean;
  };
  stats: {
    totalOrders: number;
    cancelledOrders: number;
    totalGuests: number;
    totalTables: number;
    avgRevenuePerTable: string;
    avgRevenuePerGuest: string;
    avgOrderValue: string;
    openingTime: string | null;
    closingTime: string | null;
  };
  topProducts: TopProduct[];
  inventory: {
    totalConsumedValue: string;
    totalMovements: number;
    grossMargin: string;
    grossMarginPercent: string;
  };
  cancellations: {
    count: number;
    totalValue: string;
  };
  cardProviderBreakdown?: {
    sumup: { count: number; total: string };
    paytec: { count: number; total: string };
    nexi: { count: number; total: string };
    totalCard: string;
  };
  notes: string | null;
}

// ─── Konstanten ───────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: "Europe/Zurich", label: "Europa/Zürich (CET/CEST)" },
  { value: "Europe/Berlin", label: "Europa/Berlin (CET/CEST)" },
  { value: "Europe/Vienna", label: "Europa/Wien (CET/CEST)" },
  { value: "Europe/Paris", label: "Europa/Paris (CET/CEST)" },
  { value: "Europe/London", label: "Europa/London (GMT/BST)" },
  { value: "UTC", label: "UTC" },
];

const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function formatCHF(value: string | number | null | undefined): string {
  const n = parseFloat(String(value ?? "0"));
  return `CHF ${n.toFixed(2)}`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "–";
  return new Date(d).toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(d: string | null | undefined): string {
  if (!d) return "–";
  return new Date(d).toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function paymentIcon(method: string) {
  if (method.toLowerCase().includes("bar")) return <Banknote className="h-4 w-4 text-green-600" />;
  if (method.toLowerCase().includes("twint")) return <Smartphone className="h-4 w-4 text-blue-600" />;
  if (method.toLowerCase().includes("kreditkarte") || method.toLowerCase().includes("ec")) return <CreditCard className="h-4 w-4 text-purple-600" />;
  return <Receipt className="h-4 w-4 text-gray-500" />;
}

// ─── PDF-Generierung (Browser-Print) ─────────────────────────────────────────

function printReport(report: ClosingReport) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast.error("Popup blockiert – bitte Popup-Blocker deaktivieren"); return; }

  const diffColor = parseFloat(report.cashBalance.difference) < 0 ? "#dc2626" : parseFloat(report.cashBalance.difference) > 0 ? "#16a34a" : "#374151";
  const diffSign = parseFloat(report.cashBalance.difference) > 0 ? "+" : "";

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>Tagesabschluss ${report.header.closingNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; padding: 24px; }
    h1 { font-size: 18px; font-weight: bold; margin-bottom: 2px; }
    h2 { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin: 16px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #111; }
    .header-left p { color: #555; font-size: 10px; line-height: 1.6; }
    .header-right { text-align: right; }
    .header-right .closing-no { font-size: 16px; font-weight: bold; color: #ea580c; }
    .header-right p { font-size: 10px; color: #555; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    th { background: #f3f4f6; text-align: left; padding: 5px 8px; font-size: 10px; font-weight: 600; color: #374151; }
    td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    td.right { text-align: right; }
    td.bold { font-weight: bold; }
    .total-row td { background: #f9fafb; font-weight: bold; border-top: 1px solid #ddd; }
    .highlight-row td { background: #fff7ed; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .diff-positive { color: #16a34a; font-weight: bold; }
    .diff-negative { color: #dc2626; font-weight: bold; }
    .diff-zero { color: #374151; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .badge-auto { background: #e0f2fe; color: #0369a1; }
    .badge-manual { background: #f3f4f6; color: #374151; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 9px; color: #888; }
    .sig-line { margin-top: 32px; display: flex; gap: 48px; }
    .sig-line div { flex: 1; border-top: 1px solid #555; padding-top: 4px; font-size: 9px; color: #555; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <!-- 1. Kopfzeile -->
  <div class="header">
    <div class="header-left">
      <h1>${report.header.restaurantName}</h1>
      <p>${report.header.address}</p>
      ${report.header.vatNumber ? `<p>MWST-Nr.: ${report.header.vatNumber}</p>` : ""}
    </div>
    <div class="header-right">
      <div class="closing-no">${report.header.closingNumber}</div>
      <p>Datum: ${formatDateShort(report.header.closingDate)}</p>
      <p>Kassierer: ${report.header.performedByName}</p>
      <p>Modus: <span class="badge ${report.header.mode === "auto" ? "badge-auto" : "badge-manual"}">${report.header.mode === "auto" ? "Automatisch" : "Manuell"}</span></p>
      <p style="margin-top:4px;font-size:9px;color:#aaa">Erstellt: ${formatDateShort(report.header.generatedAt)}</p>
    </div>
  </div>

  <!-- 2. Umsatz-Übersicht -->
  <h2>2. Umsatz-Übersicht</h2>
  <table>
    <tr><td>Bruttoumsatz (inkl. MWST)</td><td class="right bold">${formatCHF(report.revenue.grossRevenue)}</td></tr>
    <tr><td>Rabatte / Stornierungen</td><td class="right">– ${formatCHF(report.revenue.discounts)}</td></tr>
    <tr><td>Nettoumsatz (exkl. MWST)</td><td class="right">${formatCHF(report.revenue.netRevenue)}</td></tr>
    <tr><td>Trinkgeld</td><td class="right">${formatCHF(report.revenue.tips)}</td></tr>
    <tr class="total-row"><td>Total inkl. Trinkgeld</td><td class="right">${formatCHF(report.revenue.totalWithTips)}</td></tr>
  </table>

  <div class="grid2">
    <div>
      <!-- 3. MWST-Aufschlüsselung -->
      <h2>3. MWST-Aufschlüsselung</h2>
      <table>
        <tr><th>Steuersatz</th><th class="right">Netto</th><th class="right">MWST</th><th class="right">Brutto</th></tr>
        ${report.vat.lines.map(l => `
        <tr>
          <td>${l.label}</td>
          <td class="right">${formatCHF(l.netBase)}</td>
          <td class="right">${formatCHF(l.vatAmount)}</td>
          <td class="right">${formatCHF(l.grossAmount)}</td>
        </tr>`).join("")}
        <tr class="total-row">
          <td>Total</td>
          <td class="right">${formatCHF(report.vat.totalNetBase)}</td>
          <td class="right">${formatCHF(report.vat.totalVatAmount)}</td>
          <td class="right">${formatCHF(report.vat.totalGross)}</td>
        </tr>
      </table>

      <!-- 4. Zahlungsarten -->
      <h2>4. Zahlungsarten</h2>
      <table>
        <tr><th>Zahlungsart</th><th class="right">Anz.</th><th class="right">Betrag</th></tr>
        ${report.payments.lines.map(l => `
        <tr>
          <td>${l.method}</td>
          <td class="right">${l.count}</td>
          <td class="right">${formatCHF(l.amount)}</td>
        </tr>`).join("")}
        <tr class="total-row">
          <td>Total</td><td class="right">–</td>
          <td class="right">${formatCHF(report.payments.total)}</td>
        </tr>
      </table>
    </div>

    <div>
      <!-- 5. Kassendifferenz -->
      <h2>5. Kassendifferenz</h2>
      <table>
        <tr><td>Soll (laut System)</td><td class="right">${formatCHF(report.cashBalance.cashExpected)}</td></tr>
        <tr><td>Ist (gezählt)</td><td class="right">${formatCHF(report.cashBalance.cashActual)}</td></tr>
        <tr class="total-row">
          <td>Differenz</td>
          <td class="right" style="color:${diffColor}">${diffSign}${formatCHF(report.cashBalance.difference)}</td>
        </tr>
      </table>

      <!-- 6. Statistiken -->
      <h2>6. Bestellungs-Statistik</h2>
      <table>
        <tr><td>Bestellungen</td><td class="right bold">${report.stats.totalOrders}</td></tr>
        <tr><td>Stornierungen</td><td class="right">${report.stats.cancelledOrders}</td></tr>
        <tr><td>Gäste</td><td class="right">${report.stats.totalGuests}</td></tr>
        <tr><td>Tische bedient</td><td class="right">${report.stats.totalTables}</td></tr>
        <tr><td>Ø Umsatz / Tisch</td><td class="right">${formatCHF(report.stats.avgRevenuePerTable)}</td></tr>
        <tr><td>Ø Umsatz / Gast</td><td class="right">${formatCHF(report.stats.avgRevenuePerGuest)}</td></tr>
        <tr><td>Ø Bestellwert</td><td class="right">${formatCHF(report.stats.avgOrderValue)}</td></tr>
        ${report.stats.openingTime ? `<tr><td>Erste Bestellung</td><td class="right">${formatDateShort(report.stats.openingTime)}</td></tr>` : ""}
        ${report.stats.closingTime ? `<tr><td>Letzte Bestellung</td><td class="right">${formatDateShort(report.stats.closingTime)}</td></tr>` : ""}
      </table>
    </div>
  </div>

  <!-- 7. Top-Produkte -->
  ${report.topProducts.length > 0 ? `
  <h2>7. Top-Produkte (nach Menge)</h2>
  <table>
    <tr><th>#</th><th>Artikel</th><th class="right">Menge</th><th class="right">Umsatz</th></tr>
    ${report.topProducts.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td class="right">${p.quantity}×</td>
      <td class="right">${formatCHF(p.revenue)}</td>
    </tr>`).join("")}
  </table>` : ""}

  <!-- 8. Lagerabzüge -->
  <h2>8. Wareneinsatz / Lagerabzüge</h2>
  <table>
    <tr><td>Wareneinsatz (Lagerverbrauch)</td><td class="right">${formatCHF(report.inventory.totalConsumedValue)}</td></tr>
    <tr><td>Anzahl Lagerbewegungen</td><td class="right">${report.inventory.totalMovements}</td></tr>
    <tr><td>Rohertrag (Bruttomarge)</td><td class="right bold">${formatCHF(report.inventory.grossMargin)}</td></tr>
    <tr class="total-row"><td>Bruttomarge %</td><td class="right">${report.inventory.grossMarginPercent}%</td></tr>
  </table>

  <!-- 9. Stornierungen -->
  <h2>9. Stornierungen</h2>
  <table>
    <tr><td>Anzahl stornierte Bestellungen</td><td class="right">${report.cancellations.count}</td></tr>
    <tr><td>Stornierter Wert</td><td class="right">${formatCHF(report.cancellations.totalValue)}</td></tr>
  </table>

  <!-- 10. Kartenzahlungen nach Terminal-Anbieter -->
  ${report.cardProviderBreakdown ? `
  <h2>10. Kartenzahlungen nach Terminal-Anbieter</h2>
  <table>
    <tr><th>Anbieter</th><th class="right">Transaktionen</th><th class="right">Betrag</th></tr>
    ${report.cardProviderBreakdown.sumup.count > 0 ? `<tr><td>&#9679; SumUp</td><td class="right">${report.cardProviderBreakdown.sumup.count}</td><td class="right">${formatCHF(report.cardProviderBreakdown.sumup.total)}</td></tr>` : ""}
    ${report.cardProviderBreakdown.paytec.count > 0 ? `<tr><td>&#9679; PayTec</td><td class="right">${report.cardProviderBreakdown.paytec.count}</td><td class="right">${formatCHF(report.cardProviderBreakdown.paytec.total)}</td></tr>` : ""}
    ${report.cardProviderBreakdown.nexi.count > 0 ? `<tr><td>&#9679; Nexi</td><td class="right">${report.cardProviderBreakdown.nexi.count}</td><td class="right">${formatCHF(report.cardProviderBreakdown.nexi.total)}</td></tr>` : ""}
    <tr class="total-row"><td>Total Terminal-Zahlungen</td><td class="right">${report.cardProviderBreakdown.sumup.count + report.cardProviderBreakdown.paytec.count + report.cardProviderBreakdown.nexi.count}</td><td class="right">${formatCHF(report.cardProviderBreakdown.totalCard)}</td></tr>
  </table>` : ""}

  ${report.notes ? `
  <h2>Notizen</h2>
  <p style="padding:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;font-size:10px;">${report.notes}</p>` : ""}

  <!-- Unterschrift -->
  <div class="sig-line">
    <div>Unterschrift Kassierer / ${report.header.performedByName}</div>
    <div>Unterschrift Vorgesetzter</div>
    <div>Datum / Stempel</div>
  </div>

  <div class="footer">
    <span>${report.header.restaurantName} · ${report.header.address}</span>
    <span>Abschluss-Nr. ${report.header.closingNumber} · Erstellt ${formatDateShort(report.header.generatedAt)}</span>
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  w.document.write(html);
  w.document.close();
}

// ─── Bericht-Dialog ───────────────────────────────────────────────────────────

function ClosingReportDialog({
  closingId,
  onClose,
}: {
  closingId: number;
  onClose: () => void;
}) {
  const [cashActual, setCashActual] = useState("");
  const [cashSaved, setCashSaved] = useState(false);

  const { data: report, isLoading, error } = trpc.closingReport.getClosingReport.useQuery(
    { closingId, cashActual: cashSaved && cashActual ? cashActual : undefined },
    { enabled: true }
  );

  const saveCash = trpc.closingReport.saveCashActual.useMutation({
    onSuccess: (data) => {
      setCashSaved(true);
      toast.success(`Kassendifferenz gespeichert: ${parseFloat(data.difference) >= 0 ? "+" : ""}${data.difference} CHF`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      <p className="text-sm text-muted-foreground">Bericht wird geladen…</p>
    </div>
  );

  if (error || !report) return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-destructive">
      <AlertTriangle className="h-8 w-8" />
      <p className="font-medium">Bericht konnte nicht geladen werden</p>
      <p className="text-sm text-muted-foreground">{error?.message}</p>
    </div>
  );

  const r = report as ClosingReport;
  const diffNum = parseFloat(r.cashBalance.difference);
  const diffColor = diffNum < 0 ? "text-red-600" : diffNum > 0 ? "text-green-600" : "text-gray-700";
  const diffSign = diffNum > 0 ? "+" : "";

  return (
    <div className="space-y-6 text-sm max-h-[80vh] overflow-y-auto pr-1">

      {/* 1. Kopfzeile */}
      <div className="flex items-start justify-between p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <div>
          <p className="font-bold text-base">{r.header.restaurantName}</p>
          <p className="text-xs text-muted-foreground">{r.header.address}</p>
          {r.header.vatNumber && <p className="text-xs text-muted-foreground">MWST-Nr.: {r.header.vatNumber}</p>}
        </div>
        <div className="text-right">
          <p className="font-bold text-orange-700 text-lg">{r.header.closingNumber}</p>
          <p className="text-xs text-muted-foreground">{formatDateShort(r.header.closingDate)}</p>
          <p className="text-xs text-muted-foreground">Kassierer: {r.header.performedByName}</p>
          <Badge variant={r.header.mode === "auto" ? "secondary" : "outline"} className="text-xs mt-1">
            {r.header.mode === "auto" ? "Automatisch" : "Manuell"}
          </Badge>
        </div>
      </div>

      {/* 2. Umsatz-Übersicht */}
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5" /> 2. Umsatz-Übersicht
        </h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b"><td className="px-3 py-2">Bruttoumsatz (inkl. MWST)</td><td className="px-3 py-2 text-right font-semibold">{formatCHF(r.revenue.grossRevenue)}</td></tr>
              <tr className="border-b"><td className="px-3 py-2 text-muted-foreground">Rabatte / Stornierungen</td><td className="px-3 py-2 text-right text-muted-foreground">– {formatCHF(r.revenue.discounts)}</td></tr>
              <tr className="border-b"><td className="px-3 py-2">Nettoumsatz (exkl. MWST)</td><td className="px-3 py-2 text-right">{formatCHF(r.revenue.netRevenue)}</td></tr>
              <tr className="border-b"><td className="px-3 py-2">Trinkgeld</td><td className="px-3 py-2 text-right">{formatCHF(r.revenue.tips)}</td></tr>
              <tr className="bg-orange-50"><td className="px-3 py-2 font-bold">Total inkl. Trinkgeld</td><td className="px-3 py-2 text-right font-bold text-orange-700">{formatCHF(r.revenue.totalWithTips)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. MWST-Aufschlüsselung */}
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Receipt className="h-3.5 w-3.5" /> 3. MWST-Aufschlüsselung
        </h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold">Steuersatz</th>
                <th className="px-3 py-2 text-right text-xs font-semibold">Nettobasis</th>
                <th className="px-3 py-2 text-right text-xs font-semibold">MWST</th>
                <th className="px-3 py-2 text-right text-xs font-semibold">Brutto</th>
              </tr>
            </thead>
            <tbody>
              {r.vat.lines.map((l) => (
                <tr key={l.rate} className="border-t">
                  <td className="px-3 py-2">{l.label}</td>
                  <td className="px-3 py-2 text-right">{formatCHF(l.netBase)}</td>
                  <td className="px-3 py-2 text-right">{formatCHF(l.vatAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatCHF(l.grossAmount)}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-bold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{formatCHF(r.vat.totalNetBase)}</td>
                <td className="px-3 py-2 text-right">{formatCHF(r.vat.totalVatAmount)}</td>
                <td className="px-3 py-2 text-right">{formatCHF(r.vat.totalGross)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Zahlungsarten */}
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <CreditCard className="h-3.5 w-3.5" /> 4. Zahlungsarten
        </h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold">Zahlungsart</th>
                <th className="px-3 py-2 text-right text-xs font-semibold">Anzahl</th>
                <th className="px-3 py-2 text-right text-xs font-semibold">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {r.payments.lines.map((l) => (
                <tr key={l.method} className="border-t">
                  <td className="px-3 py-2 flex items-center gap-2">{paymentIcon(l.method)} {l.method}</td>
                  <td className="px-3 py-2 text-right">{l.count}</td>
                  <td className="px-3 py-2 text-right">{formatCHF(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-bold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">–</td>
                <td className="px-3 py-2 text-right">{formatCHF(r.payments.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4b. Kartenzahlungs-Aufschlüsselung nach Anbieter */}
      {r.cardProviderBreakdown && (
        <div>
          <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <CreditCard className="h-3.5 w-3.5" /> 4b. Kartenzahlungen nach Terminal-Anbieter
          </h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Anbieter</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Transaktionen</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {r.cardProviderBreakdown.sumup.count > 0 && (
                  <tr className="border-t">
                    <td className="px-3 py-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      SumUp
                    </td>
                    <td className="px-3 py-2 text-right">{r.cardProviderBreakdown.sumup.count}</td>
                    <td className="px-3 py-2 text-right">{formatCHF(r.cardProviderBreakdown.sumup.total)}</td>
                  </tr>
                )}
                {r.cardProviderBreakdown.paytec.count > 0 && (
                  <tr className="border-t">
                    <td className="px-3 py-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      PayTec
                    </td>
                    <td className="px-3 py-2 text-right">{r.cardProviderBreakdown.paytec.count}</td>
                    <td className="px-3 py-2 text-right">{formatCHF(r.cardProviderBreakdown.paytec.total)}</td>
                  </tr>
                )}
                {r.cardProviderBreakdown.nexi.count > 0 && (
                  <tr className="border-t">
                    <td className="px-3 py-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
                      Nexi
                    </td>
                    <td className="px-3 py-2 text-right">{r.cardProviderBreakdown.nexi.count}</td>
                    <td className="px-3 py-2 text-right">{formatCHF(r.cardProviderBreakdown.nexi.total)}</td>
                  </tr>
                )}
                {r.cardProviderBreakdown.sumup.count === 0 && r.cardProviderBreakdown.paytec.count === 0 && r.cardProviderBreakdown.nexi.count === 0 && (
                  <tr className="border-t">
                    <td colSpan={3} className="px-3 py-2 text-center text-muted-foreground text-xs">Keine Terminal-Transaktionen für diesen Tag</td>
                  </tr>
                )}
                <tr className="border-t bg-muted/30 font-bold">
                  <td className="px-3 py-2">Total Terminal-Zahlungen</td>
                  <td className="px-3 py-2 text-right">
                    {r.cardProviderBreakdown.sumup.count + r.cardProviderBreakdown.paytec.count + r.cardProviderBreakdown.nexi.count}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCHF(r.cardProviderBreakdown.totalCard)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Kassendifferenz */}
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Banknote className="h-3.5 w-3.5" /> 5. Kassendifferenz
        </h3>
        {/* Hinweistext: Korrekter Kartenabgleich */}
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
          <p className="font-semibold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> Korrekte Vorgehensweise beim Kartenabgleich (ESTV-konform)</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-700 pl-1">
            <li>Kartenterminal-Abschluss drucken (Z-Bon vom Terminal)</li>
            <li>Den Kartenbetrag vom Terminal-Bon hier als <strong>"Ist-Betrag"</strong> eintragen</li>
            <li>Das System berechnet die Differenz automatisch</li>
          </ol>
          <p className="text-blue-600 pt-1 border-t border-blue-200">
            <strong>Wichtig:</strong> Die Zahlungsart (Bar/Karte/Twint) muss bei <em>jeder Transaktion</em> im System erfasst werden. Eine nachträgliche Zuweisung ist gemäss MWSTG Art. 26 und GeBüV Art. 9 nicht zulässig. Der Kartenabgleich dient nur zur Kontrolle.
          </p>
        </div>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b"><td className="px-3 py-2">Soll (laut System)</td><td className="px-3 py-2 text-right font-semibold">{formatCHF(r.cashBalance.cashExpected)}</td></tr>
              <tr className="border-b">
                <td className="px-3 py-2">Ist (gezähltes Bargeld)</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Input
                      type="number"
                      step="0.05"
                      className="w-28 h-7 text-right text-xs"
                      placeholder={r.cashBalance.cashExpected}
                      value={cashActual}
                      onChange={(e) => { setCashActual(e.target.value); setCashSaved(false); }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!cashActual || saveCash.isPending}
                      onClick={() => saveCash.mutate({ closingId, cashActual })}
                    >
                      {saveCash.isPending ? "…" : "Speichern"}
                    </Button>
                  </div>
                </td>
              </tr>
              <tr className={r.cashBalance.hasDifference ? "bg-red-50" : "bg-green-50"}>
                <td className="px-3 py-2 font-bold">Differenz</td>
                <td className={`px-3 py-2 text-right font-bold ${diffColor}`}>
                  {diffSign}{formatCHF(r.cashBalance.difference)}
                  {!r.cashBalance.hasDifference && <span className="ml-1 text-green-600 text-xs">✓ Ausgeglichen</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Statistiken */}
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> 6. Bestellungs-Statistik
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Bestellungen", value: r.stats.totalOrders, icon: <ShoppingCart className="h-4 w-4 text-blue-500" /> },
            { label: "Stornierungen", value: r.stats.cancelledOrders, icon: <X className="h-4 w-4 text-red-500" /> },
            { label: "Gäste", value: r.stats.totalGuests, icon: <Users className="h-4 w-4 text-green-500" /> },
            { label: "Tische", value: r.stats.totalTables, icon: <Receipt className="h-4 w-4 text-purple-500" /> },
            { label: "Ø / Tisch", value: formatCHF(r.stats.avgRevenuePerTable), icon: <TrendingUp className="h-4 w-4 text-orange-500" /> },
            { label: "Ø / Gast", value: formatCHF(r.stats.avgRevenuePerGuest), icon: <TrendingUp className="h-4 w-4 text-orange-500" /> },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border p-3 flex items-center gap-2">
              {s.icon}
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-semibold">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
        {(r.stats.openingTime || r.stats.closingTime) && (
          <div className="mt-2 text-xs text-muted-foreground flex gap-4">
            {r.stats.openingTime && <span>Erste Bestellung: {formatDateShort(r.stats.openingTime)}</span>}
            {r.stats.closingTime && <span>Letzte Bestellung: {formatDateShort(r.stats.closingTime)}</span>}
          </div>
        )}
      </div>

      {/* 7. Top-Produkte */}
      {r.topProducts.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <Star className="h-3.5 w-3.5" /> 7. Top-Produkte
          </h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Artikel</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Menge</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {r.topProducts.map((p, i) => (
                  <tr key={p.name} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-right">{p.quantity}×</td>
                    <td className="px-3 py-2 text-right">{formatCHF(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. Wareneinsatz */}
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Package className="h-3.5 w-3.5" /> 8. Wareneinsatz / Lagerabzüge
        </h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b"><td className="px-3 py-2">Wareneinsatz</td><td className="px-3 py-2 text-right">{formatCHF(r.inventory.totalConsumedValue)}</td></tr>
              <tr className="border-b"><td className="px-3 py-2">Lagerbewegungen</td><td className="px-3 py-2 text-right">{r.inventory.totalMovements}</td></tr>
              <tr className="border-b"><td className="px-3 py-2 font-semibold">Rohertrag (Bruttomarge)</td><td className="px-3 py-2 text-right font-semibold text-green-700">{formatCHF(r.inventory.grossMargin)}</td></tr>
              <tr className="bg-green-50"><td className="px-3 py-2 font-bold">Bruttomarge %</td><td className="px-3 py-2 text-right font-bold text-green-700">{r.inventory.grossMarginPercent}%</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 9. Stornierungen */}
      <div>
        <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" /> 9. Stornierungen
        </h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b"><td className="px-3 py-2">Anzahl stornierter Bestellungen</td><td className="px-3 py-2 text-right">{r.cancellations.count}</td></tr>
              <tr><td className="px-3 py-2">Stornierter Wert</td><td className="px-3 py-2 text-right text-red-600">{formatCHF(r.cancellations.totalValue)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Notizen */}
      {r.notes && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <p className="font-semibold mb-1">Notizen</p>
          <p>{r.notes}</p>
        </div>
      )}

      {/* Aktionen */}
      <div className="flex gap-2 pt-2 border-t">
        <Button
          className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
          onClick={() => printReport(r)}
        >
          <Download className="h-4 w-4 mr-2" />
          PDF drucken / speichern
        </Button>
        <Button variant="outline" onClick={onClose}>
          Schliessen
        </Button>
      </div>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminClosings() {
  const [manualDialog, setManualDialog] = useState(false);
  const [manualNotes, setManualNotes] = useState("");
  const [reportClosingId, setReportClosingId] = useState<number | null>(null);

  // Konfiguration laden
  const { data: config, isLoading: configLoading, refetch: refetchConfig } = trpc.closings.getClosingConfig.useQuery();

  // Lokaler State für Formular
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);
  const [closingTime, setClosingTime] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);

  const effectiveAuto = autoEnabled ?? config?.autoEnabled ?? false;
  const effectiveTime = closingTime ?? config?.closingTime ?? "23:00";
  const effectiveTz = timezone ?? config?.timezone ?? "Europe/Zurich";
  const isDirty = autoEnabled !== null || closingTime !== null || timezone !== null;

  const saveConfig = trpc.closings.saveClosingConfig.useMutation({
    onSuccess: (data) => {
      toast.success(data.autoEnabled ? `Automatischer Abschluss aktiviert – täglich um ${data.closingTime}` : "Manueller Modus gespeichert");
      setAutoEnabled(null); setClosingTime(null); setTimezone(null);
      refetchConfig();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: closings = [], isLoading: closingsLoading, refetch: refetchClosings } = trpc.closings.getClosings.useQuery({ limit: 30 });

  const triggerClosing = trpc.closings.triggerManualClosing.useMutation({
    onSuccess: (data) => {
      toast.success(`Tagesabschluss erstellt! Umsatz: ${formatCHF(data.totalRevenue)}`);
      setManualDialog(false); setManualNotes("");
      refetchClosings();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookCheck className="h-6 w-6 text-orange-600" />
              Tagesabschluss
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Professioneller Kassenabschluss mit MWST-Aufschlüsselung und PDF-Export
            </p>
          </div>
          <Button
            className="bg-orange-600 hover:bg-orange-700 text-white"
            onClick={() => setManualDialog(true)}
          >
            <BookCheck className="h-4 w-4 mr-2" />
            Jetzt abschliessen
          </Button>
        </div>

        {/* Konfigurationskarte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Abschluss-Konfiguration
            </CardTitle>
            <CardDescription>
              Automatischer oder manueller Tagesabschluss
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {configLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold">Automatischer Abschluss</Label>
                    <p className="text-xs text-muted-foreground">
                      {effectiveAuto ? `Täglich um ${effectiveTime} Uhr automatisch` : "Manuell durch Kassier"}
                    </p>
                  </div>
                  <Switch checked={effectiveAuto} onCheckedChange={(v) => setAutoEnabled(v)} />
                </div>

                {effectiveAuto && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Uhrzeit</Label>
                      <Select value={effectiveTime} onValueChange={(v) => setClosingTime(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {TIMES.map((t) => <SelectItem key={t} value={t}>{t} Uhr</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Zeitzone</Label>
                      <Select value={effectiveTz} onValueChange={(v) => setTimezone(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {config?.scheduleCronTaskUid && (
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                    Automatischer Job aktiv (ID: {config.scheduleCronTaskUid.slice(0, 16)}…)
                  </div>
                )}

                <Button
                  className={isDirty ? "w-full sm:w-auto" : "w-full sm:w-auto"}
                  variant={isDirty ? "default" : "outline"}
                  onClick={() => saveConfig.mutate({ autoEnabled: effectiveAuto, closingTime: effectiveTime, timezone: effectiveTz })}
                  disabled={saveConfig.isPending}
                >
                  {saveConfig.isPending ? "Wird gespeichert..." : "Konfiguration speichern"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Abschluss-Historie */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                Abschluss-Historie (letzte 30)
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetchClosings()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {closingsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : closings.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <BookCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="font-medium">Noch keine Abschlüsse vorhanden</p>
                <p className="text-sm mt-1">Führen Sie den ersten Tagesabschluss durch.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(closings as any[]).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => setReportClosingId(c.id)}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatDate(c.closingDate)}</span>
                        <Badge variant={c.mode === "auto" ? "secondary" : "outline"} className="text-xs">
                          {c.mode === "auto" ? "Automatisch" : "Manuell"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.totalOrders} Bestellungen · {c.totalGuests} Gäste
                        {c.notes && ` · ${c.notes}`}
                      </p>
                      {c.totalStockConsumedValue && parseFloat(c.totalStockConsumedValue) > 0 && (
                        <p className="text-xs text-orange-600">
                          Wareneinsatz: {formatCHF(c.totalStockConsumedValue)}
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-0.5 flex items-center gap-3">
                      <div>
                        <p className="text-sm font-semibold">{formatCHF(c.totalRevenue)}</p>
                        <p className="text-xs text-muted-foreground">
                          Bar: {formatCHF(c.totalCash)} · Karte: {formatCHF(c.totalCard)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        <FileText className="h-3.5 w-3.5" />
                        <span>Bericht</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manueller Abschluss-Dialog */}
      <Dialog open={manualDialog} onOpenChange={setManualDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookCheck className="h-5 w-5 text-orange-600" />
              Tagesabschluss jetzt durchführen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md text-sm text-orange-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>Der Abschluss erfasst alle heute bezahlten Bestellungen. Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Notizen (optional)</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="z.B. Besondere Vorkommnisse, Kassendifferenz-Erklärung..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialog(false)}>Abbrechen</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => triggerClosing.mutate({ notes: manualNotes || undefined })}
              disabled={triggerClosing.isPending}
            >
              {triggerClosing.isPending ? "Wird erstellt..." : "Abschluss erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bericht-Dialog */}
      <Dialog open={reportClosingId !== null} onOpenChange={(o) => { if (!o) setReportClosingId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-600" />
              Tagesabschluss-Bericht
            </DialogTitle>
          </DialogHeader>
          {reportClosingId !== null && (
            <ClosingReportDialog
              closingId={reportClosingId}
              onClose={() => setReportClosingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
