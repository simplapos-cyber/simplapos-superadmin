import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt } from "lucide-react";

export default function BuchhalterInvoices() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Rechnungen</h1><p className="text-muted-foreground text-sm">Ausgestellte Rechnungen (Lesezugriff)</p></div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Rechnungsarchiv</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-sm text-center py-6">Keine Rechnungen vorhanden</p></CardContent>
      </Card>
    </div>
  );
}
