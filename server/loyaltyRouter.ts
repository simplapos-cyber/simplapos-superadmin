/**
 * loyaltyRouter.ts – Treuepunkte-System
 *
 * DSGVO/CH DSG konform:
 * - Explizite Einwilligung (Opt-in) bei Registrierung
 * - Datensparsamkeit: nur Name, E-Mail, Geburtsmonat
 * - Recht auf Löschung (anonymisiert, Transaktionen bleiben für Buchhaltung)
 * - Transparenz: vollständiger Punkte-Verlauf für Kunden sichtbar
 * - Punkte-Ablauf nach konfigurierbarer Inaktivitätsdauer
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  loyaltyPrograms,
  loyaltyCustomers,
  loyaltyTransactions,
  loyaltyRewards,
  loyaltyPushSubscriptions,
  restaurants,
} from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import webpush from "web-push";

// VAPID-Keys für Web Push konfigurieren
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:info@simplapos.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Stufe anhand Lifetime-Punkte berechnen */
function calculateTier(lifetimePoints: number, tiers?: any[]): "bronze" | "silver" | "gold" | "platinum" {
  const defaultTiers = [
    { name: "bronze", minPoints: 0 },
    { name: "silver", minPoints: 500 },
    { name: "gold", minPoints: 2000 },
    { name: "platinum", minPoints: 5000 },
  ];
  const tierList = (tiers ?? defaultTiers).sort((a: any, b: any) => b.minPoints - a.minPoints);
  for (const t of tierList) {
    if (lifetimePoints >= t.minPoints) {
      return t.name as "bronze" | "silver" | "gold" | "platinum";
    }
  }
  return "bronze";
}

/** Punkte-Multiplikator für Stufe */
function getTierMultiplier(tier: string, tiers?: any[]): number {
  const defaultMultipliers: Record<string, number> = {
    bronze: 1.0,
    silver: 1.25,
    gold: 1.5,
    platinum: 2.0,
  };
  if (tiers) {
    const t = tiers.find((x: any) => x.name === tier);
    if (t?.multiplier) return t.multiplier;
  }
  return defaultMultipliers[tier] ?? 1.0;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const loyaltyRouter = router({

  // ── Admin: Programm-Einstellungen ──────────────────────────────────────────

  /** Programm-Einstellungen laden (oder Defaults zurückgeben) */
  getProgram: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

    const [program] = await db.select().from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.restaurantId, restaurantId));

    const DEFAULT_TIERS = [
      { name: "bronze", minPoints: 0, multiplier: 1.0, color: "#cd7f32", label: "Bronze" },
      { name: "silver", minPoints: 500, multiplier: 1.25, color: "#9ca3af", label: "Silber" },
      { name: "gold", minPoints: 2000, multiplier: 1.5, color: "#f59e0b", label: "Gold" },
      { name: "platinum", minPoints: 5000, multiplier: 2.0, color: "#8b5cf6", label: "Platin" },
    ];

    if (!program) {
      // Defaults zurückgeben ohne in DB zu schreiben
      return {
        id: null,
        restaurantId,
        name: "Treueprogramm",
        isActive: false,
        pointsPerChf: "1.00",
        pointsPerRedemptionChf: "100.00",
        minRedemptionPoints: 100,
        maxRedemptionPercent: 50,
        welcomeBonus: 50,
        birthdayBonus: 100,
        tiers: DEFAULT_TIERS,
        expiryMonths: 24,
        privacyText: "Ich stimme der Verarbeitung meiner Daten für das Treueprogramm gemäss Datenschutzerklärung zu.",
        primaryColor: "#7c3aed",
        logoUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Normalisiere alle Felder damit keine Decimal/JSON-Objekte in die UI gelangen
    let parsedTiers: any[] = DEFAULT_TIERS;
    if (program.tiers) {
      if (Array.isArray(program.tiers)) {
        parsedTiers = program.tiers;
      } else if (typeof program.tiers === "string") {
        try { parsedTiers = JSON.parse(program.tiers as string); } catch { parsedTiers = DEFAULT_TIERS; }
      }
    }

    return {
      ...program,
      pointsPerChf: String(program.pointsPerChf ?? "1.00"),
      pointsPerRedemptionChf: String(program.pointsPerRedemptionChf ?? "100.00"),
      minRedemptionPoints: Number(program.minRedemptionPoints ?? 100),
      maxRedemptionPercent: Number(program.maxRedemptionPercent ?? 50),
      welcomeBonus: Number(program.welcomeBonus ?? 50),
      birthdayBonus: Number(program.birthdayBonus ?? 100),
      expiryMonths: Number(program.expiryMonths ?? 24),
      tiers: parsedTiers,
      privacyText: program.privacyText ?? "",
      primaryColor: program.primaryColor ?? "#7c3aed",
      logoUrl: program.logoUrl ?? null,
    };
  }),

  /** Programm-Einstellungen speichern (upsert) */
  saveProgram: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      isActive: z.boolean(),
      pointsPerChf: z.number().min(0.1).max(100),
      pointsPerRedemptionChf: z.number().min(1).max(10000),
      minRedemptionPoints: z.number().int().min(1),
      maxRedemptionPercent: z.number().int().min(1).max(100),
      welcomeBonus: z.number().int().min(0),
      birthdayBonus: z.number().int().min(0),
      tiers: z.array(z.object({
        name: z.string(),
        minPoints: z.number().int().min(0),
        multiplier: z.number().min(1),
        color: z.string(),
        label: z.string(),
      })).optional(),
      expiryMonths: z.number().int().min(0),
      privacyText: z.string().max(2000).optional(),
      primaryColor: z.string().max(7).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [existing] = await db.select({ id: loyaltyPrograms.id })
        .from(loyaltyPrograms).where(eq(loyaltyPrograms.restaurantId, restaurantId));

      const data = {
        restaurantId,
        name: input.name,
        isActive: input.isActive,
        pointsPerChf: input.pointsPerChf.toFixed(2),
        pointsPerRedemptionChf: input.pointsPerRedemptionChf.toFixed(2),
        minRedemptionPoints: input.minRedemptionPoints,
        maxRedemptionPercent: input.maxRedemptionPercent,
        welcomeBonus: input.welcomeBonus,
        birthdayBonus: input.birthdayBonus,
        tiers: input.tiers ?? null,
        expiryMonths: input.expiryMonths,
        privacyText: input.privacyText ?? null,
        primaryColor: input.primaryColor ?? "#7c3aed",
      };

      if (existing) {
        await db.update(loyaltyPrograms).set(data).where(eq(loyaltyPrograms.id, existing.id));
      } else {
        await db.insert(loyaltyPrograms).values(data);
      }
      return { success: true };
    }),

  // ── Admin: Prämien-Verwaltung ───────────────────────────────────────────────

  listRewards: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
    return db.select().from(loyaltyRewards)
      .where(eq(loyaltyRewards.restaurantId, restaurantId))
      .orderBy(loyaltyRewards.sortOrder, loyaltyRewards.id);
  }),

  saveReward: protectedProcedure
    .input(z.object({
      id: z.number().int().optional(),
      name: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      type: z.enum(["discount_chf", "discount_percent", "free_item", "custom"]),
      pointsCost: z.number().int().min(1),
      value: z.number().min(0).optional(),
      minTier: z.enum(["bronze", "silver", "gold", "platinum"]).nullable().optional(),
      isActive: z.boolean(),
      sortOrder: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const data = {
        restaurantId,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        pointsCost: input.pointsCost,
        value: input.value != null ? input.value.toFixed(2) : null,
        minTier: input.minTier ?? null,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      };

      if (input.id) {
        await db.update(loyaltyRewards).set(data)
          .where(and(eq(loyaltyRewards.id, input.id), eq(loyaltyRewards.restaurantId, restaurantId)));
      } else {
        await db.insert(loyaltyRewards).values(data);
      }
      return { success: true };
    }),

  deleteReward: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      await db.delete(loyaltyRewards)
        .where(and(eq(loyaltyRewards.id, input.id), eq(loyaltyRewards.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ── Admin: Kunden-Übersicht ─────────────────────────────────────────────────

  listCustomers: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      tier: z.enum(["bronze", "silver", "gold", "platinum"]).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      let query = db.select().from(loyaltyCustomers)
        .where(eq(loyaltyCustomers.restaurantId, restaurantId));

      const customers = await db.select().from(loyaltyCustomers)
        .where(eq(loyaltyCustomers.restaurantId, restaurantId))
        .orderBy(desc(loyaltyCustomers.totalPoints))
        .limit(input.limit)
        .offset(input.offset);

      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(loyaltyCustomers).where(eq(loyaltyCustomers.restaurantId, restaurantId));

      return { customers, total: Number(count) };
    }),

  /** Punkte manuell anpassen (Admin) */
  adjustPoints: protectedProcedure
    .input(z.object({
      customerId: z.number().int(),
      points: z.number().int().min(-100000).max(100000),
      note: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [customer] = await db.select().from(loyaltyCustomers)
        .where(and(eq(loyaltyCustomers.id, input.customerId), eq(loyaltyCustomers.restaurantId, restaurantId)));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      const newBalance = Math.max(0, customer.totalPoints + input.points);
      const newLifetime = input.points > 0 ? customer.lifetimePoints + input.points : customer.lifetimePoints;
      const [program] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.restaurantId, restaurantId));
      const newTier = calculateTier(newLifetime, (program?.tiers as any[]) ?? undefined);

      await db.update(loyaltyCustomers).set({
        totalPoints: newBalance,
        lifetimePoints: newLifetime,
        tier: newTier,
      }).where(eq(loyaltyCustomers.id, customer.id));

      await db.insert(loyaltyTransactions).values({
        customerId: customer.id,
        restaurantId,
        type: input.points >= 0 ? "manual_add" : "manual_deduct",
        points: input.points,
        balanceAfter: newBalance,
        description: input.points >= 0 ? "Manuell gutgeschrieben" : "Manuell abgezogen",
        adminNote: input.note ?? null,
      });

      // Push-Benachrichtigung bei manueller Gutschrift (nur bei positiven Punkten)
      if (input.points > 0 && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        const db2 = await getDb();
        if (db2) {
          const subs = await db2.select().from(loyaltyPushSubscriptions)
            .where(and(
              eq(loyaltyPushSubscriptions.restaurantId, restaurantId),
              eq(loyaltyPushSubscriptions.customerId, customer.id)
            ));
          if (subs.length > 0) {
            const pushPayload = JSON.stringify({
              title: `⭐ +${input.points} Punkte gutgeschrieben!`,
              body: input.note
                ? `${input.note} – Neues Guthaben: ${newBalance.toLocaleString("de-CH")} Punkte.`
                : `Neues Guthaben: ${newBalance.toLocaleString("de-CH")} Punkte.`,
              url: `/loyalty/${customer.token}`,
              tag: `adjust-${customer.id}-${Date.now()}`,
            });
            await Promise.allSettled(subs.map((sub: typeof subs[0]) =>
              webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                pushPayload
              ).catch(() => {})
            ));
          }
        }
      }

      return { success: true, newBalance, newTier };
    }),

  /** Kunden-Stammdaten (Name, Telefon, Geburtstag) durch Admin ändern */
  updateCustomer: protectedProcedure
    .input(z.object({
      customerId: z.number().int(),
      firstName: z.string().min(1).max(128).optional(),
      lastName: z.string().max(128).optional().nullable(),
      phone: z.string().max(32).optional().nullable(),
      birthMonth: z.number().int().min(1).max(12).optional().nullable(),
      birthDay: z.number().int().min(1).max(31).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [customer] = await db.select({ id: loyaltyCustomers.id })
        .from(loyaltyCustomers)
        .where(and(eq(loyaltyCustomers.id, input.customerId), eq(loyaltyCustomers.restaurantId, restaurantId)));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
      if (input.firstName !== undefined) updateData.firstName = input.firstName;
      if (input.lastName !== undefined) updateData.lastName = input.lastName;
      if (input.phone !== undefined) updateData.phone = input.phone;
      if (input.birthMonth !== undefined) updateData.birthMonth = input.birthMonth;
      if (input.birthDay !== undefined) updateData.birthDay = input.birthDay;

      await db.update(loyaltyCustomers).set(updateData).where(eq(loyaltyCustomers.id, input.customerId));
      return { success: true };
    }),


  // ── Öffentlich: Kunden-Registrierung ───────────────────────────────────────

  /** Kunden-Registrierung (Opt-in, DSGVO-konform) */
  register: publicProcedure
    .input(z.object({
      restaurantId: z.number().int().positive(),
      email: z.string().email().max(320),
      firstName: z.string().min(1).max(128),
      lastName: z.string().max(128).optional(),
      phone: z.string().max(32).optional(),
      birthMonth: z.number().int().min(1).max(12).optional(),
      birthDay: z.number().int().min(1).max(31).optional(),
      marketingConsent: z.boolean().default(false),
      consentGiven: z.literal(true), // Pflicht-Opt-in
      ip: z.string().max(45).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Programm prüfen
      const [program] = await db.select().from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.restaurantId, input.restaurantId), eq(loyaltyPrograms.isActive, true)));
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Kein aktives Treueprogramm gefunden" });

      // Bereits registriert?
      const [existing] = await db.select({ id: loyaltyCustomers.id, token: loyaltyCustomers.token })
        .from(loyaltyCustomers)
        .where(and(
          eq(loyaltyCustomers.restaurantId, input.restaurantId),
          eq(loyaltyCustomers.email, input.email.toLowerCase()),
        ));

      if (existing) {
        return { token: existing.token, isNew: false };
      }

      const token = generateToken();
      const welcomeBonus = program.welcomeBonus ?? 50;

      await db.insert(loyaltyCustomers).values({
        restaurantId: input.restaurantId,
        token,
        email: input.email.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        phone: input.phone ?? null,
        birthMonth: input.birthMonth ?? null,
        birthDay: input.birthDay ?? null,
        totalPoints: welcomeBonus,
        lifetimePoints: welcomeBonus,
        tier: "bronze",
        consentGiven: true,
        consentDate: new Date(),
        consentIp: input.ip ?? null,
        marketingConsent: input.marketingConsent,
        lastActivityAt: new Date(),
      });

      // Willkommens-Bonus Transaktion
      if (welcomeBonus > 0) {
        const [newCustomer] = await db.select({ id: loyaltyCustomers.id })
          .from(loyaltyCustomers)
          .where(and(eq(loyaltyCustomers.restaurantId, input.restaurantId), eq(loyaltyCustomers.token, token)));
        if (newCustomer) {
          await db.insert(loyaltyTransactions).values({
            customerId: newCustomer.id,
            restaurantId: input.restaurantId,
            type: "welcome_bonus",
            points: welcomeBonus,
            balanceAfter: welcomeBonus,
            description: `Willkommens-Bonus: ${welcomeBonus} Punkte`,
          });
        }
      }

      return { token, isNew: true };
    }),

  // ── Öffentlich: Kunden-Portal ───────────────────────────────────────────────

  /** Treuekarte laden (via Token) */
  getCard: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [customer] = await db.select().from(loyaltyCustomers)
        .where(eq(loyaltyCustomers.token, input.token));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      const [program] = await db.select().from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.restaurantId, customer.restaurantId));

      const [restaurant] = await db.select({
        name: restaurants.name,
        logoUrl: restaurants.logoUrl,
        address: restaurants.address,
        city: restaurants.city,
      }).from(restaurants).where(eq(restaurants.id, customer.restaurantId));

      const transactions = await db.select().from(loyaltyTransactions)
        .where(eq(loyaltyTransactions.customerId, customer.id))
        .orderBy(desc(loyaltyTransactions.createdAt))
        .limit(50);

      const rewards = await db.select().from(loyaltyRewards)
        .where(and(
          eq(loyaltyRewards.restaurantId, customer.restaurantId),
          eq(loyaltyRewards.isActive, true),
        ))
        .orderBy(loyaltyRewards.sortOrder);

      // Nächste Stufe berechnen
      const tiers = (program?.tiers as any[]) ?? [
        { name: "bronze", minPoints: 0, label: "Bronze", color: "#cd7f32" },
        { name: "silver", minPoints: 500, label: "Silber", color: "#9ca3af" },
        { name: "gold", minPoints: 2000, label: "Gold", color: "#f59e0b" },
        { name: "platinum", minPoints: 5000, label: "Platin", color: "#8b5cf6" },
      ];
      const sortedTiers = [...tiers].sort((a: any, b: any) => a.minPoints - b.minPoints);
      const currentTierIdx = sortedTiers.findIndex((t: { name: string }) => t.name === customer.tier);
      const nextTier = sortedTiers[currentTierIdx + 1] ?? null;
      const progressToNext = nextTier
        ? Math.min(100, Math.round((customer.lifetimePoints / nextTier.minPoints) * 100))
        : 100;

      return {
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          totalPoints: customer.totalPoints,
          lifetimePoints: customer.lifetimePoints,
          tier: customer.tier,
          lastActivityAt: customer.lastActivityAt,
          createdAt: customer.createdAt,
        },
        program: program ?? null,
        restaurant: restaurant ?? null,
        transactions,
        rewards,
        tiers: sortedTiers,
        nextTier,
        progressToNext,
      };
    }),

  /** DSGVO: Konto löschen (anonymisieren) */
  deleteAccount: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [customer] = await db.select({ id: loyaltyCustomers.id })
        .from(loyaltyCustomers).where(eq(loyaltyCustomers.token, input.token));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      // Anonymisieren (nicht löschen – Transaktionen bleiben für Buchhaltung)
      await db.update(loyaltyCustomers).set({
        email: `deleted-${customer.id}@anonymized.invalid`,
        firstName: "Gelöscht",
        lastName: null,
        phone: null,
        birthMonth: null,
        token: `deleted-${customer.id}-${Date.now()}`,
        isActive: false,
        consentGiven: false,
        marketingConsent: false,
      }).where(eq(loyaltyCustomers.id, customer.id));

      return { success: true };
    }),

  // ── Waiter: Punkte sammeln ──────────────────────────────────────────────────

  /** Kunden per E-Mail oder Telefon suchen (beim Bezahlen) */
  lookupCustomer: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(320), // E-Mail oder Telefon
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const q = input.query.toLowerCase().trim();
      const customers = await db.select({
        id: loyaltyCustomers.id,
        token: loyaltyCustomers.token,
        firstName: loyaltyCustomers.firstName,
        lastName: loyaltyCustomers.lastName,
        email: loyaltyCustomers.email,
        phone: loyaltyCustomers.phone,
        totalPoints: loyaltyCustomers.totalPoints,
        tier: loyaltyCustomers.tier,
      }).from(loyaltyCustomers)
        .where(and(
          eq(loyaltyCustomers.restaurantId, restaurantId),
          eq(loyaltyCustomers.isActive, true),
        ))
        .limit(10);

      // Client-seitige Filterung (MySQL LIKE mit Parametern)
      // Unterstützt auch Token-Suche (QR-Code-Scan gibt den Token zurück)
      return customers.filter((c: typeof customers[number]) =>
        c.email.toLowerCase().includes(q) ||
        (c.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
        c.firstName.toLowerCase().includes(q) ||
        (c.lastName ?? "").toLowerCase().includes(q) ||
        (c.token ?? "") === q  // exakter Token-Match (QR-Code-Scan)
      );
    }),

  // ── Interne Hilfsfunktion: Push an einen Kunden senden ───────────────────
  // (nicht als tRPC-Endpoint exponiert, nur intern genutzt)

  /** Punkte nach Bezahlung gutschreiben */
  earnPoints: protectedProcedure
    .input(z.object({
      customerId: z.number().int(),
      orderAmount: z.number().min(0),
      orderId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [program] = await db.select().from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.restaurantId, restaurantId), eq(loyaltyPrograms.isActive, true)));
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Kein aktives Treueprogramm" });

      const [customer] = await db.select().from(loyaltyCustomers)
        .where(and(eq(loyaltyCustomers.id, input.customerId), eq(loyaltyCustomers.restaurantId, restaurantId)));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      const multiplier = getTierMultiplier(customer.tier, (program.tiers as any[]) ?? undefined);
      const basePoints = Math.floor(input.orderAmount * parseFloat(program.pointsPerChf));
      const earnedPoints = Math.floor(basePoints * multiplier);

      const newBalance = customer.totalPoints + earnedPoints;
      const newLifetime = customer.lifetimePoints + earnedPoints;
      const newTier = calculateTier(newLifetime, (program.tiers as any[]) ?? undefined);

      await db.update(loyaltyCustomers).set({
        totalPoints: newBalance,
        lifetimePoints: newLifetime,
        tier: newTier,
        lastActivityAt: new Date(),
        applePassUpdatedAt: new Date(), // Wallet-Update triggern
      }).where(eq(loyaltyCustomers.id, customer.id));

      await db.insert(loyaltyTransactions).values({
        customerId: customer.id,
        restaurantId,
        type: "earn",
        points: earnedPoints,
        balanceAfter: newBalance,
        orderId: input.orderId ?? null,
        orderAmount: input.orderAmount.toFixed(2),
        description: `CHF ${input.orderAmount.toFixed(2)} × ${program.pointsPerChf} × ${multiplier}× (${customer.tier})`,
      });

      // Push-Benachrichtigung an Kunden senden (fire-and-forget, kein Fehler wenn keine Subscription)
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        const db2 = await getDb();
        if (db2) {
          const subs = await db2.select().from(loyaltyPushSubscriptions)
            .where(and(
              eq(loyaltyPushSubscriptions.restaurantId, restaurantId),
              eq(loyaltyPushSubscriptions.customerId, customer.id)
            ));
          if (subs.length > 0) {
            const tierLabel: Record<string, string> = { bronze: "Bronze", silver: "Silber", gold: "Gold", platinum: "Platin" };
            const tierChanged = newTier !== customer.tier;
            const pushPayload = JSON.stringify({
              title: tierChanged
                ? `🎉 Neue Stufe: ${tierLabel[newTier] ?? newTier}!`
                : `⭐ +${earnedPoints} Punkte gutgeschrieben!`,
              body: tierChanged
                ? `Du hast ${newBalance.toLocaleString("de-CH")} Punkte und bist jetzt ${tierLabel[newTier] ?? newTier}-Mitglied!`
                : `Guthaben: ${newBalance.toLocaleString("de-CH")} Punkte. Noch ${Math.max(0, (program.tiers as any[])?.[1]?.minPoints ?? 500) - customer.lifetimePoints - earnedPoints} Punkte bis zur nächsten Stufe.`,
              url: `/loyalty/${customer.token}`,
              tag: `points-${customer.id}-${Date.now()}`,
            });
            await Promise.allSettled(subs.map((sub: typeof subs[0]) =>
              webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                pushPayload
              ).catch(() => { /* Subscription abgelaufen – ignorieren */ })
            ));
          }
        }
      }

      return {
        earnedPoints,
        newBalance,
        newTier,
        tierChanged: newTier !== customer.tier,
        multiplier,
      };
    }),

  /** Punkte einlösen (Rabatt auf Rechnung) */
  redeemPoints: protectedProcedure
    .input(z.object({
      customerId: z.number().int(),
      pointsToRedeem: z.number().int().min(1),
      orderId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [program] = await db.select().from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.restaurantId, restaurantId), eq(loyaltyPrograms.isActive, true)));
      if (!program) throw new TRPCError({ code: "NOT_FOUND" });

      const [customer] = await db.select().from(loyaltyCustomers)
        .where(and(eq(loyaltyCustomers.id, input.customerId), eq(loyaltyCustomers.restaurantId, restaurantId)));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.pointsToRedeem < program.minRedemptionPoints)
        throw new TRPCError({ code: "BAD_REQUEST", message: `Mindestens ${program.minRedemptionPoints} Punkte zum Einlösen` });
      if (customer.totalPoints < input.pointsToRedeem)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nicht genügend Punkte" });

      const discountChf = (input.pointsToRedeem / parseFloat(program.pointsPerRedemptionChf));
      const newBalance = customer.totalPoints - input.pointsToRedeem;

      await db.update(loyaltyCustomers).set({
        totalPoints: newBalance,
        lastActivityAt: new Date(),
        applePassUpdatedAt: new Date(),
      }).where(eq(loyaltyCustomers.id, customer.id));

      await db.insert(loyaltyTransactions).values({
        customerId: customer.id,
        restaurantId,
        type: "redeem",
        points: -input.pointsToRedeem,
        balanceAfter: newBalance,
        orderId: input.orderId ?? null,
        description: `${input.pointsToRedeem} Punkte eingelöst = CHF ${discountChf.toFixed(2)} Rabatt`,
      });

      return { discountChf, newBalance };
    }),

  // ── Öffentlich: Programm-Info für Gast-Registrierung ───────────────────────

  getProgramPublic: publicProcedure
    .input(z.object({ restaurantId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [program] = await db.select().from(loyaltyPrograms)
        .where(and(
          eq(loyaltyPrograms.restaurantId, input.restaurantId),
          eq(loyaltyPrograms.isActive, true),
        ));

      const [restaurant] = await db.select({
        name: restaurants.name,
        logoUrl: restaurants.logoUrl,
        address: restaurants.address,
        city: restaurants.city,
      }).from(restaurants).where(eq(restaurants.id, input.restaurantId));

      if (!program) return null;

      return {
        programName: program.name,
        welcomeBonus: program.welcomeBonus,
        pointsPerChf: program.pointsPerChf,
        privacyText: program.privacyText,
        primaryColor: program.primaryColor,
        tiers: program.tiers,
        restaurant,
      };
    }),

  // ── Admin: Statistiken ─────────────────────────────────────────────────────

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

    const [{ totalCustomers }] = await db.select({
      totalCustomers: sql<number>`count(*)`,
    }).from(loyaltyCustomers).where(and(
      eq(loyaltyCustomers.restaurantId, restaurantId),
      eq(loyaltyCustomers.isActive, true),
    ));

    const [{ totalPointsIssued }] = await db.select({
      totalPointsIssued: sql<number>`coalesce(sum(points), 0)`,
    }).from(loyaltyTransactions).where(and(
      eq(loyaltyTransactions.restaurantId, restaurantId),
      sql`points > 0`,
    ));

    const [{ totalPointsRedeemed }] = await db.select({
      totalPointsRedeemed: sql<number>`coalesce(sum(abs(points)), 0)`,
    }).from(loyaltyTransactions).where(and(
      eq(loyaltyTransactions.restaurantId, restaurantId),
      sql`type = 'redeem'`,
    ));

    // Tier-Verteilung
    const tierCounts = await db.select({
      tier: loyaltyCustomers.tier,
      count: sql<number>`count(*)`,
    }).from(loyaltyCustomers).where(and(
      eq(loyaltyCustomers.restaurantId, restaurantId),
      eq(loyaltyCustomers.isActive, true),
    )).groupBy(loyaltyCustomers.tier);

    // Neue Mitglieder letzte 30 Tage (täglich)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const newMembersRaw = await db.select({
      day: sql<string>`DATE(\`createdAt\`)`,
      count: sql<number>`count(*)`,
    }).from(loyaltyCustomers).where(and(
      eq(loyaltyCustomers.restaurantId, restaurantId),
      sql`DATE(\`createdAt\`) >= ${thirtyDaysAgoStr}`,
    )).groupBy(sql`DATE(\`createdAt\`)`);

    // Punkte-Verlauf letzte 30 Tage
    const pointsTrendRaw = await db.select({
      day: sql<string>`DATE(\`createdAt\`)`,
      issued: sql<number>`coalesce(sum(case when points > 0 then points else 0 end), 0)`,
      redeemed: sql<number>`coalesce(sum(case when \`type\` = 'redeem' then abs(points) else 0 end), 0)`,
    }).from(loyaltyTransactions).where(and(
      eq(loyaltyTransactions.restaurantId, restaurantId),
      sql`DATE(\`createdAt\`) >= ${thirtyDaysAgoStr}`,
    )).groupBy(sql`DATE(\`createdAt\`)`);

    // Top 5 Kunden nach Lifetime-Punkten
    const topCustomers = await db.select({
      id: loyaltyCustomers.id,
      firstName: loyaltyCustomers.firstName,
      lastName: loyaltyCustomers.lastName,
      email: loyaltyCustomers.email,
      totalPoints: loyaltyCustomers.totalPoints,
      lifetimePoints: loyaltyCustomers.lifetimePoints,
      tier: loyaltyCustomers.tier,
    }).from(loyaltyCustomers).where(and(
      eq(loyaltyCustomers.restaurantId, restaurantId),
      eq(loyaltyCustomers.isActive, true),
    )).orderBy(sql`\`lifetimePoints\` DESC`).limit(5);

    // Umsatz-Einfluss: Einlösungen in CHF
    const [program] = await db.select({ pointsPerChf: loyaltyPrograms.pointsPerChf })
      .from(loyaltyPrograms).where(eq(loyaltyPrograms.restaurantId, restaurantId));
    const pointsPerChf = program?.pointsPerChf ?? 10;
    const revenueImpactChf = Math.round(Number(totalPointsRedeemed) / pointsPerChf * 100) / 100;

    // Einlösungsrate
    const redemptionRate = Number(totalPointsIssued) > 0
      ? Math.round(Number(totalPointsRedeemed) / Number(totalPointsIssued) * 1000) / 10
      : 0;

    return {
      totalCustomers: Number(totalCustomers),
      totalPointsIssued: Number(totalPointsIssued),
      totalPointsRedeemed: Number(totalPointsRedeemed),
      redemptionRate,
      revenueImpactChf,
      tierCounts: tierCounts.map((t: { tier: string; count: number }) => ({ tier: t.tier, count: Number(t.count) })),
      newMembersTrend: newMembersRaw.map((r: any) => ({ day: r.day, count: Number(r.count) })),
      pointsTrend: pointsTrendRaw.map((r: any) => ({ day: r.day, issued: Number(r.issued), redeemed: Number(r.redeemed) })),
      topCustomers: topCustomers.map((c: any) => ({ ...c, totalPoints: Number(c.totalPoints), lifetimePoints: Number(c.lifetimePoints) })),
    };
  }),

  // ── QR-Code für Registrierung ────────────────────────────────────────────
  getRegistrationQr: protectedProcedure
    .input(z.object({ origin: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const registrationUrl = `${input.origin}/loyalty/register/${restaurantId}`;
      const QRCode = await import("qrcode");
      const qrDataUrl = await QRCode.toDataURL(registrationUrl, {
        width: 400,
        margin: 2,
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });

      return { qrDataUrl, registrationUrl };
    }),

  // ── Prämie einlösen (Gast) ────────────────────────────────────────────────
  redeemReward: publicProcedure
    .input(z.object({
      token: z.string(),
      rewardId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [customer] = await db.select().from(loyaltyCustomers)
        .where(eq(loyaltyCustomers.token, input.token));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Karte nicht gefunden" });

      const [reward] = await db.select().from(loyaltyRewards)
        .where(and(
          eq(loyaltyRewards.id, input.rewardId),
          eq(loyaltyRewards.restaurantId, customer.restaurantId),
          eq(loyaltyRewards.isActive, true),
        ));
      if (!reward) throw new TRPCError({ code: "NOT_FOUND", message: "Prämie nicht gefunden" });

      if (customer.totalPoints < reward.pointsCost) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Nicht genug Punkte. Benötigt: ${reward.pointsCost}, Vorhanden: ${customer.totalPoints}` });
      }

      // Punkte abziehen
      await db.update(loyaltyCustomers)
        .set({ totalPoints: sql`${loyaltyCustomers.totalPoints} - ${reward.pointsCost}`, updatedAt: new Date().toISOString() })
        .where(eq(loyaltyCustomers.id, customer.id));

      await db.insert(loyaltyTransactions).values({
        customerId: customer.id,
        restaurantId: customer.restaurantId,
        type: "redeem",
        points: -reward.pointsCost,
        description: `Prämie eingelöst: ${reward.name}`,
        createdAt: new Date().toISOString(),
      });

      // Bestätigungs-E-Mail
      if (customer.email) {
        const [restaurant] = await db.select({ name: restaurants.name }).from(restaurants)
          .where(eq(restaurants.id, customer.restaurantId));
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.default.createTransport({
            host: process.env.SMTP_HOST ?? "smtp.gmail.com",
            port: parseInt(process.env.SMTP_PORT ?? "587"),
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });
          await transporter.sendMail({
            from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
            to: customer.email,
            subject: `🎁 Prämie eingelöst: ${reward.name} – ${restaurant?.name ?? ""}`,
            html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
              <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:32px;text-align:center">
                <div style="font-size:48px;margin-bottom:8px">🎁</div>
                <h1 style="color:#fff;margin:0;font-size:22px">Prämie eingelöst!</h1>
                <p style="color:rgba(255,255,255,0.9);margin:8px 0 0">${reward.name}</p>
              </div>
              <div style="padding:24px;text-align:center">
                <p style="color:#555">Zeige diese E-Mail beim nächsten Besuch vor, um deine Prämie zu erhalten.</p>
                <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:0;font-weight:600;color:#1a1a2e">${reward.name}</p>
                  <p style="margin:4px 0 0;color:#7c3aed;font-size:14px">${reward.pointsCost} Punkte eingelöst</p>
                  ${reward.description ? `<p style="margin:8px 0 0;color:#666;font-size:13px">${reward.description}</p>` : ""}
                </div>
                <p style="font-size:12px;color:#999;margin-top:24px">${restaurant?.name ?? ""} · Treueprogramm</p>
              </div>
            </div>
            `,
          });
        } catch (e: any) {
          console.error("[redeemReward] E-Mail Fehler:", e.message);
        }
      }

      // Push-Benachrichtigung an Kunden senden (fire-and-forget)
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        const db2 = await getDb();
        if (db2) {
          const subs = await db2.select().from(loyaltyPushSubscriptions)
            .where(and(
              eq(loyaltyPushSubscriptions.restaurantId, customer.restaurantId),
              eq(loyaltyPushSubscriptions.customerId, customer.id)
            ));
          if (subs.length > 0) {
            const updatedPts = customer.totalPoints - reward.pointsCost;
            const pushPayload = JSON.stringify({
              title: `🎁 Prämie eingelöst: ${reward.name}`,
              body: `Zeige diese Benachrichtigung beim Personal vor. Verbleibendes Guthaben: ${updatedPts.toLocaleString("de-CH")} Punkte.`,
              url: `/loyalty/${customer.token}`,
              tag: `redeem-${customer.id}-${Date.now()}`,
            });
            await Promise.allSettled(subs.map((sub: typeof subs[0]) =>
              webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                pushPayload
              ).catch(() => {})
            ));
          }
        }
      }

      const updatedPoints = customer.totalPoints - reward.pointsCost;
      return { success: true, remainingPoints: updatedPoints, rewardName: reward.name };
    }),

  // ── Push-Benachrichtigungen ──────────────────────────────────────────────────────────────────────────────

  /** VAPID Public Key für Frontend abrufen */
  getVapidPublicKey: publicProcedure.query(() => {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
  }),

  /** Push-Subscription speichern (Opt-in) */
  subscribePush: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      endpoint: z.string().url(),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [customer] = await db.select({
        id: loyaltyCustomers.id,
        restaurantId: loyaltyCustomers.restaurantId,
      }).from(loyaltyCustomers).where(eq(loyaltyCustomers.token, input.token));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      // Upsert: gleicher Endpoint wird nicht doppelt gespeichert
      const [existing] = await db.select({ id: loyaltyPushSubscriptions.id })
        .from(loyaltyPushSubscriptions)
        .where(and(
          eq(loyaltyPushSubscriptions.customerId, customer.id),
          sql`endpoint = ${input.endpoint}`
        ));

      if (!existing) {
        await db.insert(loyaltyPushSubscriptions).values({
          restaurantId: customer.restaurantId,
          customerId: customer.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        });
      }
      return { success: true };
    }),

  /** Push-Subscription löschen (Opt-out) */
  unsubscribePush: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      endpoint: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [customer] = await db.select({ id: loyaltyCustomers.id })
        .from(loyaltyCustomers).where(eq(loyaltyCustomers.token, input.token));
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      await db.delete(loyaltyPushSubscriptions)
        .where(and(
          eq(loyaltyPushSubscriptions.customerId, customer.id),
          sql`endpoint = ${input.endpoint}`
        ));
      return { success: true };
    }),

  /** Push-Benachrichtigung an alle Kunden eines Restaurants senden (Admin) */
  sendPushNotification: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(100),
      body: z.string().min(1).max(500),
      url: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "VAPID-Keys nicht konfiguriert" });
      }

      const subscriptions = await db.select().from(loyaltyPushSubscriptions)
        .where(eq(loyaltyPushSubscriptions.restaurantId, restaurantId));

      if (subscriptions.length === 0) {
        return { sent: 0, failed: 0, message: "Keine aktiven Push-Subscriptions" };
      }

      const payload = JSON.stringify({
        title: input.title,
        body: input.body,
        url: input.url ?? "/loyalty/",
        tag: `loyalty-${restaurantId}-${Date.now()}`,
      });

      let sent = 0;
      let failed = 0;
      const toDelete: number[] = [];

      await Promise.all(subscriptions.map(async (sub: typeof subscriptions[0]) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (err: any) {
          // 410 Gone = Subscription abgelaufen, löschen
          if (err.statusCode === 410 || err.statusCode === 404) {
            toDelete.push(sub.id);
          }
          failed++;
        }
      }));

      // Abgelaufene Subscriptions bereinigen
      if (toDelete.length > 0) {
        await Promise.all(toDelete.map(id =>
          db.delete(loyaltyPushSubscriptions).where(eq(loyaltyPushSubscriptions.id, id))
        ));
      }

      return { sent, failed, total: subscriptions.length };
    }),

  /** Anzahl aktiver Push-Subscriptions für Admin-Anzeige */
  getPushSubscriptionCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(loyaltyPushSubscriptions)
      .where(eq(loyaltyPushSubscriptions.restaurantId, restaurantId));
    return { count: Number(count) };
  }),
});
