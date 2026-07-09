/**
 * tuyaExtensions.test.ts
 * Tests für Tuya-Polling-Config, Gerätekonfiguration und Admin-Push-Subscriptions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: vi.fn(),
  updateHeartbeatJob: vi.fn(),
  deleteHeartbeatJob: vi.fn(),
}));

vi.mock("./tuya", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tuya")>();
  return {
    ...actual,
    getTuyaCredentials: vi.fn(),
    listTuyaDevices: vi.fn(),
    addTuyaDevice: vi.fn(),
    updateTuyaDevice: vi.fn(),
    deleteTuyaDevice: vi.fn(),
    fetchDeviceStatus: vi.fn(),
    discoverTuyaDevices: vi.fn(),
    controlDevice: vi.fn(),
    getLatestReadings: vi.fn(),
    getReadingHistory: vi.fn(),
    getOpenAlerts: vi.fn(),
    resolveAlert: vi.fn(),
    getTuyaDashboardStats: vi.fn(),
  };
});

import { getDb } from "./db";
import { createHeartbeatJob, updateHeartbeatJob, deleteHeartbeatJob } from "./_core/heartbeat";
import { updateTuyaDevice } from "./tuya";

const mockGetDb = getDb as ReturnType<typeof vi.fn>;
const mockCreateJob = createHeartbeatJob as ReturnType<typeof vi.fn>;
const mockUpdateJob = updateHeartbeatJob as ReturnType<typeof vi.fn>;
const mockDeleteJob = deleteHeartbeatJob as ReturnType<typeof vi.fn>;
const mockUpdateDevice = updateTuyaDevice as ReturnType<typeof vi.fn>;

// ─── Caller-Factory ───────────────────────────────────────────────────────────

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 1,
      restaurantId: 42,
      role: "admin",
      name: "Test Admin",
      ...overrides,
    },
    req: {
      headers: { cookie: "app_session_id=test-token" },
    },
  } as any;
}

// ─── Polling-Config Tests ─────────────────────────────────────────────────────

describe("tuya.getPollingConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gibt Defaults zurück wenn keine Konfiguration vorhanden", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.getPollingConfig();

    expect(result.isEnabled).toBe(false);
    expect(result.intervalMinutes).toBe(10);
    expect(result.scheduleCronTaskUid).toBeNull();
  });

  it("gibt gespeicherte Konfiguration zurück", async () => {
    const config = { isEnabled: true, intervalMinutes: 5, lastPolledAt: 1234567890, scheduleCronTaskUid: "uid-123" };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([config]),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.getPollingConfig();

    expect(result.isEnabled).toBe(true);
    expect(result.intervalMinutes).toBe(5);
    expect(result.scheduleCronTaskUid).toBe("uid-123");
  });

  it("gibt Defaults zurück wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(makeCtx({ restaurantId: null }));
    const result = await caller.tuya.getPollingConfig();
    expect(result.isEnabled).toBe(false);
  });
});

describe("tuya.savePollingConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("erstellt neuen Heartbeat-Job wenn aktiviert und kein Job vorhanden", async () => {
    mockCreateJob.mockResolvedValue({ taskUid: "new-uid-456" });
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.savePollingConfig({ isEnabled: true, intervalMinutes: 10 });

    expect(mockCreateJob).toHaveBeenCalledOnce();
    expect(mockCreateJob).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "tuya-polling-42",
        path: "/api/scheduled/tuyaPolling",
        payload: { restaurantId: 42 },
      }),
      "test-token"
    );
    expect(result.isEnabled).toBe(true);
    expect(result.scheduleCronTaskUid).toBe("new-uid-456");
  });

  it("aktualisiert bestehenden Job wenn aktiviert und Job vorhanden", async () => {
    mockUpdateJob.mockResolvedValue(undefined);
    const existing = { isEnabled: true, intervalMinutes: 10, scheduleCronTaskUid: "existing-uid" };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existing]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    await caller.tuya.savePollingConfig({ isEnabled: true, intervalMinutes: 15 });

    expect(mockUpdateJob).toHaveBeenCalledOnce();
    expect(mockUpdateJob).toHaveBeenCalledWith("existing-uid", expect.objectContaining({ cron: expect.stringContaining("15") }), "test-token");
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  it("löscht Job wenn deaktiviert und Job vorhanden", async () => {
    mockDeleteJob.mockResolvedValue(undefined);
    const existing = { isEnabled: true, intervalMinutes: 10, scheduleCronTaskUid: "to-delete-uid" };
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existing]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.savePollingConfig({ isEnabled: false, intervalMinutes: 10 });

    expect(mockDeleteJob).toHaveBeenCalledWith("to-delete-uid", "test-token");
    expect(result.isEnabled).toBe(false);
    expect(result.scheduleCronTaskUid).toBeNull();
  });

  it("wirft FORBIDDEN wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(makeCtx({ restaurantId: null }));
    await expect(caller.tuya.savePollingConfig({ isEnabled: true, intervalMinutes: 10 })).rejects.toThrow("FORBIDDEN");
  });
});

// ─── Gerätekonfiguration Tests ────────────────────────────────────────────────

describe("tuya.updateDeviceConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aktualisiert Gerät mit Schwellenwerten", async () => {
    mockUpdateDevice.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.updateDeviceConfig({
      id: 5,
      alertEnabled: true,
      alertMinValue: "2",
      alertMaxValue: "8",
      name: "Kühlraum A",
      location: "Küche",
    });

    expect(mockUpdateDevice).toHaveBeenCalledWith(5, expect.objectContaining({
      alertEnabled: true,
      alertMinValue: "2",
      alertMaxValue: "8",
      name: "Kühlraum A",
      location: "Küche",
    }));
    expect(result.success).toBe(true);
  });

  it("aktualisiert Gerät mit null-Schwellenwerten (Alarm deaktiviert)", async () => {
    mockUpdateDevice.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.updateDeviceConfig({
      id: 7,
      alertEnabled: false,
      alertMinValue: null,
      alertMaxValue: null,
    });

    expect(mockUpdateDevice).toHaveBeenCalledWith(7, expect.objectContaining({
      alertEnabled: false,
      alertMinValue: undefined,
      alertMaxValue: undefined,
    }));
    expect(result.success).toBe(true);
  });
});

// ─── Admin Push-Subscription Tests ───────────────────────────────────────────

describe("tuya.getAdminPushStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gibt subscribed: false zurück wenn keine Subscription vorhanden", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.getAdminPushStatus();
    expect(result.subscribed).toBe(false);
  });

  it("gibt subscribed: true zurück wenn Subscription vorhanden", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 1 }]),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.getAdminPushStatus();
    expect(result.subscribed).toBe(true);
  });

  it("gibt subscribed: false zurück wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(makeCtx({ restaurantId: null }));
    const result = await caller.tuya.getAdminPushStatus();
    expect(result.subscribed).toBe(false);
  });
});

describe("tuya.subscribeAdminPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("erstellt neue Subscription wenn keine vorhanden", async () => {
    const mockInsertValues = vi.fn().mockResolvedValue(undefined);
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: mockInsertValues,
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.subscribeAdminPush({
      endpoint: "https://push.example.com/sub/abc",
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiESgX780NKKe7w98MkFidzjCckjcxCEkKED648",
      auth: "tBHItJI5svbpez7KI4CCXg",
    });

    expect(mockInsertValues).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("aktualisiert bestehende Subscription", async () => {
    const mockSetWhere = vi.fn().mockResolvedValue(undefined);
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 3 }]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    mockDb.set.mockReturnValue({ where: mockSetWhere });
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.subscribeAdminPush({
      endpoint: "https://push.example.com/sub/new",
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiESgX780NKKe7w98MkFidzjCckjcxCEkKED648",
      auth: "tBHItJI5svbpez7KI4CCXg",
    });

    expect(mockSetWhere).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("wirft FORBIDDEN wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(makeCtx({ restaurantId: null }));
    await expect(caller.tuya.subscribeAdminPush({
      endpoint: "https://push.example.com/sub/abc",
      p256dh: "key",
      auth: "auth",
    })).rejects.toThrow("FORBIDDEN");
  });
});

describe("tuya.unsubscribeAdminPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("löscht Subscription erfolgreich", async () => {
    const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const mockDb = {
      delete: vi.fn().mockReturnThis(),
      where: mockDeleteWhere,
    };
    mockGetDb.mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.unsubscribeAdminPush();

    expect(mockDeleteWhere).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("wirft FORBIDDEN wenn kein restaurantId", async () => {
    const caller = appRouter.createCaller(makeCtx({ restaurantId: null }));
    await expect(caller.tuya.unsubscribeAdminPush()).rejects.toThrow("FORBIDDEN");
  });
});

describe("tuya.getVapidPublicKey", () => {
  it("gibt VAPID Public Key zurück", async () => {
    process.env.VAPID_PUBLIC_KEY = "test-vapid-key";
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tuya.getVapidPublicKey();
    expect(result.publicKey).toBe("test-vapid-key");
  });
});
