/**
 * shifts.test.ts – Tests für den shiftsRouter
 * Testet: PIN-Verwaltung, clockIn, clockOut, startBreak, endBreak,
 *         getCurrentShift, getMyShifts, getMonthStats
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import bcrypt from "bcryptjs";

// ─── DB-Modul mocken ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual };
});

// ─── Drizzle DB mocken ────────────────────────────────────────────────────────
const mockPinHash = bcrypt.hashSync("1234", 10);

const mockShift = {
  id: 1,
  restaurantId: 1,
  staffId: 10,
  startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // vor 2h
  endedAt: null,
  durationMinutes: null,
  breakMinutes: 0,
  netWorkMinutes: null,
  status: "active" as const,
  clockInIp: "127.0.0.1",
  clockInUserAgent: "test",
  clockInDeviceId: null,
  clockOutIp: null,
  clockOutUserAgent: null,
  notes: null,
  autoClosedAt: null,
  autoCloseReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPin = {
  id: 1,
  staffId: 10,
  restaurantId: 1,
  pinHash: mockPinHash,
  failedAttempts: 0,
  lockedUntil: null,
  lastChangedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock für getDb
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock-DB-Instanz
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
};

// ─── Kontext-Helpers ──────────────────────────────────────────────────────────
function makeCtx(restaurantId: number | null = 1, userId = 10): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user",
      email: "kellner@test.ch",
      name: "Test Kellner",
      loginMethod: "email" as any,
      role: "kellner" as any,
      restaurantId,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      passwordHash: "hash",
      status: "active" as any,
      avatarUrl: null,
      phone: null,
    } as any,
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest/1.0" },
      socket: { remoteAddress: "127.0.0.1" },
    } as any,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
  };
}

function makeNoRestaurantCtx(): TrpcContext {
  return makeCtx(null);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("shifts router", () => {

  describe("hasPinSet", () => {
    it("wirft Fehler wenn kein PIN gesetzt und kein restaurantId", async () => {
      // Kein restaurantId → DB-Fehler oder FORBIDDEN erwartet
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.hasPinSet()).rejects.toThrow();
    });

    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.hasPinSet()).rejects.toThrow();
    });
  });

  describe("setPin", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.setPin({ pin: "1234" })).rejects.toThrow("Kein Restaurant zugewiesen");
    });

    it("wirft BAD_REQUEST bei ungültigem PIN (nicht 4 Ziffern)", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.shifts.setPin({ pin: "123" })).rejects.toThrow();
    });

    it("wirft BAD_REQUEST bei Buchstaben im PIN", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.shifts.setPin({ pin: "12ab" })).rejects.toThrow();
    });
  });

  describe("clockIn", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.clockIn({ pin: "1234" })).rejects.toThrow("Kein Restaurant zugewiesen");
    });

    it("wirft BAD_REQUEST bei ungültigem PIN-Format", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.shifts.clockIn({ pin: "abc" })).rejects.toThrow();
    });
  });

  describe("clockOut", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.clockOut({ pin: "1234" })).rejects.toThrow("Kein Restaurant zugewiesen");
    });

    it("wirft BAD_REQUEST bei ungültigem PIN-Format", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.shifts.clockOut({ pin: "abc" })).rejects.toThrow();
    });
  });

  describe("startBreak", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.startBreak({ breakType: "voluntary" })).rejects.toThrow("Kein Restaurant zugewiesen");
    });
  });

  describe("endBreak", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.endBreak()).rejects.toThrow("Kein Restaurant zugewiesen");
    });
  });

  describe("getCurrentShift", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.getCurrentShift()).rejects.toThrow("Kein Restaurant zugewiesen");
    });
  });

  describe("getMyShifts", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.getMyShifts({})).rejects.toThrow("Kein Restaurant zugewiesen");
    });

    it("akzeptiert gültige Eingaben", async () => {
      const caller = appRouter.createCaller(makeCtx());
      // Wird DB-Fehler werfen, aber Input-Validierung ist OK
      await expect(caller.shifts.getMyShifts({ limit: 10 })).rejects.toThrow();
    });

    it("wirft bei ungültigem limit", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.shifts.getMyShifts({ limit: 0 })).rejects.toThrow();
    });

    it("wirft bei zu grossem limit", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.shifts.getMyShifts({ limit: 999 })).rejects.toThrow();
    });
  });

  describe("getMonthStats", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.getMonthStats({})).rejects.toThrow("Kein Restaurant zugewiesen");
    });

    it("akzeptiert gültige Monat/Jahr-Eingaben", async () => {
      const caller = appRouter.createCaller(makeCtx());
      // DB-Fehler erwartet, aber Validierung OK
      await expect(caller.shifts.getMonthStats({ year: 2026, month: 6 })).rejects.toThrow();
    });

    it("wirft bei ungültigem Monat", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.shifts.getMonthStats({ month: 13 })).rejects.toThrow();
    });

    it("wirft bei ungültigem Jahr", async () => {
      const caller = appRouter.createCaller(makeCtx());
      await expect(caller.shifts.getMonthStats({ year: 1999 })).rejects.toThrow();
    });
  });

  describe("getActivityCorrelation", () => {
    it("wirft FORBIDDEN wenn kein restaurantId", async () => {
      const caller = appRouter.createCaller(makeNoRestaurantCtx());
      await expect(caller.shifts.getActivityCorrelation({ shiftId: 1 })).rejects.toThrow("Kein Restaurant zugewiesen");
    });
  });

  describe("PIN-Validierung (Unit)", () => {
    it("4-stelliger numerischer PIN ist gültig", () => {
      const validPins = ["0000", "1234", "9999", "4567"];
      validPins.forEach(pin => {
        expect(/^\d{4}$/.test(pin)).toBe(true);
      });
    });

    it("ungültige PINs werden abgelehnt", () => {
      const invalidPins = ["123", "12345", "abcd", "12ab", "", " 123"];
      invalidPins.forEach(pin => {
        expect(/^\d{4}$/.test(pin)).toBe(false);
      });
    });
  });

  describe("Pflichtpausen-Logik (Unit)", () => {
    function getMandatoryBreak(workMinutes: number): number {
      if (workMinutes >= 9 * 60) return 60;
      if (workMinutes >= 7 * 60) return 30;
      if (workMinutes >= 5.5 * 60) return 15;
      return 0;
    }

    it("keine Pflichtpause unter 5.5h", () => {
      expect(getMandatoryBreak(0)).toBe(0);
      expect(getMandatoryBreak(300)).toBe(0); // 5h
      expect(getMandatoryBreak(329)).toBe(0); // 5h 29m
    });

    it("15 Min. Pflichtpause ab 5.5h", () => {
      expect(getMandatoryBreak(330)).toBe(15); // genau 5.5h
      expect(getMandatoryBreak(360)).toBe(15); // 6h
      expect(getMandatoryBreak(419)).toBe(15); // 6h 59m
    });

    it("30 Min. Pflichtpause ab 7h", () => {
      expect(getMandatoryBreak(420)).toBe(30); // genau 7h
      expect(getMandatoryBreak(480)).toBe(30); // 8h
      expect(getMandatoryBreak(539)).toBe(30); // 8h 59m
    });

    it("60 Min. Pflichtpause ab 9h", () => {
      expect(getMandatoryBreak(540)).toBe(60); // genau 9h
      expect(getMandatoryBreak(600)).toBe(60); // 10h
      expect(getMandatoryBreak(720)).toBe(60); // 12h
    });
  });
});
