import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import {
  deviceSessions,
  localConnectDevices,
  localConnectJobs,
  type DeviceSession,
} from "../drizzle/schema";
import { eq, lt, and, lte } from "drizzle-orm";

/**
 * Device Offline Monitor – wird alle 5 Minuten vom Heartbeat-Cron aufgerufen.
 *
 * Überwacht:
 * 1. deviceSessions (Kellner/Admin-Geräte) – wie bisher
 * 2. localConnectDevices (Local Connect Apps) – NEU
 *
 * Zusätzlich: Stale Jobs aufräumen (Jobs die > 10 Min im Status "sent" hängen)
 *
 * Offline-Schwellenwert: 5 Minuten ohne Heartbeat
 * Benachrichtigungs-Cooldown: 30 Minuten pro Gerät
 */

// ─── In-Memory Tracking ───────────────────────────────────────────────────────

// Key: `${restaurantId}:${sessionToken}`, Value: timestamp der letzten Meldung
const reportedOfflineDevices = new Map<string, number>();

// Key: `lc:${restaurantId}:${deviceId}`, Value: timestamp der letzten Meldung
const reportedOfflineLcDevices = new Map<string, number>();

// ─── Konstanten ───────────────────────────────────────────────────────────────

/** Wie lange ohne Heartbeat bis ein Gerät als offline gilt */
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 Minuten

/** Wie lange zwischen Wiederholungs-Benachrichtigungen */
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000; // 30 Minuten

/** Jobs die länger als dies im Status "sent" hängen, werden als "failed" markiert */
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 Minuten

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleDeviceOfflineCheck(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req) as any;
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    const now = new Date();
    const offlineThreshold = new Date(now.getTime() - OFFLINE_THRESHOLD_MS);
    const staleJobThreshold = new Date(now.getTime() - STALE_JOB_THRESHOLD_MS);

    const results = {
      deviceSessionsChecked: 0,
      lcDevicesChecked: 0,
      offlineDetected: 0,
      notificationsSent: 0,
      staleJobsCleaned: 0,
      errors: [] as string[],
    };

    // ── 1. Kellner/Admin-Geräte (deviceSessions) ──────────────────────────────

    const offlineSessions = await db
      .select()
      .from(deviceSessions)
      .where(
        and(
          eq(deviceSessions.isActive, true),
          lt(deviceSessions.lastSeenAt, offlineThreshold)
        )
      );

    results.deviceSessionsChecked = offlineSessions.length;

    const byRestaurant = new Map<number, typeof offlineSessions>();
    for (const session of offlineSessions) {
      const existing = byRestaurant.get(session.restaurantId) ?? [];
      existing.push(session);
      byRestaurant.set(session.restaurantId, existing);
    }

    for (const [restaurantId, sessions] of Array.from(byRestaurant.entries())) {
      try {
        const newlyOffline: typeof sessions = [];

        for (const session of sessions as typeof offlineSessions) {
          const key = `${restaurantId}:${session.sessionToken}`;
          const lastReported = reportedOfflineDevices.get(key);
          results.offlineDetected++;

          if (!lastReported || (now.getTime() - lastReported) > NOTIFICATION_COOLDOWN_MS) {
            newlyOffline.push(session);
            reportedOfflineDevices.set(key, now.getTime());
          }
        }

        if (newlyOffline.length === 0) continue;

        const deviceList = (newlyOffline as DeviceSession[]).map((s: DeviceSession) => {
          const name = s.deviceName ?? s.deviceType ?? "Unbekanntes Gerät";
          const role = s.role ?? "unbekannt";
          const minutesAgo = Math.round(
            (now.getTime() - s.lastSeenAt.getTime()) / 60000
          );
          return `• ${name} (${role}) – seit ${minutesAgo} Min. offline`;
        });

        const title = newlyOffline.length === 1
          ? `📵 Gerät offline: ${newlyOffline[0].deviceName ?? newlyOffline[0].deviceType}`
          : `📵 ${newlyOffline.length} Geräte offline`;

        await notifyOwner({
          title,
          content: [
            `Folgende Geräte senden keinen Heartbeat mehr:`,
            "",
            ...deviceList,
            "",
            `Bitte prüfen Sie die Geräte und die WLAN-Verbindung.`,
            `Restaurant-ID: ${restaurantId}`,
          ].join("\n"),
        });
        results.notificationsSent++;
      } catch (err: any) {
        results.errors.push(`Restaurant ${restaurantId}: ${err.message}`);
      }
    }

    // Cleanup: Geräte die wieder online sind aus dem Tracking entfernen
    const currentOfflineKeys = new Set(
      offlineSessions.map((s: DeviceSession) => `${s.restaurantId}:${s.sessionToken}`)
    );
    for (const key of Array.from(reportedOfflineDevices.keys())) {
      if (!currentOfflineKeys.has(key)) {
        reportedOfflineDevices.delete(key);
      }
    }

    // ── 2. Local Connect Geräte ───────────────────────────────────────────────

    try {
      const offlineLcDevices = await db
        .select()
        .from(localConnectDevices)
        .where(
          and(
            eq(localConnectDevices.isOnline, true),
            lt(localConnectDevices.lastSeenAt, offlineThreshold)
          )
        );

      results.lcDevicesChecked = offlineLcDevices.length;

      // isOnline auf false setzen für alle Geräte die den Schwellenwert überschritten haben
      for (const dev of offlineLcDevices) {
        try {
          await db
            .update(localConnectDevices)
            .set({ isOnline: false })
            .where(eq(localConnectDevices.id, dev.id));

          const key = `lc:${dev.restaurantId}:${dev.deviceId}`;
          const lastReported = reportedOfflineLcDevices.get(key);
          results.offlineDetected++;

          if (!lastReported || (now.getTime() - lastReported) > NOTIFICATION_COOLDOWN_MS) {
            reportedOfflineLcDevices.set(key, now.getTime());
            const minutesAgo = Math.round(
              (now.getTime() - dev.lastSeenAt.getTime()) / 60000
            );
            await notifyOwner({
              title: `🖨️ Local Connect offline: ${dev.deviceName}`,
              content: [
                `Das Local Connect Gerät "${dev.deviceName}" sendet keinen Heartbeat mehr.`,
                ``,
                `• Gerät: ${dev.deviceName} (${dev.platform})`,
                `• Letzte Aktivität: vor ${minutesAgo} Minuten`,
                `• Restaurant-ID: ${dev.restaurantId}`,
                ``,
                `Druckaufträge können nicht zugestellt werden bis das Gerät wieder online ist.`,
              ].join("\n"),
            });
            results.notificationsSent++;
          }
        } catch (err: any) {
          results.errors.push(`LC-Gerät ${dev.deviceId}: ${err.message}`);
        }
      }

      // Cleanup: Geräte die wieder online sind aus dem Tracking entfernen
      const currentOfflineLcKeys = new Set(
        offlineLcDevices.map((d: typeof offlineLcDevices[number]) => `lc:${d.restaurantId}:${d.deviceId}`)
      );
      for (const key of Array.from(reportedOfflineLcDevices.keys())) {
        if (!currentOfflineLcKeys.has(key)) {
          reportedOfflineLcDevices.delete(key);
        }
      }
    } catch (err: any) {
      results.errors.push(`LC-Geräte-Check: ${err.message}`);
    }

    // ── 3. Stale Jobs aufräumen ───────────────────────────────────────────────
    // Jobs die > 10 Min im Status "sent" hängen → als "failed" markieren
    // (Gerät hat die Bestätigung nicht gesendet, z.B. weil es abgestürzt ist)

    try {
      const staleJobs = await db
        .select({ id: localConnectJobs.id })
        .from(localConnectJobs)
        .where(
          and(
            eq(localConnectJobs.status, "sent"),
            lte(localConnectJobs.sentAt, staleJobThreshold)
          )
        );

      if (staleJobs.length > 0) {
        for (const job of staleJobs) {
          await db
            .update(localConnectJobs)
            .set({
              status: "failed",
              errorMessage: "Job-Timeout: Gerät hat keine Bestätigung gesendet (>10 Min)",
              confirmedAt: now,
            })
            .where(eq(localConnectJobs.id, job.id));
        }
        results.staleJobsCleaned = staleJobs.length;
        console.log(`[DeviceOffline] ${staleJobs.length} stale Jobs als failed markiert`);
      }
    } catch (err: any) {
      results.errors.push(`Stale-Job-Cleanup: ${err.message}`);
    }

    console.log(
      `[DeviceOffline] Sessions: ${results.deviceSessionsChecked}, ` +
      `LC-Geräte: ${results.lcDevicesChecked}, ` +
      `Offline: ${results.offlineDetected}, ` +
      `Benachrichtigungen: ${results.notificationsSent}, ` +
      `Stale Jobs: ${results.staleJobsCleaned}`
    );

    return res.json({ success: true, ...results });
  } catch (err: any) {
    console.error("[DeviceOffline] Fatal error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
