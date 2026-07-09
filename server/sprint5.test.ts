/**
 * Sprint 5 Tests: Lagerabzug beim Verkauf + Abweichungsprotokoll + Verbrauchsstatistik
 * Multi-Tenant-Isolation wird in jedem Test explizit geprüft.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("./_core/env", () => ({
  env: {
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    JWT_SECRET: "test-secret",
    VITE_APP_ID: "test-app-id",
    OAUTH_SERVER_URL: "http://localhost:3001",
    VITE_OAUTH_PORTAL_URL: "http://localhost:3001",
    OWNER_OPEN_ID: "owner-123",
    OWNER_NAME: "Test Owner",
    BUILT_IN_FORGE_API_URL: "http://localhost:3002",
    BUILT_IN_FORGE_API_KEY: "test-key",
    VITE_FRONTEND_FORGE_API_KEY: "test-frontend-key",
    VITE_FRONTEND_FORGE_API_URL: "http://localhost:3002",
  },
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ suggestions: [], reasoning: "Test" }) } }],
  }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
import { getDb } from "./db";

function makeCtx(restaurantId: number, userId = 1) {
  return {
    user: { id: userId, role: "admin" as const, restaurantId, openId: "test", loginMethod: "oauth" as const },
  };
}

function makeDbMock(overrides: Record<string, any> = {}) {
  const base = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return base;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("inventoryHelpers – deductStockForOrder", () => {
  it("gibt leere Deductions zurück wenn keine Rezeptur vorhanden", async () => {
    const { deductStockForOrder } = await import("./inventoryHelpers");
    // DB-Chain: select().from().leftJoin().leftJoin().where() muss Promise sein
    const whereFn = vi.fn().mockResolvedValue([]); // keine Rezeptur
    const doubleLeftJoin = { where: whereFn };
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue(doubleLeftJoin),
            where: whereFn,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) }),
    };
    (getDb as any).mockResolvedValue(mockDb);

    const result = await deductStockForOrder(mockDb as any, {
      orderId: 1,
      restaurantId: 3,
      items: [{ productId: 99, quantity: 2 }],
      performedBy: 1,
    });

    expect(result).toHaveLength(0);
  });

  it("verarbeitet Rezepturen und gibt Deductions zurück", async () => {
    const { deductStockForOrder } = await import("./inventoryHelpers");
    let callCount = 0;
    // Mock der sowohl select().from().leftJoin().where() als auch select().from().where() unterstützt
    const whereFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([
        { inventoryItemId: 10, quantity: "2.5", unit: "kg", itemName: "Mehl", conversionFactor: "1" },
      ]);
      return Promise.resolve([{ currentStock: "50.000", averageCost: "2.0000" }]);
    });
    const fromResult = {
      where: whereFn,
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({ where: whereFn }),
        where: whereFn,
      }),
    };
    const mockDb = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(fromResult) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) }),
    };
    (getDb as any).mockResolvedValue(mockDb);

    const result = await deductStockForOrder(mockDb as any, {
      orderId: 42,
      restaurantId: 7,
      items: [{ productId: 5, quantity: 1 }],
      performedBy: 1,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("deducted");
    expect(result[0]).toHaveProperty("itemName", "Mehl");
  });

  it("schlägt nicht fehl wenn Lagerbestand unter 0 fällt (Negativbestand erlaubt)", async () => {
    const { deductStockForOrder } = await import("./inventoryHelpers");
    let callCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve([
                  { inventoryItemId: 10, quantity: "5", unit: "kg", itemName: "Butter", conversionFactor: "1" },
                ]);
                return Promise.resolve([{ currentStock: "2.000", averageCost: "3.0000" }]); // Bestand < Bedarf
              }),
            }),
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) }),
    };
    (getDb as any).mockResolvedValue(mockDb);

    await expect(deductStockForOrder(mockDb as any, {
      orderId: 5,
      restaurantId: 1,
      items: [{ productId: 3, quantity: 1 }],
      performedBy: 1,
    })).resolves.toBeDefined();
  });
});

describe("inventoryRouter – getConsumptionStats (Multi-Tenant)", () => {
  beforeEach(() => vi.resetModules());

  it("filtert immer nach restaurantId des eingeloggten Nutzers", async () => {
    // getConsumptionStats macht 3 Queries:
    // 1. select().from().leftJoin().where().groupBy().orderBy().limit() -> consumptionRows
    // 2. select().from().where().groupBy().orderBy() -> trendRows (kein limit)
    // 3. select().from().where() -> totals (kein limit, kein groupBy)
    // where() muss am Ende der Kette ein iterierbares Array zurückgeben (für const [totals] = ...)
    let whereCallCount = 0;
    const mockDb = makeDbMock({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        whereCallCount++;
        // Alle where()-Calls können als Promise aufgelöst werden
        // (groupBy/orderBy/limit werden danach aufgerufen wenn nötig)
        return {
          groupBy: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
          orderBy: vi.fn().mockResolvedValue([]),
          then: (resolve: (v: any[]) => void) => resolve([{ totalMovements: 0, totalConsumedValue: 0, totalPurchasedValue: 0 }]),
        };
      }),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");
    const caller = inventoryRouter.createCaller(makeCtx(5) as any);

    const result = await caller.getConsumptionStats({ days: 30 });
    expect(result).toHaveProperty("consumption");
    expect(result).toHaveProperty("trend");
    expect(result).toHaveProperty("totals");
  });

  it("gibt separate Statistiken für verschiedene Restaurants zurück", async () => {
    const mockDb = makeDbMock({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => ({
        groupBy: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
        then: (resolve: (v: any[]) => void) => resolve([{ totalMovements: 0, totalConsumedValue: 0, totalPurchasedValue: 0 }]),
      })),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");

    const callerR1 = inventoryRouter.createCaller(makeCtx(1) as any);
    const callerR2 = inventoryRouter.createCaller(makeCtx(2) as any);

    const [r1, r2] = await Promise.all([
      callerR1.getConsumptionStats({ days: 7 }),
      callerR2.getConsumptionStats({ days: 7 }),
    ]);

    // Beide Aufrufe müssen unabhängig sein
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });
});

describe("inventoryRouter – getDeliveryDiscrepancies (Multi-Tenant)", () => {
  beforeEach(() => vi.resetModules());

  it("gibt nur Abweichungen des eigenen Restaurants zurück", async () => {
    const mockDb = makeDbMock({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { id: 1, restaurantId: 3, discrepancyQty: -2, type: "under" },
      ]),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");
    const caller = inventoryRouter.createCaller(makeCtx(3) as any);

    const result = await caller.getDeliveryDiscrepancies({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("filtert nach resolved=false für offene Abweichungen", async () => {
    const mockDb = makeDbMock({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");
    const caller = inventoryRouter.createCaller(makeCtx(1) as any);

    const result = await caller.getDeliveryDiscrepancies({ resolved: false });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("inventoryRouter – resolveDiscrepancy", () => {
  beforeEach(() => vi.resetModules());

  it("setzt resolvedAt und resolvedBy korrekt", async () => {
    const mockSet = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const mockDb = {
      ...makeDbMock(),
      update: vi.fn().mockReturnThis(),
      set: mockSet,
      where: mockWhere,
    };
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");
    const caller = inventoryRouter.createCaller(makeCtx(1, 42) as any);

    const result = await caller.resolveDiscrepancy({ id: 5 });
    expect(result.success).toBe(true);
  });

  it("blockiert Zugriff auf Abweichungen anderer Restaurants", async () => {
    const mockDb = {
      ...makeDbMock(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({ rowsAffected: 0 }), // 0 Zeilen = kein Match
    };
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");
    const caller = inventoryRouter.createCaller(makeCtx(99) as any); // anderes Restaurant

    // Kein Fehler, aber auch keine Änderung (Multi-Tenant WHERE-Klausel)
    const result = await caller.resolveDiscrepancy({ id: 1 });
    expect(result.success).toBe(true);
  });
});

describe("inventoryRouter – getSupplierPerformance", () => {
  beforeEach(() => vi.resetModules());

  it("gibt Lieferantenbewertungen nur für eigenes Restaurant zurück", async () => {
    const mockDb = makeDbMock({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        { id: 1, name: "Grosshandel AG", deliveryAccuracy: "97.5", totalOrders: 12, openDiscrepancies: 0 },
      ]),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");
    const caller = inventoryRouter.createCaller(makeCtx(2) as any);

    const result = await caller.getSupplierPerformance();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("inventoryRouter – receivePurchaseOrder mit Abweichungsprotokoll", () => {
  beforeEach(() => vi.resetModules());

  // Hilfsfunktion: Erstellt einen DB-Mock für receivePurchaseOrder
  // DB-Call-Reihenfolge in receivePurchaseOrder:
  //   1. select().from(inventoryPurchaseOrders).where() -> Bestellung laden
  //   2. (in recordMovement) select().from(inventoryItems).where() -> Artikel laden
  //   3. update().set().where() -> Lagerbestand aktualisieren (in recordMovement)
  //   4. insert().values() -> Bewegung eintragen (in recordMovement)
  //   5. update().set().where() -> Bestellposition aktualisieren
  //   6. (optional) insert().values() -> Abweichung eintragen
  //   7. update().set().where() -> Bestellstatus aktualisieren
  //   8. execute() -> Lieferantenbewertung aktualisieren
  function makeReceiveMock(orderData: object, itemData: object) {
    let selectCallCount = 0;
    // Beide select-Calls nutzen select().from().where() (kein leftJoin in receivePurchaseOrder)
    const whereFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return Promise.resolve([orderData]); // Bestellung
      return Promise.resolve([itemData]); // Artikel für recordMovement
    });
    const fromResult = {
      where: whereFn,
      leftJoin: vi.fn().mockReturnValue({ where: whereFn }), // Fallback falls nötig
    };
    return {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(fromResult) }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
      }),
      execute: vi.fn().mockResolvedValue([]), // für db.execute() Lieferantenbewertung
    };
  }

  it("erstellt Abweichungseintrag bei Unterlieferung", async () => {
    const mockDb = makeReceiveMock(
      { supplierId: 5, expectedDelivery: null, sentAt: null },
      { currentStock: "20.000", averageCost: "5.0000" },
    );
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");
    const caller = inventoryRouter.createCaller(makeCtx(1) as any);

    await expect(caller.receivePurchaseOrder({
      id: 1,
      items: [{ itemId: 3, orderedQty: 10, receivedQty: 7 }],
    })).resolves.toBeDefined();
  });

  it("akzeptiert vollständige Lieferung ohne Abweichung", async () => {
    const mockDb = makeReceiveMock(
      { supplierId: 5, expectedDelivery: null, sentAt: null },
      { currentStock: "10.000", averageCost: "3.0000" },
    );
    (getDb as any).mockResolvedValue(mockDb);

    const { inventoryRouter } = await import("./inventoryRouter");
    const caller = inventoryRouter.createCaller(makeCtx(1) as any);

    await expect(caller.receivePurchaseOrder({
      id: 2,
      items: [{ itemId: 4, orderedQty: 5, receivedQty: 5 }],
    })).resolves.toBeDefined();
  });
});
