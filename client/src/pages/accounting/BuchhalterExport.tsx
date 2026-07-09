import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { toast } from "sonner";

export default function BuchhalterExport() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Export</h1><p className="text-muted-foreground text-sm">Daten exportieren (Lesezugriff)</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "CSV Export", desc: "Umsatzdaten als CSV-Datei", format: "CSV" },
          { label: "DATEV Export", desc: "Für Steuerberater (DATEV-Format)", format: "DATEV" },
          { label: "PDF Bericht", desc: "Monatsbericht als PDF", format: "PDF" },
          { label: "Excel Export", desc: "Alle Daten als Excel-Datei", format: "XLSX" },
        ].map((ex) => (
          <Card key={ex.label} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{ex.label}</p>
                    <p className="text-xs text-muted-foreground">{ex.desc}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => toast.info(`${ex.format}-Export kommt bald`)}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
