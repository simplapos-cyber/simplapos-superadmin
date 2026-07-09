import { describe, expect, it, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── DB-Modul mocken (kein echter DB-Aufruf in Tests) ────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getReservationsByRestaurant: vi.fn().mockResolvedValue([
      {
        id: 1, restaurantId: 1, guestName: "Familie Müller", guestPhone: "+41 79 111 22 33",
        guestEmail: "mueller@test.ch", guestCount: 4, tableId: null,
        reservedAt: new Date("2026-06-15T19:00:00Z"), duration: 90,
        status: "angefragt", notes: null, guestNotes: "Vegetarisch",
        source: "telefon", reminderSentAt: null, createdBy: 1,
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]),
    getReservationById: vi.fn().mockImplementation((id: number, restaurantId: number) => {
      if (id === 1 && restaurantId === 1) {
        return Promise.resolve({
          id: 1, restaurantId: 1, guestName: "Familie Müller", guestCount: 4,
          reservedAt: new Date("2026-06-15T19:00:00Z"), duration: 90,
          status: "angefragt", source: "telefon",
          createdAt: new Date(), updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    }),
    createReservation: vi.fn().mockResolvedValue(42),
    updateReservation: vi.fn().mockResolvedValue(undefined),
    deleteReservation: vi.fn().mockResolvedValue(undefined),
    getReservationStats: vi.fn().mockResolvedValue({ total: 5, confirmed: 3, pending: 2, today: 1 }),
  };
});

// ─── Kontext-Helpers ──────────────────────────────────────────────────────────
function makeCtx(restaurantId: number | null = 1): TrpcContext {
  return {
    user: {
      id: 10,
      openId: "test-user",
      email: "admin@test.ch",
      name: "Test Admin",
      loginMethod: "email" as any,
      role: "admin" as any,
      restaurantId,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("reservations router", () => {

  describe("list", () => {
    it("gibt Reservierungen für das Restaurant zurück", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const result = await caller.reservations.list();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("guestName");
    });

    it("wirft FORBIDDEN wenn kein restaurantId im Kontext", async () => {
      const caller = appRouter.createCaller(makeCtx(null));
      await expect(caller.reservations.list()).rejects.toThrow("Kein Restaurant zugewiesen");
    });

    it("akzeptiert Status-Filter", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const result = await caller.reservations.list({ status: "angefragt" });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("stats", () => {
    it("gibt Statistiken zurück", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const result = await caller.reservations.stats();
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("confirmed");
      expect(result).toHaveProperty("pending");
      expect(result).toHaveProperty("today");
      expect(typeof result.total).toBe("number");
    });

    it("wirft FORBIDDEN ohne restaurantId", async () => {
      const caller = appRouter.createCaller(makeCtx(null));
      await expect(caller.reservations.stats()).rejects.toThrow("Kein Restaurant zugewiesen");
    });
  });

  describe("getById", () => {
    it("gibt eine Reservierung zurück wenn gefunden", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const result = await caller.reservations.getById({ id: 1 });
      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("guestName", "Familie Müller");
    });

    it("wirft NOT_FOUND wenn Reservierung nicht existiert", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      await expect(caller.reservations.getById({ id: 999 })).rejects.toThrow("Reservierung nicht gefunden");
    });
  });

  describe("create", () => {
    it("erstellt eine neue Reservierung und gibt die ID zurück", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const result = await caller.reservations.create({
        guestName: "Herr Meier",
        guestCount: 2,
        reservedAt: "2026-06-20T18:00:00.000Z",
        duration: 90,
        source: "telefon",
      });
      expect(result).toHaveProperty("id", 42);
    });

    it("wirft Fehler bei fehlendem Pflichtfeld guestName", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      await expect(caller.reservations.create({
        guestName: "",
        guestCount: 2,
        reservedAt: "2026-06-20T18:00:00.000Z",
      } as any)).rejects.toThrow();
    });

    it("wirft FORBIDDEN ohne restaurantId", async () => {
      const caller = appRouter.createCaller(makeCtx(null));
      await expect(caller.reservations.create({
        guestName: "Test",
        guestCount: 2,
        reservedAt: "2026-06-20T18:00:00.000Z",
      })).rejects.toThrow("Kein Restaurant zugewiesen");
    });
  });

  describe("update", () => {
    it("aktualisiert eine vorhandene Reservierung", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const result = await caller.reservations.update({ id: 1, guestName: "Familie Müller-Schneider" });
      expect(result).toHaveProperty("success", true);
    });

    it("wirft NOT_FOUND bei unbekannter ID", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      await expect(caller.reservations.update({ id: 999, guestName: "Test" })).rejects.toThrow("Reservierung nicht gefunden");
    });
  });

  describe("updateStatus", () => {
    it("ändert den Status einer Reservierung", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const result = await caller.reservations.updateStatus({ id: 1, status: "bestaetigt" });
      expect(result).toHaveProperty("success", true);
    });

    it("wirft NOT_FOUND bei unbekannter ID", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      await expect(caller.reservations.updateStatus({ id: 999, status: "storniert" })).rejects.toThrow("Reservierung nicht gefunden");
    });

    it("akzeptiert alle gültigen Status-Werte", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const statuses = ["angefragt", "bestaetigt", "angekommen", "abgeschlossen", "storniert", "no_show"] as const;
      for (const status of statuses) {
        const result = await caller.reservations.updateStatus({ id: 1, status });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("delete", () => {
    it("löscht eine vorhandene Reservierung", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      const result = await caller.reservations.delete({ id: 1 });
      expect(result).toHaveProperty("success", true);
    });

    it("wirft NOT_FOUND bei unbekannter ID", async () => {
      const caller = appRouter.createCaller(makeCtx(1));
      await expect(caller.reservations.delete({ id: 999 })).rejects.toThrow("Reservierung nicht gefunden");
    });

    it("wirft FORBIDDEN ohne restaurantId", async () => {
      const caller = appRouter.createCaller(makeCtx(null));
      await expect(caller.reservations.delete({ id: 1 })).rejects.toThrow("Kein Restaurant zugewiesen");
    });
  });
});
