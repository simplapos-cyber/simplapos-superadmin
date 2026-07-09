/**
 * SimplaPOS Local Connect – Backend Router
 *
 * Verwaltet:
 * - Onboarding-Tokens (QR-Code-Generierung)
 * - Geräteverwaltung (registrierte Local Connect Apps)
 * - Job-Queue (Druckaufträge, Schublade öffnen, etc.)
 * - WebSocket-Bridge (persistente Verbindung zur App)
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getRestaurantById } from "./db";
import {
  localConnectDevices,
  localConnectJobs,
  localConnectOnboardingTokens,
} from "../drizzle/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import crypto from "crypto";

// ─── HELPER ──────────────────────────────────────────────────────────────────

function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const localConnectRouter = router({
  /**
   * Generiert einen Onboarding-Token (QR-Code-Inhalt) für ein Restaurant.
   * Gültig für 24 Stunden, einmalig verwendbar.
   */
  generateOnboardingToken: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      // Nur Admins und Superadmins dürfen Tokens generieren
      if (!["admin", "superadmin"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const token = generateToken(32);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      await db.insert(localConnectOnboardingTokens).values({
        restaurantId: input.restaurantId,
        token,
        used: false,
        expiresAt,
      });

      // QR-Code-Inhalt: JSON mit Token und Restaurant-ID
      const qrPayload = JSON.stringify({
        type: "simplapos_local_connect",
        version: 1,
        restaurantId: input.restaurantId,
        token,
        server: "wss://simplapos.com/local-connect/ws",
      });

      return { token, qrPayload, expiresAt };
    }),

  /**
   * Registriert ein neues Local Connect Gerät (wird von der App beim Onboarding aufgerufen).
   * Öffentliche Prozedur – Authentifizierung erfolgt über den Onboarding-Token.
   */
  registerDevice: publicProcedure
    .input(
      z.object({
        onboardingToken: z.string(),
        deviceId: z.string().min(1).max(128),
        deviceName: z.string().max(128),
        platform: z.enum(["android", "ios", "unknown"]),
        appVersion: z.string().max(32).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Token validieren
      const [tokenRecord] = await db
        .select()
        .from(localConnectOnboardingTokens)
        .where(
          and(
            eq(localConnectOnboardingTokens.token, input.onboardingToken),
            eq(localConnectOnboardingTokens.used, false)
          )
        )
        .limit(1);

      if (!tokenRecord) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Ungültiger oder bereits verwendeter Token" });
      }

      if (new Date() > tokenRecord.expiresAt) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Token abgelaufen" });
      }

      // Device-Token generieren
      const rawDeviceToken = generateToken(32);
      const hashedDeviceToken = hashToken(rawDeviceToken);

      // Gerät registrieren
      await db.insert(localConnectDevices).values({
        restaurantId: tokenRecord.restaurantId,
        deviceId: input.deviceId,
        deviceToken: hashedDeviceToken,
        deviceName: input.deviceName,
        platform: input.platform,
        appVersion: input.appVersion,
        isOnline: false,
      });

      // Onboarding-Token als verwendet markieren
      await db
        .update(localConnectOnboardingTokens)
        .set({ used: true })
        .where(eq(localConnectOnboardingTokens.id, tokenRecord.id));

      return {
        deviceToken: rawDeviceToken, // Einmalig zurückgegeben, danach nur noch Hash in DB
        restaurantId: tokenRecord.restaurantId,
        message: "Gerät erfolgreich registriert",
      };
    }),

  /**
   * Gibt alle registrierten Geräte eines Restaurants zurück.
   */
  listDevices: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!["admin", "superadmin"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const devices = await db
        .select({
          id: localConnectDevices.id,
          deviceId: localConnectDevices.deviceId,
          deviceName: localConnectDevices.deviceName,
          platform: localConnectDevices.platform,
          appVersion: localConnectDevices.appVersion,
          isOnline: localConnectDevices.isOnline,
          lastSeenAt: localConnectDevices.lastSeenAt,
          localIp: localConnectDevices.localIp,
          localPort: localConnectDevices.localPort,
          createdAt: localConnectDevices.createdAt,
        })
        .from(localConnectDevices)
        .where(eq(localConnectDevices.restaurantId, input.restaurantId))
        .orderBy(desc(localConnectDevices.createdAt));

      return devices;
    }),

  /**
   * Erstellt einen neuen Job für ein Local Connect Gerät.
   * Wird intern von anderen Routern aufgerufen (z.B. printerRouter).
   */
  createJob: protectedProcedure
    .input(
      z.object({
        restaurantId: z.number(),
        deviceId: z.string(),
        type: z.enum(["print", "print_test", "drawer_open", "scanner_config", "sync_menu", "sync_tables", "heartbeat"]),
        payload: z.string(), // JSON-String
        priority: z.enum(["high", "normal", "low"]).default("normal"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .insert(localConnectJobs)
        .values({
          restaurantId: input.restaurantId,
          deviceId: input.deviceId,
          type: input.type,
          payload: input.payload, // bereits JSON-String
          status: "pending",
          priority: input.priority,
        });

      const [job] = await db
        .select({ id: localConnectJobs.id })
        .from(localConnectJobs)
        .where(eq(localConnectJobs.deviceId, input.deviceId))
        .orderBy(desc(localConnectJobs.createdAt))
        .limit(1);

      return { jobId: job.id };
    }),

  /**
   * Gibt ausstehende Jobs für ein Gerät zurück (Polling-Endpunkt für die App).
   * Die App pollt diesen Endpunkt alle 2 Sekunden.
   */
  getPendingJobs: publicProcedure
    .input(
      z.object({
        deviceId: z.string(),
        deviceToken: z.string(),
        localIp: z.string().max(45).optional(), // Lokale IP des Geräts im WLAN
        localPort: z.number().int().min(1024).max(65535).optional(), // HTTP-Server-Port
        appVersion: z.string().max(32).optional(), // App-Version für Anzeige in Web-App
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      // Device-Token validieren
      const hashedToken = hashToken(input.deviceToken);
      const [device] = await db
        .select()
        .from(localConnectDevices)
        .where(
          and(
            eq(localConnectDevices.deviceId, input.deviceId),
            eq(localConnectDevices.deviceToken, hashedToken)
          )
        )
        .limit(1);

      if (!device) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Heartbeat aktualisieren (inkl. lokale IP für LAN-Discovery)
      await db
        .update(localConnectDevices)
        .set({
          isOnline: true,
          lastSeenAt: new Date(),
          ...(input.localIp ? { localIp: input.localIp } : {}),
          ...(input.localPort ? { localPort: input.localPort } : {}),
          ...(input.appVersion ? { appVersion: input.appVersion } : {}),
        })
        .where(eq(localConnectDevices.deviceId, input.deviceId));

      // Ausstehende Jobs abrufen
      const jobs = await db
        .select()
        .from(localConnectJobs)
        .where(
          and(
            eq(localConnectJobs.deviceId, input.deviceId),
            eq(localConnectJobs.status, "pending")
          )
        )
        .orderBy(desc(localConnectJobs.createdAt))
        .limit(10);

      // Jobs als "gesendet" markieren
      if (jobs.length > 0) {
        const jobIds = (jobs as Array<typeof localConnectJobs.$inferSelect>).map((j) => j.id);
        for (const jobId of jobIds) {
          await db
            .update(localConnectJobs)
            .set({ status: "sent", sentAt: new Date() })
            .where(eq(localConnectJobs.id, jobId));
        }
      }

      return jobs.map((j: typeof localConnectJobs.$inferSelect) => ({
        ...j,
        payload: JSON.parse(j.payload),
      }));
    }),

  /**
   * Bestätigt einen abgeschlossenen Job (Erfolg oder Fehler).
   */
  confirmJob: publicProcedure
    .input(
      z.object({
        deviceId: z.string(),
        deviceToken: z.string(),
        jobId: z.number(),
        status: z.enum(["confirmed", "failed"]),
        errorMessage: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const hashedToken = hashToken(input.deviceToken);
      const [device] = await db
        .select()
        .from(localConnectDevices)
        .where(
          and(
            eq(localConnectDevices.deviceId, input.deviceId),
            eq(localConnectDevices.deviceToken, hashedToken)
          )
        )
        .limit(1);

      if (!device) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      await db
        .update(localConnectJobs)
        .set({
          status: input.status,
          confirmedAt: new Date(),
          errorMessage: input.errorMessage,
        })
        .where(
          and(
            eq(localConnectJobs.id, input.jobId),
            eq(localConnectJobs.deviceId, input.deviceId)
          )
        );

      return { success: true };
    }),

  /**
   * Gibt die Job-History eines Restaurants zurück (für Superadmin).
   */
  getJobHistory: protectedProcedure
    .input(
      z.object({
        restaurantId: z.number(),
        limit: z.number().max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!["admin", "superadmin"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const jobs = await db
        .select()
        .from(localConnectJobs)
        .where(eq(localConnectJobs.restaurantId, input.restaurantId))
        .orderBy(desc(localConnectJobs.createdAt))
        .limit(input.limit);

      return jobs.map((j: typeof localConnectJobs.$inferSelect) => ({
        ...j,
        payload: JSON.parse(j.payload),
      }));
    }),

  /**
   * Erkennt das Restaurant eines eingeloggten Benutzers automatisch.
   * Wird von der React Native App beim Self-Onboarding aufgerufen.
   * Gibt das erste aktive Restaurant des Benutzers zurück.
   */
  detectRestaurant: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB nicht verfügbar" });

      // Superadmin hat kein restaurantId – Fehler zurückgeben
      if (ctx.user.role === "superadmin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Superadmin kann kein Local Connect Gerät registrieren" });
      }

      // Restaurant des eingeloggten Benutzers abrufen
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Kein Restaurant für dieses Konto gefunden" });
      }

      const restaurant = await getRestaurantById(restaurantId);
      if (!restaurant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });
      }

      return {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          city: restaurant.city,
          status: restaurant.status,
        }
      };
    }),

  /**
   * Automatische Geräteregistrierung beim Self-Onboarding.
   * Generiert intern einen Onboarding-Token und registriert das Gerät sofort.
   * Kein separater QR-Code-Scan nötig.
   */
  autoRegisterDevice: protectedProcedure
    .input(
      z.object({
        restaurantId: z.number(),
        deviceName: z.string().max(128).default("Local Connect Gerät"),
        platform: z.enum(["android", "ios", "unknown"]).default("unknown"),
        appVersion: z.string().max(32).optional(),
        deviceInfo: z.object({
          model: z.string().optional(),
          brand: z.string().optional(),
          systemName: z.string().optional(),
          systemVersion: z.string().optional(),
          uniqueId: z.string().optional(),
          ipAddress: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB nicht verfügbar" });

      // Nur Admins dürfen Geräte für ihr eigenes Restaurant registrieren
      if (ctx.user.restaurantId !== input.restaurantId && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf dieses Restaurant" });
      }

      // Eindeutige Geräte-ID generieren
      const deviceId = `${input.platform}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      // Device-Token generieren
      const rawDeviceToken = generateToken(32);
      const hashedDeviceToken = hashToken(rawDeviceToken);

      // Gerät direkt registrieren (kein separater Onboarding-Token nötig)
      await db.insert(localConnectDevices).values({
        restaurantId: input.restaurantId,
        deviceId,
        deviceToken: hashedDeviceToken,
        deviceName: input.deviceName,
        platform: input.platform,
        appVersion: input.appVersion,
        isOnline: false,
      });

      return {
        deviceId,
        deviceToken: rawDeviceToken, // Einmalig zurückgegeben
        restaurantId: input.restaurantId,
        message: "Gerät erfolgreich registriert",
      };
    }),

  /**
   * Löscht ein Gerät (Widerruf des Device-Tokens).
   */
  removeDevice: protectedProcedure
    .input(z.object({ deviceId: z.string(), restaurantId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!["admin", "superadmin"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db
        .delete(localConnectDevices)
        .where(
          and(
            eq(localConnectDevices.deviceId, input.deviceId),
            eq(localConnectDevices.restaurantId, input.restaurantId)
          )
        );

      return { success: true };
    }),
});
