/**
 * reportRouter.ts
 * Revisionssichere Berichte für SimplaPOS
 * Berichtstypen: Z-Abschluss, Monatsbericht, Jahresbericht, Detaillierter Monatsbericht, Kassenbon
 *
 * Gesetzliche Grundlage: OR Art. 957ff + MWSTG (Schweiz)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  orders,
  orderItems,
  orderVoids,
  dailyClosings,
  restaurants,
  users,
  cashbookEntries,
} from "../drizzle/schema";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import type {
  ZAbschlussData,
  MonthlyReportData,
  YearlyReportData,
  DetailedMonthlyReportData,
  ReceiptData,
} from "./reportPdf";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function requireRestaurant(ctx: { user: { restaurantId?: number | null; role: string } }): number {
  const rid = ctx.user.restaurantId;
  if (!rid) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return rid;
}

const CATEGORY_LABELS: Record<string, string> = {
  food: "Essen",
  drink: "Getränke",
  alcohol: "Alkohol",
  wine: "Wein",
  beer: "Bier",
  softdrink: "Süssgetränk",
  hot_drink: "Warme Getränke",
  dessert: "Dessert",
  other: "Nicht kategorisiert",
};

function getCategoryLabel(itemType: string): string {
  return CATEGORY_LABELS[itemType] ?? "Nicht kategorisiert";
}

// ─── Aggregations-Hilfsfunktion: Kategorie-Blöcke ────────────────────────────

async function buildCategoryBlocks(
  db: Awaited<ReturnType<typeof getDb>>,
  restaurantId: number,
  startDate: Date,
  endDate: Date
) {
  if (!db) return { blocks: [], grandTotal: { quantity: 0, brutto: 0, mwst: 0, netto: 0 } };

  // Bestellungen nach Zahlungsart und Kategorie aggregieren
  const rawData = await db
    .select({
      paymentMethod: orders.paymentMethod,
      itemType: orderItems.itemType,
      quantity: sql<number>`SUM(${orderItems.quantity})`,
      totalPrice: sql<number>`SUM(${orderItems.totalPrice})`,
      taxRate: sql<number>`AVG(COALESCE(${orderItems.taxRate}, 8.10))`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startDate),
      lte(orders.paidAt, endDate),
    ))
    .groupBy(orders.paymentMethod, orderItems.itemType);

  // Nach Zahlungsart gruppieren
  const blockMap = new Map<string, { category: string; quantity: number; brutto: number; mwst: number; netto: number }[]>();

  for (const row of rawData) {
    const method = row.paymentMethod ?? "other";
    const blockTitle = method === "cash" ? "Restaurant (Bar)"
      : method === "card" ? "Restaurant (Karte)"
      : method === "twint" ? "Restaurant (Twint)"
      : method === "online" ? "Restaurant (Online)"
      : method === "invoice" ? "Restaurant (Rechnung)"
      : "Restaurant (Sonstige)";

    const brutto = Number(row.totalPrice ?? 0);
    const taxRate = Number(row.taxRate ?? 8.10) / 100;
    const mwst = brutto / (1 + taxRate) * taxRate;
    const netto = brutto - mwst;

    if (!blockMap.has(blockTitle)) blockMap.set(blockTitle, []);
    blockMap.get(blockTitle)!.push({
      category: getCategoryLabel(row.itemType ?? "other"),
      quantity: Number(row.quantity ?? 0),
      brutto,
      mwst,
      netto,
    });
  }

  // Blöcke mit Prozentanteilen berechnen
  const blocks: ZAbschlussData["categoryBlocks"] = [];
  let grandBrutto = 0, grandMwst = 0, grandNetto = 0, grandQty = 0;

  for (const [blockTitle, rows] of Array.from(blockMap.entries())) {
    const blockBrutto = rows.reduce((s: number, r: { brutto: number }) => s + r.brutto, 0);
    const blockMwst = rows.reduce((s: number, r: { mwst: number }) => s + r.mwst, 0);
    const blockNetto = rows.reduce((s: number, r: { netto: number }) => s + r.netto, 0);
    const blockQty = rows.reduce((s: number, r: { quantity: number }) => s + r.quantity, 0);

    blocks.push({
      blockTitle,
      rows: rows.map((r: { category: string; quantity: number; brutto: number; mwst: number; netto: number }) => ({
        ...r,
        pct: blockBrutto > 0 ? (r.brutto / blockBrutto) * 100 : 0,
      })),
      total: { quantity: blockQty, brutto: blockBrutto, mwst: blockMwst, netto: blockNetto },
    });

    grandBrutto += blockBrutto;
    grandMwst += blockMwst;
    grandNetto += blockNetto;
    grandQty += blockQty;
  }

  return {
    blocks,
    grandTotal: { quantity: grandQty, brutto: grandBrutto, mwst: grandMwst, netto: grandNetto },
  };
}

// ─── Kellnerverkäufe aggregieren ─────────────────────────────────────────────

async function buildStaffSales(
  db: Awaited<ReturnType<typeof getDb>>,
  restaurantId: number,
  startDate: Date,
  endDate: Date
): Promise<ZAbschlussData["staffSales"]> {
  if (!db) return [];

  const raw = await db
    .select({
      staffId: orders.staffId,
      paymentMethod: orders.paymentMethod,
      totalAmount: sql<number>`SUM(${orders.totalAmount})`,
      tipAmount: sql<number>`SUM(${orders.tipAmount})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startDate),
      lte(orders.paidAt, endDate),
    ))
    .groupBy(orders.staffId, orders.paymentMethod);

  // Mitarbeiternamen laden
  const staffIds = Array.from(new Set(raw.map((r: { staffId: number | null }) => r.staffId).filter(Boolean))) as number[];
  const staffMap = new Map<number, string>();
  if (staffIds.length > 0) {
    const staffRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.restaurantId, restaurantId)));
    for (const s of staffRows) {
      staffMap.set(s.id, s.name ?? s.email ?? `Mitarbeiter #${s.id}`);
    }

  }

  // Nach Mitarbeiter aggregieren
  const staffAgg = new Map<number, ZAbschlussData["staffSales"][0]>();
  for (const row of raw as Array<{ staffId: number | null; paymentMethod: string | null; totalAmount: string | null; tipAmount: string | null; count: number }>) {
    const sid = row.staffId ?? 0;
    if (!staffAgg.has(sid)) {
      staffAgg.set(sid, {
        staffName: staffMap.get(sid) ?? `Mitarbeiter #${sid}`,
        cash: 0, card: 0, online: 0, invoice: 0, giftCard: 0, total: 0, tips: 0, tipsDeducted: 0,
      });
    }
    const entry = staffAgg.get(sid)!;
    const amount = Number(row.totalAmount ?? 0);
    const tip = Number(row.tipAmount ?? 0);
    switch (row.paymentMethod) {
      case "cash": entry.cash += amount; break;
      case "card": entry.card += amount; break;
      case "online": entry.online += amount; break;
      case "invoice": entry.invoice += amount; break;
      default: entry.giftCard += amount; break;
    }
    entry.total += amount;
    entry.tips += tip;
  }

  return Array.from(staffAgg.values());
}

// ─── Stornierungen laden ──────────────────────────────────────────────────────

async function buildVoids(
  db: Awaited<ReturnType<typeof getDb>>,
  restaurantId: number,
  startDate: Date,
  endDate: Date
): Promise<{ voids: ZAbschlussData["voids"]; totalVoided: number }> {
  if (!db) return { voids: [], totalVoided: 0 };

  const raw = await db
    .select({
      id: orderVoids.id,
      staffId: orderVoids.staffId,
      itemName: orderVoids.itemName,
      quantity: orderVoids.quantity,
      totalVoided: orderVoids.totalVoided,
      reason: orderVoids.reason,
      createdAt: orderVoids.createdAt,
    })
    .from(orderVoids)
    .where(and(
      eq(orderVoids.restaurantId, restaurantId),
      gte(orderVoids.createdAt, startDate),
      lte(orderVoids.createdAt, endDate),
    ))
    .orderBy(desc(orderVoids.createdAt))
    .limit(100);

  const staffIds = Array.from(new Set(raw.map((r: { staffId: number }) => r.staffId)));
  const staffMap = new Map<number, string>();
  if (staffIds.length > 0) {
    const staffRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.restaurantId, restaurantId));
    for (const s of staffRows) staffMap.set(s.id, (s.name ?? s.email) ?? `#${s.id}`);
  }

  const voids = (raw as Array<{ staffId: number; itemName: string; quantity: number; totalVoided: string | null; reason: string; createdAt: Date }>).map((v) => ({
    staffName: staffMap.get(v.staffId) ?? `#${v.staffId}`,
    itemName: v.itemName,
    quantity: v.quantity,
    amount: Number(v.totalVoided ?? 0),
    reason: v.reason,
    createdAt: v.createdAt,
  }));

  const totalVoided = voids.reduce((s: number, v: { amount: number }) => s + v.amount, 0);
  return { voids, totalVoided };
}

// ─── Restaurant-Daten laden ───────────────────────────────────────────────────

async function getRestaurantInfo(db: Awaited<ReturnType<typeof getDb>>, restaurantId: number) {
  if (!db) return null;
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  return r ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// tRPC Router
// ═══════════════════════════════════════════════════════════════════════════════

export const reportRouter = router({

  // ── Z-Abschluss Daten (für Preview im Frontend) ──────────────────────────
  getZAbschlussData: protectedProcedure
    .input(z.object({ closingId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [closing] = await db.select().from(dailyClosings)
        .where(and(eq(dailyClosings.id, input.closingId), eq(dailyClosings.restaurantId, restaurantId)))
        .limit(1);
      if (!closing) throw new TRPCError({ code: "NOT_FOUND" });

      const closingDate = new Date(closing.closingDate);
      const startOfDay = new Date(closingDate.getFullYear(), closingDate.getMonth(), closingDate.getDate(), 0, 0, 0, 0);

      const restaurant = await getRestaurantInfo(db, restaurantId);
      const { blocks, grandTotal } = await buildCategoryBlocks(db, restaurantId, startOfDay, closingDate);
      const staffSales = await buildStaffSales(db, restaurantId, startOfDay, closingDate);
      const { voids, totalVoided } = await buildVoids(db, restaurantId, startOfDay, closingDate);

      const [statsAgg] = await db.select({
        totalOrders: sql<number>`COUNT(*)`,
        totalGuests: sql<number>`COALESCE(SUM(${orders.guestCount}), 0)`,
      }).from(orders).where(and(
        eq(orders.restaurantId, restaurantId),
        eq(orders.status, "paid"),
        gte(orders.paidAt, startOfDay),
        lte(orders.paidAt, closingDate),
      ));

      const year = closingDate.getFullYear();
      const closingNumber = `TA-${year}-${String(closing.id).padStart(4, "0")}`;
      const totalOrdersNum = Number(statsAgg?.totalOrders ?? 0);

      return {
        restaurantName: restaurant?.name ?? "Restaurant",
        address: restaurant?.address ?? "",
        zip: restaurant?.zip ?? "",
        city: restaurant?.city ?? "",
        phone: restaurant?.phone ?? "",
        vatNumber: restaurant?.vatNumber ?? "",
        closingId: closing.id,
        closingNumber,
        closingDate: closing.closingDate,
        performedByName: "System",
        mode: closing.mode,
        generatedAt: new Date(),
        categoryBlocks: blocks,
        grandTotal,
        vatLines: [],
        paymentLines: [],
        cashStart: Number(closing.cashStart ?? 0),
        cashEnd: Number(closing.cashEnd ?? 0),
        cashExpected: Number(closing.totalCash ?? 0),
        cashDifference: Number(closing.cashDifference ?? 0),
        staffSales,
        voids,
        totalVoided,
        totalOrders: totalOrdersNum,
        totalGuests: Number(statsAgg?.totalGuests ?? 0),
        avgOrderValue: grandTotal.brutto > 0 && totalOrdersNum > 0
          ? grandTotal.brutto / totalOrdersNum
          : 0,
        notes: closing.notes ?? undefined,
      } satisfies ZAbschlussData;
    }),

  // ── Monatsbericht Daten ───────────────────────────────────────────────────
  getMonthlyReportData: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .query(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59, 999);

      const restaurant = await getRestaurantInfo(db, restaurantId);
      const { blocks, grandTotal } = await buildCategoryBlocks(db, restaurantId, startDate, endDate);
      const staffSales = await buildStaffSales(db, restaurantId, startDate, endDate);
      const { totalVoided, voids } = await buildVoids(db, restaurantId, startDate, endDate);

      const reportId = input.year * 100 + input.month;
      const reportNumber = `MB-${input.year}-${String(input.month).padStart(2, "0")}`;

      return {
        restaurantName: restaurant?.name ?? "Restaurant",
        address: restaurant?.address ?? "",
        zip: restaurant?.zip ?? "",
        city: restaurant?.city ?? "",
        phone: restaurant?.phone ?? "",
        vatNumber: restaurant?.vatNumber ?? "",
        reportId,
        reportNumber,
        year: input.year,
        month: input.month,
        generatedAt: new Date(),
        categoryBlocks: blocks,
        grandTotal,
        staffSales,
        totalVoided,
        voidCount: voids.length,
      } satisfies MonthlyReportData;
    }),

  // ── Detaillierter Monatsbericht ───────────────────────────────────────────
  getDetailedMonthlyReportData: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .query(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59, 999);
      const daysInMonth = endDate.getDate();
      const restaurant = await getRestaurantInfo(db, restaurantId);

      // Tagesweise Daten aggregieren
      type DailyPayRow = { day: number; paymentMethod: string | null; totalAmount: number; tipAmount: number; taxAmount: number };
      const dailyData: DailyPayRow[] = await db
        .select({
          day: sql<number>`DAY(${orders.paidAt})`,
          paymentMethod: orders.paymentMethod,
          totalAmount: sql<number>`SUM(${orders.totalAmount})`,
          tipAmount: sql<number>`SUM(${orders.tipAmount})`,
          taxAmount: sql<number>`SUM(${orders.taxAmount})`,
        })
        .from(orders)
        .where(and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.status, "paid"),
          gte(orders.paidAt, startDate),
          lte(orders.paidAt, endDate),
        ))
        .groupBy(sql`DAY(${orders.paidAt})`, orders.paymentMethod);

      // Tagesweise Kategorien
      type DailyCatRow = { day: number; itemType: string | null; totalPrice: number };
      const dailyCategories: DailyCatRow[] = await db
        .select({
          day: sql<number>`DAY(${orders.paidAt})`,
          itemType: orderItems.itemType,
          totalPrice: sql<number>`SUM(${orderItems.totalPrice})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.status, "paid"),
          gte(orders.paidAt, startDate),
          lte(orders.paidAt, endDate),
        ))
        .groupBy(sql`DAY(${orders.paidAt})`, orderItems.itemType);

      // Kassenbuch-Ausgaben tagesweise
      type DailyExpRow = { day: number; amount: number; type: string };
      const dailyExpenses: DailyExpRow[] = await db
        .select({
          day: sql<number>`DAY(${cashbookEntries.entryDate})`,
          amount: sql<number>`SUM(${cashbookEntries.amount})`,
          type: cashbookEntries.type,
        })
        .from(cashbookEntries)
        .where(and(
          eq(cashbookEntries.restaurantId, restaurantId),
          gte(cashbookEntries.entryDate, startDate),
          lte(cashbookEntries.entryDate, endDate),
        ))
        .groupBy(sql`DAY(${cashbookEntries.entryDate})`, cashbookEntries.type);

      const weekdays = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

      const dailyRows: DetailedMonthlyReportData["dailyRows"] = [];
      const dailyPayments: DetailedMonthlyReportData["dailyPayments"] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(input.year, input.month - 1, day);
        const weekday = weekdays[date.getDay()];

        // Kategorien für diesen Tag
        const dayCats = dailyCategories.filter((r: DailyCatRow) => Number(r.day) === day);
        const essen = dayCats.filter((r: DailyCatRow) => r.itemType === "food").reduce((s: number, r: DailyCatRow) => s + Number(r.totalPrice ?? 0), 0);
        const nichtKat = dayCats.filter((r: DailyCatRow) => r.itemType === "other" || !r.itemType).reduce((s: number, r: DailyCatRow) => s + Number(r.totalPrice ?? 0), 0);
        const gesamt = dayCats.reduce((s: number, r: DailyCatRow) => s + Number(r.totalPrice ?? 0), 0);

        dailyRows.push({ day, weekday, brutto: gesamt, essen, nichtKategorisiert: nichtKat, verkaufteGutscheine: 0, gesamt });

        // Zahlarten für diesen Tag
        const dayPayments = dailyData.filter((r: DailyPayRow) => Number(r.day) === day);
        const bruttoUmsatz = dayPayments.reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
        const bargeld = dayPayments.filter((r: DailyPayRow) => r.paymentMethod === "cash").reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
        const kreditkarte = dayPayments.filter((r: DailyPayRow) => r.paymentMethod === "card").reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
        const online = dayPayments.filter((r: DailyPayRow) => r.paymentMethod === "online").reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
        const rechnung = dayPayments.filter((r: DailyPayRow) => r.paymentMethod === "invoice").reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
        const trinkgeld = dayPayments.reduce((s: number, r: DailyPayRow) => s + Number(r.tipAmount ?? 0), 0);

        const dayExpenses = dailyExpenses.filter((r: DailyExpRow) => Number(r.day) === day);
        const ausgaben = dayExpenses.filter((r: DailyExpRow) => r.type === "ausgabe").reduce((s: number, r: DailyExpRow) => s + Number(r.amount ?? 0), 0);
        const ausgabenBar = dayExpenses.filter((r: DailyExpRow) => r.type === "ausgabe").reduce((s: number, r: DailyExpRow) => s + Number(r.amount ?? 0), 0);

        dailyPayments.push({
          day, bruttoUmsatz, bargeld, kreditkarte, online, rechnung,
          gutscheine: 0, trinkgeld, rabatte: 0, ausgaben, ausgabenBar, barEndbestand: 0,
        });
      }

      // Totals
      const totBrutto = dailyRows.reduce((s, r) => s + r.brutto, 0);
      const totEssen = dailyRows.reduce((s, r) => s + r.essen, 0);
      const totNichtKat = dailyRows.reduce((s, r) => s + r.nichtKategorisiert, 0);
      const totGesamt = dailyRows.reduce((s, r) => s + r.gesamt, 0);
      const totMwst81 = totBrutto / 1.081 * 0.081;
      const totMwst26 = 0;
      const totNetto = totBrutto - totMwst81 - totMwst26;

      const ptBrutto = dailyPayments.reduce((s, r) => s + r.bruttoUmsatz, 0);
      const ptBargeld = dailyPayments.reduce((s, r) => s + r.bargeld, 0);
      const ptKarte = dailyPayments.reduce((s, r) => s + r.kreditkarte, 0);
      const ptOnline = dailyPayments.reduce((s, r) => s + r.online, 0);
      const ptRechnung = dailyPayments.reduce((s, r) => s + r.rechnung, 0);
      const ptTrinkgeld = dailyPayments.reduce((s, r) => s + r.trinkgeld, 0);
      const ptAusgaben = dailyPayments.reduce((s, r) => s + r.ausgaben, 0);

      const reportId = input.year * 10000 + input.month * 100;
      const reportNumber = `DMB-${input.year}-${String(input.month).padStart(2, "0")}`;

      return {
        restaurantName: restaurant?.name ?? "Restaurant",
        address: restaurant?.address ?? "",
        zip: restaurant?.zip ?? "",
        city: restaurant?.city ?? "",
        phone: restaurant?.phone ?? "",
        vatNumber: restaurant?.vatNumber ?? "",
        reportId,
        reportNumber,
        year: input.year,
        month: input.month,
        generatedAt: new Date(),
        periodStart: startDate,
        periodEnd: endDate,
        dailyRows,
        totals: {
          brutto: totBrutto, essen: totEssen, nichtKategorisiert: totNichtKat,
          verkaufteGutscheine: 0, gesamt: totGesamt,
          mwst81: totMwst81, mwst26: totMwst26, netto: totNetto,
        },
        dailyPayments,
        paymentTotals: {
          bruttoUmsatz: ptBrutto, bargeld: ptBargeld, kreditkarte: ptKarte,
          online: ptOnline, rechnung: ptRechnung, gutscheine: 0,
          trinkgeld: ptTrinkgeld, rabatte: 0, ausgaben: ptAusgaben,
          ausgabenBar: ptAusgaben, barEndbestand: 0,
        },
      } satisfies DetailedMonthlyReportData;
    }),

  // ── Jahresbericht Daten ───────────────────────────────────────────────────
  getYearlyReportData: protectedProcedure
    .input(z.object({ year: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, 0, 1, 0, 0, 0, 0);
      const endDate = new Date(input.year, 11, 31, 23, 59, 59, 999);

      const restaurant = await getRestaurantInfo(db, restaurantId);
      const { blocks, grandTotal } = await buildCategoryBlocks(db, restaurantId, startDate, endDate);

      // Monatsweise Übersicht
      type MonthlyRow = { month: number; brutto: number; mwst: number; orderCount: number };
      const monthlyRaw: MonthlyRow[] = await db
        .select({
          month: sql<number>`MONTH(${orders.paidAt})`,
          brutto: sql<number>`SUM(${orders.totalAmount})`,
          mwst: sql<number>`SUM(${orders.taxAmount})`,
          orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.status, "paid"),
          gte(orders.paidAt, startDate),
          lte(orders.paidAt, endDate),
        ))
        .groupBy(sql`MONTH(${orders.paidAt})`);

      const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

      const monthlyOverview = Array.from({ length: 12 }, (_: unknown, i: number) => {
        const m = monthlyRaw.find((r: MonthlyRow) => Number(r.month) === i + 1);
        const brutto = Number(m?.brutto ?? 0);
        const mwst = Number(m?.mwst ?? 0);
        return {
          month: i + 1,
          monthName: monthNames[i],
          brutto,
          mwst,
          netto: brutto - mwst,
          orders: Number(m?.orderCount ?? 0),
        };
      });

      const reportId = input.year;
      const reportNumber = `JB-${input.year}`;

      return {
        restaurantName: restaurant?.name ?? "Restaurant",
        address: restaurant?.address ?? "",
        zip: restaurant?.zip ?? "",
        city: restaurant?.city ?? "",
        phone: restaurant?.phone ?? "",
        vatNumber: restaurant?.vatNumber ?? "",
        reportId,
        reportNumber,
        year: input.year,
        generatedAt: new Date(),
        categoryBlocks: blocks,
        grandTotal,
        monthlyOverview,
      } satisfies YearlyReportData;
    }),

  // ── Verfügbare Abschlüsse für Dropdown ───────────────────────────────────
  listClosings: protectedProcedure
    .input(z.object({
      year: z.number().int().optional(),
      month: z.number().int().min(1).max(12).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(dailyClosings.restaurantId, restaurantId)];
      if (input.year) {
        const start = new Date(input.year, (input.month ?? 1) - 1, 1);
        const end = input.month
          ? new Date(input.year, input.month, 0, 23, 59, 59, 999)
          : new Date(input.year, 11, 31, 23, 59, 59, 999);
        conditions.push(gte(dailyClosings.closingDate, start));
        conditions.push(lte(dailyClosings.closingDate, end));
      }

      const closings = await db
        .select({
          id: dailyClosings.id,
          closingDate: dailyClosings.closingDate,
          totalRevenue: dailyClosings.totalRevenue,
          status: dailyClosings.status,
          mode: dailyClosings.mode,
        })
        .from(dailyClosings)
        .where(and(...conditions))
        .orderBy(desc(dailyClosings.closingDate))
        .limit(input.limit);

      return closings.map((c: typeof closings[0]) => ({
        ...c,
        closingNumber: `TA-${new Date(c.closingDate).getFullYear()}-${String(c.id).padStart(4, "0")}`,
      }));
    }),

  // ── Verfügbare Jahre für Dropdown ─────────────────────────────────────────
  listAvailableYears: protectedProcedure
    .query(async ({ ctx }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({ year: sql<number>`YEAR(${orders.paidAt})` })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid")))
        .groupBy(sql`YEAR(${orders.paidAt})`)
        .orderBy(desc(sql`YEAR(${orders.paidAt})`));

      return rows.map((r: { year: number }) => Number(r.year));
    }),
});
