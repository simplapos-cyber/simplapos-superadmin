/**
 * offlineOrderStore.ts
 * Persistiert Offline-Bestellungen im localStorage, damit sie nach Navigation
 * wiederhergestellt werden können.
 *
 * Schlüssel: `offlineOrders_{restaurantId}`
 * Wert: Record<tableKey, OfflineOrder>
 *   tableKey = `floor_${floorPlanObjectId}` oder `table_${tableId}`
 */

export interface OfflineOrderItem {
  tempId: number;
  menuItemId: number;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  variantLabel?: string;
  variantPriceAdjust?: number;
  modifiers: Array<{ id: number; name: string; price: number }>;
  seatNumber?: number | null;
  course: number;
  priority: string;
  itemType: string;
}

export interface OfflineOrder {
  id: number; // negative (z.B. -1234567890)
  orderNumber: string;
  tableKey: string; // `floor_${id}` oder `table_${id}`
  tableLabel: string;
  tableId: number | null;
  floorPlanObjectId: number | null;
  sourceType: 'floor_plan' | 'table';
  restaurantId: number;
  items: OfflineOrderItem[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

function getStorageKey(restaurantId: number): string {
  return `offlineOrders_${restaurantId}`;
}

export function loadOfflineOrders(restaurantId: number): Record<string, OfflineOrder> {
  try {
    const raw = localStorage.getItem(getStorageKey(restaurantId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveOfflineOrder(restaurantId: number, order: OfflineOrder): void {
  try {
    const all = loadOfflineOrders(restaurantId);
    all[order.tableKey] = order;
    localStorage.setItem(getStorageKey(restaurantId), JSON.stringify(all));
  } catch {
    // localStorage full – ignore
  }
}

export function removeOfflineOrder(restaurantId: number, tableKey: string): void {
  try {
    const all = loadOfflineOrders(restaurantId);
    delete all[tableKey];
    localStorage.setItem(getStorageKey(restaurantId), JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function getOfflineOrder(restaurantId: number, tableKey: string): OfflineOrder | null {
  const all = loadOfflineOrders(restaurantId);
  return all[tableKey] ?? null;
}

export function makeTableKey(sourceType: 'floor_plan' | 'table', id: number): string {
  return sourceType === 'floor_plan' ? `floor_${id}` : `table_${id}`;
}

/** Alle Offline-Bestellungen für ein Restaurant löschen (nach vollständigem Sync) */
export function clearAllOfflineOrders(restaurantId: number): void {
  try {
    localStorage.removeItem(getStorageKey(restaurantId));
  } catch {
    // ignore
  }
}
