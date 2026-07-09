/**
 * newModulesRouter.ts
 * tRPC-Prozeduren für die 5 neuen Module:
 * - kassenbuch (Kassenbuch & Tagesabschluss)
 * - steuerexport (Steuerberater-Export)
 * - allergene (Nährwerte)
 * - multilang_menu (Kategorie-Übersetzungen)
 * - bewertungsmanagement (Externe Bewertungen)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  cashbookEntries,
  dailyClosings,
  menuItemNutrition,
  menuCategoryTranslations,
  menuItemTranslations,
  externalReviews,
} from "../drizzle/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";

// ─── Helper: Tenant-Check ─────────────────────────────────────────────────────
function assertTenant(userRestaurantId: number | null | undefined, inputRestaurantId: number, userRole: string) {
  if (userRole === "superadmin" || userRole === "admin") return; // Superadmin/Admin: voller Zugriff
  if (!userRestaurantId || userRestaurantId !== inputRestaurantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf dieses Restaurant" });
  }
}

// ─── KASSENBUCH-ROUTER ────────────────────────────────────────────────────────
export const kassenbuchRouter = router({
  listEntries: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      from: z.string().optional(),
      to: z.string().optional(),
      type: z.enum(["einnahme", "ausgabe", "kassensturz"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const conditions = [eq(cashbookEntries.restaurantId, input.restaurantId)];
      if (input.from) conditions.push(gte(cashbookEntries.entryDate, new Date(input.from)));
      if (input.to) conditions.push(lte(cashbookEntries.entryDate, new Date(input.to)));
      if (input.type) conditions.push(eq(cashbookEntries.type, input.type));
      return db.select().from(cashbookEntries).where(and(...conditions)).orderBy(desc(cashbookEntries.entryDate));
    }),

  createEntry: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      entryDate: z.string(),
      type: z.enum(["einnahme", "ausgabe", "kassensturz"]),
      amount: z.string(),
      description: z.string().min(1).max(500),
      category: z.string().optional(),
      taxRate: z.string().optional(),
      receiptNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const [result] = await db.insert(cashbookEntries).values({
        restaurantId: input.restaurantId,
        entryDate: new Date(input.entryDate),
        type: input.type,
        amount: input.amount,
        description: input.description,
        category: input.category,
        taxRate: input.taxRate,
        receiptNumber: input.receiptNumber,
        staffId: ctx.effectiveUserId!,
        notes: input.notes,
      });
      return { id: (result as any).insertId };
    }),

  updateEntry: protectedProcedure
    .input(z.object({
      id: z.number(),
      restaurantId: z.number(),
      description: z.string().min(1).max(500).optional(),
      amount: z.string().optional(),
      category: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const { id, restaurantId, ...updates } = input;
      await db.update(cashbookEntries)
        .set(updates)
        .where(and(eq(cashbookEntries.id, id), eq(cashbookEntries.restaurantId, restaurantId)));
      return { success: true };
    }),

  deleteEntry: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      await db.delete(cashbookEntries)
        .where(and(eq(cashbookEntries.id, input.id), eq(cashbookEntries.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  // Tagesabschlüsse
  listClosings: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      return db.select().from(dailyClosings)
        .where(eq(dailyClosings.restaurantId, input.restaurantId))
        .orderBy(desc(dailyClosings.closingDate))
        .limit(90);
    }),

  createClosing: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      closingDate: z.string(),
      cashStart: z.string().default("0"),
      cashEnd: z.string().default("0"),
      totalRevenue: z.string().default("0"),
      totalCash: z.string().default("0"),
      totalCard: z.string().default("0"),
      totalTwint: z.string().default("0"),
      totalOther: z.string().default("0"),
      totalTax: z.string().default("0"),
      totalTips: z.string().default("0"),
      totalOrders: z.number().default(0),
      totalGuests: z.number().default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const cashDiff = (parseFloat(input.cashEnd) - parseFloat(input.cashStart)).toFixed(2);
      const [result] = await db.insert(dailyClosings).values({
        restaurantId: input.restaurantId,
        closingDate: new Date(input.closingDate),
        staffId: ctx.effectiveUserId!,
        cashStart: input.cashStart,
        cashEnd: input.cashEnd,
        cashDifference: cashDiff,
        totalRevenue: input.totalRevenue,
        totalCash: input.totalCash,
        totalCard: input.totalCard,
        totalTwint: input.totalTwint,
        totalOther: input.totalOther,
        totalTax: input.totalTax,
        totalTips: input.totalTips,
        totalOrders: input.totalOrders,
        totalGuests: input.totalGuests,
        notes: input.notes,
        status: "abgeschlossen",
      });
      return { id: (result as any).insertId };
    }),
});

// ─── STEUEREXPORT-ROUTER ──────────────────────────────────────────────────────
export const steuerexportRouter = router({
  // Gibt alle Kassenbuch-Einträge und Tagesabschlüsse als strukturierte Daten zurück
  // Frontend kann daraus CSV/DATEV generieren
  exportData: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      from: z.string(),
      to: z.string(),
      format: z.enum(["csv", "datev"]).default("csv"),
    }))
    .query(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const entries = await db.select().from(cashbookEntries)
        .where(and(
          eq(cashbookEntries.restaurantId, input.restaurantId),
          gte(cashbookEntries.entryDate, new Date(input.from)),
          lte(cashbookEntries.entryDate, new Date(input.to)),
        ))
        .orderBy(cashbookEntries.entryDate);
      const closings = await db.select().from(dailyClosings)
        .where(and(
          eq(dailyClosings.restaurantId, input.restaurantId),
          gte(dailyClosings.closingDate, new Date(input.from)),
          lte(dailyClosings.closingDate, new Date(input.to)),
        ))
        .orderBy(dailyClosings.closingDate);
      return { entries, closings, format: input.format };
    }),
});

// ─── NÄHRWERTE-ROUTER (Modul: allergene) ─────────────────────────────────────
export const nutritionRouter = router({
  getByMenuItem: protectedProcedure
    .input(z.object({ menuItemId: z.number(), restaurantId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const [row] = await db.select().from(menuItemNutrition)
        .where(and(
          eq(menuItemNutrition.menuItemId, input.menuItemId),
          eq(menuItemNutrition.restaurantId, input.restaurantId),
        ));
      return row ?? null;
    }),

  upsert: protectedProcedure
    .input(z.object({
      menuItemId: z.number(),
      restaurantId: z.number(),
      servingSize: z.string().optional(),
      calories: z.string().optional(),
      protein: z.string().optional(),
      carbohydrates: z.string().optional(),
      sugar: z.string().optional(),
      fat: z.string().optional(),
      saturatedFat: z.string().optional(),
      fiber: z.string().optional(),
      salt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const existing = await db.select({ id: menuItemNutrition.id }).from(menuItemNutrition)
        .where(and(
          eq(menuItemNutrition.menuItemId, input.menuItemId),
          eq(menuItemNutrition.restaurantId, input.restaurantId),
        ));
      const { menuItemId, restaurantId, ...fields } = input;
      if (existing.length > 0) {
        await db.update(menuItemNutrition).set(fields).where(eq(menuItemNutrition.id, existing[0].id));
        return { id: existing[0].id };
      } else {
        const [result] = await db.insert(menuItemNutrition).values({ menuItemId, restaurantId, ...fields });
        return { id: (result as any).insertId };
      }
    }),
});

// ─── MEHRSPRACHIGE SPEISEKARTE (Modul: multilang_menu) ───────────────────────
export const multilangMenuRouter = router({
  getCategoryTranslations: protectedProcedure
    .input(z.object({ restaurantId: z.number(), categoryId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      return db.select().from(menuCategoryTranslations)
        .where(and(
          eq(menuCategoryTranslations.categoryId, input.categoryId),
          eq(menuCategoryTranslations.restaurantId, input.restaurantId),
        ));
    }),

  upsertCategoryTranslation: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      categoryId: z.number(),
      lang: z.enum(["de", "fr", "en", "it"]),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const existing = await db.select({ id: menuCategoryTranslations.id })
        .from(menuCategoryTranslations)
        .where(and(
          eq(menuCategoryTranslations.categoryId, input.categoryId),
          eq(menuCategoryTranslations.restaurantId, input.restaurantId),
          eq(menuCategoryTranslations.lang, input.lang),
        ));
      const { restaurantId, categoryId, lang, ...fields } = input;
      if (existing.length > 0) {
        await db.update(menuCategoryTranslations).set(fields).where(eq(menuCategoryTranslations.id, existing[0].id));
        return { id: existing[0].id };
      } else {
        const [result] = await db.insert(menuCategoryTranslations).values({ restaurantId, categoryId, lang, ...fields });
        return { id: (result as any).insertId };
      }
    }),

  getItemTranslations: protectedProcedure
    .input(z.object({ restaurantId: z.number(), menuItemId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      return db.select().from(menuItemTranslations)
        .where(and(
          eq(menuItemTranslations.menuItemId, input.menuItemId),
          eq(menuItemTranslations.restaurantId, input.restaurantId),
        ));
    }),

  upsertItemTranslation: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      menuItemId: z.number(),
      lang: z.enum(["de", "fr", "en", "it"]),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const existing = await db.select({ id: menuItemTranslations.id })
        .from(menuItemTranslations)
        .where(and(
          eq(menuItemTranslations.menuItemId, input.menuItemId),
          eq(menuItemTranslations.restaurantId, input.restaurantId),
          eq(menuItemTranslations.lang, input.lang),
        ));
      const { restaurantId, menuItemId, lang, ...fields } = input;
      if (existing.length > 0) {
        await db.update(menuItemTranslations).set(fields).where(eq(menuItemTranslations.id, existing[0].id));
        return { id: existing[0].id };
      } else {
        const [result] = await db.insert(menuItemTranslations).values({ restaurantId, menuItemId, lang, ...fields });
        return { id: (result as any).insertId };
      }
    }),
});

// ─── BEWERTUNGSMANAGEMENT-ROUTER ──────────────────────────────────────────────
export const bewertungsRouter = router({
  list: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      platform: z.enum(["google", "tripadvisor", "yelp", "other"]).optional(),
      status: z.enum(["neu", "gelesen", "beantwortet", "archiviert"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const conditions = [eq(externalReviews.restaurantId, input.restaurantId)];
      if (input.platform) conditions.push(eq(externalReviews.platform, input.platform));
      if (input.status) conditions.push(eq(externalReviews.status, input.status));
      return db.select().from(externalReviews).where(and(...conditions)).orderBy(desc(externalReviews.reviewDate));
    }),

  create: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      platform: z.enum(["google", "tripadvisor", "yelp", "other"]),
      authorName: z.string().optional(),
      rating: z.string(),
      reviewText: z.string().optional(),
      reviewDate: z.string(),
      externalId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const [result] = await db.insert(externalReviews).values({
        restaurantId: input.restaurantId,
        platform: input.platform,
        authorName: input.authorName,
        rating: input.rating,
        reviewText: input.reviewText,
        reviewDate: new Date(input.reviewDate),
        externalId: input.externalId,
        status: "neu",
      });
      return { id: (result as any).insertId };
    }),

  respond: protectedProcedure
    .input(z.object({
      id: z.number(),
      restaurantId: z.number(),
      responseText: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      await db.update(externalReviews)
        .set({
          responseText: input.responseText,
          responseDate: new Date(),
          status: "beantwortet",
        })
        .where(and(eq(externalReviews.id, input.id), eq(externalReviews.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      restaurantId: z.number(),
      status: z.enum(["neu", "gelesen", "beantwortet", "archiviert"]),
    }))
    .mutation(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      await db.update(externalReviews)
        .set({ status: input.status })
        .where(and(eq(externalReviews.id, input.id), eq(externalReviews.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  stats: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertTenant(ctx.user.restaurantId, input.restaurantId, ctx.user.role);
      const db = await getDb();
      const all = await db.select({
        rating: externalReviews.rating,
        platform: externalReviews.platform,
        status: externalReviews.status,
      }).from(externalReviews).where(eq(externalReviews.restaurantId, input.restaurantId));
      const total = all.length;
      const avgRating = total > 0
        ? (all.reduce((s: number, r: typeof all[0]) => s + parseFloat(r.rating ?? "0"), 0) / total).toFixed(1)
        : "0.0";
      const byPlatform = all.reduce((acc: Record<string, number>, r: typeof all[0]) => {
        acc[r.platform] = (acc[r.platform] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const unread = all.filter((r: typeof all[0]) => r.status === "neu").length;
      return { total, avgRating, byPlatform, unread };
    }),
});
