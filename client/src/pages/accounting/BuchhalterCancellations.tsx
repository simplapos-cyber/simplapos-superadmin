import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ban } from "lucide-react";

export default function BuchhalterCancellations() {
  const { data: orders } = trpc.order.getRecentOrders.useQuery({ limit: 100 });
  const cancelled = (orders ?? []).filter((o: any) => o.status === "cancelled");
  const fmt = (v: number) => `CHF ${(v ?? 0).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`;
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Storno Protokoll</h1><p className="text-muted-foreground text-sm">Stornierte Bestellungen (Lesezugriff)</p></div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Ban className="h-4 w-4" /> Stornierungen ({cancelled.length})</CardTitle></CardHeader>
        <CardContent>
          {cancelled.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Keine Stornierungen</p>
          ) : (
            <div className="space-y-2">
              {cancelled.map((o: any) => (
                <div key={o.id} className="flex justify-between p-3 border rounded-lg text-sm">
                  <div>
                    <p className="font-medium">#{o.orderNumber ?? o.id}</p>
                    <p className="text-xs text-muted-foreground">{o.createdAt ? new Date(o.createdAt).toLocaleString("de-CH") : "–"}</p>
                  </div>
                  <span className="font-bold">{fmt(o.totalAmount ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
