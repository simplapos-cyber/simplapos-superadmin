import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp, ShoppingBag, CreditCard, Banknote, Users, Calendar,
  BarChart3, Clock, ArrowUpRight, ArrowDownRight, Download
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];
const WOCHENTAG_ORDER = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function fmt(n: number | string | undefined) {
  const v = parseFloat(String(n || 0));
  return new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function fmtInt(n: number | string | undefined) {
  return new Intl.NumberFormat("de-CH").format(parseInt(String(n || 0)));
}

// ─── KPI-Karte ────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, color = "indigo" }: {
  title: string; value: string; sub?: string; icon: any; color?: string;
}) {
  return (
    <Card className="border-0 shadow-sm bg-card">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{title}</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 shrink-0 ml-3`}>
            <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Gesamtübersicht ──────────────────────────────────────────────────────────
function GesamtUebersicht() {
  const { data: stats } = trpc.qrorpa.getGesamtstatistik.useQuery();
  const { data: monthly } = trpc.qrorpa.getMonthlyOverview.useQuery();

  const chartData = useMemo(() => {
    if (!monthly) return [];
    return (monthly as any[]).map(m => ({
      name: `${String(m.monat).padStart(2, "0")}/${m.jahr}`,
      Umsatz: parseFloat(m.umsatz || 0),
      Bestellungen: parseInt(m.anzahl || 0),
    }));
  }, [monthly]);

  if (!stats) return <div className="p-8 text-center text-muted-foreground">Lade Daten…</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Gesamtumsatz" value={`CHF ${fmt(stats.total_umsatz)}`} sub="Okt 2025 – Jul 2026" icon={TrendingUp} />
        <KpiCard title="Bestellungen" value={fmtInt(stats.total_bestellungen)} sub="Gesamt" icon={ShoppingBag} />
        <KpiCard title="Ø pro Bestellung" value={`CHF ${fmt(stats.durchschnitt)}`} sub="Durchschnitt" icon={BarChart3} />
        <KpiCard title="Mitarbeiter" value={fmtInt(stats.anzahl_mitarbeiter)} sub="Aktiv" icon={Users} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KpiCard title="Kartenzahlung" value={`CHF ${fmt(stats.karte_umsatz)}`}
          sub={`${fmt((parseFloat(stats.karte_umsatz || 0) / parseFloat(stats.total_umsatz || 1) * 100))}%`} icon={CreditCard} />
        <KpiCard title="Barzahlung" value={`CHF ${fmt(stats.bar_umsatz)}`}
          sub={`${fmt((parseFloat(stats.bar_umsatz || 0) / parseFloat(stats.total_umsatz || 1) * 100))}%`} icon={Banknote} />
      </div>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Monatlicher Umsatz (CHF)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => [`CHF ${fmt(v)}`, "Umsatz"]} />
              <Bar dataKey="Umsatz" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tagesbericht ─────────────────────────────────────────────────────────────
function Tagesbericht() {
  const [datum, setDatum] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  });
  const { data, isLoading } = trpc.qrorpa.getDailyReport.useQuery({ datum });

  const stundeDaten = useMemo(() => {
    if (!data?.byStunde) return [];
    return (data.byStunde as any[]).map(s => ({
      stunde: `${String(s.stunde).padStart(2, "0")}:00`,
      Umsatz: parseFloat(s.umsatz || 0),
      Bestellungen: parseInt(s.anzahl || 0),
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="w-44" />
        <span className="text-sm text-muted-foreground">Tagesbericht für {datum}</span>
      </div>
      {isLoading && <div className="p-8 text-center text-muted-foreground">Lade…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Tagesumsatz" value={`CHF ${fmt(data.overview?.umsatz)}`} icon={TrendingUp} />
            <KpiCard title="Bestellungen" value={fmtInt(data.overview?.anzahl)} icon={ShoppingBag} />
            <KpiCard title="Karte" value={`CHF ${fmt(data.overview?.karte_umsatz)}`} sub={`${fmtInt(data.overview?.karte_anzahl)} Transaktionen`} icon={CreditCard} />
            <KpiCard title="Bar" value={`CHF ${fmt(data.overview?.bar_umsatz)}`} sub={`${fmtInt(data.overview?.bar_anzahl)} Transaktionen`} icon={Banknote} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Umsatz nach Stunde</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stundeDaten}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="stunde" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}`} />
                    <Tooltip formatter={(v: any) => [`CHF ${fmt(v)}`, "Umsatz"]} />
                    <Bar dataKey="Umsatz" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Mitarbeiter</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(data.byMitarbeiter as any[]).map((m, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-sm font-medium">{m.mitarbeiter || "Unbekannt"}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold">CHF {fmt(m.umsatz)}</span>
                        <span className="text-xs text-muted-foreground ml-2">({fmtInt(m.anzahl)} Bestellungen)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Alle Bestellungen ({fmtInt(data.overview?.anzahl)})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Zeit</th>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Tisch</th>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Mitarbeiter</th>
                      <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Betrag</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Zahlung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.bestellungen as any[]).map((b, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-1.5 pr-4 text-muted-foreground">{b.uhrzeit}</td>
                        <td className="py-1.5 pr-4">{b.tisch}</td>
                        <td className="py-1.5 pr-4">{b.mitarbeiter}</td>
                        <td className="py-1.5 pr-4 text-right font-medium">CHF {fmt(b.betrag_chf)}</td>
                        <td className="py-1.5">
                          <Badge variant={b.zahlungsmethode === "Kartenzahlung" ? "default" : "secondary"} className="text-xs">
                            {b.zahlungsmethode === "Kartenzahlung" ? "Karte" : "Bar"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Monatsbericht ────────────────────────────────────────────────────────────
function Monatsbericht() {
  const { data: months } = trpc.qrorpa.getAvailableMonths.useQuery();
  const [selected, setSelected] = useState<string>("6-2026");

  const [monat, jahr] = useMemo(() => {
    const [m, y] = selected.split("-");
    return [parseInt(m), parseInt(y)];
  }, [selected]);

  const { data, isLoading } = trpc.qrorpa.getMonthlyReport.useQuery({ monat, jahr });

  const tagDaten = useMemo(() => {
    if (!data?.byTag) return [];
    return (data.byTag as any[]).map(t => ({
      datum: t.datum ? String(t.datum).slice(5) : "",
      tag: t.wochentag?.slice(0, 2) || "",
      Umsatz: parseFloat(t.umsatz || 0),
    }));
  }, [data]);

  const wochentagDaten = useMemo(() => {
    if (!data?.byWochentag) return [];
    const sorted = [...(data.byWochentag as any[])].sort(
      (a, b) => WOCHENTAG_ORDER.indexOf(a.wochentag) - WOCHENTAG_ORDER.indexOf(b.wochentag)
    );
    return sorted.map(w => ({
      tag: w.wochentag?.slice(0, 2) || "",
      Umsatz: parseFloat(w.umsatz || 0),
      Bestellungen: parseInt(w.anzahl || 0),
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Monat wählen" />
          </SelectTrigger>
          <SelectContent>
            {(months as any[] || []).map((m: any) => (
              <SelectItem key={`${m.monat}-${m.jahr}`} value={`${m.monat}-${m.jahr}`}>
                {m.monat_name} ({fmtInt(m.anzahl)} Bestellungen)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading && <div className="p-8 text-center text-muted-foreground">Lade…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Monatsumsatz" value={`CHF ${fmt(data.overview?.umsatz)}`} icon={TrendingUp} />
            <KpiCard title="Bestellungen" value={fmtInt(data.overview?.anzahl)} icon={ShoppingBag} />
            <KpiCard title="Ø Bestellung" value={`CHF ${fmt(data.overview?.durchschnitt)}`} icon={BarChart3} />
            <KpiCard title="Karte / Bar" value={`${fmtInt(data.overview?.karte_anzahl)} / ${fmtInt(data.overview?.bar_anzahl)}`} icon={CreditCard} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Tagesumsatz</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={tagDaten}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="datum" tick={{ fontSize: 9 }} interval={Math.floor(tagDaten.length / 8)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                    <Tooltip formatter={(v: any) => [`CHF ${fmt(v)}`, "Umsatz"]} />
                    <Line type="monotone" dataKey="Umsatz" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Umsatz nach Wochentag</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={wochentagDaten}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="tag" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                    <Tooltip formatter={(v: any) => [`CHF ${fmt(v)}`, "Umsatz"]} />
                    <Bar dataKey="Umsatz" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Mitarbeiter-Umsatz</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(data.byMitarbeiter as any[]).map((m, i) => {
                    const total = (data.byMitarbeiter as any[]).reduce((s, x) => s + parseFloat(x.umsatz || 0), 0);
                    const pct = total > 0 ? (parseFloat(m.umsatz || 0) / total * 100) : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{m.mitarbeiter || "Unbekannt"}</span>
                          <span className="font-bold">CHF {fmt(m.umsatz)} <span className="text-muted-foreground font-normal text-xs">({pct.toFixed(1)}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Zahlungsmethoden</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={(data.byZahlung as any[]).map(z => ({ name: z.zahlungsmethode, value: parseFloat(z.umsatz || 0) }))}
                      cx="50%" cy="50%" outerRadius={70} dataKey="value"
                      label={({ name, percent }) => `${name?.slice(0, 4)} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}>
                      {(data.byZahlung as any[]).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`CHF ${fmt(v)}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Jahresbericht ────────────────────────────────────────────────────────────
function Jahresbericht() {
  const [jahr, setJahr] = useState(2026);
  const { data, isLoading } = trpc.qrorpa.getYearlyReport.useQuery({ jahr });

  const monatDaten = useMemo(() => {
    if (!data?.byMonat) return [];
    return (data.byMonat as any[]).map(m => ({
      monat: m.monat_name?.split(" ")[0]?.slice(0, 3) || `M${m.monat}`,
      Umsatz: parseFloat(m.umsatz || 0),
      Bestellungen: parseInt(m.anzahl || 0),
    }));
  }, [data]);

  const quartalDaten = useMemo(() => {
    if (!data?.byQuartal) return [];
    return (data.byQuartal as any[]).map(q => ({
      quartal: `Q${q.quartal}`,
      Umsatz: parseFloat(q.umsatz || 0),
      Bestellungen: parseInt(q.anzahl || 0),
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={String(jahr)} onValueChange={v => setJahr(parseInt(v))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2025">2025</SelectItem>
            <SelectItem value="2026">2026</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading && <div className="p-8 text-center text-muted-foreground">Lade…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Jahresumsatz" value={`CHF ${fmt(data.overview?.umsatz)}`} icon={TrendingUp} />
            <KpiCard title="Bestellungen" value={fmtInt(data.overview?.anzahl)} icon={ShoppingBag} />
            <KpiCard title="Karte" value={`CHF ${fmt(data.overview?.karte_umsatz)}`} icon={CreditCard} />
            <KpiCard title="Bar" value={`CHF ${fmt(data.overview?.bar_umsatz)}`} icon={Banknote} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monatsumsatz {jahr}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monatDaten}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="monat" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [`CHF ${fmt(v)}`, "Umsatz"]} />
                    <Bar dataKey="Umsatz" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Quartalsumsatz {jahr}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={quartalDaten}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="quartal" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [`CHF ${fmt(v)}`, "Umsatz"]} />
                    <Bar dataKey="Umsatz" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Mitarbeiter-Jahresauswertung</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Mitarbeiter</th>
                      <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Bestellungen</th>
                      <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Umsatz CHF</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Ø Bestellung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.byMitarbeiter as any[]).map((m, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-2 pr-4 font-medium">{m.mitarbeiter || "Unbekannt"}</td>
                        <td className="py-2 pr-4 text-right">{fmtInt(m.anzahl)}</td>
                        <td className="py-2 pr-4 text-right font-bold">CHF {fmt(m.umsatz)}</td>
                        <td className="py-2 text-right text-muted-foreground">CHF {fmt(parseFloat(m.umsatz || 0) / parseInt(m.anzahl || 1))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Mitarbeiter-Auswertung ───────────────────────────────────────────────────
function MitarbeiterAuswertung() {
  const { data: months } = trpc.qrorpa.getAvailableMonths.useQuery();
  const [filter, setFilter] = useState<string>("all-2026");

  const [monat, jahr] = useMemo(() => {
    if (filter === "all-2025") return [undefined, 2025];
    if (filter === "all-2026") return [undefined, 2026];
    const [m, y] = filter.split("-");
    return [parseInt(m), parseInt(y)];
  }, [filter]);

  const { data, isLoading } = trpc.qrorpa.getMitarbeiterReport.useQuery({ monat, jahr });

  const total = useMemo(() => {
    if (!data) return 0;
    return (data as any[]).reduce((s, m) => s + parseFloat(m.umsatz || 0), 0);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-2026">Ganzes Jahr 2026</SelectItem>
            <SelectItem value="all-2025">Ganzes Jahr 2025</SelectItem>
            {(months as any[] || []).map((m: any) => (
              <SelectItem key={`${m.monat}-${m.jahr}`} value={`${m.monat}-${m.jahr}`}>
                {m.monat_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading && <div className="p-8 text-center text-muted-foreground">Lade…</div>}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Umsatz-Ranking</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(data as any[]).map((m, i) => {
                  const pct = total > 0 ? (parseFloat(m.umsatz || 0) / total * 100) : 0;
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                          <span className="text-sm font-medium">{m.mitarbeiter || "Unbekannt"}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold">CHF {fmt(m.umsatz)}</span>
                          <span className="text-xs text-muted-foreground ml-1">({pct.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${pct}%`,
                          background: `hsl(${240 + i * 20}, 70%, 60%)`
                        }} />
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{fmtInt(m.anzahl)} Bestellungen</span>
                        <span>Ø CHF {fmt(parseFloat(m.umsatz || 0) / parseInt(m.anzahl || 1))}</span>
                        <span>Karte: {fmtInt(m.karte_anzahl)} | Bar: {fmtInt(m.bar_anzahl)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Umsatzverteilung</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={(data as any[]).map(m => ({ name: m.mitarbeiter || "Unbekannt", value: parseFloat(m.umsatz || 0) }))}
                    cx="50%" cy="50%" outerRadius={100} dataKey="value"
                    label={({ name, percent }) => percent > 0.05 ? `${name?.split(" ")[0]} ${(percent * 100).toFixed(0)}%` : ""}
                  >
                    {(data as any[]).map((_, i) => <Cell key={i} fill={`hsl(${240 + i * 25}, 65%, ${55 + i * 3}%)`} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`CHF ${fmt(v)}`, ""]} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function QrorpaStatistiken() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Verkaufsstatistiken</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Passagino Gourmet GmbH · QRorpa-Daten · Okt 2025 – Jul 2026</p>
        </div>
        <Badge variant="outline" className="text-xs">
          <TrendingUp className="h-3 w-3 mr-1" />
          12.461 Bestellungen · CHF 303.370,08
        </Badge>
      </div>
      <Tabs defaultValue="uebersicht" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="tag">Tagesbericht</TabsTrigger>
          <TabsTrigger value="monat">Monatsbericht</TabsTrigger>
          <TabsTrigger value="jahr">Jahresbericht</TabsTrigger>
          <TabsTrigger value="mitarbeiter">Mitarbeiter</TabsTrigger>
        </TabsList>
        <TabsContent value="uebersicht"><GesamtUebersicht /></TabsContent>
        <TabsContent value="tag"><Tagesbericht /></TabsContent>
        <TabsContent value="monat"><Monatsbericht /></TabsContent>
        <TabsContent value="jahr"><Jahresbericht /></TabsContent>
        <TabsContent value="mitarbeiter"><MitarbeiterAuswertung /></TabsContent>
      </Tabs>
    </div>
  );
}
