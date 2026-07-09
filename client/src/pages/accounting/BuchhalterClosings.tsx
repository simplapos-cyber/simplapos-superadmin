import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator } from "lucide-react";

export default function BuchhalterClosings() {
  const { data: closings } = trpc.closings.getClosings.useQuery({ limit: 50 });
  const fmt = (v: number) => `CHF ${(v ?? 0).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`;
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Abschlüsse</h1><p className="text-muted-foreground text-sm">Tagesabschlüsse (Lesezugriff)</p></div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" /> Tagesabschlüsse</CardTitle></CardHeader>
        <CardContent>
          {!closings || closings.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Keine Abschlüsse vorhanden</p>
          ) : (
            <div className="space-y-2">
              {closings.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Abschluss #{c.id}</p>
                    <p className="text-xs text-muted-foreground">{c.closingDate ? new Date(c.closingDate).toLocaleDateString("de-CH") : "–"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={c.mode === "auto" ? "default" : "secondary"}>{c.mode === "auto" ? "Auto" : "Manuell"}</Badge>
                    <span className="font-bold text-sm">{fmt(c.totalRevenue ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
