/**
 * countryConfigRouter.ts
 * Multi-Country-Architektur: Länder-Konfiguration verwalten und abrufen.
 *
 * Public Endpoints (für Landing Page + Onboarding):
 *   - countryConfig.list         → Alle aktiven Länder (für Länder-Switcher)
 *   - countryConfig.getByCode    → Konfiguration für ein spezifisches Land
 *   - countryConfig.detectByIp   → Land aus IP-Adresse erkennen (Geolocation)
 *
 * Superadmin Endpoints (für Verwaltung):
 *   - countryConfig.adminList    → Alle Länder inkl. inaktive
 *   - countryConfig.adminUpdate  → Land-Konfiguration bearbeiten
 *   - countryConfig.adminCreate  → Neues Land anlegen
 *   - countryConfig.adminToggle  → Land aktivieren/deaktivieren
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { countryConfigs } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";

// ─── HELPER: Superadmin-Check ─────────────────────────────────────────────────
const superadminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "superadmin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Nur Superadmins haben Zugriff." });
  }
  return next({ ctx });
});

// ─── ROUTER ───────────────────────────────────────────────────────────────────
export const countryConfigRouter = router({

  // ── PUBLIC: Alle aktiven + gestarteten Länder (für Landing Page Switcher) ──
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        countryCode: countryConfigs.countryCode,
        name: countryConfigs.name,
        nameEn: countryConfigs.nameEn,
        flag: countryConfigs.flag,
        currency: countryConfigs.currency,
        currencySymbol: countryConfigs.currencySymbol,
        locale: countryConfigs.locale,
        defaultLanguage: countryConfigs.defaultLanguage,
        isLaunched: countryConfigs.isLaunched,
        sortOrder: countryConfigs.sortOrder,
      })
      .from(countryConfigs)
      .where(eq(countryConfigs.isActive, true))
      .orderBy(asc(countryConfigs.sortOrder));
    return rows;
  }),

  // ── PUBLIC: Vollständige Konfiguration für ein Land ──────────────────────
  getByCode: publicProcedure
    .input(z.object({ countryCode: z.string().length(2).toUpperCase() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(countryConfigs)
        .where(eq(countryConfigs.countryCode, input.countryCode.toUpperCase()))
        .limit(1);
      if (!rows[0]) return null;
      return rows[0];
    }),

  // ── PUBLIC: Land aus IP-Adresse erkennen (via ip-api.com – kostenlos) ────
  detectByIp: publicProcedure
    .input(z.object({ ip: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      try {
        // Client-IP aus Request-Context oder Input
        const ip = input.ip || (ctx as any).req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
          || (ctx as any).req?.socket?.remoteAddress;

        if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
          // Lokale IP → Fallback auf CH
          return { countryCode: "CH", source: "fallback_local" };
        }

        const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) return { countryCode: "CH", source: "fallback_error" };
        const data = await response.json() as { countryCode?: string };
        const detectedCode = data.countryCode?.toUpperCase() || "CH";

        // Prüfen ob das erkannte Land in unserer DB vorhanden und aktiv ist
        const db = await getDb();
        if (db) {
          const rows = await db
            .select({ countryCode: countryConfigs.countryCode })
            .from(countryConfigs)
            .where(eq(countryConfigs.countryCode, detectedCode))
            .limit(1);
          if (rows[0]) {
            return { countryCode: detectedCode, source: "ip_detection" };
          }
        }
        // Land nicht in DB → Fallback auf CH
        return { countryCode: "CH", source: "fallback_unsupported" };
      } catch {
        return { countryCode: "CH", source: "fallback_exception" };
      }
    }),

  // ── SUPERADMIN: Alle Länder (inkl. inaktive) ─────────────────────────────
  adminList: superadminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(countryConfigs).orderBy(asc(countryConfigs.sortOrder));
  }),

  // ── SUPERADMIN: Land-Konfiguration aktualisieren ──────────────────────────
  adminUpdate: superadminProcedure
    .input(z.object({
      countryCode: z.string().length(2),
      name: z.string().min(1).optional(),
      nameEn: z.string().min(1).optional(),
      flag: z.string().optional(),
      currency: z.string().length(3).optional(),
      currencySymbol: z.string().optional(),
      locale: z.string().optional(),
      defaultLanguage: z.string().optional(),
      taxRates: z.any().optional(),
      complianceFlags: z.any().optional(),
      pricingPlans: z.any().optional(),
      modulePricing: z.any().optional(),
      availablePaymentMethods: z.any().optional(),
      onboardingContent: z.any().optional(),
      landingContent: z.any().optional(),
      supportEmail: z.string().email().optional(),
      supportPhone: z.string().optional(),
      supportUrl: z.string().optional(),
      isActive: z.boolean().optional(),
      isLaunched: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { countryCode, ...updates } = input;
      // Nur definierte Felder updaten
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );
      if (Object.keys(cleanUpdates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Keine Änderungen angegeben." });
      }
      await db.update(countryConfigs).set(cleanUpdates).where(eq(countryConfigs.countryCode, countryCode.toUpperCase()));
      return { success: true };
    }),

  // ── SUPERADMIN: Neues Land anlegen ────────────────────────────────────────
  adminCreate: superadminProcedure
    .input(z.object({
      countryCode: z.string().length(2),
      name: z.string().min(1),
      nameEn: z.string().min(1),
      flag: z.string().optional(),
      currency: z.string().length(3),
      currencySymbol: z.string(),
      locale: z.string(),
      defaultLanguage: z.string(),
      taxRates: z.any(),
      complianceFlags: z.any(),
      pricingPlans: z.any(),
      modulePricing: z.any().optional(),
      availablePaymentMethods: z.any().optional(),
      onboardingContent: z.any().optional(),
      landingContent: z.any().optional(),
      supportEmail: z.string().email().optional(),
      supportPhone: z.string().optional(),
      isActive: z.boolean().default(true),
      isLaunched: z.boolean().default(false),
      sortOrder: z.number().default(99),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Prüfen ob Land bereits existiert
      const existing = await db
        .select({ id: countryConfigs.id })
        .from(countryConfigs)
        .where(eq(countryConfigs.countryCode, input.countryCode.toUpperCase()))
        .limit(1);
      if (existing[0]) {
        throw new TRPCError({ code: "CONFLICT", message: `Land ${input.countryCode} existiert bereits.` });
      }
      await db.insert(countryConfigs).values({
        ...input,
        countryCode: input.countryCode.toUpperCase(),
      });
      return { success: true };
    }),

  // ── SUPERADMIN: Land aktivieren/deaktivieren ──────────────────────────────
  adminToggle: superadminProcedure
    .input(z.object({
      countryCode: z.string().length(2),
      field: z.enum(["isActive", "isLaunched"]),
      value: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(countryConfigs)
        .set({ [input.field]: input.value })
        .where(eq(countryConfigs.countryCode, input.countryCode.toUpperCase()));
      return { success: true };
    }),
});
