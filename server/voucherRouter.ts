import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { vouchers, voucherRedemptions, giftCardPurchases, restaurants } from "../drizzle/schema";
import { eq, and, desc, like, or, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { stripe } from "./stripe";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(prefix?: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne O, 0, I, 1 (Verwechslungsgefahr)
  let code = prefix ? prefix.toUpperCase() + "-" : "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function computeDiscount(
  voucher: { type: string; value: string; maxDiscount: string | null },
  orderTotal: number
): number {
  const val = parseFloat(voucher.value);
  if (voucher.type === "fixed") return Math.min(val, orderTotal);
  // percent
  const discount = (orderTotal * val) / 100;
  if (voucher.maxDiscount) return Math.min(discount, parseFloat(voucher.maxDiscount));
  return discount;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const voucherRouter = router({
  // ─── List vouchers ──────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(["all", "active", "redeemed", "partially_redeemed", "expired", "cancelled"]).default("all"),
      category: z.enum(["all", "discount", "gift_card"]).default("all"),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const offset = (input.page - 1) * input.pageSize;

      const conditions = [eq(vouchers.restaurantId, restaurantId)];
      if (input.status !== "all") {
        conditions.push(eq(vouchers.status, input.status));
      }
      if (input.category !== "all") {
        conditions.push(eq(vouchers.category, input.category));
      }
      if (input.search) {
        conditions.push(
          or(
            like(vouchers.code, `%${input.search}%`),
            like(vouchers.issuedTo, `%${input.search}%`)
          )!
        );
      }

      const [rows, countResult] = await Promise.all([
        db.select().from(vouchers)
          .where(and(...conditions))
          .orderBy(desc(vouchers.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(vouchers).where(and(...conditions)),
      ]);

      return { vouchers: rows, total: Number(countResult[0]?.count ?? 0) };
    }),

  // ─── Get single voucher ─────────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(eq(vouchers.id, input.id), eq(vouchers.restaurantId, restaurantId)));
      if (!voucher) throw new TRPCError({ code: "NOT_FOUND" });

      const redemptions = await db.select().from(voucherRedemptions)
        .where(eq(voucherRedemptions.voucherId, input.id))
        .orderBy(desc(voucherRedemptions.redeemedAt));

      const [restaurant] = await db.select({ name: restaurants.name })
        .from(restaurants).where(eq(restaurants.id, restaurantId));

      return { voucher, redemptions, restaurantName: restaurant?.name ?? "" };
    }),

  // ─── Lookup by code (for cashier) ───────────────────────────────────────────
  lookupByCode: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(
          eq(vouchers.restaurantId, restaurantId),
          eq(vouchers.code, input.code.toUpperCase().trim())
        ));

      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "Gutschein nicht gefunden" });

      // Ablauf prüfen
      const now = new Date();
      if (voucher.validUntil && new Date(voucher.validUntil) < now) {
        return { voucher, valid: false, reason: "Gutschein ist abgelaufen" };
      }
      if (voucher.status === "cancelled") {
        return { voucher, valid: false, reason: "Gutschein wurde storniert" };
      }
      if (voucher.status === "redeemed") {
        return { voucher, valid: false, reason: "Gutschein wurde bereits vollständig eingelöst" };
      }
      if (parseFloat(voucher.remainingBalance) <= 0) {
        return { voucher, valid: false, reason: "Kein Restguthaben vorhanden" };
      }
      if (voucher.maxUses && voucher.usedCount >= voucher.maxUses) {
        return { voucher, valid: false, reason: "Maximale Einlösungsanzahl erreicht" };
      }

      return { voucher, valid: true, reason: null };
    }),

  // ─── Create voucher ─────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      category: z.enum(["discount", "gift_card"]).default("discount"),
      type: z.enum(["fixed", "percent"]),
      value: z.number().positive(),
      minOrderValue: z.number().min(0).optional(),
      maxDiscount: z.number().positive().optional(),
      issuedTo: z.string().max(255).optional(),
      note: z.string().optional(),
      validFrom: z.string(),   // ISO date string
      validUntil: z.string().optional(),
      maxUses: z.number().int().positive().optional(),
      customCode: z.string().max(64).optional(),
      codePrefix: z.string().max(10).optional(),
      quantity: z.number().int().min(1).max(100).default(1), // Bulk-Erstellung
      purchasePaymentMethod: z.enum(["cash", "card", "twint"]).optional(),
      allowedRestaurantIds: z.array(z.number().int()).optional(), // Multi-Restaurant-Support
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const created = [];
      const count = input.quantity ?? 1;

      for (let i = 0; i < count; i++) {
        const code = count === 1 && input.customCode
          ? input.customCode.toUpperCase().trim()
          : generateCode(input.codePrefix);

        // Duplikat-Check
        const [existing] = await db.select({ id: vouchers.id }).from(vouchers)
          .where(and(eq(vouchers.restaurantId, restaurantId), eq(vouchers.code, code)));
        if (existing) {
          if (count === 1) throw new TRPCError({ code: "CONFLICT", message: "Dieser Code existiert bereits" });
          continue; // bei Bulk: überspringen
        }

        const initialBalance = input.type === "fixed" ? input.value : input.value; // für %-Typ = Prozentwert
        const [result] = await db.insert(vouchers).values({
          restaurantId,
          category: input.category,
          code,
          type: input.type,
          value: String(input.value),
          minOrderValue: input.minOrderValue != null ? String(input.minOrderValue) : null,
          maxDiscount: input.maxDiscount != null ? String(input.maxDiscount) : null,
          initialBalance: String(initialBalance),
          remainingBalance: String(initialBalance),
          issuedTo: input.issuedTo || null,
          issuedBy: ctx.user.id,
          note: input.note || null,
          validFrom: new Date(input.validFrom),
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          maxUses: input.maxUses || null,
          allowedRestaurantIds: input.allowedRestaurantIds && input.allowedRestaurantIds.length > 0
            ? JSON.stringify(input.allowedRestaurantIds)
            : null,
          status: "active",
        });

        const [newVoucher] = await db.select().from(vouchers)
          .where(and(eq(vouchers.restaurantId, restaurantId), eq(vouchers.code, code)));
        created.push(newVoucher);

        // Kauf-Transaktion für Geschenkkarten speichern
        if (input.category === "gift_card" && newVoucher) {
          await db.insert(giftCardPurchases).values({
            voucherId: newVoucher.id,
            restaurantId,
            soldBy: ctx.user.id,
            purchaseAmount: String(input.value),
            paymentMethod: input.purchasePaymentMethod ?? "cash",
            recipientName: input.issuedTo || null,
          });
        }
      }

      return { created };
    }),

  // ─── Update voucher ─────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      issuedTo: z.string().max(255).optional(),
      note: z.string().optional(),
      validUntil: z.string().nullable().optional(),
      maxUses: z.number().int().positive().nullable().optional(),
      status: z.enum(["active", "cancelled"]).optional(),
      allowedRestaurantIds: z.array(z.number().int()).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [existing] = await db.select().from(vouchers)
        .where(and(eq(vouchers.id, input.id), eq(vouchers.restaurantId, restaurantId)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updates: Partial<typeof vouchers.$inferInsert> = {};
      if (input.issuedTo !== undefined) updates.issuedTo = input.issuedTo || null;
      if (input.note !== undefined) updates.note = input.note || null;
      if (input.validUntil !== undefined) updates.validUntil = input.validUntil ? new Date(input.validUntil) : null;
      if (input.maxUses !== undefined) updates.maxUses = input.maxUses;
      if (input.status !== undefined) updates.status = input.status;
      if (input.allowedRestaurantIds !== undefined) {
        updates.allowedRestaurantIds = input.allowedRestaurantIds && input.allowedRestaurantIds.length > 0
          ? JSON.stringify(input.allowedRestaurantIds)
          : null;
      }

      await db.update(vouchers).set(updates).where(eq(vouchers.id, input.id));
      const [updated] = await db.select().from(vouchers).where(eq(vouchers.id, input.id));
      return updated;
    }),

  // ─── Redeem voucher ─────────────────────────────────────────────────────────
  redeem: protectedProcedure
    .input(z.object({
      code: z.string().min(1),
      orderId: z.number().int().optional(),
      orderTotal: z.number().positive(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(
          eq(vouchers.restaurantId, restaurantId),
          eq(vouchers.code, input.code.toUpperCase().trim())
        ));

      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "Gutschein nicht gefunden" });

      // Validierungen
      const now = new Date();
      if (voucher.validUntil && new Date(voucher.validUntil) < now)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Gutschein ist abgelaufen" });
      if (voucher.status === "cancelled")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Gutschein wurde storniert" });
      if (voucher.status === "redeemed")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Gutschein wurde bereits vollständig eingelöst" });
      if (parseFloat(voucher.remainingBalance) <= 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Restguthaben vorhanden" });
      if (voucher.maxUses && voucher.usedCount >= voucher.maxUses)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximale Einlösungsanzahl erreicht" });
      if (voucher.minOrderValue && input.orderTotal < parseFloat(voucher.minOrderValue))
        throw new TRPCError({ code: "BAD_REQUEST", message: `Mindestbestellwert CHF ${parseFloat(voucher.minOrderValue).toFixed(2)} nicht erreicht` });

      // Rabatt berechnen
      const discount = computeDiscount(
        { type: voucher.type, value: voucher.value, maxDiscount: voucher.maxDiscount },
        input.orderTotal
      );
      const actualDiscount = Math.min(discount, parseFloat(voucher.remainingBalance));
      const balanceBefore = parseFloat(voucher.remainingBalance);
      const balanceAfter = Math.max(0, balanceBefore - actualDiscount);

      // Status bestimmen
      let newStatus: "active" | "redeemed" | "partially_redeemed" = "active";
      if (balanceAfter <= 0 || voucher.type === "percent") {
        newStatus = "redeemed";
      } else if (balanceAfter < parseFloat(voucher.initialBalance)) {
        newStatus = "partially_redeemed";
      }

      // Transaktion: Voucher aktualisieren + Redemption anlegen
      await db.update(vouchers).set({
        remainingBalance: String(balanceAfter),
        status: newStatus,
        usedCount: voucher.usedCount + 1,
      }).where(eq(vouchers.id, voucher.id));

      await db.insert(voucherRedemptions).values({
        voucherId: voucher.id,
        orderId: input.orderId || null,
        restaurantId,
        redeemedBy: ctx.user.id,
        amountDeducted: String(actualDiscount),
        balanceBefore: String(balanceBefore),
        balanceAfter: String(balanceAfter),
        note: input.note || null,
      });

      const [updatedVoucher] = await db.select().from(vouchers).where(eq(vouchers.id, voucher.id));
      return { voucher: updatedVoucher, amountDeducted: actualDiscount, balanceBefore, balanceAfter };
    }),

  // ─── QR-Code für Gutschein ──────────────────────────────────────────────────
  getQrCode: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(eq(vouchers.id, input.id), eq(vouchers.restaurantId, restaurantId)));
      if (!voucher) throw new TRPCError({ code: "NOT_FOUND" });

      // QR-Code zeigt auf öffentliche Guthaben-Seite (vollständige URL für Scan)
      const appDomain = process.env.VITE_APP_DOMAIN || "simplapos.com";
      const publicUrl = `https://${appDomain}/gift/${voucher.code}`;
      const qrDataUrl = await QRCode.toDataURL(publicUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 300,
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });

      const [restaurant] = await db.select({ name: restaurants.name, logoUrl: restaurants.logoUrl, giftCardBackgroundUrl: restaurants.giftCardBackgroundUrl })
        .from(restaurants).where(eq(restaurants.id, restaurantId));

      return { code: voucher.code, qrDataUrl, voucher, publicUrl, restaurantName: restaurant?.name ?? "", restaurantLogoUrl: restaurant?.logoUrl ?? null, giftCardBackgroundUrl: restaurant?.giftCardBackgroundUrl ?? null };
    }),

  // ─── Geschenkkarte kaufen (Kasse) ────────────────────────────────────────────
  purchaseGiftCard: protectedProcedure
    .input(z.object({
      voucherId: z.number().int(),
      paymentMethod: z.enum(["cash", "card", "twint"]),
      buyerName: z.string().max(255).optional(),
      buyerEmail: z.string().email().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(eq(vouchers.id, input.voucherId), eq(vouchers.restaurantId, restaurantId)));
      if (!voucher) throw new TRPCError({ code: "NOT_FOUND" });
      if (voucher.category !== "gift_card") throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Geschenkkarten-Gutschein" });

      // Kauf protokollieren
      await db.insert(giftCardPurchases).values({
        voucherId: voucher.id,
        restaurantId,
        purchasedBy: ctx.user.id,
        amount: voucher.value,
        paymentMethod: input.paymentMethod,
        buyerName: input.buyerName || null,
        buyerEmail: input.buyerEmail || null,
        note: input.note || null,
      });

      // Gutschein aktivieren falls noch nicht aktiv
      if (voucher.status !== "active") {
        await db.update(vouchers).set({ status: "active" }).where(eq(vouchers.id, voucher.id));
      }

      const [updated] = await db.select().from(vouchers).where(eq(vouchers.id, voucher.id));
      return { voucher: updated, purchase: { paymentMethod: input.paymentMethod, amount: voucher.value } };
    }),

  // ─── Geschenkkarte als Zahlungsmethode einlösen ─────────────────────────────
  redeemGiftCard: protectedProcedure
    .input(z.object({
      code: z.string().min(1),
      orderId: z.number().int().optional(),
      amountToRedeem: z.number().positive(), // Betrag der eingelöst werden soll
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(
          eq(vouchers.restaurantId, restaurantId),
          eq(vouchers.code, input.code.toUpperCase().trim())
        ));

      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "Geschenkkarte nicht gefunden" });
      if (voucher.category !== "gift_card") throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Geschenkkarten-Code" });

      const now = new Date();
      if (voucher.validUntil && new Date(voucher.validUntil) < now)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Geschenkkarte ist abgelaufen" });
      if (voucher.status === "cancelled")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Geschenkkarte wurde storniert" });
      if (voucher.status === "redeemed")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Geschenkkarte wurde bereits vollständig eingelöst" });

      const remaining = parseFloat(voucher.remainingBalance);
      if (remaining <= 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Restguthaben vorhanden" });

      const actualDeducted = Math.min(input.amountToRedeem, remaining);
      const balanceBefore = remaining;
      const balanceAfter = Math.max(0, remaining - actualDeducted);

      let newStatus: "active" | "redeemed" | "partially_redeemed" = "active";
      if (balanceAfter <= 0) newStatus = "redeemed";
      else if (balanceAfter < parseFloat(voucher.initialBalance)) newStatus = "partially_redeemed";

      await db.update(vouchers).set({
        remainingBalance: String(balanceAfter),
        status: newStatus,
        usedCount: voucher.usedCount + 1,
      }).where(eq(vouchers.id, voucher.id));

      await db.insert(voucherRedemptions).values({
        voucherId: voucher.id,
        orderId: input.orderId || null,
        restaurantId,
        redeemedBy: ctx.user.id,
        amountDeducted: String(actualDeducted),
        balanceBefore: String(balanceBefore),
        balanceAfter: String(balanceAfter),
        note: input.note || null,
      });

      const [updatedVoucher] = await db.select().from(vouchers).where(eq(vouchers.id, voucher.id));
      return { voucher: updatedVoucher, amountDeducted: actualDeducted, balanceBefore, balanceAfter, remainingAfter: balanceAfter };
    }),

  // ─── Geschenkkarte Guthaben prüfen ──────────────────────────────────────────
  checkGiftCardBalance: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(
          eq(vouchers.restaurantId, restaurantId),
          eq(vouchers.code, input.code.toUpperCase().trim())
        ));

      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "Geschenkkarte nicht gefunden" });
      if (voucher.category !== "gift_card") throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Geschenkkarten-Code" });

      const now = new Date();
      const isExpired = voucher.validUntil ? new Date(voucher.validUntil) < now : false;
      const remaining = parseFloat(voucher.remainingBalance);

      return {
        voucher,
        valid: !isExpired && voucher.status !== "cancelled" && voucher.status !== "redeemed" && remaining > 0,
        remaining,
        isExpired,
      };
    }),

  // ─── Öffentlicher Guthaben-Endpoint (kein Login nötig) ─────────────────────
  getGiftCardPublic: publicProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(
          eq(vouchers.code, input.code.toUpperCase().trim()),
          eq(vouchers.category, "gift_card")
        ));

      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "Geschenkkarte nicht gefunden" });

      // Erlaubte Restaurants laden (Multi-Restaurant-Support)
      let allowedRestaurantList: Array<{ id: number; name: string; address: string | null; zip: string | null; city: string | null; phone: string | null; website: string | null; logoUrl: string | null }> = [];
      if (voucher.allowedRestaurantIds) {
        try {
          const ids: number[] = JSON.parse(voucher.allowedRestaurantIds);
          if (ids.length > 1) {
            const allRests = await db.select({
              id: restaurants.id,
              name: restaurants.name,
              address: restaurants.address,
              zip: restaurants.zip,
              city: restaurants.city,
              phone: restaurants.phone,
              website: restaurants.website,
              logoUrl: restaurants.logoUrl,
            }).from(restaurants);
            allowedRestaurantList = allRests.filter((r: typeof allRests[0]) => ids.includes(r.id));
          }
        } catch {}
      }

      // Restaurant-Daten laden (vollständig für öffentliche Seite)
      const [restaurant] = await db.select({
        name: restaurants.name,
        address: restaurants.address,
        zip: restaurants.zip,
        city: restaurants.city,
        country: restaurants.country,
        phone: restaurants.phone,
        email: restaurants.email,
        website: restaurants.website,
        logoUrl: restaurants.logoUrl,
        openingHours: restaurants.openingHours,
        businessType: restaurants.businessType,
        instagramUrl: restaurants.instagramUrl,
        tiktokUrl: restaurants.tiktokUrl,
        facebookUrl: restaurants.facebookUrl,
        googleMapsUrl: restaurants.googleMapsUrl,
        tripadvisorUrl: restaurants.tripadvisorUrl,
        youtubeUrl: restaurants.youtubeUrl,
      }).from(restaurants).where(eq(restaurants.id, voucher.restaurantId));

      // QR-Code für Gast-Seite generieren (gleicher Code wie Admin/Kellner)
      const appDomain = process.env.VITE_APP_DOMAIN || "simplapos.com";
      const publicUrl = `https://${appDomain}/gift/${voucher.code}`;
      const qrDataUrl = await QRCode.toDataURL(publicUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 280,
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });

      // Transaktionshistorie laden
      const history = await db.select().from(voucherRedemptions)
        .where(eq(voucherRedemptions.voucherId, voucher.id))
        .orderBy(desc(voucherRedemptions.redeemedAt));

      // Aufladungen laden
      const topups = await db.select().from(giftCardPurchases)
        .where(eq(giftCardPurchases.voucherId, voucher.id))
        .orderBy(desc(giftCardPurchases.purchasedAt));

      const now = new Date();
      const isExpired = voucher.validUntil ? new Date(voucher.validUntil) < now : false;
      const remaining = parseFloat(voucher.remainingBalance);

      // Vollständige Adresse zusammensetzen
      const addressParts = [restaurant?.address, restaurant?.zip && restaurant?.city ? `${restaurant.zip} ${restaurant.city}` : restaurant?.city].filter(Boolean);
      const fullAddress = addressParts.join(", ");
      // Google Maps URL
      const mapsQuery = encodeURIComponent(fullAddress || restaurant?.name || "");
      const googleMapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${mapsQuery}` : null;
      const appleMapsUrl = mapsQuery ? `https://maps.apple.com/?q=${mapsQuery}` : null;

      return {
        code: voucher.code,
        restaurantName: restaurant?.name ?? "Restaurant",
        restaurantAddress: restaurant?.address ?? "",
        restaurantCity: restaurant?.city ?? "",
        restaurantZip: restaurant?.zip ?? "",
        restaurantPhone: restaurant?.phone ?? "",
        restaurantEmail: restaurant?.email ?? "",
        restaurantWebsite: restaurant?.website ?? "",
        restaurantLogoUrl: restaurant?.logoUrl ?? "",
        restaurantOpeningHours: restaurant?.openingHours ?? null,
        restaurantBusinessType: restaurant?.businessType ?? "restaurant",
        fullAddress,
        googleMapsUrl,
        appleMapsUrl,
        initialBalance: parseFloat(voucher.initialBalance),
        remainingBalance: remaining,
        currency: voucher.currency,
        status: voucher.status,
        isExpired,
        valid: !isExpired && voucher.status !== "cancelled" && voucher.status !== "redeemed" && remaining > 0,
        issuedTo: voucher.issuedTo,
        validFrom: voucher.validFrom,
        validUntil: voucher.validUntil,
        createdAt: voucher.createdAt,
        history: history.map((r: typeof history[0]) => ({
          type: "redemption" as const,
          amount: parseFloat(r.amountDeducted),
          balanceBefore: parseFloat(r.balanceBefore),
          balanceAfter: parseFloat(r.balanceAfter),
          note: r.note,
          date: r.redeemedAt,
        })),
        topups: topups.map((t: typeof topups[0]) => ({
          type: "topup" as const,
          amount: parseFloat(t.purchaseAmount),
          buyerName: t.buyerName,
          date: t.purchasedAt,
        })),
        allowedRestaurants: allowedRestaurantList,
        qrDataUrl,
        publicUrl,
        socialMedia: {
          instagram: restaurant?.instagramUrl ?? null,
          tiktok: restaurant?.tiktokUrl ?? null,
          facebook: restaurant?.facebookUrl ?? null,
          googleMaps: restaurant?.googleMapsUrl ?? null,
          tripadvisor: restaurant?.tripadvisorUrl ?? null,
          youtube: restaurant?.youtubeUrl ?? null,
          website: restaurant?.website ?? null,
        },
      };
    }),

  // ─── Stripe Checkout für Online-Aufladung ────────────────────────────────────
  createGiftCardTopupSession: publicProcedure
    .input(z.object({
      code: z.string().min(1),
      amount: z.number().min(5).max(500), // CHF 5–500
      origin: z.string().url(),
      buyerEmail: z.string().email().optional(),
      buyerName: z.string().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [voucher] = await db.select().from(vouchers)
        .where(and(
          eq(vouchers.code, input.code.toUpperCase().trim()),
          eq(vouchers.category, "gift_card")
        ));

      if (!voucher) throw new TRPCError({ code: "NOT_FOUND", message: "Geschenkkarte nicht gefunden" });
      if (voucher.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Diese Geschenkkarte ist storniert" });

      const [restaurant] = await db.select({ name: restaurants.name })
        .from(restaurants).where(eq(restaurants.id, voucher.restaurantId));

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: input.buyerEmail,
        metadata: {
          type: "gift_card_topup",
          voucher_id: voucher.id.toString(),
          voucher_code: voucher.code,
          restaurant_id: voucher.restaurantId.toString(),
          buyer_name: input.buyerName ?? "",
          amount: input.amount.toString(),
        },
        line_items: [{
          price_data: {
            currency: "chf",
            product_data: {
              name: `Geschenkkarte aufladen – ${restaurant?.name ?? "Restaurant"}`,
              description: `Code: ${voucher.code}`,
            },
            unit_amount: Math.round(input.amount * 100),
          },
          quantity: 1,
        }],
        success_url: `${input.origin}/gift/${voucher.code}?topup=success`,
        cancel_url: `${input.origin}/gift/${voucher.code}`,
      });

      return { checkoutUrl: session.url! };
    }),

  // ─── Statistics ─────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [counts] = await db.select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)`,
        redeemed: sql<number>`SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END)`,
        partiallyRedeemed: sql<number>`SUM(CASE WHEN status = 'partially_redeemed' THEN 1 ELSE 0 END)`,
        expired: sql<number>`SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END)`,
        totalIssuedValue: sql<number>`SUM(CASE WHEN type = 'fixed' THEN CAST(initialBalance AS DECIMAL(10,2)) ELSE 0 END)`,
        totalRemainingValue: sql<number>`SUM(CASE WHEN type = 'fixed' THEN CAST(remainingBalance AS DECIMAL(10,2)) ELSE 0 END)`,
      }).from(vouchers).where(eq(vouchers.restaurantId, restaurantId));

      const [redemptionStats] = await db.select({
        totalRedeemed: sql<number>`SUM(CAST(amountDeducted AS DECIMAL(10,2)))`,
        redemptionCount: sql<number>`COUNT(*)`,
      }).from(voucherRedemptions).where(eq(voucherRedemptions.restaurantId, restaurantId));

      return {
        total: Number(counts?.total ?? 0),
        active: Number(counts?.active ?? 0),
        redeemed: Number(counts?.redeemed ?? 0),
        partiallyRedeemed: Number(counts?.partiallyRedeemed ?? 0),
        expired: Number(counts?.expired ?? 0),
        totalIssuedValue: Number(counts?.totalIssuedValue ?? 0),
        totalRemainingValue: Number(counts?.totalRemainingValue ?? 0),
        totalRedeemedAmount: Number(redemptionStats?.totalRedeemed ?? 0),
        redemptionCount: Number(redemptionStats?.redemptionCount ?? 0),
      };
    }),

  // ─── Guest Gift Card Purchase (Stripe Checkout) ───────────────────────────────
  /** Öffentlicher Endpoint: Restaurant-Infos für Geschenkkarten-Landingpage */
  getRestaurantForGiftCard: publicProcedure
    .input(z.object({ restaurantId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [restaurant] = await db.select({
        id: restaurants.id,
        name: restaurants.name,
        logoUrl: restaurants.logoUrl,
        address: restaurants.address,
        zip: restaurants.zip,
        city: restaurants.city,
        phone: restaurants.phone,
        email: restaurants.email,
        website: restaurants.website,
        openingHours: restaurants.openingHours,
        instagramUrl: restaurants.instagramUrl,
        tiktokUrl: restaurants.tiktokUrl,
        facebookUrl: restaurants.facebookUrl,
        googleMapsUrl: restaurants.googleMapsUrl,
        tripadvisorUrl: restaurants.tripadvisorUrl,
        giftCardBackgroundUrl: restaurants.giftCardBackgroundUrl,
      }).from(restaurants).where(eq(restaurants.id, input.restaurantId));

      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });

      return restaurant;
    }),

  getLandingPageQrCode: protectedProcedure
    .input(z.object({
      restaurantId: z.number().int().positive(),
      origin: z.string().url(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Sicherstellen dass der Nutzer zum Restaurant gehört
      if (ctx.user.restaurantId !== input.restaurantId && ctx.user.role !== "superadmin")
        throw new TRPCError({ code: "FORBIDDEN" });

      const landingUrl = `${input.origin}/gift/buy/${input.restaurantId}`;
      const qrDataUrl = await QRCode.toDataURL(landingUrl, {
        width: 400,
        margin: 2,
        color: { dark: "#1e1b4b", light: "#ffffff" },
      });
      return { qrDataUrl, landingUrl };
    }),

  createGiftCardPurchaseSession: publicProcedure
    .input(z.object({
      restaurantId: z.number().int().positive(),
      amount: z.number().min(5).max(500), // CHF 5–500
      origin: z.string().url(),
      recipientName: z.string().max(255).optional(),
      recipientEmail: z.string().email().optional(),
      buyerName: z.string().max(255).optional(),
      buyerEmail: z.string().email().optional(),
      message: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [restaurant] = await db.select({
        id: restaurants.id,
        name: restaurants.name,
        logoUrl: restaurants.logoUrl,
      }).from(restaurants).where(eq(restaurants.id, input.restaurantId));

      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });

      // Temporären Code generieren – wird nach Zahlung im Webhook erstellt
      const pendingRef = `PENDING-${Date.now()}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: input.buyerEmail,
        metadata: {
          type: "gift_card_purchase",
          restaurant_id: input.restaurantId.toString(),
          amount: input.amount.toString(),
          recipient_name: input.recipientName ?? "",
          recipient_email: input.recipientEmail ?? "",
          buyer_name: input.buyerName ?? "",
          buyer_email: input.buyerEmail ?? "",
          message: input.message ?? "",
        },
        line_items: [{
          price_data: {
            currency: "chf",
            product_data: {
              name: `Geschenkkarte – ${restaurant.name}`,
              description: input.recipientName
                ? `Für: ${input.recipientName}${input.message ? ` · ${input.message}` : ""}`
                : `CHF ${input.amount.toFixed(2)} Geschenkkarte`,
            },
            unit_amount: Math.round(input.amount * 100),
          },
          quantity: 1,
        }],
        success_url: `${input.origin}/gift/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/order/${input.restaurantId}`,
      });

      return { checkoutUrl: session.url! };
    }),
});
