/**
 * AdminStatistics.tsx
 * Vollständiges Statistik-Dashboard für SimplaPOS
 *
 * Tabs:
 * 1. Übersicht     – KPI-Karten + Umsatz-Zeitreihe
 * 2. Abschlüsse    – Tages-/Wochen-/Monats-/Quartals-/Jahres-/MwSt-Abschlüsse
 * 3. Produkte      – Zeitraum-Analyse, Uhrzeit-Filter, Top/Flop
 * 4. Heatmap       – Wochentag × Stunde Umsatz-Heatmap
 * 5. Kellner       – Performance-Ranking
 * 6. Tische        – Tisch-Auslastung
 * 7. KI-Insights   – Muster, Prognosen, Einkauf
 */
import { useState, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie
} from "recharts";
import {
  TrendingUp, ShoppingCart, Users, DollarSign, BarChart2,
  Banknote, Package, Clock, Calendar, Brain, ShoppingBag,
  ArrowUpRight, ArrowDownRight, Minus, CreditCard,
  Download, FileText
} from "lucide-react";

// ─── Export-Hilfsfunktionen ───────────────────────────────────────────────────
function downloadCsv(rows: string[][], headers: string[], filename: string) {
  const csvRows = [
    headers.map(h => `"${h}"`).join(","),
    ...rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success(`CSV exportiert: ${filename}`);
}
function buildPdf(title: string, subtitle: string, headers: string[], rows: (string | number)[][], filename: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(16); doc.setTextColor(30, 64, 175);
  doc.text("SimplaPOS – " + title, 14, 18);
  doc.setFontSize(9); doc.setTextColor(100, 100, 100);
  doc.text(subtitle, 14, 25);
  doc.text(`Erstellt: ${new Date().toLocaleString("de-CH")}`, 14, 30);
  doc.setDrawColor(200, 200, 200); doc.line(14, 33, 196, 33);
  autoTable(doc, {
    startY: 37,
    head: [headers],
    body: rows.map(r => r.map(String)),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    margin: { left: 14, right: 14 },
  });
  const finalY = (doc as any).lastAutoTable?.finalY ?? 250;
  doc.setFontSize(7); doc.setTextColor(150, 150, 150);
  doc.text("SimplaPOS – Vertraulich · Nur für interne Buchhaltung", 14, finalY + 10);
  doc.save(filename);
  toast.success(`PDF exportiert: ${filename}`);
}
function ExportButtons({ onCsv, onPdf }: { onCsv: () => void; onPdf: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onCsv}>
        <Download className="w-3 h-3" /> CSV
      </Button>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs border-red-200 text-red-700 hover:bg-red-50" onClick={onPdf}>
        <FileText className="w-3 h-3" /> PDF
      </Button>
    </div>
  );
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

const fmt = (v: string | number | undefined) =>
  `CHF ${parseFloat(String(v ?? "0")).toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (v: number | undefined) => (v ?? 0).toLocaleString("de-CH");

const PERIOD_LABELS: Record<string, string> = {
  day: "Heute", week: "Diese Woche", month: "Dieser Monat", quarter: "Dieses Quartal", year: "Dieses Jahr",
};

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function ChangeChip({ change }: { change: string }) {
  const val = parseFloat(change);
  if (val > 0) return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600"><ArrowUpRight className="w-3 h-3" />{change}%</span>;
  if (val < 0) return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-500"><ArrowDownRight className="w-3 h-3" />{change}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground"><Minus className="w-3 h-3" />0%</span>;
}

function KpiCard({ title, value, change, prev, icon: Icon, color }: {
  title: string; value: string; change: string; prev: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-xl font-bold">{value}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <ChangeChip change={change} />
              <span className="text-xs text-muted-foreground">vs. {prev}</span>
            </div>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getDefaultDates(period: string) {
  const now = new Date();
  switch (period) {
    case "day": return { start: now.toISOString().split("T")[0], end: now.toISOString().split("T")[0] };
    case "week": {
      const mon = new Date(now); mon.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { start: mon.toISOString().split("T")[0], end: sun.toISOString().split("T")[0] };
    }
    case "month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: s.toISOString().split("T")[0], end: e.toISOString().split("T")[0] };
    }
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const s = new Date(now.getFullYear(), q * 3, 1);
      const e = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { start: s.toISOString().split("T")[0], end: e.toISOString().split("T")[0] };
    }
    case "year": return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
    default: return { start: now.toISOString().split("T")[0], end: now.toISOString().split("T")[0] };
  }
}

// ─── Tab 1: Übersicht ─────────────────────────────────────────────────────────

function OverviewTab() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year">("month");
  const { data, isLoading } = trpc.statistics.getDashboardKpis.useQuery({ period });
  const trendInput = useMemo(() => {
    const d = getDefaultDates(period);
    const gran: "day" | "week" | "month" = period === "year" ? "month" : period === "quarter" ? "month" : "day";
    return { startDate: d.start, endDate: d.end, granularity: gran };
  }, [period]);
  const { data: trend } = trpc.statistics.getPaymentTrend.useQuery(trendInput);
  const kpis = data?.kpis;

  const handleCsv = () => {
    const points = trend?.dataPoints ?? [];
    if (!points.length) { toast.error("Keine Daten zum Exportieren"); return; }
    downloadCsv(
      (points as Array<{ period: string; total: number; cash: number; card: number; twint: number; orderCount: number }>).map(p => [p.period, String(p.total), String(p.cash), String(p.card), String(p.twint), String(p.orderCount)]),
      ["Periode", "Umsatz CHF", "Bar CHF", "Karte CHF", "TWINT CHF", "Bestellungen"],
      `uebersicht_${period}_${new Date().toISOString().slice(0,10)}.csv`
    );
  };
  const handlePdf = () => {
    const points = trend?.dataPoints ?? [];
    if (!points.length) { toast.error("Keine Daten zum Exportieren"); return; }
    buildPdf(
      `Übersicht – ${PERIOD_LABELS[period]}`,
      `KPIs: Umsatz ${fmt(kpis?.revenue.value)} · Bestellungen ${kpis?.orders.value} · Gäste ${kpis?.guests.value}`,
      ["Periode", "Umsatz CHF", "Bar CHF", "Karte CHF", "TWINT CHF", "Bestellungen"],
      (points as Array<{ period: string; total: number; cash: number; card: number; twint: number; orderCount: number }>).map(p => [p.period, p.total.toFixed(2), p.cash.toFixed(2), p.card.toFixed(2), p.twint.toFixed(2), p.orderCount]),
      `uebersicht_${period}_${new Date().toISOString().slice(0,10)}.pdf`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["day", "week", "month", "quarter", "year"] as const).map(p => (
          <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}>
            {PERIOD_LABELS[p]}
          </Button>
        ))}
        <ExportButtons onCsv={handleCsv} onPdf={handlePdf} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="pt-4 pb-3 h-24 animate-pulse bg-muted/30" /></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard title="Bruttoumsatz" value={fmt(kpis?.revenue.value)} change={kpis?.revenue.change ?? "0"} prev={fmt(kpis?.revenue.prev)} icon={DollarSign} color="bg-blue-500" />
          <KpiCard title="Bestellungen" value={fmtNum(kpis?.orders.value)} change={kpis?.orders.change ?? "0"} prev={String(kpis?.orders.prev ?? 0)} icon={ShoppingCart} color="bg-green-500" />
          <KpiCard title="Gäste" value={fmtNum(kpis?.guests.value)} change={kpis?.guests.change ?? "0"} prev={String(kpis?.guests.prev ?? 0)} icon={Users} color="bg-purple-500" />
          <KpiCard title="Ø Bon" value={fmt(kpis?.avgOrderValue.value)} change={kpis?.avgOrderValue.change ?? "0"} prev={fmt(kpis?.avgOrderValue.prev)} icon={TrendingUp} color="bg-orange-500" />
          <KpiCard title="Trinkgeld" value={fmt(kpis?.tips.value)} change={kpis?.tips.change ?? "0"} prev={fmt(kpis?.tips.prev)} icon={Banknote} color="bg-yellow-500" />
          <KpiCard title="Abschlüsse" value={fmtNum(kpis?.closingsCount.value)} change={kpis?.closingsCount.change ?? "0"} prev={String(kpis?.closingsCount.prev ?? 0)} icon={Calendar} color="bg-teal-500" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Umsatz-Verlauf</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend?.dataPoints ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Area type="monotone" dataKey="total" name="Umsatz" stroke="#3b82f6" fill="url(#gradTotal)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Zahlungsarten (gestapelt)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend?.dataPoints?.slice(-14) ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="cash" name="Bar" fill="#22c55e" stackId="a" />
                <Bar dataKey="card" name="Karte" fill="#3b82f6" stackId="a" />
                <Bar dataKey="twint" name="TWINT" fill="#f59e0b" stackId="a" />
                <Bar dataKey="other" name="Sonstige" fill="#94a3b8" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Bestellungen</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend?.dataPoints ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="orderCount" name="Bestellungen" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab 2: Abschlüsse ────────────────────────────────────────────────────────

function ClosingsTab() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year">("month");
  const [subTab, setSubTab] = useState<"summary" | "vat" | "list">("summary");
  const { data, isLoading } = trpc.statistics.getClosingsByPeriod.useQuery({ period });
  const dates = useMemo(() => getDefaultDates(period), [period]);
  const { data: vatData, isLoading: vatLoading } = trpc.statistics.getVatReport.useQuery({ startDate: dates.start, endDate: dates.end });
  const closings = data?.closings ?? [];
  const chartData = (closings as Array<{ date: string; revenue: string }>).map(c => ({ date: c.date.split("T")[0], revenue: parseFloat(c.revenue) }));

  const handleCsv = () => {
    if (subTab === "vat") {
      const vatLines = vatData?.vatLines ?? [];
      if (!vatLines.length) { toast.error("Keine MwSt-Daten"); return; }
      downloadCsv(
        (vatLines as Array<{ rate: string; label: string; netBase: string; vatAmount: string; grossAmount: string; orderCount: number }>).map(l => [l.rate + "%", l.netBase, l.vatAmount, l.grossAmount, String(l.orderCount)]),
        ["MwSt-Satz", "Netto CHF", "MwSt CHF", "Brutto CHF", "Bestellungen"],
        `mwst_${dates.start}_${dates.end}.csv`
      );
    } else {
      const rows = (closings as Array<{ id: number; date: string; revenue: string; cash: string; card: string; twint: string; tax: string; orders: number; guests: number; status: string }>);
      if (!rows.length) { toast.error("Keine Abschluss-Daten"); return; }
      downloadCsv(
        rows.map(c => [c.date.split("T")[0], c.revenue, c.cash, c.card, c.twint, c.tax, String(c.orders), String(c.guests), c.status]),
        ["Datum", "Umsatz CHF", "Bar CHF", "Karte CHF", "TWINT CHF", "MwSt CHF", "Bestellungen", "Gäste", "Status"],
        `abschluesse_${period}_${new Date().toISOString().slice(0,10)}.csv`
      );
    }
  };
  const handlePdf = () => {
    if (subTab === "vat") {
      const vatLines = vatData?.vatLines ?? [];
      buildPdf(
        "MwSt-Abschluss",
        `${vatData?.restaurant.name ?? ""} · ${dates.start} bis ${dates.end} · MwSt-Nr.: ${vatData?.restaurant.vatNumber || "—"}`,
        ["MwSt-Satz", "Netto CHF", "MwSt CHF", "Brutto CHF", "Bestellungen"],
        (vatLines as Array<{ rate: string; label: string; netBase: string; vatAmount: string; grossAmount: string; orderCount: number }>).map(l => [l.rate + "%", l.netBase, l.vatAmount, l.grossAmount, l.orderCount]),
        `mwst_${dates.start}_${dates.end}.pdf`
      );
    } else {
      const rows = (closings as Array<{ id: number; date: string; revenue: string; cash: string; card: string; twint: string; tax: string; orders: number; guests: number; status: string }>);
      buildPdf(
        `Abschlüsse – ${PERIOD_LABELS[period]}`,
        `Bruttoumsatz: ${fmt(data?.summary.grossRevenue)} · Bestellungen: ${data?.summary.orderCount}`,
        ["Datum", "Umsatz CHF", "Bar CHF", "Karte CHF", "TWINT CHF", "MwSt CHF", "Bestellungen", "Gäste", "Status"],
        rows.map(c => [c.date.split("T")[0], c.revenue, c.cash, c.card, c.twint, c.tax, c.orders, c.guests, c.status]),
        `abschluesse_${period}_${new Date().toISOString().slice(0,10)}.pdf`
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["day", "week", "month", "quarter", "year"] as const).map(p => (
          <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}>
            {PERIOD_LABELS[p]}
          </Button>
        ))}
        <ExportButtons onCsv={handleCsv} onPdf={handlePdf} />
      </div>
      <div className="flex gap-2 border-b pb-2">
        {[["summary", "Zusammenfassung"], ["vat", "MwSt-Abschluss"], ["list", "Abschluss-Liste"]].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k as "summary" | "vat" | "list")}
            className={`text-sm px-3 py-1 rounded-md transition-colors ${subTab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>

      {subTab === "summary" && (
        <div className="space-y-4">
          {isLoading ? <div className="h-32 animate-pulse bg-muted/30 rounded-lg" /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Bruttoumsatz", value: fmt(data?.summary.grossRevenue), sub: `Netto: ${fmt(data?.summary.netRevenue)}`, change: data?.summary.revenueChange ?? "0" },
                  { label: "MwSt gesamt", value: fmt(data?.summary.totalTax), sub: "", change: "0" },
                  { label: "Bestellungen", value: fmtNum(data?.summary.orderCount), sub: `Ø Bon: ${fmt(data?.summary.avgOrderValue)}`, change: data?.summary.orderCountChange ?? "0" },
                  { label: "Gäste", value: fmtNum(data?.summary.guestCount), sub: `Trinkgeld: ${fmt(data?.summary.totalTips)}`, change: data?.summary.guestCountChange ?? "0" },
                ].map(item => (
                  <Card key={item.label}><CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-xl font-bold mt-0.5">{item.value}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <ChangeChip change={item.change} />
                      {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                    </div>
                  </CardContent></Card>
                ))}
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Zahlungsarten im Zeitraum</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                      { label: "Bar", value: fmt(data?.payments.cash), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
                      { label: "Karte", value: fmt(data?.payments.card), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
                      { label: "TWINT", value: fmt(data?.payments.twint), color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
                      { label: "Sonstige", value: fmt(data?.payments.other), color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
                      { label: "SumUp", value: fmt(data?.payments.terminalSumup), color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
                      { label: "PayTec", value: fmt(data?.payments.terminalPaytec), color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
                      { label: "Nexi", value: fmt(data?.payments.terminalNexi), color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300" },
                    ].map(item => (
                      <div key={item.label} className={`rounded-lg p-3 ${item.color}`}>
                        <p className="text-xs font-medium">{item.label}</p>
                        <p className="text-sm font-bold mt-0.5">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {(data?.vat.lines ?? []).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">MwSt-Aufschlüsselung</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-1.5">Satz</th><th className="text-right py-1.5">Nettobasis</th><th className="text-right py-1.5">MwSt</th><th className="text-right py-1.5">Brutto</th>
                        </tr></thead>
                        <tbody>
                          {data?.vat.lines.map(l => (
                            <tr key={l.rate} className="border-b last:border-0">
                              <td className="py-1.5 font-medium">{l.label}</td>
                              <td className="text-right py-1.5">{fmt(l.netBase)}</td>
                              <td className="text-right py-1.5">{fmt(l.vatAmount)}</td>
                              <td className="text-right py-1.5 font-medium">{fmt(l.grossAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
              {chartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Tagesumsätze im Zeitraum</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Bar dataKey="revenue" name="Umsatz" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {subTab === "vat" && (
        <div className="space-y-4">
          {vatLoading ? <div className="h-32 animate-pulse bg-muted/30 rounded-lg" /> : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">MwSt-Abschluss (ESTV-konform)</CardTitle>
                  <CardDescription>{vatData?.restaurant.name} · MwSt-Nr.: {vatData?.restaurant.vatNumber || "—"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-muted/30 rounded-lg p-3"><p className="text-xs text-muted-foreground">Bruttoumsatz</p><p className="text-lg font-bold">{fmt(vatData?.summary.totalGross)}</p></div>
                    <div className="bg-muted/30 rounded-lg p-3"><p className="text-xs text-muted-foreground">Nettoumsatz</p><p className="text-lg font-bold">{fmt(vatData?.summary.totalNet)}</p></div>
                    <div className="bg-muted/30 rounded-lg p-3"><p className="text-xs text-muted-foreground">MwSt gesamt</p><p className="text-lg font-bold">{fmt(vatData?.summary.totalVat)}</p></div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2">Steuersatz</th><th className="text-right py-2">Nettobasis</th><th className="text-right py-2">MwSt-Betrag</th><th className="text-right py-2">Bruttobetrag</th><th className="text-right py-2">Belege</th>
                      </tr></thead>
                      <tbody>
                        {vatData?.vatLines.map(l => (
                          <tr key={l.rate} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="py-2 font-medium">{l.label}</td>
                            <td className="text-right py-2">{fmt(l.netBase)}</td>
                            <td className="text-right py-2 text-orange-600">{fmt(l.vatAmount)}</td>
                            <td className="text-right py-2 font-semibold">{fmt(l.grossAmount)}</td>
                            <td className="text-right py-2 text-muted-foreground">{l.orderCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              {(vatData?.monthlyBreakdown ?? []).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Monatliche Aufschlüsselung</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2">Monat</th><th className="text-right py-2">Brutto</th><th className="text-right py-2">Netto</th><th className="text-right py-2">MwSt</th><th className="text-right py-2">Belege</th>
                        </tr></thead>
                        <tbody>
                          {vatData?.monthlyBreakdown.map(m => (
                            <tr key={m.month} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="py-2 font-medium">{m.month}</td>
                              <td className="text-right py-2">{fmt(m.gross)}</td>
                              <td className="text-right py-2">{fmt(m.net)}</td>
                              <td className="text-right py-2 text-orange-600">{fmt(m.vat)}</td>
                              <td className="text-right py-2 text-muted-foreground">{m.orders}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {subTab === "list" && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Abschlüsse im Zeitraum</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="h-32 animate-pulse bg-muted/30 rounded-lg" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2">Datum</th><th className="text-right py-2">Umsatz</th><th className="text-right py-2">Bar</th><th className="text-right py-2">Karte</th><th className="text-right py-2">TWINT</th><th className="text-right py-2">MwSt</th><th className="text-right py-2">Bestellungen</th><th className="text-right py-2">Gäste</th><th className="text-left py-2">Status</th>
                  </tr></thead>
                  <tbody>
                    {closings.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Keine Abschlüsse im gewählten Zeitraum</td></tr>
                    ) : (closings as Array<{ id: number; date: string; revenue: string; cash: string; card: string; twint: string; tax: string; orders: number; guests: number; status: string }>).map(c => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2">{c.date.split("T")[0]}</td>
                        <td className="text-right py-2 font-semibold">{fmt(c.revenue)}</td>
                        <td className="text-right py-2">{fmt(c.cash)}</td>
                        <td className="text-right py-2">{fmt(c.card)}</td>
                        <td className="text-right py-2">{fmt(c.twint)}</td>
                        <td className="text-right py-2 text-orange-600">{fmt(c.tax)}</td>
                        <td className="text-right py-2">{c.orders}</td>
                        <td className="text-right py-2">{c.guests}</td>
                        <td className="py-2"><Badge variant={c.status === "completed" ? "default" : "secondary"} className="text-xs">{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 3: Produkte ──────────────────────────────────────────────────────────

function ProductsTab() {
  const [startDate, setStartDate] = useState(() => getDefaultDates("month").start);
  const [endDate, setEndDate] = useState(() => getDefaultDates("month").end);
  const [hourFrom, setHourFrom] = useState<number | undefined>(undefined);
  const [hourTo, setHourTo] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"revenue" | "quantity" | "orders">("revenue");
  const [itemType, setItemType] = useState<"all" | "food" | "drink" | "other">("all");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const topInput = useMemo(() => ({ startDate, endDate, sortBy, itemType, hourFrom, hourTo, limit: 20 }), [startDate, endDate, sortBy, itemType, hourFrom, hourTo]);
  const { data: topData, isLoading: topLoading } = trpc.statistics.getTopProducts.useQuery(topInput);
  const statsInput = useMemo(() => ({ startDate, endDate, hourFrom, hourTo, productName: selectedProduct || undefined }), [startDate, endDate, hourFrom, hourTo, selectedProduct]);
  const { data: statsData, isLoading: statsLoading } = trpc.statistics.getProductStats.useQuery(statsInput);
  const topProducts = topData?.products ?? [];
  const hourlyDist = statsData?.hourlyDistribution ?? [];
  const weekdayDist = statsData?.weekdayDistribution ?? [];
  const dailySeries = statsData?.dailyTimeSeries ?? [];

  const handleCsv = () => {
    if (!topProducts.length) { toast.error("Keine Produkt-Daten"); return; }
    downloadCsv(
      (topProducts as Array<{ rank: number; productName?: string; totalQuantity: number; totalRevenue: string; revenueShare: string }>).map(p => [String(p.rank), p.productName ?? "", String(p.totalQuantity), p.totalRevenue, p.revenueShare + "%"]),
      ["Rang", "Produkt", "Menge", "Umsatz CHF", "Anteil %"],
      `produkte_${startDate}_${endDate}.csv`
    );
  };
  const handlePdf = () => {
    if (!topProducts.length) { toast.error("Keine Produkt-Daten"); return; }
    const timeFilter = hourFrom !== undefined && hourTo !== undefined ? ` · ${hourFrom}:00–00${hourTo}:00 Uhr` : "";
    buildPdf(
      "Produkt-Analyse",
      `${startDate} bis ${endDate}${timeFilter} · Sortierung: ${sortBy}`,
      ["Rang", "Produkt", "Menge", "Umsatz CHF", "Anteil %"],
      (topProducts as Array<{ rank: number; productName?: string; totalQuantity: number; totalRevenue: string; revenueShare: string }>).map(p => [p.rank, p.productName ?? "", p.totalQuantity, p.totalRevenue, p.revenueShare + "%"]),
      `produkte_${startDate}_${endDate}.pdf`
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div><Label className="text-xs mb-1 block">Von</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm w-36" /></div>
            <div><Label className="text-xs mb-1 block">Bis</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm w-36" /></div>
            <div>
              <Label className="text-xs mb-1 block">Uhrzeit von</Label>
              <Select value={hourFrom !== undefined ? String(hourFrom) : "all"} onValueChange={v => setHourFrom(v === "all" ? undefined : parseInt(v))}>
                <SelectTrigger className="h-8 text-sm w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Uhrzeit bis</Label>
              <Select value={hourTo !== undefined ? String(hourTo) : "all"} onValueChange={v => setHourTo(v === "all" ? undefined : parseInt(v))}>
                <SelectTrigger className="h-8 text-sm w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Kategorie</Label>
              <Select value={itemType} onValueChange={v => setItemType(v as "all" | "food" | "drink" | "other")}>
                <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="food">Speisen</SelectItem>
                  <SelectItem value="drink">Getränke</SelectItem>
                  <SelectItem value="other">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Sortierung</Label>
              <Select value={sortBy} onValueChange={v => setSortBy(v as "revenue" | "quantity" | "orders")}>
                <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Umsatz</SelectItem>
                  <SelectItem value="quantity">Menge</SelectItem>
                  <SelectItem value="orders">Bestellungen</SelectItem>
                </SelectContent>
              </Select>
            </div>
                        <div>
              <Label className="text-xs mb-1 block">Produkt-Suche</Label>
              <Input placeholder="Produktname..." value={productSearch} onChange={e => setProductSearch(e.target.value)} onBlur={() => setSelectedProduct(productSearch)} className="h-8 text-sm w-36" />
            </div>
            <div className="flex items-end pb-0.5">
              <ExportButtons onCsv={handleCsv} onPdf={handlePdf} />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top-Produkte</CardTitle>
            <CardDescription>Klick auf Zeile → Zeitreihe filtern</CardDescription>
          </CardHeader>
          <CardContent>
            {topLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-1.5">#</th><th className="text-left py-1.5">Produkt</th><th className="text-right py-1.5">Menge</th><th className="text-right py-1.5">Umsatz</th><th className="text-right py-1.5">Anteil</th>
                  </tr></thead>
                  <tbody>
                    {topProducts.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Keine Daten</td></tr>
                    ) : (topProducts as Array<{ productId: number; productName?: string; rank: number; totalQuantity: number; totalRevenue: string; revenueShare: string }>).map(p => (
                      <tr key={`${p.productId}-${p.productName}`} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => { setProductSearch(p.productName ?? ""); setSelectedProduct(p.productName ?? ""); }}>
                        <td className="py-1.5 text-muted-foreground">{p.rank}</td>
                        <td className="py-1.5 font-medium max-w-[140px] truncate">{p.productName}</td>
                        <td className="text-right py-1.5">{p.totalQuantity}×</td>
                        <td className="text-right py-1.5">{fmt(p.totalRevenue)}</td>
                        <td className="text-right py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <div className="w-12 bg-muted rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(p.revenueShare), 100)}%` }} /></div>
                            <span className="text-xs text-muted-foreground">{p.revenueShare}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Umsatz</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={(topProducts as Array<{ productName?: string; totalRevenue: string }>).slice(0, 10).map(p => ({ name: (p.productName ?? "").substring(0, 14), umsatz: parseFloat(p.totalRevenue) }))} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="umsatz" name="Umsatz" radius={[0, 2, 2, 0]}>
                  {topProducts.slice(0, 10).map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Verkäufe nach Uhrzeit</CardTitle>
            {selectedProduct && <CardDescription>Filter: {selectedProduct}</CardDescription>}
          </CardHeader>
          <CardContent>
            {statsLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyDist} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Verkäufe" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Verkäufe nach Wochentag</CardTitle></CardHeader>
          <CardContent>
            {statsLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekdayDist} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Verkäufe" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {dailySeries.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Tägliche Verkäufe</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailySeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="quantity" name="Menge" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 4: Heatmap ───────────────────────────────────────────────────────────

function HeatmapTab() {
  const [startDate, setStartDate] = useState(() => getDefaultDates("month").start);
  const [endDate, setEndDate] = useState(() => getDefaultDates("month").end);
  const [metric, setMetric] = useState<"revenue" | "orders" | "guests">("revenue");

  const heatmapInput = useMemo(() => ({ startDate, endDate, metric }), [startDate, endDate, metric]);
  const { data, isLoading } = trpc.statistics.getHourlyHeatmap.useQuery(heatmapInput);

  const grid = data?.grid ?? [];
  const maxValue = data?.maxValue ?? 1;
  const weekdays = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const hours = Array.from({ length: 24 }, (_, h) => h);

  const handleCsv = () => {
    if (!grid.length) { toast.error("Keine Heatmap-Daten"); return; }
    const metricLabel = metric === "revenue" ? "Umsatz CHF" : metric === "orders" ? "Bestellungen" : "Gäste";
    downloadCsv(
      (grid as Array<{ weekday: number; hour: number; value: number; revenue: string; orders: number; guests: number }>).map(g => [
        weekdays[g.weekday] ?? String(g.weekday), String(g.hour) + ":00",
        metric === "revenue" ? g.revenue : metric === "orders" ? String(g.orders) : String(g.guests)
      ]),
      ["Wochentag", "Stunde", metricLabel],
      `heatmap_${metric}_${startDate}_${endDate}.csv`
    );
  };
  const handlePdf = () => {
    if (!grid.length) { toast.error("Keine Heatmap-Daten"); return; }
    const metricLabel = metric === "revenue" ? "Umsatz CHF" : metric === "orders" ? "Bestellungen" : "Gäste";
    buildPdf(
      "Heatmap – Wochentag × Uhrzeit",
      `${startDate} bis ${endDate} · Metrik: ${metricLabel}`,
      ["Wochentag", "Stunde", metricLabel],
      (grid as Array<{ weekday: number; hour: number; value: number; revenue: string; orders: number; guests: number }>).map(g => [
        weekdays[g.weekday] ?? String(g.weekday), String(g.hour) + ":00",
        metric === "revenue" ? g.revenue : metric === "orders" ? g.orders : g.guests
      ]),
      `heatmap_${metric}_${startDate}_${endDate}.pdf`
    );
  };

  const getColor = (value: number) => {
    const intensity = value / maxValue;
    if (intensity === 0) return "bg-muted/20";
    if (intensity < 0.2) return "bg-blue-100 dark:bg-blue-950";
    if (intensity < 0.4) return "bg-blue-200 dark:bg-blue-900";
    if (intensity < 0.6) return "bg-blue-400 dark:bg-blue-700";
    if (intensity < 0.8) return "bg-blue-600 dark:bg-blue-500";
    return "bg-blue-800 dark:bg-blue-400";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div><Label className="text-xs mb-1 block">Von</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm w-36" /></div>
            <div><Label className="text-xs mb-1 block">Bis</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm w-36" /></div>
            <div>
              <Label className="text-xs mb-1 block">Metrik</Label>
              <Select value={metric} onValueChange={v => setMetric(v as "revenue" | "orders" | "guests")}>
                <SelectTrigger className="h-8 text-sm w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Umsatz</SelectItem>
                  <SelectItem value="orders">Bestellungen</SelectItem>
                  <SelectItem value="guests">Gäste</SelectItem>
                </SelectContent>
                            </Select>
            </div>
            <div className="flex items-end pb-0.5"><ExportButtons onCsv={handleCsv} onPdf={handlePdf} /></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Heatmap: Wochentag × Uhrzeit</CardTitle>
          <CardDescription>Dunklere Farbe = höherer Wert</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="h-48 animate-pulse bg-muted/30 rounded-lg" /> : (
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="flex mb-1">
                  <div className="w-8 shrink-0" />
                  {hours.map(h => (
                    <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">{h % 2 === 0 ? `${h}` : ""}</div>
                  ))}
                </div>
                {weekdays.map((wd, wi) => (
                  <div key={wd} className="flex mb-0.5 items-center">
                    <div className="w-8 shrink-0 text-xs text-muted-foreground text-right pr-1">{wd}</div>
                    {hours.map(h => {
                      const cell = grid.find(g => g.weekday === wi && g.hour === h);
                      return (
                        <div key={h} className={`flex-1 h-6 mx-px rounded-sm ${getColor(cell?.value ?? 0)} transition-colors cursor-pointer`}
                          title={`${wd} ${String(h).padStart(2, "0")}:00 – ${metric === "revenue" ? fmt(cell?.revenue) : metric === "orders" ? `${cell?.orders} Bestellungen` : `${cell?.guests} Gäste`}`} />
                      );
                    })}
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-muted-foreground">Niedrig</span>
                  {["bg-muted/20", "bg-blue-100", "bg-blue-200", "bg-blue-400", "bg-blue-600", "bg-blue-800"].map((c, i) => (
                    <div key={i} className={`w-6 h-3 rounded ${c}`} />
                  ))}
                  <span className="text-xs text-muted-foreground">Hoch</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(data?.peakSlots ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Peak-Zeiten (Top 20%)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data?.peakSlots.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{s.weekday} {s.hour}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 5: Kellner ───────────────────────────────────────────────────────────

function WaiterTab() {
  const [startDate, setStartDate] = useState(() => getDefaultDates("month").start);
  const [endDate, setEndDate] = useState(() => getDefaultDates("month").end);
  const waiterInput = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);
  const { data, isLoading } = trpc.statistics.getWaiterPerformance.useQuery(waiterInput);
  const staff = data?.staff ?? [];

  const handleCsv = () => {
    if (!staff.length) { toast.error("Keine Kellner-Daten"); return; }
    downloadCsv(
      (staff as Array<{ rank: number; staffName: string; totalRevenue: string; avgOrderValue: string; totalTips: string; orderCount: number }>).map(s => [String(s.rank), s.staffName, s.totalRevenue, s.avgOrderValue, s.totalTips, String(s.orderCount)]),
      ["Rang", "Name", "Umsatz CHF", "Ø Bon CHF", "Trinkgeld CHF", "Bestellungen"],
      `kellner_${startDate}_${endDate}.csv`
    );
  };
  const handlePdf = () => {
    if (!staff.length) { toast.error("Keine Kellner-Daten"); return; }
    buildPdf(
      "Kellner-Performance",
      `${startDate} bis ${endDate} · ${staff.length} Mitarbeiter`,
      ["Rang", "Name", "Umsatz CHF", "Ø Bon CHF", "Trinkgeld CHF", "Bestellungen"],
      (staff as Array<{ rank: number; staffName: string; totalRevenue: string; avgOrderValue: string; totalTips: string; orderCount: number }>).map(s => [s.rank, s.staffName, s.totalRevenue, s.avgOrderValue, s.totalTips, s.orderCount]),
      `kellner_${startDate}_${endDate}.pdf`
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div><Label className="text-xs mb-1 block">Von</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm w-36" /></div>
            <div><Label className="text-xs mb-1 block">Bis</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm w-36" /></div>
            <div className="flex items-end pb-0.5"><ExportButtons onCsv={handleCsv} onPdf={handlePdf} /></div>
          </div>
        </CardContent>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Kellner-Ranking</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-1.5">#</th><th className="text-left py-1.5">Name</th><th className="text-right py-1.5">Umsatz</th><th className="text-right py-1.5">Ø Bon</th><th className="text-right py-1.5">Trinkgeld</th><th className="text-right py-1.5">Bestellungen</th>
                  </tr></thead>
                  <tbody>
                    {staff.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">Keine Daten</td></tr>
                    ) : (staff as Array<{ staffId: number; rank: number; staffName: string; totalRevenue: string; avgOrderValue: string; totalTips: string; orderCount: number }>).map(s => (
                      <tr key={s.staffId} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-1.5 text-muted-foreground">{s.rank}</td>
                        <td className="py-1.5 font-medium">{s.staffName}</td>
                        <td className="text-right py-1.5 font-semibold">{fmt(s.totalRevenue)}</td>
                        <td className="text-right py-1.5">{fmt(s.avgOrderValue)}</td>
                        <td className="text-right py-1.5 text-yellow-600">{fmt(s.totalTips)}</td>
                        <td className="text-right py-1.5">{s.orderCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Umsatz-Verteilung</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={(staff as Array<{ staffName: string; totalRevenue: string }>).map(s => ({ name: s.staffName, value: parseFloat(s.totalRevenue) }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {(staff as unknown[]).map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab 6: Tische ────────────────────────────────────────────────────────────

function TablesTab() {
  const [startDate, setStartDate] = useState(() => getDefaultDates("month").start);
  const [endDate, setEndDate] = useState(() => getDefaultDates("month").end);
  const tableInput = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);
  const { data, isLoading } = trpc.statistics.getTableStats.useQuery(tableInput);
  const tables = data?.tables ?? [];

  const handleCsv = () => {
    if (!tables.length) { toast.error("Keine Tisch-Daten"); return; }
    downloadCsv(
      (tables as Array<{ tableId: number; totalRevenue: string; avgRevenue: string; orderCount: number; revenueShare: string }>).map(t => ["Tisch " + t.tableId, t.totalRevenue, t.avgRevenue, String(t.orderCount), t.revenueShare + "%"]),
      ["Tisch", "Umsatz CHF", "Ø Bon CHF", "Bestellungen", "Anteil %"],
      `tische_${startDate}_${endDate}.csv`
    );
  };
  const handlePdf = () => {
    if (!tables.length) { toast.error("Keine Tisch-Daten"); return; }
    buildPdf(
      "Tisch-Auslastung",
      `${startDate} bis ${endDate} · ${tables.length} Tische · Gesamtumsatz: ${fmt(data?.summary.totalRevenue)}`,
      ["Tisch", "Umsatz CHF", "Ø Bon CHF", "Bestellungen", "Anteil %"],
      (tables as Array<{ tableId: number; totalRevenue: string; avgRevenue: string; orderCount: number; revenueShare: string }>).map(t => ["Tisch " + t.tableId, t.totalRevenue, t.avgRevenue, t.orderCount, t.revenueShare + "%"]),
      `tische_${startDate}_${endDate}.pdf`
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div><Label className="text-xs mb-1 block">Von</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm w-36" /></div>
            <div><Label className="text-xs mb-1 block">Bis</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm w-36" /></div>
            <div className="flex items-end pb-0.5"><ExportButtons onCsv={handleCsv} onPdf={handlePdf} /></div>
          </div>
        </CardContent>
      </Card>
      {data?.summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Aktive Tische</p><p className="text-xl font-bold">{data.summary.totalTables}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Gesamtumsatz</p><p className="text-xl font-bold">{fmt(data.summary.totalRevenue)}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Ø pro Tisch</p><p className="text-xl font-bold">{fmt(data.summary.avgRevenuePerTable)}</p></CardContent></Card>
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Tisch-Auslastung</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-1.5">Tisch</th><th className="text-right py-1.5">Umsatz</th><th className="text-right py-1.5">Ø Bon</th><th className="text-right py-1.5">Bestellungen</th><th className="text-right py-1.5">Anteil</th>
                  </tr></thead>
                  <tbody>
                    {tables.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Keine Daten</td></tr>
                    ) : (tables as Array<{ tableId: number; totalRevenue: string; avgRevenue: string; orderCount: number; revenueShare: string }>).map(t => (
                      <tr key={t.tableId} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-1.5 font-medium">Tisch {t.tableId}</td>
                        <td className="text-right py-1.5 font-semibold">{fmt(t.totalRevenue)}</td>
                        <td className="text-right py-1.5">{fmt(t.avgRevenue)}</td>
                        <td className="text-right py-1.5">{t.orderCount}</td>
                        <td className="text-right py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <div className="w-12 bg-muted rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(t.revenueShare), 100)}%` }} /></div>
                            <span className="text-xs text-muted-foreground">{t.revenueShare}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top-Tische nach Umsatz</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={(tables as Array<{ tableId: number; totalRevenue: string }>).slice(0, 12).map(t => ({ name: `T${t.tableId}`, umsatz: parseFloat(t.totalRevenue) }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="umsatz" name="Umsatz" fill="#3b82f6" radius={[2, 2, 0, 0]}>
                  {(tables as unknown[]).slice(0, 12).map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab 7: KI-Insights ───────────────────────────────────────────────────────

function AiInsightsTab() {
  const [weeksBack, setWeeksBack] = useState(12);
  const insightsInput = useMemo(() => ({ weeksBack }), [weeksBack]);
  const forecastInput = useMemo(() => ({ weeksBack: 4 }), []);
  const { data: insights, isLoading: insightsLoading } = trpc.statistics.getAiInsights.useQuery(insightsInput);
  const { data: forecast, isLoading: forecastLoading } = trpc.statistics.getPurchaseForecast.useQuery(forecastInput);

  const handleForecastCsv = () => {
    const recs = forecast?.recommendations ?? [];
    if (!recs.length) { toast.error("Keine Einkaufsempfehlung-Daten"); return; }
    downloadCsv(
      (recs as Array<{ productName: string; avgWeeklyQuantity: number; suggestedWeeklyOrder: number; trendPercent: string; totalRevenue: string }>).map(r => [r.productName, String(r.avgWeeklyQuantity), String(r.suggestedWeeklyOrder), r.trendPercent + "%", r.totalRevenue]),
      ["Produkt", "Ø/Woche", "Empfehlung", "Trend %", "Umsatz CHF"],
      `einkauf_empfehlung_${new Date().toISOString().slice(0,10)}.csv`
    );
  };
  const handleForecastPdf = () => {
    const recs = forecast?.recommendations ?? [];
    if (!recs.length) { toast.error("Keine Einkaufsempfehlung-Daten"); return; }
    buildPdf(
      "Einkaufsempfehlung",
      `Basierend auf den letzten 4 Wochen · Erstellt: ${new Date().toLocaleDateString("de-CH")}`,
      ["Produkt", "Ø/Woche", "Empfehlung", "Trend %", "Umsatz CHF"],
      (recs as Array<{ productName: string; avgWeeklyQuantity: number; suggestedWeeklyOrder: number; trendPercent: string; totalRevenue: string }>).map(r => [r.productName, r.avgWeeklyQuantity, r.suggestedWeeklyOrder, r.trendPercent + "%", r.totalRevenue]),
      `einkauf_empfehlung_${new Date().toISOString().slice(0,10)}.pdf`
    );
  };
  const handleInsightsCsv = () => {
    const patterns = insights?.weekdayPatterns ?? [];
    if (!patterns.length) { toast.error("Keine Muster-Daten"); return; }
    downloadCsv(
      (patterns as Array<{ label: string; avgRevenue: string; avgOrders: string; factor: string }>).map(p => [p.label, p.avgRevenue, p.avgOrders, p.factor]),
      ["Wochentag", "Ø Umsatz CHF", "Ø Bestellungen", "Faktor"],
      `wochentag_muster_${new Date().toISOString().slice(0,10)}.csv`
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-sm">Analyse-Zeitraum:</Label>
        <Select value={String(weeksBack)} onValueChange={v => setWeeksBack(parseInt(v))}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="4">4 Wochen</SelectItem>
            <SelectItem value="8">8 Wochen</SelectItem>
            <SelectItem value="12">12 Wochen</SelectItem>
            <SelectItem value="26">26 Wochen</SelectItem>
            <SelectItem value="52">52 Wochen</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Muster:</span>
          <ExportButtons onCsv={handleInsightsCsv} onPdf={() => toast.info("Bitte CSV verwenden für Muster-Export")} />
          <span className="text-xs text-muted-foreground ml-2">Einkauf:</span>
          <ExportButtons onCsv={handleForecastCsv} onPdf={handleForecastPdf} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Brain className="w-4 h-4 text-purple-500" />Wochentag-Muster</CardTitle>
            <CardDescription>Ø Umsatz pro Wochentag</CardDescription>
          </CardHeader>
          <CardContent>
            {insightsLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={insights?.weekdayPatterns ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="avgRevenue" name="Ø Umsatz" radius={[2, 2, 0, 0]}>
                    {(insights?.weekdayPatterns ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" />Peak-Stunden</CardTitle>
          </CardHeader>
          <CardContent>
            {insightsLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
              <div className="space-y-2">
                {(insights?.peakHours ?? []).map((h: { hour: number; label: string; totalOrders: number; avgRevenue: string }) => (
                  <div key={h.hour} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-12 text-muted-foreground">{h.label}</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(h.totalOrders / ((insights?.peakHours[0]?.totalOrders ?? 1) || 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-right w-20">{h.totalOrders} Bestellungen</span>
                    <span className="text-xs text-right w-24 font-medium">{fmt(h.avgRevenue)} Ø</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">Ø Tagesumsatz: <strong>{fmt(insights?.avgDailyRevenue)}</strong></p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" />Wöchentlicher Umsatz-Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {insightsLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={insights?.weeklyTrend ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradWeekly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Area type="monotone" dataKey="revenue" name="Umsatz" stroke="#22c55e" fill="url(#gradWeekly)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-orange-500" />Prognose nächste Woche</CardTitle>
          <CardDescription>Basierend auf Wochentag-Mustern der letzten {weeksBack} Wochen</CardDescription>
        </CardHeader>
        <CardContent>
          {insightsLoading ? <div className="h-24 animate-pulse bg-muted/30 rounded-lg" /> : (
            <div className="grid grid-cols-7 gap-2">
              {(insights?.nextWeekForecast ?? []).map(f => (
                <div key={f.weekday} className="text-center">
                  <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                  <p className="text-[10px] text-muted-foreground">{f.date}</p>
                  <p className="text-sm font-bold mt-1">{fmt(f.forecastRevenue)}</p>
                  <Badge variant="outline" className="text-[9px] mt-0.5">{f.confidence}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-teal-500" />Einkaufsempfehlung</CardTitle>
          <CardDescription>Empfohlene Wochenmenge (+10% Puffer) basierend auf den letzten 4 Wochen</CardDescription>
        </CardHeader>
        <CardContent>
          {forecastLoading ? <div className="h-40 animate-pulse bg-muted/30 rounded-lg" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1.5">Produkt</th><th className="text-right py-1.5">Ø/Woche</th><th className="text-right py-1.5">Empfehlung</th><th className="text-right py-1.5">Trend</th><th className="text-right py-1.5">Umsatz</th>
                </tr></thead>
                <tbody>
                  {(forecast?.recommendations ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Keine Daten</td></tr>
                  ) : (forecast?.recommendations ?? []).map((r: { productId: number; productName: string; avgWeeklyQuantity: number; suggestedWeeklyOrder: number; trendPercent: string; totalRevenue: string }) => (
                    <tr key={`${r.productId}-${r.productName}`} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-1.5 font-medium max-w-[160px] truncate">{r.productName}</td>
                      <td className="text-right py-1.5">{r.avgWeeklyQuantity}×</td>
                      <td className="text-right py-1.5 font-semibold text-teal-600">{r.suggestedWeeklyOrder}×</td>
                      <td className="text-right py-1.5"><ChangeChip change={r.trendPercent} /></td>
                      <td className="text-right py-1.5">{fmt(r.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export default function AdminStatistics() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-blue-500" />
          Statistiken &amp; Abschlüsse
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Tages-, Wochen-, Monats-, Quartals- und Jahresabschlüsse · MwSt · Produkt-Analyse · KI-Prognosen
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-xs">Übersicht</TabsTrigger>
          <TabsTrigger value="closings" className="text-xs">Abschlüsse</TabsTrigger>
          <TabsTrigger value="products" className="text-xs">Produkte</TabsTrigger>
          <TabsTrigger value="heatmap" className="text-xs">Heatmap</TabsTrigger>
          <TabsTrigger value="waiters" className="text-xs">Kellner</TabsTrigger>
          <TabsTrigger value="tables" className="text-xs">Tische</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs">KI-Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="closings" className="mt-4"><ClosingsTab /></TabsContent>
        <TabsContent value="products" className="mt-4"><ProductsTab /></TabsContent>
        <TabsContent value="heatmap" className="mt-4"><HeatmapTab /></TabsContent>
        <TabsContent value="waiters" className="mt-4"><WaiterTab /></TabsContent>
        <TabsContent value="tables" className="mt-4"><TablesTab /></TabsContent>
        <TabsContent value="ai" className="mt-4"><AiInsightsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
