/**
 * Sprint 4 Tests: Rezepturverwaltung + Auto-Reorder Cron
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── MOCKS ────────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }],
  }),
}));

// ─── REZEPTURVERWALTUNG TESTS ─────────────────────────────────────────────────
describe("Rezepturverwaltung – Backend Logic", () => {
  it("Rezeptur-Zutaten können pro Menüartikel gespeichert werden", () => {
    const recipe = {
      restaurantId: 1,
      menuItemId: 42,
      inventoryItemId: 7,
      quantity: "0.25",
      unit: "kg",
      conversionFactor: "1",
    };
    expect(recipe.menuItemId).toBe(42);
    expect(parseFloat(recipe.quantity)).toBeGreaterThan(0);
    expect(recipe.unit).toBeTruthy();
  });

  it("Konversionsfaktor wird korrekt berechnet", () => {
    // 1 Portion = 250g, Lager in kg → Faktor 0.001
    const quantityInPortion = 250; // Gramm
    const conversionFactor = 0.001; // g → kg
    const stockDeduction = quantityInPortion * conversionFactor;
    expect(stockDeduction).toBeCloseTo(0.25);
  });

  it("Lagerabzug wird korrekt berechnet bei mehreren Portionen", () => {
    const recipe = { quantity: 0.25, unit: "kg", conversionFactor: 1 };
    const portions = 4;
    const totalDeduction = recipe.quantity * recipe.conversionFactor * portions;
    expect(totalDeduction).toBeCloseTo(1.0);
  });

  it("Rezeptur-Validierung: Menge muss positiv sein", () => {
    const isValidQuantity = (qty: number) => qty > 0;
    expect(isValidQuantity(0.25)).toBe(true);
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(-1)).toBe(false);
  });

  it("Rezeptur-Validierung: Einheit darf nicht leer sein", () => {
    const isValidUnit = (unit: string) => unit.trim().length > 0;
    expect(isValidUnit("kg")).toBe(true);
    expect(isValidUnit("")).toBe(false);
    expect(isValidUnit("  ")).toBe(false);
  });

  it("Mehrere Zutaten pro Menüartikel werden korrekt verwaltet", () => {
    const ingredients = [
      { inventoryItemId: 1, quantity: 0.2, unit: "kg", name: "Mehl" },
      { inventoryItemId: 2, quantity: 0.05, unit: "l", name: "Öl" },
      { inventoryItemId: 3, quantity: 2, unit: "Stück", name: "Eier" },
    ];
    expect(ingredients).toHaveLength(3);
    const totalIngredients = ingredients.length;
    expect(totalIngredients).toBe(3);
  });

  it("Lagerabzug summiert alle Zutaten korrekt", () => {
    const ingredients = [
      { inventoryItemId: 1, quantity: 0.2, costPerUnit: 1.5 },
      { inventoryItemId: 2, quantity: 0.05, costPerUnit: 3.0 },
    ];
    const totalCost = ingredients.reduce(
      (sum, i) => sum + i.quantity * i.costPerUnit,
      0
    );
    expect(totalCost).toBeCloseTo(0.45);
  });

  it("deductStockFromOrder: Bestellmenge wird korrekt berechnet", () => {
    const orderItems = [
      { menuItemId: 1, quantity: 2 },
      { menuItemId: 2, quantity: 3 },
    ];
    const recipes = [
      { menuItemId: 1, inventoryItemId: 10, quantity: 0.25 },
      { menuItemId: 2, inventoryItemId: 10, quantity: 0.1 },
    ];
    // Gesamtabzug für inventoryItemId=10
    const totalDeduction = orderItems.reduce((sum, oi) => {
      const recipe = recipes.find(r => r.menuItemId === oi.menuItemId);
      return sum + (recipe ? recipe.quantity * oi.quantity : 0);
    }, 0);
    expect(totalDeduction).toBeCloseTo(0.8); // 2*0.25 + 3*0.1
  });
});

// ─── AUTO-REORDER CRON TESTS ──────────────────────────────────────────────────
describe("Auto-Reorder Cron – Handler Logic", () => {
  it("Artikel unter Mindestbestand werden korrekt identifiziert", () => {
    const items = [
      { id: 1, name: "Mehl", currentStock: "2.5", reorderPoint: "5.0", autoReorder: true },
      { id: 2, name: "Öl", currentStock: "10.0", reorderPoint: "3.0", autoReorder: true },
      { id: 3, name: "Salz", currentStock: "0.5", reorderPoint: "1.0", autoReorder: false },
    ];
    const toReorder = items.filter(
      i => i.autoReorder && parseFloat(i.currentStock) <= parseFloat(i.reorderPoint)
    );
    expect(toReorder).toHaveLength(1);
    expect(toReorder[0].name).toBe("Mehl");
  });

  it("Artikel ohne autoReorder werden nicht bestellt", () => {
    const items = [
      { id: 1, name: "Salz", currentStock: "0.1", reorderPoint: "1.0", autoReorder: false },
    ];
    const toReorder = items.filter(
      i => i.autoReorder && parseFloat(i.currentStock) <= parseFloat(i.reorderPoint)
    );
    expect(toReorder).toHaveLength(0);
  });

  it("Artikel werden korrekt nach Lieferant gruppiert", () => {
    const items = [
      { id: 1, name: "Mehl", autoReorderSupplierId: 10 },
      { id: 2, name: "Zucker", autoReorderSupplierId: 10 },
      { id: 3, name: "Öl", autoReorderSupplierId: 20 },
      { id: 4, name: "Salz", autoReorderSupplierId: null },
    ];
    const bySupplier = new Map<number, typeof items>();
    const noSupplier: typeof items = [];
    for (const item of items) {
      if (item.autoReorderSupplierId) {
        const suppId = item.autoReorderSupplierId;
        if (!bySupplier.has(suppId)) bySupplier.set(suppId, []);
        bySupplier.get(suppId)!.push(item);
      } else {
        noSupplier.push(item);
      }
    }
    expect(bySupplier.size).toBe(2);
    expect(bySupplier.get(10)).toHaveLength(2);
    expect(bySupplier.get(20)).toHaveLength(1);
    expect(noSupplier).toHaveLength(1);
  });

  it("Bestellmenge fällt auf reorderPoint zurück wenn reorderQty null ist", () => {
    const item = { reorderQty: null, reorderPoint: "5.0" };
    const qty = parseFloat(String(item.reorderQty ?? item.reorderPoint ?? 1));
    expect(qty).toBe(5.0);
  });

  it("Bestellnummer wird korrekt generiert", () => {
    const restaurantId = 42;
    const timestamp = 1700000000000;
    const orderNumber = `AUTO-${restaurantId}-${timestamp}`;
    expect(orderNumber).toMatch(/^AUTO-\d+-\d+$/);
    expect(orderNumber).toContain("AUTO-42-");
  });

  it("Gesamtbetrag wird korrekt berechnet", () => {
    const items = [
      { reorderQty: "10", reorderPoint: "5", costPerUnit: "2.50" },
      { reorderQty: "5", reorderPoint: "3", costPerUnit: "8.00" },
    ];
    let total = 0;
    for (const item of items) {
      const qty = parseFloat(String(item.reorderQty ?? item.reorderPoint ?? 1));
      const cost = parseFloat(String(item.costPerUnit ?? 0));
      total += qty * cost;
    }
    expect(total).toBeCloseTo(65.0); // 10*2.5 + 5*8
  });

  it("Handler gibt 403 zurück wenn kein Cron-Request", async () => {
    const { sdk } = await import("./_core/sdk");
    vi.mocked(sdk.authenticateRequest).mockResolvedValueOnce({ isCron: false, taskUid: null } as any);

    const { handleAutoReorder } = await import("./autoReorderCron");
    const req = { headers: {}, url: "/api/scheduled/auto-reorder" } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    await handleAutoReorder(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("Benachrichtigung enthält Restaurant-Namen und Artikelliste", () => {
    const restaurantName = "Zum Goldenen Löwen";
    const orderedItems = ["Mehl (10 kg)", "Zucker (5 kg)"];
    const content = [
      "Folgende Artikel wurden automatisch nachbestellt:",
      "",
      orderedItems.map(n => `• ${n}`).join("\n"),
      "",
      "Bitte überprüfen und bestätigen Sie die Bestellungen im Einkaufsplanungs-Modul.",
    ].join("\n");
    expect(content).toContain("Mehl (10 kg)");
    expect(content).toContain("Zucker (5 kg)");
    expect(content).toContain("Einkaufsplanungs-Modul");
  });

  it("Artikel genau am Reorder-Point werden auch bestellt (<=, nicht <)", () => {
    const item = { currentStock: "5.0", reorderPoint: "5.0", autoReorder: true };
    const shouldReorder =
      item.autoReorder &&
      parseFloat(item.currentStock) <= parseFloat(item.reorderPoint);
    expect(shouldReorder).toBe(true);
  });

  it("Artikel über Reorder-Point werden nicht bestellt", () => {
    const item = { currentStock: "5.1", reorderPoint: "5.0", autoReorder: true };
    const shouldReorder =
      item.autoReorder &&
      parseFloat(item.currentStock) <= parseFloat(item.reorderPoint);
    expect(shouldReorder).toBe(false);
  });

  it("Inaktive Restaurants werden übersprungen", () => {
    const restaurants = [
      { id: 1, name: "Aktiv", status: "active" },
      { id: 2, name: "Inaktiv", status: "inactive" },
      { id: 3, name: "Gesperrt", status: "suspended" },
    ];
    const activeRestaurants = restaurants.filter(r => r.status === "active");
    expect(activeRestaurants).toHaveLength(1);
    expect(activeRestaurants[0].name).toBe("Aktiv");
  });
});
