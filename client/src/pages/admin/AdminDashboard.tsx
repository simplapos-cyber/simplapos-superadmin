import { useState, useRef, useEffect, useMemo, memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Clock, Users, Utensils, Wifi, WifiOff,
  Printer, Monitor, CreditCard, AlertTriangle, CheckCircle, XCircle,
  ChefHat, Beer, Truck, ShoppingBag, Sparkles, Brain, Target,
  Lightbulb, Shield, BarChart3, MapPin, ArrowUpRight, ArrowDownRight,
  Package, UserPlus, UserCheck, Heart, Building2, CircleDot,
  RefreshCw, Bell, Loader2,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import NetworkMonitor from "@/components/NetworkMonitor";
import { OfflineBanner } from "@/components/OfflineBanner";
// Fallback data for sections not yet backed by live endpoints
import {
  liveStatus as fallbackLiveStatus,
  activeOrders as fallbackActiveOrders, productionTime, delayedOrders, reservations,
  staffKPIs,
  revenueByCategory, bestMarginProducts, worstMarginProducts, cancelledProducts,
  soonOutOfStock, costOfGoods, margins,
  customerStats, topCustomers, customerGrowth,
  alerts as fallbackAlerts, locations,
} from "./dashboardData";

// ─── HELPERS ────────────────────────────────────────────────────────────────
function SectionErrorFallback() {
  const { t } = useLanguage();
  return <div className="p-4 text-sm text-muted-foreground text-center border rounded-lg border-dashed">{t("admin.sectionLoadError")}</div>;
}

function formatCHF(amount: number) {
  return `CHF ${amount.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusDot({ status }: { status: "ok" | "warning" | "error" }) {
  const colors = { ok: "bg-green-500", warning: "bg-amber-500", error: "bg-red-500" };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]} animate-pulse`} />;
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
    </div>
  );
}

// ─── SEKTION 1: LIVE STATUS ─────────────────────────────────────────────────
function LiveStatusSection() {
  const { t } = useLanguage();
  const { data: stats, isLoading, error } = trpc.restaurantAdmin.dashboardStats.useQuery(undefined, {
    retry: 1,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <SectionSkeleton />;
  if (error) return <div className="p-4 text-sm text-muted-foreground text-center border rounded-lg">{t("admin.liveStatusUnavailable")}</div>;

  const s = stats || { todayOrderCount: 0, todayRevenue: 0, openOrderCount: 0, totalTables: 0, occupiedTables: 0, staffCount: 0 };
  const freeTables = s.totalTables - s.occupiedTables;
  const systemStatus = fallbackLiveStatus.systemStatus; // System status from hardware monitoring (future)

  return (
    <section>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Tagesumsatz */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("admin.revenueToday")}</span>
              <ArrowUpRight className="h-4 w-4 text-green-600" />
            </div>
            <p className="text-xl md:text-2xl font-bold">{formatCHF(Number(s.todayRevenue) || 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.todayOrderCount} Bestellungen</p>
          </CardContent>
        </Card>

        {/* Offene Bestellungen */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("tables.open")}</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold">{s.openOrderCount}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("nav.orders")}</p>
          </CardContent>
        </Card>

        {/* Tische */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("nav.tables")}</span>
              <Utensils className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold">{s.occupiedTables}/{s.totalTables}</p>
            <p className="text-xs text-muted-foreground mt-1">{freeTables} frei</p>
          </CardContent>
        </Card>

        {/* Mitarbeiter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("nav.staff")}</span>
              <Users className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold">{s.staffCount}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("kellner.active")}</p>
          </CardContent>
        </Card>

        {/* Systemstatus */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("settings.system")}</span>
            </div>
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center gap-2 text-xs">
                <StatusDot status={systemStatus.internet} /><Wifi className="h-3 w-3" /><span>{t("settings.internet")}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <StatusDot status={systemStatus.printer} /><Printer className="h-3 w-3" /><span>{t("admin.printer")}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <StatusDot status={systemStatus.kitchenDisplay} /><Monitor className="h-3 w-3" /><span>{t("admin.kds")}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <StatusDot status={systemStatus.paymentTerminal} /><CreditCard className="h-3 w-3" /><span>{t("admin.terminal")}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── SEKTION 2: UMSATZANALYSE ───────────────────────────────────────────────
function RevenueSection() {
  const { t } = useLanguage();
  const [period, setPeriod] = useState("today");
  const { data: hourlyData, isLoading: hourlyLoading, error: e1 } = trpc.restaurantAdmin.revenueByHour.useQuery(undefined, { retry: 0, staleTime: 60000, refetchOnWindowFocus: false });
  const { data: summary, isLoading: summaryLoading, error: e2 } = trpc.restaurantAdmin.revenueSummary.useQuery(undefined, { retry: 0, staleTime: 60000, refetchOnWindowFocus: false });
  const { data: payments, isLoading: paymentsLoading, error: e3 } = trpc.restaurantAdmin.paymentMethods.useQuery(undefined, { retry: 0, staleTime: 60000, refetchOnWindowFocus: false });

  const isLoading = hourlyLoading || summaryLoading || paymentsLoading;
  const hasError = e1 || e2 || e3;

  // Period multiplier for non-today views (simulated until backend supports date ranges)
  const multipliers: Record<string, number> = {
    today: 1, yesterday: 0.92, this_week: 5.8, last_week: 5.2,
    this_month: 22, last_month: 24, this_year: 280,
  };
  const m = multipliers[period] || 1;

  const currentHours = useMemo(() => {
    const base = hourlyData && hourlyData.length > 0 ? hourlyData : [];
    return base.map((h: any) => ({ ...h, revenue: Math.round(h.revenue * m) }));
  }, [hourlyData, m]);

  const currentSummary = useMemo(() => {
    const s = summary || { gross: 0, net: 0, vat: 0, tips: 0, avgTicket: 0, salesCount: 0 };
    return {
      gross: Number(s.gross) * m,
      net: Number(s.net) * m,
      vat: Number(s.vat) * m,
      tips: Number(s.tips) * m,
      avgTicket: Number(s.avgTicket) * (1 + (m - 1) * 0.02),
      salesCount: Math.round(Number(s.salesCount) * m),
    };
  }, [summary, m]);

  const currentPayments = useMemo(() => {
    const p = payments && payments.length > 0 ? payments : [];
    return p.map((pm: any) => ({ ...pm, value: Math.round(pm.value * m) }));
  }, [payments, m]);

  if (isLoading) return <SectionSkeleton />;
  if (hasError && !hourlyData && !summary) return <div className="p-4 text-sm text-muted-foreground text-center border rounded-lg">{t("admin.revenueUnavailable")}</div>;

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("admin.revenueAnalysis")}</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t("common.today")}</SelectItem>
            <SelectItem value="yesterday">{t("common.yesterday")}</SelectItem>
            <SelectItem value="this_week">{t("common.thisWeek")}</SelectItem>
            <SelectItem value="last_week">{t("admin.lastWeek")}</SelectItem>
            <SelectItem value="this_month">{t("common.thisMonth")}</SelectItem>
            <SelectItem value="last_month">{t("admin.lastMonth")}</SelectItem>
            <SelectItem value="this_year">{t("admin.thisYear")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardContent className="p-4 pt-6">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={currentHours}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="hour" className="text-xs" tick={{ fontSize: 11 }} />
              <YAxis className="text-xs" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
              <Tooltip formatter={(value: number) => [formatCHF(value), "Umsatz"]} />
              <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revenueGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Revenue Summary + Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t("admin.revenueSummary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("admin.grossRevenue")}</p>
                <p className="text-lg font-bold">{formatCHF(currentSummary.gross)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("admin.netRevenue")}</p>
                <p className="text-lg font-bold">{formatCHF(currentSummary.net)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("admin.vat")}</p>
                <p className="text-lg font-bold">{formatCHF(currentSummary.vat)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("cashier.tip")}</p>
                <p className="text-lg font-bold">{formatCHF(currentSummary.tips)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">⌀ Bon</p>
                <p className="text-lg font-bold">{formatCHF(currentSummary.avgTicket)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("admin.sales")}</p>
                <p className="text-lg font-bold">{currentSummary.salesCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t("admin.paymentMethods")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {currentPayments.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={currentPayments} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                      {currentPayments.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatCHF(value), ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {currentPayments.map((p: any) => (
                    <div key={p.name} className="flex items-center gap-1 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8">{t("admin.noPaymentsToday")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── SEKTION 2b: GESCHENKKARTEN (steuergerecht) ────────────────────────────
function GiftCardSection() {
  const { t } = useLanguage();
  const { data: gc, isLoading } = trpc.restaurantAdmin.giftCardStats.useQuery(undefined, {
    retry: 0, staleTime: 60000, refetchOnWindowFocus: false,
  });

  if (isLoading) return <SectionSkeleton />;
  if (!gc) return null;

  const formatCHF = (v: number) => `CHF ${v.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("admin.giftCards")}</h2>
        <Badge variant="outline" className="text-xs text-muted-foreground">{t("admin.vatCompliant")}</Badge>
      </div>

      {/* Steuerliche Erklärung */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
        <p className="font-semibold">📋 Steuerliche Behandlung (CH-MWST)</p>
        <p>{t("admin.giftCardInfo")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Offene Verbindlichkeit */}
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("admin.openLiability")}</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-xl font-bold text-amber-600">{formatCHF(Number(gc.openLiability))}</p>
            <p className="text-xs text-muted-foreground mt-1">{gc.activeCards} aktive Karten</p>
          </CardContent>
        </Card>

        {/* Realisierter Umsatz */}
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("admin.redeemed")}</span>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <p className="text-xl font-bold text-green-600">{formatCHF(Number(gc.totalRedeemed))}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("common.today")}: {formatCHF(Number(gc.todayRedeemedValue))}</p>
          </CardContent>
        </Card>

        {/* Heute verkauft */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("admin.soldToday")}</span>
              <Package className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xl font-bold">{formatCHF(Number(gc.todaySoldValue))}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("admin.incomeNoRevenue")}</p>
          </CardContent>
        </Card>

        {/* Gesamtverkäufe */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("admin.totalCards")}</span>
              <Heart className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-xl font-bold">{gc.totalSold}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatCHF(Number(gc.totalSoldValue))} Gesamtwert</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── SEKTION 3: LIVE BETRIEB ────────────────────────────────────────────────
function LiveOperationsSection() {
  const { t } = useLanguage();
  const { data: activeOrdersData } = trpc.restaurantAdmin.activeOrders.useQuery(undefined, { retry: 0, staleTime: 30000, refetchOnWindowFocus: false });

  const orders = activeOrdersData || { pending: 0, preparing: 0, total: 0, orders: [] };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t("admin.liveOperations")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Orders */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.activeOrders")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><ChefHat className="h-4 w-4 text-orange-500" /><span className="text-sm">{t("orders.pending")}</span></div>
              <Badge variant="secondary">{orders.pending}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Beer className="h-4 w-4 text-amber-500" /><span className="text-sm">{t("kitchen.preparing")}</span></div>
              <Badge variant="secondary">{orders.preparing}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-500" /><span className="text-sm">{t("admin.totalActive")}</span></div>
              <Badge variant="secondary">{orders.total}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Production Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">⌀ Produktionszeit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{t("admin.kitchen")}</span>
                <span className="font-medium">{productionTime.kitchen} Min.</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(productionTime.kitchen / 20 * 100, 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{t("admin.bar")}</span>
                <span className="font-medium">{productionTime.bar} Min.</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(productionTime.bar / 20 * 100, 100)}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delayed Orders */}
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">{t("admin.lateOrders")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {delayedOrders.length > 0 ? delayedOrders.map((o, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium">{o.table}</span>
                <span className="text-red-600 font-medium">{o.waitMinutes} Min.</span>
                <span className="text-xs text-muted-foreground">{o.staff}</span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">{t("admin.noDelays")}</p>
            )}
          </CardContent>
        </Card>

        {/* Reservations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.reservationsToday")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold">{reservations.count}</p>
                <p className="text-xs text-muted-foreground">{t("admin.count")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{reservations.guests}</p>
                <p className="text-xs text-muted-foreground">{t("kellner.guests")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{reservations.noShows}</p>
                <p className="text-xs text-muted-foreground">{t("admin.noShow")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── SEKTION 4: MITARBEITER PERFORMANCE ─────────────────────────────────────
function StaffPerformanceSection() {
  const { t } = useLanguage();
  const { data: staffData, isLoading, error } = trpc.restaurantAdmin.staffPerformance.useQuery(undefined, { retry: 0, staleTime: 60000, refetchOnWindowFocus: false });

  const staff = staffData && staffData.length > 0 ? staffData : [];

  if (isLoading) return <SectionSkeleton />;
  if (error && !staffData) return <div className="p-4 text-sm text-muted-foreground text-center border rounded-lg">{t("admin.staffUnavailable")}</div>;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t("admin.staffPerformance")}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">{t("nav.staff")}</th>
                    <th className="text-right p-3 font-medium">{t("admin.revenue")}</th>
                    <th className="text-right p-3 font-medium hidden sm:table-cell">{t("admin.sales")}</th>
                    <th className="text-right p-3 font-medium">{t("cashier.tip")}</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.length > 0 ? staff.map((s: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-right">{formatCHF(s.revenue)}</td>
                      <td className="p-3 text-right hidden sm:table-cell">{s.sales}</td>
                      <td className="p-3 text-right">{formatCHF(s.tips)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">{t("admin.noDataYet")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t("admin.keyFigures")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("admin.staffCostsToday")}</p>
              <p className="text-xl font-bold">{formatCHF(staffKPIs.laborCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("admin.revenuePerHour")}</p>
              <p className="text-xl font-bold">{formatCHF(staffKPIs.revenuePerHour)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("admin.staffCostRatio")}</p>
              <p className="text-xl font-bold">{staffKPIs.laborCostRatio}%</p>
              <div className="h-2 rounded-full bg-muted overflow-hidden mt-1">
                <div className={`h-full rounded-full ${staffKPIs.laborCostRatio > 40 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${staffKPIs.laborCostRatio}%` }} />
              </div>
            </div>
            {staff.length > 0 && (
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={staff}>
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.split(" ")[0]} />
                  <Tooltip formatter={(value: number) => [formatCHF(value), "Umsatz"]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── SEKTION 5: PRODUKT ANALYSE ─────────────────────────────────────────────
function ProductAnalysisSection() {
  const { t } = useLanguage();
  const { data: topProds } = trpc.restaurantAdmin.topProducts.useQuery(undefined, { retry: 0, staleTime: 60000, refetchOnWindowFocus: false });
  const products = topProds && topProds.length > 0 ? topProds : [];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t("admin.productAnalysis")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Top Products - LIVE */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.topProducts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {products.length > 0 ? products.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-4">#{i + 1}</span>
                  <span className="text-sm">{p.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">{formatCHF(p.revenue)}</span>
                  <span className="text-xs text-muted-foreground ml-1">({p.sales}x)</span>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">{t("admin.noSalesYet")}</p>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.revenueByCategory")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={revenueByCategory} cx="50%" cy="50%" outerRadius={55} dataKey="value" paddingAngle={2}>
                  {revenueByCategory.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatCHF(value), ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {revenueByCategory.map(c => (
                <div key={c.name} className="flex items-center gap-1 text-xs">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Margins */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.marginAnalysis")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-green-600 font-medium mb-1">{t("admin.bestMargin")}</p>
              {bestMarginProducts.slice(0, 3).map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="font-medium text-green-600">{p.margin}%</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs text-red-600 font-medium mb-1">{t("admin.worstMargin")}</p>
              {worstMarginProducts.slice(0, 3).map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="font-medium text-red-600">{p.margin}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cancellations */}
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.productsWithCancellations")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cancelledProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg border border-red-100 dark:border-red-900/30">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 font-bold text-sm">
                    {p.cancellations}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── SEKTION 6: LAGER ───────────────────────────────────────────────────────
function InventorySection() {
  const { t } = useLanguage();
  const { data: inventoryData } = trpc.restaurantAdmin.inventory.useQuery(undefined, { retry: 0, staleTime: 60000, refetchOnWindowFocus: false });
  const inv = inventoryData || { critical: [], total: 0, totalValue: 0 };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t("admin.inventoryTitle")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Critical Stock - LIVE */}
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Kritisch
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inv.critical.length > 0 ? inv.critical.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span>{item.product}</span>
                <Badge variant="destructive" className="text-xs">{item.stock}/{item.minStock} {item.unit}</Badge>
              </div>
            )) : (
              <p className="text-sm text-green-600">{t("admin.allGood")}</p>
            )}
          </CardContent>
        </Card>

        {/* Soon Out of Stock */}
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-1">
              <Package className="h-3.5 w-3.5" /> Bald leer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {soonOutOfStock.map((item, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span>{item.product}</span>
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">{item.stock}/{item.minStock} {item.unit}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Cost of Goods */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.costOfGoods")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("common.today")}</span>
              <span className="font-medium">{formatCHF(costOfGoods.today)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("admin.week")}</span>
              <span className="font-medium">{formatCHF(costOfGoods.week)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("admin.month")}</span>
              <span className="font-medium">{formatCHF(costOfGoods.month)}</span>
            </div>
            {inv.totalValue > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="text-muted-foreground">{t("admin.inventoryValue")}</span>
                <span className="font-bold">{formatCHF(inv.totalValue)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Margins */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.margin")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("admin.average")}</span>
              <span className="font-bold text-lg">{margins.average}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("admin.best")}</span>
              <span className="font-medium text-green-600">{margins.best}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("admin.worst")}</span>
              <span className="font-medium text-red-600">{margins.worst}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── SEKTION 7: KUNDEN ──────────────────────────────────────────────────────
function CustomerSection() {
  const { t } = useLanguage();
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t("admin.customerAnalysis")}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <UserPlus className="h-5 w-5 mx-auto text-green-600 mb-1" />
                <p className="text-2xl font-bold">{customerStats.newToday}</p>
                <p className="text-xs text-muted-foreground">{t("admin.newToday")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <UserCheck className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                <p className="text-2xl font-bold">{customerStats.returningToday}</p>
                <p className="text-xs text-muted-foreground">{t("admin.returning")}</p>
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">⌀ Besuchsfrequenz</p>
              <p className="text-xl font-bold">{customerStats.avgVisitFrequency}x / Monat</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Heart className="h-3.5 w-3.5 text-red-500" /> Stammkunden Top 5
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-4">#{i + 1}</span>
                  <span>{c.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{c.visits} Besuche</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.customerGrowth")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={customerGrowth}>
                <Bar dataKey="customers" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [`${value} Kunden`, ""]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── SEKTION 8: KI ASSISTENT (LIVE LLM) ────────────────────────────────────
function AIAssistantSection() {
  const { t } = useLanguage();
  const { data: insights, isLoading, refetch, isFetching } = trpc.restaurantAdmin.aiInsights.useQuery(undefined, { retry: 0, staleTime: 30 * 60 * 1000, refetchOnWindowFocus: false, refetchOnMount: false });
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
    toast.success(t("admin.aiUpdated"));
  };

  const ai = insights || {
    opportunities: [t("admin.loadingAI")],
    risks: [t("common.loading")],
    forecast: { expectedRevenue: 0, confidence: 0, basedOn: "Wird berechnet..." },
    recommendations: [t("admin.pleaseWait")],
  };

  return (
    <section className="space-y-4">
      <Card className="border-2 border-purple-200 dark:border-purple-900 bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 text-white">
                <Brain className="h-5 w-5" />
              </div>
              KI Business Assistent
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing || isFetching}
              className="gap-1"
            >
              {(refreshing || isFetching) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Aktualisieren
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("admin.aiDescription")}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            </div>
          ) : (
            <>
              {/* Forecast */}
              <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">{t("admin.forecast")}</span>
                </div>
                <p className="text-2xl font-bold">{formatCHF(ai.forecast.expectedRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Erwarteter Tagesumsatz (Konfidenz: {ai.forecast.confidence}%) – {ai.forecast.basedOn}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Opportunities */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">{t("admin.opportunities")}</span>
                  </div>
                  {ai.opportunities.map((o: string, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 text-sm">
                      {o}
                    </div>
                  ))}
                </div>

                {/* Risks */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-semibold text-red-700 dark:text-red-400">{t("admin.risks")}</span>
                  </div>
                  {ai.risks.map((r: string, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 text-sm">
                      {r}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">{t("admin.recommendations")}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {ai.recommendations.map((r: string, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 text-sm">
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ─── SEKTION 9: WARNUNGEN + BENACHRICHTIGUNGEN ──────────────────────────────
function AlertsSection() {
  const { t } = useLanguage();
  const notifyMutation = trpc.restaurantAdmin.checkAndNotifyCritical.useMutation({
    onSuccess: (data) => {
      if (data.sent) {
        toast.success(`${data.notifications.length} kritische Warnung(en) gesendet`);
      } else {
        toast.info(t("admin.noAlerts"));
      }
    },
    onError: () => {
      toast.error(t("admin.notificationFailed"));
    },
  });

  const priorityConfig = {
    critical: { color: "bg-red-500", label: "Kritisch", textColor: "text-red-700 dark:text-red-400" },
    important: { color: "bg-amber-500", label: "Wichtig", textColor: "text-amber-700 dark:text-amber-400" },
    done: { color: "bg-green-500", label: "Erledigt", textColor: "text-green-700 dark:text-green-400" },
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("admin.alertsTitle")}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => notifyMutation.mutate()}
          disabled={notifyMutation.isPending}
          className="gap-1"
        >
          {notifyMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
          Push senden
        </Button>
      </div>
      <Card>
        <CardContent className="p-4 space-y-2">
          {fallbackAlerts.map(alert => {
            const config = priorityConfig[alert.priority];
            return (
              <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.color}`} />
                <p className="text-sm flex-1">{alert.message}</p>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{alert.time}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}

// ─── SEKTION 10: MULTI-STANDORT ─────────────────────────────────────────────
function MultiLocationSection() {
  const { t } = useLanguage();
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Building2 className="h-5 w-5" /> Multi-Standort
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            {locations.map((loc, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <StatusDot status={loc.status} />
                  <div>
                    <p className="text-sm font-medium">{loc.name}</p>
                    <p className="text-xs text-muted-foreground">{loc.staff} MA · {loc.registers} Kassen</p>
                  </div>
                </div>
                <p className="text-sm font-bold">{formatCHF(loc.revenue)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.locationComparison")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={locations} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} tickFormatter={(v: string) => v.replace("Bella Vista ", "")} />
                <Tooltip formatter={(value: number) => [formatCHF(value), "Umsatz"]} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ─── LAZY SECTION WRAPPER (IntersectionObserver) ────────────────────────────
// Only renders children when the section scrolls into view.
// Once rendered, stays mounted to avoid re-fetching data.
function LazySection({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Use IntersectionObserver to detect when section enters viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect(); // Once visible, never hide again
        }
      },
      { rootMargin: "200px" } // Start loading 200px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : "120px" }}>
      {visible ? children : (fallback || <SectionSkeleton />)}
    </div>
  );
}

// ─── MAIN DASHBOARD ─────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { t } = useLanguage();
  return (
    <div className="container py-6 space-y-8 max-w-7xl">
      {/* Offline Banner */}
      <OfflineBanner className="-mx-4 sm:-mx-6 lg:-mx-8 rounded-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t("nav.dashboard")}</h1>
          <p className="text-sm text-muted-foreground">
            Live-Übersicht · {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Badge variant="outline" className="self-start sm:self-auto text-xs">
          <CircleDot className="h-3 w-3 mr-1 text-green-500 animate-pulse" />
          Live
        </Badge>
      </div>

            {/* Section 1: Always render immediately (above the fold) */}
      <ErrorBoundary name="live-status" fallback={<SectionErrorFallback />}><LiveStatusSection /></ErrorBoundary>
      {/* Network Monitor - lazy loaded to avoid blocking initial paint on iOS */}
      <LazySection>
        <ErrorBoundary name="network-monitor" fallback={<SectionErrorFallback />}><NetworkMonitor /></ErrorBoundary>
      </LazySection>
      {/* Revenue section - lazy loaded */}
      <LazySection>
        <ErrorBoundary name="revenue" fallback={<SectionErrorFallback />}><RevenueSection /></ErrorBoundary>
        <ErrorBoundary name="giftcards" fallback={<SectionErrorFallback />}><GiftCardSection /></ErrorBoundary>
      </LazySection>

      {/* Sections 3-10: Lazy-loaded when scrolled into view */}
      <LazySection>
        <ErrorBoundary name="operations" fallback={<SectionErrorFallback />}><LiveOperationsSection /></ErrorBoundary>
      </LazySection>
      <LazySection>
        <ErrorBoundary name="staff" fallback={<SectionErrorFallback />}><StaffPerformanceSection /></ErrorBoundary>
      </LazySection>
      <LazySection>
        <ErrorBoundary name="products" fallback={<SectionErrorFallback />}><ProductAnalysisSection /></ErrorBoundary>
      </LazySection>
      <LazySection>
        <ErrorBoundary name="inventory" fallback={<SectionErrorFallback />}><InventorySection /></ErrorBoundary>
      </LazySection>
      <LazySection>
        <ErrorBoundary name="customers" fallback={<SectionErrorFallback />}><CustomerSection /></ErrorBoundary>
      </LazySection>
      <LazySection>
        <ErrorBoundary name="ai-assistant" fallback={<SectionErrorFallback />}><AIAssistantSection /></ErrorBoundary>
      </LazySection>
      <LazySection>
        <ErrorBoundary name="alerts" fallback={<SectionErrorFallback />}><AlertsSection /></ErrorBoundary>
      </LazySection>
      <LazySection>
        <ErrorBoundary name="multi-location" fallback={<SectionErrorFallback />}><MultiLocationSection /></ErrorBoundary>
      </LazySection>
    </div>
  );
}
