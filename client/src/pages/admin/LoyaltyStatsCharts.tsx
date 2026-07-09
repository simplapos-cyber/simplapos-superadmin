import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2 } from "lucide-react";

interface StatsData {
  tierDistribution?: Array<{ tier: string; count: number }>;
  topCustomers?: Array<{ id: number; firstName: string; lastName: string; lifetimePoints: number }>;
  newMembersTrend?: Array<{ day: string; count: number }>;
  pointsTrend?: Array<{ day: string; issued: number; redeemed: number }>;
}

export default function LoyaltyStatsCharts({ stats }: { stats: StatsData }) {
  const TIER_LABELS: Record<string, string> = {
    bronze: "Bronze", silver: "Silber", gold: "Gold", platinum: "Platin",
  };

  return (
    <>
      {/* Stufen-Verteilung + Top-Kunden */}
      {((stats.tierDistribution ?? []).length > 0 || (stats.topCustomers ?? []).length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(stats.tierDistribution ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Stufen-Verteilung</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={(stats.tierDistribution ?? []).map((t) => ({
                        name: TIER_LABELS[t.tier] ?? t.tier,
                        value: Number(t.count),
                      }))}
                      cx="50%" cy="50%" outerRadius={70}
                      dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                      labelLine={false}
                    >
                      {(stats.tierDistribution ?? []).map((_: any, i: number) => (
                        <Cell key={i} fill={["#cd7f32", "#9ca3af", "#f59e0b", "#8b5cf6"][i % 4]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-sm">Top 5 Kunden</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(stats.topCustomers ?? []).map((c: any, i: number) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <span className="font-medium">{c.firstName} {c.lastName}</span>
                    </div>
                    <span className="text-purple-500 font-semibold">{Number(c.lifetimePoints ?? 0).toLocaleString("de-CH")} Pts</span>
                  </div>
                ))}
                {(stats.topCustomers ?? []).length === 0 && <p className="text-sm text-muted-foreground">Noch keine Daten</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Neue Mitglieder Trend */}
      {(stats.newMembersTrend ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Neue Mitglieder (letzte 30 Tage)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.newMembersTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v: any) => [v, "Neue Mitglieder"]} labelFormatter={(l: string) => l} />
                <Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="#8b5cf620" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Punkte-Verlauf */}
      {(stats.pointsTrend ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Punkte-Verlauf (letzte 30 Tage)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.pointsTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="issued" name="Vergeben" fill="#22c55e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="redeemed" name="Eingelöst" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Leer-Zustand */}
      {(stats.newMembersTrend ?? []).length === 0 && (stats.pointsTrend ?? []).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Noch keine Trend-Daten vorhanden.</p>
            <p className="text-sm mt-1">Sobald Kunden registriert sind und Punkte gesammelt haben, erscheinen hier die Charts.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
