import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users2, Search, TrendingUp, DollarSign, UserCheck } from "lucide-react";

const CUSTOMERS = [
  { restaurant: "Ristorante Bella", owner: "Marco Rossi", date: "01.05.2026", plan: "Professional", status: "Aktiv", revenue: "CHF 1'082" },
  { restaurant: "Sushi Zen", owner: "Yuki Tanaka", date: "15.04.2026", plan: "Starter", status: "Aktiv", revenue: "CHF 289" },
  { restaurant: "Burger Palace", owner: "Thomas Müller", date: "20.03.2026", plan: "Enterprise", status: "Gesperrt", revenue: "CHF 0" },
];

const STATUS_COLORS: Record<string, string> = {
  Aktiv: "bg-green-100 text-green-800",
  Ausstehend: "bg-yellow-100 text-yellow-800",
  Gesperrt: "bg-red-100 text-red-800",
};

export default function PartnerCustomers() {
  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users2 className="h-6 w-6" /> Meine Kunden
          </h1>
          <p className="text-muted-foreground mt-1">Übersicht aller Ihrer Kundenrestaurants</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Users2, label: "Gesamt Kunden", value: "3", color: "text-blue-600" },
            { icon: UserCheck, label: "Aktive Kunden", value: "2", color: "text-green-600" },
            { icon: DollarSign, label: "Monatliche Provision", value: "CHF 137", color: "text-purple-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <s.icon className={`h-8 w-8 ${s.color}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-bold">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Restaurant suchen..." className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Restaurant</th>
                    <th className="text-left py-2 pr-4">Inhaber</th>
                    <th className="text-left py-2 pr-4">Vertragsdatum</th>
                    <th className="text-left py-2 pr-4">Plan</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2">Monatl. Umsatz</th>
                  </tr>
                </thead>
                <tbody>
                  {CUSTOMERS.map((c, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 pr-4 font-medium">{c.restaurant}</td>
                      <td className="py-2.5 pr-4">{c.owner}</td>
                      <td className="py-2.5 pr-4">{c.date}</td>
                      <td className="py-2.5 pr-4"><Badge variant="outline">{c.plan}</Badge></td>
                      <td className="py-2.5 pr-4"><Badge className={STATUS_COLORS[c.status]}>{c.status}</Badge></td>
                      <td className="py-2.5 font-medium">{c.revenue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    
  );
}
