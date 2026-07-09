import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, Calendar, TrendingUp, BarChart3, List, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

function downloadPdf(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

// ─── Z-Abschluss Tab ─────────────────────────────────────────────────────────

function ZAbschlussTab() {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const { data: availableYears = [] } = trpc.reports.listAvailableYears.useQuery();
  const { data: closings = [], isLoading } = trpc.reports.listClosings.useQuery({
    year: selectedYear,
    month: selectedMonth,
    limit: 50,
  });

  const handleDownload = async (closingId: number, closingNumber: string) => {
    setDownloadingId(closingId);
    try {
      downloadPdf(`/api/reports/pdf/z-abschluss/${closingId}`, `Z-Abschluss_${closingNumber}.pdf`);
    } finally {
      setTimeout(() => setDownloadingId(null), 1500);
    }
  };

  const years = availableYears.length > 0 ? availableYears : [currentYear];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Jahr" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y: number) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Monat" />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Lade Abschlüsse...</div>
      ) : closings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">Keine Abschlüsse für {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {closings.map((closing: any) => (
            <div
              key={closing.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{closing.closingNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(closing.closingDate), "EEEE, dd. MMMM yyyy · HH:mm", { locale: de })} Uhr
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold">CHF {Number(closing.totalRevenue ?? 0).toFixed(2)}</p>
                  <Badge variant={closing.status === "closed" ? "default" : "secondary"} className="text-xs">
                    {closing.mode === "auto" ? "Automatisch" : "Manuell"}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(closing.id, closing.closingNumber)}
                  disabled={downloadingId === closing.id}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadingId === closing.id ? "..." : "PDF"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Monatsbericht Tab ────────────────────────────────────────────────────────

function MonatsberichtTab() {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [downloading, setDownloading] = useState<"standard" | "detail" | null>(null);

  const { data: availableYears = [] } = trpc.reports.listAvailableYears.useQuery();
  const years = availableYears.length > 0 ? availableYears : [currentYear];

  const handleDownloadStandard = async () => {
    setDownloading("standard");
    try {
      downloadPdf(
        `/api/reports/pdf/monatsbericht/${selectedYear}/${selectedMonth}`,
        `Monatsbericht_${selectedYear}-${String(selectedMonth).padStart(2, "0")}.pdf`
      );
    } finally {
      setTimeout(() => setDownloading(null), 1500);
    }
  };

  const handleDownloadDetail = async () => {
    setDownloading("detail");
    try {
      downloadPdf(
        `/api/reports/pdf/monatsbericht-detail/${selectedYear}/${selectedMonth}`,
        `Detaillierter-Monatsbericht_${selectedYear}-${String(selectedMonth).padStart(2, "0")}.pdf`
      );
    } finally {
      setTimeout(() => setDownloading(null), 1500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-3 flex-wrap">
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Jahr" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y: number) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Monat" />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Monatsbericht
            </CardTitle>
            <CardDescription className="text-xs">
              Kategorien nach Zahlungsart, Kellnerverkäufe, MwSt-Aufschlüsselung
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full gap-2"
              onClick={handleDownloadStandard}
              disabled={downloading === "standard"}
            >
              <Download className="h-4 w-4" />
              {downloading === "standard" ? "Wird generiert..." : `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} herunterladen`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <List className="h-4 w-4 text-primary" />
              Detaillierter Monatsbericht
            </CardTitle>
            <CardDescription className="text-xs">
              Tagesweise Auflistung mit Umsatz, Zahlungsarten, Ausgaben und Kassenbuch
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleDownloadDetail}
              disabled={downloading === "detail"}
            >
              <Download className="h-4 w-4" />
              {downloading === "detail" ? "Wird generiert..." : `Detail ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Gesetzliche Grundlage</p>
        <p>Berichte entsprechen den Anforderungen von OR Art. 957ff und MWSTG (Schweiz).</p>
        <p>MwSt-Sätze: 8.10% (Standard) · 2.60% (Beherbergung/Takeaway)</p>
        <p>Aufbewahrungspflicht: 10 Jahre ab Ausstellungsdatum</p>
      </div>
    </div>
  );
}

// ─── Jahresbericht Tab ────────────────────────────────────────────────────────

function JahresberichtTab() {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [downloading, setDownloading] = useState(false);

  const { data: availableYears = [] } = trpc.reports.listAvailableYears.useQuery();
  const years = availableYears.length > 0 ? availableYears : [currentYear];

  const handleDownload = async () => {
    setDownloading(true);
    try {
      downloadPdf(
        `/api/reports/pdf/jahresbericht/${selectedYear}`,
        `Jahresbericht_${selectedYear}.pdf`
      );
    } finally {
      setTimeout(() => setDownloading(false), 1500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Jahr</p>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Jahr" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y: number) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleDownload} disabled={downloading} className="gap-2">
          <Download className="h-4 w-4" />
          {downloading ? "Wird generiert..." : `Jahresbericht ${selectedYear} herunterladen`}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Was enthält der Jahresbericht?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>Monatliche Umsatzübersicht (Jan–Dez)</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>Kategorien nach Zahlungsart (Bar/Karte/Online)</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>MwSt-Aufschlüsselung 8.10% / 2.60%</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>Netto-Umsatz pro Monat und Jahrestotal</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>Bericht-Nummer für Steuerprüfung (JB-{selectedYear})</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>Revisionssicher — Daten gesperrt nach Erstellung</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function Reports() {
  return (
    <div className="container py-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Berichte & Abschlüsse</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Revisionssichere Berichte gemäss OR Art. 957ff und MWSTG (Schweiz)
        </p>
      </div>

      <Tabs defaultValue="z-abschluss">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="z-abschluss" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Z-Abschluss
          </TabsTrigger>
          <TabsTrigger value="monatsbericht" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Monat
          </TabsTrigger>
          <TabsTrigger value="jahresbericht" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Jahr
          </TabsTrigger>
        </TabsList>

        <TabsContent value="z-abschluss" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Z-Abschluss (Tagesabschluss)</CardTitle>
              <CardDescription>
                Kassenschnitt pro Tag — enthält Kategorien, Kellnerverkäufe, Kassendifferenz und Stornierungen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ZAbschlussTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monatsbericht" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monatsbericht</CardTitle>
              <CardDescription>
                Aggregierter Bericht für einen Monat — Standard und Detailliert (tagesweise)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonatsberichtTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jahresbericht" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Jahresbericht</CardTitle>
              <CardDescription>
                Vollständige Jahresübersicht mit monatlicher Aufschlüsselung und MwSt-Nachweis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JahresberichtTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
