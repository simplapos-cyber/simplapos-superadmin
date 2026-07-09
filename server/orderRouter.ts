import { z } from "zod";
import { eq, and, desc, inArray, isNull, or, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { deductStockForOrder } from "./inventoryHelpers";
import { eventBus } from "./_core/eventBus";
import {
  orders, orderItems, restaurantTables, menuItems, menuCategories,
  menuModifierGroups, menuModifiers, menuItemModifierGroups,
  menuItemVariantGroups, menuItemVariantOptions,
  floorPlans, floorPlanObjects, deviceLayouts,
  orderVoids, orderPayments, billSplits, billSplitItems, tableMerges,
  menuTopCategories, menuSets, menuSetCourses, menuTaxClasses,
} from "../drizzle/schema";

// Helper: get db + verify restaurant admin access
async function getDbAndRestaurant(ctx: { user: { id: number; role: string; restaurantId?: number | null } }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Datenbank nicht verfügbar" });
  const restaurantId = ctx.user.restaurantId;
  if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return { db, restaurantId };
}

export const orderRouter = router({
  // ─── GET TABLE STATUS (from floor plans + legacy restaurant_tables) ────────
  getTableStatus: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);

    // 1) Load all floor plans for this restaurant
    const plans = await db
      .select()
      .from(floorPlans)
      .where(eq(floorPlans.restaurantId, restaurantId))
      .orderBy(floorPlans.name);

    // 2) Load all table objects from those floor plans
    const planIds = plans.map((p: { id: number }) => p.id);
    let floorTables: Array<{
      id: number; floorPlanId: number; label: string | null;
      tableNumber: number | null; seats: number | null; isActive: boolean;
      x: number; y: number; width: number; height: number; rotation: number; type: string;
    }> = [];
    if (planIds.length > 0) {
      floorTables = await db
        .select({
          id: floorPlanObjects.id,
          floorPlanId: floorPlanObjects.floorPlanId,
          label: floorPlanObjects.label,
          tableNumber: floorPlanObjects.tableNumber,
          seats: floorPlanObjects.seats,
          isActive: floorPlanObjects.isActive,
          x: floorPlanObjects.x,
          y: floorPlanObjects.y,
          width: floorPlanObjects.width,
          height: floorPlanObjects.height,
          rotation: floorPlanObjects.rotation,
          type: floorPlanObjects.type,
        })
        .from(floorPlanObjects)
        .where(and(
          inArray(floorPlanObjects.floorPlanId, planIds),
          // Include ALL table types - use LIKE 'table_%' to match any current or future table type
          like(floorPlanObjects.type, "table_%"),
          // Note: isActive filter removed - some older records may have NULL isActive
          // eq(floorPlanObjects.isActive, true),
        ))
        .orderBy(floorPlanObjects.tableNumber, floorPlanObjects.label);
    }


    // 3) Also load legacy restaurant_tables (for backwards compatibility)
    const legacyTables = await db
      .select()
      .from(restaurantTables)
      .where(and(
        eq(restaurantTables.restaurantId, restaurantId),
        eq(restaurantTables.isActive, true),
      ))
      .orderBy(restaurantTables.name);

    // 4) Get all open orders for this restaurant
    const openOrders = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.restaurantId, restaurantId),
        inArray(orders.status, ["pending", "preparing", "ready", "served"]),
      ));

    // Map orders by floorPlanObjectId and by tableId
    const orderByFloorObj = new Map(
      openOrders
        .filter((o: { floorPlanObjectId: number | null }) => o.floorPlanObjectId != null)
        .map((o: { floorPlanObjectId: number | null; id: number; status: string; totalAmount: string | null; guestCount: number | null }) => [o.floorPlanObjectId!, o])
    );
    const orderByTableId = new Map(
      openOrders
        .filter((o: { tableId: number | null; floorPlanObjectId: number | null }) => o.tableId != null && o.floorPlanObjectId == null)
        .map((o: { tableId: number | null; id: number; status: string; totalAmount: string | null; guestCount: number | null }) => [o.tableId!, o])
    );

    // Build plan name lookup
    const planNameMap = new Map(plans.map((p: { id: number; name: string }) => [p.id, p.name]));

      type PlanTable = {
      id: number;
      sourceType: "floor_plan" | "legacy";
      floorPlanId: number | null;
      planName: string;
      label: string;
      seats: number;
      x: number; y: number; width: number; height: number; rotation: number; objType: string;
      currentOrder: { id: number; status: string; totalAmount: string | null; guestCount: number | null; createdAt: Date | null } | null;
    };
    type DevicePosition = { objectId: number; x: number; y: number; width: number; height: number; rotation: number; hidden: boolean };
    type PlanGroup = {
      planId: number; planName: string; canvasWidth: number; canvasHeight: number;
      floorStyle: string;
      phoneLayout: { canvasWidth: number; canvasHeight: number; positions: DevicePosition[] } | null;
      tables: PlanTable[];
    };

    // Build result: group floor tables by plan
    const planGroups: PlanGroup[] = [];

    const planCanvasMap = new Map<number, { canvasWidth: number; canvasHeight: number; floorStyle: string }>(plans.map((p: { id: number; canvasWidth: number; canvasHeight: number; floorStyle: string | null }) => [p.id, { canvasWidth: p.canvasWidth, canvasHeight: p.canvasHeight, floorStyle: p.floorStyle ?? "none" }]));

    // Load phone device layouts for all plans
    let phoneLayouts: Array<{ floorPlanId: number; canvasWidth: number; canvasHeight: number; objectPositions: string | unknown }> = [];
    if (planIds.length > 0) {
      phoneLayouts = await db
        .select({
          floorPlanId: deviceLayouts.floorPlanId,
          canvasWidth: deviceLayouts.canvasWidth,
          canvasHeight: deviceLayouts.canvasHeight,
          objectPositions: deviceLayouts.objectPositions,
        })
        .from(deviceLayouts)
        .where(and(
          inArray(deviceLayouts.floorPlanId, planIds),
          eq(deviceLayouts.device, "phone"),
        ));
    }
    const phoneLayoutMap = new Map(phoneLayouts.map(l => {
      const positions: DevicePosition[] = typeof l.objectPositions === "string" ? JSON.parse(l.objectPositions) : (l.objectPositions as DevicePosition[]);
      return [l.floorPlanId, { canvasWidth: l.canvasWidth, canvasHeight: l.canvasHeight, positions }];
    }));

    const planGroupMap = new Map<number, PlanGroup>();
    for (const t of floorTables) {
      const planName: string = String(planNameMap.get(t.floorPlanId) ?? "Unbekannt");
      if (!planGroupMap.has(t.floorPlanId)) {
        const canvas = planCanvasMap.get(t.floorPlanId) ?? { canvasWidth: 1200, canvasHeight: 800, floorStyle: "none" };
        const phoneLayout = phoneLayoutMap.get(t.floorPlanId) ?? null;
        const group: PlanGroup = { planId: t.floorPlanId, planName, canvasWidth: canvas.canvasWidth, canvasHeight: canvas.canvasHeight, floorStyle: canvas.floorStyle, phoneLayout, tables: [] };
        planGroupMap.set(t.floorPlanId, group);
        planGroups.push(group);
      }
      const group = planGroupMap.get(t.floorPlanId)!;
      const currentOrder = orderByFloorObj.get(t.id) ?? null;
      group.tables.push({
        id: t.id,
        sourceType: "floor_plan" as const,
        floorPlanId: t.floorPlanId,
        planName,
        label: t.label ?? (t.tableNumber ? `Tisch ${t.tableNumber}` : `Tisch ${t.id}`),
        seats: t.seats ?? 4,
        x: t.x, y: t.y, width: t.width, height: t.height, rotation: t.rotation, objType: t.type,
        currentOrder: currentOrder ? {
          id: (currentOrder as { id: number }).id,
          status: (currentOrder as { status: string }).status,
          totalAmount: (currentOrder as { totalAmount: string | null }).totalAmount,
          guestCount: (currentOrder as { guestCount: number | null }).guestCount,
          createdAt: (currentOrder as { createdAt: Date | null }).createdAt ?? null,
        } : null,
      });
    }

    // Add legacy tables as a separate group (only if no floor plans exist)
    const legacyGroup: {
      planId: number;
      planName: string;
      canvasWidth: number;
      canvasHeight: number;
      floorStyle: string;
      phoneLayout: { canvasWidth: number; canvasHeight: number; positions: DevicePosition[] } | null;
      tables: Array<{
        id: number;
        sourceType: "legacy";
        floorPlanId: null;
        planName: string;
        label: string;
        seats: number;
        x: number; y: number; width: number; height: number; rotation: number; objType: string;
        currentOrder: { id: number; status: string; totalAmount: string | null; guestCount: number | null; createdAt: Date | null } | null;
      }>;
    } = { planId: -1, planName: "Tische", canvasWidth: 1200, canvasHeight: 800, floorStyle: "none" as string, phoneLayout: null as { canvasWidth: number; canvasHeight: number; positions: DevicePosition[] } | null, tables: [] };

    for (const t of legacyTables) {
      const currentOrder = orderByTableId.get(t.id) ?? null;
      legacyGroup.tables.push({
        id: t.id,
        sourceType: "legacy",
        floorPlanId: null,
        planName: "Tische",
        label: t.name,
        seats: t.seats ?? 4,
        x: 0, y: 0, width: 80, height: 80, rotation: 0, objType: "table_square",
        currentOrder: currentOrder ? {
          id: (currentOrder as { id: number }).id,
          status: (currentOrder as { status: string }).status,
          totalAmount: (currentOrder as { totalAmount: string | null }).totalAmount,
          guestCount: (currentOrder as { guestCount: number | null }).guestCount,
          createdAt: (currentOrder as { createdAt: Date | null }).createdAt ?? null,
        } : null,
      });
    }

    // Only include legacy group if no floor plan tables exist
    if (planGroups.length === 0 && legacyGroup.tables.length > 0) {
      planGroups.push(legacyGroup as typeof planGroups[0]);
    }

    return planGroups;
  }),

  // ─── GET ORDER WITH ITEMS ─────────────────────────────────────────────────
  getOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId)));

      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, input.orderId))
        .orderBy(orderItems.createdAt);

      // Resolve table label from floorPlanObjects if available
      let tableLabel: string | null = null;
      if (order.floorPlanObjectId) {
        const [fpObj] = await db.select().from(floorPlanObjects).where(eq(floorPlanObjects.id, order.floorPlanObjectId));
        if (fpObj) tableLabel = fpObj.label ?? (fpObj.tableNumber ? `Tisch ${fpObj.tableNumber}` : null);
      }

      return { ...order, items, tableLabel };
    }),

  // ─── GET OR CREATE ORDER FOR FLOOR PLAN TABLE ─────────────────────────────
  getOrCreateTableOrder: protectedProcedure
    .input(z.object({
      floorPlanObjectId: z.number().optional(),
      tableId: z.number().optional(),  // legacy
      guestCount: z.number().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      if (!input.floorPlanObjectId && !input.tableId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "floorPlanObjectId oder tableId erforderlich" });
      }

      let tableLabel = "Tisch";
      let existingQuery;

      if (input.floorPlanObjectId) {
        // Verify floor plan object belongs to this restaurant
        const [fpObj] = await db
          .select()
          .from(floorPlanObjects)
          .where(eq(floorPlanObjects.id, input.floorPlanObjectId));

        if (fpObj) {
          const [plan] = await db.select().from(floorPlans).where(eq(floorPlans.id, fpObj.floorPlanId));
          if (!plan || plan.restaurantId !== restaurantId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Tisch gehört nicht zu diesem Restaurant" });
          }
          tableLabel = fpObj.label ?? (fpObj.tableNumber ? `T${fpObj.tableNumber}` : `Obj${fpObj.id}`);
        }

        // Check for existing open order
        const existing = await db
          .select()
          .from(orders)
          .where(and(
            eq(orders.floorPlanObjectId, input.floorPlanObjectId),
            eq(orders.restaurantId, restaurantId),
            inArray(orders.status, ["pending", "preparing", "ready", "served"]),
          ));

        if (existing.length > 0) {
          const items = await db.select().from(orderItems).where(eq(orderItems.orderId, existing[0].id))
            .orderBy(orderItems.createdAt);
          return { ...existing[0], items, isNew: false };
        }
      } else if (input.tableId) {
        // Legacy path
        const [table] = await db.select().from(restaurantTables)
          .where(and(eq(restaurantTables.id, input.tableId), eq(restaurantTables.restaurantId, restaurantId)));
        if (!table) throw new TRPCError({ code: "NOT_FOUND", message: "Tisch nicht gefunden" });
        tableLabel = table.name;

        const existing = await db.select().from(orders).where(and(
          eq(orders.tableId, input.tableId),
          eq(orders.restaurantId, restaurantId),
          inArray(orders.status, ["pending", "preparing", "ready", "served"]),
        ));
        if (existing.length > 0) {
          const items = await db.select().from(orderItems).where(eq(orderItems.orderId, existing[0].id))
            .orderBy(orderItems.createdAt);
          return { ...existing[0], items, isNew: false };
        }
      }

      // Create new order
      const orderNumber = `${tableLabel}-${Date.now().toString(36).toUpperCase()}`;
      const insertValues: {
        restaurantId: number;
        floorPlanObjectId?: number;
        tableId?: number;
        staffId: number;
        orderNumber: string;
        status: "pending";
        type: "dine_in";
        subtotal: string;
        taxAmount: string;
        tipAmount: string;
        totalAmount: string;
        guestCount: number;
      } = {
        restaurantId,
        staffId: ctx.effectiveUserId!,
        orderNumber,
        status: "pending",
        type: "dine_in",
        subtotal: "0.00",
        taxAmount: "0.00",
        tipAmount: "0.00",
        totalAmount: "0.00",
        guestCount: input.guestCount,
      };

      if (input.floorPlanObjectId) insertValues.floorPlanObjectId = input.floorPlanObjectId;
      if (input.tableId) insertValues.tableId = input.tableId;

      const [newOrder] = await db.insert(orders).values(insertValues).$returningId();
      const [created] = await db.select().from(orders).where(eq(orders.id, newOrder.id));
      return { ...created, items: [], isNew: true };
    }),

  // ─── ADD ITEM TO ORDER ────────────────────────────────────────────────────
  addItem: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      menuItemId: z.number().optional(),
      name: z.string(),
      unitPrice: z.number(),
      quantity: z.number().min(1).default(1),
      notes: z.string().optional(),
      seatNumber: z.number().optional(),
      course: z.number().min(1).max(10).default(1),
      priority: z.enum(["normal", "rush", "hold"]).default("normal"),
      itemType: z.enum(["food", "drink", "other"]).default("food"),
      modifiers: z.array(z.object({
        id: z.number().optional(),
        name: z.string(),
        price: z.number(),
      })).optional(),
      variantLabel: z.string().optional(),
      variantId: z.number().optional(),
      variantPriceAdjust: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status === "paid" || order.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bestellung ist bereits abgeschlossen" });
      }

      // Calculate unit price with modifiers and variant
      const modifierTotal = (input.modifiers ?? []).reduce((s, m) => s + m.price, 0);
      const variantAdjust = input.variantPriceAdjust ?? 0;
      const effectiveUnitPrice = input.unitPrice + modifierTotal + variantAdjust;
      const totalPrice = effectiveUnitPrice * input.quantity;

      // Build notes string
      const noteParts: string[] = [];
      if (input.variantLabel) noteParts.push(input.variantLabel);
      if (input.modifiers?.length) noteParts.push(input.modifiers.map(m => m.name).join(", "));
      if (input.notes) noteParts.push(input.notes);
      const fullNotes = noteParts.join(" | ") || null;

      // Steuerklasse aus menuItems nachschlagen (MwSt.-Konformität)
      let taxClassId: number | null = null;
      let taxRateStr: string | null = null;
      if (input.menuItemId) {
        const [menuItem] = await db
          .select({ taxClassId: menuItems.taxClassId })
          .from(menuItems)
          .where(eq(menuItems.id, input.menuItemId));
        if (menuItem?.taxClassId) {
          taxClassId = menuItem.taxClassId;
          const [taxClass] = await db
            .select({ rate: menuTaxClasses.rate })
            .from(menuTaxClasses)
            .where(eq(menuTaxClasses.id, menuItem.taxClassId));
          if (taxClass) taxRateStr = taxClass.rate;
        }
      }
      // Fallback: Bestelltyp bestimmt Satz (dine_in=8.10%, takeaway=2.60%)
      if (!taxRateStr) {
        taxRateStr = order.type === "takeaway" ? "2.60" : "8.10";
      }

      await db.insert(orderItems).values({
        orderId: input.orderId,
        productId: input.menuItemId ?? null,
        selectedVariantId: input.variantId ?? null,
        selectedVariantName: input.variantLabel ?? null,
        selectedVariantPrice: input.variantPriceAdjust != null ? String(input.variantPriceAdjust.toFixed(2)) : null,
        selectedModifiers: input.modifiers?.length
          ? input.modifiers.map(m => ({ id: m.id ?? null, name: m.name, priceAdjustment: m.price }))
          : null,
        taxClassId,
        taxRate: taxRateStr,
        name: input.name,
        quantity: input.quantity,
        unitPrice: effectiveUnitPrice.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        notes: fullNotes,
        seatNumber: input.seatNumber ?? null,
        course: input.course,
        priority: input.priority,
        itemType: input.itemType,
        status: "pending",
      });

      await recalcOrderTotals(db, input.orderId);

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId))
        .orderBy(orderItems.createdAt);
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      eventBus.emit({ type: "order_update", channel: "order", restaurantId, payload: { orderId: input.orderId } });
      return { ...updatedOrder, items };
    }),

  // ─── UPDATE ITEM ──────────────────────────────────────────────────────────
  updateItem: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      itemId: z.number(),
      quantity: z.number().min(0).optional(),
      notes: z.string().optional(),
      seatNumber: z.number().nullable().optional(),
      course: z.number().min(1).max(10).optional(),
      priority: z.enum(["normal", "rush", "hold"]).optional(),
      itemType: z.enum(["food", "drink", "other"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.quantity === 0) {
        await db.delete(orderItems).where(eq(orderItems.id, input.itemId));
      } else {
        const [item] = await db.select().from(orderItems).where(eq(orderItems.id, input.itemId));
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });

        const updates: Partial<{
          quantity: number; totalPrice: string; notes: string | null;
          seatNumber: number | null; course: number; priority: "normal" | "rush" | "hold";
          itemType: "food" | "drink" | "other";
        }> = {};
        if (input.quantity !== undefined && input.quantity > 0) {
          updates.quantity = input.quantity;
          updates.totalPrice = (parseFloat(item.unitPrice) * input.quantity).toFixed(2);
        }
        if (input.notes !== undefined) updates.notes = input.notes || null;
        if (input.seatNumber !== undefined) updates.seatNumber = input.seatNumber;
        if (input.course !== undefined) updates.course = input.course;
        if (input.priority !== undefined) updates.priority = input.priority;
        if (input.itemType !== undefined) updates.itemType = input.itemType;

        if (Object.keys(updates).length > 0) {
          await db.update(orderItems).set(updates).where(eq(orderItems.id, input.itemId));
        }
      }

      await recalcOrderTotals(db, input.orderId);

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId))
        .orderBy(orderItems.createdAt);
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      eventBus.emit({ type: "order_update", channel: "order", restaurantId, payload: { orderId: input.orderId } });
      return { ...updatedOrder, items };
    }),

  // ─── UPDATE ITEM QUANTITY (legacy) ───────────────────────────────────────
  updateItemQty: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      itemId: z.number(),
      quantity: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.quantity === 0) {
        await db.delete(orderItems).where(eq(orderItems.id, input.itemId));
      } else {
        const [item] = await db.select().from(orderItems).where(eq(orderItems.id, input.itemId));
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        const newTotal = (parseFloat(item.unitPrice) * input.quantity).toFixed(2);
        await db.update(orderItems)
          .set({ quantity: input.quantity, totalPrice: newTotal })
          .where(eq(orderItems.id, input.itemId));
      }

      await recalcOrderTotals(db, input.orderId);

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      eventBus.emit({ type: "order_update", channel: "order", restaurantId, payload: { orderId: input.orderId } });
      return { ...updatedOrder, items };
    }),

  // ─── REMOVE ITEM ──────────────────────────────────────────────────────────
  removeItem: protectedProcedure
    .input(z.object({ orderId: z.number(), itemId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      await db.delete(orderItems).where(eq(orderItems.id, input.itemId));
      await recalcOrderTotals(db, input.orderId);

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      eventBus.emit({ type: "order_update", channel: "order", restaurantId, payload: { orderId: input.orderId } });
      return { ...updatedOrder, items };
    }),

  // ─── UPDATE ITEM NOTES ────────────────────────────────────────────────────
  updateItemNotes: protectedProcedure
    .input(z.object({ itemId: z.number(), notes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await getDbAndRestaurant(ctx);
      await db.update(orderItems).set({ notes: input.notes }).where(eq(orderItems.id, input.itemId));
      return { success: true };
    }),

  // ─── SEND TO KITCHEN ──────────────────────────────────────────────────────
  sendToKitchen: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(orderItems)
        .set({ status: "preparing" })
        .where(and(eq(orderItems.orderId, input.orderId), eq(orderItems.status, "pending")));

      await db.update(orders)
        .set({ status: "preparing" })
        .where(eq(orders.id, input.orderId));

      // SSE: Echtzeit-Benachrichtigung an Küche und Bar
      eventBus.emit({
        type: "kitchen_update",
        channel: ["kitchen", "bar"],
        restaurantId,
        payload: { orderId: input.orderId, orderNumber: order.orderNumber, tableId: order.tableId, action: "new_order" },
      });
      eventBus.emit({
        type: "floor_update",
        channel: "floor",
        restaurantId,
        payload: { tableId: order.tableId, status: "preparing" },
      });
      return { success: true, orderNumber: order.orderNumber };
    }),

  // ─── UPDATE ORDER NOTES ───────────────────────────────────────────────────
  updateOrderNotes: protectedProcedure
    .input(z.object({ orderId: z.number(), notes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(orders).set({ notes: input.notes }).where(eq(orders.id, input.orderId));
      return { success: true };
    }),

  // ─── UPDATE GUEST COUNT ───────────────────────────────────────────────────
  updateGuestCount: protectedProcedure
    .input(z.object({ orderId: z.number(), guestCount: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(orders).set({ guestCount: input.guestCount }).where(eq(orders.id, input.orderId));
      return { success: true };
    }),

  // ─── CLOSE / MARK AS PAID ─────────────────────────────────────────────────
  closeOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      paymentMethod: z.enum(["cash", "card", "twint", "online", "invoice"]),
      tipAmount: z.number().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const subtotal = parseFloat(order.subtotal ?? "0");
      const tipAmount = input.tipAmount;
      // Brutto-Total: subtotal ist bereits inkl. MwSt. (Rückwärtsberechnung)
      const totalAmount = subtotal + tipAmount;

      await db.update(orders).set({
        status: "paid",
        paymentMethod: input.paymentMethod,
        tipAmount: tipAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        paidAt: new Date(),
        checkedOutByStaffId: ctx.effectiveUserId!, // Kassierungsprinzip
      }).where(eq(orders.id, input.orderId));

      await db.update(orderItems)
        .set({ status: "served" })
        .where(eq(orderItems.orderId, input.orderId));

      // ── Automatischer Lagerabzug ──────────────────────────────────────────
      // Bestellpositionen laden und Rezepturen abgleichen.
      // WICHTIG: restaurantId wird explizit übergeben – Multi-Tenant-Isolation.
      // Fehler beim Lagerabzug blockieren den Bestellabschluss NICHT.
      let stockDeductions: Array<{ itemName: string; deducted: number; unit: string; inventoryItemId: number }> = [];
      try {
        const soldItems = await db
          .select({ productId: orderItems.productId, quantity: orderItems.quantity })
          .from(orderItems)
          .where(eq(orderItems.orderId, input.orderId));
        const itemsForDeduction = soldItems
          .filter((i: { productId: number | null }) => i.productId !== null)
          .map((i: { productId: number | null; quantity: number }) => ({
            productId: i.productId as number,
            quantity: i.quantity,
          }));
        if (itemsForDeduction.length > 0) {
          stockDeductions = await deductStockForOrder(db, {
            restaurantId, // Nur dieses Restaurant – niemals vermischt
            orderId: input.orderId,
            items: itemsForDeduction,
            performedBy: ctx.user!.id,
          });
        }
      } catch (err) {
        console.warn("[closeOrder] Lagerabzug fehlgeschlagen (nicht kritisch):", err instanceof Error ? err.message : err);
      }

      // SSE: Tisch als frei markieren
      eventBus.emit({
        type: "floor_update",
        channel: ["floor", "kitchen"],
        restaurantId,
        payload: { tableId: order.tableId, status: "free", orderId: input.orderId, action: "order_closed" },
      });
      return { success: true, totalAmount, stockDeductions };
    }),

  // ─── CANCEL ORDER ─────────────────────────────────────────────────────────
  cancelOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, input.orderId));
      return { success: true };
    }),

  // ─── GET MENU FOR ORDERING ────────────────────────────────────────────────
  getMenuForOrder: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);

    const categories = await db
      .select()
      .from(menuCategories)
      .where(and(
        eq(menuCategories.restaurantId, restaurantId),
        eq(menuCategories.isActive, true),
      ))
      .orderBy(menuCategories.sortOrder, menuCategories.name);

    const items = await db
      .select()
      .from(menuItems)
      .where(and(
        eq(menuItems.restaurantId, restaurantId),
        eq(menuItems.isAvailable, true),
      ))
      .orderBy(menuItems.sortOrder, menuItems.name);

    const itemIds = items.map((i: { id: number }) => i.id);
    let modifierGroupLinks: Array<{ menuItemId: number; modifierGroupId: number }> = [];
    let modGroups: Array<{ id: number; name: string; selectionType: string; isRequired: boolean; minSelections: number; maxSelections: number }> = [];
    let modOptions: Array<{ id: number; modifierGroupId: number; name: string; priceAdjustment: string; isDefault: boolean }> = [];
    let variantGroups: Array<{ id: number; menuItemId: number; name: string; isRequired: boolean }> = [];
    let variantOpts: Array<{ id: number; variantGroupId: number; name: string; priceAdjustment: string; isDefault: boolean }> = [];

    if (itemIds.length > 0) {
      modifierGroupLinks = await db
        .select({ menuItemId: menuItemModifierGroups.menuItemId, modifierGroupId: menuItemModifierGroups.modifierGroupId })
        .from(menuItemModifierGroups)
        .where(inArray(menuItemModifierGroups.menuItemId, itemIds));

      const modGroupIds = Array.from(new Set(modifierGroupLinks.map((l: { modifierGroupId: number }) => l.modifierGroupId)));
      if (modGroupIds.length > 0) {
        modGroups = await db
          .select({ id: menuModifierGroups.id, name: menuModifierGroups.name, selectionType: menuModifierGroups.selectionType, isRequired: menuModifierGroups.isRequired, minSelections: menuModifierGroups.minSelections, maxSelections: menuModifierGroups.maxSelections })
          .from(menuModifierGroups)
          .where(inArray(menuModifierGroups.id, modGroupIds));

        modOptions = await db
          .select({ id: menuModifiers.id, modifierGroupId: menuModifiers.groupId, name: menuModifiers.name, priceAdjustment: menuModifiers.priceAdjustment, isDefault: menuModifiers.isDefault })
          .from(menuModifiers)
          .where(inArray(menuModifiers.groupId, modGroupIds));
      }

      variantGroups = await db
        .select({ id: menuItemVariantGroups.id, menuItemId: menuItemVariantGroups.menuItemId, name: menuItemVariantGroups.name, isRequired: menuItemVariantGroups.isRequired })
        .from(menuItemVariantGroups)
        .where(inArray(menuItemVariantGroups.menuItemId, itemIds));

      const vgIds = variantGroups.map((vg: { id: number }) => vg.id);
      if (vgIds.length > 0) {
        variantOpts = await db
          .select({ id: menuItemVariantOptions.id, variantGroupId: menuItemVariantOptions.variantGroupId, name: menuItemVariantOptions.name, priceAdjustment: menuItemVariantOptions.priceAdjustment, isDefault: menuItemVariantOptions.isDefault })
          .from(menuItemVariantOptions)
          .where(inArray(menuItemVariantOptions.variantGroupId, vgIds));
      }
    }

    const modGroupMap = new Map(modGroups.map((g: { id: number; name: string; selectionType: string; isRequired: boolean; minSelections: number; maxSelections: number }) => [g.id, { ...g, options: modOptions.filter((o: { modifierGroupId: number }) => o.modifierGroupId === g.id) }]));
    const itemModGroupIds = new Map<number, number[]>();
    for (const link of modifierGroupLinks) {
      if (!itemModGroupIds.has(link.menuItemId)) itemModGroupIds.set(link.menuItemId, []);
      itemModGroupIds.get(link.menuItemId)!.push(link.modifierGroupId);
    }
    const itemVariantGroupsMap = new Map<number, typeof variantGroups[0][]>();
    for (const vg of variantGroups) {
      if (!itemVariantGroupsMap.has(vg.menuItemId)) itemVariantGroupsMap.set(vg.menuItemId, []);
      itemVariantGroupsMap.get(vg.menuItemId)!.push(vg);
    }

    const enrichedItems = items.map((item: { id: number; name: string; price: string; description: string | null; imageUrl: string | null; labels: unknown; allergens: unknown; itemType: string; sortOrder: number; categoryId: number | null }) => ({
      ...item,
      modifierGroups: (itemModGroupIds.get(item.id) ?? []).map((gid: number) => modGroupMap.get(gid)).filter(Boolean),
      variantGroups: (itemVariantGroupsMap.get(item.id) ?? []).map((vg: { id: number; menuItemId: number; name: string; isRequired: boolean }) => ({
        ...vg,
        options: variantOpts.filter((o: { variantGroupId: number }) => o.variantGroupId === vg.id),
      })),
    }));

    // Fetch top categories
    const topCats = await db
      .select()
      .from(menuTopCategories)
      .where(and(
        eq(menuTopCategories.restaurantId, restaurantId),
        eq(menuTopCategories.isActive, true),
      ))
      .orderBy(menuTopCategories.sortOrder, menuTopCategories.name);

    // Fetch active menu sets with courses
    const sets = await db
      .select()
      .from(menuSets)
      .where(and(
        eq(menuSets.restaurantId, restaurantId),
        eq(menuSets.isActive, true),
      ))
      .orderBy(menuSets.sortOrder, menuSets.name);
    let setCourses: Array<{ id: number; menuSetId: number; name: string; courseNumber: number; minChoices: number; maxChoices: number; menuItemIds: unknown; sortOrder: number }> = [];
    if (sets.length > 0) {
      const setIds = sets.map((s: { id: number }) => s.id);
      setCourses = await db
        .select({
          id: menuSetCourses.id,
          menuSetId: menuSetCourses.menuSetId,
          name: menuSetCourses.name,
          courseNumber: menuSetCourses.courseNumber,
          minChoices: menuSetCourses.minChoices,
          maxChoices: menuSetCourses.maxChoices,
          menuItemIds: menuSetCourses.menuItemIds,
          sortOrder: menuSetCourses.sortOrder,
        })
        .from(menuSetCourses)
        .where(inArray(menuSetCourses.menuSetId, setIds))
        .orderBy(menuSetCourses.courseNumber);
    }
    const enrichedSets = sets.map((s: { id: number; name: string; price: string; description: string | null; imageUrl: string | null; availabilityType: string; availabilitySchedule: unknown; sortOrder: number; isActive: boolean }) => ({
      ...s,
      courses: setCourses
        .filter((c: { menuSetId: number }) => c.menuSetId === s.id)
        .map((c: { id: number; menuSetId: number; name: string; courseNumber: number; minChoices: number; maxChoices: number; menuItemIds: unknown; sortOrder: number }) => ({
          ...c,
          items: (Array.isArray(c.menuItemIds) ? c.menuItemIds as number[] : [])
            .map((itemId: number) => enrichedItems.find((item: { id: number }) => item.id === itemId))
            .filter(Boolean),
        })),
    }));
    return { topCategories: topCats, categories, items: enrichedItems, menuSets: enrichedSets };
  }),

  // ─── GET KITCHEN ORDERS (KDS) ─────────────────────────────────────────────
  getKitchenOrders: protectedProcedure
    .input(z.object({
      itemType: z.enum(["food", "drink", "other", "all"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const openOrders = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.restaurantId, restaurantId),
          inArray(orders.status, ["pending", "preparing", "ready"]),
        ))
        .orderBy(orders.createdAt);
      if (openOrders.length === 0) return [];
      const orderIds = openOrders.map((o: { id: number }) => o.id);
      const allItems = await db
        .select()
        .from(orderItems)
        .where(and(
          inArray(orderItems.orderId, orderIds),
          inArray(orderItems.status, ["pending", "preparing", "ready"]),
        ))
        .orderBy(orderItems.course, orderItems.createdAt);
      const filteredItems = input.itemType === "all"
        ? allItems
        : allItems.filter((i: { itemType: string }) => i.itemType === input.itemType);

      // Resolve table labels from floorPlanObjects or restaurantTables
      const fpObjectIds = openOrders
        .map((o: { floorPlanObjectId: number | null }) => o.floorPlanObjectId)
        .filter((id: number | null): id is number => id !== null);
      const tableIds = openOrders
        .map((o: { tableId: number | null }) => o.tableId)
        .filter((id: number | null): id is number => id !== null);
      const fpObjects: Array<{ id: number; label: string | null; tableNumber: number | null }> = fpObjectIds.length > 0
        ? await db.select({ id: floorPlanObjects.id, label: floorPlanObjects.label, tableNumber: floorPlanObjects.tableNumber })
            .from(floorPlanObjects).where(inArray(floorPlanObjects.id, fpObjectIds))
        : [];
      const legacyTables: Array<{ id: number; name: string }> = tableIds.length > 0
        ? await db.select({ id: restaurantTables.id, name: restaurantTables.name })
            .from(restaurantTables).where(inArray(restaurantTables.id, tableIds))
        : [];
      const fpMap = new Map(fpObjects.map(o => [o.id, o]));
      const tableMap = new Map(legacyTables.map(t => [t.id, t]));

      type OrderRow = typeof openOrders[0] & { items: typeof allItems; tableLabel: string | null };
      const orderMap = new Map<number, OrderRow>();
      for (const o of openOrders) {
        let tableLabel: string | null = null;
        if (o.floorPlanObjectId) {
          const fp = fpMap.get(o.floorPlanObjectId);
          if (fp) tableLabel = fp.label ?? (fp.tableNumber ? `Tisch ${fp.tableNumber}` : null);
        } else if (o.tableId) {
          const t = tableMap.get(o.tableId);
          if (t) tableLabel = t.name ?? null;
        }
        orderMap.set(o.id, { ...o, items: [], tableLabel });
      }
      for (const item of filteredItems) {
        const order = orderMap.get(item.orderId);
        if (order) order.items.push(item);
      }
      return Array.from(orderMap.values()).filter(o => o.items.length > 0);
    }),

  // ─── MARK ALL ITEMS READY (KDS: alle Positionen einer Bestellung auf bereit) ──────
  markAllReady: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(orderItems)
        .set({ status: "ready" })
        .where(and(
          eq(orderItems.orderId, input.orderId),
          inArray(orderItems.status, ["pending", "preparing"]),
        ));
      await db.update(orders).set({ status: "ready" }).where(eq(orders.id, input.orderId));
      eventBus.emit({ type: "order_update", channel: "kitchen", restaurantId, payload: { orderId: input.orderId } });
      // Notify waiter via floor channel
      let tableLabel: string | null = null;
      if (order.floorPlanObjectId) {
        const [fp] = await db.select({ label: floorPlanObjects.label, tableNumber: floorPlanObjects.tableNumber })
          .from(floorPlanObjects).where(eq(floorPlanObjects.id, order.floorPlanObjectId));
        if (fp) tableLabel = fp.label ?? (fp.tableNumber ? `Tisch ${fp.tableNumber}` : null);
      } else if (order.tableId) {
        const [t] = await db.select({ name: restaurantTables.name })
          .from(restaurantTables).where(eq(restaurantTables.id, order.tableId));
        if (t) tableLabel = t.name ?? null;
      }
      eventBus.emit({ type: "order_ready", channel: "floor", restaurantId, payload: { orderId: input.orderId, tableLabel } });
      return { success: true };
    }),

  // ─── SET ITEM PRIORITY (KDS: Rush / Hold) ───────────────────────────────────────────
  setOrderPriority: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      priority: z.enum(["normal", "rush", "hold"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      // Set priority on all pending/preparing items of this order
      await db.update(orderItems)
        .set({ priority: input.priority })
        .where(and(
          eq(orderItems.orderId, input.orderId),
          inArray(orderItems.status, ["pending", "preparing"]),
        ));
      // Resolve table label for rush notification
      let tableLabel: string | null = null;
      if (order.floorPlanObjectId) {
        const [fp] = await db.select({ label: floorPlanObjects.label, tableNumber: floorPlanObjects.tableNumber })
          .from(floorPlanObjects).where(eq(floorPlanObjects.id, order.floorPlanObjectId));
        if (fp) tableLabel = fp.label ?? (fp.tableNumber ? `Tisch ${fp.tableNumber}` : null);
      } else if (order.tableId) {
        const [t] = await db.select({ name: restaurantTables.name })
          .from(restaurantTables).where(eq(restaurantTables.id, order.tableId));
        if (t) tableLabel = t.name ?? null;
      }
      const eventType = input.priority === "rush" ? "order_rush" : "order_update";
      const payload = { orderId: input.orderId, priority: input.priority, tableLabel };
      eventBus.emit({ type: eventType, channel: "kitchen", restaurantId, payload });
      eventBus.emit({ type: eventType, channel: "bar", restaurantId, payload });
      return { success: true };
    }),

  // ─── UPDATE ITEM STATUS (KDS) ─────────────────────────────────────────────
  updateItemStatus: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      itemId: z.number(),
      status: z.enum(["pending", "preparing", "ready", "served"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(orderItems)
        .set({ status: input.status })
        .where(and(eq(orderItems.id, input.itemId), eq(orderItems.orderId, input.orderId)));
      // Auto-update order status based on items
      const items = await db.select().from(orderItems)
        .where(and(eq(orderItems.orderId, input.orderId), inArray(orderItems.status, ["pending", "preparing", "ready", "served"])));
      const statuses = items.map((i: { status: string }) => i.status);
      let newOrderStatus = order.status;
      if (statuses.length > 0 && statuses.every((s: string) => s === "ready" || s === "served")) newOrderStatus = "ready";
      else if (statuses.some((s: string) => s === "preparing")) newOrderStatus = "preparing";
      if (newOrderStatus !== order.status) {
        await db.update(orders).set({ status: newOrderStatus }).where(eq(orders.id, input.orderId));
      }
      // Emit SSE to kitchen + floor
      eventBus.emit({ type: "order_update", channel: "kitchen", restaurantId, payload: { orderId: input.orderId } });
      // If all non-cancelled items are now ready → notify waiter via floor channel
      if (newOrderStatus === "ready") {
        let tableLabel: string | null = null;
        if (order.floorPlanObjectId) {
          const [fp] = await db.select({ label: floorPlanObjects.label, tableNumber: floorPlanObjects.tableNumber })
            .from(floorPlanObjects).where(eq(floorPlanObjects.id, order.floorPlanObjectId));
          if (fp) tableLabel = fp.label ?? (fp.tableNumber ? `Tisch ${fp.tableNumber}` : null);
        } else if (order.tableId) {
          const [t] = await db.select({ name: restaurantTables.name })
            .from(restaurantTables).where(eq(restaurantTables.id, order.tableId));
          if (t) tableLabel = t.name ?? null;
        }
        eventBus.emit({ type: "order_ready", channel: "floor", restaurantId, payload: { orderId: input.orderId, tableLabel } });
      }
      return { success: true, newOrderStatus };
    }),

  // ─── MARK ITEM PICKED UP (Kellner ruft Produkt ab) ────────────────────────
  markItemPickedUp: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      itemId: z.number(),
      pickedUpBy: z.string().min(1).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(orderItems)
        .set({ pickedUpAt: new Date(), pickedUpBy: input.pickedUpBy, status: "served" })
        .where(and(eq(orderItems.id, input.itemId), eq(orderItems.orderId, input.orderId)));
      eventBus.emit({ type: "order_update", channel: "kitchen", restaurantId, payload: { orderId: input.orderId } });
      eventBus.emit({ type: "order_update", channel: "bar", restaurantId, payload: { orderId: input.orderId } });
      return { success: true };
    }),

  // ─── MARK COURSE PICKED UP (Kellner ruft ganzen Gang ab) ─────────────────
  markCoursePickedUp: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      course: z.number(),
      pickedUpBy: z.string().min(1).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(orderItems)
        .set({ pickedUpAt: new Date(), pickedUpBy: input.pickedUpBy, status: "served" })
        .where(and(
          eq(orderItems.orderId, input.orderId),
          eq(orderItems.course, input.course),
          inArray(orderItems.status, ["ready"]),
        ));
      eventBus.emit({ type: "order_update", channel: "kitchen", restaurantId, payload: { orderId: input.orderId } });
      eventBus.emit({ type: "order_update", channel: "bar", restaurantId, payload: { orderId: input.orderId } });
      return { success: true };
    }),

  // ─── GET RECENT ORDERS ────────────────────────────────────────────────────
  getRecentOrders: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const recentOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.restaurantId, restaurantId))
        .orderBy(desc(orders.createdAt))
        .limit(input.limit);
      return recentOrders;
    }),

  // ─── GET WAITER STATS (persönliche Kellner-Statistiken) ───────────────────
  getWaiterStats: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);
    const staffId = ctx.effectiveUserId!;

    const now = new Date();
    // Heute: Mitternacht bis jetzt
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    // Diese Woche: Montag 00:00
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    // Dieser Monat: 1. des Monats 00:00
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Kassierungsprinzip: Umsatz beim Kellner, der einkassiert hat (checkedOutByStaffId)
    const { gte } = await import("drizzle-orm");
    const myOrdersMonth = await db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        tipAmount: orders.tipAmount,
        guestCount: orders.guestCount,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
        paymentMethod: orders.paymentMethod,
        orderNumber: orders.orderNumber,
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.checkedOutByStaffId, staffId),
          eq(orders.status, "paid"),
          gte(orders.paidAt, monthStart),
        )
      )
      .orderBy(desc(orders.paidAt));

    type MonthOrder = typeof myOrdersMonth[0];

    // Aufteilen nach Zeitraum
    const todayOrders = myOrdersMonth.filter(
      (o: MonthOrder) => o.paidAt && new Date(o.paidAt) >= todayStart
    );
    const weekOrders = myOrdersMonth.filter(
      (o: MonthOrder) => o.paidAt && new Date(o.paidAt) >= weekStart
    );

    const sumRevenue = (list: MonthOrder[]) =>
      list.reduce((s: number, o: MonthOrder) => s + parseFloat(o.totalAmount ?? "0"), 0);
    const sumTips = (list: MonthOrder[]) =>
      list.reduce((s: number, o: MonthOrder) => s + parseFloat(o.tipAmount ?? "0"), 0);
    const sumGuests = (list: MonthOrder[]) =>
      list.reduce((s: number, o: MonthOrder) => s + (o.guestCount ?? 0), 0);

    // Letzte 10 abgeschlossenen Bestellungen (für Aktivitätsliste)
    const recentPaid = myOrdersMonth.slice(0, 10);

    // Offene Bestellungen des Kellners (aktiv)
    const myOpenOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalAmount: orders.totalAmount,
        guestCount: orders.guestCount,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.staffId, staffId),
          inArray(orders.status, ["pending", "preparing", "ready", "served"]),
        )
      )
      .orderBy(desc(orders.createdAt));

    // Durchschnittliche Bestelldauer (von createdAt bis paidAt) in Minuten
    const durationsMin = myOrdersMonth
      .filter((o: MonthOrder) => o.paidAt && o.createdAt)
      .map((o: MonthOrder) => {
        const diffMs = new Date(o.paidAt!).getTime() - new Date(o.createdAt).getTime();
        return diffMs / 60000;
      })
      .filter((d: number) => d > 0 && d < 300); // max 5h – Ausreisser ignorieren
    const avgOrderDurationMin =
      durationsMin.length > 0
        ? Math.round(durationsMin.reduce((a: number, b: number) => a + b, 0) / durationsMin.length)
        : null;

    // Zahlungsmethoden-Verteilung (heute)
    const paymentMethodCounts: Record<string, number> = {};
    for (const o of todayOrders) {
      if (o.paymentMethod) {
        paymentMethodCounts[o.paymentMethod] = (paymentMethodCounts[o.paymentMethod] ?? 0) + 1;
      }
    }

    return {
      today: {
        revenue: sumRevenue(todayOrders),
        tips: sumTips(todayOrders),
        orders: todayOrders.length,
        guests: sumGuests(todayOrders),
      },
      week: {
        revenue: sumRevenue(weekOrders),
        tips: sumTips(weekOrders),
        orders: weekOrders.length,
        guests: sumGuests(weekOrders),
      },
      month: {
        revenue: sumRevenue(myOrdersMonth),
        tips: sumTips(myOrdersMonth),
        orders: myOrdersMonth.length,
        guests: sumGuests(myOrdersMonth),
      },
      openOrders: myOpenOrders,
      recentPaid,
      avgOrderDurationMin,
      paymentMethodCounts,
    };
  }),

  // ─── VOID ITEM (Einzelposition stornieren) ───────────────────────────────
  voidItem: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      orderItemId: z.number(),
      quantity: z.number().min(1).default(1),
      reason: z.enum(["wrong_order", "customer_change", "quality", "duplicate", "other"]).default("other"),
      reasonNote: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(
        and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId))
      );
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Bestellung nicht gefunden" });
      if (order.status === "paid" || order.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Abgeschlossene Bestellungen können nicht storniert werden" });
      }
      const [item] = await db.select().from(orderItems).where(
        and(eq(orderItems.id, input.orderItemId), eq(orderItems.orderId, input.orderId))
      );
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Position nicht gefunden" });
      if (item.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Position bereits storniert" });
      const voidQty = Math.min(input.quantity, item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const totalVoided = unitPrice * voidQty;
      await db.insert(orderVoids).values({
        orderId: input.orderId, orderItemId: input.orderItemId, restaurantId,
        staffId: ctx.user!.id, quantity: voidQty,
        unitPrice: unitPrice.toFixed(2), totalVoided: totalVoided.toFixed(2),
        itemName: item.name, reason: input.reason, reasonNote: input.reasonNote,
        requiresApproval: false,
      });
      if (voidQty >= item.quantity) {
        await db.update(orderItems).set({ status: "cancelled" }).where(eq(orderItems.id, item.id));
      } else {
        const newQty = item.quantity - voidQty;
        const newTotal = (parseFloat(item.unitPrice) * newQty).toFixed(2);
        await db.update(orderItems).set({ quantity: newQty, totalPrice: newTotal }).where(eq(orderItems.id, item.id));
      }
      await recalcOrderTotals(db, input.orderId);
      return { success: true, totalVoided };
    }),

  // ─── GET VOID LOG (Storno-Protokoll) ─────────────────────────────────────────
  getVoidLog: protectedProcedure
    .input(z.object({ orderId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const voids = input.orderId
        ? await db.select().from(orderVoids).where(and(eq(orderVoids.restaurantId, restaurantId), eq(orderVoids.orderId, input.orderId))).orderBy(desc(orderVoids.createdAt)).limit(input.limit)
        : await db.select().from(orderVoids).where(eq(orderVoids.restaurantId, restaurantId)).orderBy(desc(orderVoids.createdAt)).limit(input.limit);
      return voids;
    }),

  // ─── ADD PAYMENT (Teilzahlung / Mischzahlung) ────────────────────────────
  addPayment: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      method: z.enum(["cash", "card", "twint", "voucher", "invoice"]),
      amount: z.number().positive(),
      reference: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Bestellung bereits bezahlt" });
      const existingPayments = await db.select().from(orderPayments).where(and(eq(orderPayments.orderId, input.orderId), eq(orderPayments.restaurantId, restaurantId)));
      const alreadyPaid = existingPayments.reduce((s: number, p: { amount: string }) => s + parseFloat(p.amount), 0);
      const orderTotal = parseFloat(order.totalAmount ?? "0");
      const remaining = orderTotal - alreadyPaid;
      if (input.amount > remaining + 0.01) throw new TRPCError({ code: "BAD_REQUEST", message: `Betrag übersteigt Restbetrag (${remaining.toFixed(2)})` });
      await db.insert(orderPayments).values({
        orderId: input.orderId, restaurantId, method: input.method,
        amount: input.amount.toFixed(2), reference: input.reference, staffId: ctx.user!.id,
      });
      const newPaid = alreadyPaid + input.amount;
      const newRemaining = orderTotal - newPaid;
      if (newRemaining <= 0.01) {
        await db.update(orders).set({ status: "paid", paymentMethod: input.method, paidAt: new Date(), checkedOutByStaffId: ctx.effectiveUserId! }).where(eq(orders.id, input.orderId));
        await db.update(orderItems).set({ status: "served" }).where(eq(orderItems.orderId, input.orderId));
      }
      return { success: true, paid: newPaid, remaining: Math.max(0, newRemaining), isFullyPaid: newRemaining <= 0.01 };
    }),

  // ─── GET ORDER PAYMENTS ───────────────────────────────────────────────────────
  getOrderPayments: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const payments = await db.select().from(orderPayments).where(and(eq(orderPayments.orderId, input.orderId), eq(orderPayments.restaurantId, restaurantId))).orderBy(orderPayments.createdAt);
      const [ord] = await db.select({ totalAmount: orders.totalAmount }).from(orders).where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId)));
      const total = parseFloat(ord?.totalAmount ?? "0");
      const paid = payments.reduce((s: number, p: { amount: string }) => s + parseFloat(p.amount), 0);
      return { payments, total, paid, remaining: Math.max(0, total - paid) };
    }),

  // ─── SPLIT BILL (Rechnung aufteilen) ─────────────────────────────────────
  splitBill: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      splitType: z.enum(["person", "product", "amount"]),
      splits: z.array(z.object({
        label: z.string().min(1),
        amount: z.number().positive(),
        itemIds: z.array(z.number()).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Bestellung bereits bezahlt" });
      await db.delete(billSplits).where(and(eq(billSplits.orderId, input.orderId), eq(billSplits.restaurantId, restaurantId)));
      const createdSplits: Array<{ id: number; label: string; amount: number }> = [];
      for (const split of input.splits) {
        const [inserted] = await db.insert(billSplits).values({
          orderId: input.orderId, restaurantId, splitType: input.splitType,
          splitLabel: split.label, totalAmount: split.amount.toFixed(2), isPaid: false,
        }).$returningId();
        if (split.itemIds?.length) {
          for (const itemId of split.itemIds) {
            const [item] = await db.select().from(orderItems).where(eq(orderItems.id, itemId));
            if (item) await db.insert(billSplitItems).values({ splitId: inserted.id, orderItemId: itemId, quantity: item.quantity, amount: item.totalPrice });
          }
        }
        createdSplits.push({ id: inserted.id, label: split.label, amount: split.amount });
      }
      return { success: true, splits: createdSplits };
    }),

  // ─── GET BILL SPLITS ───────────────────────────────────────────────────────────
  getBillSplits: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const rows = await db.select().from(billSplits).where(and(eq(billSplits.orderId, input.orderId), eq(billSplits.restaurantId, restaurantId))).orderBy(billSplits.createdAt);
      const splits = rows.map((s: typeof rows[0], idx: number) => ({
        id: s.id,
        splitNumber: idx + 1,
        totalAmount: s.totalAmount,
        status: s.isPaid ? "paid" : "open",
        paymentMethod: s.paymentMethod ?? null,
        splitLabel: s.splitLabel,
        splitType: s.splitType,
      }));
      return { splits };
    }),

  // ─── PAY SPLIT (Einzelnen Split bezahlen) ────────────────────────────────
  paySplit: protectedProcedure
    .input(z.object({
      splitId: z.number(),
      method: z.enum(["cash", "card", "twint", "voucher", "invoice"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [split] = await db.select().from(billSplits).where(and(eq(billSplits.id, input.splitId), eq(billSplits.restaurantId, restaurantId)));
      if (!split) throw new TRPCError({ code: "NOT_FOUND" });
      if (split.isPaid) throw new TRPCError({ code: "BAD_REQUEST", message: "Split bereits bezahlt" });
      await db.update(billSplits).set({ isPaid: true, paidAt: new Date(), paymentMethod: input.method }).where(eq(billSplits.id, input.splitId));
      const allSplits = await db.select().from(billSplits).where(and(eq(billSplits.orderId, split.orderId), eq(billSplits.restaurantId, restaurantId)));
      const allPaid = allSplits.every((s: { isPaid: boolean }) => s.isPaid);
      if (allPaid) {
        await db.update(orders).set({ status: "paid", paidAt: new Date(), paymentMethod: input.method, checkedOutByStaffId: ctx.effectiveUserId! }).where(eq(orders.id, split.orderId));
        await db.update(orderItems).set({ status: "served" }).where(eq(orderItems.orderId, split.orderId));
      }
      return { success: true, allPaid };
    }),

  // ─── SPLIT BY PERSONS (Artikel Personen zuweisen + Artikel aufteilen) ─────
  // Szenario: 5 Gäste, jeder zahlt seine Artikel, Weinflasche wird durch 5 geteilt
  splitByPersons: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      persons: z.array(z.object({
        label: z.string().min(1),           // z.B. "Gast 1", "Anna"
        // Artikel die dieser Person gehören
        items: z.array(z.object({
          orderItemId: z.number(),
          quantity: z.number().positive(),   // Menge die dieser Person zugewiesen wird
          amount: z.number().nonnegative(),  // Betrag (kann Anteil sein, z.B. 1/5 der Weinflasche)
        })),
      })).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Bestellung bereits bezahlt" });

      // Bestehende Splits löschen und neu erstellen
      await db.delete(billSplits).where(and(eq(billSplits.orderId, input.orderId), eq(billSplits.restaurantId, restaurantId)));

      const createdSplits: Array<{ id: number; label: string; amount: number }> = [];

      for (const person of input.persons) {
        const totalAmount = person.items.reduce((sum, i) => sum + i.amount, 0);
        if (totalAmount <= 0) continue; // Personen ohne Artikel überspringen

        const [inserted] = await db.insert(billSplits).values({
          orderId: input.orderId,
          restaurantId,
          splitType: "person",
          splitLabel: person.label,
          totalAmount: totalAmount.toFixed(2),
          isPaid: false,
        }).$returningId();

        // Artikel-Zuweisungen speichern
        for (const item of person.items) {
          await db.insert(billSplitItems).values({
            splitId: inserted.id,
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            amount: item.amount.toFixed(2),
          });
        }

        createdSplits.push({ id: inserted.id, label: person.label, amount: totalAmount });
      }

      return { success: true, splits: createdSplits };
    }),

  // ─── SEND COURSE (Bestimmten Gang an Küche senden) ───────────────────────
  sendCourse: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      courseNumber: z.number().min(1).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      const courseItems = await db.select().from(orderItems).where(
        and(eq(orderItems.orderId, input.orderId), eq(orderItems.course, input.courseNumber), eq(orderItems.status, "pending"))
      );
      if (courseItems.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Keine ausstehenden Positionen in Gang ${input.courseNumber}` });
      await db.update(orderItems).set({ status: "preparing" }).where(
        and(eq(orderItems.orderId, input.orderId), eq(orderItems.course, input.courseNumber), eq(orderItems.status, "pending"))
      );
      return { success: true, sentItems: courseItems.length, courseNumber: input.courseNumber };
    }),

  // ─── ARTIKEL VERSCHIEBEN ────────────────────────────────────────────────────
  moveItems: protectedProcedure
    .input(z.object({
      sourceOrderId: z.number(),
      targetOrderId: z.number(),
      itemIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB nicht verfügbar" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant" });
      const [srcOrder] = await db.select().from(orders)
        .where(and(eq(orders.id, input.sourceOrderId), eq(orders.restaurantId, restaurantId)));
      if (!srcOrder) throw new TRPCError({ code: "NOT_FOUND", message: "Quell-Tisch nicht gefunden" });
      const [tgtOrder] = await db.select().from(orders)
        .where(and(eq(orders.id, input.targetOrderId), eq(orders.restaurantId, restaurantId)));
      if (!tgtOrder) throw new TRPCError({ code: "NOT_FOUND", message: "Ziel-Tisch nicht gefunden" });
      await db.update(orderItems)
        .set({ orderId: input.targetOrderId })
        .where(and(inArray(orderItems.id, input.itemIds), eq(orderItems.orderId, input.sourceOrderId)));
      await recalcOrderTotals(db, input.sourceOrderId);
      await recalcOrderTotals(db, input.targetOrderId);
      return { success: true, movedCount: input.itemIds.length };
    }),

  // ─── TISCHE ZUSAMMENFÜHREN ──────────────────────────────────────────────────
  mergeTables: protectedProcedure
    .input(z.object({
      masterOrderId: z.number(),
      sourceOrderId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB nicht verfügbar" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant" });
      const [masterOrder] = await db.select().from(orders)
        .where(and(eq(orders.id, input.masterOrderId), eq(orders.restaurantId, restaurantId)));
      if (!masterOrder) throw new TRPCError({ code: "NOT_FOUND", message: "Haupttisch nicht gefunden" });
      const [sourceOrder] = await db.select().from(orders)
        .where(and(eq(orders.id, input.sourceOrderId), eq(orders.restaurantId, restaurantId)));
      if (!sourceOrder) throw new TRPCError({ code: "NOT_FOUND", message: "Quell-Tisch nicht gefunden" });
      await db.update(orderItems).set({ orderId: input.masterOrderId }).where(eq(orderItems.orderId, input.sourceOrderId));
      await db.insert(tableMerges).values({
        restaurantId,
        masterOrderId: input.masterOrderId,
        sourceOrderId: input.sourceOrderId,
        masterTableLabel: masterOrder.tableLabel ?? String(masterOrder.tableId ?? masterOrder.id),
        sourceTableLabel: sourceOrder.tableLabel ?? String(sourceOrder.tableId ?? sourceOrder.id),
        mergedByStaffId: ctx.effectiveUserId!,
        status: "merged",
      });
      await db.update(orders).set({ status: "closed" }).where(eq(orders.id, input.sourceOrderId));
      await recalcOrderTotals(db, input.masterOrderId);
      return { success: true, masterOrderId: input.masterOrderId, mergedFrom: sourceOrder.tableLabel };
    }),

  // ─── TISCHE TRENNEN ─────────────────────────────────────────────────────────
  splitMergedTable: protectedProcedure
    .input(z.object({
      mergeId: z.number(),
      itemIdsToMove: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB nicht verfügbar" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant" });
      const [merge] = await db.select().from(tableMerges)
        .where(and(eq(tableMerges.id, input.mergeId), eq(tableMerges.restaurantId, restaurantId), eq(tableMerges.status, "merged")));
      if (!merge) throw new TRPCError({ code: "NOT_FOUND", message: "Zusammenführung nicht gefunden" });
      await db.update(orders).set({ status: "pending" }).where(eq(orders.id, merge.sourceOrderId));
      if (input.itemIdsToMove.length > 0) {
        await db.update(orderItems).set({ orderId: merge.sourceOrderId })
          .where(and(inArray(orderItems.id, input.itemIdsToMove), eq(orderItems.orderId, merge.masterOrderId)));
      }
      await db.update(tableMerges).set({ status: "split", splitAt: new Date(), splitByStaffId: ctx.effectiveUserId! })
        .where(eq(tableMerges.id, input.mergeId));
      await recalcOrderTotals(db, merge.masterOrderId);
      await recalcOrderTotals(db, merge.sourceOrderId);
      return { success: true, restoredOrderId: merge.sourceOrderId };
    }),

  // ─── UPDATE ORDER TYPE (Vor-Ort / Take-away) ───────────────────────────────
  // MWST-7: Bestelltyp ändern – löst Neuberechnung aller Steuerklassen aus
  updateOrderType: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      type: z.enum(["dine_in", "takeaway"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status === "paid" || order.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bestellung ist bereits abgeschlossen" });
      }
      // Bestelltyp aktualisieren
      await db.update(orders).set({ type: input.type }).where(eq(orders.id, input.orderId));
      // Alle Positionen ohne explizite Steuerklasse auf neuen Fallback-Satz setzen
      const newFallbackRate = input.type === "takeaway" ? "2.60" : "8.10";
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
      for (const item of items) {
        // Nur Positionen ohne Steuerklassen-Zuweisung aktualisieren
        if (!(item as any).taxClassId) {
          await db.update(orderItems)
            .set({ taxRate: newFallbackRate })
            .where(eq(orderItems.id, item.id));
        }
      }
      await recalcOrderTotals(db, input.orderId);
      eventBus.emit({ type: "order_update", channel: "order", restaurantId, payload: { orderId: input.orderId } });
      return { success: true };
    }),

  // ─── AKTIVE MERGES ABRUFEN ──────────────────────────────────────────────────
  // ─── REMOVE ITEM BY MENU ITEM ID (for voice order cancellation) ─────────────
  removeItemByMenuItemId: protectedProcedure
    .input(z.object({ orderId: z.number(), menuItemId: z.number(), quantity: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [order] = await db.select().from(orders).where(and(
        eq(orders.id, input.orderId),
        eq(orders.restaurantId, restaurantId),
      ));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Bestellung nicht gefunden" });
      // Find order items matching the menuItemId (stored as productId in order_items)
      const matchingItems = await db.select().from(orderItems).where(and(
        eq(orderItems.orderId, input.orderId),
        eq(orderItems.productId, input.menuItemId),
      ));
      if (matchingItems.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artikel nicht in Bestellung gefunden" });
      }
      const qty = input.quantity ?? 1;
      let remaining = qty;
      for (const item of matchingItems) {
        if (remaining <= 0) break;
        if (item.quantity <= remaining) {
          await db.delete(orderItems).where(eq(orderItems.id, item.id));
          remaining -= item.quantity;
        } else {
          await db.update(orderItems)
            .set({ quantity: item.quantity - remaining })
            .where(eq(orderItems.id, item.id));
          remaining = 0;
        }
      }
      await recalcOrderTotals(db, input.orderId);
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      eventBus.emit({ type: "order_update", channel: "order", restaurantId, payload: { orderId: input.orderId } });
      return { ...updatedOrder, items };
    }),

  getActiveMerges: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB nicht verfügbar" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant" });
      const merges = await db.select().from(tableMerges)
        .where(and(
          eq(tableMerges.restaurantId, restaurantId),
          eq(tableMerges.status, "merged"),
          or(eq(tableMerges.masterOrderId, input.orderId), eq(tableMerges.sourceOrderId, input.orderId))
        ));
      return merges;
    }),

  // ─── GET PICKUP HISTORY (Abruf-Verlauf für Admin) ─────────────────────────────────────────
  getPickupHistory: protectedProcedure
    .input(z.object({
      fromDate: z.number().optional(), // Unix ms
      toDate: z.number().optional(),   // Unix ms
      pickedUpBy: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      // Load all order_items that have been picked up, joined with order for table info
      const allOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.restaurantId, restaurantId))
        .orderBy(desc(orders.createdAt));

      const orderIds = allOrders.map((o: { id: number }) => o.id);
      if (orderIds.length === 0) return [];

      const items = await db
        .select()
        .from(orderItems)
        .where(and(
          inArray(orderItems.orderId, orderIds),
          // only items that have been picked up
        ))
        .orderBy(desc(orderItems.pickedUpAt));

      // Filter: only picked-up items
      const pickedItems = items.filter((i: { pickedUpAt?: Date | null; pickedUpBy?: string | null }) => i.pickedUpAt != null);

      // Apply date filter
      const filtered = pickedItems.filter((i: { pickedUpAt?: Date | null; pickedUpBy?: string | null }) => {
        const ts = i.pickedUpAt ? new Date(i.pickedUpAt).getTime() : 0;
        if (input.fromDate && ts < input.fromDate) return false;
        if (input.toDate && ts > input.toDate) return false;
        if (input.pickedUpBy && i.pickedUpBy !== input.pickedUpBy) return false;
        return true;
      }).slice(0, input.limit);

      // Build lookup for order info
      const orderMap = new Map(allOrders.map((o: { id: number; orderNumber: string; tableLabel?: string | null; floorPlanObjectId?: number | null }) => [o.id, o]));

      return filtered.map((item: {
        id: number; orderId: number; name: string; quantity: number; course: number;
        pickedUpAt?: Date | null; pickedUpBy?: string | null;
      }) => {
        const order = orderMap.get(item.orderId) as { orderNumber: string; tableLabel?: string | null } | undefined;
        return {
          itemId: item.id,
          orderId: item.orderId,
          orderNumber: order?.orderNumber ?? "-",
          tableLabel: (order as { tableLabel?: string | null } | undefined)?.tableLabel ?? null,
          itemName: item.name,
          quantity: item.quantity,
          course: item.course,
          pickedUpAt: item.pickedUpAt ? new Date(item.pickedUpAt).getTime() : null,
          pickedUpBy: item.pickedUpBy ?? null,
        };
      });
    }),

  // ─── GET READY ORDERS (Kellner-Bereit-Übersicht) ─────────────────────────────────────────
  getReadyOrders: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);

    // Load all open orders for this restaurant
    const openOrders = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.restaurantId, restaurantId),
        inArray(orders.status, ["pending", "preparing", "ready"]),
      ))
      .orderBy(orders.createdAt);

    if (openOrders.length === 0) return [];

    const orderIds = openOrders.map((o: { id: number }) => o.id);
    const allItems = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));

    // Group items by order, only return orders that have at least one "ready" item not yet picked up
    const result = [];
    for (const order of openOrders) {
      const items = allItems.filter((i: { orderId: number }) => i.orderId === order.id);
      const readyItems = items.filter((i: { status: string; pickedUpAt?: Date | null }) =>
        i.status === "ready" && !i.pickedUpAt
      );
      if (readyItems.length === 0) continue;

      // Resolve table label
      let tableLabel: string | null = (order as { tableLabel?: string | null }).tableLabel ?? null;
      if (!tableLabel && (order as { floorPlanObjectId?: number | null }).floorPlanObjectId) {
        const [obj] = await db.select().from(floorPlanObjects)
          .where(eq(floorPlanObjects.id, (order as { floorPlanObjectId: number }).floorPlanObjectId));
        if (obj) tableLabel = (obj as { label?: string | null }).label ?? null;
      }

      result.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableLabel,
        createdAt: order.createdAt ? new Date(order.createdAt).getTime() : null,
        readyItems: readyItems.map((i: {
          id: number; name: string; quantity: number; course: number; pickedUpAt?: Date | null;
        }) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          course: i.course,
          readySince: null, // pickedUpAt is null here by filter
        })),
      });
    }

    // Sort: oldest first (longest waiting)
    return result.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }),
});

// ─── HELPER: Recalculate order totals (Schweizer MwSt. per Produkt-Steuerklasse) ────────
async function recalcOrderTotals(db: Awaited<ReturnType<typeof import("./db").getDb>>, orderId: number) {
  const items = await db.select().from(orderItems).where(
    and(eq(orderItems.orderId, orderId), inArray(orderItems.status, ["pending", "preparing", "ready", "served"]))
  );
  // Subtotal = Summe aller Bruttopreise (Preis inkl. MwSt. gemäss PBV)
  const subtotal = items.reduce((s: number, i: { totalPrice: string }) => s + parseFloat(i.totalPrice), 0);

  // Schweizer MwSt.: Rückwärtsberechnung aus Bruttobetrag
  // Steuerklasse pro Position aus gespeichertem taxRate-Feld (gesetzt beim addItem)
  // Fallback: 8.10% (Restaurant-Standard vor Ort)
  const breakdown = new Map<string, { gross: number; net: number; tax: number }>();
  for (const item of items) {
    const rateStr = (item as { taxRate?: string | null }).taxRate ?? "8.10";
    const rate = parseFloat(rateStr) / 100;
    const gross = parseFloat(item.totalPrice);
    const net = gross / (1 + rate);
    const tax = gross - net;
    const existing = breakdown.get(rateStr) ?? { gross: 0, net: 0, tax: 0 };
    breakdown.set(rateStr, { gross: existing.gross + gross, net: existing.net + net, tax: existing.tax + tax });
  }
  const totalTax = Array.from(breakdown.values()).reduce((s, v) => s + v.tax, 0);
  // totalAmount = subtotal (Brutto), da MwSt. bereits enthalten (nicht addiert)
  const taxBreakdown = Array.from(breakdown.entries()).map(([rate, v]) => ({
    rate,
    gross: v.gross.toFixed(2),
    base: v.net.toFixed(2),
    amount: v.tax.toFixed(2),
  }));
  await db.update(orders).set({
    subtotal: subtotal.toFixed(2),
    taxAmount: totalTax.toFixed(2),
    taxBreakdown: taxBreakdown,
    totalAmount: subtotal.toFixed(2), // Brutto = Total (MwSt. inkl.)
  }).where(eq(orders.id, orderId));
}
