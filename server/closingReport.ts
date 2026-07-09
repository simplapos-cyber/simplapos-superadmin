/**
 * closingReport.ts
 * Professioneller Tagesabschluss-Bericht (9 Sektionen)
 *
 * Sektionen:
 * 1. Kopfzeile (Restaurant, Datum, Abschluss-Nr., Kassierer)
 * 2. Umsatz-Übersicht (Brutto, Rabatte, Netto, Trinkgeld)
 * 3. MWST-Aufschlüsselung (8.1% / 2.6% / 0%)
 * 4. Zahlungsarten (Bar, Karte, Twint, Sonstige)
 * 5. Kassendifferenz (Soll / Ist / Differenz)
 * 6. Bestellungs-Statistik (Tische, Gäste, Bestellungen, Ø-Werte)
 * 7. Top-Produkte (5 meistverkaufte Artikel)
 * 8. Lagerabzüge (Wareneinsatz)
 * 9. Stornierungen
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  dailyClosings,
  restaurants,
  users,
  orders,
  orderItems,
  inventoryStockMovements,
  sumupTransactions,
  paytecTransactions,
  nexiTransactions,
} from "../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

// ─── Typen ───────────────────────────────────────────────────────────────────

export interface VatLine {
  rate: string;         // z.B. "8.10"
  label: string;        // z.B. "8.1% (Vor Ort)"
  netBase: string;      // Nettobasis CHF
  vatAmount: string;    // MwSt-Betrag CHF
  grossAmount: string;  // Brutto CHF
}

export interface PaymentLine {
  method: string;       // "Bar", "Kreditkarte", "Twint", "Sonstige"
  count: number;
  amount: string;       // CHF
}

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: string;      // CHF
}

export interface ClosingReport {
  // 1. Kopfzeile
  header: {
    restaurantName: string;
    address: string;
    vatNumber: string;
    closingId: number;
    closingNumber: string;   // z.B. "TA-2024-0042"
    closingDate: string;     // ISO-String
    performedByName: string;
    mode: "auto" | "manual";
    generatedAt: string;     // ISO-String
  };

  // 2. Umsatz-Übersicht
  revenue: {
    grossRevenue: string;    // Bruttoumsatz (inkl. MWST)
    discounts: string;       // Rabatte / Stornierungen
    netRevenue: string;      // Nettoumsatz (exkl. MWST)
    tips: string;            // Trinkgeld
    totalWithTips: string;   // Nettoumsatz + Trinkgeld
  };

  // 3. MWST-Aufschlüsselung
  vat: {
    lines: VatLine[];
    totalNetBase: string;
    totalVatAmount: string;
    totalGross: string;
  };

  // 4. Zahlungsarten
  payments: {
    lines: PaymentLine[];
    total: string;
  };

  // 5. Kassendifferenz
  cashBalance: {
    cashExpected: string;    // Soll (laut System)
    cashActual: string;      // Ist (eingegeben)
    difference: string;      // Differenz (+/-)
    hasDifference: boolean;
  };

  // 6. Bestellungs-Statistik
  stats: {
    totalOrders: number;
    cancelledOrders: number;
    totalGuests: number;
    totalTables: number;
    avgRevenuePerTable: string;
    avgRevenuePerGuest: string;
    avgOrderValue: string;
    openingTime: string | null;  // Erste Bestellung
    closingTime: string | null;  // Letzte Bestellung
  };

  // 7. Top-Produkte
  topProducts: TopProduct[];

  // 8. Lagerabzüge
  inventory: {
    totalConsumedValue: string;
    totalMovements: number;
    grossMargin: string;        // Bruttomarge = Umsatz - Wareneinsatz
    grossMarginPercent: string; // In %
  };

  // 9. Stornierungen
  cancellations: {
    count: number;
    totalValue: string;
  };

  // 10. Kartenzahlungs-Aufschlüsselung nach Anbieter
  cardProviderBreakdown: {
    sumup: { count: number; total: string };
    paytec: { count: number; total: string };
    nexi: { count: number; total: string };
    totalCard: string;
  };
  // Notizen
  notes: string | null;
}

// ─── Helper: Tenant-Prüfung ───────────────────────────────────────────────────
function requireRestaurant(ctx: { user: { restaurantId?: number | null; role: string } }): number {
  const rid = ctx.user.restaurantId;
  if (!rid) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return rid;
}

// ─── Kern-Logik: Bericht erstellen ───────────────────────────────────────────
export async function buildClosingReport(
  closingId: number,
  restaurantId: number,
  cashActual?: string
): Promise<ClosingReport> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Datenbank nicht verfügbar" });

  // Abschluss laden
  const [closing] = await db
    .select()
    .from(dailyClosings)
    .where(and(eq(dailyClosings.id, closingId), eq(dailyClosings.restaurantId, restaurantId)))
    .limit(1);

  if (!closing) throw new TRPCError({ code: "NOT_FOUND", message: "Tagesabschluss nicht gefunden" });

  // Restaurant laden
  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);

  // Kassierer laden
  let performedByName = "Automatisch";
  if (closing.performedBy) {
    const [performer] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, closing.performedBy))
      .limit(1);
    performedByName = performer?.name ?? performer?.email ?? `User #${closing.performedBy}`;
  }

  // Zeitfenster des Abschlusses
  const closingDate = new Date(closing.closingDate);
  const startOfDay = new Date(closingDate.getFullYear(), closingDate.getMonth(), closingDate.getDate(), 0, 0, 0, 0);

  // ─── Sektion 3: MWST aus taxBreakdown aggregieren ────────────────────────
  const paidOrders = await db
    .select({ taxBreakdown: orders.taxBreakdown, totalAmount: orders.totalAmount, taxAmount: orders.taxAmount })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startOfDay),
      lte(orders.paidAt, closingDate),
    ));

  const vatAgg = new Map<string, { base: number; amount: number }>();
  for (const o of paidOrders) {
    const breakdown = o.taxBreakdown as Array<{ rate: string; base: string; amount: string }> | null;
    if (!breakdown) {
      // Fallback: Gesamtbetrag dem Standardsatz zuordnen
      const gross = parseFloat(o.totalAmount ?? "0");
      const tax = parseFloat(o.taxAmount ?? "0");
      const base = gross - tax;
      const existing = vatAgg.get("8.10") ?? { base: 0, amount: 0 };
      vatAgg.set("8.10", { base: existing.base + base, amount: existing.amount + tax });
      continue;
    }
    for (const b of breakdown) {
      const existing = vatAgg.get(b.rate) ?? { base: 0, amount: 0 };
      vatAgg.set(b.rate, {
        base: existing.base + parseFloat(b.base),
        amount: existing.amount + parseFloat(b.amount),
      });
    }
  }

  const vatLabels: Record<string, string> = {
    "8.10": "8.1% (Vor Ort / Restaurant)",
    "2.60": "2.6% (Take-away)",
    "0.00": "0% (Steuerbefreit)",
  };

  const vatLines: VatLine[] = [];
  let totalNetBase = 0;
  let totalVatAmount = 0;

  // Immer 8.1% und 2.6% anzeigen (auch wenn 0)
  const allRates = Array.from(new Set(["8.10", "2.60", ...Array.from(vatAgg.keys())]));
  for (const rate of allRates) {
    const data = vatAgg.get(rate) ?? { base: 0, amount: 0 };
    const gross = data.base + data.amount;
    vatLines.push({
      rate,
      label: vatLabels[rate] ?? `${rate}%`,
      netBase: data.base.toFixed(2),
      vatAmount: data.amount.toFixed(2),
      grossAmount: gross.toFixed(2),
    });
    totalNetBase += data.base;
    totalVatAmount += data.amount;
  }

  // ─── Sektion 4: Zahlungsarten ─────────────────────────────────────────────
  const paymentAgg = await db
    .select({
      method: orders.paymentMethod,
      count: sql<number>`COUNT(*)`,
      amount: sql<string>`COALESCE(SUM(totalAmount), 0)`,
    })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startOfDay),
      lte(orders.paidAt, closingDate),
    ))
    .groupBy(orders.paymentMethod);

  const methodLabels: Record<string, string> = {
    cash: "Bar",
    card: "Kreditkarte / EC",
    twint: "Twint",
    online: "Online",
    invoice: "Rechnung",
  };

  const paymentLines: PaymentLine[] = paymentAgg.map((p: { method: string | null; count: number; amount: string }) => ({
    method: methodLabels[p.method ?? ""] ?? (p.method ?? "Sonstige"),
    count: Number(p.count),
    amount: parseFloat(p.amount).toFixed(2),
  }));

  const totalPayments = paymentLines.reduce((sum, l) => sum + parseFloat(l.amount), 0);

  // ─── Sektion 5: Kassendifferenz ───────────────────────────────────────────
  const cashExpected = parseFloat(closing.totalCash ?? "0");
  const cashActualNum = cashActual !== undefined ? parseFloat(cashActual) : cashExpected;
  const cashDiff = cashActualNum - cashExpected;

  // ─── Sektion 6: Statistiken ───────────────────────────────────────────────
  const [statsAgg] = await db
    .select({
      totalOrders: sql<number>`COUNT(*)`,
      totalGuests: sql<number>`COALESCE(SUM(guestCount), 0)`,
      firstOrder: sql<string>`MIN(paidAt)`,
      lastOrder: sql<string>`MAX(paidAt)`,
    })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startOfDay),
      lte(orders.paidAt, closingDate),
    ));

  const [cancelledAgg] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      totalValue: sql<string>`COALESCE(SUM(totalAmount), 0)`,
    })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "cancelled"),
      gte(orders.createdAt, startOfDay),
      lte(orders.createdAt, closingDate),
    ));

  // Anzahl eindeutiger Tische
  const tablesResult = await db
    .select({ tableId: orders.tableId })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startOfDay),
      lte(orders.paidAt, closingDate),
    ))
    .groupBy(orders.tableId);

  const totalTables = tablesResult.filter((t: { tableId: number | null }) => t.tableId !== null).length;
  const totalOrders = Number(statsAgg?.totalOrders ?? 0);
  const totalGuests = Number(statsAgg?.totalGuests ?? 0);
  const grossRevenue = parseFloat(closing.totalRevenue ?? "0");

  const avgRevenuePerTable = totalTables > 0 ? (grossRevenue / totalTables).toFixed(2) : "0.00";
  const avgRevenuePerGuest = totalGuests > 0 ? (grossRevenue / totalGuests).toFixed(2) : "0.00";
  const avgOrderValue = totalOrders > 0 ? (grossRevenue / totalOrders).toFixed(2) : "0.00";

  // ─── Sektion 7: Top-Produkte ──────────────────────────────────────────────
  const topProductsRaw = await db
    .select({
      name: orderItems.name,
      quantity: sql<number>`SUM(quantity)`,
      revenue: sql<string>`SUM(totalPrice)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startOfDay),
      lte(orders.paidAt, closingDate),
    ))
    .groupBy(orderItems.name)
    .orderBy(desc(sql`SUM(quantity)`))
    .limit(5);

  const topProducts: TopProduct[] = topProductsRaw.map((p: { name: string; quantity: number; revenue: string }) => ({
    name: p.name,
    quantity: Number(p.quantity),
    revenue: parseFloat(p.revenue).toFixed(2),
  }));

  // ─── Sektion 8: Lagerabzüge ───────────────────────────────────────────────
  const [stockAgg] = await db
    .select({
      totalConsumedValue: sql<string>`COALESCE(SUM(ABS(quantity) * COALESCE(unitCost, 0)), 0)`,
      totalMovements: sql<number>`COUNT(*)`,
    })
    .from(inventoryStockMovements)
    .where(and(
      eq(inventoryStockMovements.restaurantId, restaurantId),
      eq(inventoryStockMovements.type, "sale"),
      gte(inventoryStockMovements.createdAt, startOfDay),
      lte(inventoryStockMovements.createdAt, closingDate),
    ));

  const totalConsumedValue = parseFloat(stockAgg?.totalConsumedValue ?? "0");
  const grossMargin = grossRevenue - totalConsumedValue;
  const grossMarginPercent = grossRevenue > 0 ? ((grossMargin / grossRevenue) * 100).toFixed(1) : "0.0";

  // ─── Sektion 10: Kartenzahlungs-Aufschlüsselung nach Anbieter ────────────
  const [sumupAgg] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(amount), 0)`,
    })
    .from(sumupTransactions)
    .where(and(
      eq(sumupTransactions.restaurantId, restaurantId),
      eq(sumupTransactions.status, "paid"),
      gte(sumupTransactions.initiatedAt, startOfDay),
      lte(sumupTransactions.initiatedAt, closingDate),
    ));

  const [paytecAgg] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(amount), 0)`,
    })
    .from(paytecTransactions)
    .where(and(
      eq(paytecTransactions.restaurantId, restaurantId),
      eq(paytecTransactions.status, "approved"),
      gte(paytecTransactions.initiatedAt, startOfDay),
      lte(paytecTransactions.initiatedAt, closingDate),
    ));

  const [nexiAgg] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(amount), 0)`,
    })
    .from(nexiTransactions)
    .where(and(
      eq(nexiTransactions.restaurantId, restaurantId),
      eq(nexiTransactions.status, "approved"),
      gte(nexiTransactions.initiatedAt, startOfDay),
      lte(nexiTransactions.initiatedAt, closingDate),
    ));

  const sumupTotal = parseFloat(sumupAgg?.total ?? "0");
  const paytecTotal = parseFloat(paytecAgg?.total ?? "0");
  const nexiTotal = parseFloat(nexiAgg?.total ?? "0");
  const cardProviderTotal = sumupTotal + paytecTotal + nexiTotal;

  // ─── Abschluss-Nummer generieren ─────────────────────────────────────────
  const year = closingDate.getFullYear();
  const closingNumber = `TA-${year}-${String(closing.id).padStart(4, "0")}`;

  // ─── Bericht zusammenstellen ─────────────────────────────────────────────
  const netRevenue = grossRevenue - totalVatAmount;
  const tips = parseFloat(closing.totalTips ?? "0");

  return {
    header: {
      restaurantName: restaurant?.name ?? "Restaurant",
      address: [
        restaurant?.address,
        restaurant?.zip && restaurant?.city ? `${restaurant.zip} ${restaurant.city}` : null,
        restaurant?.country ?? "CH",
      ].filter(Boolean).join(", "),
      vatNumber: restaurant?.vatNumber ?? "",
      closingId: closing.id,
      closingNumber,
      closingDate: closing.closingDate.toISOString(),
      performedByName,
      mode: closing.mode,
      generatedAt: new Date().toISOString(),
    },
    revenue: {
      grossRevenue: grossRevenue.toFixed(2),
      discounts: "0.00",  // Zukünftig: Rabatte aus separater Tabelle
      netRevenue: netRevenue.toFixed(2),
      tips: tips.toFixed(2),
      totalWithTips: (netRevenue + tips).toFixed(2),
    },
    vat: {
      lines: vatLines,
      totalNetBase: totalNetBase.toFixed(2),
      totalVatAmount: totalVatAmount.toFixed(2),
      totalGross: (totalNetBase + totalVatAmount).toFixed(2),
    },
    payments: {
      lines: paymentLines,
      total: totalPayments.toFixed(2),
    },
    cashBalance: {
      cashExpected: cashExpected.toFixed(2),
      cashActual: cashActualNum.toFixed(2),
      difference: cashDiff.toFixed(2),
      hasDifference: Math.abs(cashDiff) > 0.01,
    },
    stats: {
      totalOrders,
      cancelledOrders: Number(cancelledAgg?.count ?? 0),
      totalGuests,
      totalTables,
      avgRevenuePerTable,
      avgRevenuePerGuest,
      avgOrderValue,
      openingTime: statsAgg?.firstOrder ?? null,
      closingTime: statsAgg?.lastOrder ?? null,
    },
    topProducts,
    inventory: {
      totalConsumedValue: totalConsumedValue.toFixed(2),
      totalMovements: Number(stockAgg?.totalMovements ?? 0),
      grossMargin: grossMargin.toFixed(2),
      grossMarginPercent,
    },
    cancellations: {
      count: Number(cancelledAgg?.count ?? 0),
      totalValue: parseFloat(cancelledAgg?.totalValue ?? "0").toFixed(2),
    },
    cardProviderBreakdown: {
      sumup: { count: Number(sumupAgg?.count ?? 0), total: sumupTotal.toFixed(2) },
      paytec: { count: Number(paytecAgg?.count ?? 0), total: paytecTotal.toFixed(2) },
      nexi: { count: Number(nexiAgg?.count ?? 0), total: nexiTotal.toFixed(2) },
      totalCard: cardProviderTotal.toFixed(2),
    },
    notes: closing.notes ?? null,
  };
}

// ─── tRPC-Router ─────────────────────────────────────────────────────────────
export const closingReportRouter = router({

  // Vollständigen Bericht für einen Abschluss laden
  getClosingReport: protectedProcedure
    .input(z.object({
      closingId: z.number().int().positive(),
      cashActual: z.string().optional(),  // Ist-Betrag (optional, für Kassendifferenz)
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      return buildClosingReport(input.closingId, restaurantId, input.cashActual);
    }),

  // Kassendifferenz nachträglich speichern
  saveCashActual: adminProcedure
    .input(z.object({
      closingId: z.number().int().positive(),
      cashActual: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const cashActualNum = parseFloat(input.cashActual);
      if (isNaN(cashActualNum)) throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültiger Betrag" });

      // Abschluss laden um cashEnd (Soll) zu ermitteln
      const [closing] = await db
        .select({ totalCash: dailyClosings.totalCash })
        .from(dailyClosings)
        .where(and(eq(dailyClosings.id, input.closingId), eq(dailyClosings.restaurantId, restaurantId)))
        .limit(1);

      if (!closing) throw new TRPCError({ code: "NOT_FOUND" });

      const cashExpected = parseFloat(closing.totalCash ?? "0");
      const diff = cashActualNum - cashExpected;

      await db.update(dailyClosings)
        .set({
          cashEnd: input.cashActual,
          cashDifference: diff.toFixed(2),
        })
        .where(and(eq(dailyClosings.id, input.closingId), eq(dailyClosings.restaurantId, restaurantId)));

      return { success: true, difference: diff.toFixed(2) };
    }),
});
