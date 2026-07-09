/**
 * closingsRouter.ts
 * Sprint 8: Tagesabschluss-Automatisierung
 *
 * - Admin konfiguriert: Modus (auto/manuell) + Uhrzeit (HH:MM) + Zeitzone
 * - Bei auto: Heartbeat-Job wird erstellt/aktualisiert/gelöscht
 * - Bei manuell: Kellner kann Tagesabschluss per Button auslösen
 * - performClosing(): Aggregiert Umsatz/MwSt/Zahlungsarten aus orders-Tabelle
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { dailyClosings, dailyClosingConfig, orders } from "../drizzle/schema";
import { eq, and, gte, lte, sql, sum, count } from "drizzle-orm";
import { inventoryStockMovements, inventoryItems } from "../drizzle/schema";
import { createHeartbeatJob, updateHeartbeatJob, deleteHeartbeatJob } from "./_core/heartbeat";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";

// ─── Helper: Tenant-Prüfung ───────────────────────────────────────────────────
function requireRestaurant(ctx: { user: { restaurantId?: number | null; role: string } }): number {
  const rid = ctx.user.restaurantId;
  if (!rid) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return rid;
}

// ─── Helper: Cron-Ausdruck aus HH:MM + Zeitzone berechnen (DST-sicher) ───────────
// S8-B2: Nutzt Intl.DateTimeFormat um den aktuellen UTC-Offset der Zeitzone
// zum heutigen Datum zu ermitteln – damit wird Sommer-/Winterzeit korrekt
// berücksichtigt (DST-sicher).
function buildCron(closingTime: string, timezone: string): string {
  const [hStr, mStr] = closingTime.split(":");
  const localHour = parseInt(hStr, 10);
  const localMin = parseInt(mStr, 10);

  // Aktuellen UTC-Offset der Zeitzone ermitteln (DST-sicher via Intl)
  const getUtcOffset = (tz: string): number => {
    try {
      const now = new Date();
      // Formatiere "now" in der Ziel-Zeitzone und in UTC
      const localStr = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      }).format(now);
      const utcStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        hour: "numeric",
        hour12: false,
      }).format(now);
      const localH = parseInt(localStr, 10);
      const utcH = parseInt(utcStr, 10);
      let diff = localH - utcH;
      if (diff > 12) diff -= 24;
      if (diff < -12) diff += 24;
      return diff;
    } catch {
      return 1; // Fallback: Europe/Zurich CET
    }
  };

  const offset = getUtcOffset(timezone);
  const utcHour = (localHour - offset + 24) % 24;

  return `0 ${localMin} ${utcHour} * * *`;
}

// ─── Kern-Logik: Tagesabschluss durchführen ──────────────────────────────────
export async function performClosing(params: {
  restaurantId: number;
  mode: "auto" | "manual";
  performedBy?: number;
  notes?: string;
}): Promise<{
  id: number;
  totalRevenue: string;
  totalCash: string;
  totalCard: string;
  totalTwint: string;
  totalOther: string;
  totalTax: string;
  totalTips: string;
  totalOrders: number;
  totalGuests: number;
  totalStockConsumedValue: string;
  totalStockMovements: number;
}> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Datenbank nicht verfügbar" });

  // Zeitfenster: Heute 00:00 bis jetzt
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // S8-B1: Doppelabschluss-Schutz – nur ein Abschluss pro Restaurant pro Tag
  const [existingClosing] = await db
    .select({ id: dailyClosings.id })
    .from(dailyClosings)
    .where(and(
      eq(dailyClosings.restaurantId, params.restaurantId),
      gte(dailyClosings.closingDate, startOfDay),
      lte(dailyClosings.closingDate, now),
    ))
    .limit(1);

  if (existingClosing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Tagesabschluss für heute wurde bereits durchgeführt (ID: ${existingClosing.id}). Pro Tag ist nur ein Abschluss möglich.`,
    });
  }

  // Umsatz aus abgeschlossenen Bestellungen aggregieren
  const [agg] = await db
    .select({
      totalRevenue: sql<string>`COALESCE(SUM(totalAmount), 0)`,
      totalCash: sql<string>`COALESCE(SUM(CASE WHEN paymentMethod = 'cash' THEN totalAmount ELSE 0 END), 0)`,
      totalCard: sql<string>`COALESCE(SUM(CASE WHEN paymentMethod = 'card' THEN totalAmount ELSE 0 END), 0)`,
      totalTwint: sql<string>`COALESCE(SUM(CASE WHEN paymentMethod = 'twint' THEN totalAmount ELSE 0 END), 0)`,
      totalOther: sql<string>`COALESCE(SUM(CASE WHEN paymentMethod NOT IN ('cash','card','twint') THEN totalAmount ELSE 0 END), 0)`,
      totalTax: sql<string>`COALESCE(SUM(taxAmount), 0)`,
      totalTips: sql<string>`COALESCE(SUM(tipAmount), 0)`,
      totalOrders: sql<number>`COUNT(*)`,
      totalGuests: sql<number>`COALESCE(SUM(guestCount), 0)`,
    })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, params.restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startOfDay),
      lte(orders.paidAt, now),
    ));

  const totalRevenue = agg?.totalRevenue ?? "0";
  const totalCash = agg?.totalCash ?? "0";
  const totalCard = agg?.totalCard ?? "0";
  const totalTwint = agg?.totalTwint ?? "0";
  const totalOther = agg?.totalOther ?? "0";
  const totalTax = agg?.totalTax ?? "0";
  const totalTips = agg?.totalTips ?? "0";
  const totalOrders = Number(agg?.totalOrders ?? 0);
  const totalGuests = Number(agg?.totalGuests ?? 0);

  // Schweizer MwSt.-Aufschlüsselung aus taxBreakdown JSON der einzelnen Bestellungen
  // Aggregiert Basis und MwSt.-Betrag pro Steuersatz (8.1% / 2.6% / etc.)
  const paidOrders = await db
    .select({ taxBreakdown: orders.taxBreakdown })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, params.restaurantId),
      eq(orders.status, "paid"),
      gte(orders.paidAt, startOfDay),
      lte(orders.paidAt, now),
    ));

  const vatAgg = new Map<string, { base: number; amount: number }>();
  for (const o of paidOrders) {
    const breakdown = o.taxBreakdown as Array<{ rate: string; base: string; amount: string }> | null;
    if (!breakdown) continue;
    for (const b of breakdown) {
      const existing = vatAgg.get(b.rate) ?? { base: 0, amount: 0 };
      vatAgg.set(b.rate, {
        base: existing.base + parseFloat(b.base),
        amount: existing.amount + parseFloat(b.amount),
      });
    }
  }
  // Hauptsätze für dailyClosings-Spalten (8.10% und 2.60%)
  const vat81 = vatAgg.get("8.10") ?? { base: 0, amount: 0 };
  const vat26 = vatAgg.get("2.60") ?? { base: 0, amount: 0 };
  const vatAmount81 = vat81.amount.toFixed(2);
  const vatBase81 = vat81.base.toFixed(2);
  const vatAmount26 = vat26.amount.toFixed(2);
  const vatBase26 = vat26.base.toFixed(2);

  // S8-B3: Lagerabzüge des heutigen Tages aggregieren (type='sale')
  const [stockAgg] = await db
    .select({
      totalConsumedValue: sql<string>`COALESCE(SUM(ABS(quantity) * COALESCE(unitCost, 0)), 0)`,
      totalMovements: sql<number>`COUNT(*)`,
    })
    .from(inventoryStockMovements)
    .where(and(
      eq(inventoryStockMovements.restaurantId, params.restaurantId),
      eq(inventoryStockMovements.type, "sale"),
      gte(inventoryStockMovements.createdAt, startOfDay),
      lte(inventoryStockMovements.createdAt, now),
    ));

  const totalStockConsumedValue = stockAgg?.totalConsumedValue ?? "0";
  const totalStockMovements = Number(stockAgg?.totalMovements ?? 0);

  const [result] = await db.insert(dailyClosings).values({
    restaurantId: params.restaurantId,
    closingDate: now,
    staffId: params.performedBy ?? null,
    performedBy: params.performedBy ?? null,
    mode: params.mode,
    cashStart: "0",
    cashEnd: totalCash,
    cashDifference: "0",
    totalRevenue,
    totalCash,
    totalCard,
    totalTwint,
    totalOther,
    totalTax,
    totalTips,
    totalOrders,
    totalGuests,
    vatAmount81,
    vatBase81,
    vatAmount26,
    vatBase26,
    status: "abgeschlossen",
    notes: params.notes ?? null,
  });

  return {
    id: (result as any).insertId,
    totalRevenue,
    totalCash,
    totalCard,
    totalTwint,
    totalOther,
    totalTax,
    totalTips,
    totalOrders,
    totalGuests,
    totalStockConsumedValue,
    totalStockMovements,
  };
}

// ─── tRPC-Router ─────────────────────────────────────────────────────────────
export const closingsRouter = router({

  // Konfiguration laden (oder Defaults zurückgeben)
  getClosingConfig: protectedProcedure
    .query(async ({ ctx }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [config] = await db
        .select()
        .from(dailyClosingConfig)
        .where(eq(dailyClosingConfig.restaurantId, restaurantId))
        .limit(1);

      // Defaults wenn noch keine Konfiguration vorhanden
      return config ?? {
        id: null,
        restaurantId,
        autoEnabled: false,
        closingTime: "23:00",
        timezone: "Europe/Zurich",
        scheduleCronTaskUid: null,
        createdAt: null,
        updatedAt: null,
      };
    }),

  // Konfiguration speichern + Heartbeat-Job erstellen/aktualisieren/löschen
  saveClosingConfig: adminProcedure
    .input(z.object({
      autoEnabled: z.boolean(),
      closingTime: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM erwartet"),
      timezone: z.string().min(1).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Session-Token für Heartbeat-API
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";

      // Bestehende Konfiguration laden
      const [existing] = await db
        .select()
        .from(dailyClosingConfig)
        .where(eq(dailyClosingConfig.restaurantId, restaurantId))
        .limit(1);

      let scheduleCronTaskUid = existing?.scheduleCronTaskUid ?? null;

      const cronExpr = buildCron(input.closingTime, input.timezone);

      if (input.autoEnabled) {
        if (scheduleCronTaskUid) {
          // Bestehenden Job aktualisieren
          await updateHeartbeatJob(scheduleCronTaskUid, {
            cron: cronExpr,
            description: `Automatischer Tagesabschluss für Restaurant ${restaurantId} um ${input.closingTime} (${input.timezone})`,
          }, sessionToken);
        } else {
          // Neuen Job erstellen
          const job = await createHeartbeatJob({
            name: `daily-closing-${restaurantId}`,
            cron: cronExpr,
            path: "/api/scheduled/dailyClosing",
            payload: { restaurantId },
            description: `Automatischer Tagesabschluss für Restaurant ${restaurantId} um ${input.closingTime} (${input.timezone})`,
          }, sessionToken);
          scheduleCronTaskUid = job.taskUid;
        }
      } else {
        // Auto deaktiviert: bestehenden Job löschen
        if (scheduleCronTaskUid) {
          try {
            await deleteHeartbeatJob(scheduleCronTaskUid, sessionToken);
          } catch {
            // Job möglicherweise bereits gelöscht – ignorieren
          }
          scheduleCronTaskUid = null;
        }
      }

      // Konfiguration speichern (Upsert)
      if (existing) {
        await db.update(dailyClosingConfig)
          .set({
            autoEnabled: input.autoEnabled,
            closingTime: input.closingTime,
            timezone: input.timezone,
            scheduleCronTaskUid,
          })
          .where(eq(dailyClosingConfig.restaurantId, restaurantId));
      } else {
        await db.insert(dailyClosingConfig).values({
          restaurantId,
          autoEnabled: input.autoEnabled,
          closingTime: input.closingTime,
          timezone: input.timezone,
          scheduleCronTaskUid,
        });
      }

      return {
        success: true,
        autoEnabled: input.autoEnabled,
        closingTime: input.closingTime,
        timezone: input.timezone,
        scheduleCronTaskUid,
        nextCron: cronExpr,
      };
    }),

  // Manueller Tagesabschluss (Kellner oder Admin)
  triggerManualClosing: protectedProcedure
    .input(z.object({
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);

      // Prüfen ob Modus manuell ist (oder Admin darf immer)
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [config] = await db
          .select({ autoEnabled: dailyClosingConfig.autoEnabled })
          .from(dailyClosingConfig)
          .where(eq(dailyClosingConfig.restaurantId, restaurantId))
          .limit(1);

        if (config?.autoEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Tagesabschluss ist auf automatisch eingestellt. Bitte wenden Sie sich an den Administrator.",
          });
        }
      }

      const result = await performClosing({
        restaurantId,
        mode: "manual",
        performedBy: ctx.user.id,
        notes: input.notes,
      });

      return { success: true, ...result };
    }),

  // Abschluss-Liste (letzte 90 Tage)
  getClosings: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db.select().from(dailyClosings)
        .where(eq(dailyClosings.restaurantId, restaurantId))
        .orderBy(sql`closingDate DESC`)
        .limit(input.limit);
    }),
});
