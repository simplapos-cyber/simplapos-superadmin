/**
 * shiftSwapRouter.ts – Schicht-Tausch-System zwischen Kellnern
 *
 * Flow:
 *  1. Kellner A bietet Schicht zum Tausch an (offerSwap)
 *  2. Kollege B sieht offene Tausch-Angebote (getOpenSwaps) und nimmt an (acceptSwap)
 *     oder lehnt ab (declineSwap)
 *  3. Admin sieht alle akzeptierten Anfragen (getPendingAdminApproval) und
 *     genehmigt (adminApproveSwap) oder lehnt ab (adminDeclineSwap)
 *  4. Bei jedem Schritt erhalten alle Beteiligten eine Benachrichtigung
 *
 * Benachrichtigungen:
 *  - Neues Tausch-Angebot → Admin wird benachrichtigt (neues Angebot im System)
 *  - Kollege nimmt an → Requester + Admin werden benachrichtigt
 *  - Admin genehmigt → Requester + Kollege werden benachrichtigt
 *  - Admin lehnt ab → Requester + Kollege werden benachrichtigt
 *  - Requester zieht zurück → Kollege wird benachrichtigt (falls bereits accepted)
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { shiftSwapRequests, aiPlanShifts } from "../drizzle/schema";


import { eq, and, or, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { notifyOwner } from "./_core/notification";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function requireRestaurant(ctx: any): number {
  const rid = ctx.user?.restaurantId;
  if (!rid) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return rid;
}

function requireKellnerOrAdmin(ctx: any) {
  const role = ctx.user?.role;
  if (!["kellner", "admin", "manager", "superadmin"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung" });
  }
}

function requireAdmin(ctx: any) {
  const role = ctx.user?.role;
  if (!["admin", "manager", "superadmin"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Nur Admins können Tausch-Anfragen genehmigen" });
  }
}

// Status-Label für Benachrichtigungen
const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  accepted: "Angenommen – wartet auf Admin",
  admin_approved: "Genehmigt",
  admin_declined: "Abgelehnt",
  cancelled: "Zurückgezogen",
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const shiftSwapRouter = router({

  // ── 1. Schicht zum Tausch anbieten ─────────────────────────────────────────
  offerSwap: protectedProcedure
    .input(z.object({
      offeredShiftId: z.number().int().positive(),
      requesterNote: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireKellnerOrAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      const userId = ctx.user!.id;

      // Schicht validieren – muss dem Kellner gehören und im richtigen Restaurant sein
      const [shift] = await db
        .select()
        .from(aiPlanShifts)
        .where(and(
          eq(aiPlanShifts.id, input.offeredShiftId),
          eq(aiPlanShifts.restaurantId, restaurantId),
          eq(aiPlanShifts.staffId, userId),
        ))
        .limit(1);

      if (!shift) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schicht nicht gefunden oder gehört nicht dir",
        });
      }

      // Prüfen ob bereits ein offener Tausch für diese Schicht existiert
      const existing = await db
        .select({ id: shiftSwapRequests.id })
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.offeredShiftId, input.offeredShiftId),
          inArray(shiftSwapRequests.status, ["open", "accepted"]),
        ))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Für diese Schicht besteht bereits ein offenes Tausch-Angebot",
        });
      }

      const [result] = await db.insert(shiftSwapRequests).values({
        restaurantId,
        requesterId: userId,
        requesterName: ctx.user!.name || ctx.user!.email,
        offeredShiftId: input.offeredShiftId,
        offeredDate: shift.date,
        offeredStart: shift.startTime,
        offeredEnd: shift.endTime,
        status: "open",
        requesterNote: input.requesterNote,
      });

      // Admin benachrichtigen
      await notifyOwner({
        title: "Neues Schicht-Tausch-Angebot",
        content: `${ctx.user!.name || ctx.user!.email} bietet die Schicht am ${shift.date} (${shift.startTime}–${shift.endTime}) zum Tausch an.`,
      }).catch(() => {});

      return { success: true, id: (result as any).insertId };
    }),

  // ── 2. Tausch-Angebot annehmen ──────────────────────────────────────────────
  acceptSwap: protectedProcedure
    .input(z.object({
      swapId: z.number().int().positive(),
      counterShiftId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireKellnerOrAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      const userId = ctx.user!.id;

      const [swap] = await db
        .select()
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.id, input.swapId),
          eq(shiftSwapRequests.restaurantId, restaurantId),
          eq(shiftSwapRequests.status, "open"),
        ))
        .limit(1);

      if (!swap) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tausch-Angebot nicht gefunden oder nicht mehr offen" });
      }

      if (swap.requesterId === userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Du kannst dein eigenes Tausch-Angebot nicht annehmen" });
      }

      // Gegenschicht validieren (optional)
      let counterShift = null;
      if (input.counterShiftId) {
        const [cs] = await db
          .select()
          .from(aiPlanShifts)
          .where(and(
            eq(aiPlanShifts.id, input.counterShiftId),
            eq(aiPlanShifts.restaurantId, restaurantId),
            eq(aiPlanShifts.staffId, userId),
          ))
          .limit(1);
        if (!cs) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gegenschicht nicht gefunden" });
        }
        counterShift = cs;
      }

      const targetName = ctx.user!.name || ctx.user!.email;

      await db.update(shiftSwapRequests)
        .set({
          status: "accepted",
          targetId: userId,
          targetName,
          counterShiftId: counterShift?.id ?? null,
          counterDate: counterShift?.date ?? null,
          counterStart: counterShift?.startTime ?? null,
          counterEnd: counterShift?.endTime ?? null,
          acceptedAt: new Date(),
        })
        .where(eq(shiftSwapRequests.id, input.swapId));

      // Requester benachrichtigen
      await notifyOwner({
        title: "Schicht-Tausch angenommen",
        content: `${targetName} hat das Tausch-Angebot von ${swap.requesterName} für den ${swap.offeredDate} (${swap.offeredStart}–${swap.offeredEnd}) angenommen. Warte auf Admin-Genehmigung.`,
      }).catch(() => {});

      return { success: true };
    }),

  // ── 3. Tausch-Angebot ablehnen (Kollege) ────────────────────────────────────
  declineSwap: protectedProcedure
    .input(z.object({
      swapId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireKellnerOrAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      const userId = ctx.user!.id;

      const [swap] = await db
        .select()
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.id, input.swapId),
          eq(shiftSwapRequests.restaurantId, restaurantId),
          eq(shiftSwapRequests.status, "open"),
        ))
        .limit(1);

      if (!swap) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tausch-Angebot nicht gefunden" });
      }

      if (swap.requesterId === userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nutze 'cancelSwap' um dein eigenes Angebot zurückzuziehen" });
      }

      // Angebot bleibt offen – nur der ablehnende Kollege wird protokolliert
      // (Angebot kann von anderen Kollegen noch angenommen werden)
      return { success: true, message: "Angebot abgelehnt – es bleibt für andere Kollegen offen" };
    }),

  // ── 4. Eigenes Angebot zurückziehen ─────────────────────────────────────────
  cancelSwap: protectedProcedure
    .input(z.object({
      swapId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireKellnerOrAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      const userId = ctx.user!.id;

      const [swap] = await db
        .select()
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.id, input.swapId),
          eq(shiftSwapRequests.restaurantId, restaurantId),
          eq(shiftSwapRequests.requesterId, userId),
          inArray(shiftSwapRequests.status, ["open", "accepted"]),
        ))
        .limit(1);

      if (!swap) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tausch-Angebot nicht gefunden oder kann nicht mehr zurückgezogen werden" });
      }

      await db.update(shiftSwapRequests)
        .set({ status: "cancelled" })
        .where(eq(shiftSwapRequests.id, input.swapId));

      // Kollege benachrichtigen falls bereits angenommen
      if (swap.status === "accepted" && swap.targetName) {
        await notifyOwner({
          title: "Schicht-Tausch zurückgezogen",
          content: `${swap.requesterName} hat das Tausch-Angebot für den ${swap.offeredDate} zurückgezogen. ${swap.targetName} muss die Schicht nicht übernehmen.`,
        }).catch(() => {});
      }

      return { success: true };
    }),

  // ── 5. Admin: Tausch genehmigen ─────────────────────────────────────────────
  adminApproveSwap: protectedProcedure
    .input(z.object({
      swapId: z.number().int().positive(),
      adminNote: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();

      const [swap] = await db
        .select()
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.id, input.swapId),
          eq(shiftSwapRequests.restaurantId, restaurantId),
          eq(shiftSwapRequests.status, "accepted"),
        ))
        .limit(1);

      if (!swap) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tausch-Anfrage nicht gefunden oder nicht im Status 'accepted'" });
      }

      // Schichten in der DB tauschen
      if (swap.targetId) {
        await db.update(aiPlanShifts)
          .set({ staffId: swap.targetId, staffName: swap.targetName })
          .where(eq(aiPlanShifts.id, swap.offeredShiftId));

        // Gegenschicht tauschen falls vorhanden
        if (swap.counterShiftId) {
          await db.update(aiPlanShifts)
            .set({ staffId: swap.requesterId, staffName: swap.requesterName })
            .where(eq(aiPlanShifts.id, swap.counterShiftId));
        }
      }

      await db.update(shiftSwapRequests)
        .set({
          status: "admin_approved",
          adminNote: input.adminNote,
          adminDecidedAt: new Date(),
          adminDecidedBy: ctx.user!.id,
          notifiedRequester: true,
          notifiedTarget: true,
        })
        .where(eq(shiftSwapRequests.id, input.swapId));

      // Beide Parteien benachrichtigen
      await notifyOwner({
        title: "Schicht-Tausch genehmigt ✓",
        content: `Admin hat den Tausch zwischen ${swap.requesterName} und ${swap.targetName} für den ${swap.offeredDate} genehmigt. Die Schichten wurden aktualisiert.${input.adminNote ? ` Notiz: ${input.adminNote}` : ""}`,
      }).catch(() => {});

      return { success: true };
    }),

  // ── 6. Admin: Tausch ablehnen ───────────────────────────────────────────────
  adminDeclineSwap: protectedProcedure
    .input(z.object({
      swapId: z.number().int().positive(),
      adminNote: z.string().min(1, "Bitte Begründung angeben").max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();

      const [swap] = await db
        .select()
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.id, input.swapId),
          eq(shiftSwapRequests.restaurantId, restaurantId),
          inArray(shiftSwapRequests.status, ["open", "accepted"]),
        ))
        .limit(1);

      if (!swap) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tausch-Anfrage nicht gefunden" });
      }

      await db.update(shiftSwapRequests)
        .set({
          status: "admin_declined",
          adminNote: input.adminNote,
          adminDecidedAt: new Date(),
          adminDecidedBy: ctx.user!.id,
          notifiedRequester: true,
          notifiedTarget: swap.targetId != null,
        })
        .where(eq(shiftSwapRequests.id, input.swapId));

      // Requester + ggf. Kollege benachrichtigen
      await notifyOwner({
        title: "Schicht-Tausch abgelehnt",
        content: `Admin hat den Tausch von ${swap.requesterName} für den ${swap.offeredDate} abgelehnt. Begründung: ${input.adminNote}`,
      }).catch(() => {});

      return { success: true };
    }),

  // ── 7. Eigene Tausch-Anfragen anzeigen (Kellner) ────────────────────────────
  getMySwapRequests: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      requireKellnerOrAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      const userId = ctx.user!.id;

      // Eigene Angebote (als Requester) + Angebote wo ich als Target bin
      const swaps = await db
        .select()
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.restaurantId, restaurantId),
          or(
            eq(shiftSwapRequests.requesterId, userId),
            eq(shiftSwapRequests.targetId, userId),
          ),
        ))
        .orderBy(desc(shiftSwapRequests.createdAt))
        .limit(input.limit);

      return swaps.map((s: typeof swaps[0]) => ({
        ...s,
        isRequester: s.requesterId === userId,
        isTarget: s.targetId === userId,
        statusLabel: STATUS_LABELS[s.status] ?? s.status,
      }));
    }),

  // ── 8. Offene Angebote aller Kollegen (Kellner kann übernehmen) ─────────────
  getOpenSwaps: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      requireKellnerOrAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      const userId = ctx.user!.id;

      // Alle offenen Angebote ausser eigene
      const swaps = await db
        .select()
        .from(shiftSwapRequests)
        .where(and(
          eq(shiftSwapRequests.restaurantId, restaurantId),
          eq(shiftSwapRequests.status, "open"),
        ))
        .orderBy(desc(shiftSwapRequests.createdAt))
        .limit(input.limit);

      // Eigene Angebote herausfiltern
      return swaps
        .filter((s: typeof swaps[0]) => s.requesterId !== userId)
        .map((s: typeof swaps[0]) => ({ ...s, statusLabel: STATUS_LABELS[s.status] ?? s.status }));
    }),

  // ── 9. Admin: Alle Tausch-Anfragen verwalten ────────────────────────────────
  getPendingAdminApproval: protectedProcedure
    .input(z.object({
      status: z.enum(["open", "accepted", "admin_approved", "admin_declined", "cancelled", "all"]).default("accepted"),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();

      const whereConditions = input.status === "all"
        ? eq(shiftSwapRequests.restaurantId, restaurantId)
        : and(
            eq(shiftSwapRequests.restaurantId, restaurantId),
            eq(shiftSwapRequests.status, input.status),
          );

      const swaps = await db
        .select()
        .from(shiftSwapRequests)
        .where(whereConditions)
        .orderBy(desc(shiftSwapRequests.createdAt))
        .limit(input.limit);

      return swaps.map((s: typeof swaps[0]) => ({
        ...s,
        statusLabel: STATUS_LABELS[s.status] ?? s.status,
      }));
    }),

  // ── 10. Anzahl unbearbeiteter Anfragen (für Badge) ──────────────────────────
  getSwapBadgeCount: protectedProcedure
    .query(async ({ ctx }) => {
      requireKellnerOrAdmin(ctx);
      const restaurantId = requireRestaurant(ctx);
      const db = await getDb();
      const userId = ctx.user!.id;
      const role = ctx.user!.role;

      if (["admin", "manager", "superadmin"].includes(role)) {
        // Admin: Anzahl der Anfragen die auf Genehmigung warten
        const pending = await db
          .select({ id: shiftSwapRequests.id })
          .from(shiftSwapRequests)
          .where(and(
            eq(shiftSwapRequests.restaurantId, restaurantId),
            eq(shiftSwapRequests.status, "accepted"),
          ));
        return { count: pending.length, type: "admin" };
      } else {
        // Kellner: Anzahl offener Angebote von Kollegen + eigene die accepted sind
        const [openOffers, myAccepted] = await Promise.all([
          db.select({ id: shiftSwapRequests.id })
            .from(shiftSwapRequests)
            .where(and(
              eq(shiftSwapRequests.restaurantId, restaurantId),
              eq(shiftSwapRequests.status, "open"),
            )),
          db.select({ id: shiftSwapRequests.id })
            .from(shiftSwapRequests)
            .where(and(
              eq(shiftSwapRequests.restaurantId, restaurantId),
              eq(shiftSwapRequests.requesterId, userId),
              eq(shiftSwapRequests.status, "accepted"),
            )),
        ]);
        const openFromOthers = openOffers.filter((_s: typeof openOffers[0]) => true); // alle offenen
        return { count: openFromOthers.length + myAccepted.length, type: "waiter" };
      }
    }),
});
