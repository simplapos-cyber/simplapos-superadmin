import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users2, DollarSign, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MONTHLY_DATA = [
  { month: "Jan", vertraege: 1, provision: 108 },
  { month: "Feb", vertraege: 1, provision: 108 },
  { month: "Mär", vertraege: 2, provision: 216 },
  { month: "Apr", vertraege: 2, provision: 216 },
  { month: "Mai", vertraege: 3, provision: 275 },
  { month: "Jun", vertraege: 3, provision: 137 },
];

export default function PartnerStatistics() {
  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" /> Partner Statistiken
          </h1>
          <p className="text-muted-foreground mt-1">Ihre Leistungsübersicht</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Users2, label: "Verträge gesamt", value: "3", color: "text-blue-600" },
            { icon: Target, label: "Aktive Kunden", value: "2", color: "text-green-600" },
            { icon: DollarSign, label: "Provision gesamt", value: "CHF 412", color: "text-purple-600" },
            { icon: TrendingUp, label: "Conversion Rate", value: "75%", color: "text-orange-600" },
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verträge pro Monat</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={MONTHLY_DATA}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="vertraege" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provision Verlauf (CHF)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={MONTHLY_DATA}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `CHF ${v}`} />
                  <Bar dataKey="provision" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    
  );
}
