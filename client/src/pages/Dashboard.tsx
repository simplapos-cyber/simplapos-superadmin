import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Store, Users, MessageSquare, Star, FileText, Receipt, AlertTriangle, TrendingUp, AlertCircle, CheckCircle2,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

function StatCard({
  title, value, icon: Icon, color, subtitle,
}: {
  title: string; value: number | string; icon: React.ElementType; color: string; subtitle?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}



export default function Dashboard() {
  const { data: stats, isLoading, error, refetch } = trpc.dashboard.stats.useQuery(undefined, {
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-1" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground mb-4">Dashboard-Daten konnten nicht geladen werden.</p>
        <button onClick={() => refetch()} className="px-4 py-2 rounded-lg border text-sm hover:bg-accent">Erneut versuchen</button>
      </div>
    );
  }

  const s = {
    restaurantCount: (stats as any)?.restaurantCount ?? (stats as any)?.restaurants ?? 0,
    userCount: (stats as any)?.userCount ?? (stats as any)?.users ?? 0,
    openChats: (stats as any)?.openChats ?? 0,
    escalatedChats: (stats as any)?.escalatedChats ?? 0,
    pendingReviews: (stats as any)?.pendingReviews ?? 0,
    activeContracts: (stats as any)?.activeContracts ?? (stats as any)?.contracts ?? 0,
    overdueInvoices: (stats as any)?.overdueInvoices ?? 0,
    totalRevenue: (stats as any)?.totalRevenue ?? 0,
    invoiceRevenue: (stats as any)?.invoiceRevenue ?? 0,
    highRiskRestaurants: (stats as any)?.highRiskRestaurants ?? 0,
    contractsToday: (stats as any)?.contractsToday ?? 0,
  };

  const formatCHF = (v: number) =>
    new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(v);

  // Chart data derived from real stats
  const restaurantStatusData = [
    { status: "Aktiv", count: s.activeContracts },
    { status: "Trial", count: Math.max(0, s.restaurantCount - s.activeContracts) },
    { status: "Risiko", count: s.highRiskRestaurants },
    { status: "Rechnungen", count: s.overdueInvoices },
  ];

  const overviewData = [
    { name: "Restaurants", value: s.restaurantCount },
    { name: "Benutzer", value: s.userCount },
    { name: "Chats", value: s.openChats },
    { name: "Bewertungen", value: s.pendingReviews },
    { name: "Verträge", value: s.activeContracts },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Übersicht aller Plattform-Kennzahlen
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <StatCard
          title="Restaurants"
          value={s.restaurantCount}
          icon={Store}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          title="Benutzer"
          value={s.userCount}
          icon={Users}
          color="bg-accent/10 text-accent"
        />
        <StatCard
          title="Offene Chats"
          value={s.openChats}
          icon={MessageSquare}
          color="bg-blue-100 text-blue-600"
          subtitle={s.escalatedChats > 0 ? `${s.escalatedChats} eskaliert` : undefined}
        />
        <StatCard
          title="Bewertungen"
          value={s.pendingReviews}
          icon={Star}
          color="bg-yellow-100 text-yellow-600"
          subtitle="ausstehend"
        />
        <StatCard
          title="Verträge"
          value={s.activeContracts}
          icon={FileText}
          color="bg-green-100 text-green-600"
          subtitle="aktiv"
        />
        <StatCard
          title="Rechnungen"
          value={s.overdueInvoices}
          icon={Receipt}
          color={s.overdueInvoices > 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}
          subtitle="überfällig"
        />
        <StatCard
          title="Plattform-Umsatz"
          value={formatCHF(s.totalRevenue)}
          icon={TrendingUp}
          color="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          title="Rechnungs-Umsatz"
          value={formatCHF(s.invoiceRevenue)}
          icon={CheckCircle2}
          color="bg-teal-100 text-teal-600"
          subtitle="bezahlt"
        />
        <StatCard
          title="Hochrisiko"
          value={s.highRiskRestaurants}
          icon={AlertTriangle}
          color={s.highRiskRestaurants > 0 ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-500"}
          subtitle="Restaurants"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Plattform-Übersicht</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={overviewData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUmsatz" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px" }}
                  formatter={(v: number) => [v, "Anzahl"]}
                />
                <Area type="monotone" dataKey="value" stroke="var(--color-accent)" strokeWidth={2} fill="url(#colorUmsatz)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Restaurant-Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={restaurantStatusData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px" }}
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Anzahl" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {(s.escalatedChats > 0 || s.overdueInvoices > 0 || s.highRiskRestaurants > 0) && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertCircle className="h-4 w-4" />
              Handlungsbedarf
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.escalatedChats > 0 && (
              <p className="text-sm text-orange-700 dark:text-orange-400">
                • {s.escalatedChats} eskalierte Support-Anfragen warten auf Bearbeitung
              </p>
            )}
            {s.overdueInvoices > 0 && (
              <p className="text-sm text-orange-700 dark:text-orange-400">
                • {s.overdueInvoices} überfällige Rechnungen müssen nachverfolgt werden
              </p>
            )}
            {s.highRiskRestaurants > 0 && (
              <p className="text-sm text-orange-700 dark:text-orange-400">
                • {s.highRiskRestaurants} Restaurants mit hohem Risiko-Score
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
