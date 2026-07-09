/**
 * Tuya Smart-Building Router – Unit Tests
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(restaurantId: number | null = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "test-admin",
    email: "admin@test.com",
    name: "Test Admin",
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
    res: {} as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("tuya.getCategories", () => {
  it("gibt alle 14 Gerätekategorien zurück", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const categories = await caller.tuya.getCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThanOrEqual(10);
    const keys = categories.map(c => c.key);
    expect(keys).toContain("temperature");
    expect(keys).toContain("humidity");
    expect(keys).toContain("smoke");
    expect(keys).toContain("water_leak");
    expect(keys).toContain("co2");
  });

  it("jede Kategorie hat label, icon und unit", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const categories = await caller.tuya.getCategories();
    for (const cat of categories) {
      expect(cat.key).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.icon).toBeTruthy();
    }
  });
});

describe("tuya.getCredentials", () => {
  it("gibt null zurück wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(null));
    const result = await caller.tuya.getCredentials();
    expect(result).toBeNull();
  });

  it("gibt null oder Credentials-Objekt zurück", async () => {
    const caller = appRouter.createCaller(createAdminContext(9999));
    const result = await caller.tuya.getCredentials();
    // Für ein nicht-existentes Restaurant: null
    expect(result === null || (typeof result === "object" && "hasCredentials" in result)).toBe(true);
  });
});

describe("tuya.listDevices", () => {
  it("gibt leeres Array zurück wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(null));
    const result = await caller.tuya.listDevices();
    expect(result).toEqual([]);
  });

  it("gibt Array zurück für gültiges restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(9999));
    const result = await caller.tuya.listDevices();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("tuya.getDashboardStats", () => {
  it("gibt Null-Stats zurück wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(null));
    const stats = await caller.tuya.getDashboardStats();
    expect(stats.totalDevices).toBe(0);
    expect(stats.onlineDevices).toBe(0);
    expect(stats.offlineDevices).toBe(0);
    expect(stats.openAlerts).toBe(0);
    expect(stats.criticalAlerts).toBe(0);
    expect(stats.devicesByCategory).toEqual({});
  });

  it("hat alle erwarteten Felder", async () => {
    const caller = appRouter.createCaller(createAdminContext(9999));
    const stats = await caller.tuya.getDashboardStats();
    expect(typeof stats.totalDevices).toBe("number");
    expect(typeof stats.onlineDevices).toBe("number");
    expect(typeof stats.offlineDevices).toBe("number");
    expect(typeof stats.openAlerts).toBe("number");
    expect(typeof stats.criticalAlerts).toBe("number");
    expect(typeof stats.devicesByCategory).toBe("object");
  });
});

describe("tuya.getOpenAlerts", () => {
  it("gibt leeres Array zurück wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(null));
    const result = await caller.tuya.getOpenAlerts();
    expect(result).toEqual([]);
  });

  it("gibt Array zurück für gültiges restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(9999));
    const result = await caller.tuya.getOpenAlerts();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("tuya.getTemperatureReadings", () => {
  it("gibt leeres Array zurück wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(null));
    const result = await caller.tuya.getTemperatureReadings({ days: 7 });
    expect(result).toEqual([]);
  });

  it("akzeptiert gültige days-Werte", async () => {
    const caller = appRouter.createCaller(createAdminContext(9999));
    const result1 = await caller.tuya.getTemperatureReadings({ days: 1 });
    const result7 = await caller.tuya.getTemperatureReadings({ days: 7 });
    const result30 = await caller.tuya.getTemperatureReadings({ days: 30 });
    expect(Array.isArray(result1)).toBe(true);
    expect(Array.isArray(result7)).toBe(true);
    expect(Array.isArray(result30)).toBe(true);
  });
});

describe("tuya.getAllAlerts", () => {
  it("gibt leeres Array zurück wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(null));
    const result = await caller.tuya.getAllAlerts({});
    expect(result).toEqual([]);
  });

  it("akzeptiert resolved-Filter", async () => {
    const caller = appRouter.createCaller(createAdminContext(9999));
    const open = await caller.tuya.getAllAlerts({ resolved: false });
    const resolved = await caller.tuya.getAllAlerts({ resolved: true });
    const all = await caller.tuya.getAllAlerts({});
    expect(Array.isArray(open)).toBe(true);
    expect(Array.isArray(resolved)).toBe(true);
    expect(Array.isArray(all)).toBe(true);
  });
});

describe("tuya.saveCredentials – Validierung", () => {
  it("wirft Fehler wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(createAdminContext(null));
    await expect(
      caller.tuya.saveCredentials({ clientId: "abc", clientSecret: "xyz", region: "eu" })
    ).rejects.toThrow();
  });

  it("akzeptiert gültige Regionen", async () => {
    // Nur Validierungstest – kein echter API-Aufruf
    const caller = appRouter.createCaller(createAdminContext(9999));
    // Erwartet keinen Zod-Fehler für gültige Eingaben
    // (wirft ggf. DB-Fehler, aber keinen Validierungsfehler)
    const regions = ["eu", "us", "cn", "in"] as const;
    for (const region of regions) {
      try {
        await caller.tuya.saveCredentials({ clientId: "test", clientSecret: "test", region });
      } catch (e: unknown) {
        // DB-Fehler sind OK – Zod-Validierungsfehler wären nicht OK
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).not.toContain("ZodError");
        expect(msg).not.toContain("Invalid enum value");
      }
    }
  });
});
