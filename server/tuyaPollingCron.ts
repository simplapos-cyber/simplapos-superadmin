/**
 * tuyaPollingCron.ts
 * Heartbeat-Handler für automatisches Tuya-Gerätestatus-Polling
 *
 * Wird aufgerufen von: POST /api/scheduled/tuyaPolling
 * Authentifizierung: sdk.authenticateRequest (user.isCron === true)
 * Lookup: via user.taskUid → tuya_polling_config.scheduleCronTaskUid
 *
 * Ablauf:
 * 1. Alle Geräte des Restaurants von Tuya API abrufen
 * 2. Messwerte in DB speichern (via saveReading)
 * 3. Kritische Alarme per Push-Benachrichtigung senden
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { tuyaPollingConfig, adminPushSubscriptions } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getTuyaCredentials, listTuyaDevices, saveReading, getOpenAlerts, fetchDeviceStatus } from "./tuya";
import { notifyOwner } from "./_core/notification";
import webpush from "web-push";

// VAPID für kritische Push-Benachrichtigungen
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:support@simplapos.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Kritische Kategorien die sofort Push auslösen
const CRITICAL_CATEGORIES = new Set(["smoke", "water_leak"]);
// Kategorien die bei Alarm Push auslösen
const ALERT_CATEGORIES = new Set(["temperature", "co2", "air_quality", "energy"]);

async function sendCriticalPush(restaurantId: number, title: string, body: string) {
  const db = await getDb();
  if (!db) return;

  const subs = await db.select().from(adminPushSubscriptions)
    .where(eq(adminPushSubscriptions.restaurantId, restaurantId));

  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title,
    body,
    url: "/admin/smart-building/alerts",
    tag: `tuya-alert-${restaurantId}-${Date.now()}`,
    requireInteraction: true,
  });

  const toDelete: number[] = [];
  await Promise.all(subs.map(async (sub: typeof subs[0]) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        toDelete.push(sub.id);
      }
    }
  }));

  // Abgelaufene Subscriptions bereinigen
  if (toDelete.length > 0) {
    await Promise.all(toDelete.map(id =>
      db.delete(adminPushSubscriptions).where(eq(adminPushSubscriptions.id, id))
    ));
  }
}

export async function handleTuyaPolling(req: Request, res: Response) {
  try {
    // 1. Authentifizierung: nur Cron-Aufrufe erlaubt
    const user = await sdk.authenticateRequest(req) as any;
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "DB nicht verfügbar" });
    }

    // 2. Konfiguration via taskUid laden
    const [config] = await db
      .select()
      .from(tuyaPollingConfig)
      .where(eq(tuyaPollingConfig.scheduleCronTaskUid, user.taskUid))
      .limit(1);

    if (!config) {
      return res.json({ ok: true, skipped: "orphan – config not found" });
    }

    if (!config.isEnabled) {
      return res.json({ ok: true, skipped: "polling disabled" });
    }

    const restaurantId = config.restaurantId;

    // 3. Tuya-Zugangsdaten prüfen
    const creds = await getTuyaCredentials(restaurantId);
    if (!creds || !creds.isActive) {
      return res.json({ ok: true, skipped: "no active tuya credentials" });
    }

    // 4. Alle Geräte laden
    const devices = await listTuyaDevices(restaurantId);
    if (devices.length === 0) {
      return res.json({ ok: true, skipped: "no devices", restaurantId });
    }

    // 5. Für jedes Gerät Status von Tuya API abrufen und speichern
    let polled = 0;
    let errors = 0;
    const newAlerts: string[] = [];

    for (const device of devices) {
      try {
        const statusData = await fetchDeviceStatus(restaurantId, device.deviceId) as any;
        if (!statusData?.result) continue;

        // Messwert aus Status-Daten extrahieren
        const statusList: Array<{ code: string; value: unknown }> = Array.isArray(statusData.result)
          ? statusData.result
          : statusData.result?.status ?? [];

        for (const item of statusList) {
          const code = item.code as string;
          const value = item.value;

          // Relevante Messwerte je nach Kategorie
          let numValue: number | null = null;
          let unit = "";

          if (device.category === "temperature" && (code === "temp_current" || code === "va_temperature")) {
            numValue = typeof value === "number" ? value / 10 : parseFloat(String(value));
            unit = "°C";
          } else if (device.category === "humidity" && (code === "humidity_value" || code === "va_humidity")) {
            numValue = typeof value === "number" ? value : parseFloat(String(value));
            unit = "%";
          } else if (device.category === "co2" && code === "co2_value") {
            numValue = typeof value === "number" ? value : parseFloat(String(value));
            unit = "ppm";
          } else if (device.category === "energy" && code === "cur_power") {
            numValue = typeof value === "number" ? value / 10 : parseFloat(String(value));
            unit = "W";
          } else if (device.category === "smoke" && code === "smoke_sensor_state") {
            // Rauchmelder: alarm = kritisch
            if (value === "alarm") {
              newAlerts.push(`🔥 FEUERALARM: ${device.name} (${device.location ?? "unbekannt"})`);
              await saveReading(device.id, restaurantId, "1", "alarm");
            }
            continue;
          } else if (device.category === "water_leak" && code === "watersensor_state") {
            if (value === "alarm") {
              newAlerts.push(`💧 WASSERLECK: ${device.name} (${device.location ?? "unbekannt"})`);
              await saveReading(device.id, restaurantId, "1", "alarm");
            }
            continue;
          } else {
            continue; // Andere Codes überspringen
          }

          if (numValue !== null && !isNaN(numValue)) {
            await saveReading(device.id, restaurantId, numValue.toString(), unit);
          }
        }

        polled++;
      } catch (err: any) {
        console.error(`[TuyaPolling] Gerät ${device.id} (${device.name}) Fehler:`, err.message);
        errors++;
      }
    }

    // 6. Letzte Polling-Zeit aktualisieren
    await db.update(tuyaPollingConfig)
      .set({ lastPolledAt: Date.now() })
      .where(eq(tuyaPollingConfig.restaurantId, restaurantId));

    // 7. Kritische Alarme per Push senden
    if (newAlerts.length > 0) {
      const alertMsg = newAlerts.join("\n");
      await sendCriticalPush(
        restaurantId,
        `⚠️ Kritischer Alarm (${newAlerts.length})`,
        alertMsg
      );
      // Auch als Owner-Notification
      await notifyOwner({
        title: `🚨 Tuya Kritischer Alarm – Restaurant ${restaurantId}`,
        content: alertMsg,
      });
    }

    // 8. Neue offene Alarme prüfen und Push senden (Schwellenwert-Verletzungen)
    const openAlerts = await getOpenAlerts(restaurantId);
    const recentAlerts = openAlerts.filter((a: typeof openAlerts[0]) => {
      const ageMs = Date.now() - new Date(a.createdAt).getTime();
      return ageMs < config.intervalMinutes * 60 * 1000 + 30_000; // Innerhalb des letzten Intervalls
    });

    if (recentAlerts.length > 0 && newAlerts.length === 0) {
      // Schwellenwert-Alarme (Temperatur, CO2, etc.)
      const alertNames = recentAlerts.slice(0, 3).map((a: typeof recentAlerts[0]) => a.message).join("; ");
      await sendCriticalPush(
        restaurantId,
        `⚠️ Alarm: ${recentAlerts.length} neue Meldung${recentAlerts.length > 1 ? "en" : ""}`,
        alertNames
      );
    }

    console.log(`[TuyaPolling] Restaurant ${restaurantId}: ${polled} Geräte abgefragt, ${errors} Fehler, ${newAlerts.length} kritische Alarme`);

    return res.json({
      ok: true,
      restaurantId,
      polled,
      errors,
      criticalAlerts: newAlerts.length,
      recentThresholdAlerts: recentAlerts.length,
    });

  } catch (err: any) {
    console.error("[TuyaPolling] Fehler:", err.message, err.stack);
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.url, taskUid: "unknown" },
      timestamp: new Date().toISOString(),
    });
  }
}
