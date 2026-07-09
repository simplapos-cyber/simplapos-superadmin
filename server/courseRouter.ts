/**
 * courseRouter – Gang-Konfiguration pro Restaurant
 *
 * Ermöglicht Admins, eigene Gang-Namen und Reihenfolge zu definieren.
 * Standardgänge werden beim ersten Aufruf automatisch erstellt.
 */
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { restaurantCourses } from "../drizzle/schema";

const DEFAULT_COURSES = [
  { courseNumber: 1, name: "Vorspeise", sortOrder: 1 },
  { courseNumber: 2, name: "Hauptgang", sortOrder: 2 },
  { courseNumber: 3, name: "Dessert", sortOrder: 3 },
  { courseNumber: 4, name: "Getränk", sortOrder: 4 },
  { courseNumber: 5, name: "Snack", sortOrder: 5 },
];

async function getDbAndRestaurant(ctx: { user: { id: number; role: string; restaurantId?: number | null } }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Datenbank nicht verfügbar" });
  const restaurantId = ctx.user.restaurantId;
  if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return { db, restaurantId };
}

export const courseRouter = router({
  // ─── LIST: Alle Gänge des Restaurants laden ──────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);
    let courses = await db
      .select()
      .from(restaurantCourses)
      .where(eq(restaurantCourses.restaurantId, restaurantId))
      .orderBy(asc(restaurantCourses.sortOrder));

    // Standardgänge beim ersten Aufruf anlegen
    if (courses.length === 0) {
      await db.insert(restaurantCourses).values(
        DEFAULT_COURSES.map(c => ({ ...c, restaurantId }))
      );
      courses = await db
        .select()
        .from(restaurantCourses)
        .where(eq(restaurantCourses.restaurantId, restaurantId))
        .orderBy(asc(restaurantCourses.sortOrder));
    }
    return courses;
  }),

  // ─── UPSERT: Gang erstellen oder aktualisieren ───────────────────────────
  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      courseNumber: z.number().min(1).max(20),
      name: z.string().min(1).max(100),
      sortOrder: z.number().min(0),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      if (input.id) {
        // Update
        const [existing] = await db.select().from(restaurantCourses).where(
          and(eq(restaurantCourses.id, input.id), eq(restaurantCourses.restaurantId, restaurantId))
        );
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        await db.update(restaurantCourses)
          .set({ name: input.name, sortOrder: input.sortOrder, isActive: input.isActive, courseNumber: input.courseNumber })
          .where(eq(restaurantCourses.id, input.id));
        return { success: true };
      } else {
        // Insert
        await db.insert(restaurantCourses).values({
          restaurantId,
          courseNumber: input.courseNumber,
          name: input.name,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        });
        return { success: true };
      }
    }),

  // ─── DELETE: Gang löschen ────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [existing] = await db.select().from(restaurantCourses).where(
        and(eq(restaurantCourses.id, input.id), eq(restaurantCourses.restaurantId, restaurantId))
      );
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(restaurantCourses).where(eq(restaurantCourses.id, input.id));
      return { success: true };
    }),

  // ─── REORDER: Reihenfolge aktualisieren ─────────────────────────────────
  reorder: protectedProcedure
    .input(z.object({
      items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      for (const item of input.items) {
        await db.update(restaurantCourses)
          .set({ sortOrder: item.sortOrder })
          .where(and(
            eq(restaurantCourses.id, item.id),
            eq(restaurantCourses.restaurantId, restaurantId),
          ));
      }
      return { success: true };
    }),
});
