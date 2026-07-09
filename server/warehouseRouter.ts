import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  warehouseZones,
  warehouseLocations,
  inventoryItems,
  inventorySuppliers,
  inventoryStockMovements,
  inventoryPurchaseOrders,
  inventoryPurchaseOrderItems,
  inventoryDeliveryPhotos,
} from "../drizzle/schema";
import { eq, and, desc, asc, sql, inArray, lte, gte } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
import { notifyOwner } from "./_core/notification";
import { restaurants } from "../drizzle/schema";

// ─── HELPER ──────────────────────────────────────────────────────────────────
async function getDbAndRestaurant(ctx: { user: { id: number; role: string; restaurantId?: number | null } }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Datenbank nicht verfügbar" });
  const restaurantId = ctx.user.restaurantId;
  if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  return { db, restaurantId };
}

function generateQrSlug(restaurantId: number, prefix: string): string {
  const rand = randomBytes(6).toString("hex");
  return `wh-${restaurantId}-${prefix}-${rand}`;
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────
export const warehouseRouter = router({

  // ── ZONEN ──────────────────────────────────────────────────────────────────

  listZones: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);
    const zones = await db
      .select()
      .from(warehouseZones)
      .where(and(eq(warehouseZones.restaurantId, restaurantId), eq(warehouseZones.isActive, true)))
      .orderBy(asc(warehouseZones.sortOrder), asc(warehouseZones.name));

    // Für jede Zone: Anzahl Artikel + Ampelstatus berechnen
    const enriched = await Promise.all(zones.map(async (zone: typeof warehouseZones.$inferSelect & { totalItems?: number }) => {
      // Lagerorte dieser Zone
      const locations = await db
        .select({ id: warehouseLocations.id })
        .from(warehouseLocations)
        .where(and(eq(warehouseLocations.zoneId, zone.id), eq(warehouseLocations.restaurantId, restaurantId)));
      const locationIds = locations.map((l: { id: number }) => l.id);

      let totalItems = 0;
      let criticalItems = 0;
      let warningItems = 0;

      if (locationIds.length > 0) {
        const items = await db
          .select({
            currentStock: inventoryItems.currentStock,
            minStock: inventoryItems.minStock,
            reorderPoint: inventoryItems.reorderPoint,
          })
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.restaurantId, restaurantId),
            eq(inventoryItems.isActive, true),
            inArray(inventoryItems.locationId as any, locationIds)
          ));

        totalItems = items.length;
        for (const item of items) {
          const cur = parseFloat(item.currentStock ?? "0");
          const min = parseFloat(item.minStock ?? "0");
          const reorder = parseFloat(item.reorderPoint ?? "0");
          if (cur <= min) criticalItems++;
          else if (cur <= reorder) warningItems++;
        }
      }

      // Auch Artikel ohne locationId aber mit storageLocation-Zuordnung (Legacy)
      const legacyItems = await db
        .select({
          currentStock: inventoryItems.currentStock,
          minStock: inventoryItems.minStock,
          reorderPoint: inventoryItems.reorderPoint,
        })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.restaurantId, restaurantId),
          eq(inventoryItems.isActive, true),
          sql`${inventoryItems.locationId} IS NULL`,
          sql`${inventoryItems.storageLocation} LIKE ${`%${zone.name}%`}`
        ));

      totalItems += legacyItems.length;
      for (const item of legacyItems) {
        const cur = parseFloat(item.currentStock ?? "0");
        const min = parseFloat(item.minStock ?? "0");
        const reorder = parseFloat(item.reorderPoint ?? "0");
        if (cur <= min) criticalItems++;
        else if (cur <= reorder) warningItems++;
      }

      const status = criticalItems > 0 ? "critical" : warningItems > 0 ? "warning" : "ok";
      return { ...zone, totalItems, criticalItems, warningItems, status };
    }));

    return enriched;
  }),

  createZone: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      type: z.enum(["kuehl", "tiefkuehl", "trocken", "keg", "leergut", "sonstige"]).default("trocken"),
      tempCelsius: z.number().optional(),
      sizeM2: z.number().optional(),
      description: z.string().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [result] = await db.insert(warehouseZones).values({
        restaurantId,
        name: input.name,
        type: input.type,
        tempCelsius: input.tempCelsius?.toFixed(1),
        sizeM2: input.sizeM2?.toFixed(1),
        description: input.description,
        sortOrder: input.sortOrder,
      });
      return { id: (result as any).insertId };
    }),

  updateZone: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      type: z.enum(["kuehl", "tiefkuehl", "trocken", "keg", "leergut", "sonstige"]).optional(),
      tempCelsius: z.number().optional().nullable(),
      sizeM2: z.number().optional().nullable(),
      description: z.string().optional().nullable(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const { id, ...rest } = input;
      const updateData: Record<string, unknown> = {};
      if (rest.name !== undefined) updateData.name = rest.name;
      if (rest.type !== undefined) updateData.type = rest.type;
      if (rest.tempCelsius !== undefined) updateData.tempCelsius = rest.tempCelsius?.toFixed(1) ?? null;
      if (rest.sizeM2 !== undefined) updateData.sizeM2 = rest.sizeM2?.toFixed(1) ?? null;
      if (rest.description !== undefined) updateData.description = rest.description;
      if (rest.sortOrder !== undefined) updateData.sortOrder = rest.sortOrder;
      await db.update(warehouseZones)
        .set(updateData)
        .where(and(eq(warehouseZones.id, id), eq(warehouseZones.restaurantId, restaurantId)));
      return { success: true };
    }),

  deleteZone: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.update(warehouseZones)
        .set({ isActive: false })
        .where(and(eq(warehouseZones.id, input.id), eq(warehouseZones.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ── LAGERORTE ──────────────────────────────────────────────────────────────

  listLocations: protectedProcedure
    .input(z.object({ zoneId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const conditions = [
        eq(warehouseLocations.restaurantId, restaurantId),
        eq(warehouseLocations.isActive, true),
      ];
      if (input.zoneId) conditions.push(eq(warehouseLocations.zoneId, input.zoneId));

      const locations = await db
        .select()
        .from(warehouseLocations)
        .where(and(...conditions))
        .orderBy(asc(warehouseLocations.zoneId), asc(warehouseLocations.name));

      // Artikel-Anzahl pro Lagerort
      const enriched = await Promise.all(locations.map(async (loc: typeof warehouseLocations.$inferSelect) => {
        const [{ count }] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.restaurantId, restaurantId),
            eq(inventoryItems.isActive, true),
            eq(inventoryItems.locationId as any, loc.id)
          ));
        return { ...loc, itemCount: Number(count) };
      }));

      return enriched;
    }),

  getLocationByQrSlug: protectedProcedure
    .input(z.object({ qrSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [location] = await db
        .select()
        .from(warehouseLocations)
        .where(and(
          eq(warehouseLocations.qrSlug, input.qrSlug),
          eq(warehouseLocations.restaurantId, restaurantId),
          eq(warehouseLocations.isActive, true)
        ));
      if (!location) throw new TRPCError({ code: "NOT_FOUND", message: "Lagerort nicht gefunden" });

      // Artikel an diesem Lagerort
      const items = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          unit: inventoryItems.unit,
          currentStock: inventoryItems.currentStock,
          minStock: inventoryItems.minStock,
          reorderPoint: inventoryItems.reorderPoint,
          sku: inventoryItems.sku,
          ean: inventoryItems.ean,
        })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.restaurantId, restaurantId),
          eq(inventoryItems.isActive, true),
          eq(inventoryItems.locationId, location.id)
        ))
        .orderBy(asc(inventoryItems.name));

      return { location, items };
    }),

  createLocation: protectedProcedure
    .input(z.object({
      zoneId: z.number(),
      name: z.string().min(1).max(200),
      shelf: z.string().optional(),
      compartment: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const qrSlug = generateQrSlug(restaurantId, "loc");
      const [result] = await db.insert(warehouseLocations).values({
        restaurantId,
        zoneId: input.zoneId,
        name: input.name,
        shelf: input.shelf,
        compartment: input.compartment,
        description: input.description,
        qrSlug,
      });
      return { id: (result as any).insertId, qrSlug };
    }),

  updateLocation: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      shelf: z.string().optional().nullable(),
      compartment: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const { id, ...rest } = input;
      await db.update(warehouseLocations)
        .set(rest)
        .where(and(eq(warehouseLocations.id, id), eq(warehouseLocations.restaurantId, restaurantId)));
      return { success: true };
    }),

  deleteLocation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db.update(warehouseLocations)
        .set({ isActive: false })
        .where(and(eq(warehouseLocations.id, input.id), eq(warehouseLocations.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ── WARENEINGANG ───────────────────────────────────────────────────────────

  recordIncoming: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.number().positive(),
        unitCost: z.number().optional(),
        notes: z.string().optional(),
      })),
      locationId: z.number().optional(),
      purchaseOrderId: z.number().optional(),
      deliveryPhotoUrl: z.string().optional(),
      deliveryPhotoKey: z.string().optional(),
      generalNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const movementIds: number[] = [];

      for (const entry of input.items) {
        // Artikel prüfen
        const [item] = await db
          .select({ currentStock: inventoryItems.currentStock, averageCost: inventoryItems.averageCost, name: inventoryItems.name })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.id, entry.itemId), eq(inventoryItems.restaurantId, restaurantId)));
        if (!item) continue;

        const currentStock = parseFloat(item.currentStock ?? "0");
        const newStock = currentStock + entry.quantity;

        // Bestand aktualisieren
        const updateData: Record<string, unknown> = { currentStock: newStock.toFixed(3) };
        if (entry.unitCost) {
          updateData.lastPurchasePrice = entry.unitCost.toFixed(4);
          const oldAvg = parseFloat(item.averageCost ?? "0");
          const newAvg = currentStock > 0
            ? (currentStock * oldAvg + entry.quantity * entry.unitCost) / newStock
            : entry.unitCost;
          updateData.averageCost = newAvg.toFixed(4);
          updateData.lastDeliveryDate = new Date();
        }
        await db.update(inventoryItems).set(updateData)
          .where(and(eq(inventoryItems.id, entry.itemId), eq(inventoryItems.restaurantId, restaurantId)));

        // Bewegung protokollieren
        const [mvResult] = await db.insert(inventoryStockMovements).values({
          restaurantId,
          itemId: entry.itemId,
          type: "purchase",
          quantity: entry.quantity.toFixed(3),
          unitCost: entry.unitCost?.toFixed(4),
          totalCost: entry.unitCost ? (entry.quantity * entry.unitCost).toFixed(2) : undefined,
          stockAfter: newStock.toFixed(3),
          referenceType: input.purchaseOrderId ? "purchase_order" : "manual",
          referenceId: input.purchaseOrderId,
          notes: entry.notes ?? input.generalNotes,
          performedBy: ctx.user.id,
        });
        const movementId = (mvResult as any).insertId;
        movementIds.push(movementId);

        // Lieferfoto speichern
        if (input.deliveryPhotoUrl && movementId) {
          await db.insert(inventoryDeliveryPhotos).values({
            restaurantId,
            movementId,
            imageUrl: input.deliveryPhotoUrl,
            imageKey: input.deliveryPhotoKey,
            photoType: "delivery_note",
            uploadedBy: ctx.user.id,
          });
        }
      }

      return { success: true, movementIds, count: input.items.length };
    }),

  // ── WARENAUSGANG ───────────────────────────────────────────────────────────

  recordOutgoing: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.number().positive(),
        notes: z.string().optional(),
      })),
      type: z.enum(["sale", "waste", "transfer", "correction"]).default("transfer"),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      for (const entry of input.items) {
        const [item] = await db
          .select({ currentStock: inventoryItems.currentStock, name: inventoryItems.name })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.id, entry.itemId), eq(inventoryItems.restaurantId, restaurantId)));
        if (!item) continue;

        const currentStock = parseFloat(item.currentStock ?? "0");
        const newStock = Math.max(0, currentStock - entry.quantity);

        await db.update(inventoryItems)
          .set({ currentStock: newStock.toFixed(3) })
          .where(and(eq(inventoryItems.id, entry.itemId), eq(inventoryItems.restaurantId, restaurantId)));

        await db.insert(inventoryStockMovements).values({
          restaurantId,
          itemId: entry.itemId,
          type: input.type,
          quantity: (-entry.quantity).toFixed(3),
          stockAfter: newStock.toFixed(3),
          notes: entry.notes ?? input.reason,
          performedBy: ctx.user.id,
        });
      }

      return { success: true, count: input.items.length };
    }),

  // ── VERLUST / BRUCH / DIEBSTAHL ────────────────────────────────────────────

  recordLoss: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      quantity: z.number().positive(),
      lossType: z.enum(["damage", "theft", "expiry", "other"]),
      reason: z.string().min(5, "Bitte Grund angeben (min. 5 Zeichen)"),
      photoUrl: z.string().optional(),
      photoKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      const [item] = await db
        .select({ currentStock: inventoryItems.currentStock, name: inventoryItems.name })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.restaurantId, restaurantId)));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Artikel nicht gefunden" });

      const currentStock = parseFloat(item.currentStock ?? "0");
      const newStock = Math.max(0, currentStock - input.quantity);

      await db.update(inventoryItems)
        .set({ currentStock: newStock.toFixed(3) })
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.restaurantId, restaurantId)));

      const [mvResult] = await db.insert(inventoryStockMovements).values({
        restaurantId,
        itemId: input.itemId,
        type: "waste",
        quantity: (-input.quantity).toFixed(3),
        stockAfter: newStock.toFixed(3),
        notes: `[${input.lossType.toUpperCase()}] ${input.reason}`,
        performedBy: ctx.user.id,
      });
      const movementId = (mvResult as any).insertId;

      // Foto speichern
      if (input.photoUrl && movementId) {
        await db.insert(inventoryDeliveryPhotos).values({
          restaurantId,
          movementId,
          imageUrl: input.photoUrl,
          imageKey: input.photoKey,
          photoType: input.lossType === "damage" ? "damage" : "other",
          uploadedBy: ctx.user.id,
        });
      }

      // Owner benachrichtigen bei Diebstahl
      if (input.lossType === "theft") {
        await notifyOwner({
          title: "⚠️ Diebstahl gemeldet",
          content: `${item.name}: ${input.quantity} Einheiten. Begründung: ${input.reason}`,
        }).catch(() => {});
      }

      return { success: true, movementId };
    }),

  // ── BEWEGUNGSPROTOKOLL ─────────────────────────────────────────────────────

  getMovements: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().default(0),
      itemId: z.number().optional(),
      type: z.enum(["purchase", "sale", "waste", "correction", "transfer", "return", "production"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const conditions = [eq(inventoryStockMovements.restaurantId, restaurantId)];
      if (input.itemId) conditions.push(eq(inventoryStockMovements.itemId, input.itemId));
      if (input.type) conditions.push(eq(inventoryStockMovements.type, input.type));

      const movements = await db
        .select({
          id: inventoryStockMovements.id,
          type: inventoryStockMovements.type,
          quantity: inventoryStockMovements.quantity,
          stockAfter: inventoryStockMovements.stockAfter,
          notes: inventoryStockMovements.notes,
          createdAt: inventoryStockMovements.createdAt,
          itemName: inventoryItems.name,
          itemUnit: inventoryItems.unit,
          performedBy: inventoryStockMovements.performedBy,
        })
        .from(inventoryStockMovements)
        .leftJoin(inventoryItems, eq(inventoryStockMovements.itemId, inventoryItems.id))
        .where(and(...conditions))
        .orderBy(desc(inventoryStockMovements.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return movements;
    }),

  // ── BESTELLLISTE PRO LIEFERANT ─────────────────────────────────────────────

  generateOrderList: protectedProcedure
    .input(z.object({
      supplierId: z.number().optional(), // wenn leer: alle Lieferanten
    }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);

      // Alle Artikel unter Mindestmenge / Bestellpunkt
      const conditions = [
        eq(inventoryItems.restaurantId, restaurantId),
        eq(inventoryItems.isActive, true),
        sql`${inventoryItems.currentStock} <= ${inventoryItems.reorderPoint}`,
      ];
      if (input.supplierId) conditions.push(eq(inventoryItems.supplierId, input.supplierId));

      const items = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          sku: inventoryItems.sku,
          ean: inventoryItems.ean,
          unit: inventoryItems.unit,
          currentStock: inventoryItems.currentStock,
          minStock: inventoryItems.minStock,
          reorderPoint: inventoryItems.reorderPoint,
          reorderQty: inventoryItems.reorderQty,
          costPerUnit: inventoryItems.costPerUnit,
          supplierId: inventoryItems.supplierId,
          supplierName: inventorySuppliers.name,
          supplierEmail: inventorySuppliers.email,
          supplierPhone: inventorySuppliers.phone,
          supplierContactName: inventorySuppliers.contactName,
        })
        .from(inventoryItems)
        .leftJoin(inventorySuppliers, eq(inventoryItems.supplierId, inventorySuppliers.id))
        .where(and(...conditions))
        .orderBy(asc(inventorySuppliers.name), asc(inventoryItems.name));

      // Nach Lieferant gruppieren
      const grouped: Record<string, {
        supplier: { id: number | null; name: string; email: string | null; phone: string | null; contactName: string | null };
        items: typeof items;
        totalEstimatedCost: number;
      }> = {};

      for (const item of items) {
        const key = item.supplierId ? String(item.supplierId) : "no_supplier";
        if (!grouped[key]) {
          grouped[key] = {
            supplier: {
              id: item.supplierId ?? null,
              name: item.supplierName ?? "Kein Lieferant",
              email: item.supplierEmail ?? null,
              phone: item.supplierPhone ?? null,
              contactName: item.supplierContactName ?? null,
            },
            items: [],
            totalEstimatedCost: 0,
          };
        }
        grouped[key].items.push(item);
        const qty = parseFloat(item.reorderQty ?? "1");
        const cost = parseFloat(item.costPerUnit ?? "0");
        grouped[key].totalEstimatedCost += qty * cost;
      }

      return {
        groups: Object.values(grouped),
        totalItems: items.length,
        generatedAt: new Date(),
      };
    }),

  // ── QR-CODE-DATEN (für Frontend-Generierung) ───────────────────────────────

  getQrCodeData: protectedProcedure
    .input(z.object({ locationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const [location] = await db
        .select()
        .from(warehouseLocations)
        .where(and(eq(warehouseLocations.id, input.locationId), eq(warehouseLocations.restaurantId, restaurantId)));
      if (!location) throw new TRPCError({ code: "NOT_FOUND" });

      const [zone] = await db
        .select({ name: warehouseZones.name, type: warehouseZones.type })
        .from(warehouseZones)
        .where(eq(warehouseZones.id, location.zoneId));

      return {
        qrSlug: location.qrSlug,
        locationName: location.name,
        zoneName: zone?.name ?? "",
        zoneType: zone?.type ?? "trocken",
        shelf: location.shelf,
        compartment: location.compartment,
        // QR-Code-Inhalt: der Slug wird gescannt und dann per API aufgelöst
        qrContent: location.qrSlug,
      };
    }),

  // ── MHD-WARNUNG (QPM-3) ──────────────────────────────────────────────────────

  /**
   * Artikel mit MHD innerhalb der nächsten `days` Tage (Standard: 3).
   * Gruppiert nach Lagerort/Zone für das Dashboard-Banner.
   */
  getExpiringItems: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).default(3) }))
    .query(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      const cutoff = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
      const now = new Date();

      // Artikel mit bestBefore oder expiresAt innerhalb des Zeitfensters
      const items = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          unit: inventoryItems.unit,
          currentStock: inventoryItems.currentStock,
          bestBefore: inventoryItems.bestBefore,
          expiresAt: inventoryItems.expiresAt,
          chargeNr: inventoryItems.chargeNr,
          locationId: inventoryItems.locationId,
          locationName: warehouseLocations.name,
          zoneName: warehouseZones.name,
          zoneType: warehouseZones.type,
        })
        .from(inventoryItems)
        .leftJoin(warehouseLocations, eq(inventoryItems.locationId, warehouseLocations.id))
        .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(and(
          eq(inventoryItems.restaurantId, restaurantId),
          eq(inventoryItems.isActive, true),
          sql`(
            (${inventoryItems.bestBefore} IS NOT NULL AND ${inventoryItems.bestBefore} <= ${cutoff} AND ${inventoryItems.bestBefore} >= ${now})
            OR
            (${inventoryItems.expiresAt} IS NOT NULL AND ${inventoryItems.expiresAt} <= ${cutoff} AND ${inventoryItems.expiresAt} >= ${now})
          )`
        ))
        .orderBy(asc(inventoryItems.bestBefore), asc(inventoryItems.expiresAt));

      // Bereits abgelaufene Artikel (MHD in der Vergangenheit)
      const expired = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          unit: inventoryItems.unit,
          currentStock: inventoryItems.currentStock,
          bestBefore: inventoryItems.bestBefore,
          expiresAt: inventoryItems.expiresAt,
          chargeNr: inventoryItems.chargeNr,
          locationId: inventoryItems.locationId,
          locationName: warehouseLocations.name,
          zoneName: warehouseZones.name,
          zoneType: warehouseZones.type,
        })
        .from(inventoryItems)
        .leftJoin(warehouseLocations, eq(inventoryItems.locationId, warehouseLocations.id))
        .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(and(
          eq(inventoryItems.restaurantId, restaurantId),
          eq(inventoryItems.isActive, true),
          sql`(
            (${inventoryItems.bestBefore} IS NOT NULL AND ${inventoryItems.bestBefore} < ${now})
            OR
            (${inventoryItems.expiresAt} IS NOT NULL AND ${inventoryItems.expiresAt} < ${now})
          )`
        ))
        .orderBy(asc(inventoryItems.bestBefore), asc(inventoryItems.expiresAt));

      return {
        expiringSoon: items,
        expired,
        totalWarnings: items.length + expired.length,
        cutoffDate: cutoff,
      };
    }),

  // ── STATISTIK ──────────────────────────────────────────────────────────────

  // ── MHD-EINSTELLUNGEN ─────────────────────────────────────────────────────

  getMhdSettings: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);
    const [row] = await db
      .select({ mhdWarningDays: restaurants.mhdWarningDays })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    return { mhdWarningDays: row?.mhdWarningDays ?? 3 };
  }),

  saveMhdSettings: protectedProcedure
    .input(z.object({ mhdWarningDays: z.number().int().min(1).max(90) }))
    .mutation(async ({ ctx, input }) => {
      const { db, restaurantId } = await getDbAndRestaurant(ctx);
      await db
        .update(restaurants)
        .set({ mhdWarningDays: input.mhdWarningDays })
        .where(eq(restaurants.id, restaurantId));
      return { ok: true };
    }),

  // ── QR-SCAN: ÖFFENTLICHER LAGERORT-LOOKUP ─────────────────────────────────

  getLocationBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Datenbank nicht verfügbar" });

      const [location] = await db
        .select({
          id: warehouseLocations.id,
          name: warehouseLocations.name,
          shelf: warehouseLocations.shelf,
          compartment: warehouseLocations.compartment,
          description: warehouseLocations.description,
          zoneId: warehouseLocations.zoneId,
          restaurantId: warehouseLocations.restaurantId,
        })
        .from(warehouseLocations)
        .where(eq(warehouseLocations.qrSlug, input.slug))
        .limit(1);

      if (!location) throw new TRPCError({ code: "NOT_FOUND", message: "Lagerort nicht gefunden" });

      // Zone laden
      const [zone] = await db
        .select({ name: warehouseZones.name, type: warehouseZones.type })
        .from(warehouseZones)
        .where(eq(warehouseZones.id, location.zoneId))
        .limit(1);

      // Artikel an diesem Lagerort
      const items = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          unit: inventoryItems.unit,
          currentStock: inventoryItems.currentStock,
          minStock: inventoryItems.minStock,
          bestBefore: inventoryItems.bestBefore,
          chargeNr: inventoryItems.chargeNr,
          category: inventoryItems.category,
        })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.locationId, location.id),
          eq(inventoryItems.restaurantId, location.restaurantId!),
          eq(inventoryItems.isActive, true),
        ))
        .orderBy(asc(inventoryItems.name));

      const now = new Date();
      const itemsWithStatus = items.map((item: typeof inventoryItems.$inferSelect) => {
        let mhdStatus: "ok" | "warning" | "expired" = "ok";
        if (item.bestBefore) {
          const bd = new Date(item.bestBefore);
          if (bd < now) mhdStatus = "expired";
          else if ((bd.getTime() - now.getTime()) < 3 * 24 * 60 * 60 * 1000) mhdStatus = "warning";
        }
        return { ...item, mhdStatus };
      });

      return {
        location: { ...location, zoneName: zone?.name ?? null, zoneType: zone?.type ?? null },
        items: itemsWithStatus,
        scannedAt: new Date().toISOString(),
      };
    }),

  getWarehouseStats: protectedProcedure.query(async ({ ctx }) => {
    const { db, restaurantId } = await getDbAndRestaurant(ctx);

    const [totalItemsRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.isActive, true)));

    const [criticalRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.restaurantId, restaurantId),
        eq(inventoryItems.isActive, true),
        sql`${inventoryItems.currentStock} <= ${inventoryItems.minStock}`
      ));

    const [warningRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.restaurantId, restaurantId),
        eq(inventoryItems.isActive, true),
        sql`${inventoryItems.currentStock} > ${inventoryItems.minStock}`,
        sql`${inventoryItems.currentStock} <= ${inventoryItems.reorderPoint}`
      ));

    const [zonesRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(warehouseZones)
      .where(and(eq(warehouseZones.restaurantId, restaurantId), eq(warehouseZones.isActive, true)));

    // Letzte 7 Tage: Bewegungen
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [movementsRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(inventoryStockMovements)
      .where(and(
        eq(inventoryStockMovements.restaurantId, restaurantId),
        sql`${inventoryStockMovements.createdAt} >= ${sevenDaysAgo}`
      ));

    // Verluste letzte 30 Tage
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [lossRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(ABS(${inventoryStockMovements.totalCost})), 0)` })
      .from(inventoryStockMovements)
      .where(and(
        eq(inventoryStockMovements.restaurantId, restaurantId),
        eq(inventoryStockMovements.type, "waste"),
        sql`${inventoryStockMovements.createdAt} >= ${thirtyDaysAgo}`
      ));

    return {
      totalItems: Number(totalItemsRow?.count ?? 0),
      criticalItems: Number(criticalRow?.count ?? 0),
      warningItems: Number(warningRow?.count ?? 0),
      totalZones: Number(zonesRow?.count ?? 0),
      movementsLast7Days: Number(movementsRow?.count ?? 0),
      lossValueLast30Days: parseFloat(lossRow?.total ?? "0"),
    };
  }),
});
