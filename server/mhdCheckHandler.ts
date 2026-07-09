/**
 * mhdCheckHandler.ts
 * Heartbeat-Handler: täglich 07:00 UTC
 * Prüft für alle aktiven Restaurants Artikel mit ablaufendem/abgelaufenem MHD
 * und sendet dem Inhaber eine Push-Benachrichtigung.
 *
 * Endpoint: POST /api/scheduled/mhdCheck
 * Auth: sdk.authenticateRequest → user.isCron === true
 */
import { Request, Response } from "express";
import { getDb } from "./db";
import { restaurants, inventoryItems, warehouseLocations, warehouseZones } from "../drizzle/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

export async function mhdCheckHandler(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Datenbank nicht verfügbar" });
    }

    // Alle aktiven Restaurants laden
    const activeRestaurants = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        mhdWarningDays: restaurants.mhdWarningDays,
      })
      .from(restaurants)
      .where(eq(restaurants.status, "active"));

    const now = new Date();
    let totalNotified = 0;
    const results: Array<{ restaurantId: number; expiredCount: number; warnCount: number }> = [];

    for (const restaurant of activeRestaurants) {
      const warningDays = restaurant.mhdWarningDays ?? 3;
      const cutoff = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

      // Abgelaufene Artikel
      const expired = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          bestBefore: inventoryItems.bestBefore,
          currentStock: inventoryItems.currentStock,
          unit: inventoryItems.unit,
          locationName: warehouseLocations.name,
          zoneName: warehouseZones.name,
        })
        .from(inventoryItems)
        .leftJoin(warehouseLocations, eq(inventoryItems.locationId, warehouseLocations.id))
        .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(and(
          eq(inventoryItems.restaurantId, restaurant.id),
          eq(inventoryItems.isActive, true),
          sql`(
            (${inventoryItems.bestBefore} IS NOT NULL AND ${inventoryItems.bestBefore} < ${now})
            OR
            (${inventoryItems.expiresAt} IS NOT NULL AND ${inventoryItems.expiresAt} < ${now})
          )`
        ))
        .orderBy(asc(inventoryItems.bestBefore));

      // Bald ablaufende Artikel
      const expiringSoon = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          bestBefore: inventoryItems.bestBefore,
          currentStock: inventoryItems.currentStock,
          unit: inventoryItems.unit,
          locationName: warehouseLocations.name,
          zoneName: warehouseZones.name,
        })
        .from(inventoryItems)
        .leftJoin(warehouseLocations, eq(inventoryItems.locationId, warehouseLocations.id))
        .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(and(
          eq(inventoryItems.restaurantId, restaurant.id),
          eq(inventoryItems.isActive, true),
          sql`(
            (${inventoryItems.bestBefore} IS NOT NULL AND ${inventoryItems.bestBefore} >= ${now} AND ${inventoryItems.bestBefore} <= ${cutoff})
            OR
            (${inventoryItems.expiresAt} IS NOT NULL AND ${inventoryItems.expiresAt} >= ${now} AND ${inventoryItems.expiresAt} <= ${cutoff})
          )`
        ))
        .orderBy(asc(inventoryItems.bestBefore));

      if (expired.length === 0 && expiringSoon.length === 0) {
        results.push({ restaurantId: restaurant.id, expiredCount: 0, warnCount: 0 });
        continue;
      }

      // Benachrichtigung aufbauen
      const lines: string[] = [];

      if (expired.length > 0) {
        lines.push(`⚠️ ${expired.length} Artikel bereits ABGELAUFEN:`);
        for (const item of expired.slice(0, 5)) {
          const loc = item.locationName ? ` (${item.zoneName ?? ""} › ${item.locationName})` : "";
          const bd = item.bestBefore ? new Date(item.bestBefore).toLocaleDateString("de-CH") : "–";
          lines.push(`  • ${item.name} – MHD: ${bd} – Bestand: ${item.currentStock} ${item.unit}${loc}`);
        }
        if (expired.length > 5) lines.push(`  … und ${expired.length - 5} weitere`);
      }

      if (expiringSoon.length > 0) {
        lines.push(`⏰ ${expiringSoon.length} Artikel laufen in ${warningDays} Tagen ab:`);
        for (const item of expiringSoon.slice(0, 5)) {
          const loc = item.locationName ? ` (${item.zoneName ?? ""} › ${item.locationName})` : "";
          const bd = item.bestBefore ? new Date(item.bestBefore).toLocaleDateString("de-CH") : "–";
          lines.push(`  • ${item.name} – MHD: ${bd} – Bestand: ${item.currentStock} ${item.unit}${loc}`);
        }
        if (expiringSoon.length > 5) lines.push(`  … und ${expiringSoon.length - 5} weitere`);
      }

      const title = `🏪 ${restaurant.name}: MHD-Warnung (${expired.length} abgelaufen, ${expiringSoon.length} bald ablaufend)`;
      const content = lines.join("\n");

      await notifyOwner({ title, content });
      totalNotified++;

      results.push({
        restaurantId: restaurant.id,
        expiredCount: expired.length,
        warnCount: expiringSoon.length,
      });
    }

    return res.json({
      ok: true,
      checkedRestaurants: activeRestaurants.length,
      notifiedRestaurants: totalNotified,
      results,
      timestamp: now.toISOString(),
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return res.status(500).json({
      error,
      stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
