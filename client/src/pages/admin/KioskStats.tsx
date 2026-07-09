import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, TrendingUp, Clock, AlertTriangle,
  CheckCircle, XCircle, Users, ChevronUp, ChevronDown, Download, Timer,
} from "lucide-react";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#ec4899"];

function StatCard({
  title, value, sub, icon: Icon, color = "text-primary",
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`p-3 rounded-xl bg-muted ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground truncate">{title}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function KioskStats() {
  const [days, setDays] = useState(7);
  const [stationId, setStationId] = useState<number | undefined>(undefined);
  const [exportLoading, setExportLoading] = useState(false);

  const stationsQuery = trpc.kiosk.listStations.useQuery();
  const exportQuery = trpc.kiosk.exportKioskStats.useQuery(
    { days },
    { enabled: false }
  );
  const statsQuery = trpc.kiosk.getKioskStats.useQuery(
    { days, stationId },
    { refetchInterval: 30_000 }
  );

  // Wartezeit-Statistiken (LL-7)
  const { data: waitStats } = trpc.kiosk.getWaitStats.useQuery(
    { restaurantId: 0, days },
    { refetchInterval: 60_000 }
  );

  const stats = statsQuery.data;
  const stations = stationsQuery.data ?? [];

  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const result = await exportQuery.refetch();
      if (!result.data) return;
      const { sessionsCsv, productsCsv, stationsCsv, days: d } = result.data;
      const combined = [
        `=== SESSIONS (letzte ${d} Tage) ===`,
        sessionsCsv,
        "",
        `=== TOP-PRODUKTE ===`,
        productsCsv,
        "",
        `=== STATIONEN ===`,
        stationsCsv,
      ].join("\n");
      const blob = new Blob(["\uFEFF" + combined], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kiosk-statistiken-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  }, [exportQuery]);

  const dailyData = useMemo(() => {
    if (!stats) return [];
    return stats.dailyTimeline.map(d => ({
      date: d.date.slice(5), // MM-DD
      Scans: d.sessions,
      Bezahlt: d.paid,
      "Umsatz (CHF)": Number(d.revenue.toFixed(2)),
    }));
  }, [stats]);

  const spotPieData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Bestanden", value: stats.spotChecksPassed },
      { name: "Nicht bestanden", value: stats.spotChecksFailed },
      { name: "Offen", value: stats.spotChecksPending },
    ].filter(d => d.value > 0);
  }, [stats]);

  if (statsQuery.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kiosk Statistiken</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Auswertung aller Kiosk-Transaktionen</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Tage</SelectItem>
              <SelectItem value="14">14 Tage</SelectItem>
              <SelectItem value="30">30 Tage</SelectItem>
              <SelectItem value="90">90 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={stationId ? String(stationId) : "all"}
            onValueChange={v => setStationId(v === "all" ? undefined : Number(v))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Alle Kassen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kassen</SelectItem>
              {stations.map((st: { id: number; name: string }) => (
                <SelectItem key={st.id} value={String(st.id)}>{st.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportLoading}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {exportLoading ? "Exportiere..." : "CSV Export"}
          </Button>
        </div>
      </div>

      {!stats ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Keine Daten verfügbar</CardContent></Card>
      ) : (
        <>
          {/* KPI-Karten */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Gesamte Scans"
              value={stats.totalSessions}
              sub={`${stats.paidSessions} bezahlt`}
              icon={ShoppingCart}
              color="text-blue-500"
            />
            <StatCard
              title="Erfolgsquote"
              value={`${stats.successRate}%`}
              sub={`${stats.abortedSessions} Abbrüche`}
              icon={stats.successRate >= 70 ? ChevronUp : ChevronDown}
              color={stats.successRate >= 70 ? "text-green-500" : "text-red-500"}
            />
            <StatCard
              title="Ø Sitzungsdauer"
              value={formatDuration(stats.avgDurationSec)}
              sub="pro Gast"
              icon={Clock}
              color="text-purple-500"
            />
            <StatCard
              title="Umsatz"
              value={`CHF ${stats.totalRevenue.toFixed(2)}`}
              sub={`${days} Tage`}
              icon={TrendingUp}
              color="text-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Service-Rufe"
              value={stats.serviceCallSessions}
              icon={Users}
              color="text-orange-500"
            />
            <StatCard
              title="Stichproben offen"
              value={stats.spotChecksPending}
              icon={AlertTriangle}
              color="text-yellow-500"
            />
            <StatCard
              title="Stichproben bestanden"
              value={stats.spotChecksPassed}
              icon={CheckCircle}
              color="text-green-500"
            />
            <StatCard
              title="Stichproben nicht bestanden"
              value={stats.spotChecksFailed}
              icon={XCircle}
              color="text-red-500"
            />
          </div>

          {/* Tages-Zeitreihe */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scans & Bezahlungen pro Tag</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Scans" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Bezahlt" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Umsatz-Linie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tagesumsatz (CHF)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={dailyData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`CHF ${v.toFixed(2)}`, "Umsatz"]} />
                  <Line
                    type="monotone"
                    dataKey="Umsatz (CHF)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Top-Produkte */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top-Produkte</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.topProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Noch keine Daten</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topProducts.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-sm font-medium truncate">{p.name}</span>
                            <Badge variant="secondary" className="ml-2 shrink-0">{p.count}×</Badge>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.round((p.count / (stats.topProducts[0]?.count ?? 1)) * 100)}%`,
                                backgroundColor: COLORS[i % COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stichproben-Torte */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stichproben-Ergebnisse</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                {spotPieData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6">Keine Stichproben im Zeitraum</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={spotPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {spotPieData.map((_, i) => (
                          <Cell key={i} fill={["#22c55e", "#ef4444", "#f59e0b"][i] ?? COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stationen-Vergleich */}
          {stats.stationStats.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stationen-Vergleich</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Kasse</th>
                        <th className="text-right py-2 pr-4 font-medium">Scans</th>
                        <th className="text-right py-2 pr-4 font-medium">Bezahlt</th>
                        <th className="text-right py-2 pr-4 font-medium">Quote</th>
                        <th className="text-right py-2 font-medium">Umsatz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.stationStats.map((st: { id: number; name: string; sessions: number; paid: number; revenue: number }) => (
                        <tr key={st.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2 pr-4 font-medium">{st.name}</td>
                          <td className="text-right py-2 pr-4">{st.sessions}</td>
                          <td className="text-right py-2 pr-4">{st.paid}</td>
                          <td className="text-right py-2 pr-4">
                            <Badge variant={st.sessions > 0 && st.paid / st.sessions >= 0.7 ? "default" : "destructive"}>
                              {st.sessions > 0 ? `${Math.round((st.paid / st.sessions) * 100)}%` : "–"}
                            </Badge>
                          </td>
                          <td className="text-right py-2 font-medium">CHF {st.revenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
                  {/* Wartezeit-Analyse (LL-7) */}
          {waitStats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Timer className="h-4 w-4 text-blue-500" />
                  Wartezeit-Analyse (Kasse belegt)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {waitStats.totalWaits === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Noch keine Wartedaten im Zeitraum</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-blue-600">{waitStats.totalWaits}</p>
                        <p className="text-xs text-blue-500">Warteinstanzen</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-amber-600">{formatDuration(waitStats.avgWaitSec)}</p>
                        <p className="text-xs text-amber-500">Ø Wartezeit</p>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-red-600">{formatDuration(waitStats.maxWaitSec)}</p>
                        <p className="text-xs text-red-500">Max. Wartezeit</p>
                      </div>
                    </div>
                    {waitStats.byHour.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Warteinstanzen nach Uhrzeit</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={waitStats.byHour} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}:00`} tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                            <Tooltip labelFormatter={(h: number) => `${h}:00 Uhr`} />
                            <Bar dataKey="count" name="Anzahl" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {waitStats.byStation.length > 1 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Wartezeiten nach Kasse</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="text-left py-2 pr-4 font-medium">Kasse</th>
                                <th className="text-right py-2 pr-4 font-medium">Warteinstanzen</th>
                                <th className="text-right py-2 font-medium">Ø Wartezeit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {waitStats.byStation.map((ws: { stationId: number; count: number; avgSec: number }) => {
                                const stName = (stationsQuery.data ?? []).find((s: { id: number; name: string }) => s.id === ws.stationId)?.name ?? `Kasse ${ws.stationId}`;
                                return (
                                  <tr key={ws.stationId} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                                    <td className="py-2 pr-4 font-medium">{stName}</td>
                                    <td className="text-right py-2 pr-4">{ws.count}</td>
                                    <td className="text-right py-2">{formatDuration(ws.avgSec)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
