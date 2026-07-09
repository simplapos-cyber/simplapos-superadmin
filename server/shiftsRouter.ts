/**
 * shiftsRouter – Stempeluhr-System für Kellner
 *
 * Gesetzliche Grundlage:
 *  - CH ArG Art. 46: Arbeitgeber muss Arbeitszeitaufzeichnungen führen (Aufbewahrung 5 Jahre)
 *  - CH ArG Art. 15: Pflichtpausen (15 Min. ab 5.5h / 30 Min. ab 7h / 60 Min. ab 9h)
 *  - L-GAV Gastronomie: Minutengenaue Erfassung, Pausen dokumentieren
 *
 * Anti-Betrug (Buddy Punching):
 *  - Persönlicher 4-stelliger PIN (bcrypt-gehashed, Lockout nach 5 Fehlversuchen)
 *  - IP-Adresse + User-Agent bei jedem Stempel-Vorgang protokolliert
 *  - Browser-Fingerprint (deviceId) gespeichert
 *  - Audit-Log: jede Aktion unveränderlich protokolliert
 *  - Aktivitätskorrelation: Schicht ohne POS-Aktivität wird markiert
 *  - Automatisches Schliessen nach 12h (Schutz vor vergessenen Schichten)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { eq, and, desc, gte, lte, isNull } from "drizzle-orm";
import { getDb } from "./db";
import {
  waiterShifts, waiterBreaks, shiftAuditLog, staffClockPins,
  orders, staffAbsences, aiPlanShifts, aiShiftPlans, staffAvailability,
  shiftRatings,
} from "../drizzle/schema";
import type { } from "../drizzle/schema";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function getRestaurantId(ctx: any): number {
  const rid = ctx.user?.restaurantId;
  if (!rid) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return rid;
}

function getClientInfo(ctx: any) {
  const req = ctx.req;
  const ip =
    (req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req?.socket?.remoteAddress ||
    "unknown";
  const userAgent = (req?.headers?.["user-agent"] as string) || "unknown";
  return { ip, userAgent };
}

/** CH ArG Art. 15 – Pflichtpause in Minuten basierend auf Arbeitszeit */
function getMandatoryBreakMinutes(workMinutes: number): number {
  if (workMinutes >= 9 * 60) return 60;
  if (workMinutes >= 7 * 60) return 30;
  if (workMinutes >= 5.5 * 60) return 15;
  return 0;
}

/** Schreibt einen Eintrag ins Audit-Log */
async function writeAuditLog(
  db: Awaited<ReturnType<typeof getDb>>,
  data: {
    restaurantId: number;
    staffId: number;
    shiftId?: number | null;
    action: typeof shiftAuditLog.$inferInsert["action"];
    ip: string;
    userAgent: string;
    deviceId?: string | null;
    details?: Record<string, unknown>;
  }
) {
  await db.insert(shiftAuditLog).values({
    restaurantId: data.restaurantId,
    staffId: data.staffId,
    shiftId: data.shiftId ?? null,
    action: data.action,
    ipAddress: data.ip,
    userAgent: data.userAgent,
    deviceId: data.deviceId ?? null,
    details: data.details ?? null,
  });
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────
export const shiftsRouter = router({

  // ── 1. PIN einrichten (Kellner setzt eigenen PIN) ─────────────────────────
  setPin: protectedProcedure
    .input(z.object({
      pin: z.string().regex(/^\d{4}$/, "PIN muss genau 4 Ziffern haben"),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const staffId = ctx.effectiveUserId!;
      const db = await getDb();
      const pinHash = await bcrypt.hash(input.pin, 10);

      const existing = await db.select().from(staffClockPins)
        .where(eq(staffClockPins.staffId, staffId)).limit(1);

      if (existing.length > 0) {
        await db.update(staffClockPins)
          .set({ pinHash, failedAttempts: 0, lockedUntil: null, lastChangedAt: new Date() })
          .where(eq(staffClockPins.staffId, staffId));
      } else {
        await db.insert(staffClockPins).values({
          staffId, restaurantId, pinHash, failedAttempts: 0,
        });
      }
      return { success: true };
    }),

  // ── 2. Prüfen ob PIN gesetzt ist ──────────────────────────────────────────
  hasPinSet: protectedProcedure.query(async ({ ctx }) => {
    const staffId = ctx.effectiveUserId!;
    const db = await getDb();
    const rows = await db.select({ id: staffClockPins.id })
      .from(staffClockPins).where(eq(staffClockPins.staffId, staffId)).limit(1);
    return { hasPinSet: rows.length > 0 };
  }),

  // ── 3. Einstempeln (clock in) ─────────────────────────────────────────────
  clockIn: protectedProcedure
    .input(z.object({
      pin: z.string().regex(/^\d{4}$/, "PIN muss 4 Ziffern haben").optional(),
      deviceId: z.string().max(128).optional(),
      cashStart: z.number().min(0).max(99999).optional(), // Startbargeld (nur Kellner)
      staffRole: z.string().optional(), // Rolle beim Check-in
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const staffId = ctx.effectiveUserId!;
      const db = await getDb();
      const { ip, userAgent } = getClientInfo(ctx);

      // ── Rollen-basierter PIN-Check ────────────────────────────────────────
      // Admin und Koch können ohne PIN einstempeln (pinless=true)
      const role = input.staffRole ?? ctx.user.role ?? "kellner";
      const isPinless = role === "admin" || role === "manager" || role === "koch";

      if (!isPinless) {
        // Kellner/Barkeeper: PIN erforderlich
        if (!input.pin) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PIN erforderlich." });
        }
        const pinRecord = await db.select().from(staffClockPins)
          .where(eq(staffClockPins.staffId, staffId)).limit(1);

        if (pinRecord.length === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Kein PIN gesetzt. Bitte zuerst einen PIN einrichten.",
          });
        }

        const pin = pinRecord[0];

        // Lockout prüfen
        if (pin.lockedUntil && new Date() < new Date(pin.lockedUntil)) {
          const remaining = Math.ceil((new Date(pin.lockedUntil).getTime() - Date.now()) / 60000);
          await writeAuditLog(db, { restaurantId, staffId, action: "pin_failed", ip, userAgent,
            deviceId: input.deviceId, details: { reason: "locked", remainingMinutes: remaining } });
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `PIN gesperrt. Bitte in ${remaining} Minuten erneut versuchen.`,
          });
        }

        const pinValid = await bcrypt.compare(input.pin, pin.pinHash);
        if (!pinValid) {
          const newFails = pin.failedAttempts + 1;
          const lockUntil = newFails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
          await db.update(staffClockPins)
            .set({ failedAttempts: newFails, lockedUntil: lockUntil })
            .where(eq(staffClockPins.staffId, staffId));
          await writeAuditLog(db, { restaurantId, staffId, action: "pin_failed", ip, userAgent,
            deviceId: input.deviceId, details: { attempt: newFails } });
          const remaining = 5 - newFails;
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: remaining > 0
              ? `Falscher PIN. Noch ${remaining} Versuch${remaining === 1 ? "" : "e"}.`
              : "PIN gesperrt für 15 Minuten (5 Fehlversuche).",
          });
        }

        // PIN korrekt: Fehlversuche zurücksetzen
        await db.update(staffClockPins)
          .set({ failedAttempts: 0, lockedUntil: null })
          .where(eq(staffClockPins.staffId, staffId));
      }

      // ── Prüfen ob bereits eine aktive Schicht läuft ───────────────────────
      const activeShift = await db.select().from(waiterShifts)
        .where(and(
          eq(waiterShifts.staffId, staffId),
          eq(waiterShifts.restaurantId, restaurantId),
          isNull(waiterShifts.endedAt),
        )).limit(1);

      if (activeShift.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Es läuft bereits eine Schicht. Bitte zuerst ausstempeln.",
        });
      }

      // ── Neue Schicht erstellen ────────────────────────────────────────────
      const [result] = await db.insert(waiterShifts).values({
        restaurantId,
        staffId,
        startedAt: new Date(),
        status: "active",
        clockInIp: ip,
        clockInUserAgent: userAgent,
        clockInDeviceId: input.deviceId ?? null,
        cashStart: input.cashStart != null ? String(input.cashStart) : null,
        staffRole: role,
        pinless: isPinless,
      });

      const shiftId = (result as any).insertId as number;

      await writeAuditLog(db, { restaurantId, staffId, shiftId, action: "clock_in",
        ip, userAgent, deviceId: input.deviceId,
        details: { pinVerified: !isPinless, pinless: isPinless, role, cashStart: input.cashStart ?? null } });

      return { success: true, shiftId, pinless: isPinless, cashStart: input.cashStart ?? null };
    }),

  // ── 4. Ausstempeln (clock out) ────────────────────────────────────────────
  clockOut: protectedProcedure
    .input(z.object({
      pin: z.string().regex(/^\d{4}$/, "PIN muss 4 Ziffern haben").optional(),
      notes: z.string().max(500).optional(),
      cashEnd: z.number().min(0).max(99999).optional(), // Endbargeld (nur Kellner)
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const staffId = ctx.effectiveUserId!;
      const db = await getDb();
      const { ip, userAgent } = getClientInfo(ctx);

      // ── Aktive Schicht laden um Rolle zu prüfen ─────────────────────────────
      const currentShiftForRole = await db.select().from(waiterShifts)
        .where(and(
          eq(waiterShifts.staffId, staffId),
          eq(waiterShifts.restaurantId, restaurantId),
          isNull(waiterShifts.endedAt),
        )).limit(1);

      const shiftRole = currentShiftForRole[0]?.staffRole ?? ctx.user.role ?? "kellner";
      const isPinlessOut = currentShiftForRole[0]?.pinless === true ||
        shiftRole === "admin" || shiftRole === "manager" || shiftRole === "koch";

      if (!isPinlessOut) {
        // Kellner/Barkeeper: PIN erforderlich
        if (!input.pin) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PIN erforderlich." });
        }
        const pinRecord = await db.select().from(staffClockPins)
          .where(eq(staffClockPins.staffId, staffId)).limit(1);

        if (pinRecord.length === 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Kein PIN gesetzt." });
        }

        const pin = pinRecord[0];
        if (pin.lockedUntil && new Date() < new Date(pin.lockedUntil)) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "PIN gesperrt." });
        }

        const pinValid = await bcrypt.compare(input.pin, pin.pinHash);
        if (!pinValid) {
          const newFails = pin.failedAttempts + 1;
          const lockUntil = newFails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
          await db.update(staffClockPins)
            .set({ failedAttempts: newFails, lockedUntil: lockUntil })
            .where(eq(staffClockPins.staffId, staffId));
          await writeAuditLog(db, { restaurantId, staffId, action: "pin_failed", ip, userAgent });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Falscher PIN." });
        }

        await db.update(staffClockPins)
          .set({ failedAttempts: 0, lockedUntil: null })
          .where(eq(staffClockPins.staffId, staffId));
      }

      // ── Aktive Schicht finden ─────────────────────────────────────────────
      const activeShifts = await db.select().from(waiterShifts)
        .where(and(
          eq(waiterShifts.staffId, staffId),
          eq(waiterShifts.restaurantId, restaurantId),
          isNull(waiterShifts.endedAt),
        )).limit(1);

      if (activeShifts.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Keine aktive Schicht gefunden." });
      }

      const shift = activeShifts[0];

      // ── Laufende Pause automatisch beenden ────────────────────────────────
      const openBreak = await db.select().from(waiterBreaks)
        .where(and(
          eq(waiterBreaks.shiftId, shift.id),
          isNull(waiterBreaks.endedAt),
        )).limit(1);

      if (openBreak.length > 0) {
        const breakDuration = Math.round((Date.now() - new Date(openBreak[0].startedAt).getTime()) / 60000);
        await db.update(waiterBreaks)
          .set({ endedAt: new Date(), durationMinutes: breakDuration })
          .where(eq(waiterBreaks.id, openBreak[0].id));
        await writeAuditLog(db, { restaurantId, staffId, shiftId: shift.id,
          action: "break_end", ip, userAgent, details: { autoEnded: true, durationMinutes: breakDuration } });
      }

      // ── Gesamte Pausen-Dauer berechnen ────────────────────────────────────
      const allBreaks = await db.select().from(waiterBreaks)
        .where(eq(waiterBreaks.shiftId, shift.id));
      const totalBreakMinutes = allBreaks.reduce((sum: number, b: typeof allBreaks[0]) => sum + (b.durationMinutes ?? 0), 0);

      // ── Schicht abschliessen ──────────────────────────────────────────────
      const endedAt = new Date();
      const durationMinutes = Math.round((endedAt.getTime() - new Date(shift.startedAt).getTime()) / 60000);
      const netWorkMinutes = Math.max(0, durationMinutes - totalBreakMinutes);

      // Pflichtpause prüfen (CH ArG Art. 15)
      const requiredBreak = getMandatoryBreakMinutes(netWorkMinutes);
      const breakCompliant = totalBreakMinutes >= requiredBreak;

      // ── Trinkgeld berechnen (nur Kellner mit cashStart) ───────────────────────
      let tipAmount: number | null = null;
      let cashRevenue: number | null = null;
      let totalRevenue: number | null = null;

      if (input.cashEnd != null && shift.cashStart != null) {
        // Barzahlungen dieser Schicht aus orders berechnen
        const cashOrders = await db.select().from(orders)
          .where(and(
            eq(orders.restaurantId, restaurantId),
            eq(orders.staffId, staffId),
            eq(orders.paymentMethod, "cash"),
            eq(orders.status, "paid"),
            gte(orders.createdAt, new Date(shift.startedAt)),
            lte(orders.createdAt, endedAt),
          ));
        cashRevenue = cashOrders.reduce((sum: number, o: typeof cashOrders[0]) => sum + parseFloat(o.totalAmount ?? "0"), 0);

        // Alle Zahlungen dieser Schicht
        const allOrders = await db.select().from(orders)
          .where(and(
            eq(orders.restaurantId, restaurantId),
            eq(orders.staffId, staffId),
            eq(orders.status, "paid"),
            gte(orders.createdAt, new Date(shift.startedAt)),
            lte(orders.createdAt, endedAt),
          ));
        totalRevenue = allOrders.reduce((sum: number, o: typeof allOrders[0]) => sum + parseFloat(o.totalAmount ?? "0"), 0);

        // Trinkgeld = Endbargeld - Startbargeld - Barzahlungen
        const cashDiff = input.cashEnd - parseFloat(String(shift.cashStart));
        tipAmount = Math.max(0, cashDiff - (cashRevenue ?? 0));
      }

      await db.update(waiterShifts).set({
        endedAt,
        durationMinutes,
        breakMinutes: totalBreakMinutes,
        netWorkMinutes,
        status: "completed",
        clockOutIp: ip,
        clockOutUserAgent: userAgent,
        notes: input.notes ?? null,
        cashEnd: input.cashEnd != null ? String(input.cashEnd) : null,
        tipAmount: tipAmount != null ? String(tipAmount) : null,
        cashRevenue: cashRevenue != null ? String(cashRevenue) : null,
        totalRevenue: totalRevenue != null ? String(totalRevenue) : null,
      }).where(eq(waiterShifts.id, shift.id));

      await writeAuditLog(db, { restaurantId, staffId, shiftId: shift.id,
        action: "clock_out", ip, userAgent,
        details: { durationMinutes, breakMinutes: totalBreakMinutes, netWorkMinutes, breakCompliant,
          cashEnd: input.cashEnd ?? null, tipAmount, cashRevenue, totalRevenue } });

      // Pflicht-Notiz wenn Schicht > 10h (600 Minuten)
      const requiresNote = netWorkMinutes >= 600;

      return {
        success: true,
        durationMinutes,
        breakMinutes: totalBreakMinutes,
        netWorkMinutes,
        tipAmount,
        cashRevenue,
        totalRevenue,
        breakCompliant,
        requiredBreakMinutes: requiredBreak,
        requiresNote,
        shiftId: shift.id,
      };
    }),

  // ── 5. Pause starten ──────────────────────────────────────────────────────
  startBreak: protectedProcedure
    .input(z.object({
      breakType: z.enum(["mandatory", "voluntary", "meal"]).default("voluntary"),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const staffId = ctx.effectiveUserId!;
      const db = await getDb();
      const { ip, userAgent } = getClientInfo(ctx);

      // Aktive Schicht prüfen
      const activeShift = await db.select().from(waiterShifts)
        .where(and(
          eq(waiterShifts.staffId, staffId),
          eq(waiterShifts.restaurantId, restaurantId),
          isNull(waiterShifts.endedAt),
        )).limit(1);

      if (activeShift.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Keine aktive Schicht." });
      }

      const shift = activeShift[0];

      // Prüfen ob bereits eine Pause läuft
      const openBreak = await db.select().from(waiterBreaks)
        .where(and(eq(waiterBreaks.shiftId, shift.id), isNull(waiterBreaks.endedAt))).limit(1);

      if (openBreak.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Es läuft bereits eine Pause." });
      }

      // Pause erstellen
      await db.insert(waiterBreaks).values({
        shiftId: shift.id,
        staffId,
        restaurantId,
        startedAt: new Date(),
        breakType: input.breakType,
      });

      // Schicht-Status aktualisieren
      await db.update(waiterShifts).set({ status: "on_break" }).where(eq(waiterShifts.id, shift.id));

      await writeAuditLog(db, { restaurantId, staffId, shiftId: shift.id,
        action: "break_start", ip, userAgent, details: { breakType: input.breakType } });

      return { success: true };
    }),

  // ── 6. Pause beenden ──────────────────────────────────────────────────────
  endBreak: protectedProcedure.mutation(async ({ ctx }) => {
    const restaurantId = getRestaurantId(ctx);
    const staffId = ctx.effectiveUserId!;
    const db = await getDb();
    const { ip, userAgent } = getClientInfo(ctx);

    // Aktive Schicht
    const activeShift = await db.select().from(waiterShifts)
      .where(and(
        eq(waiterShifts.staffId, staffId),
        eq(waiterShifts.restaurantId, restaurantId),
        isNull(waiterShifts.endedAt),
      )).limit(1);

    if (activeShift.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Keine aktive Schicht." });
    }

    const shift = activeShift[0];

    // Laufende Pause finden
    const openBreaks = await db.select().from(waiterBreaks)
      .where(and(eq(waiterBreaks.shiftId, shift.id), isNull(waiterBreaks.endedAt))).limit(1);

    if (openBreaks.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Keine laufende Pause gefunden." });
    }

    const openBreak = openBreaks[0];
    const durationMinutes = Math.round((Date.now() - new Date(openBreak.startedAt).getTime()) / 60000);

    await db.update(waiterBreaks)
      .set({ endedAt: new Date(), durationMinutes })
      .where(eq(waiterBreaks.id, openBreak.id));

    // Schicht-Status zurücksetzen
    await db.update(waiterShifts).set({ status: "active" }).where(eq(waiterShifts.id, shift.id));

    await writeAuditLog(db, { restaurantId, staffId, shiftId: shift.id,
      action: "break_end", ip, userAgent, details: { durationMinutes } });

    return { success: true, durationMinutes };
  }),

  // ── 7. Aktuelle Schicht abrufen ───────────────────────────────────────────
  getCurrentShift: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = getRestaurantId(ctx);
    const staffId = ctx.effectiveUserId!;
    const db = await getDb();

    const activeShifts = await db.select().from(waiterShifts)
      .where(and(
        eq(waiterShifts.staffId, staffId),
        eq(waiterShifts.restaurantId, restaurantId),
        isNull(waiterShifts.endedAt),
      )).limit(1);

    if (activeShifts.length === 0) return null;

    const shift = activeShifts[0];

    // Aktive Pause?
    const openBreaks = await db.select().from(waiterBreaks)
      .where(and(eq(waiterBreaks.shiftId, shift.id), isNull(waiterBreaks.endedAt))).limit(1);

    // Alle Pausen dieser Schicht (für Gesamtdauer)
    const allBreaks = await db.select().from(waiterBreaks)
      .where(eq(waiterBreaks.shiftId, shift.id));

    const completedBreakMinutes = allBreaks
      .filter((b: typeof allBreaks[0]) => b.durationMinutes != null)
      .reduce((s: number, b: typeof allBreaks[0]) => s + (b.durationMinutes ?? 0), 0);

    const now = Date.now();
    const shiftStartMs = new Date(shift.startedAt).getTime();
    const totalElapsedMinutes = Math.floor((now - shiftStartMs) / 60000);

    // Laufende Pause dazurechnen
    const currentBreakMinutes = openBreaks.length > 0
      ? Math.floor((now - new Date(openBreaks[0].startedAt).getTime()) / 60000)
      : 0;

    const totalBreakMinutes = completedBreakMinutes + currentBreakMinutes;
    const netWorkMinutes = Math.max(0, totalElapsedMinutes - totalBreakMinutes);

    // Pflichtpause berechnen
    const requiredBreakMinutes = getMandatoryBreakMinutes(netWorkMinutes);
    const breakDue = requiredBreakMinutes > 0 && totalBreakMinutes < requiredBreakMinutes;

    // Warnung: Schicht läuft > 12h (vergessen auszustempeln?)
    const overdue = totalElapsedMinutes > 12 * 60;

    return {
      shift,
      isOnBreak: openBreaks.length > 0,
      currentBreak: openBreaks[0] ?? null,
      totalElapsedMinutes,
      totalBreakMinutes,
      netWorkMinutes,
      requiredBreakMinutes,
      breakDue,
      overdue,
    };
  }),

  // ── 8. Eigene Schichten (Verlauf) ─────────────────────────────────────────
  getMyShifts: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(30),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const staffId = ctx.effectiveUserId!;
      const db = await getDb();

      const conditions = [
        eq(waiterShifts.staffId, staffId),
        eq(waiterShifts.restaurantId, restaurantId),
      ];
      if (input.dateFrom) conditions.push(gte(waiterShifts.startedAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(waiterShifts.startedAt, new Date(input.dateTo)));

      const shifts = await db.select().from(waiterShifts)
        .where(and(...conditions))
        .orderBy(desc(waiterShifts.startedAt))
        .limit(input.limit);

      // Pausen für jede Schicht laden
      const shiftsWithBreaks = await Promise.all(shifts.map(async (s: typeof shifts[0]) => {
        const breaks = await db.select().from(waiterBreaks)
          .where(eq(waiterBreaks.shiftId, s.id));
        return { ...s, breaks };
      }));

      // Statistiken
      const completedShifts = shiftsWithBreaks.filter((s: typeof shiftsWithBreaks[0]) => s.status === "completed");
      const totalNetMinutes = completedShifts.reduce((sum: number, s: typeof shiftsWithBreaks[0]) => sum + (s.netWorkMinutes ?? 0), 0);
      const totalBreakMinutes = completedShifts.reduce((sum: number, s: typeof shiftsWithBreaks[0]) => sum + (s.breakMinutes ?? 0), 0);

      // Woche: Montag bis Sonntag
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      const weekShifts = completedShifts.filter((s: typeof shiftsWithBreaks[0]) => new Date(s.startedAt) >= weekStart);
      const weekNetMinutes = weekShifts.reduce((sum: number, s: typeof shiftsWithBreaks[0]) => sum + (s.netWorkMinutes ?? 0), 0);

      return {
        shifts: shiftsWithBreaks,
        stats: {
          totalShifts: completedShifts.length,
          totalNetMinutes,
          totalBreakMinutes,
          weekNetMinutes,
          weekShifts: weekShifts.length,
        },
      };
    }),

  // ── 9. Schicht-Statistiken (Monat) ────────────────────────────────────────
  getMonthStats: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2100).optional(),
      month: z.number().int().min(1).max(12).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const staffId = ctx.effectiveUserId!;
      const db = await getDb();

      const now = new Date();
      const year = input.year ?? now.getFullYear();
      const month = (input.month ?? now.getMonth() + 1) - 1; // 0-indexed
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

      const shifts = await db.select().from(waiterShifts)
        .where(and(
          eq(waiterShifts.staffId, staffId),
          eq(waiterShifts.restaurantId, restaurantId),
          gte(waiterShifts.startedAt, monthStart),
          lte(waiterShifts.startedAt, monthEnd),
        )).orderBy(desc(waiterShifts.startedAt));

      const completed = shifts.filter((s: typeof shifts[0]) => s.status === "completed");
      const totalNetMinutes = completed.reduce((s: number, sh: typeof shifts[0]) => s + (sh.netWorkMinutes ?? 0), 0);
      const totalBreakMinutes = completed.reduce((s: number, sh: typeof shifts[0]) => s + (sh.breakMinutes ?? 0), 0);
      const totalGrossMinutes = completed.reduce((s: number, sh: typeof shifts[0]) => s + (sh.durationMinutes ?? 0), 0);

      // Tage mit Schicht
      const workDays = new Set(completed.map((s: typeof shifts[0]) => new Date(s.startedAt).toDateString())).size;

      // Durchschnittliche Schichtdauer
      const avgNetMinutes = completed.length > 0 ? Math.round(totalNetMinutes / completed.length) : 0;

      // Überstunden (Ziel: 8h/Schicht = 480 Min.)
      const targetMinutesPerShift = 480;
      const overtimeMinutes = Math.max(0, totalNetMinutes - completed.length * targetMinutesPerShift);

      // Compliance: Pflichtpausen eingehalten?
      const nonCompliantShifts = completed.filter((s: typeof shifts[0]) => {
        const required = getMandatoryBreakMinutes(s.netWorkMinutes ?? 0);
        return required > 0 && (s.breakMinutes ?? 0) < required;
      });

      return {
        year,
        month: month + 1,
        totalShifts: completed.length,
        totalNetMinutes,
        totalBreakMinutes,
        totalGrossMinutes,
        workDays,
        avgNetMinutes,
        overtimeMinutes,
        nonCompliantShifts: nonCompliantShifts.length,
        shifts,
      };
    }),

  // ── 10. Aktivitätskorrelation (Anti-Betrug) ───────────────────────────────
  // Prüft ob der Kellner während seiner Schicht tatsächlich Bestellungen aufgenommen hat
  getActivityCorrelation: protectedProcedure
    .input(z.object({ shiftId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const staffId = ctx.effectiveUserId!;
      const db = await getDb();

      const shiftRows = await db.select().from(waiterShifts)
        .where(and(
          eq(waiterShifts.id, input.shiftId),
          eq(waiterShifts.staffId, staffId),
          eq(waiterShifts.restaurantId, restaurantId),
        )).limit(1);

      if (shiftRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Schicht nicht gefunden." });
      }

      const shift = shiftRows[0];
      const endTime = shift.endedAt ?? new Date();

      // Bestellungen während der Schicht
      const { gte: gteOp, lte: lteOp } = await import("drizzle-orm");
      const shiftOrders = await db.select({
        id: orders.id,
        createdAt: orders.createdAt,
        status: orders.status,
        totalAmount: orders.totalAmount,
      }).from(orders).where(and(
        eq(orders.staffId, staffId),
        eq(orders.restaurantId, restaurantId),
        gteOp(orders.createdAt, new Date(shift.startedAt)),
        lteOp(orders.createdAt, endTime),
      ));

      const hasActivity = shiftOrders.length > 0;
      const activityRate = shift.durationMinutes && shift.durationMinutes > 0
        ? (shiftOrders.length / (shift.durationMinutes / 60)).toFixed(1)
        : "0";

      return {
        shiftId: shift.id,
        orderCount: shiftOrders.length,
        hasActivity,
        activityRate: parseFloat(activityRate), // Bestellungen pro Stunde
        suspiciousFlag: !hasActivity && (shift.durationMinutes ?? 0) > 60,
      };
    }),

  // ── 11. Monatskalender (Schichten + Ferien + geplante Schichten) ──────────
  getMyCalendar: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const staffId = ctx.effectiveUserId!;
      const db = await getDb();

      const firstDay = new Date(input.year, input.month - 1, 1);
      const lastDay = new Date(input.year, input.month, 0);
      const dateFromStr = firstDay.toISOString().split("T")[0];
      const dateToStr = lastDay.toISOString().split("T")[0];

      // 1. Geleistete Schichten
      const workedShifts = await db.select().from(waiterShifts)
        .where(and(
          eq(waiterShifts.staffId, staffId),
          eq(waiterShifts.restaurantId, restaurantId),
          gte(waiterShifts.startedAt, firstDay),
          lte(waiterShifts.startedAt, new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59)),
        ))
        .orderBy(waiterShifts.startedAt);

      // 2. Abwesenheiten
      const absences = await db.select().from(staffAbsences)
        .where(and(
          eq(staffAbsences.staffId, staffId),
          eq(staffAbsences.restaurantId, restaurantId),
          sql`NOT (${staffAbsences.endDate} < ${dateFromStr} OR ${staffAbsences.startDate} > ${dateToStr})`,
        ))
        .orderBy(staffAbsences.startDate);

      // 3. Geplante Schichten aus veröffentlichten KI-Plänen
      const publishedPlans = await db.select({ id: aiShiftPlans.id })
        .from(aiShiftPlans)
        .where(and(
          eq(aiShiftPlans.restaurantId, restaurantId),
          eq(aiShiftPlans.status, "published"),
          sql`NOT (${aiShiftPlans.weekEnd} < ${dateFromStr} OR ${aiShiftPlans.weekStart} > ${dateToStr})`,
        ));

      type PlannedShiftRow = typeof aiPlanShifts.$inferSelect;
      let plannedShifts: PlannedShiftRow[] = [];
      if (publishedPlans.length > 0) {
        const planIds = publishedPlans.map((p: { id: number }) => p.id);
        plannedShifts = await db.select().from(aiPlanShifts)
          .where(and(
            eq(aiPlanShifts.staffId, staffId),
            eq(aiPlanShifts.restaurantId, restaurantId),
            sql`${aiPlanShifts.planId} IN (${planIds.join(",")})`,
            gte(aiPlanShifts.date, dateFromStr),
            lte(aiPlanShifts.date, dateToStr),
          ))
          .orderBy(aiPlanShifts.date);
      }

      // 4. Verfügbarkeit (Wochentage)
      const availability = await db.select().from(staffAvailability)
        .where(and(
          eq(staffAvailability.staffId, staffId),
          eq(staffAvailability.restaurantId, restaurantId),
        ));
      const availMap = new Map<number, typeof availability[0]>();
      for (const a of availability) availMap.set(a.dayOfWeek, a);

      // 5. Kalender-Tage aufbauen
      const daysInMonth = lastDay.getDate();
      const today = new Date().toISOString().split("T")[0];

      type CalendarDay = {
        date: string;
        dayOfWeek: number;
        workedShifts: (typeof workedShifts[0] & { durationHours: number })[];
        plannedShifts: PlannedShiftRow[];
        absences: typeof absences;
        isAvailable: boolean | null;
        availableFrom: string | null;
        availableTo: string | null;
        totalWorkedMinutes: number;
        isToday: boolean;
        isPast: boolean;
      };

      const days: CalendarDay[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(input.year, input.month - 1, d);
        const dateStr = dateObj.toISOString().split("T")[0];
        const dayOfWeek = dateObj.getDay();
        const avail = availMap.get(dayOfWeek);

        const dayWorked = workedShifts
          .filter((s: typeof workedShifts[0]) =>
            new Date(s.startedAt).toISOString().split("T")[0] === dateStr
          )
          .map((s: typeof workedShifts[0]) => ({
            ...s,
            durationHours: Math.round((s.netWorkMinutes ?? 0) / 6) / 10,
          }));

        const dayPlanned = plannedShifts.filter((s: PlannedShiftRow) => s.date === dateStr);
        const dayAbsences = absences.filter((a: typeof absences[0]) =>
          a.startDate <= dateStr && a.endDate >= dateStr
        );
        const totalWorkedMinutes = dayWorked.reduce(
          (sum: number, s: typeof dayWorked[0]) => sum + (s.netWorkMinutes ?? 0), 0
        );

        days.push({
          date: dateStr,
          dayOfWeek,
          workedShifts: dayWorked,
          plannedShifts: dayPlanned,
          absences: dayAbsences,
          isAvailable: avail ? avail.isAvailable : null,
          availableFrom: avail?.availableFrom ?? null,
          availableTo: avail?.availableTo ?? null,
          totalWorkedMinutes,
          isToday: dateStr === today,
          isPast: dateStr < today,
        });
      }

      // 6. Monatsstatistiken
      const totalWorkedMinutes = workedShifts.reduce(
        (sum: number, s: typeof workedShifts[0]) => sum + (s.netWorkMinutes ?? 0), 0
      );
      const totalWorkedShifts = workedShifts.filter(
        (s: typeof workedShifts[0]) => s.status === "completed"
      ).length;
      const totalAbsenceDays = absences
        .filter((a: typeof absences[0]) => a.status === "approved")
        .reduce((sum: number, a: typeof absences[0]) => {
          const start = new Date(Math.max(new Date(a.startDate).getTime(), firstDay.getTime()));
          const end = new Date(Math.min(new Date(a.endDate).getTime(), lastDay.getTime()));
          return sum + Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
        }, 0);

      return {
        year: input.year,
        month: input.month,
        days,
        stats: {
          totalWorkedMinutes,
          totalWorkedHours: Math.round(totalWorkedMinutes / 6) / 10,
          totalWorkedShifts,
          totalPlannedShifts: plannedShifts.length,
          totalAbsenceDays,
          daysInMonth,
        },
      };
    }),

  // ─── SCHICHT-NOTIZ AKTUALISIEREN ─────────────────────────────────────────────
  // Kellner kann eine Notiz zu seiner eigenen Schicht hinzufügen oder bearbeiten
  updateShiftNotes: protectedProcedure
    .input(z.object({
      shiftId: z.number().int().positive(),
      notes: z.string().max(1000, "Notiz darf maximal 1000 Zeichen haben"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const staffId = ctx.effectiveUserId!;
      const restaurantId = getRestaurantId(ctx);

      // Schicht laden und prüfen ob sie dem Kellner gehört (Multi-Tenant-Isolation)
      const [shift] = await db
        .select({ id: waiterShifts.id, staffId: waiterShifts.staffId })
        .from(waiterShifts)
        .where(
          and(
            eq(waiterShifts.id, input.shiftId),
            eq(waiterShifts.staffId, staffId),
            eq(waiterShifts.restaurantId, restaurantId)
          )
        )
        .limit(1);

      if (!shift) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schicht nicht gefunden oder keine Berechtigung",
        });
      }

      // Notiz aktualisieren
      const trimmedNotes = input.notes.trim();
      await db
        .update(waiterShifts)
        .set({ notes: trimmedNotes || null })
        .where(eq(waiterShifts.id, input.shiftId));

      return { success: true, shiftId: input.shiftId, notes: trimmedNotes || null };
    }),

  // ─── SCHICHT BEWERTEN (1-5 Sterne) ─────────────────────────────────────────────
  rateShift: protectedProcedure
    .input(z.object({
      shiftId: z.number().int().positive(),
      rating: z.number().int().min(1).max(5),
      mood: z.enum(["great", "good", "neutral", "tired", "stressed"]).optional(),
      comment: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const staffId = ctx.effectiveUserId!;
      const restaurantId = getRestaurantId(ctx);

      // Schicht prüfen ob sie dem Kellner gehört
      const [shift] = await db
        .select({ id: waiterShifts.id })
        .from(waiterShifts)
        .where(and(
          eq(waiterShifts.id, input.shiftId),
          eq(waiterShifts.staffId, staffId),
          eq(waiterShifts.restaurantId, restaurantId)
        ))
        .limit(1);

      if (!shift) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Schicht nicht gefunden" });
      }

      // Upsert: Bewertung erstellen oder aktualisieren
      const existing = await db
        .select({ id: shiftRatings.id })
        .from(shiftRatings)
        .where(eq(shiftRatings.shiftId, input.shiftId))
        .limit(1);

      if (existing.length > 0) {
        await db.update(shiftRatings)
          .set({
            rating: input.rating,
            mood: input.mood ?? "neutral",
            comment: input.comment?.trim() || null,
          })
          .where(eq(shiftRatings.shiftId, input.shiftId));
      } else {
        await db.insert(shiftRatings).values({
          shiftId: input.shiftId,
          staffId,
          restaurantId,
          rating: input.rating,
          mood: input.mood ?? "neutral",
          comment: input.comment?.trim() || null,
        });
      }

      return { success: true, shiftId: input.shiftId, rating: input.rating };
    }),

  // ─── BEWERTUNG EINER SCHICHT ABRUFEN ─────────────────────────────────────────────
  getShiftRating: protectedProcedure
    .input(z.object({ shiftId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const staffId = ctx.effectiveUserId!;
      const restaurantId = getRestaurantId(ctx);

      const [rating] = await db
        .select()
        .from(shiftRatings)
        .where(and(
          eq(shiftRatings.shiftId, input.shiftId),
          eq(shiftRatings.staffId, staffId),
          eq(shiftRatings.restaurantId, restaurantId)
        ))
        .limit(1);

      return rating ?? null;
    }),
});
