import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";

function SteuerexportInner() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState<string>("all");
  const [format, setFormat] = useState<"csv" | "datev">("csv");

  // Datumsbereich berechnen
  const getDateRange = () => {
    if (quarter === "all") {
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    const q = parseInt(quarter);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(year, endMonth, 0).getDate();
    const to = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
    return { from, to };
  };

  const { from, to } = getDateRange();

  const { data: exportData, isLoading, refetch } = trpc.steuerexport.exportData.useQuery(
    { restaurantId, from, to, format },
    { enabled: false }
  );

  const handleExport = async () => {
    const result = await refetch();
    if (!result.data) { toast.error("Keine Daten gefunden"); return; }
    const { entries, closings } = result.data;

    // CSV generieren
    const rows: string[] = ["Datum;Typ;Beschreibung;Betrag;Kategorie;Belegnummer"];
    for (const e of (entries as any[])) {
      rows.push([
        new Date(e.entryDate).toLocaleDateString("de-CH"),
        e.type,
        `"${e.description}"`,
        e.amount,
        e.category ?? "",
        e.receiptNumber ?? "",
      ].join(";"));
    }
    for (const c of (closings as any[])) {
      rows.push([
        new Date(c.closingDate).toLocaleDateString("de-CH"),
        "tagesabschluss",
        `"Tagesabschluss"`,
        c.totalRevenue,
        "",
        "",
      ].join(";"));
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_${year}_${quarter === "all" ? "gesamt" : `Q${quarter}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export erfolgreich heruntergeladen");
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Steuerberater-Export</h1>
        <p className="text-muted-foreground text-sm">CSV/DATEV-Export für Buchhaltung und Steuerberater</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Export konfigurieren</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Jahr</Label>
              <Input
                type="number"
                min={2020}
                max={currentYear}
                value={year}
                onChange={e => setYear(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Quartal</Label>
              <Select value={quarter} onValueChange={setQuarter}>
                <SelectTrigger><SelectValue placeholder="Ganzes Jahr" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Ganzes Jahr</SelectItem>
                  <SelectItem value="1">Q1 (Jan–Mär)</SelectItem>
                  <SelectItem value="2">Q2 (Apr–Jun)</SelectItem>
                  <SelectItem value="3">Q3 (Jul–Sep)</SelectItem>
                  <SelectItem value="4">Q4 (Okt–Dez)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Format</Label>
              <Select value={format} onValueChange={v => setFormat(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (Standard)</SelectItem>
                  <SelectItem value="datev">DATEV (Deutschland)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleExport} disabled={!restaurantId || isLoading} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            {isLoading ? "Exportiere..." : "Export herunterladen"}
          </Button>

          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Was wird exportiert?</p>
            <p>• Kassenbuch-Einträge (Einnahmen & Ausgaben) mit Belegnummer</p>
            <p>• Tagesabschlüsse mit Umsatz und Differenzen</p>
            <p>• Kompatibel mit DATEV, Banana Buchhaltung, Excel</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Steuerexport() {
  return (
    <ModuleGate moduleId="steuerexport">
      <SteuerexportInner />
    </ModuleGate>
  );
}
