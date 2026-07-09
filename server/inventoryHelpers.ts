/**
 * inventoryHelpers.ts
 * Gemeinsame Lagerhaltungs-Hilfsfunktionen, die von mehreren Routern
 * (orderRouter, inventoryRouter, autoReorderCron) genutzt werden.
 *
 * WICHTIG: Alle Funktionen prüfen restaurantId – niemals werden Daten
 * verschiedener Restaurants vermischt (Multi-Tenant-Isolation).
 */
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  inventoryItems,
  inventoryStockMovements,
  inventoryRecipes,
  warehouseLocations,
} from "../drizzle/schema";

type Db = Awaited<ReturnType<typeof getDb>>;

export type MovementType =
  | "purchase"
  | "sale"
  | "waste"
  | "correction"
  | "transfer"
  | "return"
  | "production";

export interface RecordMovementParams {
  restaurantId: number;
  itemId: number;
  type: MovementType;
  quantity: number; // negativ = Abgang, positiv = Zugang
  unitCost?: number;
  referenceType?: string;
  referenceId?: number;
  notes?: string;
  performedBy?: number;
}

/**
 * Bucht eine Warenbewegung und aktualisiert den Lagerbestand.
 * Wirft einen Fehler wenn der Artikel nicht zum Restaurant gehört.
 */
export async function recordMovement(
  db: NonNullable<Db>,
  params: RecordMovementParams
) {
  const [item] = await db
    .select({ currentStock: inventoryItems.currentStock, averageCost: inventoryItems.averageCost })
    .from(inventoryItems)
    .where(and(
      eq(inventoryItems.id, params.itemId),
      eq(inventoryItems.restaurantId, params.restaurantId), // Multi-Tenant-Check
    ));

  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: `Lagerartikel #${params.itemId} nicht gefunden` });

  const currentStock = parseFloat(item.currentStock ?? "0");
  const newStock = currentStock + params.quantity;
  const totalCost = params.unitCost ? Math.abs(params.quantity) * params.unitCost : undefined;

  const updateData: Record<string, unknown> = { currentStock: newStock.toFixed(3) };
  if (params.type === "purchase" && params.unitCost) {
    updateData.lastPurchasePrice = params.unitCost.toFixed(4);
    const oldAvg = parseFloat(item.averageCost ?? "0");
    const newAvg =
      currentStock > 0
        ? (currentStock * oldAvg + Math.abs(params.quantity) * params.unitCost) /
          (currentStock + Math.abs(params.quantity))
        : params.unitCost;
    updateData.averageCost = newAvg.toFixed(4);
  }

  await db.update(inventoryItems).set(updateData).where(eq(inventoryItems.id, params.itemId));

  await db.insert(inventoryStockMovements).values({
    restaurantId: params.restaurantId,
    itemId: params.itemId,
    type: params.type,
    quantity: params.quantity.toFixed(3),
    unitCost: params.unitCost?.toFixed(4),
    totalCost: totalCost?.toFixed(2),
    stockAfter: newStock.toFixed(3),
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    performedBy: params.performedBy,
  });

  return { newStock, deducted: Math.abs(params.quantity) };
}

export interface OrderItemInput {
  productId: number;
  quantity: number;
}

export interface DeductionResult {
  itemName: string;
  deducted: number;
  unit: string;
  inventoryItemId: number;
  locationId?: number | null;
  locationName?: string | null;
}

/**
 * Zieht den Lagerbestand für alle Positionen einer Bestellung ab.
 * Basiert auf den hinterlegten Rezepturen (inventoryRecipes).
 *
 * - Prüft restaurantId für jeden Rezeptur-Eintrag (Multi-Tenant-Isolation)
 * - Gibt leeres Array zurück wenn keine Rezepturen hinterlegt sind (kein Fehler)
 * - Wirft KEINEN Fehler wenn ein Artikel nicht im Lager ist – der Bestellabschluss
 *   darf nie durch fehlende Rezepturen blockiert werden
 */
export async function deductStockForOrder(
  db: NonNullable<Db>,
  params: {
    restaurantId: number;
    orderId: number;
    items: OrderItemInput[];
    performedBy?: number;
  }
): Promise<DeductionResult[]> {
  const deductions: DeductionResult[] = [];

  for (const orderItem of params.items) {
    // Rezepturen laden – nur für dieses Restaurant (restaurantId-Check)
    const recipes = await db
      .select({
        inventoryItemId: inventoryRecipes.inventoryItemId,
        quantity: inventoryRecipes.quantity,
        unit: inventoryRecipes.unit,
        conversionFactor: inventoryRecipes.conversionFactor,
        itemName: inventoryItems.name,
        // QPM-4: Lagerort-Verknüpfung für präzisen Abzug
        locationId: inventoryItems.locationId,
        locationName: warehouseLocations.name,
      })
      .from(inventoryRecipes)
      .leftJoin(inventoryItems, eq(inventoryRecipes.inventoryItemId, inventoryItems.id))
      .leftJoin(warehouseLocations, eq(inventoryItems.locationId, warehouseLocations.id))
      .where(and(
        eq(inventoryRecipes.restaurantId, params.restaurantId), // Multi-Tenant-Check
        eq(inventoryRecipes.menuItemId, orderItem.productId),
      ));

    for (const recipe of recipes) {
      if (!recipe.inventoryItemId) continue;

      const deductQty =
        parseFloat(recipe.quantity) *
        orderItem.quantity *
        parseFloat(recipe.conversionFactor ?? "1");

      try {
        // QPM-4: Notiz mit Lagerort-Info anreichern
        const locationNote = recipe.locationName
          ? ` (Lagerort: ${recipe.locationName})`
          : "";
        await recordMovement(db, {
          restaurantId: params.restaurantId,
          itemId: recipe.inventoryItemId,
          type: "sale",
          quantity: -deductQty, // negativ = Abgang
          referenceType: "order",
          referenceId: params.orderId,
          notes: `Automatischer Abzug für Bestellung #${params.orderId}${locationNote}`,
          performedBy: params.performedBy,
        });

        deductions.push({
          itemName: recipe.itemName ?? "Unbekannt",
          deducted: deductQty,
          unit: recipe.unit,
          inventoryItemId: recipe.inventoryItemId,
          locationId: recipe.locationId ?? null,
          locationName: recipe.locationName ?? null,
        });
      } catch (err) {
        // Lagerartikel nicht gefunden oder anderer Fehler → protokollieren, aber
        // Bestellabschluss NICHT blockieren
        console.warn(
          `[deductStockForOrder] Konnte Lagerbestand für Artikel #${recipe.inventoryItemId} nicht abziehen:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  return deductions;
}
