import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  menuCategories, menuItems, menuModifierGroups, menuModifiers,
  menuItemVariantGroups, menuItemVariantOptions, menuItemModifierGroups,
  menuSets, menuSetCourses, menuTaxClasses, menuTopCategories,
} from "../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function requireRestaurant(ctx: { user: { restaurantId?: number | null; role: string } }): number {
  const restaurantId = ctx.user.restaurantId;
  if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return restaurantId;
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const menuRouter = router({

  // ── TAX CLASSES ────────────────────────────────────────────────────────────

  listTaxClasses: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    return db.select().from(menuTaxClasses)
      .where(eq(menuTaxClasses.restaurantId, restaurantId))
      .orderBy(asc(menuTaxClasses.name));
  }),

  upsertTaxClass: protectedProcedure.input(z.object({
    id: z.number().optional(),
    name: z.string().min(1).max(128),
    rate: z.string(),
    isDefault: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    if (input.id) {
      await db.update(menuTaxClasses).set({ name: input.name, rate: input.rate, isDefault: input.isDefault ?? false })
        .where(and(eq(menuTaxClasses.id, input.id), eq(menuTaxClasses.restaurantId, restaurantId)));
      return { id: input.id };
    }
    const [result] = await db.insert(menuTaxClasses).values({ restaurantId, name: input.name, rate: input.rate, isDefault: input.isDefault ?? false });
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteTaxClass: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    await db.delete(menuTaxClasses).where(and(eq(menuTaxClasses.id, input.id), eq(menuTaxClasses.restaurantId, restaurantId)));
    return { ok: true };
  }),

  // ── CATEGORIES ─────────────────────────────────────────────────────────────

  listCategories: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    return db.select().from(menuCategories)
      .where(eq(menuCategories.restaurantId, restaurantId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));
  }),

  upsertCategory: protectedProcedure.input(z.object({
    id: z.number().optional(),
    parentId: z.number().nullable().optional(),
    topCategoryId: z.number().nullable().optional(),
    name: z.string().min(1).max(128),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    sortOrder: z.number().optional(),
    isActive: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    availabilityType: z.enum(["always", "scheduled", "manual"]).optional(),
    availabilitySchedule: z.any().optional(),
    defaultCourseNumber: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = {
      restaurantId,
      parentId: input.parentId ?? null,
      topCategoryId: input.topCategoryId ?? null,
      name: input.name,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      isVisible: input.isVisible ?? true,
      availabilityType: (input.availabilityType ?? "always") as "always" | "scheduled" | "manual",
      availabilitySchedule: input.availabilitySchedule ?? null,
      defaultCourseNumber: input.defaultCourseNumber ?? 1,
    } as any;
    if (input.id) {
      await db.update(menuCategories).set(data).where(and(eq(menuCategories.id, input.id), eq(menuCategories.restaurantId, restaurantId)));
      return { id: input.id };
    }
    const [result] = await db.insert(menuCategories).values(data);
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteCategory: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    await db.delete(menuCategories).where(and(eq(menuCategories.id, input.id), eq(menuCategories.restaurantId, restaurantId)));
    return { ok: true };
  }),

  reorderCategories: protectedProcedure.input(z.array(z.object({ id: z.number(), sortOrder: z.number() }))).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    for (const item of input) {
      await db.update(menuCategories).set({ sortOrder: item.sortOrder })
        .where(and(eq(menuCategories.id, item.id), eq(menuCategories.restaurantId, restaurantId)));
    }
    return { ok: true };
  }),

  // ── MENU ITEMS ─────────────────────────────────────────────────────────────

  listItems: protectedProcedure.input(z.object({
    categoryId: z.number().optional(),
    search: z.string().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    if (input?.categoryId) {
      return db.select().from(menuItems)
        .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.categoryId, input.categoryId)))
        .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));
    }
    return db.select().from(menuItems)
      .where(eq(menuItems.restaurantId, restaurantId))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));
  }),

  getItem: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const rows: unknown[] = await db.select().from(menuItems)
      .where(and(eq(menuItems.id, input.id), eq(menuItems.restaurantId, restaurantId)));
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    const item = rows[0];

    const variantGroups: unknown[] = await db.select().from(menuItemVariantGroups)
      .where(eq(menuItemVariantGroups.menuItemId, input.id))
      .orderBy(asc(menuItemVariantGroups.sortOrder));

    const variantOptions: unknown[] = await db.select().from(menuItemVariantOptions)
      .where(eq(menuItemVariantOptions.menuItemId, input.id))
      .orderBy(asc(menuItemVariantOptions.sortOrder));

    const modifierLinks: unknown[] = await db.select().from(menuItemModifierGroups)
      .where(eq(menuItemModifierGroups.menuItemId, input.id))
      .orderBy(asc(menuItemModifierGroups.sortOrder));

    return { ...(item as object), variantGroups, variantOptions, modifierLinks };
  }),

  upsertItem: protectedProcedure.input(z.object({
    id: z.number().optional(),
    categoryId: z.number().nullable().optional(),
    taxClassId: z.number().nullable().optional(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    sku: z.string().optional(),
    articleNumber: z.string().optional(),
    price: z.string(),
    priceType: z.enum(["fixed", "variable", "from"]).optional(),
    costPrice: z.string().optional(),
    imageUrl: z.string().optional(),
    itemType: z.enum(["food", "beverage", "dessert", "set_menu", "other"]).optional(),
    courseNumber: z.number().optional(),
    allergens: z.any().optional(),
    labels: z.any().optional(),
    isActive: z.boolean().optional(),
    isAvailable: z.boolean().optional(),
    availabilityType: z.enum(["always", "scheduled", "manual"]).optional(),
    availabilitySchedule: z.any().optional(),
    preparationTime: z.number().optional(),
    kitchenStation: z.string().optional(),
    kdsNote: z.string().optional(),
    sortOrder: z.number().optional(),
    modifierGroupIds: z.array(z.number()).optional(),
    // Nährwerte
    nutritionPer: z.enum(["100g", "portion"]).optional(),
    calories: z.string().optional(),
    protein: z.string().optional(),
    fat: z.string().optional(),
    saturatedFat: z.string().optional(),
    carbs: z.string().optional(),
    sugar: z.string().optional(),
    fiber: z.string().optional(),
    salt: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = {
      restaurantId,
      categoryId: input.categoryId ?? null,
      taxClassId: input.taxClassId ?? null,
      name: input.name,
      nameTranslations: null,
      description: input.description ?? null,
      descriptionTranslations: null,
      shortDescription: input.shortDescription ?? null,
      sku: input.sku ?? null,
      articleNumber: input.articleNumber ?? null,
      price: input.price,
      priceType: (input.priceType ?? "fixed") as "fixed" | "variable" | "from",
      costPrice: input.costPrice ?? null,
      imageUrl: input.imageUrl ?? null,
      itemType: (input.itemType ?? "food") as "food" | "beverage" | "dessert" | "set_menu" | "other",
      courseNumber: input.courseNumber ?? 1,
      allergens: input.allergens ?? null,
      labels: input.labels ?? null,
      isActive: input.isActive ?? true,
      isAvailable: input.isAvailable ?? true,
      availabilityType: (input.availabilityType ?? "always") as "always" | "scheduled" | "manual",
      availabilitySchedule: input.availabilitySchedule ?? null,
      preparationTime: input.preparationTime ?? null,
      kitchenStation: input.kitchenStation ?? null,
      kdsNote: input.kdsNote ?? null,
      sortOrder: input.sortOrder ?? 0,
      // Nährwerte
      nutritionPer: (input.nutritionPer ?? "100g") as "100g" | "portion",
      calories: input.calories ?? null,
      protein: input.protein ?? null,
      fat: input.fat ?? null,
      saturatedFat: input.saturatedFat ?? null,
      carbs: input.carbs ?? null,
      sugar: input.sugar ?? null,
      fiber: input.fiber ?? null,
      salt: input.salt ?? null,
    };
    let itemId: number;
    if (input.id) {
      await db.update(menuItems).set(data).where(and(eq(menuItems.id, input.id), eq(menuItems.restaurantId, restaurantId)));
      itemId = input.id;
    } else {
      const [result] = await db.insert(menuItems).values(data);
      itemId = (result as { insertId: number }).insertId;
    }
    // Modifier-Gruppen-Verknüpfung synchronisieren
    if (input.modifierGroupIds !== undefined) {
      await db.delete(menuItemModifierGroups).where(eq(menuItemModifierGroups.menuItemId, itemId));
      if (input.modifierGroupIds.length > 0) {
        await db.insert(menuItemModifierGroups).values(
          input.modifierGroupIds.map((gid, idx) => ({ menuItemId: itemId, modifierGroupId: gid, sortOrder: idx }))
        );
      }
    }
    return { id: itemId };
  }),

  duplicateItem: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const rows: unknown[] = await db.select().from(menuItems)
      .where(and(eq(menuItems.id, input.id), eq(menuItems.restaurantId, restaurantId)));
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    const original = rows[0] as Record<string, unknown>;
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = original;
    const [result] = await db.insert(menuItems).values({ ...rest, name: `${original["name"]} (Kopie)`, restaurantId } as Parameters<typeof db.insert>[1] extends (infer T)[] ? T : never);
    return { id: (result as { insertId: number }).insertId };
  }),

  importCsv: protectedProcedure.input(z.object({
    rows: z.array(z.object({
      name: z.string(),
      price: z.string(),
      categoryName: z.string().optional(),
      description: z.string().optional(),
    })),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    let created = 0;
    for (const row of input.rows) {
      await db.insert(menuItems).values({
        restaurantId,
        name: row.name,
        price: row.price,
        description: row.description ?? null,
        priceType: "fixed",
        itemType: "food",
        isActive: true,
        isAvailable: true,
        availabilityType: "always",
        sortOrder: 0,
      });
      created++;
    }
    return { created, skipped: 0 };
  }),

  deleteItem: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    await db.delete(menuItems).where(and(eq(menuItems.id, input.id), eq(menuItems.restaurantId, restaurantId)));
    return { ok: true };
  }),

  toggleAvailability: protectedProcedure.input(z.object({ id: z.number(), isAvailable: z.boolean() })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    await db.update(menuItems).set({ isAvailable: input.isAvailable })
      .where(and(eq(menuItems.id, input.id), eq(menuItems.restaurantId, restaurantId)));
    return { ok: true };
  }),

  reorderItems: protectedProcedure.input(z.array(z.object({ id: z.number(), sortOrder: z.number() }))).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    for (const item of input) {
      await db.update(menuItems).set({ sortOrder: item.sortOrder })
        .where(and(eq(menuItems.id, item.id), eq(menuItems.restaurantId, restaurantId)));
    }
    return { ok: true };
  }),

  // ── VARIANT GROUPS ─────────────────────────────────────────────────────────

  upsertVariantGroup: protectedProcedure.input(z.object({
    id: z.number().optional(),
    menuItemId: z.number(),
    name: z.string().min(1).max(128),
    isRequired: z.boolean().optional(),
    sortOrder: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = { menuItemId: input.menuItemId, restaurantId, name: input.name, isRequired: input.isRequired ?? true, sortOrder: input.sortOrder ?? 0 };
    if (input.id) {
      await db.update(menuItemVariantGroups).set(data).where(eq(menuItemVariantGroups.id, input.id));
      return { id: input.id };
    }
    const [result] = await db.insert(menuItemVariantGroups).values(data);
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteVariantGroup: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    await db.delete(menuItemVariantOptions).where(eq(menuItemVariantOptions.variantGroupId, input.id));
    await db.delete(menuItemVariantGroups).where(eq(menuItemVariantGroups.id, input.id));
    return { ok: true };
  }),

  upsertVariantOption: protectedProcedure.input(z.object({
    id: z.number().optional(),
    variantGroupId: z.number(),
    menuItemId: z.number(),
    name: z.string().min(1).max(128),
    priceAdjustment: z.string().optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = {
      variantGroupId: input.variantGroupId, menuItemId: input.menuItemId, restaurantId,
      name: input.name, priceAdjustment: input.priceAdjustment ?? "0.00",
      isDefault: input.isDefault ?? false, isActive: input.isActive ?? true, sortOrder: input.sortOrder ?? 0,
    };
    if (input.id) {
      await db.update(menuItemVariantOptions).set(data).where(eq(menuItemVariantOptions.id, input.id));
      return { id: input.id };
    }
    const [result] = await db.insert(menuItemVariantOptions).values(data);
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteVariantOption: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    await db.delete(menuItemVariantOptions).where(eq(menuItemVariantOptions.id, input.id));
    return { ok: true };
  }),

  // ── MODIFIER GROUPS ────────────────────────────────────────────────────────

  listModifierGroups: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const groups: unknown[] = await db.select().from(menuModifierGroups)
      .where(eq(menuModifierGroups.restaurantId, restaurantId))
      .orderBy(asc(menuModifierGroups.sortOrder), asc(menuModifierGroups.name));
    const modifiers: unknown[] = await db.select().from(menuModifiers)
      .where(eq(menuModifiers.restaurantId, restaurantId))
      .orderBy(asc(menuModifiers.sortOrder));
    return (groups as Array<{ id: number } & Record<string, unknown>>).map(g => ({
      ...g,
      modifiers: (modifiers as Array<{ groupId: number } & Record<string, unknown>>).filter(m => m.groupId === g.id),
    }));
  }),

  upsertModifierGroup: protectedProcedure.input(z.object({
    id: z.number().optional(),
    name: z.string().min(1).max(128),
    selectionType: z.enum(["single", "multiple", "quantity"]).optional(),
    isRequired: z.boolean().optional(),
    minSelections: z.number().optional(),
    maxSelections: z.number().nullable().optional(),
    sortOrder: z.number().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = {
      restaurantId, name: input.name,
      selectionType: (input.selectionType ?? "multiple") as "single" | "multiple" | "quantity",
      isRequired: input.isRequired ?? false,
      minSelections: input.minSelections ?? 0,
      maxSelections: input.maxSelections ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    };
    if (input.id) {
      await db.update(menuModifierGroups).set(data).where(and(eq(menuModifierGroups.id, input.id), eq(menuModifierGroups.restaurantId, restaurantId)));
      return { id: input.id };
    }
    const [result] = await db.insert(menuModifierGroups).values(data);
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteModifierGroup: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    await db.delete(menuModifiers).where(eq(menuModifiers.groupId, input.id));
    await db.delete(menuItemModifierGroups).where(eq(menuItemModifierGroups.modifierGroupId, input.id));
    await db.delete(menuModifierGroups).where(and(eq(menuModifierGroups.id, input.id), eq(menuModifierGroups.restaurantId, restaurantId)));
    return { ok: true };
  }),

  upsertModifier: protectedProcedure.input(z.object({
    id: z.number().optional(),
    groupId: z.number(),
    name: z.string().min(1).max(128),
    priceAdjustment: z.string().optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().optional(),
    allergens: z.any().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = {
      groupId: input.groupId, restaurantId, name: input.name,
      priceAdjustment: input.priceAdjustment ?? "0.00",
      isDefault: input.isDefault ?? false, isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0, allergens: input.allergens ?? null,
    };
    if (input.id) {
      await db.update(menuModifiers).set(data).where(eq(menuModifiers.id, input.id));
      return { id: input.id };
    }
    const [result] = await db.insert(menuModifiers).values(data);
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteModifier: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    await db.delete(menuModifiers).where(eq(menuModifiers.id, input.id));
    return { ok: true };
  }),

  linkModifierGroup: protectedProcedure.input(z.object({ menuItemId: z.number(), modifierGroupId: z.number(), sortOrder: z.number().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    await db.insert(menuItemModifierGroups).values({ menuItemId: input.menuItemId, modifierGroupId: input.modifierGroupId, sortOrder: input.sortOrder ?? 0 });
    return { ok: true };
  }),

  unlinkModifierGroup: protectedProcedure.input(z.object({ menuItemId: z.number(), modifierGroupId: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    await db.delete(menuItemModifierGroups)
      .where(and(eq(menuItemModifierGroups.menuItemId, input.menuItemId), eq(menuItemModifierGroups.modifierGroupId, input.modifierGroupId)));
    return { ok: true };
  }),

  // ── MENU SETS ──────────────────────────────────────────────────────────────

  listSets: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const sets: unknown[] = await db.select().from(menuSets)
      .where(eq(menuSets.restaurantId, restaurantId))
      .orderBy(asc(menuSets.sortOrder), asc(menuSets.name));
    const courses: unknown[] = await db.select().from(menuSetCourses)
      .where(eq(menuSetCourses.restaurantId, restaurantId))
      .orderBy(asc(menuSetCourses.courseNumber));
    return (sets as Array<{ id: number } & Record<string, unknown>>).map(s => ({
      ...s,
      courses: (courses as Array<{ menuSetId: number } & Record<string, unknown>>).filter(c => c.menuSetId === s.id),
    }));
  }),

  upsertSet: protectedProcedure.input(z.object({
    id: z.number().optional(),
    categoryId: z.number().nullable().optional(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    price: z.string(),
    imageUrl: z.string().optional(),
    isActive: z.boolean().optional(),
    availabilityType: z.enum(["always", "scheduled", "manual"]).optional(),
    availabilitySchedule: z.any().optional(),
    sortOrder: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = {
      restaurantId, categoryId: input.categoryId ?? null, name: input.name,
      description: input.description ?? null, price: input.price,
      imageUrl: input.imageUrl ?? null, isActive: input.isActive ?? true,
      availabilityType: (input.availabilityType ?? "always") as "always" | "scheduled" | "manual",
      availabilitySchedule: input.availabilitySchedule ?? null,
      sortOrder: input.sortOrder ?? 0,
    };
    if (input.id) {
      await db.update(menuSets).set(data).where(and(eq(menuSets.id, input.id), eq(menuSets.restaurantId, restaurantId)));
      return { id: input.id };
    }
    const [result] = await db.insert(menuSets).values(data);
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteSet: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    await db.delete(menuSetCourses).where(eq(menuSetCourses.menuSetId, input.id));
    await db.delete(menuSets).where(and(eq(menuSets.id, input.id), eq(menuSets.restaurantId, restaurantId)));
    return { ok: true };
  }),

  upsertSetCourse: protectedProcedure.input(z.object({
    id: z.number().optional(),
    menuSetId: z.number(),
    name: z.string().min(1).max(128),
    courseNumber: z.number(),
    minChoices: z.number().optional(),
    maxChoices: z.number().optional(),
    menuItemIds: z.array(z.number()),
    sortOrder: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = {
      menuSetId: input.menuSetId, restaurantId, name: input.name,
      courseNumber: input.courseNumber, minChoices: input.minChoices ?? 1,
      maxChoices: input.maxChoices ?? 1, menuItemIds: input.menuItemIds,
      sortOrder: input.sortOrder ?? 0,
    };
    if (input.id) {
      await db.update(menuSetCourses).set(data).where(eq(menuSetCourses.id, input.id));
      return { id: input.id };
    }
    const [result] = await db.insert(menuSetCourses).values(data);
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteSetCourse: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    await db.delete(menuSetCourses).where(eq(menuSetCourses.id, input.id));
    return { ok: true };
  }),

  // ── FULL MENU (for waiter order view) ──────────────────────────────────────

  getFullMenu: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();

    const categories: unknown[] = await db.select().from(menuCategories)
      .where(and(eq(menuCategories.restaurantId, restaurantId), eq(menuCategories.isActive, true), eq(menuCategories.isVisible, true)))
      .orderBy(asc(menuCategories.sortOrder));

    const items: unknown[] = await db.select().from(menuItems)
      .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.isActive, true)))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));

    const variantGroups: unknown[] = await db.select().from(menuItemVariantGroups)
      .where(eq(menuItemVariantGroups.restaurantId, restaurantId))
      .orderBy(asc(menuItemVariantGroups.sortOrder));

    const variantOptions: unknown[] = await db.select().from(menuItemVariantOptions)
      .where(and(eq(menuItemVariantOptions.restaurantId, restaurantId), eq(menuItemVariantOptions.isActive, true)))
      .orderBy(asc(menuItemVariantOptions.sortOrder));

    const modifierLinks: unknown[] = await db.select().from(menuItemModifierGroups);

    const modifierGroups: unknown[] = await db.select().from(menuModifierGroups)
      .where(and(eq(menuModifierGroups.restaurantId, restaurantId), eq(menuModifierGroups.isActive, true)))
      .orderBy(asc(menuModifierGroups.sortOrder));

    const modifiers: unknown[] = await db.select().from(menuModifiers)
      .where(and(eq(menuModifiers.restaurantId, restaurantId), eq(menuModifiers.isActive, true)))
      .orderBy(asc(menuModifiers.sortOrder));

    type AnyRow = Record<string, unknown>;

    type EnrichedItem = AnyRow & {
      variantGroups: (AnyRow & { options: AnyRow[] })[]
      modifierGroups: (AnyRow & { modifiers: AnyRow[] })[]
    };
    const enrichedItems: EnrichedItem[] = (items as AnyRow[]).map(item => ({
      ...item,
      variantGroups: (variantGroups as AnyRow[])
        .filter(vg => vg["menuItemId"] === item["id"])
        .map(vg => ({
          ...vg,
          options: (variantOptions as AnyRow[]).filter(vo => vo["variantGroupId"] === vg["id"]),
        })),
      modifierGroups: (modifierLinks as AnyRow[])
        .filter(ml => ml["menuItemId"] === item["id"])
        .map(ml => {
          const group = (modifierGroups as AnyRow[]).find(mg => mg["id"] === ml["modifierGroupId"]);
          if (!group) return null;
          return { ...group, modifiers: (modifiers as AnyRow[]).filter(m => m["groupId"] === group["id"]) };
        })
        .filter((g): g is AnyRow & { modifiers: AnyRow[] } => g !== null),
    }));

    const parentCategories = (categories as AnyRow[]).filter(c => !c["parentId"]);
    const subCategories = (categories as AnyRow[]).filter(c => !!c["parentId"]);

    return {
      categories: parentCategories.map(parent => ({
        ...parent,
        subCategories: subCategories
          .filter(sub => sub["parentId"] === parent["id"])
          .map(sub => ({
            ...sub,
            items: enrichedItems.filter(item => item["categoryId"] === sub["id"]),
          })),
        items: enrichedItems.filter(item => item["categoryId"] === parent["id"]),
      })),
      allItems: enrichedItems,
    };
  }),

  // ─── TOP CATEGORIES (Oberkategorien) ────────────────────────────────────────────────
  listTopCategories: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    return db.select().from(menuTopCategories)
      .where(eq(menuTopCategories.restaurantId, restaurantId))
      .orderBy(asc(menuTopCategories.sortOrder), asc(menuTopCategories.name));
  }),

  upsertTopCategory: protectedProcedure.input(z.object({
    id: z.number().optional(),
    name: z.string().min(1).max(128),
    icon: z.string().optional(),
    color: z.string().optional(),
    sortOrder: z.number().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const data = {
      restaurantId,
      name: input.name,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    };
    if (input.id) {
      await db.update(menuTopCategories).set(data)
        .where(and(eq(menuTopCategories.id, input.id), eq(menuTopCategories.restaurantId, restaurantId)));
      return { id: input.id };
    }
    const [result] = await db.insert(menuTopCategories).values(data);
    return { id: (result as { insertId: number }).insertId };
  }),

  deleteTopCategory: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    // Unterkategorien-Zuweisung aufheben
    await db.update(menuCategories)
      .set({ topCategoryId: null } as any)
      .where(and(eq(menuCategories.restaurantId, restaurantId), eq(menuCategories.topCategoryId as any, input.id)));
    await db.delete(menuTopCategories)
      .where(and(eq(menuTopCategories.id, input.id), eq(menuTopCategories.restaurantId, restaurantId)));
    return { ok: true };
  }),

  reorderTopCategories: protectedProcedure.input(z.array(z.object({ id: z.number(), sortOrder: z.number() }))).mutation(async ({ ctx, input }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    for (const item of input) {
      await db.update(menuTopCategories).set({ sortOrder: item.sortOrder })
        .where(and(eq(menuTopCategories.id, item.id), eq(menuTopCategories.restaurantId, restaurantId)));
    }
    return { ok: true };
  }),

  // Vollständige Speisekarte mit Oberkategorien für Kellner-Ansicht
  getFullMenuStructured: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = requireRestaurant(ctx);
    const db = await getDb();
    const topCats = await db.select().from(menuTopCategories)
      .where(and(eq(menuTopCategories.restaurantId, restaurantId), eq(menuTopCategories.isActive, true)))
      .orderBy(asc(menuTopCategories.sortOrder));
    const cats = await db.select().from(menuCategories)
      .where(and(eq(menuCategories.restaurantId, restaurantId), eq(menuCategories.isActive, true)))
      .orderBy(asc(menuCategories.sortOrder));
    const items = await db.select().from(menuItems)
      .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.isActive, true)))
      .orderBy(asc(menuItems.sortOrder));
    return { topCategories: topCats, categories: cats, items };
  }),
});
