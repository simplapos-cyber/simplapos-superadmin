import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Users, UtensilsCrossed, DollarSign, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { OfflineBanner } from "@/components/OfflineBanner";

const RECENT_ORDERS = [
  { id: "#042", table: "Tisch 5", items: 3, total: "CHF 68.50", status: "Offen", time: "19:32" },
  { id: "#041", table: "Tisch 2", items: 2, total: "CHF 34.00", status: "In Zubereitung", time: "19:28" },
  { id: "#040", table: "Tisch 8", items: 5, total: "CHF 112.00", status: "Bereit", time: "19:20" },
  { id: "#039", table: "Tisch 1", items: 1, total: "CHF 18.50", status: "Bezahlt", time: "19:15" },
];

const STAFF = [
  { name: "Max Müller", role: "Kellner", status: "Aktiv", tables: 3 },
  { name: "Anna Bauer", role: "Kellner", status: "Aktiv", tables: 2 },
  { name: "Peter Schmid", role: "Koch", status: "Aktiv", tables: 0 },
  { name: "Lisa Weber", role: "Barkeeper", status: "Pause", tables: 0 },
];

const STATUS_COLORS: Record<string, string> = {
  Offen: "bg-blue-100 text-blue-800",
  "In Zubereitung": "bg-yellow-100 text-yellow-800",
  Bereit: "bg-green-100 text-green-800",
  Bezahlt: "bg-gray-100 text-gray-700",
};

export default function ManagerDashboard() {
  const [, navigate] = useLocation();

  return (
    
      <div className="space-y-6">
        <OfflineBanner />
        <div>
          <h1 className="text-2xl font-bold">Manager Dashboard</h1>
          <p className="text-muted-foreground mt-1">Live-Übersicht · {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: UtensilsCrossed, label: "Aktive Bestellungen", value: "3", color: "text-blue-600" },
            { icon: BarChart3, label: "Tische belegt", value: "5/12", color: "text-orange-600" },
            { icon: Users, label: "Personal im Dienst", value: "4", color: "text-green-600" },
            { icon: DollarSign, label: "Umsatz heute", value: "CHF 233.00", color: "text-purple-600" },
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Aktuelle Bestellungen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {RECENT_ORDERS.map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30">
                    <div>
                      <span className="font-mono text-sm font-bold">{o.id}</span>
                      <span className="text-sm text-muted-foreground ml-2">{o.table}</span>
                      <span className="text-xs text-muted-foreground ml-2">{o.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{o.total}</span>
                      <Badge className={STATUS_COLORS[o.status]}>{o.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Personal im Dienst
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {STAFF.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.role}{s.tables > 0 ? ` · ${s.tables} Tische` : ""}</p>
                    </div>
                    <Badge className={s.status === "Aktiv" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate("/admin/tables")}>
            <UtensilsCrossed className="h-4 w-4 mr-2" /> Tischplan
          </Button>
          <Button variant="outline" onClick={() => toast.info("Bestellübersicht")}>
            <Clock className="h-4 w-4 mr-2" /> Bestellungen
          </Button>
          <Button variant="outline" onClick={() => navigate("/manager/statistics")}>
            <TrendingUp className="h-4 w-4 mr-2" /> Statistiken
          </Button>
        </div>
      </div>
    
  );
}
