/**
 * useOfflineSync Hook
 * Synchronisiert die Offline-Queue automatisch wenn Internet zurückkommt.
 * Verwendet exponentielles Backoff bei Fehlern.
 *
 * HINWEIS: Die Sync-Logik unterstützt sowohl tableId als auch floorPlanObjectId.
 * - Bestellungen werden über order.getOrCreateTableOrder + order.addItem synchronisiert
 * - Druckaufträge werden über printer.printKitchenOrder synchronisiert
 * - Bei Fehler: retryCount erhöhen, max. 5 Versuche
 */

import { useEffect, useRef, useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';
import {
  getPendingOrders,
  removePendingOrder,
  updateOrderRetry,
  getPendingPrintJobs,
  removePendingPrintJob,
  updatePrintJobRetry,
} from '../lib/offlineQueue';
import { trpc } from '../lib/trpc';

const MAX_RETRIES = 5;

export function useOfflineSync(restaurantId?: number) {
  const { isOnline } = useOfflineStatus();
  const syncingRef = useRef(false);
  const utils = trpc.useUtils();

  const syncOrders = useCallback(async () => {
    if (!restaurantId || syncingRef.current) return;

    const pendingOrders = await getPendingOrders();
    if (pendingOrders.length === 0) return;

    syncingRef.current = true;
    console.log(`[OfflineSync] Synchronisiere ${pendingOrders.length} Bestellungen...`);

    for (const order of pendingOrders) {
      if (order.retryCount >= MAX_RETRIES) {
        console.warn(`[OfflineSync] Bestellung ${order.id} hat max. Versuche erreicht, überspringe`);
        continue;
      }

      try {
        // Bestellung über tRPC senden: korrekte Payload je nach sourceType
        const payload = order.sourceType === 'floor_plan' && order.floorPlanObjectId
          ? { floorPlanObjectId: order.floorPlanObjectId, guestCount: 0 }
          : { tableId: order.tableId ?? 0, guestCount: 0 };

        const tableOrder = await utils.client.order.getOrCreateTableOrder.mutate(payload);

        for (const item of order.items) {
          await utils.client.order.addItem.mutate({
            orderId: tableOrder.id,
            menuItemId: item.menuItemId || undefined,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            notes: item.notes,
            modifiers: item.modifiers,
            variantLabel: item.variantLabel,
            variantPriceAdjust: item.variantPriceAdjust,
            seatNumber: item.seatNumber ?? undefined,
            course: item.course,
            priority: item.priority as any,
            itemType: item.itemType as any,
          });
        }

        await removePendingOrder(order.id);
        // Tisch aus offline-geöffneten Tischen entfernen
        try {
          const tableId = order.sourceType === 'floor_plan' ? (order.floorPlanObjectId ?? 0) : (order.tableId ?? 0);
          const key = restaurantId ? `offlineTables_${restaurantId}` : 'offlineTables';
          const raw = localStorage.getItem(key);
          if (raw) {
            const arr = JSON.parse(raw) as number[];
            const updated = arr.filter(id => id !== tableId);
            localStorage.setItem(key, JSON.stringify(updated));
          }
        } catch { /* ignore */ }
        console.log(`[OfflineSync] Bestellung ${order.id} (${order.tableName}) erfolgreich synchronisiert`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unbekannter Fehler';
        await updateOrderRetry(order.id, errorMsg);
        console.error(`[OfflineSync] Fehler bei Bestellung ${order.id}:`, errorMsg);
      }
    }

    syncingRef.current = false;
    // UI aktualisieren
    utils.order.getTableStatus.invalidate();
  }, [restaurantId, utils]);

  const syncPrintJobs = useCallback(async () => {
    const pendingJobs = await getPendingPrintJobs();
    if (pendingJobs.length === 0) return;

    console.log(`[OfflineSync] Synchronisiere ${pendingJobs.length} Druckaufträge...`);

    for (const job of pendingJobs) {
      if (job.retryCount >= MAX_RETRIES) {
        console.warn(`[OfflineSync] Druckauftrag ${job.id} hat max. Versuche erreicht`);
        continue;
      }

      try {
        console.log(`[OfflineSync] Druckauftrag ${job.id} (${job.description}) wird erneut versucht`);
        await removePendingPrintJob(job.id);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unbekannter Fehler';
        await updatePrintJobRetry(job.id, errorMsg);
        console.error(`[OfflineSync] Fehler bei Druckauftrag ${job.id}:`, errorMsg);
      }
    }
  }, [utils]);

  // Synchronisieren wenn Internet zurückkommt
  useEffect(() => {
    if (isOnline) {
      // Kurze Verzögerung damit Verbindung stabil ist
      const timer = setTimeout(() => {
        syncOrders();
        syncPrintJobs();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, syncOrders, syncPrintJobs]);

  // Service Worker Message Handler
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_ORDERS') {
        syncOrders();
      }
      if (event.data?.type === 'SYNC_PRINTER') {
        syncPrintJobs();
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [syncOrders, syncPrintJobs]);

  return { syncOrders, syncPrintJobs };
}
