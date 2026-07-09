import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Calculator, Download, TrendingUp, DollarSign, FileText } from "lucide-react";
import { toast } from "sonner";
import { OfflineBanner } from "@/components/OfflineBanner";

const PAYMENT_DATA = [
  { name: "Bar", value: 4200, color: "#3b82f6" },
  { name: "Kreditkarte", value: 8500, color: "#10b981" },
  { name: "Debitkarte", value: 3100, color: "#f59e0b" },
  { name: "TWINT", value: 2800, color: "#8b5cf6" },
];

const INVOICES = [
  { nr: "RE-2026-042", date: "10.06.2026", amount: "CHF 1'842.50", mwst: "CHF 147.40", status: "Bezahlt" },
  { nr: "RE-2026-041", date: "09.06.2026", amount: "CHF 2'105.00", mwst: "CHF 168.40", status: "Bezahlt" },
  { nr: "RE-2026-040", date: "08.06.2026", amount: "CHF 1'560.00", mwst: "CHF 124.80", status: "Bezahlt" },
  { nr: "RE-2026-039", date: "07.06.2026", amount: "CHF 1'920.00", mwst: "CHF 153.60", status: "Offen" },
];

export default function BuchhalterDashboard() {
  return (
    
      <div className="space-y-6">
        <OfflineBanner />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="h-6 w-6" /> Treuhand-Übersicht
            </h1>
            <p className="text-muted-foreground mt-1">Finanzübersicht · Juni 2026 (nur Lesezugriff)</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => toast.info("Export kommt bald")}>
              <Download className="h-4 w-4 mr-2" /> MwSt-Abrechnung
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Export kommt bald")}>
              <Download className="h-4 w-4 mr-2" /> Umsatzbericht
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: DollarSign, label: "Umsatz Juni", value: "CHF 18'600", color: "text-green-600" },
            { icon: TrendingUp, label: "Gewinn (geschätzt)", value: "CHF 5'580", color: "text-blue-600" },
            { icon: Calculator, label: "MwSt (7.7%)", value: "CHF 1'432.20", color: "text-orange-600" },
            { icon: FileText, label: "Rechnungen", value: "4", color: "text-purple-600" },
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
              <CardTitle className="text-base">Umsatz nach Zahlungsart</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={PAYMENT_DATA} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {PAYMENT_DATA.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `CHF ${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Letzte Rechnungen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-3">Nr.</th>
                      <th className="text-left py-2 pr-3">Datum</th>
                      <th className="text-left py-2 pr-3">Betrag</th>
                      <th className="text-left py-2 pr-3">MwSt</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INVOICES.map((inv, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{inv.nr}</td>
                        <td className="py-2 pr-3 text-xs">{inv.date}</td>
                        <td className="py-2 pr-3 font-medium">{inv.amount}</td>
                        <td className="py-2 pr-3 text-xs">{inv.mwst}</td>
                        <td className="py-2">
                          <span className={`text-xs font-medium ${inv.status === "Bezahlt" ? "text-green-600" : "text-orange-600"}`}>{inv.status}</span>
                        </td>
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
