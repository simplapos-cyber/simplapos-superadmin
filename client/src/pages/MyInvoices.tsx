import { Card, CardContent } from "@/components/ui/card";
import { Receipt } from "lucide-react";

export default function MyInvoices() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meine Rechnungen</h1>
        <p className="text-muted-foreground mt-1">
          Übersicht Ihrer bisherigen Bestellungen und Rechnungen
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Receipt className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">Keine Rechnungen vorhanden</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-2">
            Sobald Sie eine Bestellung über das SimplaPOS-Kassensystem aufgeben,
            werden Ihre Rechnungen hier angezeigt.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
