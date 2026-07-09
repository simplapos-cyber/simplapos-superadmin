import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import {
  inventoryItems,
  inventorySuppliers,
  inventoryPurchaseOrders,
  inventoryPurchaseOrderItems,
  inventoryStockMovements,
  restaurants,
} from "../drizzle/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import type { Request, Response } from "express";

/**
 * Auto-Reorder Cron Handler – wird täglich um 06:00 UTC ausgeführt.
 *
 * Logik pro Restaurant:
 * 1. Alle Artikel mit autoReorder=true und currentStock <= reorderPoint finden
 * 2. Pro Lieferant eine Bestellung (draft) erstellen
 * 3. Bestellpositionen mit reorderQty einfügen
 * 4. Warenbewegung "reserved" eintragen
 * 5. Owner-Benachrichtigung senden
 */
export async function handleAutoReorder(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req) as any;
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Datenbank nicht verfügbar" });
    }

    const results = {
      restaurantsChecked: 0,
      ordersCreated: 0,
      itemsOrdered: 0,
      errors: [] as string[],
    };

    // Alle aktiven Restaurants laden
    const allRestaurants = await db
      .select({ id: restaurants.id, name: restaurants.name, status: restaurants.status })
      .from(restaurants);

    for (const restaurant of allRestaurants) {
      if (restaurant.status !== "active") continue;

      try {
        results.restaurantsChecked++;

        // Artikel finden, die nachbestellt werden müssen
        const itemsToReorder = await db
          .select({
            id: inventoryItems.id,
            name: inventoryItems.name,
            currentStock: inventoryItems.currentStock,
            reorderPoint: inventoryItems.reorderPoint,
            reorderQty: inventoryItems.reorderQty,
            unit: inventoryItems.unit,
            costPerUnit: inventoryItems.costPerUnit,
            autoReorderSupplierId: inventoryItems.autoReorderSupplierId,
          })
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.restaurantId, restaurant.id),
              eq(inventoryItems.autoReorder, true),
              lte(inventoryItems.currentStock, inventoryItems.reorderPoint),
            )
          );

        if (itemsToReorder.length === 0) continue;

        // Artikel nach Lieferant gruppieren
        const bySupplier = new Map<number, typeof itemsToReorder>();
        const noSupplierItems: typeof itemsToReorder = [];

        for (const item of itemsToReorder) {
          if (item.autoReorderSupplierId) {
            const suppId = item.autoReorderSupplierId;
            if (!bySupplier.has(suppId)) bySupplier.set(suppId, []);
            bySupplier.get(suppId)!.push(item);
          } else {
            noSupplierItems.push(item);
          }
        }

        const orderedItemNames: string[] = [];

        // Pro Lieferant eine Bestellung erstellen
        for (const [supplierId, items] of Array.from(bySupplier.entries())) {
          const supplier = await db
            .select({ id: inventorySuppliers.id, name: inventorySuppliers.name })
            .from(inventorySuppliers)
            .where(eq(inventorySuppliers.id, supplierId))
            .limit(1);

          if (!supplier[0]) continue;

          // Bestellnummer generieren
          const orderNumber = `AUTO-${restaurant.id}-${Date.now()}`;

          // Gesamtbetrag berechnen
          let totalAmount = 0;
          for (const item of items) {
            const qty = parseFloat(String(item.reorderQty ?? item.reorderPoint ?? 1));
            const cost = parseFloat(String(item.costPerUnit ?? 0));
            totalAmount += qty * cost;
          }

          // Bestellung erstellen
          const [orderResult] = await db.insert(inventoryPurchaseOrders).values({
            restaurantId: restaurant.id,
            supplierId,
            orderNumber,
            status: "draft",
            totalAmount: String(totalAmount.toFixed(2)),
            aiGenerated: true,
            aiReason: `Automatische Nachbestellung: ${items.length} Artikel unter Mindestbestand`,
            notes: `Automatisch erstellt am ${new Date().toLocaleDateString("de-CH")}`,
          });

          const orderId = (orderResult as any).insertId;

          // Bestellpositionen einfügen
          for (const item of items) {
            const qty = parseFloat(String(item.reorderQty ?? item.reorderPoint ?? 1));
            const cost = parseFloat(String(item.costPerUnit ?? 0));

            await db.insert(inventoryPurchaseOrderItems).values({
              purchaseOrderId: orderId,
              itemId: item.id,
              orderedQty: String(qty),
              unitCost: String(cost),
              totalCost: String((qty * cost).toFixed(2)),
              notes: `Aktueller Bestand: ${item.currentStock} ${item.unit}, Mindestbestand: ${item.reorderPoint} ${item.unit}`,
            });

            // Warenbewegung "reserved" eintragen
            await db.insert(inventoryStockMovements).values({
              restaurantId: restaurant.id,
              itemId: item.id,
              type: "correction",
              quantity: String(0), // Noch nicht eingetroffen
              unitCost: String(cost),
              notes: `Auto-Bestellung #${orderNumber} erstellt`,
              referenceType: "purchase_order",
              referenceId: orderId,
            });

            orderedItemNames.push(`${item.name} (${qty} ${item.unit})`);
            results.itemsOrdered++;
          }

          results.ordersCreated++;
        }

        // Artikel ohne Lieferant in Benachrichtigung aufnehmen
        if (noSupplierItems.length > 0) {
          orderedItemNames.push(
            ...noSupplierItems.map((i: { name: string; reorderQty: unknown; reorderPoint: unknown; unit: string }) => `⚠️ ${i.name} (kein Lieferant hinterlegt)`)
          );
        }

        // Owner-Benachrichtigung senden
        if (orderedItemNames.length > 0) {
          await notifyOwner({
            title: `🛒 ${restaurant.name}: Automatische Nachbestellung`,
            content: [
              `Folgende Artikel wurden automatisch nachbestellt:`,
              ``,
              orderedItemNames.map(n => `• ${n}`).join("\n"),
              ``,
              `Bitte überprüfen und bestätigen Sie die Bestellungen im Einkaufsplanungs-Modul.`,
            ].join("\n"),
          });
        }

      } catch (err: any) {
        results.errors.push(`Restaurant ${restaurant.id} (${restaurant.name}): ${err.message}`);
        console.error(`[AutoReorder] Fehler bei Restaurant ${restaurant.id}:`, err);
      }
    }

    console.log(
      `[AutoReorder] ${results.restaurantsChecked} Restaurants geprüft, ` +
      `${results.ordersCreated} Bestellungen erstellt, ` +
      `${results.itemsOrdered} Artikel bestellt`
    );

    return res.json({ success: true, ...results });

  } catch (err: any) {
    console.error("[AutoReorder] Fataler Fehler:", err.message);
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.url, taskUid: "unknown" },
      timestamp: new Date().toISOString(),
    });
  }
}
