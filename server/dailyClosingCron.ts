/**
 * dailyClosingCron.ts
 * Sprint 8: Heartbeat-Handler für automatischen Tagesabschluss
 *
 * Wird aufgerufen von: POST /api/scheduled/dailyClosing
 * Authentifizierung: sdk.authenticateRequest (user.isCron === true)
 * Lookup: via user.taskUid → daily_closing_config.scheduleCronTaskUid
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { dailyClosingConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { performClosing } from "./closingsRouter";

export async function handleDailyClosing(req: Request, res: Response) {
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

    // 2. Konfiguration via taskUid laden (nie via req.body – sicherheitsrelevant)
    const [config] = await db
      .select()
      .from(dailyClosingConfig)
      .where(eq(dailyClosingConfig.scheduleCronTaskUid, user.taskUid))
      .limit(1);

    if (!config) {
      // Job existiert, aber Konfiguration wurde gelöscht → 2xx damit Forge nicht retried
      return res.json({ ok: true, skipped: "orphan – config not found" });
    }

    if (!config.autoEnabled) {
      // Auto wurde zwischenzeitlich deaktiviert
      return res.json({ ok: true, skipped: "auto-closing disabled" });
    }

    // 3. Tagesabschluss durchführen
    const result = await performClosing({
      restaurantId: config.restaurantId,
      mode: "auto",
    });

    console.log(`[DailyClosing] Restaurant ${config.restaurantId}: Abschluss erstellt (ID ${result.id}), Umsatz ${result.totalRevenue}`);

    return res.json({
      ok: true,
      closingId: result.id,
      restaurantId: config.restaurantId,
      totalRevenue: result.totalRevenue,
      totalOrders: result.totalOrders,
    });

  } catch (err: any) {
    console.error("[DailyClosing] Fehler:", err.message, err.stack);
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.url, taskUid: "unknown" },
      timestamp: new Date().toISOString(),
    });
  }
}
