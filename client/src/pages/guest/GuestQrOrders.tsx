import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode } from "lucide-react";
export default function GuestQrOrders() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">QR Bestellungen</h1><p className="text-muted-foreground text-sm">Bestellungen via QR-Code</p></div>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><QrCode className="h-4 w-4" /> QR-Bestellungen</CardTitle></CardHeader>
      <CardContent><p className="text-muted-foreground text-sm text-center py-6">Keine QR-Bestellungen vorhanden</p></CardContent></Card>
    </div>
  );
}
