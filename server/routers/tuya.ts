/**
 * Tuya Smart-Building tRPC Router
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { createHeartbeatJob, updateHeartbeatJob, deleteHeartbeatJob } from "../_core/heartbeat";
import {
  getTuyaCredentials,
  saveTuyaCredentials,
  listTuyaDevices,
  addTuyaDevice,
  updateTuyaDevice,
  deleteTuyaDevice,
  fetchDeviceStatus,
  discoverTuyaDevices,
  controlDevice,
  getLatestReadings,
  getReadingHistory,
  getOpenAlerts,
  resolveAlert,
  getTuyaDashboardStats,
  DEVICE_CATEGORIES,
} from "../tuya";
import { getDb } from "../db";
import { tuyaPollingConfig, adminPushSubscriptions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const tuyaRouter = router({
  // Gerätekategorien (statisch)
  getCategories: protectedProcedure.query(() => {
    return Object.entries(DEVICE_CATEGORIES).map(([key, val]) => ({ key, ...val }));
  }),

  // Zugangsdaten
  getCredentials: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) return null;
    const creds = await getTuyaCredentials(ctx.user.restaurantId);
    if (!creds) return null;
    return { region: creds.region, isActive: creds.isActive, hasCredentials: true };
  }),

  saveCredentials: protectedProcedure
    .input(z.object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      region: z.enum(["eu", "us", "cn", "in"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new Error("Kein Restaurant zugewiesen");
      await saveTuyaCredentials(ctx.user.restaurantId, input.clientId, input.clientSecret, input.region);
      return { success: true };
    }),

  // Geräte-Discovery (von Tuya-Konto laden)
  discoverDevices: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.restaurantId) throw new Error("Kein Restaurant zugewiesen");
    return discoverTuyaDevices(ctx.user.restaurantId);
  }),

  // Geräteverwaltung
  listDevices: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) return [];
    return listTuyaDevices(ctx.user.restaurantId);
  }),

  addDevice: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1),
      name: z.string().min(1),
      category: z.string().min(1),
      location: z.string().optional(),
      alertMinValue: z.string().optional(),
      alertMaxValue: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new Error("Kein Restaurant zugewiesen");
      await addTuyaDevice({ ...input, restaurantId: ctx.user.restaurantId });
      return { success: true };
    }),

  updateDevice: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      location: z.string().optional(),
      alertEnabled: z.boolean().optional(),
      alertMinValue: z.string().optional(),
      alertMaxValue: z.string().optional(),
    }))
    .mutation(async ({ ctx: _ctx, input }) => {
      const { id, ...data } = input;
      await updateTuyaDevice(id, data);
      return { success: true };
    }),

  deleteDevice: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx: _ctx, input }) => {
      await deleteTuyaDevice(input.id);
      return { success: true };
    }),

  // Live-Status eines Geräts abrufen
  getDeviceStatus: protectedProcedure
    .input(z.object({ tuyaDeviceId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new Error("Kein Restaurant zugewiesen");
      return fetchDeviceStatus(ctx.user.restaurantId, input.tuyaDeviceId);
    }),

  // Gerät steuern (Schalter, Licht, etc.)
  controlDevice: protectedProcedure
    .input(z.object({
      tuyaDeviceId: z.string(),
      commands: z.array(z.object({
        code: z.string(),
        value: z.unknown(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new Error("Kein Restaurant zugewiesen");
      return controlDevice(ctx.user.restaurantId, input.tuyaDeviceId, input.commands as Array<{ code: string; value: unknown }>);
    }),

  // Dashboard
  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) return { totalDevices: 0, onlineDevices: 0, offlineDevices: 0, openAlerts: 0, criticalAlerts: 0, devicesByCategory: {} };
    return getTuyaDashboardStats(ctx.user.restaurantId);
  }),

  getLatestReadings: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) return [];
    return getLatestReadings(ctx.user.restaurantId);
  }),

  getReadingHistory: protectedProcedure
    .input(z.object({ deviceId: z.number(), hoursBack: z.number().default(24) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) return [];
      return getReadingHistory(input.deviceId, ctx.user.restaurantId, input.hoursBack);
    }),

  // Temperaturverlauf für alle Temperatursensoren (für Temperaturkontrolle-Seite)
  getTemperatureReadings: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(7) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) return [];
      const devices = await listTuyaDevices(ctx.user.restaurantId);
      const tempDevices = devices.filter((d: { category: string }) => d.category === "temperature");
      const allReadings: Array<{ deviceId: number; value: number; recordedAt: number }> = [];
      for (const device of tempDevices) {
        const history = await getReadingHistory(device.id, ctx.user.restaurantId, input.days * 24);
        for (const r of history) {
          allReadings.push({ deviceId: device.id, value: r.value, recordedAt: r.recordedAt });
        }
      }
      return allReadings.sort((a, b) => a.recordedAt - b.recordedAt);
    }),

  // HACCP-CSV-Export
  exportHaccpReport: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(7) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new Error("Kein Restaurant zugewiesen");
      const devices = await listTuyaDevices(ctx.user.restaurantId);
      const tempDevices = devices.filter((d: { category: string }) => d.category === "temperature");
      const rows: string[] = ["Zeitpunkt;Ger\u00e4t;Standort;Temperatur (\u00b0C);Min (\u00b0C);Max (\u00b0C);Status"];
      for (const device of tempDevices) {
        const history = await getReadingHistory(device.id, ctx.user.restaurantId, input.days * 24);
        for (const r of history) {
          const ts = new Date(r.recordedAt).toLocaleString("de-CH");
          const isOk =
            (device.minThreshold === null || r.value >= device.minThreshold) &&
            (device.maxThreshold === null || r.value <= device.maxThreshold);
          rows.push(`${ts};${device.name};${device.location ?? ""};${r.value.toFixed(1)};${device.minThreshold ?? ""};${device.maxThreshold ?? ""};${isOk ? "OK" : "ALARM"}`);
        }
      }
      return { csv: rows.join("\n") };
    }),

  // Alle Alarme (offen + gelöst) für Alarme-Seite
  getAllAlerts: protectedProcedure
    .input(z.object({ resolved: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) return [];
      const db = await (await import("../db")).getDb();
      if (!db) return [];
      const { tuyaAlerts: alerts } = await import("../../drizzle/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      const conditions = [eq(alerts.restaurantId, ctx.user.restaurantId)];
      if (input.resolved !== undefined) conditions.push(eq(alerts.isResolved, input.resolved));
      return db.select().from(alerts).where(and(...conditions)).orderBy(desc(alerts.createdAt)).limit(200);
    }),

  // ─── Polling-Konfiguration ───────────────────────────────────────────────────
  getPollingConfig: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) return { isEnabled: false, intervalMinutes: 10, lastPolledAt: null, scheduleCronTaskUid: null };
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [config] = await db.select().from(tuyaPollingConfig)
      .where(eq(tuyaPollingConfig.restaurantId, ctx.user.restaurantId)).limit(1);
    return config ?? { isEnabled: false, intervalMinutes: 10, lastPolledAt: null, scheduleCronTaskUid: null };
  }),

  savePollingConfig: protectedProcedure
    .input(z.object({
      isEnabled: z.boolean(),
      intervalMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const restaurantId = ctx.user.restaurantId;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";

      const [existing] = await db.select().from(tuyaPollingConfig)
        .where(eq(tuyaPollingConfig.restaurantId, restaurantId)).limit(1);

      let scheduleCronTaskUid = existing?.scheduleCronTaskUid ?? null;

      // Cron-Ausdruck: alle N Minuten
      const cronExpr = `0 */${input.intervalMinutes} * * * *`;

      if (input.isEnabled) {
        if (scheduleCronTaskUid) {
          await updateHeartbeatJob(scheduleCronTaskUid, {
            cron: cronExpr,
            description: `Tuya-Polling alle ${input.intervalMinutes} Min. für Restaurant ${restaurantId}`,
          }, sessionToken);
        } else {
          const job = await createHeartbeatJob({
            name: `tuya-polling-${restaurantId}`,
            cron: cronExpr,
            path: "/api/scheduled/tuyaPolling",
            payload: { restaurantId },
            description: `Tuya-Polling alle ${input.intervalMinutes} Min. für Restaurant ${restaurantId}`,
          }, sessionToken);
          scheduleCronTaskUid = job.taskUid;
        }
      } else {
        if (scheduleCronTaskUid) {
          try { await deleteHeartbeatJob(scheduleCronTaskUid, sessionToken); } catch { /* bereits gelöscht */ }
          scheduleCronTaskUid = null;
        }
      }

      if (existing) {
        await db.update(tuyaPollingConfig)
          .set({ isEnabled: input.isEnabled, intervalMinutes: input.intervalMinutes, scheduleCronTaskUid })
          .where(eq(tuyaPollingConfig.restaurantId, restaurantId));
      } else {
        await db.insert(tuyaPollingConfig).values({
          restaurantId, isEnabled: input.isEnabled, intervalMinutes: input.intervalMinutes, scheduleCronTaskUid,
        });
      }

      return { success: true, isEnabled: input.isEnabled, intervalMinutes: input.intervalMinutes, scheduleCronTaskUid };
    }),

  // ─── Gerätekonfiguration (Schwellenwerte, Alarm-Toggle) ──────────────────────
  updateDeviceConfig: protectedProcedure
    .input(z.object({
      id: z.number(),
      alertEnabled: z.boolean().optional(),
      alertMinValue: z.string().optional().nullable(),
      alertMaxValue: z.string().optional().nullable(),
      location: z.string().optional(),
      name: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateTuyaDevice(id, {
        ...data,
        alertMinValue: data.alertMinValue ?? undefined,
        alertMaxValue: data.alertMaxValue ?? undefined,
      });
      return { success: true };
    }),

  // ─── Admin Push-Subscriptions ────────────────────────────────────────────────
  getVapidPublicKey: protectedProcedure.query(() => {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
  }),

  subscribeAdminPush: protectedProcedure
    .input(z.object({
      endpoint: z.string().url(),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Upsert: gleicher Endpoint wird nicht doppelt gespeichert
      const existing = await db.select({ id: adminPushSubscriptions.id })
        .from(adminPushSubscriptions)
        .where(eq(adminPushSubscriptions.userId, ctx.user.id))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(adminPushSubscriptions).values({
          restaurantId: ctx.user.restaurantId,
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        });
      } else {
        await db.update(adminPushSubscriptions)
          .set({ endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth })
          .where(eq(adminPushSubscriptions.userId, ctx.user.id));
      }
      return { success: true };
    }),

  unsubscribeAdminPush: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(adminPushSubscriptions).where(eq(adminPushSubscriptions.userId, ctx.user.id));
    return { success: true };
  }),

  getAdminPushStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) return { subscribed: false };
    const db = await getDb();
    if (!db) return { subscribed: false };
    const [sub] = await db.select({ id: adminPushSubscriptions.id })
      .from(adminPushSubscriptions)
      .where(eq(adminPushSubscriptions.userId, ctx.user.id)).limit(1);
    return { subscribed: !!sub };
  }),

  // Alarme
  getOpenAlerts: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) return [];
    return getOpenAlerts(ctx.user.restaurantId);
  }),

  resolveAlert: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await resolveAlert(input.alertId, ctx.user.id);
      return { success: true };
    }),
});
