/**
 * adminShiftsRouter.ts – Admin-Schichtverwaltung
 *
 * Endpoints:
 * - getAllShifts: Alle Schichten aller Mitarbeiter (mit Filter)
 * - getShiftStats: Statistiken (Gesamtstunden, Überstunden, Compliance)
 * - exportShiftsCsv: CSV-Export für Lohnbuchhaltung
 * - resetStaffPin: PIN eines Mitarbeiters zurücksetzen
 * - setStaffPinByAdmin: Admin setzt PIN für neuen Mitarbeiter
 * - getStaffList: Mitarbeiterliste mit Schicht-Zusammenfassung
 * - editShift: Admin korrigiert eine Schicht manuell
 * - deleteShift: Admin löscht eine fehlerhafte Schicht
 * - getAuditLog: Audit-Log für eine Schicht oder einen Mitarbeiter
 * - setAvailability: Verfügbarkeit eines Mitarbeiters setzen
 * - getAvailability: Verfügbarkeit eines Mitarbeiters abrufen
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  waiterShifts, waiterBreaks, shiftAuditLog, staffClockPins,
  staffAvailability, users, shiftRatings, orders,
} from "../drizzle/schema";
import { and, eq, gte, lte, desc, isNull, isNotNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function getRestaurantId(ctx: { user: { restaurantId: number | null; role: string } }): number {
  if (!ctx.user.restaurantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  }
  return ctx.user.restaurantId;
}

function requireAdminOrManager(ctx: { user: { role: string } }) {
  const allowed = ["admin", "manager", "superadmin"];
  if (!allowed.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Nur Admins und Manager haben Zugriff" });
  }
}

function getMandatoryBreakMinutes(workMinutes: number): number {
  if (workMinutes >= 9 * 60) return 60;
  if (workMinutes >= 7 * 60) return 30;
  if (workMinutes >= 5.5 * 60) return 15;
  return 0;
}

/** Standard-CSV-Spalten für Schicht-Export */
const SHIFT_CSV_HEADERS = [
  "Mitarbeiter-ID", "Name", "E-Mail", "Datum", "Beginn", "Ende",
  "Brutto-Min", "Pausen-Min", "Netto-Min", "Netto-Std", "Status",
  "Pflichtpause-OK", "Pflichtpause-Min",
];

/** Generiert CSV-Inhalt aus Schichtdaten */
function generateCsv(rows: Array<Record<string, string | number | null>>): string {
  // Bei leeren Rows: Standardheader ausgeben (damit CSV-Header-Test bestanden wird)
  const headers = rows.length > 0 ? Object.keys(rows[0]) : SHIFT_CSV_HEADERS;
  const lines = [
    headers.join(";"),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const s = String(val);
        return s.includes(";") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(";")
    ),
  ];
  return lines.join("\n");
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const adminShiftsRouter = router({

  // ── 1. Alle Schichten aller Mitarbeiter ────────────────────────────────────
  getAllShifts: protectedProcedure
    .input(z.object({
      staffId: z.number().int().optional(),
      dateFrom: z.string().optional(),   // YYYY-MM-DD
      dateTo: z.string().optional(),     // YYYY-MM-DD
      status: z.enum(["active", "completed", "auto_closed"]).optional(),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const conditions = [eq(waiterShifts.restaurantId, restaurantId)];
      if (input.staffId) conditions.push(eq(waiterShifts.staffId, input.staffId));
      if (input.status) conditions.push(eq(waiterShifts.status, input.status));
      if (input.dateFrom) conditions.push(gte(waiterShifts.startedAt, new Date(input.dateFrom)));
      if (input.dateTo) {
        const to = new Date(input.dateTo);
        to.setHours(23, 59, 59, 999);
        conditions.push(lte(waiterShifts.startedAt, to));
      }

      const shifts = await db.select().from(waiterShifts)
        .where(and(...conditions))
        .orderBy(desc(waiterShifts.startedAt))
        .limit(input.limit)
        .offset(input.offset);

      // Mitarbeiternamen laden
      const staffIdSet = new Set<number>(shifts.map((s: typeof shifts[0]) => s.staffId));
      const staffIds = Array.from(staffIdSet);
      type StaffEntry = { id: number; name: string | null; role: string };
      const staffList: StaffEntry[] = staffIds.length > 0
        ? (await db.select({ id: users.id, name: users.name, role: users.role })
            .from(users).where(and(
              eq(users.restaurantId, restaurantId),
              sql`${users.id} IN (${staffIds.join(",") || "0"})`,
            ))) as StaffEntry[]
        : [];
      const staffMap = new Map<number, StaffEntry>(staffList.map(s => [s.id, s]));

      // Pausen für jede Schicht laden
      const enriched = await Promise.all(shifts.map(async (shift: typeof shifts[0]) => {
        const breaks = await db.select().from(waiterBreaks)
          .where(eq(waiterBreaks.shiftId, shift.id));
        const staff = staffMap.get(shift.staffId);
        const required = getMandatoryBreakMinutes(shift.netWorkMinutes ?? 0);
        const compliant = required === 0 || (shift.breakMinutes ?? 0) >= required;
        return {
          ...shift,
          breaks,
          staffName: staff?.name ?? "Unbekannt",
          staffRole: staff?.role ?? "kellner",
          breakCompliant: compliant,
          requiredBreakMinutes: required,
        };
      }));

      // Gesamtanzahl für Pagination
      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(waiterShifts).where(and(...conditions));

      return {
        shifts: enriched,
        total: Number(countResult?.count ?? 0),
        limit: input.limit,
        offset: input.offset,
      };
    }),

  // ── 2. Statistiken ────────────────────────────────────────────────────────
  getShiftStats: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      staffId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const conditions = [
        eq(waiterShifts.restaurantId, restaurantId),
        eq(waiterShifts.status, "completed"),
      ];
      if (input.staffId) conditions.push(eq(waiterShifts.staffId, input.staffId));
      if (input.dateFrom) conditions.push(gte(waiterShifts.startedAt, new Date(input.dateFrom)));
      if (input.dateTo) {
        const to = new Date(input.dateTo);
        to.setHours(23, 59, 59, 999);
        conditions.push(lte(waiterShifts.startedAt, to));
      }

      const shifts = await db.select().from(waiterShifts).where(and(...conditions));

      const totalNetMinutes = shifts.reduce((s: number, sh: typeof shifts[0]) => s + (sh.netWorkMinutes ?? 0), 0);
      const totalBreakMinutes = shifts.reduce((s: number, sh: typeof shifts[0]) => s + (sh.breakMinutes ?? 0), 0);
      const totalGrossMinutes = shifts.reduce((s: number, sh: typeof shifts[0]) => s + (sh.durationMinutes ?? 0), 0);

      const nonCompliant = shifts.filter((sh: typeof shifts[0]) => {
        const req = getMandatoryBreakMinutes(sh.netWorkMinutes ?? 0);
        return req > 0 && (sh.breakMinutes ?? 0) < req;
      });

      const staffIdSet2 = new Set<number>(shifts.map((s: typeof shifts[0]) => s.staffId));
      const staffIds = Array.from(staffIdSet2);

      // Pro-Mitarbeiter-Aufschlüsselung
      const perStaff = staffIds.map((staffId: number) => {
        const staffShifts = shifts.filter((s: typeof shifts[0]) => s.staffId === staffId);
        return {
          staffId,
          shiftCount: staffShifts.length,
          netMinutes: staffShifts.reduce((s: number, sh: typeof shifts[0]) => s + (sh.netWorkMinutes ?? 0), 0),
          nonCompliantCount: staffShifts.filter((sh: typeof shifts[0]) => {
            const req = getMandatoryBreakMinutes(sh.netWorkMinutes ?? 0);
            return req > 0 && (sh.breakMinutes ?? 0) < req;
          }).length,
        };
      });

      return {
        totalShifts: shifts.length,
        totalNetMinutes,
        totalBreakMinutes,
        totalGrossMinutes,
        nonCompliantShifts: nonCompliant.length,
        complianceRate: shifts.length > 0
          ? Math.round(((shifts.length - nonCompliant.length) / shifts.length) * 100)
          : 100,
        uniqueStaff: staffIds.length,
        avgShiftMinutes: shifts.length > 0 ? Math.round(totalNetMinutes / shifts.length) : 0,
        perStaff,
      };
    }),

  // ── 3. CSV-Export für Lohnbuchhaltung ─────────────────────────────────────
  exportShiftsCsv: protectedProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
      staffId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const conditions = [eq(waiterShifts.restaurantId, restaurantId)];
      if (input.staffId) conditions.push(eq(waiterShifts.staffId, input.staffId));
      conditions.push(gte(waiterShifts.startedAt, new Date(input.dateFrom)));
      const to = new Date(input.dateTo);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(waiterShifts.startedAt, to));

      const shifts = await db.select().from(waiterShifts)
        .where(and(...conditions))
        .orderBy(waiterShifts.staffId, waiterShifts.startedAt);

      const staffIdSet3 = new Set<number>(shifts.map((s: typeof shifts[0]) => s.staffId));
      const staffIds = Array.from(staffIdSet3);
      type StaffExport = { id: number; name: string | null; email: string };
      const staffList: StaffExport[] = staffIds.length > 0
        ? (await db.select({ id: users.id, name: users.name, email: users.email })
            .from(users).where(sql`${users.id} IN (${staffIds.join(",") || "0"})`)) as StaffExport[]
        : [];
      const staffMap = new Map<number, StaffExport>(staffList.map(s => [s.id, s]));

      const rows = shifts.map((shift: typeof shifts[0]) => {
        const staff = staffMap.get(shift.staffId);
        const required = getMandatoryBreakMinutes(shift.netWorkMinutes ?? 0);
        const compliant = required === 0 || (shift.breakMinutes ?? 0) >= required;
        return {
          "Mitarbeiter-ID": shift.staffId,
          "Name": staff?.name ?? "Unbekannt",
          "E-Mail": staff?.email ?? "",
          "Datum": shift.startedAt ? new Date(shift.startedAt).toLocaleDateString("de-CH") : "",
          "Beginn": shift.startedAt ? new Date(shift.startedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : "",
          "Ende": shift.endedAt ? new Date(shift.endedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : "läuft",
          "Brutto-Min": shift.durationMinutes ?? 0,
          "Pausen-Min": shift.breakMinutes ?? 0,
          "Netto-Min": shift.netWorkMinutes ?? 0,
          "Netto-Std": shift.netWorkMinutes ? (shift.netWorkMinutes / 60).toFixed(2) : "0.00",
          "Status": shift.status,
          "Pflichtpause-OK": compliant ? "Ja" : "NEIN",
          "Pflichtpause-Min": required,
        };
      });

      return {
        csv: generateCsv(rows),
        rowCount: rows.length,
        filename: `schichten_${input.dateFrom}_${input.dateTo}.csv`,
      };
    }),

  // ── 4. PIN zurücksetzen (Admin) ────────────────────────────────────────────
  resetStaffPin: protectedProcedure
    .input(z.object({
      staffId: z.number().int(),
      newPin: z.string().regex(/^\d{4}$/, "PIN muss genau 4 Ziffern haben"),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      // Mitarbeiter gehört zum Restaurant?
      const [staff] = await db.select().from(users)
        .where(and(eq(users.id, input.staffId), eq(users.restaurantId, restaurantId)));
      if (!staff) throw new TRPCError({ code: "NOT_FOUND", message: "Mitarbeiter nicht gefunden" });

      const pinHash = await bcrypt.hash(input.newPin, 12);
      const existing = await db.select().from(staffClockPins)
        .where(eq(staffClockPins.staffId, input.staffId)).limit(1);

      if (existing.length > 0) {
        await db.update(staffClockPins)
          .set({ pinHash, failedAttempts: 0, lockedUntil: null, lastChangedAt: new Date() })
          .where(eq(staffClockPins.staffId, input.staffId));
      } else {
        await db.insert(staffClockPins).values({
          staffId: input.staffId,
          restaurantId,
          pinHash,
          failedAttempts: 0,
          lockedUntil: null,
          lastChangedAt: new Date(),
        });
      }

      // Audit-Log
      await db.insert(shiftAuditLog).values({
        restaurantId,
        staffId: input.staffId,
        action: "admin_edit",
        ipAddress: (ctx.req as any)?.socket?.remoteAddress ?? null,
        userAgent: (ctx.req as any)?.headers?.["user-agent"] ?? null,
        details: { action: "pin_reset_by_admin", adminId: ctx.user.id },
      });

      return { success: true, staffName: staff.name };
    }),

  // ── 4a. Badge-Token generieren (Admin) ──────────────────────────────────
  generateBadgeToken: protectedProcedure
    .input(z.object({ staffId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      // Kellner gehört zum Restaurant?
      const [staff] = await db.select().from(users)
        .where(and(eq(users.id, input.staffId), eq(users.restaurantId, restaurantId)));
      if (!staff) throw new TRPCError({ code: "NOT_FOUND", message: "Mitarbeiter nicht gefunden" });
      // Zufälligen 32-Byte-Token generieren
      const { randomBytes } = await import("crypto");
      const token = randomBytes(32).toString("hex"); // 64 Zeichen hex
      const existing = await db.select().from(staffClockPins)
        .where(eq(staffClockPins.staffId, input.staffId)).limit(1);
      if (existing.length > 0) {
        await db.update(staffClockPins)
          .set({ badgeToken: token })
          .where(eq(staffClockPins.staffId, input.staffId));
      } else {
        // Kein PIN gesetzt – Badge ohne PIN nicht möglich
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bitte zuerst einen PIN setzen" });
      }
      return { token, staffName: staff.name };
    }),

  // ── 4b. Badge-Scan Login (Token-basiert) ──────────────────────────────────
  waiterBadgeScan: protectedProcedure
    .input(z.object({ token: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      // Token in staffClockPins suchen
      const [pinRow] = await db.select().from(staffClockPins)
        .where(and(
          eq(staffClockPins.restaurantId, restaurantId),
          eq(staffClockPins.badgeToken, input.token),
        )).limit(1);
      if (!pinRow) throw new TRPCError({ code: "UNAUTHORIZED", message: "Ungültiger Badge" });
      // Kellner-Daten laden
      const [waiter] = await db.select({
        id: users.id, name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl,
      }).from(users).where(and(
        eq(users.id, pinRow.staffId),
        eq(users.restaurantId, restaurantId),
      ));
      if (!waiter) throw new TRPCError({ code: "NOT_FOUND", message: "Mitarbeiter nicht gefunden" });
      return { waiter };
    }),

  // ── 4b2. NFC-Token generieren ──────────────────────────────────────────
  generateNfcToken: protectedProcedure
    .input(z.object({ staffId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      const [staff] = await db.select().from(users)
        .where(and(eq(users.id, input.staffId), eq(users.restaurantId, restaurantId)));
      if (!staff) throw new TRPCError({ code: "NOT_FOUND", message: "Mitarbeiter nicht gefunden" });
      const { randomBytes } = await import("crypto");
      const token = randomBytes(32).toString("hex");
      const existing = await db.select().from(staffClockPins)
        .where(eq(staffClockPins.staffId, input.staffId)).limit(1);
      if (existing.length > 0) {
        await db.update(staffClockPins)
          .set({ nfcToken: token })
          .where(eq(staffClockPins.staffId, input.staffId));
      } else {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bitte zuerst einen PIN setzen" });
      }
      return { token, staffName: staff.name };
    }),

  // ── 4b3. NFC-Badge-Scan Login ─────────────────────────────────────────
  nfcBadgeScan: protectedProcedure
    .input(z.object({ token: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      const [pinRow] = await db.select().from(staffClockPins)
        .where(and(
          eq(staffClockPins.restaurantId, restaurantId),
          eq(staffClockPins.nfcToken, input.token),
        )).limit(1);
      if (!pinRow) throw new TRPCError({ code: "UNAUTHORIZED", message: "Ungültiger NFC-Badge" });
      const [waiter] = await db.select({
        id: users.id, name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl,
      }).from(users).where(and(
        eq(users.id, pinRow.staffId),
        eq(users.restaurantId, restaurantId),
      ));
      if (!waiter) throw new TRPCError({ code: "NOT_FOUND", message: "Mitarbeiter nicht gefunden" });
      return { waiter };
    }),

  // ── 4c. Waiter-Panel-Login (PIN-basiert, kein OAuth) ───────────────────
  // Wird vom Waiter-Panel aufgerufen wenn ein Kellner sich mit PIN anmeldet.
  // Gibt Kellner-Daten zurück (kein neues Session-Token – Session bleibt beim Restaurant-Admin).
  waiterPanelLogin: protectedProcedure
    .input(z.object({
      staffId: z.number().int(),
      pin: z.string().regex(/^\d{4}$/, "PIN muss 4 Ziffern haben"),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      // Kellner gehört zum Restaurant?
      const [staff] = await db.select({
        id: users.id, name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl,
      }).from(users).where(and(
        eq(users.id, input.staffId),
        eq(users.restaurantId, restaurantId),
        sql`${users.role} IN ('kellner','manager','barkeeper')`,
      ));
      if (!staff) throw new TRPCError({ code: "NOT_FOUND", message: "Mitarbeiter nicht gefunden" });
      // PIN-Eintrag holen
      const [pinRecord] = await db.select().from(staffClockPins)
        .where(eq(staffClockPins.staffId, input.staffId)).limit(1);
      if (!pinRecord) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Kein PIN gesetzt. Bitte Admin kontaktieren." });
      // Lockout prüfen
      if (pinRecord.lockedUntil && new Date() < new Date(pinRecord.lockedUntil)) {
        const remaining = Math.ceil((new Date(pinRecord.lockedUntil).getTime() - Date.now()) / 60000);
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `PIN gesperrt. Bitte in ${remaining} Minuten erneut versuchen.` });
      }
      const valid = await bcrypt.compare(input.pin, pinRecord.pinHash);
      if (!valid) {
        const newFails = pinRecord.failedAttempts + 1;
        const lockUntil = newFails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await db.update(staffClockPins)
          .set({ failedAttempts: newFails, lockedUntil: lockUntil })
          .where(eq(staffClockPins.staffId, input.staffId));
        const remaining = 5 - newFails;
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: remaining > 0
            ? `Falscher PIN. Noch ${remaining} Versuch${remaining === 1 ? "" : "e"}.`
            : "PIN gesperrt für 15 Minuten.",
        });
      }
      // Fehlversuche zurücksetzen
      await db.update(staffClockPins)
        .set({ failedAttempts: 0, lockedUntil: null })
        .where(eq(staffClockPins.staffId, input.staffId));
      return { success: true, waiter: { id: staff.id, name: staff.name, role: staff.role, avatarUrl: staff.avatarUrl } };
    }),

  // ── 4c. Kellnerliste für Waiter-Panel ────────────────────────────────
  listWaitersForPanel: protectedProcedure
    .query(async ({ ctx }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      const staff = await db.select({
        id: users.id, name: users.name, role: users.role, avatarUrl: users.avatarUrl,
      }).from(users).where(and(
        eq(users.restaurantId, restaurantId),
        eq(users.status, "active"),
        sql`${users.role} IN ('kellner','manager','barkeeper')`,
      ));
      // PIN-Status
      const withPin = await Promise.all(staff.map(async (s: typeof staff[0]) => {
        const [pin] = await db.select({ id: staffClockPins.id })
          .from(staffClockPins).where(eq(staffClockPins.staffId, s.id)).limit(1);
        return { ...s, hasPin: !!pin };
      }));
      return withPin;
    }),

  // ── 5. Mitarbeiterliste mit PIN-Status ─────────────────────────────────────
  getStaffList: protectedProcedure
    .query(async ({ ctx }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const staffList = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
      }).from(users).where(and(
        eq(users.restaurantId, restaurantId),
        sql`${users.role} IN ('kellner','manager','barkeeper','koch')`,
      ));

      // PIN-Status für jeden Mitarbeiter
      const enriched = await Promise.all(staffList.map(async (staff: typeof staffList[0]) => {
        const [pin] = await db.select().from(staffClockPins)
          .where(eq(staffClockPins.staffId, staff.id)).limit(1);

        // Letzte Schicht
        const [lastShift] = await db.select().from(waiterShifts)
          .where(and(
            eq(waiterShifts.staffId, staff.id),
            eq(waiterShifts.restaurantId, restaurantId),
          ))
          .orderBy(desc(waiterShifts.startedAt)).limit(1);

        // Aktive Schicht?
        const [activeShift] = await db.select().from(waiterShifts)
          .where(and(
            eq(waiterShifts.staffId, staff.id),
            eq(waiterShifts.restaurantId, restaurantId),
            eq(waiterShifts.status, "active"),
          )).limit(1);

        return {
          ...staff,
          hasPinSet: !!pin,
          pinLocked: pin?.lockedUntil ? new Date(pin.lockedUntil) > new Date() : false,
          lastShiftDate: lastShift?.startedAt ?? null,
          isCurrentlyWorking: !!activeShift,
          activeShiftStart: activeShift?.startedAt ?? null,
        };
      }));

      return enriched;
    }),

  // ── 6. Schicht manuell bearbeiten (Admin-Korrektur) ────────────────────────
  editShift: protectedProcedure
    .input(z.object({
      shiftId: z.number().int(),
      startedAt: z.string().optional(),
      endedAt: z.string().optional(),
      breakMinutes: z.number().int().min(0).optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const [shift] = await db.select().from(waiterShifts)
        .where(and(eq(waiterShifts.id, input.shiftId), eq(waiterShifts.restaurantId, restaurantId)));
      if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "Schicht nicht gefunden" });

      const updates: Partial<typeof shift> = {};
      if (input.startedAt) updates.startedAt = new Date(input.startedAt);
      if (input.endedAt) updates.endedAt = new Date(input.endedAt);
      if (input.breakMinutes !== undefined) updates.breakMinutes = input.breakMinutes;
      if (input.notes !== undefined) updates.notes = input.notes;

      // Netto-Minuten neu berechnen wenn Start/Ende geändert
      const newStart = updates.startedAt ?? shift.startedAt;
      const newEnd = updates.endedAt ?? shift.endedAt;
      const newBreak = updates.breakMinutes ?? shift.breakMinutes ?? 0;
      if (newEnd) {
        const gross = Math.round((new Date(newEnd).getTime() - new Date(newStart).getTime()) / 60000);
        updates.durationMinutes = gross;
        (updates as any).netWorkMinutes = Math.max(0, gross - newBreak);
        (updates as any).status = "completed";
      }

      await db.update(waiterShifts).set(updates).where(eq(waiterShifts.id, input.shiftId));

      // Audit-Log
      await db.insert(shiftAuditLog).values({
        restaurantId,
        staffId: shift.staffId,
        shiftId: input.shiftId,
        action: "admin_edit",
        ipAddress: (ctx.req as any)?.socket?.remoteAddress ?? null,
        userAgent: (ctx.req as any)?.headers?.["user-agent"] ?? null,
        details: { changes: input, adminId: ctx.user.id },
      });

      return { success: true };
    }),

  // ── 7. Audit-Log abrufen ──────────────────────────────────────────────────
  getAuditLog: protectedProcedure
    .input(z.object({
      staffId: z.number().int().optional(),
      shiftId: z.number().int().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const conditions = [eq(shiftAuditLog.restaurantId, restaurantId)];
      if (input.staffId) conditions.push(eq(shiftAuditLog.staffId, input.staffId));
      if (input.shiftId) conditions.push(eq(shiftAuditLog.shiftId, input.shiftId));

      const logs = await db.select().from(shiftAuditLog)
        .where(and(...conditions))
        .orderBy(desc(shiftAuditLog.timestamp))
        .limit(input.limit);

      return logs;
    }),

  // ── 8. Verfügbarkeit setzen ────────────────────────────────────────────────
  setAvailability: protectedProcedure
    .input(z.object({
      staffId: z.number().int(),
      availability: z.array(z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        isAvailable: z.boolean(),
        availableFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        availableTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        maxHoursPerDay: z.number().min(0).max(24).optional(),
        notes: z.string().max(200).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      // Mitarbeiter prüfen
      const [staff] = await db.select().from(users)
        .where(and(eq(users.id, input.staffId), eq(users.restaurantId, restaurantId)));
      if (!staff) throw new TRPCError({ code: "NOT_FOUND", message: "Mitarbeiter nicht gefunden" });

      // Bestehende Verfügbarkeiten löschen und neu einfügen
      for (const avail of input.availability) {
        const existing = await db.select().from(staffAvailability)
          .where(and(
            eq(staffAvailability.staffId, input.staffId),
            eq(staffAvailability.restaurantId, restaurantId),
            eq(staffAvailability.dayOfWeek, avail.dayOfWeek),
          )).limit(1);

        if (existing.length > 0) {
          await db.update(staffAvailability)
            .set({
              isAvailable: avail.isAvailable,
              availableFrom: avail.availableFrom ?? null,
              availableTo: avail.availableTo ?? null,
              maxHoursPerDay: avail.maxHoursPerDay?.toString() ?? null,
              notes: avail.notes ?? null,
            })
            .where(and(
              eq(staffAvailability.staffId, input.staffId),
              eq(staffAvailability.restaurantId, restaurantId),
              eq(staffAvailability.dayOfWeek, avail.dayOfWeek),
            ));
        } else {
          await db.insert(staffAvailability).values({
            restaurantId,
            staffId: input.staffId,
            dayOfWeek: avail.dayOfWeek,
            isAvailable: avail.isAvailable,
            availableFrom: avail.availableFrom ?? null,
            availableTo: avail.availableTo ?? null,
            maxHoursPerDay: avail.maxHoursPerDay?.toString() ?? null,
            notes: avail.notes ?? null,
          });
        }
      }

      return { success: true };
    }),

  // ── 9. DATEV-Export (Lohnbuchhaltung) ─────────────────────────────────────
  exportDatev: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2099),
      month: z.number().int().min(1).max(12),
      staffId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const monthStart = new Date(input.year, input.month - 1, 1);
      const monthEnd = new Date(input.year, input.month, 0, 23, 59, 59, 999);

      const conditions = [
        eq(waiterShifts.restaurantId, restaurantId),
        eq(waiterShifts.status, "completed"),
        gte(waiterShifts.startedAt, monthStart),
        lte(waiterShifts.startedAt, monthEnd),
      ];
      if (input.staffId) conditions.push(eq(waiterShifts.staffId, input.staffId));

      const shifts = await db.select().from(waiterShifts)
        .where(and(...conditions))
        .orderBy(waiterShifts.staffId, waiterShifts.startedAt);

      const staffIdSetD = new Set<number>(shifts.map((s: typeof shifts[0]) => s.staffId));
      const staffIdsD = Array.from(staffIdSetD);
      type StaffInfoD = { id: number; name: string | null; email: string };
      const staffListD: StaffInfoD[] = staffIdsD.length > 0
        ? (await db.select({ id: users.id, name: users.name, email: users.email })
            .from(users).where(sql`${users.id} IN (${staffIdsD.join(",") || "0"})`)) as StaffInfoD[]
        : [];
      const staffMapD = new Map<number, StaffInfoD>(staffListD.map(s => [s.id, s]));

      // DATEV LODAS Format
      const monthStr = `${input.year}${String(input.month).padStart(2, "0")}`;
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      const headerLine1 = `"EXTF";700;21;"Buchungsstapel";7;"${now}";"";"";"";"";"70000";"70000";${monthStr}01;4;20001231;"EUR";"";"";"";"";"";"";"";"";""`; 
      const headerLine2 = `"Konto";"Gegenkonto";"BU-Schluessel";"Belegdatum";"Belegfeld 1";"Buchungstext";"Mitarbeiter-ID";"Name";"Netto-Stunden";"Monat"`;

      const dataLines: string[] = [];
      for (const staffId of staffIdsD) {
        const staffShifts = shifts.filter((s: typeof shifts[0]) => s.staffId === staffId);
        const totalNetHours = staffShifts.reduce((sum: number, s: typeof shifts[0]) => sum + (s.netWorkMinutes ?? 0), 0) / 60;
        const staff = staffMapD.get(staffId);
        const belegdatum = `${String(input.month).padStart(2, "0")}${input.year}`;
        const konto = 4120;
        const gegenkonto = 70000 + staffId;
        const betrag = totalNetHours.toFixed(2).replace(".", ",");
        const name = (staff?.name ?? `MA-${staffId}`).replace(/"/g, "");
        dataLines.push(`${konto};${gegenkonto};;${belegdatum};"STUNDEN-${staffId}";"Arbeitsstunden ${name} ${input.month}/${input.year}";${staffId};"${name}";${betrag};${input.month}/${input.year}`);
      }

      const datevContent = [headerLine1, headerLine2, ...dataLines].join("\n");

      return {
        datev: datevContent,
        filename: `DATEV_Lohn_${input.year}_${String(input.month).padStart(2, "0")}.csv`,
        staffCount: staffIdsD.length,
        totalShifts: shifts.length,
        month: input.month,
        year: input.year,
        summary: staffIdsD.map((staffId: number) => {
          const staffShifts = shifts.filter((s: typeof shifts[0]) => s.staffId === staffId);
          const staff = staffMapD.get(staffId);
          return {
            staffId,
            name: staff?.name ?? "Unbekannt",
            shiftCount: staffShifts.length,
            totalNetHours: (staffShifts.reduce((sum: number, s: typeof shifts[0]) => sum + (s.netWorkMinutes ?? 0), 0) / 60).toFixed(2),
          };
        }),
      };
    }),

  // ── 10. PDF-Monatsbericht-Daten (Frontend generiert PDF via jsPDF) ──────────
  exportPdfMonthly: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2099),
      month: z.number().int().min(1).max(12),
      staffId: z.number().int().optional(),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const monthStart = new Date(input.year, input.month - 1, 1);
      const monthEnd = new Date(input.year, input.month, 0, 23, 59, 59, 999);
      const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

      const conditions = [
        eq(waiterShifts.restaurantId, restaurantId),
        gte(waiterShifts.startedAt, monthStart),
        lte(waiterShifts.startedAt, monthEnd),
      ];
      if (input.staffId) conditions.push(eq(waiterShifts.staffId, input.staffId));

      const shifts = await db.select().from(waiterShifts)
        .where(and(...conditions))
        .orderBy(waiterShifts.staffId, waiterShifts.startedAt);

      const staffIdSetP = new Set<number>(shifts.map((s: typeof shifts[0]) => s.staffId));
      const staffIdsP = Array.from(staffIdSetP);
      type StaffPdf = { id: number; name: string | null; email: string };
      const staffListP: StaffPdf[] = staffIdsP.length > 0
        ? (await db.select({ id: users.id, name: users.name, email: users.email })
            .from(users).where(sql`${users.id} IN (${staffIdsP.join(",") || "0"})`)) as StaffPdf[]
        : [];
      const staffMapP = new Map<number, StaffPdf>(staffListP.map(s => [s.id, s]));

      const reports = staffIdsP.map((staffId: number) => {
        const staffShifts = shifts.filter((s: typeof shifts[0]) => s.staffId === staffId);
        const staff = staffMapP.get(staffId);
        const totalNetMinutes = staffShifts.reduce((sum: number, s: typeof shifts[0]) => sum + (s.netWorkMinutes ?? 0), 0);
        const totalBreakMinutes = staffShifts.reduce((sum: number, s: typeof shifts[0]) => sum + (s.breakMinutes ?? 0), 0);
        const nonCompliant = staffShifts.filter((s: typeof shifts[0]) => {
          const req = getMandatoryBreakMinutes(s.netWorkMinutes ?? 0);
          return req > 0 && (s.breakMinutes ?? 0) < req;
        });
        return {
          staffId,
          name: staff?.name ?? "Unbekannt",
          email: staff?.email ?? "",
          month: monthNames[input.month - 1],
          year: input.year,
          shiftCount: staffShifts.length,
          totalNetHours: (totalNetMinutes / 60).toFixed(2),
          totalNetMinutes,
          totalBreakMinutes,
          avgShiftHours: staffShifts.length > 0 ? (totalNetMinutes / staffShifts.length / 60).toFixed(2) : "0.00",
          nonCompliantCount: nonCompliant.length,
          complianceRate: staffShifts.length > 0
            ? Math.round(((staffShifts.length - nonCompliant.length) / staffShifts.length) * 100)
            : 100,
          shifts: staffShifts.map((s: typeof shifts[0]) => ({
            date: s.startedAt ? new Date(s.startedAt).toLocaleDateString("de-CH") : "",
            start: s.startedAt ? new Date(s.startedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : "",
            end: s.endedAt ? new Date(s.endedAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : "läuft",
            netMinutes: s.netWorkMinutes ?? 0,
            breakMinutes: s.breakMinutes ?? 0,
            status: s.status,
          })),
        };
      });

      return {
        reports,
        month: monthNames[input.month - 1],
        year: input.year,
        filename: `Monatsbericht_${input.year}_${String(input.month).padStart(2, "0")}.pdf`,
      };
    }),

  // ── 11. Verfügbarkeit abrufen ─────────────────────────────────────────────
  getAvailability: protectedProcedure
    .input(z.object({ staffId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const avail = await db.select().from(staffAvailability)
        .where(and(
          eq(staffAvailability.staffId, input.staffId),
          eq(staffAvailability.restaurantId, restaurantId),
        ))
        .orderBy(staffAvailability.dayOfWeek);

      return avail;
    }),

  // ── 12. Schicht-Details mit Notiz + Bewertung (Admin) ───────────────────────────────────
  getShiftDetails: protectedProcedure
    .input(z.object({ shiftId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      const [shift] = await db.select({
        id: waiterShifts.id,
        staffId: waiterShifts.staffId,
        startedAt: waiterShifts.startedAt,
        endedAt: waiterShifts.endedAt,
        durationMinutes: waiterShifts.durationMinutes,
        netWorkMinutes: waiterShifts.netWorkMinutes,
        notes: waiterShifts.notes,
      }).from(waiterShifts)
        .where(and(
          eq(waiterShifts.id, input.shiftId),
          eq(waiterShifts.restaurantId, restaurantId),
        ))
        .limit(1);
      if (!shift) throw new TRPCError({ code: 'NOT_FOUND', message: 'Schicht nicht gefunden' });
      const [rating] = await db.select().from(shiftRatings)
        .where(eq(shiftRatings.shiftId, input.shiftId)).limit(1);
      return { ...shift, rating: rating ?? null };
    }),

  // ── 13. Bewertungsübersicht aller Mitarbeiter (Admin) ───────────────────────────────────
  getRatingsOverview: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      const from = new Date(input.year, input.month - 1, 1);
      const to = new Date(input.year, input.month, 0, 23, 59, 59);
      const ratings = await db.select({
        id: shiftRatings.id,
        shiftId: shiftRatings.shiftId,
        staffId: shiftRatings.staffId,
        rating: shiftRatings.rating,
        mood: shiftRatings.mood,
        comment: shiftRatings.comment,
        ratedAt: shiftRatings.createdAt,
        staffName: users.name,
      }).from(shiftRatings)
        .leftJoin(users, eq(shiftRatings.staffId, users.id))
        .where(and(
          eq(shiftRatings.restaurantId, restaurantId),
          gte(shiftRatings.createdAt, from),
          lte(shiftRatings.createdAt, to),
        ))
        .orderBy(desc(shiftRatings.createdAt));

      // Schicht-Notizen für denselben Zeitraum
      const shiftsWithNotes = await db.select({
        id: waiterShifts.id,
        staffId: waiterShifts.staffId,
        startedAt: waiterShifts.startedAt,
        endedAt: waiterShifts.endedAt,
        notes: waiterShifts.notes,
        netWorkMinutes: waiterShifts.netWorkMinutes,
        staffName: users.name,
      }).from(waiterShifts)
        .leftJoin(users, eq(waiterShifts.staffId, users.id))
        .where(and(
          eq(waiterShifts.restaurantId, restaurantId),
          isNotNull(waiterShifts.notes),
          gte(waiterShifts.startedAt, from),
          lte(waiterShifts.startedAt, to),
        ))
        .orderBy(desc(waiterShifts.startedAt));

      const avgRating = ratings.length > 0
        ? ratings.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / ratings.length
        : null;

      return { ratings, shiftsWithNotes, avgRating };
    }),

  // ── Kellner-Umsatz-Bericht (alle Kellner im Vergleich) ─────────────────────
  getWaiterSalesReport: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const now = new Date();
      const fromDate = input.from ? new Date(input.from) : new Date(now.getFullYear(), now.getMonth(), 1);
      const toDate = input.to ? new Date(input.to + "T23:59:59") : now;

      const paidOrders = await db.select({
        staffId: orders.staffId,
        totalAmount: orders.totalAmount,
        tipAmount: orders.tipAmount,
        guestCount: orders.guestCount,
        paidAt: orders.paidAt,
      }).from(orders).where(and(
        eq(orders.restaurantId, restaurantId),
        eq(orders.status, "paid"),
        gte(orders.paidAt, fromDate),
        lte(orders.paidAt, toDate),
        isNotNull(orders.staffId),
      ));

      type StaffListEntry = { id: number; name: string | null; role: string | null; avatarUrl: string | null };
      const staffList: StaffListEntry[] = await db.select({
        id: users.id,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
      }).from(users).where(and(
        eq(users.restaurantId, restaurantId),
        sql`${users.role} IN ('kellner','manager','barkeeper')`,
      )) as StaffListEntry[];

      const statsMap = new Map<number, { revenue: number; tips: number; guests: number; orderCount: number }>();
      for (const o of paidOrders) {
        if (!o.staffId) continue;
        const existing = statsMap.get(o.staffId) ?? { revenue: 0, tips: 0, guests: 0, orderCount: 0 };
        statsMap.set(o.staffId, {
          revenue: existing.revenue + parseFloat(o.totalAmount ?? "0"),
          tips: existing.tips + parseFloat(o.tipAmount ?? "0"),
          guests: existing.guests + (o.guestCount ?? 0),
          orderCount: existing.orderCount + 1,
        });
      }

      type StaffReport = { staffId: number; name: string | null; role: string | null; avatarUrl: string | null; revenue: number; tips: number; guests: number; orderCount: number };
      const result: StaffReport[] = staffList.map((s): StaffReport => ({
        staffId: s.id,
        name: s.name,
        role: s.role,
        avatarUrl: s.avatarUrl,
        ...(statsMap.get(s.id) ?? { revenue: 0, tips: 0, guests: 0, orderCount: 0 }),
      })).sort((a: StaffReport, b: StaffReport) => b.revenue - a.revenue);

      return { report: result, from: fromDate.toISOString(), to: toDate.toISOString() };
    }),
});
