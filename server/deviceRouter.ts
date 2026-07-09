/**
 * deviceRouter.ts
 * Geräte & Hardware Monitoring – Heartbeat, Geräte-Abfragen, Kellner-Aktivität
 *
 * Endpoints:
 *  - heartbeat        : Browser sendet alle 30s einen Ping (upsert device_sessions)
 *  - listDevices      : Admin sieht alle aktiven Geräte seines Restaurants
 *  - listWaiters      : Admin sieht alle eingeloggten Kellner + letzte Aktivität
 *  - getStats         : Zusammenfassung (Gesamt / Online / Offline)
 *  - renameDevice     : Admin benennt ein Gerät (z.B. "iPad Bar")
 *  - removeDevice     : Admin entfernt ein inaktives Gerät aus der Liste
 *  - reportAction     : Frontend meldet eine Aktion (z.B. "Bestellung gesendet")
 */

import { z } from "zod";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { deviceSessions } from "../drizzle/schema";

// Gerät gilt als "online" wenn letzter Heartbeat < 2 Minuten
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

// Gerät gilt als "inaktiv" wenn letzter Heartbeat > 30 Minuten → automatisch bereinigen
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

// Hilfsfunktion: Browser-Typ aus User-Agent ableiten
function detectDeviceType(userAgent: string): "tablet" | "desktop" | "mobile" | "kds" | "unknown" {
  const ua = userAgent.toLowerCase();
  if (ua.includes("ipad") || (ua.includes("tablet") && !ua.includes("mobile"))) return "tablet";
  if (ua.includes("iphone") || ua.includes("android") && ua.includes("mobile")) return "mobile";
  if (ua.includes("android")) return "tablet";
  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) return "desktop";
  return "unknown";
}

// Hilfsfunktion: Browser-Info aus User-Agent
function parseBrowserInfo(userAgent: string): string {
  if (!userAgent) return "Unbekannt";
  if (userAgent.includes("Safari") && userAgent.includes("iPad")) return "Safari / iPad";
  if (userAgent.includes("Safari") && userAgent.includes("iPhone")) return "Safari / iPhone";
  if (userAgent.includes("Chrome") && userAgent.includes("Android")) return "Chrome / Android";
  if (userAgent.includes("Chrome")) return "Chrome / Desktop";
  if (userAgent.includes("Firefox")) return "Firefox / Desktop";
  if (userAgent.includes("Safari")) return "Safari / macOS";
  if (userAgent.includes("Edge")) return "Edge / Desktop";
  return "Browser / Desktop";
}

export const deviceRouter = router({
  /**
   * Heartbeat: Browser sendet alle 30s einen Ping
   * Erstellt oder aktualisiert die device_session für diesen Tab
   */
  heartbeat: protectedProcedure
    .input(z.object({
      sessionToken: z.string().min(8).max(64),
      currentPage: z.string().max(200).optional(),
      userAgent: z.string().max(500).optional(),
      appVersion: z.string().max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) return { ok: true };

      const now = new Date();
      const userAgent = input.userAgent ?? "";
      const deviceType = detectDeviceType(userAgent);
      const browserInfo = parseBrowserInfo(userAgent);

      // Veraltete Sessions bereinigen (> 30 Min. ohne Heartbeat)
      const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);
      await db
        .delete(deviceSessions)
        .where(
          and(
            eq(deviceSessions.restaurantId, restaurantId),
            sql`${deviceSessions.lastSeenAt} < ${staleThreshold}`
          )
        );

      // Upsert: Session aktualisieren oder neu anlegen
      const existing = await db
        .select({ id: deviceSessions.id })
        .from(deviceSessions)
        .where(eq(deviceSessions.sessionToken, input.sessionToken))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(deviceSessions)
          .set({
            lastSeenAt: now,
            currentPage: input.currentPage,
            browserInfo,
            appVersion: input.appVersion,
            userId: ctx.user.id,
            role: ctx.user.role,
          })
          .where(eq(deviceSessions.sessionToken, input.sessionToken));
      } else {
        await db.insert(deviceSessions).values({
          restaurantId,
          userId: ctx.user.id,
          sessionToken: input.sessionToken,
          deviceType,
          role: ctx.user.role,
          browserInfo,
          appVersion: input.appVersion,
          currentPage: input.currentPage,
          isActive: true,
          lastSeenAt: now,
          connectedAt: now,
        });
      }

      return { ok: true };
    }),

  /**
   * Letzte Aktion melden (z.B. "Bestellung gesendet", "Tisch 5 geöffnet")
   */
  reportAction: protectedProcedure
    .input(z.object({
      sessionToken: z.string().min(8).max(64),
      action: z.string().max(200),
      orderId: z.number().optional(),
      tableId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) return { ok: true };

      await db
        .update(deviceSessions)
        .set({
          lastAction: input.action,
          lastActionAt: new Date(),
          lastOrderId: input.orderId,
          lastTableId: input.tableId,
        })
        .where(
          and(
            eq(deviceSessions.sessionToken, input.sessionToken),
            eq(deviceSessions.restaurantId, restaurantId)
          )
        );

      return { ok: true };
    }),

  /**
   * Alle aktiven Geräte des Restaurants auflisten
   */
  listDevices: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) return [];

      const now = new Date();
      const onlineThreshold = new Date(now.getTime() - ONLINE_THRESHOLD_MS);

      const sessions = await db
        .select()
        .from(deviceSessions)
        .where(eq(deviceSessions.restaurantId, restaurantId))
        .orderBy(desc(deviceSessions.lastSeenAt));

      return sessions.map((s: typeof sessions[number]) => ({
        ...s,
        isOnline: s.lastSeenAt >= onlineThreshold,
        onlineSince: s.connectedAt,
        lastSeenAgo: Math.round((now.getTime() - s.lastSeenAt.getTime()) / 1000), // Sekunden
      }));
    }),

  /**
   * Kellner-Aktivitätsübersicht: Wer ist gerade eingeloggt und was machen sie?
   */
  listWaiters: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) return [];

      const now = new Date();
      const onlineThreshold = new Date(now.getTime() - ONLINE_THRESHOLD_MS);

      const sessions = await db
        .select()
        .from(deviceSessions)
        .where(
          and(
            eq(deviceSessions.restaurantId, restaurantId),
            sql`${deviceSessions.role} IN ('kellner', 'admin', 'manager', 'barkeeper', 'koch')`
          )
        )
        .orderBy(desc(deviceSessions.lastSeenAt));

      return sessions.map((s: typeof sessions[number]) => ({
        id: s.id,
        userId: s.userId,
        role: s.role,
        deviceName: s.deviceName,
        deviceType: s.deviceType,
        browserInfo: s.browserInfo,
        currentPage: s.currentPage,
        lastAction: s.lastAction,
        lastActionAt: s.lastActionAt,
        lastTableId: s.lastTableId,
        lastOrderId: s.lastOrderId,
        isOnline: s.lastSeenAt >= onlineThreshold,
        connectedAt: s.connectedAt,
        lastSeenAt: s.lastSeenAt,
        lastSeenAgo: Math.round((now.getTime() - s.lastSeenAt.getTime()) / 1000),
      }));
    }),

  /**
   * Zusammenfassung: Gesamt / Online / Offline
   */
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) return { total: 0, online: 0, offline: 0, waitersOnline: 0 };

      const now = new Date();
      const onlineThreshold = new Date(now.getTime() - ONLINE_THRESHOLD_MS);

      const sessions = await db
        .select({
          lastSeenAt: deviceSessions.lastSeenAt,
          role: deviceSessions.role,
        })
        .from(deviceSessions)
        .where(eq(deviceSessions.restaurantId, restaurantId));

      const total = sessions.length;
      const online = sessions.filter((s: typeof sessions[number]) => s.lastSeenAt >= onlineThreshold).length;
      const offline = total - online;
      const waitersOnline = sessions.filter(
        (s: typeof sessions[number]) => s.lastSeenAt >= onlineThreshold && s.role === "kellner"
      ).length;

      return { total, online, offline, waitersOnline };
    }),

  /**
   * Gerät umbenennen (z.B. "iPad Bar", "Kasse 1")
   */
  renameDevice: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      name: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new Error("Kein Restaurant");

      await db
        .update(deviceSessions)
        .set({ deviceName: input.name })
        .where(
          and(
            eq(deviceSessions.id, input.deviceId),
            eq(deviceSessions.restaurantId, restaurantId)
          )
        );

      return { ok: true };
    }),

  /**
   * Gerät aus der Liste entfernen
   */
  removeDevice: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new Error("Kein Restaurant");

      await db
        .delete(deviceSessions)
        .where(
          and(
            eq(deviceSessions.id, input.deviceId),
            eq(deviceSessions.restaurantId, restaurantId)
          )
        );

      return { ok: true };
    }),
});
