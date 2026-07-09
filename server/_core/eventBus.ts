/**
 * SSE Event Bus – In-Memory pub/sub pro Restaurant
 *
 * Jeder Browser-Client öffnet eine SSE-Verbindung zu /api/sse/:restaurantId.
 * Wenn ein tRPC-Endpoint eine Änderung vornimmt (neue Bestellung, Item-Update,
 * Bestellung geschlossen etc.) ruft er emit() auf. Alle verbundenen Clients
 * desselben Restaurants erhalten das Event sofort.
 *
 * Channels:
 *   kitchen   – Küchen-Panel (neue Bestellungen, Status-Updates)
 *   bar       – Bar-Panel (gleiche Logik wie Küche)
 *   floor     – Kellner-Tischplan (Tischstatus-Änderungen)
 *   order     – Bestellungs-Detail (Item-Updates innerhalb einer Bestellung)
 *   all       – Alle obigen Channels gleichzeitig
 */

import { Response } from "express";

export type SSEChannel = "kitchen" | "bar" | "floor" | "order" | "all";

export interface SSEEvent {
  type: string;
  channel: SSEChannel | SSEChannel[];
  restaurantId: number;
  payload?: Record<string, unknown>;
}

interface SSEClient {
  id: string;
  restaurantId: number;
  res: Response;
  channels: Set<SSEChannel>;
  connectedAt: number;
}

class EventBus {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Heartbeat alle 25 Sekunden – verhindert Proxy-Timeouts (nginx default: 60s)
    this.heartbeatInterval = setInterval(() => {
      this.emit({ type: "heartbeat", channel: "all", restaurantId: -1 });
    }, 25_000);
  }

  /** Registriert einen neuen SSE-Client */
  addClient(id: string, restaurantId: number, channels: SSEChannel[], res: Response): void {
    const client: SSEClient = {
      id,
      restaurantId,
      res,
      channels: new Set(channels),
      connectedAt: Date.now(),
    };
    this.clients.set(id, client);
    console.log(`[SSE] Client connected: ${id} (restaurant ${restaurantId}, channels: ${channels.join(",")}), total: ${this.clients.size}`);
  }

  /** Entfernt einen Client (Verbindung getrennt) */
  removeClient(id: string): void {
    this.clients.delete(id);
    console.log(`[SSE] Client disconnected: ${id}, total: ${this.clients.size}`);
  }

  /** Sendet ein Event an alle passenden Clients */
  emit(event: SSEEvent): void {
    const targetChannels = Array.isArray(event.channel) ? event.channel : [event.channel];
    const data = JSON.stringify({
      type: event.type,
      payload: event.payload ?? {},
      ts: Date.now(),
    });

    let sent = 0;
    for (const client of Array.from(this.clients.values())) {
      // Heartbeats gehen an alle
      if (event.type === "heartbeat") {
        try {
          client.res.write(`data: ${JSON.stringify({ type: "heartbeat", ts: Date.now() })}\n\n`);
          sent++;
        } catch {
          this.removeClient(client.id);
        }
        continue;
      }

      // Restaurant-Filter
      if (client.restaurantId !== event.restaurantId) continue;

      // Channel-Filter: "all" oder überschneidende Channels
      const matchesChannel =
        targetChannels.includes("all") ||
        client.channels.has("all") ||
        targetChannels.some(ch => client.channels.has(ch));

      if (!matchesChannel) continue;

      try {
        client.res.write(`event: ${event.type}\n`);
        client.res.write(`data: ${data}\n\n`);
        sent++;
      } catch {
        // Client hat die Verbindung getrennt
        this.removeClient(client.id);
      }
    }

    if (sent > 0) {
      console.log(`[SSE] Emitted '${event.type}' to ${sent} client(s) (restaurant ${event.restaurantId})`);
    }
  }

  /** Anzahl verbundener Clients (für Monitoring) */
  getClientCount(restaurantId?: number): number {
    if (restaurantId === undefined) return this.clients.size;
    let count = 0;
    for (const c of Array.from(this.clients.values())) {
      if (c.restaurantId === restaurantId) count++;
    }
    return count;
  }

  destroy(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }
}

// Singleton – wird vom gesamten Server-Prozess geteilt
export const eventBus = new EventBus();
