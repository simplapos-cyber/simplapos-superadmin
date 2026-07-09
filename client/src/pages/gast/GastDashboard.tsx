import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, BarChart3, UtensilsCrossed, Clock } from "lucide-react";
import { toast } from "sonner";

const RECENT_ORDERS = [
  { id: "#042", table: "Tisch 5", items: "Pizza Margherita, Pasta Carbonara", total: "CHF 68.50", time: "19:32", status: "In Zubereitung" },
  { id: "#041", table: "Tisch 2", items: "Burger Classic, Pommes", total: "CHF 34.00", time: "19:28", status: "Bereit" },
  { id: "#040", table: "Tisch 8", items: "Wiener Schnitzel ×2", total: "CHF 112.00", time: "19:20", status: "Bezahlt" },
];

const STATUS_COLORS: Record<string, string> = {
  "In Zubereitung": "bg-yellow-100 text-yellow-800",
  Bereit: "bg-green-100 text-green-800",
  Bezahlt: "bg-gray-100 text-gray-700",
};

export default function GastDashboard() {
  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="h-6 w-6" /> Gast-Übersicht
          </h1>
          <p className="text-muted-foreground mt-1">Nur Lesezugriff · Live-Ansicht</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: UtensilsCrossed, label: "Aktive Bestellungen", value: "2", color: "text-blue-600" },
            { icon: BarChart3, label: "Tische belegt", value: "5/12", color: "text-orange-600" },
            { icon: Clock, label: "Ø Wartezeit", value: "12 Min.", color: "text-green-600" },
            { icon: BarChart3, label: "Umsatz heute", value: "CHF 214.50", color: "text-purple-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <s.icon className={`h-5 w-5 ${s.color} mb-1`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktuelle Bestellungen (nur Ansicht)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {RECENT_ORDERS.map((o) => (
                <div key={o.id} className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/30">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold">{o.id}</span>
                      <span className="text-sm text-muted-foreground">{o.table}</span>
                      <span className="text-xs text-muted-foreground">{o.time}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{o.items}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-medium">{o.total}</span>
                    <Badge className={STATUS_COLORS[o.status]}>{o.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="p-4 rounded-lg bg-muted/40 border border-dashed text-center">
          <p className="text-sm text-muted-foreground">
            Du hast Lesezugriff. Um Bestellungen aufzugeben oder Änderungen vorzunehmen, wende dich an den Administrator.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => toast.info("Kontakt-Feature kommt bald")}>
            Administrator kontaktieren
          </Button>
        </div>
      </div>
    
  );
}
