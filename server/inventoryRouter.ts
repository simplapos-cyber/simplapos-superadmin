import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import {
  inventoryItems,
  inventorySuppliers,
  inventoryStockMovements,
  inventoryPurchaseOrders,
  inventoryPurchaseOrderItems,
  inventoryRecipes,
  inventoryDeliveryDiscrepancies,
  menuItems,
} from "../drizzle/schema";
import { eq, and, gte, desc, asc, sql, like, inArray } from "drizzle-orm";

// ─── HELPER ──────────────────────────────────────────────────────────────────
async function getDbAndRestaurant(ctx: { user: { id: number; role: string; restaurantId?: number | null } }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Datenbank nicht verfügbar" });
  const restaurantId = ctx.user.restaurantId;
  if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return { db, restaurantId };
}

async function recordMovement(
  db: Awaited<ReturnType<typeof getDb>>,
  params: {
    restaurantId: number;
    itemId: number;
    type: "purchase" | "sale" | "waste" | "correction" | "transfer" | "return" | "production";
    quantity: number;
    unitCost?: number;
    referenceType?: string;
    referenceId?: number;
    notes?: string;
    performedBy?: number;
  }
) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [item] = await db
    .select({ currentStock: inventoryItems.currentStock, averageCost: inventoryItems.averageCost })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, params.itemId), eq(inventoryItems.restaurantId, params.restaurantId)));

  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Artikel nicht gefunden" });

  const currentStock = parseFloat(item.currentStock ?? "0");
  const newStock = currentStock + params.quantity;
  const totalCost = params.unitCost ? Math.abs(params.quantity) * params.unitCost : undefined;

  const updateData: Record<string, unknown> = { currentStock: newStock.toFixed(3) };
  if (params.type === "purchase" && params.unitCost) {
    updateData.lastPurchasePrice = params.unitCost.toFixed(4);
    const oldAvg = parseFloat(item.averageCost ?? "0");
    const newAvg = currentStock > 0
      ? (currentStock * oldAvg + Math.abs(params.quantity) * params.unitCost) / (currentStock + Math.abs(params.quantity))
      : params.unitCost;
    updateData.averageCost = newAvg.toFixed(4);
  }

  await db.update(inventoryItems).set(updateData).where(eq(inventoryItems.id, params.itemId));

  await db.insert(inventoryStockMovements).values({
    restaurantId: params.restaurantId,
    itemId: params.itemId,
    type: params.type,
    quantity: params.quantity.toFixed(3),
    unitCost: params.unitCost?.toFixed(4),
    totalCost: totalCost?.toFixed(2),
    stockAfter: newStock.toFixed(3),
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    performedBy: params.performedBy,
  });

  return newStock;
}

function getStockStatus(currentStock: string | null, minStock: string | null, reorderPoint: string | null, maxStock: string | null) {
  const current = parseFloat(currentStock ?? "0");
  const min = parseFloat(minStock ?? "0");
  const reorder = parseFloat(reorderPoint ?? "0");
  const max = parseFloat(maxStock ?? "0");
  if (current <= 0) return "out" as const;
  if (current <= min) return "critical" as const;
  if (reorder > 0 && current <= reorder) return "low" as const;
  if (max > 0 && current >= max) return "overstock" as const;
  return "ok" as const;
}

export const inventoryRouter = router({

  // ─── LAGERARTIKEL ──────────────────────────────────────────────────────────

  listItems: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      storageLocation: z.string().optional(),
      lowStock: z.boolean().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const conditions = [
        eq(inventoryItems.restaurantId, restaurantId),
        eq(inventoryItems.isActive, true),
      ];
      if (input.category) conditions.push(eq(inventoryItems.category, input.category));
      if (input.storageLocation) conditions.push(eq(inventoryItems.storageLocation, input.storageLocation));
      if (input.search) conditions.push(like(inventoryItems.name, `%${input.search}%`));

      const rows = await db
        .select({
          id: inventoryItems.id,
          restaurantId: inventoryItems.restaurantId,
          supplierId: inventoryItems.supplierId,
          name: inventoryItems.name,
          sku: inventoryItems.sku,
          description: inventoryItems.description,
          category: inventoryItems.category,
          storageLocation: inventoryItems.storageLocation,
          unit: inventoryItems.unit,
          unitSize: inventoryItems.unitSize,
          currentStock: inventoryItems.currentStock,
          minStock: inventoryItems.minStock,
          maxStock: inventoryItems.maxStock,
          reorderPoint: inventoryItems.reorderPoint,
          reorderQty: inventoryItems.reorderQty,
          costPerUnit: inventoryItems.costPerUnit,
          lastPurchasePrice: inventoryItems.lastPurchasePrice,
          averageCost: inventoryItems.averageCost,
          shelfLifeDays: inventoryItems.shelfLifeDays,
          autoReorder: inventoryItems.autoReorder,
          autoReorderSupplierId: inventoryItems.autoReorderSupplierId,
          isActive: inventoryItems.isActive,
          imageUrl: inventoryItems.imageUrl,
          expiresAt: inventoryItems.expiresAt,
          chargeNr: inventoryItems.chargeNr,
          bestBefore: inventoryItems.bestBefore,
          locationId: inventoryItems.locationId,
          createdAt: inventoryItems.createdAt,
          updatedAt: inventoryItems.updatedAt,
          supplierName: inventorySuppliers.name,
        })
        .from(inventoryItems)
        .leftJoin(inventorySuppliers, eq(inventoryItems.supplierId, inventorySuppliers.id))
        .where(and(...conditions))
        .orderBy(asc(inventoryItems.category), asc(inventoryItems.name));

            type RowType = (typeof rows)[0];
      const result = rows.map((r: RowType) => ({
        ...r,
        stockStatus: getStockStatus(r.currentStock, r.minStock, r.reorderPoint, r.maxStock),
      }));
      return input.lowStock
        ? result.filter((r: RowType & { stockStatus: string }) => r.stockStatus === "critical" || r.stockStatus === "out")
        : result;
    }),

  getItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [item] = await db
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, input.id), eq(inventoryItems.restaurantId, restaurantId)));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      return item;
    }),

  createItem: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      sku: z.string().max(100).optional(),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      storageLocation: z.string().max(200).optional(),
      unit: z.string().min(1).max(50),
      unitSize: z.number().positive().optional(),
      currentStock: z.number().min(0).default(0),
      minStock: z.number().min(0).default(0),
      maxStock: z.number().min(0).optional(),
      reorderPoint: z.number().min(0).optional(),
      reorderQty: z.number().min(0).optional(),
      costPerUnit: z.number().min(0).optional(),
      shelfLifeDays: z.number().int().positive().optional(),
      supplierId: z.number().int().optional(),
      autoReorder: z.boolean().default(false),
      autoReorderSupplierId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [result] = await db.insert(inventoryItems).values({
        restaurantId,
        name: input.name,
        sku: input.sku,
        description: input.description,
        category: input.category,
        storageLocation: input.storageLocation,
        unit: input.unit,
        unitSize: input.unitSize?.toFixed(3),
        currentStock: input.currentStock.toFixed(3),
        minStock: input.minStock.toFixed(3),
        maxStock: input.maxStock?.toFixed(3),
        reorderPoint: input.reorderPoint?.toFixed(3),
        reorderQty: input.reorderQty?.toFixed(3),
        costPerUnit: input.costPerUnit?.toFixed(4),
        shelfLifeDays: input.shelfLifeDays,
        supplierId: input.supplierId,
        autoReorder: input.autoReorder,
        autoReorderSupplierId: input.autoReorderSupplierId,
      });

      const insertId = (result as { insertId: number }).insertId;

      if (input.currentStock > 0) {
        await db.insert(inventoryStockMovements).values({
          restaurantId,
          itemId: insertId,
          type: "correction",
          quantity: input.currentStock.toFixed(3),
          stockAfter: input.currentStock.toFixed(3),
          notes: "Anfangsbestand",
          performedBy: ctx.user.id,
        });
      }

      return { success: true, id: insertId };
    }),

  updateItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      sku: z.string().max(100).optional(),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      storageLocation: z.string().max(200).optional(),
      unit: z.string().min(1).max(50).optional(),
      unitSize: z.number().positive().optional(),
      minStock: z.number().min(0).optional(),
      maxStock: z.number().min(0).optional(),
      reorderPoint: z.number().min(0).optional(),
      reorderQty: z.number().min(0).optional(),
      costPerUnit: z.number().min(0).optional(),
      shelfLifeDays: z.number().int().positive().optional(),
      supplierId: z.number().int().optional(),
      autoReorder: z.boolean().optional(),
      autoReorderSupplierId: z.number().int().optional(),
      isActive: z.boolean().optional(),
      // QPM-7: MHD-Tracking
      chargeNr: z.string().max(100).optional().nullable(),
      bestBefore: z.date().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const { id, unitSize, minStock, maxStock, reorderPoint, reorderQty, costPerUnit, chargeNr, bestBefore, ...rest } = input;

      await db.update(inventoryItems).set({
        ...rest,
        unitSize: unitSize?.toFixed(3),
        minStock: minStock?.toFixed(3),
        maxStock: maxStock?.toFixed(3),
        reorderPoint: reorderPoint?.toFixed(3),
        reorderQty: reorderQty?.toFixed(3),
        costPerUnit: costPerUnit?.toFixed(4),
        chargeNr: chargeNr ?? undefined,
        bestBefore: bestBefore ?? undefined,
      }).where(and(eq(inventoryItems.id, id), eq(inventoryItems.restaurantId, restaurantId)));

      return { success: true };
    }),

  adjustStock: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      quantity: z.number().positive("Menge muss positiv sein"),
      type: z.enum(["purchase", "waste", "correction", "transfer", "return", "production"]),
      unitCost: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const newStock = await recordMovement(db, {
        restaurantId,
        itemId: input.itemId,
        type: input.type,
        quantity: input.quantity,
        unitCost: input.unitCost,
        notes: input.notes,
        performedBy: ctx.user.id,
      });
      return { success: true, newStock };
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.update(inventoryItems).set({ isActive: false })
        .where(and(eq(inventoryItems.id, input.id), eq(inventoryItems.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ─── WARENBEWEGUNGEN ───────────────────────────────────────────────────────

  listMovements: protectedProcedure
    .input(z.object({
      itemId: z.number().optional(),
      type: z.enum(["purchase", "sale", "waste", "correction", "transfer", "return", "production"]).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const conditions = [eq(inventoryStockMovements.restaurantId, restaurantId)];
      if (input.itemId) conditions.push(eq(inventoryStockMovements.itemId, input.itemId));
      if (input.type) conditions.push(eq(inventoryStockMovements.type, input.type));

      const rows = await db
        .select({
          id: inventoryStockMovements.id,
          restaurantId: inventoryStockMovements.restaurantId,
          itemId: inventoryStockMovements.itemId,
          type: inventoryStockMovements.type,
          quantity: inventoryStockMovements.quantity,
          unitCost: inventoryStockMovements.unitCost,
          totalCost: inventoryStockMovements.totalCost,
          stockAfter: inventoryStockMovements.stockAfter,
          referenceType: inventoryStockMovements.referenceType,
          referenceId: inventoryStockMovements.referenceId,
          notes: inventoryStockMovements.notes,
          performedBy: inventoryStockMovements.performedBy,
          createdAt: inventoryStockMovements.createdAt,
          itemName: inventoryItems.name,
          itemUnit: inventoryItems.unit,
        })
        .from(inventoryStockMovements)
        .leftJoin(inventoryItems, eq(inventoryStockMovements.itemId, inventoryItems.id))
        .where(and(...conditions))
        .orderBy(desc(inventoryStockMovements.createdAt))
        .limit(input.limit);

      return rows;
    }),

  // ─── LIEFERANTEN ───────────────────────────────────────────────────────────

  listSuppliers: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);
    return db.select().from(inventorySuppliers)
      .where(and(eq(inventorySuppliers.restaurantId, restaurantId), eq(inventorySuppliers.isActive, true)))
      .orderBy(asc(inventorySuppliers.name));
  }),

  createSupplier: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      contactName: z.string().max(200).optional(),
      email: z.string().email().optional().or(z.literal("")),
      phone: z.string().max(50).optional(),
      address: z.string().optional(),
      website: z.string().max(500).optional(),
      minOrderValue: z.number().min(0).optional(),
      deliveryDays: z.number().int().min(0).max(30).optional(),
      orderDays: z.string().max(100).optional(),
      paymentTerms: z.string().max(200).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.insert(inventorySuppliers).values({
        restaurantId,
        ...input,
        email: input.email || undefined,
        minOrderValue: input.minOrderValue?.toFixed(2),
      });
      return { success: true };
    }),

  updateSupplier: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      contactName: z.string().max(200).optional(),
      email: z.string().email().optional().or(z.literal("")),
      phone: z.string().max(50).optional(),
      address: z.string().optional(),
      website: z.string().max(500).optional(),
      minOrderValue: z.number().min(0).optional(),
      deliveryDays: z.number().int().min(0).max(30).optional(),
      orderDays: z.string().max(100).optional(),
      paymentTerms: z.string().max(200).optional(),
      notes: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const { id, minOrderValue, email, ...rest } = input;
      await db.update(inventorySuppliers).set({
        ...rest,
        email: email || undefined,
        minOrderValue: minOrderValue?.toFixed(2),
      }).where(and(eq(inventorySuppliers.id, id), eq(inventorySuppliers.restaurantId, restaurantId)));
      return { success: true };
    }),

  deleteSupplier: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.update(inventorySuppliers).set({ isActive: false })
        .where(and(eq(inventorySuppliers.id, input.id), eq(inventorySuppliers.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ─── BESTELLUNGEN AN LIEFERANTEN ──────────────────────────────────────────

  listPurchaseOrders: protectedProcedure
    .input(z.object({
      status: z.enum(["draft", "sent", "confirmed", "partial", "received", "cancelled"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const conditions = [eq(inventoryPurchaseOrders.restaurantId, restaurantId)];
      if (input.status) conditions.push(eq(inventoryPurchaseOrders.status, input.status));

      const rows = await db
        .select({
          id: inventoryPurchaseOrders.id,
          restaurantId: inventoryPurchaseOrders.restaurantId,
          supplierId: inventoryPurchaseOrders.supplierId,
          orderNumber: inventoryPurchaseOrders.orderNumber,
          status: inventoryPurchaseOrders.status,
          subtotal: inventoryPurchaseOrders.subtotal,
          taxAmount: inventoryPurchaseOrders.taxAmount,
          totalAmount: inventoryPurchaseOrders.totalAmount,
          expectedDelivery: inventoryPurchaseOrders.expectedDelivery,
          receivedAt: inventoryPurchaseOrders.receivedAt,
          notes: inventoryPurchaseOrders.notes,
          aiGenerated: inventoryPurchaseOrders.aiGenerated,
          aiReason: inventoryPurchaseOrders.aiReason,
          createdBy: inventoryPurchaseOrders.createdBy,
          createdAt: inventoryPurchaseOrders.createdAt,
          updatedAt: inventoryPurchaseOrders.updatedAt,
          supplierName: inventorySuppliers.name,
        })
        .from(inventoryPurchaseOrders)
        .leftJoin(inventorySuppliers, eq(inventoryPurchaseOrders.supplierId, inventorySuppliers.id))
        .where(and(...conditions))
        .orderBy(desc(inventoryPurchaseOrders.createdAt));

      return rows;
    }),

  getPurchaseOrder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [order] = await db
        .select({
          id: inventoryPurchaseOrders.id,
          restaurantId: inventoryPurchaseOrders.restaurantId,
          supplierId: inventoryPurchaseOrders.supplierId,
          orderNumber: inventoryPurchaseOrders.orderNumber,
          status: inventoryPurchaseOrders.status,
          subtotal: inventoryPurchaseOrders.subtotal,
          taxAmount: inventoryPurchaseOrders.taxAmount,
          totalAmount: inventoryPurchaseOrders.totalAmount,
          expectedDelivery: inventoryPurchaseOrders.expectedDelivery,
          receivedAt: inventoryPurchaseOrders.receivedAt,
          notes: inventoryPurchaseOrders.notes,
          aiGenerated: inventoryPurchaseOrders.aiGenerated,
          aiReason: inventoryPurchaseOrders.aiReason,
          supplierName: inventorySuppliers.name,
          supplierEmail: inventorySuppliers.email,
          supplierPhone: inventorySuppliers.phone,
        })
        .from(inventoryPurchaseOrders)
        .leftJoin(inventorySuppliers, eq(inventoryPurchaseOrders.supplierId, inventorySuppliers.id))
        .where(and(eq(inventoryPurchaseOrders.id, input.id), eq(inventoryPurchaseOrders.restaurantId, restaurantId)));

      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const items = await db
        .select({
          id: inventoryPurchaseOrderItems.id,
          purchaseOrderId: inventoryPurchaseOrderItems.purchaseOrderId,
          itemId: inventoryPurchaseOrderItems.itemId,
          orderedQty: inventoryPurchaseOrderItems.orderedQty,
          receivedQty: inventoryPurchaseOrderItems.receivedQty,
          unitCost: inventoryPurchaseOrderItems.unitCost,
          totalCost: inventoryPurchaseOrderItems.totalCost,
          notes: inventoryPurchaseOrderItems.notes,
          itemName: inventoryItems.name,
          itemUnit: inventoryItems.unit,
        })
        .from(inventoryPurchaseOrderItems)
        .leftJoin(inventoryItems, eq(inventoryPurchaseOrderItems.itemId, inventoryItems.id))
        .where(eq(inventoryPurchaseOrderItems.purchaseOrderId, input.id));

      return { ...order, items };
    }),

  createPurchaseOrder: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      expectedDelivery: z.date().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        orderedQty: z.number().positive(),
        unitCost: z.number().min(0),
      })),
      aiGenerated: z.boolean().default(false),
      aiReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      const subtotal = input.items.reduce((sum, i) => sum + i.orderedQty * i.unitCost, 0);
      const taxAmount = subtotal * 0.077;
      const totalAmount = subtotal + taxAmount;

      const [result] = await db.insert(inventoryPurchaseOrders).values({
        restaurantId,
        supplierId: input.supplierId,
        orderNumber,
        status: "draft",
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        expectedDelivery: input.expectedDelivery,
        notes: input.notes,
        aiGenerated: input.aiGenerated,
        aiReason: input.aiReason,
        createdBy: ctx.user.id,
      });

      const orderId = (result as { insertId: number }).insertId;

      for (const item of input.items) {
        await db.insert(inventoryPurchaseOrderItems).values({
          purchaseOrderId: orderId,
          itemId: item.itemId,
          orderedQty: item.orderedQty.toFixed(3),
          unitCost: item.unitCost.toFixed(4),
          totalCost: (item.orderedQty * item.unitCost).toFixed(2),
        });
      }

      return { success: true, orderId, orderNumber };
    }),

  sendPurchaseOrder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.update(inventoryPurchaseOrders).set({ status: "sent" })
        .where(and(eq(inventoryPurchaseOrders.id, input.id), eq(inventoryPurchaseOrders.restaurantId, restaurantId)));
      return { success: true };
    }),

  receivePurchaseOrder: protectedProcedure
    .input(z.object({
      id: z.number(),
      items: z.array(z.object({
        itemId: z.number(),
        orderedQty: z.number().min(0), // Bestellte Menge (aus Bestellung)
        receivedQty: z.number().min(0), // Tatsächlich gelieferte Menge
        unitCost: z.number().min(0).optional(),
        discrepancyType: z.enum(["short_delivery", "over_delivery", "quality_issue", "wrong_item"]).optional(),
        discrepancyNotes: z.string().optional(),
      })),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      // Bestellung laden um supplierId zu ermitteln
      const [order] = await db
        .select({ supplierId: inventoryPurchaseOrders.supplierId, expectedDelivery: inventoryPurchaseOrders.expectedDelivery, sentAt: inventoryPurchaseOrders.sentAt })
        .from(inventoryPurchaseOrders)
        .where(and(eq(inventoryPurchaseOrders.id, input.id), eq(inventoryPurchaseOrders.restaurantId, restaurantId)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Bestellung nicht gefunden" });

      let totalOrdered = 0;
      let totalReceived = 0;
      const discrepancies: Array<{ itemId: number; orderedQty: number; receivedQty: number; diff: number; unitCost?: number; type: string; notes?: string }> = [];

      for (const item of input.items) {
        totalOrdered += item.orderedQty;
        totalReceived += item.receivedQty;

        // Wareneingang buchen (auch Teillieferungen)
        if (item.receivedQty > 0) {
          await recordMovement(db, {
            restaurantId,
            itemId: item.itemId,
            type: "purchase",
            quantity: item.receivedQty,
            unitCost: item.unitCost,
            referenceType: "purchase_order",
            referenceId: input.id,
            notes: input.notes ?? `Wareneingang Bestellung #${input.id}`,
            performedBy: ctx.user.id,
          });
        }

        // Empfangene Menge in Bestellposition aktualisieren
        await db.update(inventoryPurchaseOrderItems)
          .set({ receivedQty: item.receivedQty.toFixed(3) })
          .where(and(
            eq(inventoryPurchaseOrderItems.purchaseOrderId, input.id),
            eq(inventoryPurchaseOrderItems.itemId, item.itemId),
          ));

        // Abweichung prüfen (Toleranz: 0.5%)
        const diff = item.receivedQty - item.orderedQty;
        const diffPct = item.orderedQty > 0 ? (diff / item.orderedQty) * 100 : 0;
        if (Math.abs(diffPct) > 0.5) {
          const discType = item.discrepancyType ?? (diff < 0 ? "short_delivery" : "over_delivery");
          discrepancies.push({ itemId: item.itemId, orderedQty: item.orderedQty, receivedQty: item.receivedQty, diff, unitCost: item.unitCost, type: discType, notes: item.discrepancyNotes });

          await db.insert(inventoryDeliveryDiscrepancies).values({
            restaurantId,
            purchaseOrderId: input.id,
            supplierId: order.supplierId,
            itemId: item.itemId,
            orderedQty: item.orderedQty.toFixed(3),
            receivedQty: item.receivedQty.toFixed(3),
            discrepancyQty: diff.toFixed(3),
            discrepancyPct: diffPct.toFixed(2),
            unitCost: item.unitCost?.toFixed(4),
            discrepancyValue: item.unitCost ? (Math.abs(diff) * item.unitCost).toFixed(2) : undefined,
            type: discType as "short_delivery" | "over_delivery" | "quality_issue" | "wrong_item",
            notes: item.discrepancyNotes,
          });
        }
      }

      // Bestellung als erhalten markieren
      const isPartial = totalReceived < totalOrdered * 0.995;
      await db.update(inventoryPurchaseOrders)
        .set({ status: isPartial ? "partial" : "received", receivedAt: new Date() })
        .where(and(eq(inventoryPurchaseOrders.id, input.id), eq(inventoryPurchaseOrders.restaurantId, restaurantId)));

      // Lieferantenbewertung aktualisieren
      const accuracy = totalOrdered > 0 ? Math.min(100, (totalReceived / totalOrdered) * 100) : 100;
      const now = new Date();
      let deliveryDaysActual: number | null = null;
      if (order.sentAt) {
        deliveryDaysActual = Math.round((now.getTime() - new Date(order.sentAt).getTime()) / (1000 * 60 * 60 * 24));
      }
      await db.execute(
        `UPDATE inventory_suppliers SET
          totalOrders = COALESCE(totalOrders, 0) + 1,
          totalDeliveries = COALESCE(totalDeliveries, 0) + 1,
          deliveryAccuracy = ROUND((COALESCE(deliveryAccuracy, 100) * COALESCE(totalDeliveries, 0) + ${accuracy.toFixed(2)}) / (COALESCE(totalDeliveries, 0) + 1), 2),
          ${deliveryDaysActual !== null ? `avgDeliveryDaysActual = ROUND((COALESCE(avgDeliveryDaysActual, ${deliveryDaysActual}) * COALESCE(totalDeliveries, 0) + ${deliveryDaysActual}) / (COALESCE(totalDeliveries, 0) + 1), 1),` : ""}
          lastOrderAt = NOW()
        WHERE id = ${order.supplierId} AND restaurantId = ${restaurantId}`
      );

      return {
        success: true,
        status: isPartial ? "partial" : "received",
        discrepancies: discrepancies.length,
        deliveryAccuracy: parseFloat(accuracy.toFixed(2)),
        hasDiscrepancies: discrepancies.length > 0,
      };
    }),

  cancelPurchaseOrder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.update(inventoryPurchaseOrders).set({ status: "cancelled" })
        .where(and(eq(inventoryPurchaseOrders.id, input.id), eq(inventoryPurchaseOrders.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ─── REZEPTUREN ────────────────────────────────────────────────────────────

  getRecipeForMenuItem: protectedProcedure
    .input(z.object({ menuItemId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const rows = await db
        .select({
          id: inventoryRecipes.id,
          menuItemId: inventoryRecipes.menuItemId,
          inventoryItemId: inventoryRecipes.inventoryItemId,
          quantity: inventoryRecipes.quantity,
          unit: inventoryRecipes.unit,
          conversionFactor: inventoryRecipes.conversionFactor,
          notes: inventoryRecipes.notes,
          itemName: inventoryItems.name,
          itemUnit: inventoryItems.unit,
          currentStock: inventoryItems.currentStock,
        })
        .from(inventoryRecipes)
        .leftJoin(inventoryItems, eq(inventoryRecipes.inventoryItemId, inventoryItems.id))
        .where(and(
          eq(inventoryRecipes.restaurantId, restaurantId),
          eq(inventoryRecipes.menuItemId, input.menuItemId),
        ));

      return rows;
    }),

  addRecipeIngredient: protectedProcedure
    .input(z.object({
      menuItemId: z.number(),
      inventoryItemId: z.number(),
      quantity: z.number().positive(),
      unit: z.string().min(1).max(50),
      conversionFactor: z.number().positive().default(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.insert(inventoryRecipes).values({
        restaurantId,
        menuItemId: input.menuItemId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity.toFixed(4),
        unit: input.unit,
        conversionFactor: input.conversionFactor.toFixed(6),
        notes: input.notes,
      });
      return { success: true };
    }),

  removeRecipeIngredient: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.delete(inventoryRecipes)
        .where(and(eq(inventoryRecipes.id, input.id), eq(inventoryRecipes.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ─── STATISTIKEN ───────────────────────────────────────────────────────────

  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);

    const items = await db.select().from(inventoryItems)
      .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.isActive, true)));

    let totalValue = 0;
    let criticalCount = 0;
    let lowCount = 0;
    let outCount = 0;
    let overstockCount = 0;

    for (const item of items) {
      const current = parseFloat(item.currentStock ?? "0");
      const cost = parseFloat(item.averageCost ?? item.costPerUnit ?? "0");
      totalValue += current * cost;
      const status = getStockStatus(item.currentStock, item.minStock, item.reorderPoint, item.maxStock);
      if (status === "out") outCount++;
      else if (status === "critical") criticalCount++;
      else if (status === "low") lowCount++;
      else if (status === "overstock") overstockCount++;
    }

    const [openOrdersRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryPurchaseOrders)
      .where(and(
        eq(inventoryPurchaseOrders.restaurantId, restaurantId),
        inArray(inventoryPurchaseOrders.status, ["draft", "sent", "confirmed", "partial"]),
      ));

    const [recentMovementsRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryStockMovements)
      .where(and(
        eq(inventoryStockMovements.restaurantId, restaurantId),
        gte(inventoryStockMovements.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      ));

    return {
      totalItems: items.length,
      totalValue: Math.round(totalValue * 100) / 100,
      criticalCount,
      lowCount,
      outCount,
      overstockCount,
      openOrdersCount: Number(openOrdersRow?.count ?? 0),
      recentMovementsCount: Number(recentMovementsRow?.count ?? 0),
    };
  }),

  getLowStockItems: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);

    const rows = await db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        currentStock: inventoryItems.currentStock,
        minStock: inventoryItems.minStock,
        reorderPoint: inventoryItems.reorderPoint,
        reorderQty: inventoryItems.reorderQty,
        costPerUnit: inventoryItems.costPerUnit,
        supplierId: inventoryItems.supplierId,
        autoReorder: inventoryItems.autoReorder,
        supplierName: inventorySuppliers.name,
        supplierEmail: inventorySuppliers.email,
      })
      .from(inventoryItems)
      .leftJoin(inventorySuppliers, eq(inventoryItems.supplierId, inventorySuppliers.id))
      .where(and(
        eq(inventoryItems.restaurantId, restaurantId),
        eq(inventoryItems.isActive, true),
        sql`CAST(${inventoryItems.currentStock} AS DECIMAL) <= CAST(${inventoryItems.reorderPoint} AS DECIMAL)`,
      ));

    type LowRow = (typeof rows)[0];
    return rows.map((r: LowRow) => ({
      ...r,
      deficit: Math.max(0, parseFloat(r.minStock ?? "0") - parseFloat(r.currentStock ?? "0")),
      suggestedOrderQty: parseFloat(r.reorderQty ?? "0") || Math.max(0, parseFloat(r.minStock ?? "0") - parseFloat(r.currentStock ?? "0")),
    }));
  }),

  getConsumptionAnalysis: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const movements = await db
        .select({
          itemId: inventoryStockMovements.itemId,
          itemName: inventoryItems.name,
          itemUnit: inventoryItems.unit,
          type: inventoryStockMovements.type,
          quantity: inventoryStockMovements.quantity,
          totalCost: inventoryStockMovements.totalCost,
        })
        .from(inventoryStockMovements)
        .leftJoin(inventoryItems, eq(inventoryStockMovements.itemId, inventoryItems.id))
        .where(and(
          eq(inventoryStockMovements.restaurantId, restaurantId),
          gte(inventoryStockMovements.createdAt, since),
          inArray(inventoryStockMovements.type, ["sale", "waste", "production"]),
        ));

      const byItem = new Map<number, { itemId: number; itemName: string; itemUnit: string; totalConsumed: number; totalCost: number; wasteQty: number }>();

      for (const m of movements) {
        const key = m.itemId ?? 0;
        if (!byItem.has(key)) {
          byItem.set(key, { itemId: key, itemName: m.itemName ?? "", itemUnit: m.itemUnit ?? "", totalConsumed: 0, totalCost: 0, wasteQty: 0 });
        }
        const entry = byItem.get(key)!;
        const qty = Math.abs(parseFloat(m.quantity ?? "0"));
        entry.totalConsumed += qty;
        entry.totalCost += parseFloat(m.totalCost ?? "0");
        if (m.type === "waste") entry.wasteQty += qty;
      }

      return Array.from(byItem.values())
        .sort((a, b) => b.totalCost - a.totalCost)
        .map(item => ({
          ...item,
          avgDailyConsumption: item.totalConsumed / input.days,
          wastePercent: item.totalConsumed > 0 ? (item.wasteQty / item.totalConsumed) * 100 : 0,
        }));
    }),

  getCategories: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);

    const rows = await db
      .selectDistinct({
        category: inventoryItems.category,
        storageLocation: inventoryItems.storageLocation,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.isActive, true)));

    type CatRow = { category: string | null; storageLocation: string | null };
    const categories = Array.from(new Set((rows as CatRow[]).map(r => r.category).filter((c): c is string => c !== null))).sort();
    const storageLocations = Array.from(new Set((rows as CatRow[]).map(r => r.storageLocation).filter((s): s is string => s !== null))).sort();
    return { categories, storageLocations };
  }),

  getMenuItemsForRecipe: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);
    return db
      .select({ id: menuItems.id, name: menuItems.name, itemType: menuItems.itemType })
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.isActive, true)))
      .orderBy(asc(menuItems.name));
  }),

  // ─── KI-ENDPOINTS ──────────────────────────────────────────────────────────

  getAiOrderSuggestions: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(90).default(14) }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const items = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          unit: inventoryItems.unit,
          currentStock: inventoryItems.currentStock,
          minStock: inventoryItems.minStock,
          reorderPoint: inventoryItems.reorderPoint,
          reorderQty: inventoryItems.reorderQty,
          costPerUnit: inventoryItems.costPerUnit,
          supplierName: inventorySuppliers.name,
        })
        .from(inventoryItems)
        .leftJoin(inventorySuppliers, eq(inventoryItems.supplierId, inventorySuppliers.id))
        .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.isActive, true)));

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const movements = await db
        .select({ itemId: inventoryStockMovements.itemId, quantity: inventoryStockMovements.quantity })
        .from(inventoryStockMovements)
        .where(and(
          eq(inventoryStockMovements.restaurantId, restaurantId),
          gte(inventoryStockMovements.createdAt, since),
          inArray(inventoryStockMovements.type, ["sale", "waste", "production"]),
        ));

      const consumptionMap = new Map<number, number>();
      for (const m of movements) {
        const qty = Math.abs(parseFloat(m.quantity ?? "0"));
        consumptionMap.set(m.itemId ?? 0, (consumptionMap.get(m.itemId ?? 0) ?? 0) + qty);
      }

      type ItemRow = (typeof items)[0];
      const itemData = items.map((r: ItemRow) => ({
        id: r.id,
        name: r.name,
        unit: r.unit,
        currentStock: parseFloat(r.currentStock ?? "0"),
        minStock: parseFloat(r.minStock ?? "0"),
        reorderPoint: parseFloat(r.reorderPoint ?? "0"),
        reorderQty: parseFloat(r.reorderQty ?? "0"),
        costPerUnit: parseFloat(r.costPerUnit ?? "0"),
        consumed: consumptionMap.get(r.id) ?? 0,
        avgDailyConsumption: (consumptionMap.get(r.id) ?? 0) / input.days,
        supplierName: r.supplierName,
        daysUntilEmpty: (consumptionMap.get(r.id) ?? 0) > 0
          ? parseFloat(r.currentStock ?? "0") / ((consumptionMap.get(r.id) ?? 0) / input.days)
          : 999,
      }));

      // Regelbasierter Fallback (immer verfügbar)
      type ItemDataRow = (typeof itemData)[0];
      const ruleBasedSuggestions = itemData
        .filter((i: ItemDataRow) => i.currentStock <= i.reorderPoint || i.daysUntilEmpty < 7)
        .map((i: ItemDataRow) => ({
          itemId: i.id,
          itemName: i.name,
          currentStock: i.currentStock,
          unit: i.unit,
          suggestedQty: i.reorderQty || Math.max(i.minStock - i.currentStock, i.avgDailyConsumption * 14),
          urgency: i.currentStock <= i.minStock ? "critical" : i.daysUntilEmpty < 3 ? "high" : "medium",
          reason: i.currentStock <= 0 ? "Ausverkauft" : `Reicht noch ${Math.round(i.daysUntilEmpty)} Tage`,
          estimatedCost: (i.reorderQty || i.avgDailyConsumption * 14) * i.costPerUnit,
        }));

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system" as const, content: "Du bist ein Gastronomie-Einkaufsexperte. Antworte ausschliesslich mit validem JSON." },
            { role: "user" as const, content: `Analysiere diese Lagerbestände und erstelle Bestellvorschläge (JSON-Array):\n${JSON.stringify(itemData.slice(0, 30), null, 2)}\n\nFormat: [{"itemId":number,"itemName":string,"currentStock":number,"unit":string,"suggestedQty":number,"urgency":"critical"|"high"|"medium","reason":string,"estimatedCost":number}]` },
          ],
        });

        const content = response.choices[0]?.message?.content;
        if (typeof content === "string") {
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const suggestions = JSON.parse(jsonMatch[0]);
            return { suggestions, analyzedDays: input.days, itemCount: items.length, source: "ai" as const };
          }
        }
      } catch {
        // KI nicht verfügbar, Fallback nutzen
      }

      return { suggestions: ruleBasedSuggestions, analyzedDays: input.days, itemCount: items.length, source: "rules" as const };
    }),

  getAiForecast: protectedProcedure
    .input(z.object({ forecastDays: z.number().int().min(7).max(90).default(30) }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const movements = await db
        .select({
          itemId: inventoryStockMovements.itemId,
          itemName: inventoryItems.name,
          quantity: inventoryStockMovements.quantity,
          createdAt: inventoryStockMovements.createdAt,
        })
        .from(inventoryStockMovements)
        .leftJoin(inventoryItems, eq(inventoryStockMovements.itemId, inventoryItems.id))
        .where(and(
          eq(inventoryStockMovements.restaurantId, restaurantId),
          gte(inventoryStockMovements.createdAt, since),
          inArray(inventoryStockMovements.type, ["sale", "waste", "production"]),
        ))
        .orderBy(asc(inventoryStockMovements.createdAt));

      // Wöchentliche Aggregation
      const weeklyData: Record<string, Record<string, number>> = {};
      for (const m of movements) {
        const d = new Date(m.createdAt!);
        d.setDate(d.getDate() - d.getDay());
        const weekKey = d.toISOString().split("T")[0];
        const itemKey = m.itemName ?? `item_${m.itemId}`;
        if (!weeklyData[weekKey]) weeklyData[weekKey] = {};
        weeklyData[weekKey][itemKey] = (weeklyData[weekKey][itemKey] ?? 0) + Math.abs(parseFloat(m.quantity ?? "0"));
      }

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system" as const, content: "Du bist ein Gastronomie-Planungsexperte. Antworte auf Deutsch mit validem JSON." },
            { role: "user" as const, content: `Analysiere diese wöchentlichen Verbrauchsdaten der letzten 60 Tage und erstelle eine Prognose für ${input.forecastDays} Tage:\n${JSON.stringify(weeklyData, null, 2)}\n\nAntworte mit JSON: {"summary":string,"topConsumers":[{"itemName":string,"trend":"rising|stable|falling","weeklyAvg":number}],"recommendations":[string],"riskItems":[string],"estimatedWeeklyCost":number}` },
          ],
        });

        const content = response.choices[0]?.message?.content;
        if (typeof content === "string") {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback
      }

      return {
        summary: "Für eine detaillierte KI-Prognose werden mehr Verbrauchsdaten benötigt. Erfassen Sie regelmässig Warenbewegungen.",
        topConsumers: [],
        recommendations: [
          "Erfassen Sie täglich Warenbewegungen für bessere Prognosen",
          "Verknüpfen Sie Menüartikel mit Rezepturen für automatischen Verbrauchsabzug",
          "Setzen Sie Mindestbestände und Nachbestellpunkte für alle kritischen Artikel",
        ],
        riskItems: [],
        estimatedWeeklyCost: 0,
      };
    }),

  // ─── REZEPTUR UPDATE ──────────────────────────────────────────────────────
  updateRecipeIngredient: protectedProcedure
    .input(z.object({
      id: z.number(),
      quantity: z.number().positive().optional(),
      unit: z.string().min(1).max(50).optional(),
      conversionFactor: z.number().positive().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.quantity !== undefined) updateData.quantity = updates.quantity.toFixed(4);
      if (updates.unit !== undefined) updateData.unit = updates.unit;
      if (updates.conversionFactor !== undefined) updateData.conversionFactor = updates.conversionFactor.toFixed(6);
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      await db.update(inventoryRecipes)
        .set(updateData)
        .where(and(eq(inventoryRecipes.id, id), eq(inventoryRecipes.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ─── LAGERABZUG BEIM VERKAUF ──────────────────────────────────────────────
  deductStockFromOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      items: z.array(z.object({
        menuItemId: z.number(),
        quantity: z.number().positive(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const deductions: Array<{ itemName: string; deducted: number; unit: string }> = [];

      for (const orderItem of input.items) {
        const recipes = await db
          .select({
            inventoryItemId: inventoryRecipes.inventoryItemId,
            quantity: inventoryRecipes.quantity,
            unit: inventoryRecipes.unit,
            conversionFactor: inventoryRecipes.conversionFactor,
            itemName: inventoryItems.name,
          })
          .from(inventoryRecipes)
          .leftJoin(inventoryItems, eq(inventoryRecipes.inventoryItemId, inventoryItems.id))
          .where(and(
            eq(inventoryRecipes.restaurantId, restaurantId),
            eq(inventoryRecipes.menuItemId, orderItem.menuItemId),
          ));

        for (const recipe of recipes) {
          if (!recipe.inventoryItemId) continue;
          const deductQty = parseFloat(recipe.quantity) * orderItem.quantity * parseFloat(recipe.conversionFactor ?? "1");
          await recordMovement(db, {
            restaurantId,
            itemId: recipe.inventoryItemId,
            type: "sale",
            quantity: -deductQty,
            referenceType: "order",
            referenceId: input.orderId,
            notes: `Automatischer Abzug für Bestellung #${input.orderId}`,
            performedBy: ctx.user!.id,
          });
          deductions.push({ itemName: recipe.itemName ?? "Unbekannt", deducted: deductQty, unit: recipe.unit });
        }
      }
      return { success: true, deductions };
    }),

  // ─── ABWEICHUNGSPROTOKOLL ──────────────────────────────────────────────────

  getDeliveryDiscrepancies: protectedProcedure
    .input(z.object({
      supplierId: z.number().optional(),
      resolved: z.boolean().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const conditions = [eq(inventoryDeliveryDiscrepancies.restaurantId, restaurantId)];
      if (input.supplierId) conditions.push(eq(inventoryDeliveryDiscrepancies.supplierId, input.supplierId));
      if (input.resolved === true) conditions.push(sql`${inventoryDeliveryDiscrepancies.resolvedAt} IS NOT NULL`);
      if (input.resolved === false) conditions.push(sql`${inventoryDeliveryDiscrepancies.resolvedAt} IS NULL`);

      const rows = await db
        .select({
          id: inventoryDeliveryDiscrepancies.id,
          purchaseOrderId: inventoryDeliveryDiscrepancies.purchaseOrderId,
          supplierId: inventoryDeliveryDiscrepancies.supplierId,
          itemId: inventoryDeliveryDiscrepancies.itemId,
          orderedQty: inventoryDeliveryDiscrepancies.orderedQty,
          receivedQty: inventoryDeliveryDiscrepancies.receivedQty,
          discrepancyQty: inventoryDeliveryDiscrepancies.discrepancyQty,
          discrepancyPct: inventoryDeliveryDiscrepancies.discrepancyPct,
          discrepancyValue: inventoryDeliveryDiscrepancies.discrepancyValue,
          type: inventoryDeliveryDiscrepancies.type,
          notes: inventoryDeliveryDiscrepancies.notes,
          resolvedAt: inventoryDeliveryDiscrepancies.resolvedAt,
          createdAt: inventoryDeliveryDiscrepancies.createdAt,
          supplierName: inventorySuppliers.name,
          itemName: inventoryItems.name,
          itemUnit: inventoryItems.unit,
        })
        .from(inventoryDeliveryDiscrepancies)
        .leftJoin(inventorySuppliers, eq(inventoryDeliveryDiscrepancies.supplierId, inventorySuppliers.id))
        .leftJoin(inventoryItems, eq(inventoryDeliveryDiscrepancies.itemId, inventoryItems.id))
        .where(and(...conditions))
        .orderBy(desc(inventoryDeliveryDiscrepancies.createdAt))
        .limit(input.limit);

      return rows;
    }),

  resolveDiscrepancy: protectedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.update(inventoryDeliveryDiscrepancies)
        .set({ resolvedAt: new Date(), resolvedBy: ctx.user.id, notes: input.notes })
        .where(and(
          eq(inventoryDeliveryDiscrepancies.id, input.id),
          eq(inventoryDeliveryDiscrepancies.restaurantId, restaurantId),
        ));
      return { success: true };
    }),

  // ─── VERBRAUCHSSTATISTIK (pro Restaurant, Multi-Tenant-sicher) ─────────────

  getConsumptionStats: protectedProcedure
    .input(z.object({
      days: z.number().default(30),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // Verbrauch (Abgänge) pro Artikel
      const consumptionRows = await db
        .select({
          itemId: inventoryStockMovements.itemId,
          itemName: inventoryItems.name,
          category: inventoryItems.category,
          unit: inventoryItems.unit,
          totalConsumed: sql<number>`ABS(SUM(CASE WHEN ${inventoryStockMovements.quantity} < 0 THEN ${inventoryStockMovements.quantity} ELSE 0 END))`,
          totalPurchased: sql<number>`SUM(CASE WHEN ${inventoryStockMovements.quantity} > 0 THEN ${inventoryStockMovements.quantity} ELSE 0 END)`,
          totalCost: sql<number>`SUM(CASE WHEN ${inventoryStockMovements.quantity} < 0 AND ${inventoryStockMovements.unitCost} IS NOT NULL THEN ABS(${inventoryStockMovements.quantity}) * ${inventoryStockMovements.unitCost} ELSE 0 END)`,
          movementCount: sql<number>`COUNT(*)`,
        })
        .from(inventoryStockMovements)
        .leftJoin(inventoryItems, eq(inventoryStockMovements.itemId, inventoryItems.id))
        .where(and(
          eq(inventoryStockMovements.restaurantId, restaurantId), // MULTI-TENANT: nur dieses Restaurant
          gte(inventoryStockMovements.createdAt, since),
          ...(input.category ? [eq(inventoryItems.category, input.category)] : []),
        ))
        .groupBy(inventoryStockMovements.itemId, inventoryItems.name, inventoryItems.category, inventoryItems.unit)
        .orderBy(desc(sql`ABS(SUM(CASE WHEN ${inventoryStockMovements.quantity} < 0 THEN ${inventoryStockMovements.quantity} ELSE 0 END))`))
        .limit(50);

      // Tagesverbrauch-Trend (letzte 14 Tage)
      const trendRows = await db
        .select({
          date: sql<string>`DATE(\`inventory_stock_movements\`.\`createdAt\`)`,
          totalConsumed: sql<number>`ABS(SUM(CASE WHEN ${inventoryStockMovements.quantity} < 0 THEN ${inventoryStockMovements.quantity} ELSE 0 END))`,
          totalCost: sql<number>`SUM(CASE WHEN ${inventoryStockMovements.quantity} < 0 AND ${inventoryStockMovements.unitCost} IS NOT NULL THEN ABS(${inventoryStockMovements.quantity}) * ${inventoryStockMovements.unitCost} ELSE 0 END)`,
        })
        .from(inventoryStockMovements)
        .where(and(
          eq(inventoryStockMovements.restaurantId, restaurantId),
          gte(inventoryStockMovements.createdAt, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)),
        ))
        .groupBy(sql`DATE(\`inventory_stock_movements\`.\`createdAt\`)`)
        .orderBy(sql`DATE(\`inventory_stock_movements\`.\`createdAt\`)`);

      // Gesamtstatistik
      const [totals] = await db
        .select({
          totalMovements: sql<number>`COUNT(*)`,
          totalConsumedValue: sql<number>`SUM(CASE WHEN ${inventoryStockMovements.quantity} < 0 AND ${inventoryStockMovements.unitCost} IS NOT NULL THEN ABS(${inventoryStockMovements.quantity}) * ${inventoryStockMovements.unitCost} ELSE 0 END)`,
          totalPurchasedValue: sql<number>`SUM(CASE WHEN ${inventoryStockMovements.quantity} > 0 AND ${inventoryStockMovements.unitCost} IS NOT NULL THEN ${inventoryStockMovements.quantity} * ${inventoryStockMovements.unitCost} ELSE 0 END)`,
        })
        .from(inventoryStockMovements)
        .where(and(
          eq(inventoryStockMovements.restaurantId, restaurantId),
          gte(inventoryStockMovements.createdAt, since),
        ));

      return { consumption: consumptionRows, trend: trendRows, totals };
    }),

  // ─── LIEFERANTENBEWERTUNG ─────────────────────────────────────────────────

  getSupplierPerformance: protectedProcedure
    .query(async ({ ctx }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const rows = await db
        .select({
          id: inventorySuppliers.id,
          name: inventorySuppliers.name,
          totalOrders: inventorySuppliers.totalOrders,
          totalDeliveries: inventorySuppliers.totalDeliveries,
          deliveryAccuracy: inventorySuppliers.deliveryAccuracy,
          avgDeliveryDaysActual: inventorySuppliers.avgDeliveryDaysActual,
          deliveryDays: inventorySuppliers.deliveryDays,
          lastOrderAt: inventorySuppliers.lastOrderAt,
          openDiscrepancies: sql<number>`(
            SELECT COUNT(*) FROM inventory_delivery_discrepancies d
            WHERE d.supplierId = ${inventorySuppliers.id}
              AND d.restaurantId = ${restaurantId}
              AND d.resolvedAt IS NULL
          )`,
        })
        .from(inventorySuppliers)
        .where(and(eq(inventorySuppliers.restaurantId, restaurantId), eq(inventorySuppliers.isActive, true)))
        .orderBy(desc(inventorySuppliers.deliveryAccuracy));

      return rows;
    }),
});
