/**
 * reportPdfRoute.ts
 * Express-Routen für PDF-Downloads aller Berichtstypen
 * GET /api/reports/pdf/z-abschluss/:closingId
 * GET /api/reports/pdf/monatsbericht/:year/:month
 * GET /api/reports/pdf/monatsbericht-detail/:year/:month
 * GET /api/reports/pdf/jahresbericht/:year
 */

import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookie } from "cookie";
import {
  generateZAbschlussPdf,
  generateMonthlyReportPdf,
  generateDetailedMonthlyReportPdf,
  generateYearlyReportPdf,
} from "./reportPdf";
import type {
  ZAbschlussData,
  MonthlyReportData,
  DetailedMonthlyReportData,
  YearlyReportData,
} from "./reportPdf";
import {
  orders,
  orderItems,
  orderVoids,
  dailyClosings,
  restaurants,
  cashbookEntries,
} from "../drizzle/schema";
import { and, gte, lte, sql, desc } from "drizzle-orm";

// ─── Auth-Middleware ──────────────────────────────────────────────────────────

async function getAuthUser(req: Request): Promise<{ id: number; restaurantId: number | null; role: string } | null> {
  const cookieHeader = req.headers.cookie ?? "";
  const cookies = parseCookie(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  try {
    const session = await sdk.verifySession(token);
    if (!session?.userId) return null;

    const db = await getDb();
    if (!db) return null;

    const [user] = await db.select({
      id: users.id,
      restaurantId: users.restaurantId,
      role: users.role,
    }).from(users).where(eq(users.id, session.userId)).limit(1);

    return user ?? null;
  } catch {
    return null;
  }
}

// ─── Hilfsfunktionen (gleiche Logik wie reportRouter) ────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  food: "Essen", drink: "Getränke", alcohol: "Alkohol", wine: "Wein",
  beer: "Bier", softdrink: "Süssgetränk", hot_drink: "Warme Getränke",
  dessert: "Dessert", other: "Nicht kategorisiert",
};

function getCategoryLabel(itemType: string): string {
  return CATEGORY_LABELS[itemType] ?? "Nicht kategorisiert";
}

async function buildCategoryBlocks(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, restaurantId: number, startDate: Date, endDate: Date) {
  const rawData = await db
    .select({
      paymentMethod: orders.paymentMethod,
      itemType: orderItems.itemType,
      quantity: sql<number>`SUM(${orderItems.quantity})`,
      totalPrice: sql<number>`SUM(${orderItems.totalPrice})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, startDate), lte(orders.paidAt, endDate)))
    .groupBy(orders.paymentMethod, orderItems.itemType);

  const blockMap = new Map<string, { category: string; quantity: number; brutto: number; mwst: number; netto: number }[]>();

  for (const row of rawData as Array<{ paymentMethod: string | null; itemType: string | null; quantity: number; totalPrice: number }>) {
    const method = row.paymentMethod ?? "other";
    const blockTitle = method === "cash" ? "Restaurant (Bar)" : method === "card" ? "Restaurant (Karte)"
      : method === "twint" ? "Restaurant (Twint)" : method === "online" ? "Restaurant (Online)"
      : method === "invoice" ? "Restaurant (Rechnung)" : "Restaurant (Sonstige)";
    const brutto = Number(row.totalPrice ?? 0);
    const taxRate = 0.081;
    const mwst = brutto / (1 + taxRate) * taxRate;
    const netto = brutto - mwst;
    if (!blockMap.has(blockTitle)) blockMap.set(blockTitle, []);
    blockMap.get(blockTitle)!.push({ category: getCategoryLabel(row.itemType ?? "other"), quantity: Number(row.quantity ?? 0), brutto, mwst, netto });
  }

  const blocks: ZAbschlussData["categoryBlocks"] = [];
  let grandBrutto = 0, grandMwst = 0, grandNetto = 0, grandQty = 0;

  for (const [blockTitle, rows] of Array.from(blockMap.entries())) {
    const blockBrutto = rows.reduce((s: number, r: { brutto: number }) => s + r.brutto, 0);
    const blockMwst = rows.reduce((s: number, r: { mwst: number }) => s + r.mwst, 0);
    const blockNetto = rows.reduce((s: number, r: { netto: number }) => s + r.netto, 0);
    const blockQty = rows.reduce((s: number, r: { quantity: number }) => s + r.quantity, 0);
    blocks.push({
      blockTitle,
      rows: rows.map((r: { category: string; quantity: number; brutto: number; mwst: number; netto: number }) => ({ ...r, pct: blockBrutto > 0 ? (r.brutto / blockBrutto) * 100 : 0 })),
      total: { quantity: blockQty, brutto: blockBrutto, mwst: blockMwst, netto: blockNetto },
    });
    grandBrutto += blockBrutto; grandMwst += blockMwst; grandNetto += blockNetto; grandQty += blockQty;
  }

  return { blocks, grandTotal: { quantity: grandQty, brutto: grandBrutto, mwst: grandMwst, netto: grandNetto } };
}

async function buildStaffSales(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, restaurantId: number, startDate: Date, endDate: Date): Promise<ZAbschlussData["staffSales"]> {
  const raw = await db.select({
    staffId: orders.staffId,
    paymentMethod: orders.paymentMethod,
    totalAmount: sql<number>`SUM(${orders.totalAmount})`,
    tipAmount: sql<number>`SUM(${orders.tipAmount})`,
  }).from(orders).where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, startDate), lte(orders.paidAt, endDate))).groupBy(orders.staffId, orders.paymentMethod);

  const staffRows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.restaurantId, restaurantId));
  const staffMap = new Map<number, string>();
  for (const s of staffRows) staffMap.set(s.id, s.name ?? s.email ?? `#${s.id}`);

  const staffAgg = new Map<number, ZAbschlussData["staffSales"][0]>();
  for (const row of raw as Array<{ staffId: number | null; paymentMethod: string | null; totalAmount: number; tipAmount: number }>) {
    const sid = row.staffId ?? 0;
    if (!staffAgg.has(sid)) staffAgg.set(sid, { staffName: staffMap.get(sid) ?? `#${sid}`, cash: 0, card: 0, online: 0, invoice: 0, giftCard: 0, total: 0, tips: 0, tipsDeducted: 0 });
    const entry = staffAgg.get(sid)!;
    const amount = Number(row.totalAmount ?? 0);
    if (row.paymentMethod === "cash") entry.cash += amount;
    else if (row.paymentMethod === "card") entry.card += amount;
    else if (row.paymentMethod === "online") entry.online += amount;
    else if (row.paymentMethod === "invoice") entry.invoice += amount;
    else entry.giftCard += amount;
    entry.total += amount;
    entry.tips += Number(row.tipAmount ?? 0);
  }
  return Array.from(staffAgg.values());
}

async function buildVoids(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, restaurantId: number, startDate: Date, endDate: Date) {
  const raw = await db.select({
    staffId: orderVoids.staffId, itemName: orderVoids.itemName, quantity: orderVoids.quantity,
    totalVoided: orderVoids.totalVoided, reason: orderVoids.reason, createdAt: orderVoids.createdAt,
  }).from(orderVoids).where(and(eq(orderVoids.restaurantId, restaurantId), gte(orderVoids.createdAt, startDate), lte(orderVoids.createdAt, endDate))).orderBy(desc(orderVoids.createdAt)).limit(100);

  const staffRows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.restaurantId, restaurantId));
  const staffMap = new Map<number, string>();
  for (const s of staffRows) staffMap.set(s.id, s.name ?? s.email ?? `#${s.id}`);

  const voids = (raw as Array<{ staffId: number; itemName: string; quantity: number; totalVoided: string | null; reason: string; createdAt: Date }>).map((v) => ({
    staffName: staffMap.get(v.staffId) ?? `#${v.staffId}`, itemName: v.itemName, quantity: v.quantity,
    amount: Number(v.totalVoided ?? 0), reason: v.reason, createdAt: v.createdAt,
  }));
  return { voids, totalVoided: voids.reduce((s: number, v: { amount: number }) => s + v.amount, 0) };
}

// ─── Route-Registrierung ──────────────────────────────────────────────────────

export function registerReportPdfRoutes(app: Express) {

  // ── Z-Abschluss PDF ──────────────────────────────────────────────────────
  app.get("/api/reports/pdf/z-abschluss/:closingId", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user || !user.restaurantId) { res.status(401).json({ error: "Nicht autorisiert" }); return; }

    const closingId = parseInt(req.params.closingId);
    if (isNaN(closingId)) { res.status(400).json({ error: "Ungültige ID" }); return; }

    const db = await getDb();
    if (!db) { res.status(500).json({ error: "DB nicht verfügbar" }); return; }

    const [closing] = await db.select().from(dailyClosings)
      .where(and(eq(dailyClosings.id, closingId), eq(dailyClosings.restaurantId, user.restaurantId))).limit(1);
    if (!closing) { res.status(404).json({ error: "Abschluss nicht gefunden" }); return; }

    const closingDate = new Date(closing.closingDate);
    const startOfDay = new Date(closingDate.getFullYear(), closingDate.getMonth(), closingDate.getDate(), 0, 0, 0, 0);

    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1);
    const { blocks, grandTotal } = await buildCategoryBlocks(db, user.restaurantId, startOfDay, closingDate);
    const staffSales = await buildStaffSales(db, user.restaurantId, startOfDay, closingDate);
    const { voids, totalVoided } = await buildVoids(db, user.restaurantId, startOfDay, closingDate);

    const [statsAgg] = await db.select({ totalOrders: sql<number>`COUNT(*)`, totalGuests: sql<number>`COALESCE(SUM(${orders.guestCount}), 0)` })
      .from(orders).where(and(eq(orders.restaurantId, user.restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, startOfDay), lte(orders.paidAt, closingDate)));

    const totalOrdersNum = Number(statsAgg?.totalOrders ?? 0);
    const year = closingDate.getFullYear();
    const closingNumber = `TA-${year}-${String(closing.id).padStart(4, "0")}`;

    const data: ZAbschlussData = {
      restaurantName: restaurant?.name ?? "Restaurant",
      address: restaurant?.address ?? "", zip: restaurant?.zip ?? "", city: restaurant?.city ?? "",
      phone: restaurant?.phone ?? "", vatNumber: restaurant?.vatNumber ?? "",
      closingId: closing.id, closingNumber, closingDate, performedByName: "System",
      mode: closing.mode, generatedAt: new Date(),
      categoryBlocks: blocks, grandTotal, vatLines: [], paymentLines: [],
      cashStart: Number(closing.cashStart ?? 0), cashEnd: Number(closing.cashEnd ?? 0),
      cashExpected: Number(closing.totalCash ?? 0), cashDifference: Number(closing.cashDifference ?? 0),
      staffSales, voids, totalVoided, totalOrders: totalOrdersNum,
      totalGuests: Number(statsAgg?.totalGuests ?? 0),
      avgOrderValue: grandTotal.brutto > 0 && totalOrdersNum > 0 ? grandTotal.brutto / totalOrdersNum : 0,
      notes: closing.notes ?? undefined,
    };

    const pdfBuffer = await generateZAbschlussPdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Z-Abschluss_${closingNumber}.pdf"`);
    res.send(pdfBuffer);
  });

  // ── Monatsbericht PDF ────────────────────────────────────────────────────
  app.get("/api/reports/pdf/monatsbericht/:year/:month", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user || !user.restaurantId) { res.status(401).json({ error: "Nicht autorisiert" }); return; }

    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) { res.status(400).json({ error: "Ungültige Parameter" }); return; }

    const db = await getDb();
    if (!db) { res.status(500).json({ error: "DB nicht verfügbar" }); return; }

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1);
    const { blocks, grandTotal } = await buildCategoryBlocks(db, user.restaurantId, startDate, endDate);
    const staffSales = await buildStaffSales(db, user.restaurantId, startDate, endDate);
    const { totalVoided, voids } = await buildVoids(db, user.restaurantId, startDate, endDate);

    const data: MonthlyReportData = {
      restaurantName: restaurant?.name ?? "Restaurant",
      address: restaurant?.address ?? "", zip: restaurant?.zip ?? "", city: restaurant?.city ?? "",
      phone: restaurant?.phone ?? "", vatNumber: restaurant?.vatNumber ?? "",
      reportId: year * 100 + month,
      reportNumber: `MB-${year}-${String(month).padStart(2, "0")}`,
      year, month, generatedAt: new Date(),
      categoryBlocks: blocks, grandTotal, staffSales,
      totalVoided, voidCount: voids.length,
    };

    const pdfBuffer = await generateMonthlyReportPdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Monatsbericht_${year}-${String(month).padStart(2, "0")}.pdf"`);
    res.send(pdfBuffer);
  });

  // ── Detaillierter Monatsbericht PDF ──────────────────────────────────────
  app.get("/api/reports/pdf/monatsbericht-detail/:year/:month", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user || !user.restaurantId) { res.status(401).json({ error: "Nicht autorisiert" }); return; }

    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) { res.status(400).json({ error: "Ungültige Parameter" }); return; }

    const db = await getDb();
    if (!db) { res.status(500).json({ error: "DB nicht verfügbar" }); return; }

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    const daysInMonth = endDate.getDate();
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1);

    type DailyPayRow = { day: number; paymentMethod: string | null; totalAmount: number; tipAmount: number };
    const dailyData: DailyPayRow[] = await db.select({
      day: sql<number>`DAY(${orders.paidAt})`,
      paymentMethod: orders.paymentMethod,
      totalAmount: sql<number>`SUM(${orders.totalAmount})`,
      tipAmount: sql<number>`SUM(${orders.tipAmount})`,
    }).from(orders).where(and(eq(orders.restaurantId, user.restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, startDate), lte(orders.paidAt, endDate))).groupBy(sql`DAY(${orders.paidAt})`, orders.paymentMethod);

    type DailyCatRow = { day: number; itemType: string | null; totalPrice: number };
    const dailyCategories: DailyCatRow[] = await db.select({
      day: sql<number>`DAY(${orders.paidAt})`,
      itemType: orderItems.itemType,
      totalPrice: sql<number>`SUM(${orderItems.totalPrice})`,
    }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id)).where(and(eq(orders.restaurantId, user.restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, startDate), lte(orders.paidAt, endDate))).groupBy(sql`DAY(${orders.paidAt})`, orderItems.itemType);

    type DailyExpRow = { day: number; amount: number; type: string };
    const dailyExpenses: DailyExpRow[] = await db.select({
      day: sql<number>`DAY(${cashbookEntries.entryDate})`,
      amount: sql<number>`SUM(${cashbookEntries.amount})`,
      type: cashbookEntries.type,
    }).from(cashbookEntries).where(and(eq(cashbookEntries.restaurantId, user.restaurantId), gte(cashbookEntries.entryDate, startDate), lte(cashbookEntries.entryDate, endDate))).groupBy(sql`DAY(${cashbookEntries.entryDate})`, cashbookEntries.type);

    const weekdays = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
    const dailyRows: DetailedMonthlyReportData["dailyRows"] = [];
    const dailyPayments: DetailedMonthlyReportData["dailyPayments"] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const weekday = weekdays[date.getDay()];
      const dayCats = dailyCategories.filter((r: DailyCatRow) => Number(r.day) === day);
      const essen = dayCats.filter((r: DailyCatRow) => r.itemType === "food").reduce((s: number, r: DailyCatRow) => s + Number(r.totalPrice ?? 0), 0);
      const nichtKat = dayCats.filter((r: DailyCatRow) => r.itemType !== "food").reduce((s: number, r: DailyCatRow) => s + Number(r.totalPrice ?? 0), 0);
      const gesamt = dayCats.reduce((s: number, r: DailyCatRow) => s + Number(r.totalPrice ?? 0), 0);
      dailyRows.push({ day, weekday, brutto: gesamt, essen, nichtKategorisiert: nichtKat, verkaufteGutscheine: 0, gesamt });

      const dayPayments = dailyData.filter((r: DailyPayRow) => Number(r.day) === day);
      const bruttoUmsatz = dayPayments.reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
      const bargeld = dayPayments.filter((r: DailyPayRow) => r.paymentMethod === "cash").reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
      const kreditkarte = dayPayments.filter((r: DailyPayRow) => r.paymentMethod === "card").reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
      const online = dayPayments.filter((r: DailyPayRow) => r.paymentMethod === "online").reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
      const rechnung = dayPayments.filter((r: DailyPayRow) => r.paymentMethod === "invoice").reduce((s: number, r: DailyPayRow) => s + Number(r.totalAmount ?? 0), 0);
      const trinkgeld = dayPayments.reduce((s: number, r: DailyPayRow) => s + Number(r.tipAmount ?? 0), 0);
      const dayExpenses = dailyExpenses.filter((r: DailyExpRow) => Number(r.day) === day);
      const ausgaben = dayExpenses.filter((r: DailyExpRow) => r.type === "ausgabe").reduce((s: number, r: DailyExpRow) => s + Number(r.amount ?? 0), 0);
      dailyPayments.push({ day, bruttoUmsatz, bargeld, kreditkarte, online, rechnung, gutscheine: 0, trinkgeld, rabatte: 0, ausgaben, ausgabenBar: ausgaben, barEndbestand: 0 });
    }

    const totBrutto = dailyRows.reduce((s: number, r: { brutto: number }) => s + r.brutto, 0);
    const totEssen = dailyRows.reduce((s: number, r: { essen: number }) => s + r.essen, 0);
    const totNichtKat = dailyRows.reduce((s: number, r: { nichtKategorisiert: number }) => s + r.nichtKategorisiert, 0);
    const totGesamt = dailyRows.reduce((s: number, r: { gesamt: number }) => s + r.gesamt, 0);
    const totMwst81 = totBrutto / 1.081 * 0.081;

    const data: DetailedMonthlyReportData = {
      restaurantName: restaurant?.name ?? "Restaurant",
      address: restaurant?.address ?? "", zip: restaurant?.zip ?? "", city: restaurant?.city ?? "",
      phone: restaurant?.phone ?? "", vatNumber: restaurant?.vatNumber ?? "",
      reportId: year * 10000 + month * 100,
      reportNumber: `DMB-${year}-${String(month).padStart(2, "0")}`,
      year, month, generatedAt: new Date(), periodStart: startDate, periodEnd: endDate,
      dailyRows,
      totals: { brutto: totBrutto, essen: totEssen, nichtKategorisiert: totNichtKat, verkaufteGutscheine: 0, gesamt: totGesamt, mwst81: totMwst81, mwst26: 0, netto: totBrutto - totMwst81 },
      dailyPayments,
      paymentTotals: {
        bruttoUmsatz: dailyPayments.reduce((s: number, r: { bruttoUmsatz: number }) => s + r.bruttoUmsatz, 0),
        bargeld: dailyPayments.reduce((s: number, r: { bargeld: number }) => s + r.bargeld, 0),
        kreditkarte: dailyPayments.reduce((s: number, r: { kreditkarte: number }) => s + r.kreditkarte, 0),
        online: dailyPayments.reduce((s: number, r: { online: number }) => s + r.online, 0),
        rechnung: dailyPayments.reduce((s: number, r: { rechnung: number }) => s + r.rechnung, 0),
        gutscheine: 0, trinkgeld: dailyPayments.reduce((s: number, r: { trinkgeld: number }) => s + r.trinkgeld, 0),
        rabatte: 0, ausgaben: dailyPayments.reduce((s: number, r: { ausgaben: number }) => s + r.ausgaben, 0),
        ausgabenBar: dailyPayments.reduce((s: number, r: { ausgabenBar: number }) => s + r.ausgabenBar, 0), barEndbestand: 0,
      },
    };

    const pdfBuffer = await generateDetailedMonthlyReportPdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Detaillierter-Monatsbericht_${year}-${String(month).padStart(2, "0")}.pdf"`);
    res.send(pdfBuffer);
  });

  // ── Jahresbericht PDF ────────────────────────────────────────────────────
  app.get("/api/reports/pdf/jahresbericht/:year", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user || !user.restaurantId) { res.status(401).json({ error: "Nicht autorisiert" }); return; }

    const year = parseInt(req.params.year);
    if (isNaN(year)) { res.status(400).json({ error: "Ungültiges Jahr" }); return; }

    const db = await getDb();
    if (!db) { res.status(500).json({ error: "DB nicht verfügbar" }); return; }

    const startDate = new Date(year, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1);
    const { blocks, grandTotal } = await buildCategoryBlocks(db, user.restaurantId, startDate, endDate);

    type MonthlyRow = { month: number; brutto: number; mwst: number; orderCount: number };
    const monthlyRaw: MonthlyRow[] = await db.select({
      month: sql<number>`MONTH(${orders.paidAt})`,
      brutto: sql<number>`SUM(${orders.totalAmount})`,
      mwst: sql<number>`SUM(${orders.taxAmount})`,
      orderCount: sql<number>`COUNT(*)`,
    }).from(orders).where(and(eq(orders.restaurantId, user.restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, startDate), lte(orders.paidAt, endDate))).groupBy(sql`MONTH(${orders.paidAt})`);

    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const monthlyOverview = Array.from({ length: 12 }, (_: unknown, i: number) => {
      const m = monthlyRaw.find((r: MonthlyRow) => Number(r.month) === i + 1);
      const brutto = Number(m?.brutto ?? 0);
      const mwst = Number(m?.mwst ?? 0);
      return { month: i + 1, monthName: monthNames[i], brutto, mwst, netto: brutto - mwst, orders: Number(m?.orderCount ?? 0) };
    });

    const data: YearlyReportData = {
      restaurantName: restaurant?.name ?? "Restaurant",
      address: restaurant?.address ?? "", zip: restaurant?.zip ?? "", city: restaurant?.city ?? "",
      phone: restaurant?.phone ?? "", vatNumber: restaurant?.vatNumber ?? "",
      reportId: year, reportNumber: `JB-${year}`, year, generatedAt: new Date(),
      categoryBlocks: blocks, grandTotal, monthlyOverview,
    };

    const pdfBuffer = await generateYearlyReportPdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Jahresbericht_${year}.pdf"`);
    res.send(pdfBuffer);
  });
}
