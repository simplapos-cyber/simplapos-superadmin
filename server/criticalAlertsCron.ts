import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import {
  getCriticalInventory,
  getOrdersByRestaurant,
  getAllRestaurants,
} from "./db";
import type { Request, Response } from "express";

/**
 * Critical Alerts Handler - called every 15 minutes by Heartbeat cron.
 * 
 * Checks all active restaurants for:
 * 1. Critical inventory levels (stock below minimum)
 * 2. Delayed orders (waiting > 20 minutes)
 * 3. Sends push notification to owner if critical issues found
 */
export async function handleCriticalAlertsCheck(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req) as any;
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const results = {
      restaurantsChecked: 0,
      alertsSent: 0,
      errors: [] as string[],
    };

    // Get all restaurants
    const allRestaurants = await getAllRestaurants();

    for (const restaurant of allRestaurants) {
      // Only check active restaurants
      if (restaurant.status !== "active") continue;

      try {
        results.restaurantsChecked++;
        const notifications: string[] = [];

        // 1. Check critical inventory
        const criticalItems = await getCriticalInventory(restaurant.id);
        if (criticalItems.length > 0) {
          const itemList = criticalItems
            .map((i: any) => `${i.name}: ${i.currentStock}/${i.minStock} ${i.unit}`)
            .join(", ");
          notifications.push(`🔴 Kritischer Lagerbestand: ${itemList}`);
        }

        // 2. Check delayed orders (> 20 min pending)
        const pendingOrders = await getOrdersByRestaurant(restaurant.id, { status: "pending" });
        const delayedOrders = pendingOrders.filter((o: any) => {
          const waitMs = Date.now() - new Date(o.createdAt).getTime();
          return waitMs > 20 * 60 * 1000;
        });
        if (delayedOrders.length > 0) {
          notifications.push(`🟠 ${delayedOrders.length} Bestellung(en) warten seit über 20 Minuten!`);
        }

        // 3. Send notification if critical issues found
        if (notifications.length > 0) {
          await notifyOwner({
            title: `⚠️ ${restaurant.name}: ${notifications.length} kritische Warnung(en)`,
            content: notifications.join("\n\n"),
          });
          results.alertsSent++;
        }
      } catch (err: any) {
        results.errors.push(`Restaurant ${restaurant.id}: ${err.message}`);
      }
    }

    console.log(`[CriticalAlerts] Checked ${results.restaurantsChecked} restaurants, sent ${results.alertsSent} alerts`);
    return res.json({ success: true, ...results });
  } catch (err: any) {
    console.error("[CriticalAlerts] Fatal error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
