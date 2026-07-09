/**
 * qrOrderRouter – Gäste-QR-Bestellung
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  qrTableSessions, orders, orderItems, menuItems, menuCategories, restaurants,
} from "../../drizzle/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { eventBus } from "../_core/eventBus";

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function sessionExpiresAt(hours = 12): Date {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}

export const qrOrderRouter = router({
  /** Generiert einen QR-Token für einen Tisch */
  generateQrToken: protectedProcedure
    .input(z.object({
      tableLabel: z.string().min(1).max(100),
      tableId: z.number().int().optional(),
      floorPlanObjectId: z.number().int().optional(),
      expiresInHours: z.number().int().min(1).max(72).default(12),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const token = generateToken();
      const expiresAt = sessionExpiresAt(input.expiresInHours);

      await db.insert(qrTableSessions).values({
        restaurantId,
        tableId: input.tableId ?? null,
        floorPlanObjectId: input.floorPlanObjectId ?? null,
        tableLabel: input.tableLabel,
        token,
        status: "active",
        expiresAt,
      });

      return { token, expiresAt };
    }),

  /** Session-Info anhand Token laden (öffentlich) */
  getSessionByToken: publicProcedure
    .input(z.object({ token: z.string().length(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db
        .select()
        .from(qrTableSessions)
        .where(and(
          eq(qrTableSessions.token, input.token),
          gt(qrTableSessions.expiresAt, new Date())
        ))
        .limit(1);

      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "QR-Code ungültig oder abgelaufen" });
      if (session.status === "closed") throw new TRPCError({ code: "FORBIDDEN", message: "Diese Sitzung wurde geschlossen" });

      const [restaurant] = await db
        .select({ name: restaurants.name, logoUrl: restaurants.logoUrl, currency: restaurants.currency })
        .from(restaurants)
        .where(eq(restaurants.id, session.restaurantId))
        .limit(1);

      return {
        sessionId: session.id,
        tableLabel: session.tableLabel,
        status: session.status,
        restaurantId: session.restaurantId,
        restaurantName: restaurant?.name ?? "Restaurant",
        restaurantLogo: restaurant?.logoUrl ?? null,
        currency: restaurant?.currency ?? "CHF",
        expiresAt: session.expiresAt,
      };
    }),

  /** Speisekarte für Gast laden (öffentlich) */
  guestGetMenu: publicProcedure
    .input(z.object({ token: z.string().length(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db
        .select()
        .from(qrTableSessions)
        .where(and(
          eq(qrTableSessions.token, input.token),
          gt(qrTableSessions.expiresAt, new Date())
        ))
        .limit(1);

      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "QR-Code ungültig oder abgelaufen" });

      const categories = await db
        .select()
        .from(menuCategories)
        .where(and(
          eq(menuCategories.restaurantId, session.restaurantId),
          eq(menuCategories.isActive, true),
          eq(menuCategories.isVisible, true)
        ))
        .orderBy(menuCategories.sortOrder);

      const items = await db
        .select()
        .from(menuItems)
        .where(and(
          eq(menuItems.restaurantId, session.restaurantId),
          eq(menuItems.isActive, true),
          eq(menuItems.isAvailable, true)
        ))
        .orderBy(menuItems.sortOrder);

      return { categories, items };
    }),

  /** Gast gibt Bestellung auf */
  guestSubmitOrder: publicProcedure
    .input(z.object({
      token: z.string().length(64),
      items: z.array(z.object({
        productId: z.number().int(),
        name: z.string(),
        quantity: z.number().int().min(1).max(20),
        unitPrice: z.number().min(0),
        notes: z.string().max(255).optional(),
        itemType: z.enum(["food", "drink", "other"]).default("food"),
      })).min(1).max(50),
      guestNotes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db
        .select()
        .from(qrTableSessions)
        .where(and(
          eq(qrTableSessions.token, input.token),
          gt(qrTableSessions.expiresAt, new Date())
        ))
        .limit(1);

      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "QR-Code ungültig oder abgelaufen" });
      if (session.status === "closed") throw new TRPCError({ code: "FORBIDDEN", message: "Diese Sitzung wurde geschlossen" });

      const orderNumber = `QR-${Date.now().toString(36).toUpperCase()}`;
      const subtotal = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

      let orderId = session.orderId;
      if (!orderId) {
        const [result] = await db.insert(orders).values({
          restaurantId: session.restaurantId,
          tableId: session.tableId ?? null,
          floorPlanObjectId: session.floorPlanObjectId ?? null,
          orderNumber,
          status: "pending",
          type: "dine_in",
          subtotal: subtotal.toFixed(2),
          totalAmount: subtotal.toFixed(2),
          notes: input.guestNotes ?? null,
          guestCount: 0,
        });
        orderId = (result as { insertId: number }).insertId;

        await db.update(qrTableSessions)
          .set({ orderId, status: "ordered" })
          .where(eq(qrTableSessions.id, session.id));
      }

      for (const item of input.items) {
        await db.insert(orderItems).values({
          orderId,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          totalPrice: (item.unitPrice * item.quantity).toFixed(2),
          notes: item.notes ?? null,
          itemType: item.itemType,
          status: "pending",
        });
      }

      // SSE-Events an Küche, Bar und Tischplan
      const payload = { orderId, orderNumber, source: "qr", tableLabel: session.tableLabel };
      eventBus.emit({ type: "kitchen_update", channel: "kitchen", restaurantId: session.restaurantId, payload });
      eventBus.emit({ type: "bar_update", channel: "bar", restaurantId: session.restaurantId, payload });
      eventBus.emit({ type: "floor_update", channel: "floor", restaurantId: session.restaurantId, payload });

      return { success: true, orderId, orderNumber };
    }),

  /** Alle Sessions für das Restaurant auflisten */
  listSessions: protectedProcedure
    .query(async ({ ctx }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(qrTableSessions)
        .where(eq(qrTableSessions.restaurantId, restaurantId))
        .orderBy(desc(qrTableSessions.createdAt));
    }),

  /** Session schliessen */
  closeSession: protectedProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(qrTableSessions)
        .set({ status: "closed" })
        .where(and(
          eq(qrTableSessions.id, input.sessionId),
          eq(qrTableSessions.restaurantId, restaurantId)
        ));

      return { success: true };
    }),
});
