import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign } from "lucide-react";

export default function BuchhalterRevenue() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: summary } = trpc.restaurantAdmin.revenueSummary.useQuery({ date });
  const fmt = (v: number) => `CHF ${(v ?? 0).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`;
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Umsätze</h1><p className="text-muted-foreground text-sm">Umsatzübersicht (Lesezugriff)</p></div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-background" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Bruttoumsatz", value: fmt(summary?.gross ?? 0) },
          { label: "Nettoumsatz", value: fmt(summary?.net ?? 0) },
          { label: "MwSt", value: fmt(summary?.vat ?? 0) },
          { label: "Trinkgeld", value: fmt(summary?.tips ?? 0) },
        ].map((item) => (
          <Card key={item.label}><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="text-xl font-bold mt-1">{item.value}</p></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
