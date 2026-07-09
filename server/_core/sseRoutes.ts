/**
 * SSE HTTP-Endpoint
 * GET /api/sse/:restaurantId?channels=kitchen,bar,floor,order
 *
 * Auth: Session-Cookie (gleiche Logik wie tRPC-Context via sdk.authenticateRequest)
 * Timeout: Kein Request-Timeout – SSE-Verbindungen sind langlebig
 */

import { Express, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { eventBus, SSEChannel } from "./eventBus";
import { sdk } from "./sdk";

const VALID_CHANNELS: SSEChannel[] = ["kitchen", "bar", "floor", "order", "all"];

export function registerSSERoutes(app: Express): void {
  // Monitoring-Endpoint (kein Auth nötig – nur Zähler)
  app.get("/api/sse/status", (_req: Request, res: Response) => {
    res.json({
      totalClients: eventBus.getClientCount(),
      ts: Date.now(),
    });
  });

  app.get("/api/sse/:restaurantId", async (req: Request, res: Response) => {
    const restaurantId = parseInt(req.params.restaurantId, 10);
    if (isNaN(restaurantId)) {
      return res.status(400).json({ error: "Invalid restaurantId" });
    }

    // Auth: Session-Cookie prüfen (gleiche Logik wie tRPC-Context)
    try {
      await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Channels aus Query-Parameter parsen
    const rawChannels = (req.query.channels as string) ?? "all";
    const requestedChannels: SSEChannel[] = rawChannels
      .split(",")
      .map(c => c.trim() as SSEChannel)
      .filter(c => VALID_CHANNELS.includes(c));

    const channels: SSEChannel[] = requestedChannels.length > 0 ? requestedChannels : ["all"];

    // SSE-Headers setzen
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // nginx: Buffering deaktivieren
    res.flushHeaders();

    // Client registrieren
    const clientId = uuidv4();
    eventBus.addClient(clientId, restaurantId, channels, res);

    // Initiales "connected" Event senden
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ clientId, channels, restaurantId, ts: Date.now() })}\n\n`);

    // Cleanup bei Verbindungsabbruch
    req.on("close", () => {
      eventBus.removeClient(clientId);
    });

    res.on("close", () => {
      eventBus.removeClient(clientId);
    });
  });
}
