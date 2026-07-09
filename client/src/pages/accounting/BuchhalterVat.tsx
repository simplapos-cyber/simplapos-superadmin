import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet } from "lucide-react";

export default function BuchhalterVat() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: summary } = trpc.restaurantAdmin.revenueSummary.useQuery({ date });
  const fmt = (v: number) => `CHF ${(v ?? 0).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`;
  const gross = summary?.gross ?? 0;
  const net = summary?.net ?? 0;
  const vat = summary?.vat ?? 0;
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">MwSt</h1><p className="text-muted-foreground text-sm">Mehrwertsteuer-Übersicht (Lesezugriff)</p></div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-background" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> MwSt-Abrechnung</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: "Bruttoumsatz (inkl. MwSt)", value: fmt(gross) },
              { label: "Nettoumsatz (exkl. MwSt)", value: fmt(net) },
              { label: "MwSt 7.7% (Normalsatz)", value: fmt(vat * 0.9), highlight: true },
              { label: "MwSt 2.5% (Sondersatz)", value: fmt(vat * 0.1), highlight: true },
              { label: "MwSt gesamt", value: fmt(vat), bold: true },
            ].map((row: any) => (
              <div key={row.label} className={`flex justify-between text-sm ${row.bold ? "border-t pt-2 font-semibold" : ""}`}>
                <span className={row.highlight ? "text-muted-foreground" : ""}>{row.label}</span>
                <span className={row.bold ? "font-bold" : "font-medium"}>{row.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
