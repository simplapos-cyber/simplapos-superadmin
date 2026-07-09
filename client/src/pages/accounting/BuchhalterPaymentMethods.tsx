import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";

export default function BuchhalterPaymentMethods() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: methods } = trpc.restaurantAdmin.paymentMethods.useQuery({ date });
  const fmt = (v: number) => `CHF ${(v ?? 0).toLocaleString("de-CH", { minimumFractionDigits: 2 })}`;
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Zahlungsarten</h1><p className="text-muted-foreground text-sm">Aufschlüsselung nach Zahlungsart (Lesezugriff)</p></div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-background" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Zahlungsarten</CardTitle></CardHeader>
        <CardContent>
          {!methods || methods.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Keine Daten für diesen Tag</p>
          ) : (
            <div className="space-y-3">
              {(methods as any[]).map((m: any) => (
                <div key={m.name} className="flex justify-between text-sm">
                  <span>{m.name}</span>
                  <span className="font-medium">{fmt(m.value)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
