/**
 * Tuya Smart-Building Integration
 * Unterstützt alle Tuya-kompatiblen Geräte:
 * Temperatur, Bewegungsmelder, Schalter, Licht, Wasserleck, Feuer/Rauch, CO2, Türkontakt, Energie, Kamera
 */
import { getDb } from "./db";
import { tuyaCredentials, tuyaDevices, tuyaReadings, tuyaAlerts } from "../drizzle/schema";
import type { TuyaDevice } from "../drizzle/schema";
import { eq, and, desc, gte } from "drizzle-orm";

// ─── Gerätekategorien ────────────────────────────────────────────────────────
export const DEVICE_CATEGORIES = {
  temperature: { label: "Temperatursensor", icon: "Thermometer", unit: "°C", color: "#3b82f6" },
  humidity: { label: "Feuchtigkeitssensor", icon: "Droplets", unit: "%", color: "#06b6d4" },
  motion: { label: "Bewegungsmelder", icon: "Activity", unit: "", color: "#8b5cf6" },
  switch: { label: "Schalter / Steckdose", icon: "ToggleLeft", unit: "", color: "#f59e0b" },
  light: { label: "Licht / Beleuchtung", icon: "Lightbulb", unit: "lux", color: "#eab308" },
  water_leak: { label: "Wasserleck-Sensor", icon: "Waves", unit: "", color: "#0ea5e9" },
  smoke: { label: "Rauch- / Brandmelder", icon: "Flame", unit: "", color: "#ef4444" },
  co2: { label: "CO₂-Sensor", icon: "Wind", unit: "ppm", color: "#10b981" },
  door: { label: "Tür- / Fensterkontakt", icon: "DoorOpen", unit: "", color: "#6366f1" },
  energy: { label: "Energiemessung", icon: "Zap", unit: "W", color: "#f97316" },
  camera: { label: "IP-Kamera", icon: "Camera", unit: "", color: "#64748b" },
  air_quality: { label: "Luftqualität", icon: "CloudFog", unit: "AQI", color: "#84cc16" },
  vibration: { label: "Vibrationssensor", icon: "Vibrate", unit: "", color: "#a855f7" },
  presence: { label: "Anwesenheitssensor", icon: "UserCheck", unit: "", color: "#14b8a6" },
} as const;

export type DeviceCategory = keyof typeof DEVICE_CATEGORIES;

// ─── Tuya API Client ─────────────────────────────────────────────────────────
const TUYA_ENDPOINTS: Record<string, string> = {
  eu: "https://openapi.tuyaeu.com",
  us: "https://openapi.tuyaus.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

interface TuyaTokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TuyaTokenCache>();

async function getTuyaToken(clientId: string, clientSecret: string, region: string): Promise<string> {
  const cacheKey = `${clientId}:${region}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const baseUrl = TUYA_ENDPOINTS[region] || TUYA_ENDPOINTS.eu;
  const t = Date.now().toString();
  const signStr = clientId + t;
  
  // HMAC-SHA256 Signatur
  const { createHmac } = await import("crypto");
  const sign = createHmac("sha256", clientSecret).update(signStr).digest("hex").toUpperCase();

  const res = await fetch(`${baseUrl}/v1.0/token?grant_type=1`, {
    headers: {
      client_id: clientId,
      sign,
      t,
      sign_method: "HMAC-SHA256",
    },
  });

  const data = await res.json() as { success: boolean; result?: { access_token: string; expire_time: number } };
  if (!data.success || !data.result) throw new Error("Tuya auth failed");

  const token = data.result.access_token;
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + data.result.expire_time * 1000 });
  return token;
}

async function tuyaRequest(
  clientId: string,
  clientSecret: string,
  region: string,
  path: string,
  method = "GET",
  body?: object
): Promise<unknown> {
  const baseUrl = TUYA_ENDPOINTS[region] || TUYA_ENDPOINTS.eu;
  const token = await getTuyaToken(clientId, clientSecret, region);
  const t = Date.now().toString();
  const { createHmac } = await import("crypto");
  const signStr = clientId + token + t;
  const sign = createHmac("sha256", clientSecret).update(signStr).digest("hex").toUpperCase();

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      client_id: clientId,
      access_token: token,
      sign,
      t,
      sign_method: "HMAC-SHA256",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return res.json();
}

// ─── DB-Hilfsfunktionen ──────────────────────────────────────────────────────
export async function getTuyaCredentials(restaurantId: number) {
  const db = await getDb();
  if (!db) return null;
  const [creds] = await db.select().from(tuyaCredentials).where(eq(tuyaCredentials.restaurantId, restaurantId));
  return creds || null;
}

export async function saveTuyaCredentials(
  restaurantId: number,
  clientId: string,
  clientSecret: string,
  region: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getTuyaCredentials(restaurantId);
  if (existing) {
    await db.update(tuyaCredentials)
      .set({ clientId, clientSecret, region: region as "eu" | "us" | "cn" | "in", updatedAt: new Date() })
      .where(eq(tuyaCredentials.restaurantId, restaurantId));
  } else {
    await db.insert(tuyaCredentials).values({ restaurantId, clientId, clientSecret, region: region as "eu" | "us" | "cn" | "in" });
  }
}

export async function listTuyaDevices(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tuyaDevices).where(eq(tuyaDevices.restaurantId, restaurantId));
}

export async function addTuyaDevice(data: {
  restaurantId: number;
  deviceId: string;
  name: string;
  category: string;
  location?: string;
  alertMinValue?: string;
  alertMaxValue?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(tuyaDevices).values(data);
}

export async function updateTuyaDevice(id: number, data: Partial<{
  name: string;
  location: string;
  alertEnabled: boolean;
  alertMinValue: string;
  alertMaxValue: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(tuyaDevices).set({ ...data, updatedAt: new Date() }).where(eq(tuyaDevices.id, id));
}

export async function deleteTuyaDevice(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(tuyaDevices).where(eq(tuyaDevices.id, id));
}

// Gerätestatus von Tuya API abrufen
export async function fetchDeviceStatus(restaurantId: number, tuyaDeviceId: string) {
  const creds = await getTuyaCredentials(restaurantId);
  if (!creds) throw new Error("Keine Tuya-Zugangsdaten konfiguriert");
  const data = await tuyaRequest(creds.clientId, creds.clientSecret, creds.region, `/v1.0/devices/${tuyaDeviceId}/status`);
  return data;
}

// Alle Geräte vom Tuya-Konto abrufen (für Geräte-Discovery)
export async function discoverTuyaDevices(restaurantId: number) {
  const creds = await getTuyaCredentials(restaurantId);
  if (!creds) throw new Error("Keine Tuya-Zugangsdaten konfiguriert");
  const data = await tuyaRequest(creds.clientId, creds.clientSecret, creds.region, `/v1.0/devices?page_size=100`);
  return data;
}

// Gerät steuern (Schalter ein/aus, Licht dimmen, etc.)
export async function controlDevice(restaurantId: number, tuyaDeviceId: string, commands: Array<{ code: string; value: unknown }>) {
  const creds = await getTuyaCredentials(restaurantId);
  if (!creds) throw new Error("Keine Tuya-Zugangsdaten konfiguriert");
  const data = await tuyaRequest(
    creds.clientId, creds.clientSecret, creds.region,
    `/v1.0/devices/${tuyaDeviceId}/commands`,
    "POST",
    { commands }
  );
  return data;
}

// Messwert speichern und Alarm prüfen
export async function saveReading(deviceDbId: number, restaurantId: number, value: string, unit?: string) {
  const db = await getDb();
  if (!db) return;
  const [device] = await db.select().from(tuyaDevices).where(eq(tuyaDevices.id, deviceDbId));
  if (!device) return;

  const numVal = parseFloat(value);
  let status: "ok" | "warning" | "alarm" = "ok";

  if (device.alertEnabled) {
    const min = device.alertMinValue ? parseFloat(device.alertMinValue) : null;
    const max = device.alertMaxValue ? parseFloat(device.alertMaxValue) : null;
    if (min !== null && numVal < min) status = "alarm";
    else if (max !== null && numVal > max) status = "alarm";
    else if (min !== null && numVal < min + 2) status = "warning";
    else if (max !== null && numVal > max - 2) status = "warning";
  }

  await db.insert(tuyaReadings).values({
    deviceId: deviceDbId,
    restaurantId,
    value,
    unit,
    status,
    recordedAt: Date.now(),
  });

  // Alarm erstellen wenn nötig
  if (status === "alarm") {
    const cat = DEVICE_CATEGORIES[device.category as DeviceCategory];
    const unitStr = unit || cat?.unit || "";
    await db.insert(tuyaAlerts).values({
      deviceId: deviceDbId,
      restaurantId,
      alertType: `${device.category}_alarm`,
      message: `${device.name}: Wert ${value}${unitStr} ausserhalb des erlaubten Bereichs (${device.alertMinValue || "–"}${unitStr} bis ${device.alertMaxValue || "–"}${unitStr})`,
      value,
    });
  }

  // Gerät als online markieren
  await db.update(tuyaDevices)
    .set({ isOnline: true, lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(tuyaDevices.id, deviceDbId));
}

// Letzte Messwerte pro Gerät abrufen
export async function getLatestReadings(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  const devices = await listTuyaDevices(restaurantId);
  const results = await Promise.all(
    devices.map(async (device: TuyaDevice) => {
      const [latest] = await db.select()
        .from(tuyaReadings)
        .where(and(eq(tuyaReadings.deviceId, device.id), eq(tuyaReadings.restaurantId, restaurantId)))
        .orderBy(desc(tuyaReadings.recordedAt))
        .limit(1);
      return { device, reading: latest || null };
    })
  );
  return results;
}

// Verlaufsdaten für ein Gerät (letzte 24h)
export async function getReadingHistory(deviceId: number, restaurantId: number, hoursBack = 24) {
  const db = await getDb();
  if (!db) return [];
  const since = Date.now() - hoursBack * 60 * 60 * 1000;
  return db.select()
    .from(tuyaReadings)
    .where(and(
      eq(tuyaReadings.deviceId, deviceId),
      eq(tuyaReadings.restaurantId, restaurantId),
      gte(tuyaReadings.recordedAt, since)
    ))
    .orderBy(desc(tuyaReadings.recordedAt))
    .limit(500);
}

// Offene Alarme abrufen
export async function getOpenAlerts(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(tuyaAlerts)
    .where(and(eq(tuyaAlerts.restaurantId, restaurantId), eq(tuyaAlerts.isResolved, false)))
    .orderBy(desc(tuyaAlerts.createdAt));
}

// Alarm auflösen
export async function resolveAlert(alertId: number, resolvedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(tuyaAlerts)
    .set({ isResolved: true, resolvedAt: new Date(), resolvedBy })
    .where(eq(tuyaAlerts.id, alertId));
}

// Dashboard-Statistiken
export async function getTuyaDashboardStats(restaurantId: number) {
  const devices = await listTuyaDevices(restaurantId);
  const openAlerts = await getOpenAlerts(restaurantId);
  const onlineCount = devices.filter((d: TuyaDevice) => d.isOnline).length;
  const offlineCount = devices.length - onlineCount;
  const alarmCount = openAlerts.filter((a: { alertType: string }) => a.alertType.includes("alarm")).length;

  return {
    totalDevices: devices.length,
    onlineDevices: onlineCount,
    offlineDevices: offlineCount,
    openAlerts: openAlerts.length,
    criticalAlerts: alarmCount,
    devicesByCategory: Object.fromEntries(
      Object.keys(DEVICE_CATEGORIES).map((cat) => [
        cat,
        devices.filter((d: TuyaDevice) => d.category === cat).length,
      ])
    ),
  };
}
