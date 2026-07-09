/**
 * statisticsRouter.ts
 * Detailliertes Statistik-Modul für SimplaPOS
 *
 * Endpunkte:
 * 1. getClosingsByPeriod  – Perioden-Abschlüsse (Tag/Woche/Monat/Quartal/Jahr)
 * 2. getVatReport         – MwSt-Abschluss (ESTV-konform)
 * 3. getProductStats      – Produkt-Zeitraum-Analyse mit Uhrzeit-Filter
 * 4. getHourlyHeatmap     – Umsatz-Heatmap (Wochentag × Stunde)
 * 5. getTopProducts       – Top/Flop-Produkte nach Zeitraum
 * 6. getTableStats        – Tisch-Auslastung & Umsatz
 * 7. getWaiterPerformance – Kellner-Performance-Ranking
 * 8. getPaymentTrend      – Zahlungsarten-Trend über Zeit
 * 9. getAiInsights        – KI-relevante Muster & Prognosen
 * 10. getPurchaseForecast – Einkaufsempfehlung-Basis
 * 11. getDashboardKpis    – Übersichts-Kennzahlen für Dashboard-Karten
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  orders,
  orderItems,
  dailyClosings,
  users,
  restaurants,
  sumupTransactions,
  paytecTransactions,
  nexiTransactions,
} from "../drizzle/schema";
import { and, eq, gte, lte, sql, desc, asc, inArray, isNotNull } from "drizzle-orm";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function getPeriodBounds(period: string, referenceDate: Date) {
  const d = new Date(referenceDate);
  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  switch (period) {
    case "day": {
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 1);
      break;
    }
    case "week": {
      const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek, 0, 0, 0, 0);
      end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
      prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
      prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 7);
      break;
    }
    case "month": {
      start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1, 0, 0, 0, 0);
      prevEnd = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case "quarter": {
      const q = Math.floor(d.getMonth() / 3);
      start = new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0);
      end = new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
      prevStart = new Date(d.getFullYear(), (q - 1) * 3, 1, 0, 0, 0, 0);
      prevEnd = new Date(d.getFullYear(), q * 3, 0, 23, 59, 59, 999);
      break;
    }
    case "year": {
      start = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
      prevStart = new Date(d.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      prevEnd = new Date(d.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    }
    default: {
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 1);
    }
  }
  return { start, end, prevStart, prevEnd };
}

function calcChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100.0" : "0.0";
  const pct = ((current - previous) / previous) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(1);
}

const WEEKDAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// ─── Router ───────────────────────────────────────────────────────────────────

export const statisticsRouter = router({

  // ── 1. Perioden-Abschlüsse ────────────────────────────────────────────────
  getClosingsByPeriod: protectedProcedure
    .input(z.object({
      period: z.enum(["day", "week", "month", "quarter", "year"]),
      referenceDate: z.string().optional(),
      customStart: z.string().optional(),
      customEnd: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const refDate = input.referenceDate ? new Date(input.referenceDate) : new Date();
      let start: Date, end: Date, prevStart: Date, prevEnd: Date;

      if (input.customStart && input.customEnd) {
        start = new Date(input.customStart);
        end = new Date(input.customEnd); end.setHours(23, 59, 59, 999);
        const duration = end.getTime() - start.getTime();
        prevStart = new Date(start.getTime() - duration);
        prevEnd = new Date(start.getTime() - 1);
      } else {
        ({ start, end, prevStart, prevEnd } = getPeriodBounds(input.period, refDate));
      }

      const [currAgg] = await db
        .select({
          grossRevenue: sql<string>`COALESCE(SUM(totalAmount), 0)`,
          netRevenue: sql<string>`COALESCE(SUM(totalAmount - taxAmount), 0)`,
          totalTax: sql<string>`COALESCE(SUM(taxAmount), 0)`,
          totalTips: sql<string>`COALESCE(SUM(tipAmount), 0)`,
          totalCash: sql<string>`COALESCE(SUM(CASE WHEN paymentMethod='cash' THEN totalAmount ELSE 0 END), 0)`,
          totalCard: sql<string>`COALESCE(SUM(CASE WHEN paymentMethod='card' THEN totalAmount ELSE 0 END), 0)`,
          totalTwint: sql<string>`COALESCE(SUM(CASE WHEN paymentMethod='twint' THEN totalAmount ELSE 0 END), 0)`,
          totalOther: sql<string>`COALESCE(SUM(CASE WHEN paymentMethod NOT IN ('cash','card','twint') THEN totalAmount ELSE 0 END), 0)`,
          orderCount: sql<number>`COUNT(*)`,
          guestCount: sql<number>`COALESCE(SUM(guestCount), 0)`,
          avgOrderValue: sql<string>`COALESCE(AVG(totalAmount), 0)`,
          cancelledCount: sql<number>`SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END)`,
        })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)));

      const [prevAgg] = await db
        .select({
          grossRevenue: sql<string>`COALESCE(SUM(totalAmount), 0)`,
          orderCount: sql<number>`COUNT(*)`,
          guestCount: sql<number>`COALESCE(SUM(guestCount), 0)`,
        })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, prevStart), lte(orders.paidAt, prevEnd)));

      // MwSt-Aufschlüsselung aus taxBreakdown JSON
      const taxRows = await db
        .select({ taxBreakdown: orders.taxBreakdown })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end), isNotNull(orders.taxBreakdown)));

      const vatMap: Record<string, { base: number; amount: number }> = {};
      for (const row of taxRows) {
        const breakdown = row.taxBreakdown as Array<{ rate: string; base: string; amount: string }> | null;
        if (!breakdown) continue;
        for (const entry of breakdown) {
          const rate = entry.rate ?? "0";
          if (!vatMap[rate]) vatMap[rate] = { base: 0, amount: 0 };
          vatMap[rate].base += parseFloat(entry.base ?? "0");
          vatMap[rate].amount += parseFloat(entry.amount ?? "0");
        }
      }
      const vatLines = Object.entries(vatMap).map(([rate, v]) => ({
        rate, label: `${rate}%`,
        netBase: v.base.toFixed(2),
        vatAmount: v.amount.toFixed(2),
        grossAmount: (v.base + v.amount).toFixed(2),
      })).sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

      const closingsList = await db
        .select({
          id: dailyClosings.id, closingDate: dailyClosings.closingDate,
          totalRevenue: dailyClosings.totalRevenue, totalCash: dailyClosings.totalCash,
          totalCard: dailyClosings.totalCard, totalTwint: dailyClosings.totalTwint,
          totalTax: dailyClosings.totalTax, totalTips: dailyClosings.totalTips,
          totalOrders: dailyClosings.totalOrders, totalGuests: dailyClosings.totalGuests,
          mode: dailyClosings.mode, status: dailyClosings.status,
        })
        .from(dailyClosings)
        .where(and(eq(dailyClosings.restaurantId, restaurantId), gte(dailyClosings.closingDate, start), lte(dailyClosings.closingDate, end)))
        .orderBy(asc(dailyClosings.closingDate));

      const [sumupAgg] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)`, count: sql<number>`COUNT(*)` }).from(sumupTransactions).where(and(eq(sumupTransactions.restaurantId, restaurantId), eq(sumupTransactions.status, "paid"), gte(sumupTransactions.initiatedAt, start), lte(sumupTransactions.initiatedAt, end)));
      const [paytecAgg] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)`, count: sql<number>`COUNT(*)` }).from(paytecTransactions).where(and(eq(paytecTransactions.restaurantId, restaurantId), eq(paytecTransactions.status, "approved"), gte(paytecTransactions.initiatedAt, start), lte(paytecTransactions.initiatedAt, end)));
      const [nexiAgg] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)`, count: sql<number>`COUNT(*)` }).from(nexiTransactions).where(and(eq(nexiTransactions.restaurantId, restaurantId), eq(nexiTransactions.status, "approved"), gte(nexiTransactions.initiatedAt, start), lte(nexiTransactions.initiatedAt, end)));

      const grossRev = parseFloat(currAgg?.grossRevenue ?? "0");
      const prevGrossRev = parseFloat(prevAgg?.grossRevenue ?? "0");

      return {
        period: input.period,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        prevDateRange: { start: prevStart.toISOString(), end: prevEnd.toISOString() },
        summary: {
          grossRevenue: grossRev.toFixed(2),
          netRevenue: parseFloat(currAgg?.netRevenue ?? "0").toFixed(2),
          totalTax: parseFloat(currAgg?.totalTax ?? "0").toFixed(2),
          totalTips: parseFloat(currAgg?.totalTips ?? "0").toFixed(2),
          orderCount: Number(currAgg?.orderCount ?? 0),
          guestCount: Number(currAgg?.guestCount ?? 0),
          avgOrderValue: parseFloat(currAgg?.avgOrderValue ?? "0").toFixed(2),
          cancelledCount: Number(currAgg?.cancelledCount ?? 0),
          revenueChange: calcChange(grossRev, prevGrossRev),
          orderCountChange: calcChange(Number(currAgg?.orderCount ?? 0), Number(prevAgg?.orderCount ?? 0)),
          guestCountChange: calcChange(Number(currAgg?.guestCount ?? 0), Number(prevAgg?.guestCount ?? 0)),
        },
        payments: {
          cash: parseFloat(currAgg?.totalCash ?? "0").toFixed(2),
          card: parseFloat(currAgg?.totalCard ?? "0").toFixed(2),
          twint: parseFloat(currAgg?.totalTwint ?? "0").toFixed(2),
          other: parseFloat(currAgg?.totalOther ?? "0").toFixed(2),
          terminalSumup: parseFloat(sumupAgg?.total ?? "0").toFixed(2),
          terminalPaytec: parseFloat(paytecAgg?.total ?? "0").toFixed(2),
          terminalNexi: parseFloat(nexiAgg?.total ?? "0").toFixed(2),
        },
        vat: { lines: vatLines },
        closings: closingsList.map((c: typeof closingsList[0]) => ({
          id: c.id, date: c.closingDate.toISOString(),
          revenue: parseFloat(c.totalRevenue).toFixed(2), cash: parseFloat(c.totalCash).toFixed(2),
          card: parseFloat(c.totalCard).toFixed(2), twint: parseFloat(c.totalTwint).toFixed(2),
          tax: parseFloat(c.totalTax).toFixed(2), tips: parseFloat(c.totalTips).toFixed(2),
          orders: c.totalOrders, guests: c.totalGuests, mode: c.mode, status: c.status,
        })),
      };
    }),

  // ── 2. MwSt-Abschluss (ESTV-konform) ─────────────────────────────────────
  getVatReport: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);

      const [restaurant] = await db.select({ name: restaurants.name, vatNumber: restaurants.vatNumber, address: restaurants.address }).from(restaurants).where(eq(restaurants.id, restaurantId));

      const paidOrders = await db
        .select({ id: orders.id, totalAmount: orders.totalAmount, taxAmount: orders.taxAmount, taxBreakdown: orders.taxBreakdown, paymentMethod: orders.paymentMethod, paidAt: orders.paidAt, type: orders.type })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)))
        .orderBy(asc(orders.paidAt));

      const vatMap: Record<string, { base: number; amount: number; orderCount: number }> = {};
      let totalGross = 0;
      const monthlyMap: Record<string, { gross: number; vat: number; net: number; orders: number }> = {};

      for (const order of paidOrders) {
        const gross = parseFloat(order.totalAmount ?? "0");
        const tax = parseFloat(order.taxAmount ?? "0");
        totalGross += gross;

        if (order.paidAt) {
          const key = `${order.paidAt.getFullYear()}-${String(order.paidAt.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyMap[key]) monthlyMap[key] = { gross: 0, vat: 0, net: 0, orders: 0 };
          monthlyMap[key].gross += gross;
          monthlyMap[key].vat += tax;
          monthlyMap[key].net += gross - tax;
          monthlyMap[key].orders++;
        }

        const breakdown = order.taxBreakdown as Array<{ rate: string; base: string; amount: string }> | null;
        if (breakdown && breakdown.length > 0) {
          for (const entry of breakdown) {
            const rate = entry.rate ?? "0";
            if (!vatMap[rate]) vatMap[rate] = { base: 0, amount: 0, orderCount: 0 };
            vatMap[rate].base += parseFloat(entry.base ?? "0");
            vatMap[rate].amount += parseFloat(entry.amount ?? "0");
            vatMap[rate].orderCount++;
          }
        } else {
          const rate = "0";
          if (!vatMap[rate]) vatMap[rate] = { base: 0, amount: 0, orderCount: 0 };
          vatMap[rate].base += gross - tax;
          vatMap[rate].amount += tax;
          vatMap[rate].orderCount++;
        }
      }

      const vatLines = Object.entries(vatMap).map(([rate, v]) => ({
        rate,
        label: rate === "8.1" || rate === "8.10" ? "8.1% (Vor Ort)" : rate === "2.6" || rate === "2.60" ? "2.6% (Take-away)" : rate === "3.8" || rate === "3.80" ? "3.8% (Beherbergung)" : `${rate}%`,
        netBase: v.base.toFixed(2), vatAmount: v.amount.toFixed(2), grossAmount: (v.base + v.amount).toFixed(2), orderCount: v.orderCount,
      })).sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

      const totalVat = vatLines.reduce((s, l) => s + parseFloat(l.vatAmount), 0);
      const totalNet = vatLines.reduce((s, l) => s + parseFloat(l.netBase), 0);

      const monthlyBreakdown = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, gross: v.gross.toFixed(2), vat: v.vat.toFixed(2), net: v.net.toFixed(2), orders: v.orders }));

      return {
        restaurant: { name: restaurant?.name ?? "", vatNumber: restaurant?.vatNumber ?? "", address: restaurant?.address ?? "" },
        period: { start: start.toISOString(), end: end.toISOString() },
        summary: { totalGross: totalGross.toFixed(2), totalNet: totalNet.toFixed(2), totalVat: totalVat.toFixed(2), orderCount: paidOrders.length },
        vatLines, monthlyBreakdown, generatedAt: new Date().toISOString(),
      };
    }),

  // ── 3. Produkt-Zeitraum-Analyse ───────────────────────────────────────────
  getProductStats: protectedProcedure
    .input(z.object({
      productId: z.number().optional(),
      productName: z.string().optional(),
      startDate: z.string(),
      endDate: z.string(),
      hourFrom: z.number().min(0).max(23).optional(),
      hourTo: z.number().min(0).max(23).optional(),
      weekdays: z.array(z.number().min(0).max(6)).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);

      const baseConditions = [eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)];
      if (input.hourFrom !== undefined) baseConditions.push(sql`HOUR(${orders.paidAt}) >= ${input.hourFrom}`);
      if (input.hourTo !== undefined) baseConditions.push(sql`HOUR(${orders.paidAt}) <= ${input.hourTo}`);
      if (input.weekdays && input.weekdays.length > 0) {
        const mysqlDays = input.weekdays.map((d: number) => d + 1);
        baseConditions.push(sql`DAYOFWEEK(${orders.paidAt}) IN (${sql.join(mysqlDays.map((d: number) => sql`${d}`), sql`, `)})`);
      }

      const productConditions = [...baseConditions];
      if (input.productId) productConditions.push(eq(orderItems.productId, input.productId));
      if (input.productName) productConditions.push(sql`${orderItems.name} LIKE ${'%' + input.productName + '%'}`);

      const rows = await db
        .select({
          productId: orderItems.productId, productName: orderItems.name,
          totalQuantity: sql<number>`SUM(${orderItems.quantity})`,
          totalRevenue: sql<string>`SUM(${orderItems.totalPrice})`,
          avgUnitPrice: sql<string>`AVG(${orderItems.unitPrice})`,
          orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
          minPrice: sql<string>`MIN(${orderItems.unitPrice})`,
          maxPrice: sql<string>`MAX(${orderItems.unitPrice})`,
        })
        .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(...productConditions))
        .groupBy(orderItems.productId, orderItems.name)
        .orderBy(desc(sql`SUM(${orderItems.totalPrice})`)).limit(100);

      const hourlyRows = await db
        .select({ hour: sql<number>`HOUR(${orders.paidAt})`, quantity: sql<number>`SUM(${orderItems.quantity})`, revenue: sql<string>`SUM(${orderItems.totalPrice})` })
        .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(...productConditions))
        .groupBy(sql`HOUR(${orders.paidAt})`).orderBy(sql`HOUR(${orders.paidAt})`);

      const weekdayRows = await db
        .select({ weekday: sql<number>`DAYOFWEEK(${orders.paidAt})`, quantity: sql<number>`SUM(${orderItems.quantity})`, revenue: sql<string>`SUM(${orderItems.totalPrice})` })
        .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(...productConditions))
        .groupBy(sql`DAYOFWEEK(${orders.paidAt})`).orderBy(sql`DAYOFWEEK(${orders.paidAt})`);

      const dailyRows = await db
        .select({ date: sql<string>`DATE(${orders.paidAt})`, quantity: sql<number>`SUM(${orderItems.quantity})`, revenue: sql<string>`SUM(${orderItems.totalPrice})` })
        .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(...productConditions))
        .groupBy(sql`DATE(${orders.paidAt})`).orderBy(sql`DATE(${orders.paidAt})`);

      return {
        filter: { startDate: start.toISOString(), endDate: end.toISOString(), hourFrom: input.hourFrom, hourTo: input.hourTo, weekdays: input.weekdays, productId: input.productId, productName: input.productName },
        products: rows.map((r: typeof rows[0]) => ({
          productId: r.productId, productName: r.productName,
          totalQuantity: Number(r.totalQuantity ?? 0), totalRevenue: parseFloat(r.totalRevenue ?? "0").toFixed(2),
          avgUnitPrice: parseFloat(r.avgUnitPrice ?? "0").toFixed(2), orderCount: Number(r.orderCount ?? 0),
          minPrice: parseFloat(r.minPrice ?? "0").toFixed(2), maxPrice: parseFloat(r.maxPrice ?? "0").toFixed(2),
        })),
        hourlyDistribution: Array.from({ length: 24 }, (_, h) => {
          const row = hourlyRows.find((r: typeof hourlyRows[0]) => Number(r.hour) === h);
          return { hour: h, label: `${String(h).padStart(2, "0")}:00`, quantity: Number(row?.quantity ?? 0), revenue: parseFloat(row?.revenue ?? "0").toFixed(2) };
        }),
        weekdayDistribution: Array.from({ length: 7 }, (_, i) => {
          const mysqlDay = i + 1;
          const row = weekdayRows.find((r: typeof weekdayRows[0]) => Number(r.weekday) === mysqlDay);
          return { weekday: i, label: WEEKDAY_NAMES[i], quantity: Number(row?.quantity ?? 0), revenue: parseFloat(row?.revenue ?? "0").toFixed(2) };
        }),
        dailyTimeSeries: dailyRows.map((r: typeof dailyRows[0]) => ({ date: r.date, quantity: Number(r.quantity ?? 0), revenue: parseFloat(r.revenue ?? "0").toFixed(2) })),
      };
    }),

  // ── 4. Uhrzeit-Heatmap ────────────────────────────────────────────────────
  getHourlyHeatmap: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string(), metric: z.enum(["revenue", "orders", "guests"]).default("revenue") }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);

      const rows = await db
        .select({
          weekday: sql<number>`DAYOFWEEK(${orders.paidAt})`,
          hour: sql<number>`HOUR(${orders.paidAt})`,
          revenue: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
          orderCount: sql<number>`COUNT(*)`,
          guestCount: sql<number>`COALESCE(SUM(${orders.guestCount}), 0)`,
        })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)))
        .groupBy(sql`DAYOFWEEK(${orders.paidAt})`, sql`HOUR(${orders.paidAt})`);

      const grid = [];
      for (let w = 0; w < 7; w++) {
        for (let h = 0; h < 24; h++) {
          const mysqlDay = w + 1;
          const row = rows.find((r: typeof rows[0]) => Number(r.weekday) === mysqlDay && Number(r.hour) === h);
          const revenue = parseFloat(row?.revenue ?? "0");
          const orderCount = Number(row?.orderCount ?? 0);
          const guestCount = Number(row?.guestCount ?? 0);
          const value = input.metric === "revenue" ? revenue : input.metric === "orders" ? orderCount : guestCount;
          grid.push({ weekday: w, weekdayLabel: WEEKDAY_NAMES[w], hour: h, value, revenue: revenue.toFixed(2), orders: orderCount, guests: guestCount });
        }
      }

      const maxValue = Math.max(...grid.map(g => g.value), 1);
      const peakSlots = grid.filter(g => g.value > maxValue * 0.8).map(g => ({ weekday: g.weekdayLabel, hour: `${String(g.hour).padStart(2, "0")}:00`, value: g.value }));

      return { grid, maxValue, peakSlots, metric: input.metric };
    }),

  // ── 5. Top/Flop-Produkte ──────────────────────────────────────────────────
  getTopProducts: protectedProcedure
    .input(z.object({
      startDate: z.string(), endDate: z.string(),
      limit: z.number().min(1).max(100).default(20),
      sortBy: z.enum(["quantity", "revenue", "orders"]).default("revenue"),
      itemType: z.enum(["food", "drink", "other", "all"]).default("all"),
      hourFrom: z.number().min(0).max(23).optional(),
      hourTo: z.number().min(0).max(23).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);

      const conditions = [eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)];
      if (input.hourFrom !== undefined) conditions.push(sql`HOUR(${orders.paidAt}) >= ${input.hourFrom}`);
      if (input.hourTo !== undefined) conditions.push(sql`HOUR(${orders.paidAt}) <= ${input.hourTo}`);
      if (input.itemType !== "all") conditions.push(eq(orderItems.itemType, input.itemType as "food" | "drink" | "other"));

      const sortExpr = input.sortBy === "quantity" ? desc(sql`SUM(${orderItems.quantity})`)
        : input.sortBy === "orders" ? desc(sql`COUNT(DISTINCT ${orders.id})`)
        : desc(sql`SUM(${orderItems.totalPrice})`);

      const rows = await db
        .select({
          productId: orderItems.productId, productName: orderItems.name, itemType: orderItems.itemType,
          totalQuantity: sql<number>`SUM(${orderItems.quantity})`,
          totalRevenue: sql<string>`SUM(${orderItems.totalPrice})`,
          avgUnitPrice: sql<string>`AVG(${orderItems.unitPrice})`,
          orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
        })
        .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(...conditions))
        .groupBy(orderItems.productId, orderItems.name, orderItems.itemType)
        .orderBy(sortExpr).limit(input.limit);

      const totalRevAll = rows.reduce((s: number, r: typeof rows[0]) => s + parseFloat(r.totalRevenue ?? "0"), 0);

      return {
        filter: { startDate: start.toISOString(), endDate: end.toISOString(), sortBy: input.sortBy, itemType: input.itemType, hourFrom: input.hourFrom, hourTo: input.hourTo },
        products: rows.map((r: typeof rows[0], i: number) => ({
          rank: i + 1, productId: r.productId, productName: r.productName, itemType: r.itemType,
          totalQuantity: Number(r.totalQuantity ?? 0), totalRevenue: parseFloat(r.totalRevenue ?? "0").toFixed(2),
          avgUnitPrice: parseFloat(r.avgUnitPrice ?? "0").toFixed(2), orderCount: Number(r.orderCount ?? 0),
          revenueShare: totalRevAll > 0 ? ((parseFloat(r.totalRevenue ?? "0") / totalRevAll) * 100).toFixed(1) : "0.0",
        })),
      };
    }),

  // ── 6. Tisch-Statistiken ──────────────────────────────────────────────────
  getTableStats: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);

      const rows = await db
        .select({
          tableId: orders.tableId,
          orderCount: sql<number>`COUNT(*)`,
          totalRevenue: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
          avgRevenue: sql<string>`COALESCE(AVG(${orders.totalAmount}), 0)`,
          totalGuests: sql<number>`COALESCE(SUM(${orders.guestCount}), 0)`,
          avgGuests: sql<string>`COALESCE(AVG(${orders.guestCount}), 0)`,
          totalTips: sql<string>`COALESCE(SUM(${orders.tipAmount}), 0)`,
        })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end), isNotNull(orders.tableId)))
        .groupBy(orders.tableId).orderBy(desc(sql`SUM(${orders.totalAmount})`));

      const totalRevenue = rows.reduce((s: number, r: typeof rows[0]) => s + parseFloat(r.totalRevenue ?? "0"), 0);

      return {
        tables: rows.map((r: typeof rows[0]) => ({
          tableId: r.tableId, orderCount: Number(r.orderCount ?? 0),
          totalRevenue: parseFloat(r.totalRevenue ?? "0").toFixed(2), avgRevenue: parseFloat(r.avgRevenue ?? "0").toFixed(2),
          totalGuests: Number(r.totalGuests ?? 0), avgGuests: parseFloat(r.avgGuests ?? "0").toFixed(1),
          totalTips: parseFloat(r.totalTips ?? "0").toFixed(2),
          revenueShare: totalRevenue > 0 ? ((parseFloat(r.totalRevenue ?? "0") / totalRevenue) * 100).toFixed(1) : "0.0",
        })),
        summary: { totalTables: rows.length, totalRevenue: totalRevenue.toFixed(2), avgRevenuePerTable: rows.length > 0 ? (totalRevenue / rows.length).toFixed(2) : "0.00" },
      };
    }),

  // ── 7. Kellner-Performance ────────────────────────────────────────────────
  getWaiterPerformance: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);

      const rows = await db
        .select({
          staffId: orders.staffId,
          orderCount: sql<number>`COUNT(*)`,
          totalRevenue: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
          avgOrderValue: sql<string>`COALESCE(AVG(${orders.totalAmount}), 0)`,
          totalTips: sql<string>`COALESCE(SUM(${orders.tipAmount}), 0)`,
          totalGuests: sql<number>`COALESCE(SUM(${orders.guestCount}), 0)`,
        })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end), isNotNull(orders.staffId)))
        .groupBy(orders.staffId).orderBy(desc(sql`SUM(${orders.totalAmount})`));

      const staffIds = rows.map((r: typeof rows[0]) => r.staffId).filter(Boolean) as number[];
      const staffList = staffIds.length > 0 ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds)) : [];
      const staffMap: Record<number, string> = Object.fromEntries(staffList.map((s: { id: number; name: string }) => [s.id, s.name]));
      const totalRevenue = rows.reduce((s: number, r: typeof rows[0]) => s + parseFloat(r.totalRevenue ?? "0"), 0);

      return {
        staff: rows.map((r: typeof rows[0], i: number) => ({
          rank: i + 1, staffId: r.staffId, staffName: staffMap[r.staffId ?? 0] ?? `Kellner #${r.staffId}`,
          orderCount: Number(r.orderCount ?? 0), totalRevenue: parseFloat(r.totalRevenue ?? "0").toFixed(2),
          avgOrderValue: parseFloat(r.avgOrderValue ?? "0").toFixed(2), totalTips: parseFloat(r.totalTips ?? "0").toFixed(2),
          totalGuests: Number(r.totalGuests ?? 0),
          revenueShare: totalRevenue > 0 ? ((parseFloat(r.totalRevenue ?? "0") / totalRevenue) * 100).toFixed(1) : "0.0",
        })),
      };
    }),

  // ── 8. Zahlungsarten-Trend ────────────────────────────────────────────────
  getPaymentTrend: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string(), granularity: z.enum(["day", "week", "month"]).default("day") }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);

      const dateGroupExpr = input.granularity === "month" ? sql`DATE_FORMAT(${orders.paidAt}, '%Y-%m')`
        : input.granularity === "week" ? sql`DATE_FORMAT(${orders.paidAt}, '%Y-%u')`
        : sql`DATE(${orders.paidAt})`;

      const rows = await db
        .select({
          period: dateGroupExpr,
          cash: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod}='cash' THEN ${orders.totalAmount} ELSE 0 END), 0)`,
          card: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod}='card' THEN ${orders.totalAmount} ELSE 0 END), 0)`,
          twint: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod}='twint' THEN ${orders.totalAmount} ELSE 0 END), 0)`,
          other: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} NOT IN ('cash','card','twint') THEN ${orders.totalAmount} ELSE 0 END), 0)`,
          total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
          orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)))
        .groupBy(dateGroupExpr).orderBy(dateGroupExpr);

      return {
        granularity: input.granularity,
        dataPoints: rows.map((r: typeof rows[0]) => ({
          period: String(r.period),
          cash: parseFloat(r.cash ?? "0").toFixed(2), card: parseFloat(r.card ?? "0").toFixed(2),
          twint: parseFloat(r.twint ?? "0").toFixed(2), other: parseFloat(r.other ?? "0").toFixed(2),
          total: parseFloat(r.total ?? "0").toFixed(2), orderCount: Number(r.orderCount ?? 0),
        })),
      };
    }),

  // ── 9. KI-Insights ────────────────────────────────────────────────────────
  getAiInsights: protectedProcedure
    .input(z.object({ weeksBack: z.number().min(4).max(52).default(12) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const end = new Date();
      const start = new Date(); start.setDate(start.getDate() - input.weeksBack * 7);

      // Wochentag-Durchschnitt via raw SQL (kein Subquery-ORM)
      const weekdayAvg = await db.execute(sql`
        SELECT weekday, AVG(dailyRevenue) as avgRevenue, AVG(dailyOrders) as avgOrders
        FROM (
          SELECT DAYOFWEEK(paidAt) as weekday, DATE(paidAt) as date,
                 SUM(totalAmount) as dailyRevenue, COUNT(*) as dailyOrders
          FROM orders
          WHERE restaurantId = ${restaurantId} AND status = 'paid'
            AND paidAt >= ${start} AND paidAt <= ${end}
          GROUP BY DATE(paidAt), DAYOFWEEK(paidAt)
        ) daily
        GROUP BY weekday ORDER BY weekday
      `);

      // Peak-Stunden
      const peakHours = await db
        .select({ hour: sql<number>`HOUR(${orders.paidAt})`, avgRevenue: sql<string>`AVG(${orders.totalAmount})`, totalOrders: sql<number>`COUNT(*)` })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)))
        .groupBy(sql`HOUR(${orders.paidAt})`).orderBy(desc(sql`COUNT(*)`)).limit(5);

      // Wöchentlicher Trend
      const weeklyTrend = await db
        .select({ week: sql<string>`DATE_FORMAT(${orders.paidAt}, '%Y-%u')`, revenue: sql<string>`SUM(${orders.totalAmount})`, orderCount: sql<number>`COUNT(*)` })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)))
        .groupBy(sql`DATE_FORMAT(${orders.paidAt}, '%Y-%u')`).orderBy(sql`DATE_FORMAT(${orders.paidAt}, '%Y-%u')`);

      // Ø Tagesumsatz
      const [avgDayRow] = await db.execute(sql`
        SELECT AVG(dailyRev) as avgDailyRevenue FROM (
          SELECT SUM(totalAmount) as dailyRev FROM orders
          WHERE restaurantId = ${restaurantId} AND status = 'paid'
            AND paidAt >= ${start} AND paidAt <= ${end}
          GROUP BY DATE(paidAt)
        ) d
      `);

      const avgDailyRev = parseFloat((avgDayRow as Record<string, string>)?.avgDailyRevenue ?? "0");
      const weekdayRows = Array.isArray(weekdayAvg) ? (weekdayAvg[0] as Array<Record<string, string | number>>) : [];

      const weekdayFactors = weekdayRows.map((r: Record<string, string | number>) => {
        const wd = Number(r.weekday) - 1; // 0=So
        const avg = parseFloat(String(r.avgRevenue ?? "0"));
        return {
          weekday: wd, label: WEEKDAY_NAMES[wd] ?? "?",
          avgRevenue: avg.toFixed(2), avgOrders: parseFloat(String(r.avgOrders ?? "0")).toFixed(1),
          factor: avgDailyRev > 0 ? (avg / avgDailyRev).toFixed(2) : "1.00",
        };
      });

      return {
        analysisWindow: { start: start.toISOString(), end: end.toISOString(), weeksBack: input.weeksBack },
        weekdayPatterns: weekdayFactors,
        peakHours: peakHours.map((r: typeof peakHours[0]) => ({
          hour: Number(r.hour), label: `${String(r.hour).padStart(2, "0")}:00`,
          avgRevenue: parseFloat(r.avgRevenue ?? "0").toFixed(2), totalOrders: Number(r.totalOrders ?? 0),
        })),
        weeklyTrend: weeklyTrend.map((r: typeof weeklyTrend[0]) => ({ week: r.week, revenue: parseFloat(r.revenue ?? "0").toFixed(2), orders: Number(r.orderCount ?? 0) })),
        avgDailyRevenue: avgDailyRev.toFixed(2),
        nextWeekForecast: Array.from({ length: 7 }, (_, i) => {
          const factor = weekdayFactors.find(f => f.weekday === i);
          const forecast = avgDailyRev * parseFloat(factor?.factor ?? "1");
          const d = new Date(); d.setDate(d.getDate() + ((i - d.getDay() + 8) % 7));
          return { weekday: i, label: WEEKDAY_NAMES[i], date: d.toISOString().split("T")[0], forecastRevenue: forecast.toFixed(2), confidence: "medium" as const };
        }),
      };
    }),

  // ── 10. Einkaufsempfehlung-Basis ──────────────────────────────────────────
  getPurchaseForecast: protectedProcedure
    .input(z.object({ weeksBack: z.number().min(2).max(12).default(4) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const end = new Date();
      const start = new Date(); start.setDate(start.getDate() - input.weeksBack * 7);
      const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - input.weeksBack * 7);

      const currRows = await db
        .select({
          productId: orderItems.productId, productName: orderItems.name, itemType: orderItems.itemType,
          totalQuantity: sql<number>`SUM(${orderItems.quantity})`,
          totalRevenue: sql<string>`SUM(${orderItems.totalPrice})`,
        })
        .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start), lte(orders.paidAt, end)))
        .groupBy(orderItems.productId, orderItems.name, orderItems.itemType)
        .orderBy(desc(sql`SUM(${orderItems.quantity})`)).limit(50);

      const prevRows = await db
        .select({ productId: orderItems.productId, totalQuantity: sql<number>`SUM(${orderItems.quantity})` })
        .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, prevStart), lte(orders.paidAt, start)))
        .groupBy(orderItems.productId);

      const prevMap: Record<number, number> = Object.fromEntries(prevRows.map((r: typeof prevRows[0]) => [r.productId, Number(r.totalQuantity ?? 0)]));

      return {
        period: { start: start.toISOString(), end: end.toISOString(), weeksBack: input.weeksBack },
        recommendations: currRows.map((r: typeof currRows[0]) => {
          const curr = Number(r.totalQuantity ?? 0);
          const prev = prevMap[r.productId ?? 0] ?? 0;
          const avgWeekly = curr / input.weeksBack;
          return {
            productId: r.productId, productName: r.productName, itemType: r.itemType,
            totalQuantitySold: curr, avgWeeklyQuantity: avgWeekly.toFixed(1),
            trendPercent: calcChange(curr, prev), suggestedWeeklyOrder: Math.ceil(avgWeekly * 1.1),
            totalRevenue: parseFloat(r.totalRevenue ?? "0").toFixed(2),
          };
        }),
      };
    }),

  // ── 11. Dashboard-KPIs ────────────────────────────────────────────────────
  getDashboardKpis: protectedProcedure
    .input(z.object({ period: z.enum(["day", "week", "month", "quarter", "year"]).default("month"), referenceDate: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const refDate = input.referenceDate ? new Date(input.referenceDate) : new Date();
      const { start, end, prevStart, prevEnd } = getPeriodBounds(input.period, refDate);

      const agg = async (s: Date, e: Date) => {
        const [row] = await db
          .select({
            revenue: sql<string>`COALESCE(SUM(totalAmount), 0)`,
            orders: sql<number>`COUNT(*)`,
            guests: sql<number>`COALESCE(SUM(guestCount), 0)`,
            tips: sql<string>`COALESCE(SUM(tipAmount), 0)`,
            avgOrder: sql<string>`COALESCE(AVG(totalAmount), 0)`,
          })
          .from(orders)
          .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, s), lte(orders.paidAt, e)));
        return row;
      };

      const [curr, prev] = await Promise.all([agg(start, end), agg(prevStart, prevEnd)]);

      const [closingAgg] = await db
        .select({ count: sql<number>`COUNT(*)`, totalRevenue: sql<string>`COALESCE(SUM(totalRevenue), 0)` })
        .from(dailyClosings)
        .where(and(eq(dailyClosings.restaurantId, restaurantId), gte(dailyClosings.closingDate, start), lte(dailyClosings.closingDate, end)));

      const currRev = parseFloat(curr?.revenue ?? "0");
      const prevRev = parseFloat(prev?.revenue ?? "0");
      const currOrders = Number(curr?.orders ?? 0);
      const prevOrders = Number(prev?.orders ?? 0);
      const currGuests = Number(curr?.guests ?? 0);
      const prevGuests = Number(prev?.guests ?? 0);

      return {
        period: input.period,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        kpis: {
          revenue: { value: currRev.toFixed(2), change: calcChange(currRev, prevRev), prev: prevRev.toFixed(2) },
          orders: { value: currOrders, change: calcChange(currOrders, prevOrders), prev: prevOrders },
          guests: { value: currGuests, change: calcChange(currGuests, prevGuests), prev: prevGuests },
          avgOrderValue: { value: parseFloat(curr?.avgOrder ?? "0").toFixed(2), change: "0.0", prev: "0.00" },
          tips: { value: parseFloat(curr?.tips ?? "0").toFixed(2), change: "0.0", prev: "0.00" },
          closingsCount: { value: Number(closingAgg?.count ?? 0), change: "0.0", prev: 0 },
        },
      };
    }),
});
