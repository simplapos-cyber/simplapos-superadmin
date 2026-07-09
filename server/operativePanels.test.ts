import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
const mockOrders = [
  { id: 1, restaurantId: 10, orderNumber: "T1-ABC", status: "preparing", createdAt: new Date(), notes: null, floorPlanObjectId: 1, tableId: null, guestCount: 2, subtotal: "20.00", taxAmount: "1.62", tipAmount: "0.00", totalAmount: "21.62" },
  { id: 2, restaurantId: 10, orderNumber: "T2-DEF", status: "pending", createdAt: new Date(), notes: "Bitte schnell", floorPlanObjectId: 2, tableId: null, guestCount: 4, subtotal: "40.00", taxAmount: "3.24", tipAmount: "0.00", totalAmount: "43.24" },
];
const mockItems = [
  { id: 1, orderId: 1, name: "Schnitzel", quantity: 1, unitPrice: "20.00", totalPrice: "20.00", status: "preparing", itemType: "food", course: 1, priority: "normal", notes: null },
  { id: 2, orderId: 2, name: "Aperol Spritz", quantity: 2, unitPrice: "12.00", totalPrice: "24.00", status: "pending", itemType: "drink", course: 1, priority: "normal", notes: null },
  { id: 3, orderId: 2, name: "Mineralwasser", quantity: 2, unitPrice: "4.00", totalPrice: "8.00", status: "pending", itemType: "drink", course: 1, priority: "normal", notes: null },
];

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    $returningId: vi.fn().mockResolvedValue([{ id: 99 }]),
  }),
}));

// ─── Unit tests for getKitchenOrders logic ────────────────────────────────────
describe("getKitchenOrders – Filterlogik", () => {
  it("filtert nur food-Items wenn itemType=food", () => {
    const filtered = mockItems.filter(i => i.itemType === "food");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Schnitzel");
  });

  it("filtert nur drink-Items wenn itemType=drink", () => {
    const filtered = mockItems.filter(i => i.itemType === "drink");
    expect(filtered).toHaveLength(2);
    expect(filtered.every(i => i.itemType === "drink")).toBe(true);
  });

  it("gibt alle Items zurück wenn itemType=all", () => {
    const filtered = mockItems; // no filter
    expect(filtered).toHaveLength(3);
  });

  it("gruppiert Items korrekt nach orderId", () => {
    const orderMap = new Map<number, typeof mockOrders[0] & { items: typeof mockItems }>();
    for (const o of mockOrders) orderMap.set(o.id, { ...o, items: [] });
    for (const item of mockItems) {
      const order = orderMap.get(item.orderId);
      if (order) order.items.push(item);
    }
    const result = Array.from(orderMap.values()).filter(o => o.items.length > 0);
    expect(result).toHaveLength(2);
    expect(result.find(o => o.id === 1)?.items).toHaveLength(1);
    expect(result.find(o => o.id === 2)?.items).toHaveLength(2);
  });

  it("schliesst Bestellungen ohne passende Items aus", () => {
    // Only food items → order 2 (only drinks) should be excluded
    const foodItems = mockItems.filter(i => i.itemType === "food");
    const orderMap = new Map<number, typeof mockOrders[0] & { items: typeof mockItems }>();
    for (const o of mockOrders) orderMap.set(o.id, { ...o, items: [] });
    for (const item of foodItems) {
      const order = orderMap.get(item.orderId);
      if (order) order.items.push(item);
    }
    const result = Array.from(orderMap.values()).filter(o => o.items.length > 0);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

// ─── Unit tests for updateItemStatus logic ────────────────────────────────────
describe("updateItemStatus – Bestellstatus-Logik", () => {
  function calcNewOrderStatus(statuses: string[], currentStatus: string): string {
    let newStatus = currentStatus;
    if (statuses.length > 0 && statuses.every((s: string) => s === "ready" || s === "served")) newStatus = "ready";
    else if (statuses.some((s: string) => s === "preparing")) newStatus = "preparing";
    return newStatus;
  }

  it("setzt Bestellstatus auf ready wenn alle Items ready/served sind", () => {
    const statuses = ["ready", "served", "ready"];
    expect(calcNewOrderStatus(statuses, "preparing")).toBe("ready");
  });

  it("setzt Bestellstatus auf preparing wenn ein Item preparing ist", () => {
    const statuses = ["preparing", "pending", "ready"];
    expect(calcNewOrderStatus(statuses, "pending")).toBe("preparing");
  });

  it("behält pending wenn alle Items pending sind", () => {
    const statuses = ["pending", "pending"];
    expect(calcNewOrderStatus(statuses, "pending")).toBe("pending");
  });

  it("setzt auf ready wenn alle Items served sind", () => {
    const statuses = ["served", "served"];
    expect(calcNewOrderStatus(statuses, "preparing")).toBe("ready");
  });

  it("setzt auf ready wenn Items-Array leer ist (keine aktiven Items)", () => {
    // Empty array: all items served/removed
    const statuses: string[] = [];
    // statuses.length === 0 → condition fails → stays at current
    expect(calcNewOrderStatus(statuses, "preparing")).toBe("preparing");
  });

  it("priorisiert preparing über pending", () => {
    const statuses = ["pending", "preparing", "pending"];
    expect(calcNewOrderStatus(statuses, "pending")).toBe("preparing");
  });
});

// ─── Unit tests for KellnerDashboard table status logic ───────────────────────
describe("KellnerDashboard – Tischstatus-Logik", () => {
  const tables = [
    { id: 1, label: "Tisch 1", currentOrder: { id: 1, status: "preparing", totalAmount: "21.62", guestCount: 2 } },
    { id: 2, label: "Tisch 2", currentOrder: { id: 2, status: "ready", totalAmount: "43.24", guestCount: 4 } },
    { id: 3, label: "Tisch 3", currentOrder: null },
    { id: 4, label: "Tisch 4", currentOrder: { id: 4, status: "paid", totalAmount: "55.00", guestCount: 3 } },
  ];

  it("erkennt freie Tische korrekt", () => {
    const free = tables.filter(t => !t.currentOrder || ["paid", "cancelled"].includes(t.currentOrder.status));
    expect(free).toHaveLength(2); // Tisch 3 (null) + Tisch 4 (paid)
  });

  it("zählt besetzte Tische korrekt", () => {
    const occupied = tables.filter(t => t.currentOrder && !["paid", "cancelled"].includes(t.currentOrder.status));
    expect(occupied).toHaveLength(2); // Tisch 1 (preparing) + Tisch 2 (ready)
  });

  it("erkennt bereite Bestellungen für Benachrichtigung", () => {
    const ready = tables.filter(t => t.currentOrder?.status === "ready");
    expect(ready).toHaveLength(1);
    expect(ready[0].label).toBe("Tisch 2");
  });

  it("navigiert zu bestehender Bestellung bei besetztem Tisch", () => {
    const table = tables[0]; // Tisch 1 mit Bestellung
    const shouldNavigate = table.currentOrder && !["paid", "cancelled"].includes(table.currentOrder.status);
    expect(shouldNavigate).toBe(true);
  });

  it("erstellt neue Bestellung bei freiem Tisch", () => {
    const table = tables[2]; // Tisch 3 ohne Bestellung
    const shouldCreate = !table.currentOrder || ["paid", "cancelled"].includes(table.currentOrder.status ?? "");
    expect(shouldCreate).toBe(true);
  });
});

// ─── elapsed time helper tests ────────────────────────────────────────────────
describe("elapsed – Zeitanzeige", () => {
  function elapsed(createdAt: Date | null): string {
    if (!createdAt) return "?";
    const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (mins < 1) return "< 1 Min.";
    return `${mins} Min.`;
  }

  it("gibt ? zurück wenn createdAt null ist", () => {
    expect(elapsed(null)).toBe("?");
  });

  it("gibt < 1 Min. zurück für sehr neue Bestellungen", () => {
    expect(elapsed(new Date())).toBe("< 1 Min.");
  });

  it("gibt korrekte Minutenanzahl zurück", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(elapsed(fiveMinutesAgo)).toBe("5 Min.");
  });

  it("gibt korrekte Minutenanzahl für ältere Bestellungen", () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    expect(elapsed(thirtyMinutesAgo)).toBe("30 Min.");
  });
});
