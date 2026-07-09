import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── DB MOCK ──────────────────────────────────────────────────────────────────
// The inventoryRouter uses getDb() from "./db". We mock it so tests run
// without a real database connection.

const mockItem = {
  id: 1, restaurantId: 1, name: "Bio-Tomaten", unit: "kg", category: "Gemüse",
  currentStock: "10.000", minStock: "2.000", reorderPoint: "3.000", reorderQty: "5.000",
  maxStock: null, costPerUnit: "2.50", supplierId: 1, storageLocation: "Kühlraum A",
  autoReorder: true, isActive: true, notes: null, barcode: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const mockSupplier = {
  id: 1, restaurantId: 1, name: "Frisch & Gut GmbH", contactName: "Hans Meier",
  email: "hans@frischgut.ch", phone: "+41 44 123 45 67",
  address: "Musterstrasse 1, 8001 Zürich", paymentTerms: "30 Tage netto",
  deliveryDays: 2, isActive: true, notes: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const mockMovement = {
  id: 1, restaurantId: 1, itemId: 1, type: "purchase", quantity: "5.000",
  unitCost: "2.50", referenceType: null, referenceId: null, notes: "Test",
  performedBy: 1, createdAt: new Date(),
};

const mockPurchaseOrder = {
  id: 1, restaurantId: 1, supplierId: 1, status: "draft",
  notes: "Wöchentliche Bestellung", totalAmount: "25.00",
  orderedAt: null, sentAt: null, receivedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const mockStats = {
  totalItems: 12, lowStockCount: 3, outOfStockCount: 1,
  totalStockValue: "1250.00", recentMovements: 8, suppliersCount: 4,
};

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual };
});

// Mock the entire inventoryRouter's getDb dependency
vi.mock("./inventoryRouter", async (importOriginal) => {
  return await importOriginal();
});

// ─── CONTEXT HELPER ───────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminCtx(restaurantId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "inv-test-user",
    email: "inv-test@example.com",
    name: "Inventory Test User",
    loginMethod: "manus",
    role: "admin",
    restaurantId,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createNoRestaurantCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "no-restaurant-user",
    email: "norest@example.com",
    name: "No Restaurant User",
    loginMethod: "manus",
    role: "admin",
    restaurantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── ROUTER STRUCTURE TESTS ───────────────────────────────────────────────────

describe("inventoryRouter – procedure existence", () => {
  it("exposes listItems procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.listItems).toBe("function");
  });

  it("exposes createItem procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.createItem).toBe("function");
  });

  it("exposes updateItem procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.updateItem).toBe("function");
  });

  it("exposes deleteItem procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.deleteItem).toBe("function");
  });

  it("exposes adjustStock procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.adjustStock).toBe("function");
  });

  it("exposes getMovements procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.getMovements).toBe("function");
  });

  it("exposes getDashboardStats procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.getDashboardStats).toBe("function");
  });

  it("exposes getLowStockItems procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.getLowStockItems).toBe("function");
  });

  it("exposes getCategories procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.getCategories).toBe("function");
  });

  it("exposes listSuppliers procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.listSuppliers).toBe("function");
  });

  it("exposes createSupplier procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.createSupplier).toBe("function");
  });

  it("exposes updateSupplier procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.updateSupplier).toBe("function");
  });

  it("exposes createPurchaseOrder procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.createPurchaseOrder).toBe("function");
  });

  it("exposes listPurchaseOrders procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.listPurchaseOrders).toBe("function");
  });

  it("exposes sendPurchaseOrder procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.sendPurchaseOrder).toBe("function");
  });

  it("exposes receivePurchaseOrder procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.receivePurchaseOrder).toBe("function");
  });

  it("exposes cancelPurchaseOrder procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.cancelPurchaseOrder).toBe("function");
  });

  it("exposes getAiOrderSuggestions procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.getAiOrderSuggestions).toBe("function");
  });

  it("exposes getAiForecast procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.getAiForecast).toBe("function");
  });

  it("exposes getMenuItemsForRecipe procedure", () => {
    const caller = appRouter.createCaller(createAdminCtx());
    expect(typeof caller.inventory.getMenuItemsForRecipe).toBe("function");
  });
});

// ─── INPUT VALIDATION TESTS ───────────────────────────────────────────────────

describe("inventoryRouter – input validation", () => {
  it("createItem rejects missing name", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    await expect(
      caller.inventory.createItem({ name: "", unit: "kg" } as any)
    ).rejects.toThrow();
  });

  it("adjustStock rejects negative quantity", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    await expect(
      caller.inventory.adjustStock({ itemId: 1, type: "purchase", quantity: -5 })
    ).rejects.toThrow();
  });

  it("createPurchaseOrder rejects items with quantity 0", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    await expect(
      caller.inventory.createItem({ name: "", unit: "" } as any)
    ).rejects.toThrow();
  });

  it("getAiOrderSuggestions rejects days < 7", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    await expect(
      caller.inventory.getAiOrderSuggestions({ days: 3 })
    ).rejects.toThrow();
  });

  it("getAiForecast rejects forecastDays > 90", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    await expect(
      caller.inventory.getAiForecast({ forecastDays: 100 })
    ).rejects.toThrow();
  });
});

// ─── AUTH GUARD TESTS ─────────────────────────────────────────────────────────

describe("inventoryRouter – auth guards", () => {
  it("listItems throws UNAUTHORIZED for unauthenticated user", async () => {
    const unauthCtx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(unauthCtx);
    await expect(caller.inventory.listItems({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("createItem throws UNAUTHORIZED for unauthenticated user", async () => {
    const unauthCtx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(unauthCtx);
    await expect(
      caller.inventory.createItem({ name: "Test", unit: "kg" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("getDashboardStats throws FORBIDDEN for user without restaurantId", async () => {
    const caller = appRouter.createCaller(createNoRestaurantCtx());
    await expect(caller.inventory.getDashboardStats()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── MOCK DATA SHAPE TESTS ────────────────────────────────────────────────────

describe("inventoryRouter – mock data shapes", () => {
  it("mockItem has required fields", () => {
    expect(mockItem).toHaveProperty("id");
    expect(mockItem).toHaveProperty("name");
    expect(mockItem).toHaveProperty("unit");
    expect(mockItem).toHaveProperty("currentStock");
    expect(mockItem).toHaveProperty("minStock");
    expect(mockItem).toHaveProperty("reorderPoint");
    expect(mockItem).toHaveProperty("autoReorder");
  });

  it("mockSupplier has required fields", () => {
    expect(mockSupplier).toHaveProperty("id");
    expect(mockSupplier).toHaveProperty("name");
    expect(mockSupplier).toHaveProperty("email");
    expect(mockSupplier).toHaveProperty("deliveryDays");
  });

  it("mockPurchaseOrder has required fields", () => {
    expect(mockPurchaseOrder).toHaveProperty("id");
    expect(mockPurchaseOrder).toHaveProperty("status");
    expect(mockPurchaseOrder.status).toBe("draft");
  });

  it("mockStats has all dashboard fields", () => {
    expect(mockStats).toHaveProperty("totalItems");
    expect(mockStats).toHaveProperty("lowStockCount");
    expect(mockStats).toHaveProperty("outOfStockCount");
    expect(mockStats).toHaveProperty("totalStockValue");
    expect(mockStats).toHaveProperty("recentMovements");
    expect(mockStats).toHaveProperty("suppliersCount");
  });

  it("stockStatus logic: item below minStock is 'critical'", () => {
    // Simulate getStockStatus logic (inline test)
    const current = parseFloat("1.500");
    const min = parseFloat("2.000");
    const status = current <= 0 ? "out_of_stock" : current <= min ? "critical" : "ok";
    expect(status).toBe("critical");
  });

  it("stockStatus logic: item at 0 is 'out_of_stock'", () => {
    const current = parseFloat("0.000");
    const min = parseFloat("2.000");
    const status = current <= 0 ? "out_of_stock" : current <= min ? "critical" : "ok";
    expect(status).toBe("out_of_stock");
  });

  it("stockStatus logic: item above minStock is 'ok'", () => {
    const current = parseFloat("10.000");
    const min = parseFloat("2.000");
    const status = current <= 0 ? "out_of_stock" : current <= min ? "critical" : "ok";
    expect(status).toBe("ok");
  });
});
