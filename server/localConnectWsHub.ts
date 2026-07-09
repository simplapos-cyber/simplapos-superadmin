/**
 * SimplaPOS Local Connect – WebSocket Hub (Cloud-seitig)
 *
 * Verwaltet persistente WebSocket-Verbindungen von Local-Connect-Geräten.
 * Jedes Gerät verbindet sich mit:
 *   wss://simplapos.com/ws/local-connect?token=<deviceToken>&deviceId=<deviceId>
 *
 * Der Hub:
 * - Authentifiziert Geräte anhand des deviceToken
 * - Verteilt Events an alle Geräte desselben Restaurants
 * - Sendet ausstehende Jobs sofort nach Verbindungsaufbau
 * - Aktualisiert den Online-Status in der DB
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getDb } from "./db";
import { localConnectDevices, localConnectJobs } from "../drizzle/schema";
import type { LocalConnectJob } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface ConnectedDevice {
  ws: WebSocket;
  deviceId: string;
  restaurantId: number;
  deviceToken: string;
  connectedAt: number;
}

interface HubMessage {
  type: "event" | "ack" | "ping" | "pong" | "sync_request" | "sync_response" | "job" | "health";
  payload: unknown;
  timestamp: number;
  messageId: string;
}

// ─── Hub-State ────────────────────────────────────────────────────────────────

// Map: deviceId → ConnectedDevice
const connectedDevices = new Map<string, ConnectedDevice>();

// ─── WebSocket-Server initialisieren ─────────────────────────────────────────

export function initLocalConnectWsHub(httpServer: Server): void {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/local-connect",
  });

  console.log("[LocalConnect WS] Hub gestartet auf /ws/local-connect");

  wss.on("connection", async (ws, req) => {
    // Token und DeviceId aus Query-String extrahieren
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const deviceId = url.searchParams.get("deviceId");

    if (!token || !deviceId) {
      ws.close(4001, "Fehlende Authentifizierung");
      return;
    }

    // Gerät in DB authentifizieren
    const db = await getDb();
    if (!db) {
      ws.close(4002, "Datenbankfehler");
      return;
    }

    const devices = await db
      .select()
      .from(localConnectDevices)
      .where(
        and(
          eq(localConnectDevices.deviceId, deviceId),
          eq(localConnectDevices.deviceToken, token)
        )
      )
      .limit(1);

    if (devices.length === 0) {
      ws.close(4003, "Ungültiges Token oder Gerät nicht registriert");
      return;
    }

    const device = devices[0];

    // Online-Status in DB setzen
    await db
      .update(localConnectDevices)
      .set({ isOnline: true, lastSeenAt: Date.now() })
      .where(eq(localConnectDevices.deviceId, deviceId));

    // Gerät in Map registrieren
    const connected: ConnectedDevice = {
      ws,
      deviceId,
      restaurantId: device.restaurantId,
      deviceToken: token,
      connectedAt: Date.now(),
    };
    connectedDevices.set(deviceId, connected);

    console.log(`[LocalConnect WS] Gerät verbunden: ${device.deviceName} (Restaurant ${device.restaurantId})`);

    // Ausstehende Jobs sofort senden
    await sendPendingJobs(ws, device.restaurantId);

    // ── Nachrichten verarbeiten ─────────────────────────────────────────────

    ws.on("message", async (data) => {
      try {
        const msg: HubMessage = JSON.parse(data.toString());

        switch (msg.type) {
          case "ping":
            // Heartbeat beantworten
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now(), messageId: "pong", payload: null }));
            // Letzten Heartbeat in DB aktualisieren
            await db
              .update(localConnectDevices)
              .set({ lastSeenAt: Date.now() })
              .where(eq(localConnectDevices.deviceId, deviceId));
            break;

          case "ack": {
            // Job als abgeschlossen markieren
            const { jobId, success, error } = msg.payload as { jobId: number; success: boolean; error?: string };
            await db
              .update(localConnectJobs)
              .set({
                status: success ? ("confirmed" as const) : ("failed" as const),
                sentAt: success ? new Date() : undefined,
                confirmedAt: success ? new Date() : undefined,
                errorMessage: error ?? null,
              })
              .where(eq(localConnectJobs.id, jobId));
            break;
          }

          case "event": {
            // Event von Gerät empfangen → an alle anderen Geräte desselben Restaurants verteilen
            const event = msg.payload;
            broadcastToRestaurant(device.restaurantId, msg, deviceId);
            // ACK zurücksenden
            ws.send(JSON.stringify({
              type: "ack",
              payload: { eventId: msg.messageId },
              timestamp: Date.now(),
              messageId: `ack-${msg.messageId}`,
            }));
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error("[LocalConnect WS] Fehler beim Verarbeiten der Nachricht:", err);
      }
    });

    // ── Verbindung getrennt ─────────────────────────────────────────────────

    ws.on("close", async () => {
      connectedDevices.delete(deviceId);
      console.log(`[LocalConnect WS] Gerät getrennt: ${device.deviceName}`);

      // Offline-Status in DB setzen
      const db2 = await getDb();
      if (db2) {
        await db2
          .update(localConnectDevices)
          .set({ isOnline: false, lastSeenAt: Date.now() })
          .where(eq(localConnectDevices.deviceId, deviceId));
      }
    });

    ws.on("error", (err) => {
      console.error(`[LocalConnect WS] Fehler für Gerät ${deviceId}:`, err);
    });
  });
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Sendet alle ausstehenden Jobs an ein neu verbundenes Gerät.
 */
async function sendPendingJobs(ws: WebSocket, restaurantId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const pendingJobs = await db
    .select()
    .from(localConnectJobs)
    .where(
      and(
        eq(localConnectJobs.restaurantId, restaurantId),
        eq(localConnectJobs.status, "pending")
      )
    );

  for (const job of pendingJobs) {
    if (ws.readyState !== WebSocket.OPEN) break;

    const msg: HubMessage = {
      type: "job",
      payload: {
        id: job.id,
        type: job.jobType,
        payload: job.payload ? JSON.parse(job.payload) : {},
        priority: job.priority,
        createdAt: job.createdAt,
      },
      timestamp: Date.now(),
      messageId: `job-${job.id}`,
    };

    ws.send(JSON.stringify(msg));

    // Job als "sent" markieren
    await db
      .update(localConnectJobs)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(localConnectJobs.id, job.id));
  }
}

/**
 * Sendet einen neuen Job an alle verbundenen Geräte eines Restaurants.
 * Wird aufgerufen wenn ein neuer Druckauftrag erstellt wird.
 */
export function broadcastJobToRestaurant(restaurantId: number, job: {
  id: number;
  type: string;
  payload: unknown;
  priority: number;
  createdAt: number;
}): void {
  const msg: HubMessage = {
    type: "job",
    payload: job,
    timestamp: Date.now(),
    messageId: `job-${job.id}`,
  };

  broadcastToRestaurant(restaurantId, msg);
}

/**
 * Verteilt eine Nachricht an alle verbundenen Geräte eines Restaurants.
 * Optional: excludeDeviceId um den Sender auszuschließen.
 */
function broadcastToRestaurant(
  restaurantId: number,
  msg: HubMessage,
  excludeDeviceId?: string
): void {
  for (const [deviceId, device] of Array.from(connectedDevices.entries())) {
    if (device.restaurantId !== restaurantId) continue;
    if (excludeDeviceId && deviceId === excludeDeviceId) continue;
    if (device.ws.readyState !== WebSocket.OPEN) continue;

    try {
      device.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error(`[LocalConnect WS] Fehler beim Senden an ${deviceId}:`, err);
    }
  }
}

/**
 * Gibt die Anzahl der verbundenen Geräte zurück (für Monitoring).
 */
export function getConnectedDeviceCount(): number {
  return connectedDevices.size;
}

/**
 * Gibt alle verbundenen Geräte-IDs eines Restaurants zurück.
 */
export function getOnlineDevicesForRestaurant(restaurantId: number): string[] {
  return Array.from(connectedDevices.values())
    .filter((d: ConnectedDevice) => d.restaurantId === restaurantId)
    .map((d: ConnectedDevice) => d.deviceId);
}
