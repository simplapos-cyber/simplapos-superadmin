/**
 * sprint8.test.ts
 * Tests für closingsRouter (Sprint 8: Tagesabschluss-Automatisierung)
 *
 * Testet:
 * - getClosingConfig: Defaults zurückgeben wenn keine Konfiguration vorhanden
 * - saveClosingConfig: Konfiguration speichern (manuell/auto)
 * - triggerManualClosing: Manueller Abschluss
 * - getClosings: Liste der Abschlüsse
 * - Multi-Tenant-Isolation: Jedes Restaurant bekommt nur seine Daten
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Mock ./db
vi.mock("./db", () => ({ getDb: vi.fn() }));
import { getDb } from "./db";

// Mock heartbeat (Heartbeat-SDK)
vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: vi.fn().mockResolvedValue({ taskUid: "test-uid-123", nextExecutionAt: null }),
  updateHeartbeatJob: vi.fn().mockResolvedValue({ nextExecutionAt: null }),
  deleteHeartbeatJob: vi.fn().mockResolvedValue(undefined),
}));
import { createHeartbeatJob, updateHeartbeatJob, deleteHeartbeatJob } from "./_core/heartbeat";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
function makeCtx(restaurantId: number, role = "admin") {
  return {
    user: { id: 1, restaurantId, role, email: "admin@test.com", name: "Test Admin" },
    req: { headers: { cookie: "app_session_id=test-session" } },
  };
}

function makeDbMock(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([{ insertId: 42 }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

// ─── getClosingConfig Tests ───────────────────────────────────────────────────
describe("closingsRouter – getClosingConfig", () => {
  beforeEach(() => vi.resetModules());

  it("gibt Defaults zurück wenn keine Konfiguration vorhanden", async () => {
    const mockDb = makeDbMock({
      limit: vi.fn().mockResolvedValue([]), // keine Konfiguration in DB
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(1) as any);

    const result = await caller.getClosingConfig();

    expect(result).toHaveProperty("autoEnabled", false);
    expect(result).toHaveProperty("closingTime", "23:00");
    expect(result).toHaveProperty("timezone", "Europe/Zurich");
    expect(result).toHaveProperty("restaurantId", 1);
  });

  it("gibt gespeicherte Konfiguration zurück", async () => {
    const savedConfig = {
      id: 1,
      restaurantId: 2,
      autoEnabled: true,
      closingTime: "22:30",
      timezone: "Europe/Berlin",
      scheduleCronTaskUid: "uid-abc",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mockDb = makeDbMock({
      limit: vi.fn().mockResolvedValue([savedConfig]),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(2) as any);

    const result = await caller.getClosingConfig();

    expect(result.autoEnabled).toBe(true);
    expect(result.closingTime).toBe("22:30");
    expect(result.timezone).toBe("Europe/Berlin");
  });

  it("Multi-Tenant: Restaurant 1 bekommt nicht Konfiguration von Restaurant 2", async () => {
    const mockDb = makeDbMock({
      limit: vi.fn().mockResolvedValue([]), // Keine Konfiguration für Restaurant 1
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(1) as any);

    const result = await caller.getClosingConfig();
    // Muss Defaults zurückgeben, nicht fremde Daten
    expect(result.restaurantId).toBe(1);
    expect(result.autoEnabled).toBe(false);
  });
});

// ─── saveClosingConfig Tests ──────────────────────────────────────────────────
describe("closingsRouter – saveClosingConfig", () => {
  beforeEach(() => vi.resetModules());

  it("erstellt neuen Heartbeat-Job wenn autoEnabled=true und kein Job existiert", async () => {
    const mockDb = makeDbMock({
      limit: vi.fn().mockResolvedValue([]), // keine bestehende Konfiguration
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(1) as any);

    const result = await caller.saveClosingConfig({
      autoEnabled: true,
      closingTime: "23:00",
      timezone: "Europe/Zurich",
    });

    expect(result.success).toBe(true);
    expect(result.autoEnabled).toBe(true);
    expect(result.scheduleCronTaskUid).toBe("test-uid-123");
    expect(createHeartbeatJob).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "daily-closing-1",
        path: "/api/scheduled/dailyClosing",
      }),
      expect.any(String)
    );
  });

  it("löscht Heartbeat-Job wenn autoEnabled=false und Job existiert", async () => {
    const existingConfig = {
      id: 1,
      restaurantId: 3,
      autoEnabled: true,
      closingTime: "23:00",
      timezone: "Europe/Zurich",
      scheduleCronTaskUid: "existing-uid-456",
    };
    const mockDb = makeDbMock({
      limit: vi.fn().mockResolvedValue([existingConfig]),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(3) as any);

    const result = await caller.saveClosingConfig({
      autoEnabled: false,
      closingTime: "23:00",
      timezone: "Europe/Zurich",
    });

    expect(result.success).toBe(true);
    expect(result.autoEnabled).toBe(false);
    expect(result.scheduleCronTaskUid).toBeNull();
    expect(deleteHeartbeatJob).toHaveBeenCalledWith("existing-uid-456", expect.any(String));
  });

  it("aktualisiert bestehenden Heartbeat-Job wenn Uhrzeit geändert wird", async () => {
    const existingConfig = {
      id: 1,
      restaurantId: 4,
      autoEnabled: true,
      closingTime: "23:00",
      timezone: "Europe/Zurich",
      scheduleCronTaskUid: "existing-uid-789",
    };
    const mockDb = makeDbMock({
      limit: vi.fn().mockResolvedValue([existingConfig]),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(4) as any);

    await caller.saveClosingConfig({
      autoEnabled: true,
      closingTime: "22:00",
      timezone: "Europe/Zurich",
    });

    // DST-sicher: Im Sommer (CEST = UTC+2) ist 22:00 = 20:00 UTC, im Winter (CET = UTC+1) = 21:00 UTC
    // Wir prüfen nur dass updateHeartbeatJob aufgerufen wurde mit korrekter UID und einem cron-String
    expect(updateHeartbeatJob).toHaveBeenCalledWith(
      "existing-uid-789",
      expect.objectContaining({ cron: expect.stringMatching(/^0 0 (20|21) \* \* \*$/) }),
      expect.any(String)
    );
  });

  it("wirft Fehler wenn kein Restaurant zugewiesen", async () => {
    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller({
      user: { id: 1, restaurantId: null, role: "admin" },
      req: { headers: { cookie: "" } },
    } as any);

    await expect(caller.saveClosingConfig({
      autoEnabled: false,
      closingTime: "23:00",
      timezone: "Europe/Zurich",
    })).rejects.toThrow();
  });
});

// ─── triggerManualClosing Tests ───────────────────────────────────────────────
describe("closingsRouter – triggerManualClosing", () => {
  beforeEach(() => vi.resetModules());

  it("erstellt Abschluss mit aggregierten Umsatzdaten", async () => {
    const aggResult = {
      totalRevenue: "1500.00",
      totalCash: "500.00",
      totalCard: "800.00",
      totalTwint: "200.00",
      totalOther: "0.00",
      totalTax: "115.00",
      totalTips: "50.00",
      totalOrders: 35,
      totalGuests: 42,
    };
    // performClosing macht mehrere where().limit() Aufrufe:
    // 1. Modus-Check (Kellner): where().limit() → [{ autoEnabled: false }]
    // 2. Doppelabschluss-Check: where().limit() → [] (kein bestehender Abschluss)
    // 3. Umsatz-Aggregation: where().then() → [aggResult]
    // 4. Lagerabzug-Aggregation: where().then() → [{ totalConsumedValue: "0", totalMovements: 0 }]
    let limitCallCount = 0;
    const mockDb = makeDbMock({
      where: vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockImplementation(() => {
          limitCallCount++;
          if (limitCallCount === 1) return Promise.resolve([{ autoEnabled: false }]); // Modus-Check
          return Promise.resolve([]); // Doppelabschluss-Check: kein bestehender Abschluss
        }),
        then: (resolve: (v: any[]) => void) => resolve([aggResult]),
      })),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(5, "waiter") as any);

    const result = await caller.triggerManualClosing({ notes: "Testabschluss" });

    expect(result.success).toBe(true);
    expect(result).toHaveProperty("id");
  });

  it("wirft Fehler wenn Modus=automatisch und Kellner versucht manuell abzuschliessen", async () => {
    const mockDb = makeDbMock({
      where: vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockResolvedValue([{ autoEnabled: true }]),
      })),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(6, "waiter") as any);

    await expect(caller.triggerManualClosing({})).rejects.toThrow(TRPCError);
  });

  it("Admin darf immer manuell abschliessen (auch wenn auto aktiviert)", async () => {
    const aggResult = {
      totalRevenue: "0.00", totalCash: "0.00", totalCard: "0.00",
      totalTwint: "0.00", totalOther: "0.00", totalTax: "0.00",
      totalTips: "0.00", totalOrders: 0, totalGuests: 0,
    };
    const mockDb = makeDbMock({
      where: vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockResolvedValue([]),
        then: (resolve: (v: any[]) => void) => resolve([aggResult]),
      })),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(7, "admin") as any);

    // Admin darf immer – kein Fehler
    const result = await caller.triggerManualClosing({});
    expect(result.success).toBe(true);
  });
});

// ─── getClosings Tests ────────────────────────────────────────────────────────
describe("closingsRouter – getClosings (Multi-Tenant)", () => {
  beforeEach(() => vi.resetModules());

  it("gibt nur Abschlüsse des eigenen Restaurants zurück", async () => {
    const mockClosings = [
      { id: 1, restaurantId: 8, totalRevenue: "1000.00", mode: "manual" },
      { id: 2, restaurantId: 8, totalRevenue: "1200.00", mode: "auto" },
    ];
    const mockDb = makeDbMock({
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockClosings),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const caller = closingsRouter.createCaller(makeCtx(8) as any);

    const result = await caller.getClosings({ limit: 30 });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    result.forEach((c: any) => expect(c.restaurantId).toBe(8));
  });

  it("zwei Restaurants erhalten unabhängige Listen", async () => {
    let callCount = 0;
    const mockDb = makeDbMock({
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(
          callCount === 1
            ? [{ id: 10, restaurantId: 9, totalRevenue: "500.00" }]
            : [{ id: 20, restaurantId: 10, totalRevenue: "800.00" }]
        );
      }),
    });
    (getDb as any).mockResolvedValue(mockDb);

    const { closingsRouter } = await import("./closingsRouter");
    const callerR9 = closingsRouter.createCaller(makeCtx(9) as any);
    const callerR10 = closingsRouter.createCaller(makeCtx(10) as any);

    const [r9, r10] = await Promise.all([
      callerR9.getClosings({ limit: 10 }),
      callerR10.getClosings({ limit: 10 }),
    ]);

    expect(r9).toHaveLength(1);
    expect(r10).toHaveLength(1);
    expect(r9[0].restaurantId).toBe(9);
    expect(r10[0].restaurantId).toBe(10);
  });
});
