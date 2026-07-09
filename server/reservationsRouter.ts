import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getReservationsByRestaurant,
  getReservationById,
  createReservation,
  updateReservation,
  deleteReservation,
  getReservationStats,
} from "./db";

// ─── Hilfsfunktion: restaurantId aus Kontext holen ───────────────────────────
function getRestaurantId(ctx: any): number {
  const rid = ctx.user?.restaurantId;
  if (!rid) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return rid;
}

// ─── Zod-Schemas ─────────────────────────────────────────────────────────────
const RESERVATION_STATUS = ["angefragt", "bestaetigt", "angekommen", "abgeschlossen", "storniert", "no_show"] as const;
const RESERVATION_SOURCE = ["telefon", "online", "walk_in", "app", "partner"] as const;

const createReservationInput = z.object({
  guestName: z.string().min(1).max(255),
  guestPhone: z.string().max(32).optional(),
  guestEmail: z.string().email().max(320).optional(),
  guestCount: z.number().int().min(1).max(500).default(2),
  tableId: z.number().int().optional(),
  reservedAt: z.string().datetime(),       // ISO-8601 String vom Frontend
  duration: z.number().int().min(15).max(480).default(90),
  notes: z.string().max(2000).optional(),
  guestNotes: z.string().max(2000).optional(),
  source: z.enum(RESERVATION_SOURCE).default("telefon"),
});

const updateReservationInput = z.object({
  id: z.number().int(),
  guestName: z.string().min(1).max(255).optional(),
  guestPhone: z.string().max(32).optional(),
  guestEmail: z.string().email().max(320).optional(),
  guestCount: z.number().int().min(1).max(500).optional(),
  tableId: z.number().int().nullable().optional(),
  reservedAt: z.string().datetime().optional(),
  duration: z.number().int().min(15).max(480).optional(),
  status: z.enum(RESERVATION_STATUS).optional(),
  notes: z.string().max(2000).optional(),
  guestNotes: z.string().max(2000).optional(),
  source: z.enum(RESERVATION_SOURCE).optional(),
});

// ─── ROUTER ──────────────────────────────────────────────────────────────────
export const reservationsRouter = router({

  /** Liste aller Reservierungen (mit optionalem Filter) */
  list: protectedProcedure
    .input(z.object({
      status: z.enum(RESERVATION_STATUS).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      return getReservationsByRestaurant(restaurantId, {
        status: input?.status,
        dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
        limit: input?.limit,
      });
    }),

  /** Einzelne Reservierung */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const reservation = await getReservationById(input.id, restaurantId);
      if (!reservation) throw new TRPCError({ code: "NOT_FOUND", message: "Reservierung nicht gefunden" });
      return reservation;
    }),

  /** Statistiken für Dashboard */
  stats: protectedProcedure
    .input(z.object({ date: z.string().datetime().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      return getReservationStats(
        restaurantId,
        input?.date ? new Date(input.date) : undefined
      );
    }),

  /** Neue Reservierung erstellen */
  create: protectedProcedure
    .input(createReservationInput)
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const id = await createReservation({
        restaurantId,
        guestName: input.guestName,
        guestPhone: input.guestPhone ?? null,
        guestEmail: input.guestEmail ?? null,
        guestCount: input.guestCount,
        tableId: input.tableId ?? null,
        reservedAt: new Date(input.reservedAt),
        duration: input.duration,
        notes: input.notes ?? null,
        guestNotes: input.guestNotes ?? null,
        source: input.source,
        createdBy: ctx.user.id,
        status: "angefragt",
      });
      return { id };
    }),

  /** Reservierung aktualisieren (inkl. Status-Änderung) */
  update: protectedProcedure
    .input(updateReservationInput)
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const { id, ...data } = input;
      const existing = await getReservationById(id, restaurantId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Reservierung nicht gefunden" });
      await updateReservation(id, restaurantId, {
        ...data,
        reservedAt: data.reservedAt ? new Date(data.reservedAt) : undefined,
        tableId: data.tableId === null ? null : (data.tableId ?? undefined),
      });
      return { success: true };
    }),

  /** Status schnell ändern (z.B. bestätigen, stornieren) */
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      status: z.enum(RESERVATION_STATUS),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const existing = await getReservationById(input.id, restaurantId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Reservierung nicht gefunden" });
      await updateReservation(input.id, restaurantId, { status: input.status });
      return { success: true };
    }),

  /** Reservierung löschen */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const existing = await getReservationById(input.id, restaurantId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Reservierung nicht gefunden" });
      await deleteReservation(input.id, restaurantId);
      return { success: true };
    }),
});
