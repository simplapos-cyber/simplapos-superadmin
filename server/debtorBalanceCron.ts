import { Request, Response } from "express";
import { getDb } from "./db";
import { debtors, invoices, restaurants } from "../drizzle/schema";
import { eq, and, like } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

/**
 * Heartbeat-Handler: Prüft täglich alle Debitoren aller Restaurants
 * auf offene Salden über dem konfigurierten Schwellenwert.
 * Route: POST /api/scheduled/debtor-balance-check
 */
export async function handleDebtorBalanceCheck(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "DB unavailable" });
      return;
    }

    // Alle aktiven Restaurants laden
    const allRestaurants = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        debtorBalanceWarningThreshold: restaurants.debtorBalanceWarningThreshold,
      })
      .from(restaurants);

    let totalWarnings = 0;

    for (const restaurant of allRestaurants) {
      const threshold = parseFloat(restaurant.debtorBalanceWarningThreshold || "500");
      if (threshold <= 0) continue;

      const allDebtorRows = await db
        .select()
        .from(debtors)
        .where(eq(debtors.restaurantId, restaurant.id));

      if (allDebtorRows.length === 0) continue;

      const warnings: Array<{ name: string; company: string | null; openBalance: number }> = [];

      for (const debtor of allDebtorRows) {
        const matchConditions = [eq(invoices.restaurantId, restaurant.id)];
        if (debtor.email) {
          matchConditions.push(eq(invoices.recipientEmail, debtor.email) as any);
        } else {
          matchConditions.push(like(invoices.recipientName, `%${debtor.name}%`) as any);
        }

        const invRows = await db
          .select({
            status: invoices.status,
            totalAmount: invoices.totalAmount,
          })
          .from(invoices)
          .where(and(...matchConditions));

        type InvRow = typeof invRows[number];
        const openBalance = invRows
          .filter((i: InvRow) => ["sent", "dunning1", "dunning2"].includes(i.status || ""))
          .reduce((s: number, i: InvRow) => s + parseFloat(i.totalAmount || "0"), 0);

        if (openBalance >= threshold) {
          warnings.push({ name: debtor.name, company: debtor.company || null, openBalance });
        }
      }

      if (warnings.length > 0) {
        totalWarnings += warnings.length;
        const list = warnings
          .map(w => `• ${w.company ? w.company + " / " : ""}${w.name}: CHF ${w.openBalance.toFixed(2)}`)
          .join("\n");

        await notifyOwner({
          title: `⚠️ Saldowarnung [${restaurant.name}]: ${warnings.length} Debitor(en) über CHF ${threshold.toFixed(2)}`,
          content: `Folgende Debitoren des Restaurants «${restaurant.name}» haben einen offenen Saldo über dem Warnschwellenwert (CHF ${threshold.toFixed(2)}):\n\n${list}\n\nBitte prüfen Sie die offenen Posten im Debitorenmodul.`,
        });
      }
    }

    res.json({
      success: true,
      restaurantsChecked: allRestaurants.length,
      totalWarnings,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[debtorBalanceCron] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
