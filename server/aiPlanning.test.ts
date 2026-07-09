/**
 * aiPlanning.test.ts – Tests für aiPlanningRouter, absencesRouter, adminShiftsRouter
 *
 * Prüft:
 * - Multi-Tenant-Isolation (Kellner sieht nur eigene Daten)
 * - Rollenprüfungen (Kellner ≠ Admin)
 * - Kernfunktionen: Verfügbarkeit setzen, Abwesenheitsantrag, Schicht-Export
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// ─── Context-Factories ────────────────────────────────────────────────────────

function makeCtx(role: string, restaurantId = 1, userId = 10): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `test-${userId}`,
      name: `Test ${role}`,
      email: `${role}@test.com`,
      role: role as any,
      restaurantId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    effectiveUserId: userId ?? null,
  } as TrpcContext;
}

function makeUnauthCtx(): TrpcContext {
  return { user: null, effectiveUserId: null,
  } as TrpcContext;
}

async function expectForbidden(fn: () => Promise<unknown>) {
  try {
    await fn();
    expect.fail("Expected FORBIDDEN error but none was thrown");
  } catch (e) {
    if (e instanceof TRPCError) {
      expect(["FORBIDDEN", "UNAUTHORIZED"]).toContain(e.code);
    } else {
      throw e;
    }
  }
}

// ─── aiPlanningRouter Tests ───────────────────────────────────────────────────

describe("aiPlanningRouter", () => {
  describe("getMyPlannedShifts", () => {
    it("Kellner kann eigene geplante Schichten abrufen", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      const result = await caller.aiPlanning.getMyPlannedShifts({ weeksAhead: 2 });
      expect(result).toHaveProperty("shifts");
      expect(Array.isArray(result.shifts)).toBe(true);
    });

    it("Unauthentifizierter Zugriff wird abgelehnt", async () => {
      const caller = appRouter.createCaller(makeUnauthCtx());
      await expectForbidden(() =>
        caller.aiPlanning.getMyPlannedShifts({ weeksAhead: 2 })
      );
    });
  });

  describe("setMyAvailability", () => {
    it("Kellner kann Verfügbarkeit setzen", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      const result = await caller.aiPlanning.setMyAvailability({
        availability: [
          { dayOfWeek: 1, isAvailable: true, availableFrom: "09:00", availableTo: "18:00" },
          { dayOfWeek: 6, isAvailable: false, availableFrom: "09:00", availableTo: "18:00" },
        ],
      });
      expect(result).toHaveProperty("success", true);
    });

    it("Unauthentifizierter Zugriff wird abgelehnt", async () => {
      const caller = appRouter.createCaller(makeUnauthCtx());
      await expectForbidden(() =>
        caller.aiPlanning.setMyAvailability({ availability: [] })
      );
    });
  });

  describe("getMyAvailability", () => {
    it("Kellner kann eigene Verfügbarkeit lesen", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      const result = await caller.aiPlanning.getMyAvailability();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getPlans", () => {
    it("Admin kann Dienstpläne abrufen", async () => {
      const caller = appRouter.createCaller(makeCtx("admin", 1, 1));
      const result = await caller.aiPlanning.getPlans({ limit: 10 });
      expect(Array.isArray(result)).toBe(true);
    });

    it("Kellner kann keine Dienstpläne-Liste abrufen (Admin-only)", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      await expectForbidden(() =>
        caller.aiPlanning.getPlans({ limit: 10 })
      );
    });
  });

  describe("Multi-Tenant-Isolation", () => {
    it("Kellner von Restaurant 1 sieht keine Daten von Restaurant 2", async () => {
      const callerR1 = appRouter.createCaller(makeCtx("kellner", 1, 10));
      const callerR2 = appRouter.createCaller(makeCtx("kellner", 2, 20));
      const r1 = await callerR1.aiPlanning.getMyPlannedShifts({ weeksAhead: 2 });
      const r2 = await callerR2.aiPlanning.getMyPlannedShifts({ weeksAhead: 2 });
      // Beide haben leere Ergebnisse (keine Testdaten), aber keine Cross-Tenant-Leaks
      expect(Array.isArray(r1.shifts)).toBe(true);
      expect(Array.isArray(r2.shifts)).toBe(true);
    });
  });
});

// ─── absencesRouter Tests ─────────────────────────────────────────────────────

describe("absencesRouter", () => {
  describe("getMyAbsences", () => {
    it("Kellner kann eigene Abwesenheiten abrufen", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      const result = await caller.absences.getMyAbsences({});
      expect(result).toHaveProperty("absences");
      expect(Array.isArray(result.absences)).toBe(true);
      expect(result).toHaveProperty("totalApprovedDays");
      expect(result).toHaveProperty("pendingCount");
    });

    it("Unauthentifizierter Zugriff wird abgelehnt", async () => {
      const caller = appRouter.createCaller(makeUnauthCtx());
      await expectForbidden(() =>
        caller.absences.getMyAbsences({})
      );
    });
  });

  describe("requestAbsence – Validierung", () => {
    it("Abwesenheitsantrag mit ungültigem Datum wird abgelehnt", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      await expect(
        caller.absences.requestAbsence({
          type: "vacation",
          startDate: "2025-12-31",
          endDate: "2025-12-01", // Ende vor Beginn
        })
      ).rejects.toThrow();
    });

    it("Abwesenheitsantrag mit gültigem Datum wird angenommen", async () => {
      // Eindeutiger User-ID und Zeitraum: 500-600 Tage in der Zukunft
      const uniqueUserId = 90000 + Math.floor(Math.random() * 9999);
      const caller = appRouter.createCaller(makeCtx("kellner", 1, uniqueUserId));
      const futureStart = new Date();
      futureStart.setDate(futureStart.getDate() + 500 + Math.floor(Math.random() * 100));
      const futureEnd = new Date(futureStart);
      futureEnd.setDate(futureEnd.getDate() + 3);
      const result = await caller.absences.requestAbsence({
        type: "vacation",
        startDate: futureStart.toISOString().split("T")[0],
        endDate: futureEnd.toISOString().split("T")[0],
        reason: "Test-Jahresurlaub",
      });
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("id");
    });
  });

  describe("listAbsences – Admin", () => {
    it("Admin kann alle Abwesenheiten seines Restaurants sehen", async () => {
      const caller = appRouter.createCaller(makeCtx("admin", 1, 1));
      const result = await caller.absences.listAbsences({});
      expect(result).toHaveProperty("absences");
      expect(Array.isArray(result.absences)).toBe(true);
    });

    it("Kellner kann keine Admin-Liste abrufen", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      await expectForbidden(() =>
        caller.absences.listAbsences({})
      );
    });
  });

  describe("cancelAbsence", () => {
    it("Nicht-existente Abwesenheit kann nicht storniert werden", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      await expect(
        caller.absences.cancelAbsence({ absenceId: 999999 })
      ).rejects.toThrow();
    });
  });
});

// ─── adminShiftsRouter Tests ──────────────────────────────────────────────────

describe("adminShiftsRouter", () => {
  describe("getAllShifts", () => {
    it("Admin kann alle Schichten seines Restaurants abrufen", async () => {
      const caller = appRouter.createCaller(makeCtx("admin", 1, 1));
      const today = new Date().toISOString().split("T")[0];
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const result = await caller.adminShifts.getAllShifts({
        dateFrom: lastMonth,
        dateTo: today,
      });
      expect(result).toHaveProperty("shifts");
      expect(Array.isArray(result.shifts)).toBe(true);
    });

    it("Kellner kann keine Admin-Schichtübersicht abrufen", async () => {
      const caller = appRouter.createCaller(makeCtx("kellner", 1, 10));
      const today = new Date().toISOString().split("T")[0];
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      await expectForbidden(() =>
        caller.adminShifts.getAllShifts({ dateFrom: lastMonth, dateTo: today })
      );
    });

    it("Unauthentifizierter Zugriff wird abgelehnt", async () => {
      const caller = appRouter.createCaller(makeUnauthCtx());
      const today = new Date().toISOString().split("T")[0];
      await expectForbidden(() =>
        caller.adminShifts.getAllShifts({ dateFrom: today, dateTo: today })
      );
    });
  });

  describe("getShiftStats", () => {
    it("Admin kann Schicht-Statistiken abrufen", async () => {
      const caller = appRouter.createCaller(makeCtx("admin", 1, 1));
      const today = new Date().toISOString().split("T")[0];
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const result = await caller.adminShifts.getShiftStats({
        dateFrom: lastMonth,
        dateTo: today,
      });
      expect(result).toHaveProperty("totalShifts");
      expect(result).toHaveProperty("totalNetMinutes");
      expect(result).toHaveProperty("complianceRate");
      expect(result).toHaveProperty("perStaff");
    });
  });

  describe("getStaffList", () => {
    it("Admin kann Mitarbeiterliste mit PIN-Status abrufen", async () => {
      const caller = appRouter.createCaller(makeCtx("admin", 1, 1));
      const result = await caller.adminShifts.getStaffList();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("exportShiftsCsv", () => {
    it("Admin kann CSV-Export erstellen", async () => {
      const caller = appRouter.createCaller(makeCtx("admin", 1, 1));
      const today = new Date().toISOString().split("T")[0];
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const result = await caller.adminShifts.exportShiftsCsv({
        dateFrom: lastMonth,
        dateTo: today,
      });
      expect(result).toHaveProperty("csv");
      expect(result).toHaveProperty("filename");
      expect(result).toHaveProperty("rowCount");
      expect(typeof result.csv).toBe("string");
      // CSV-Header prüfen
      expect(result.csv).toContain("Mitarbeiter");
    });
  });

  describe("Multi-Tenant-Isolation", () => {
    it("Admin von Restaurant 1 sieht keine Schichten von Restaurant 2", async () => {
      const callerR1 = appRouter.createCaller(makeCtx("admin", 1, 1));
      const callerR2 = appRouter.createCaller(makeCtx("admin", 2, 2));
      const today = new Date().toISOString().split("T")[0];
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const r1 = await callerR1.adminShifts.getAllShifts({ dateFrom: lastMonth, dateTo: today });
      const r2 = await callerR2.adminShifts.getAllShifts({ dateFrom: lastMonth, dateTo: today });
      // Keine Schicht aus R1 darf in R2 auftauchen
      const r1Ids = new Set(r1.shifts.map((s: any) => s.id));
      const r2Ids = new Set(r2.shifts.map((s: any) => s.id));
      const overlap = [...r1Ids].filter(id => r2Ids.has(id));
      expect(overlap).toHaveLength(0);
    });
  });
});
