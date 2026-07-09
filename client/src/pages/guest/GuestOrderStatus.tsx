import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
export default function GuestOrderStatus() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Bestellstatus</h1><p className="text-muted-foreground text-sm">Status deiner aktuellen Bestellung</p></div>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Aktueller Status</CardTitle></CardHeader>
      <CardContent><p className="text-muted-foreground text-sm text-center py-6">Keine aktive Bestellung</p></CardContent></Card>
    </div>
  );
}
