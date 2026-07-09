import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DollarSign, TrendingUp, Clock, CheckCircle } from "lucide-react";

const COMMISSIONS = [
  { month: "Juni 2026", restaurant: "Ristorante Bella", revenue: "CHF 1'082", rate: "10%", amount: "CHF 108.20", status: "Ausstehend" },
  { month: "Mai 2026", restaurant: "Ristorante Bella", revenue: "CHF 1'082", rate: "10%", amount: "CHF 108.20", status: "Ausgezahlt" },
  { month: "Juni 2026", restaurant: "Sushi Zen", revenue: "CHF 289", rate: "10%", amount: "CHF 28.90", status: "Ausstehend" },
  { month: "Mai 2026", restaurant: "Sushi Zen", revenue: "CHF 289", rate: "10%", amount: "CHF 28.90", status: "Ausgezahlt" },
];

export default function PartnerCommissions() {
  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" /> Provisionen
          </h1>
          <p className="text-muted-foreground mt-1">Ihre Provisionsabrechnungen</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: TrendingUp, label: "Diesen Monat", value: "CHF 137.10", color: "text-blue-600" },
            { icon: DollarSign, label: "Gesamt", value: "CHF 412.30", color: "text-green-600" },
            { icon: Clock, label: "Ausstehend", value: "CHF 137.10", color: "text-yellow-600" },
            { icon: CheckCircle, label: "Ausgezahlt", value: "CHF 275.20", color: "text-purple-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <s.icon className={`h-5 w-5 ${s.color} mb-1`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <p className="text-sm font-medium">Provisionsübersicht</p>
          </CardHeader>
          <div className="px-6 pb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Monat</th>
                  <th className="text-left py-2 pr-4">Restaurant</th>
                  <th className="text-left py-2 pr-4">Umsatz</th>
                  <th className="text-left py-2 pr-4">Satz</th>
                  <th className="text-left py-2 pr-4">Betrag</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {COMMISSIONS.map((c, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4">{c.month}</td>
                    <td className="py-2.5 pr-4">{c.restaurant}</td>
                    <td className="py-2.5 pr-4">{c.revenue}</td>
                    <td className="py-2.5 pr-4">{c.rate}</td>
                    <td className="py-2.5 pr-4 font-medium">{c.amount}</td>
                    <td className="py-2.5">
                      <Badge className={c.status === "Ausgezahlt" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    
  );
}
