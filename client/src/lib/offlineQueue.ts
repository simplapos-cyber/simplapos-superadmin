/**
 * Offline-Queue für Bestellungen – localStorage-basiert (iOS/Safari-kompatibel)
 *
 * WARUM localStorage statt IndexedDB:
 * - IndexedDB ist auf iOS Safari im privaten Modus NICHT verfügbar
 * - IndexedDB ist auf iOS Safari generell unzuverlässig (Bugs, Limits)
 * - localStorage ist synchron, einfach und auf iOS zuverlässig
 * - 5MB Limit ist für Bestelldaten mehr als ausreichend
 *
 * Alle Funktionen sind async für API-Kompatibilität mit dem alten IndexedDB-Code.
 */

const QUEUE_KEY_PREFIX = 'offlineQueue_';
const PRINT_KEY_PREFIX = 'offlinePrint_';

export interface PendingOrderItem {
  menuItemId: number;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  options?: Record<string, string>;
  modifiers?: Array<{ id: number; name: string; price: number }>;
  variantLabel?: string;
  variantPriceAdjust?: number;
  seatNumber?: number | null;
  course?: number;
  priority?: string;
  itemType?: string;
}

export interface PendingOrder {
  id: string;          // Lokale UUID
  restaurantId: number;
  // Tisch-Identifikation: entweder tableId ODER floorPlanObjectId
  tableId?: number | null;
  floorPlanObjectId?: number | null;
  sourceType: 'table' | 'floor_plan';
  tableName: string;
  items: PendingOrderItem[];
  waiterId?: number;
  waiterName?: string;
  notes?: string;
  createdAt: number;   // Unix timestamp ms
  retryCount: number;
  lastError?: string;
}

export interface PendingPrintJob {
  id: string;
  printerIp: string;
  printerPort: number;
  data: string;        // ESC/POS Hex-String
  description: string; // z.B. "Bon Tisch 5"
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function getQueueKey(restaurantId?: number): string {
  return restaurantId ? `${QUEUE_KEY_PREFIX}${restaurantId}` : `${QUEUE_KEY_PREFIX}global`;
}

function getPrintKey(): string {
  return `${PRINT_KEY_PREFIX}global`;
}

function readOrders(): PendingOrder[] {
  // Alle Queues über alle Restaurants zusammenführen
  const result: PendingOrder[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(QUEUE_KEY_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const arr = JSON.parse(raw) as PendingOrder[];
          result.push(...arr);
        }
      }
    }
  } catch { /* ignore */ }
  return result;
}

function readOrdersByRestaurant(restaurantId: number): PendingOrder[] {
  try {
    const key = getQueueKey(restaurantId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as PendingOrder[];
  } catch {
    return [];
  }
}

function writeOrdersByRestaurant(restaurantId: number, orders: PendingOrder[]): void {
  try {
    const key = getQueueKey(restaurantId);
    localStorage.setItem(key, JSON.stringify(orders));
  } catch (e) {
    console.error('[offlineQueue] localStorage write failed:', e);
  }
}

function readPrintJobs(): PendingPrintJob[] {
  try {
    const raw = localStorage.getItem(getPrintKey());
    if (!raw) return [];
    return JSON.parse(raw) as PendingPrintJob[];
  } catch {
    return [];
  }
}

function writePrintJobs(jobs: PendingPrintJob[]): void {
  try {
    localStorage.setItem(getPrintKey(), JSON.stringify(jobs));
  } catch (e) {
    console.error('[offlineQueue] localStorage write (print) failed:', e);
  }
}

// ─── Bestellungen ─────────────────────────────────────────────────────────────

export async function addPendingOrder(order: Omit<PendingOrder, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
  const id = `order-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const record: PendingOrder = {
    ...order,
    id,
    createdAt: Date.now(),
    retryCount: 0,
  };
  const orders = readOrdersByRestaurant(order.restaurantId);
  orders.push(record);
  writeOrdersByRestaurant(order.restaurantId, orders);
  return id;
}

/**
 * Item zu einer bestehenden Offline-Bestellung hinzufügen (anhand tableName/sourceType).
 * Wenn keine passende Bestellung gefunden wird, wird eine neue erstellt.
 */
export async function addItemToPendingOrder(
  tableId: number | null,
  floorPlanObjectId: number | null,
  sourceType: 'table' | 'floor_plan',
  tableName: string,
  restaurantId: number,
  item: PendingOrderItem
): Promise<string> {
  const orders = readOrdersByRestaurant(restaurantId);

  // Suche nach bestehender Offline-Bestellung für diesen Tisch
  const existingIdx = orders.findIndex(o =>
    o.sourceType === sourceType &&
    (sourceType === 'floor_plan'
      ? o.floorPlanObjectId === floorPlanObjectId
      : o.tableId === tableId)
  );

  if (existingIdx >= 0) {
    const existing = orders[existingIdx];
    // Prüfen ob gleiches Item schon vorhanden (zusammenführen)
    const existingItemIdx = existing.items.findIndex(i =>
      i.menuItemId === item.menuItemId &&
      i.variantLabel === item.variantLabel &&
      i.notes === item.notes
    );
    if (existingItemIdx >= 0) {
      existing.items[existingItemIdx].quantity += item.quantity;
    } else {
      existing.items.push(item);
    }
    orders[existingIdx] = existing;
    writeOrdersByRestaurant(restaurantId, orders);
    return existing.id;
  } else {
    // Neue Offline-Bestellung erstellen
    return addPendingOrder({
      restaurantId,
      tableId,
      floorPlanObjectId,
      sourceType,
      tableName,
      items: [item],
    });
  }
}

export async function getPendingOrders(): Promise<PendingOrder[]> {
  return readOrders();
}

export async function getPendingOrdersForRestaurant(restaurantId: number): Promise<PendingOrder[]> {
  return readOrdersByRestaurant(restaurantId);
}

export async function removePendingOrder(id: string): Promise<void> {
  // Alle Restaurant-Queues durchsuchen
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(QUEUE_KEY_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const arr = JSON.parse(raw) as PendingOrder[];
          const filtered = arr.filter(o => o.id !== id);
          if (filtered.length !== arr.length) {
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      }
    }
  } catch { /* ignore */ }
}

export async function updateOrderRetry(id: string, error: string): Promise<void> {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(QUEUE_KEY_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const arr = JSON.parse(raw) as PendingOrder[];
          const idx = arr.findIndex(o => o.id === id);
          if (idx >= 0) {
            arr[idx].retryCount += 1;
            arr[idx].lastError = error;
            localStorage.setItem(key, JSON.stringify(arr));
            return;
          }
        }
      }
    }
  } catch { /* ignore */ }
}

export async function countPendingOrders(): Promise<number> {
  return readOrders().length;
}

// ─── Drucker-Queue ────────────────────────────────────────────────────────────

export async function addPendingPrintJob(job: Omit<PendingPrintJob, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
  const id = `print-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const record: PendingPrintJob = {
    ...job,
    id,
    createdAt: Date.now(),
    retryCount: 0,
  };
  const jobs = readPrintJobs();
  jobs.push(record);
  writePrintJobs(jobs);
  return id;
}

export async function getPendingPrintJobs(): Promise<PendingPrintJob[]> {
  return readPrintJobs();
}

export async function removePendingPrintJob(id: string): Promise<void> {
  const jobs = readPrintJobs().filter(j => j.id !== id);
  writePrintJobs(jobs);
}

export async function updatePrintJobRetry(id: string, error: string): Promise<void> {
  const jobs = readPrintJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx >= 0) {
    jobs[idx].retryCount += 1;
    jobs[idx].lastError = error;
    writePrintJobs(jobs);
  }
}

export async function countPendingPrintJobs(): Promise<number> {
  return readPrintJobs().length;
}
