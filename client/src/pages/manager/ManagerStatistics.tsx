import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Download } from "lucide-react";
import { toast } from "sonner";

const DAILY_REVENUE = [
  { day: "Mo", revenue: 1842 },
  { day: "Di", revenue: 2105 },
  { day: "Mi", revenue: 1560 },
  { day: "Do", revenue: 1920 },
  { day: "Fr", revenue: 2840 },
  { day: "Sa", revenue: 3200 },
  { day: "So", revenue: 2650 },
];

const TOP_ITEMS = [
  { name: "Pizza Margherita", sold: 42, revenue: "CHF 756.00" },
  { name: "Pasta Carbonara", sold: 35, revenue: "CHF 630.00" },
  { name: "Burger Classic", sold: 28, revenue: "CHF 504.00" },
  { name: "Tiramisu", sold: 24, revenue: "CHF 192.00" },
  { name: "Mineralwasser", sold: 68, revenue: "CHF 204.00" },
];

const STAFF_PERF = [
  { name: "Max Müller", orders: 47, avgTime: "12 Min.", tips: "CHF 38.00" },
  { name: "Anna Bauer", orders: 39, avgTime: "14 Min.", tips: "CHF 29.00" },
  { name: "Lisa Weber", orders: 31, avgTime: "11 Min.", tips: "CHF 42.00" },
];

export default function ManagerStatistics() {
  return (
    
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6" /> Statistiken
            </h1>
            <p className="text-muted-foreground mt-1">Diese Woche · 5.–11. Juni 2026</p>
          </div>
          <Button variant="outline" onClick={() => toast.info("Export kommt bald")}>
            <Download className="h-4 w-4 mr-2" /> Exportieren
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tagesumsatz (CHF)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={DAILY_REVENUE}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(v: number) => `CHF ${v.toLocaleString()}`} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Artikel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Artikel</th>
                      <th className="text-left py-2 pr-4">Verkauft</th>
                      <th className="text-left py-2">Umsatz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOP_ITEMS.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{item.name}</td>
                        <td className="py-2 pr-4">{item.sold}x</td>
                        <td className="py-2">{item.revenue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal-Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Name</th>
                      <th className="text-left py-2 pr-4">Bestellungen</th>
                      <th className="text-left py-2 pr-4">Ø Zeit</th>
                      <th className="text-left py-2">Trinkgeld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAFF_PERF.map((s, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{s.name}</td>
                        <td className="py-2 pr-4">{s.orders}</td>
                        <td className="py-2 pr-4">{s.avgTime}</td>
                        <td className="py-2">{s.tips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    
  );
}
