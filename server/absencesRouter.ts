/**
 * absencesRouter.ts – Abwesenheitsverwaltung (Ferien, Krankheit etc.)
 *
 * Endpoints für Kellner:
 * - requestAbsence: Abwesenheitsantrag stellen
 * - getMyAbsences: Eigene Anträge anzeigen
 * - cancelAbsence: Eigenen Antrag zurückziehen (nur wenn pending)
 *
 * Endpoints für Admin/Manager:
 * - listAbsences: Alle Anträge des Restaurants
 * - approveAbsence: Antrag genehmigen
 * - rejectAbsence: Antrag ablehnen
 * - getAbsenceStats: Statistiken (Urlaubstage pro Mitarbeiter)
 * - getAbsenceCalendar: Kalenderansicht (welche Mitarbeiter sind wann weg)
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { staffAbsences, users } from "../drizzle/schema";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function getRestaurantId(ctx: { user: { restaurantId: number | null } }): number {
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

/** Arbeitstage zwischen zwei Daten berechnen (Mo–Sa, ohne Sonntag) */
function calcWorkDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let days = 0;
  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0) days++; // Sonntag = 0 ausschliessen
    current.setDate(current.getDate() + 1);
  }
  return days;
}

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  vacation: "Ferien",
  sick: "Krankheit",
  personal: "Persönlich",
  unpaid: "Unbezahlt",
  other: "Sonstiges",
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const absencesRouter = router({

  // ── 1. Abwesenheitsantrag stellen (Kellner) ────────────────────────────────
  requestAbsence: protectedProcedure
    .input(z.object({
      type: z.enum(["vacation", "sick", "personal", "unpaid", "other"]),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      // Datum-Validierung
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      if (end < start) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enddatum muss nach Startdatum liegen" });
      }
      if (start < new Date(new Date().toDateString())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Startdatum darf nicht in der Vergangenheit liegen" });
      }

      // Überschneidung mit bestehenden Anträgen prüfen
      const existing = await db.select().from(staffAbsences)
        .where(and(
          eq(staffAbsences.staffId, ctx.effectiveUserId!),
          eq(staffAbsences.restaurantId, restaurantId),
          sql`${staffAbsences.status} IN ('pending', 'approved')`,
          sql`NOT (${staffAbsences.endDate} < ${input.startDate} OR ${staffAbsences.startDate} > ${input.endDate})`,
        ));

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Es besteht bereits ein Antrag für diesen Zeitraum",
        });
      }

      const totalDays = calcWorkDays(input.startDate, input.endDate);

      const [result] = await db.insert(staffAbsences).values({
        restaurantId,
        staffId: ctx.effectiveUserId!,
        type: input.type,
        status: "pending",
        startDate: input.startDate,
        endDate: input.endDate,
        totalDays,
        reason: input.reason ?? null,
      });

      // Admin benachrichtigen
      await notifyOwner({
        title: `Neuer Abwesenheitsantrag: ${ctx.user.name}`,
        content: `${ctx.user.name} hat einen Antrag für ${ABSENCE_TYPE_LABELS[input.type]} vom ${input.startDate} bis ${input.endDate} (${totalDays} Tage) gestellt.`,
      }).catch(() => {}); // Fehler ignorieren

      return { success: true, id: (result as any).insertId, totalDays };
    }),

  // ── 2. Eigene Anträge anzeigen (Kellner) ──────────────────────────────────
  getMyAbsences: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const conditions = [
        eq(staffAbsences.staffId, ctx.effectiveUserId!),
        eq(staffAbsences.restaurantId, restaurantId),
      ];

      if (input.year) {
        conditions.push(gte(staffAbsences.startDate, `${input.year}-01-01`));
        conditions.push(lte(staffAbsences.endDate, `${input.year}-12-31`));
      }

      const absences = await db.select().from(staffAbsences)
        .where(and(...conditions))
        .orderBy(desc(staffAbsences.startDate));

      const totalApprovedDays = absences
        .filter((a: typeof absences[0]) => a.status === "approved")
        .reduce((s: number, a: typeof absences[0]) => s + a.totalDays, 0);

      const pendingCount = absences.filter((a: typeof absences[0]) => a.status === "pending").length;

      return { absences, totalApprovedDays, pendingCount };
    }),

  // ── 3. Eigenen Antrag zurückziehen (Kellner) ───────────────────────────────
  cancelAbsence: protectedProcedure
    .input(z.object({ absenceId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const [absence] = await db.select().from(staffAbsences)
        .where(and(
          eq(staffAbsences.id, input.absenceId),
          eq(staffAbsences.staffId, ctx.effectiveUserId!),
          eq(staffAbsences.restaurantId, restaurantId),
        ));

      if (!absence) throw new TRPCError({ code: "NOT_FOUND", message: "Antrag nicht gefunden" });
      if (absence.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nur ausstehende Anträge können zurückgezogen werden",
        });
      }

      await db.update(staffAbsences)
        .set({ status: "cancelled" })
        .where(eq(staffAbsences.id, input.absenceId));

      return { success: true };
    }),

  // ── 4. Alle Anträge anzeigen (Admin) ──────────────────────────────────────
  listAbsences: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]).default("all"),
      staffId: z.number().int().optional(),
      year: z.number().int().min(2020).max(2100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const conditions = [eq(staffAbsences.restaurantId, restaurantId)];
      if (input.status !== "all") conditions.push(eq(staffAbsences.status, input.status));
      if (input.staffId) conditions.push(eq(staffAbsences.staffId, input.staffId));
      if (input.year) {
        conditions.push(gte(staffAbsences.startDate, `${input.year}-01-01`));
        conditions.push(lte(staffAbsences.endDate, `${input.year}-12-31`));
      }

      const absences = await db.select().from(staffAbsences)
        .where(and(...conditions))
        .orderBy(desc(staffAbsences.createdAt));

      // Mitarbeiternamen laden
      const staffIdSet = new Set<number>(absences.map((a: typeof absences[0]) => a.staffId));
      const staffIds = Array.from(staffIdSet);
      type StaffInfo = { id: number; name: string | null; role: string };
      const staffList: StaffInfo[] = staffIds.length > 0
        ? (await db.select({ id: users.id, name: users.name, role: users.role })
            .from(users).where(sql`${users.id} IN (${staffIds.join(",") || "0"})`)) as StaffInfo[]
        : [];
      const staffMap = new Map<number, StaffInfo>(staffList.map(s => [s.id, s]));

      const enriched = absences.map((a: typeof absences[0]) => ({
        ...a,
        staffName: staffMap.get(a.staffId)?.name ?? "Unbekannt",
        staffRole: staffMap.get(a.staffId)?.role ?? "kellner",
        typeLabel: ABSENCE_TYPE_LABELS[a.type] ?? a.type,
      }));

      return {
        absences: enriched,
        pendingCount: enriched.filter((a: typeof enriched[0]) => a.status === "pending").length,
      };
    }),

  // ── 5. Antrag genehmigen (Admin) ──────────────────────────────────────────
  approveAbsence: protectedProcedure
    .input(z.object({
      absenceId: z.number().int(),
      adminNote: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const [absence] = await db.select().from(staffAbsences)
        .where(and(
          eq(staffAbsences.id, input.absenceId),
          eq(staffAbsences.restaurantId, restaurantId),
        ));

      if (!absence) throw new TRPCError({ code: "NOT_FOUND", message: "Antrag nicht gefunden" });
      if (absence.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Antrag ist nicht mehr ausstehend" });
      }

      await db.update(staffAbsences)
        .set({
          status: "approved",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
          adminNote: input.adminNote ?? null,
        })
        .where(eq(staffAbsences.id, input.absenceId));

      return { success: true };
    }),

  // ── 6. Antrag ablehnen (Admin) ────────────────────────────────────────────
  rejectAbsence: protectedProcedure
    .input(z.object({
      absenceId: z.number().int(),
      adminNote: z.string().min(5, "Bitte Ablehnungsgrund angeben").max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const [absence] = await db.select().from(staffAbsences)
        .where(and(
          eq(staffAbsences.id, input.absenceId),
          eq(staffAbsences.restaurantId, restaurantId),
        ));

      if (!absence) throw new TRPCError({ code: "NOT_FOUND", message: "Antrag nicht gefunden" });
      if (absence.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Antrag ist nicht mehr ausstehend" });
      }

      await db.update(staffAbsences)
        .set({
          status: "rejected",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
          adminNote: input.adminNote,
        })
        .where(eq(staffAbsences.id, input.absenceId));

      return { success: true };
    }),

  // ── 7. Statistiken (Admin) ────────────────────────────────────────────────
  getAbsenceStats: protectedProcedure
    .input(z.object({ year: z.number().int().min(2020).max(2100).optional() }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const year = input.year ?? new Date().getFullYear();
      const absences = await db.select().from(staffAbsences)
        .where(and(
          eq(staffAbsences.restaurantId, restaurantId),
          eq(staffAbsences.status, "approved"),
          gte(staffAbsences.startDate, `${year}-01-01`),
          lte(staffAbsences.endDate, `${year}-12-31`),
        ));

      const staffIdSet = new Set<number>(absences.map((a: typeof absences[0]) => a.staffId));
      const staffIds = Array.from(staffIdSet);
      type StaffInfo2 = { id: number; name: string | null };
      const staffList: StaffInfo2[] = staffIds.length > 0
        ? (await db.select({ id: users.id, name: users.name })
            .from(users).where(sql`${users.id} IN (${staffIds.join(",") || "0"})`)) as StaffInfo2[]
        : [];
      const staffMap = new Map<number, StaffInfo2>(staffList.map(s => [s.id, s]));

      const perStaff = staffIds.map((staffId: number) => {
        const staffAbsenceList = absences.filter((a: typeof absences[0]) => a.staffId === staffId);
        const byType: Record<string, number> = {};
        for (const a of staffAbsenceList) {
          byType[a.type] = (byType[a.type] ?? 0) + a.totalDays;
        }
        return {
          staffId,
          staffName: staffMap.get(staffId)?.name ?? "Unbekannt",
          totalDays: staffAbsenceList.reduce((s: number, a: typeof absences[0]) => s + a.totalDays, 0),
          vacationDays: byType["vacation"] ?? 0,
          sickDays: byType["sick"] ?? 0,
          otherDays: (byType["personal"] ?? 0) + (byType["unpaid"] ?? 0) + (byType["other"] ?? 0),
        };
      });

      return { year, perStaff, totalAbsenceDays: absences.reduce((s: number, a: typeof absences[0]) => s + a.totalDays, 0) };
    }),

  // ── 8. Kalenderansicht (Admin) ────────────────────────────────────────────
  getAbsenceCalendar: protectedProcedure
    .input(z.object({
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const absences = await db.select().from(staffAbsences)
        .where(and(
          eq(staffAbsences.restaurantId, restaurantId),
          sql`${staffAbsences.status} IN ('approved', 'pending')`,
          sql`NOT (${staffAbsences.endDate} < ${input.dateFrom} OR ${staffAbsences.startDate} > ${input.dateTo})`,
        )).orderBy(staffAbsences.startDate);

      const staffIdSet = new Set<number>(absences.map((a: typeof absences[0]) => a.staffId));
      const staffIds = Array.from(staffIdSet);
      type StaffInfo3 = { id: number; name: string | null; role: string };
      const staffList: StaffInfo3[] = staffIds.length > 0
        ? (await db.select({ id: users.id, name: users.name, role: users.role })
            .from(users).where(sql`${users.id} IN (${staffIds.join(",") || "0"})`)) as StaffInfo3[]
        : [];
      const staffMap = new Map<number, StaffInfo3>(staffList.map(s => [s.id, s]));

      return absences.map((a: typeof absences[0]) => ({
        ...a,
        staffName: staffMap.get(a.staffId)?.name ?? "Unbekannt",
        staffRole: staffMap.get(a.staffId)?.role ?? "kellner",
        typeLabel: ABSENCE_TYPE_LABELS[a.type] ?? a.type,
      }));
    }),
});
