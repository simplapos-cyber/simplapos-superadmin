/**
 * Tests für den Tischplan-Offline-Cache.
 * Prüft, dass die localStorage-Cache-Logik korrekt funktioniert.
 */
import { describe, it, expect, beforeEach } from "vitest";

// Simuliert die Cache-Logik aus Waiter_tables.tsx und OrderView.tsx
function getFloorPlanFromCache(cacheKey: string, storage: Record<string, string>): unknown[] {
  try {
    const cached = storage[cacheKey];
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

function saveFloorPlanToCache(cacheKey: string, data: unknown[], storage: Record<string, string>): void {
  if (data && data.length > 0) {
    try {
      storage[cacheKey] = JSON.stringify(data);
    } catch {
      // ignore
    }
  }
}

describe("Tischplan Offline-Cache", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
  });

  it("gibt leeres Array zurück wenn kein Cache vorhanden", () => {
    const result = getFloorPlanFromCache("cachedFloorPlan_1", storage);
    expect(result).toEqual([]);
  });

  it("speichert Tischplan-Daten im Cache", () => {
    const planGroups = [
      {
        planId: 1,
        planName: "Erdgeschoss",
        tables: [
          { id: 1, label: "Tisch 1", sourceType: "floor_plan", currentOrder: null },
          { id: 2, label: "Tisch 2", sourceType: "floor_plan", currentOrder: null },
        ],
      },
    ];
    saveFloorPlanToCache("cachedFloorPlan_1", planGroups, storage);
    expect(storage["cachedFloorPlan_1"]).toBeDefined();
  });

  it("lädt gecachte Tischplan-Daten korrekt", () => {
    const planGroups = [
      {
        planId: 1,
        planName: "Erdgeschoss",
        tables: [
          { id: 1, label: "Tisch 1", sourceType: "floor_plan", currentOrder: null },
          { id: 2, label: "Tisch 2", sourceType: "floor_plan", currentOrder: null },
        ],
      },
    ];
    saveFloorPlanToCache("cachedFloorPlan_1", planGroups, storage);
    const result = getFloorPlanFromCache("cachedFloorPlan_1", storage);
    expect(result).toHaveLength(1);
    expect((result[0] as any).planName).toBe("Erdgeschoss");
    expect((result[0] as any).tables).toHaveLength(2);
  });

  it("speichert nicht wenn planGroups leer ist", () => {
    saveFloorPlanToCache("cachedFloorPlan_1", [], storage);
    expect(storage["cachedFloorPlan_1"]).toBeUndefined();
  });

  it("gibt leeres Array zurück bei ungültigem JSON im Cache", () => {
    storage["cachedFloorPlan_1"] = "invalid-json{{{";
    const result = getFloorPlanFromCache("cachedFloorPlan_1", storage);
    expect(result).toEqual([]);
  });

  it("verwendet restaurantId-spezifischen Cache-Key", () => {
    const planGroups1 = [{ planId: 1, planName: "Restaurant 1", tables: [{ id: 1, label: "T1" }] }];
    const planGroups2 = [{ planId: 2, planName: "Restaurant 2", tables: [{ id: 10, label: "T10" }, { id: 11, label: "T11" }] }];

    saveFloorPlanToCache("cachedFloorPlan_1", planGroups1, storage);
    saveFloorPlanToCache("cachedFloorPlan_2", planGroups2, storage);

    const result1 = getFloorPlanFromCache("cachedFloorPlan_1", storage);
    const result2 = getFloorPlanFromCache("cachedFloorPlan_2", storage);

    expect((result1[0] as any).planName).toBe("Restaurant 1");
    expect((result2[0] as any).planName).toBe("Restaurant 2");
    expect((result2[0] as any).tables).toHaveLength(2);
  });

  it("überschreibt alten Cache mit neuen Daten", () => {
    const oldData = [{ planId: 1, tables: [{ id: 1, label: "Alt" }] }];
    const newData = [{ planId: 1, tables: [{ id: 1, label: "Neu" }, { id: 2, label: "Neu2" }] }];

    saveFloorPlanToCache("cachedFloorPlan_1", oldData, storage);
    saveFloorPlanToCache("cachedFloorPlan_1", newData, storage);

    const result = getFloorPlanFromCache("cachedFloorPlan_1", storage);
    expect((result[0] as any).tables).toHaveLength(2);
    expect((result[0] as any).tables[0].label).toBe("Neu");
  });
});
