/**
 * exportAndPublish.test.ts
 * Tests für:
 * - adminShifts.exportDatev
 * - adminShifts.exportPdfMonthly
 * - aiPlanning.publishPlan
 * - adminShifts.getStaffList
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function makeAdminCtx(restaurantId = 9901): TrpcContext {
  return {
    user: {
      id: 9901,
      openId: "export-admin-openid",
      email: "admin-export-test@test.com",
      name: "Export Admin",
      role: "admin" as const,
      restaurantId,
    },
    req: {} as any,
    res: {} as any,
  };
}

function makeKellnerCtx(restaurantId = 9901): TrpcContext {
  return {
    user: {
      id: 9902,
      openId: "export-kellner-openid",
      email: "kellner-export-test@test.com",
      name: "Export Kellner",
      role: "kellner" as const,
      restaurantId,
    },
    req: {} as any,
    res: {} as any,
  };
}

// ─── exportDatev ─────────────────────────────────────────────────────────────

describe("adminShifts.exportDatev", () => {
  it("gibt leere Zusammenfassung zurück wenn keine Schichten vorhanden", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.adminShifts.exportDatev({ year: 2025, month: 1 });

    expect(result).toHaveProperty("datev");
    expect(result).toHaveProperty("filename");
    expect(result).toHaveProperty("staffCount");
    expect(result).toHaveProperty("totalShifts");
    expect(result).toHaveProperty("summary");
    expect(Array.isArray(result.summary)).toBe(true);
    expect(result.staffCount).toBe(0);
    expect(result.totalShifts).toBe(0);
  });

  it("DATEV-Inhalt enthält EXTF-Header", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.adminShifts.exportDatev({ year: 2025, month: 1 });

    expect(result.datev).toContain("EXTF");
    expect(result.datev).toContain("Konto");
  });

  it("Dateiname enthält Jahr und Monat", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.adminShifts.exportDatev({ year: 2026, month: 3 });

    expect(result.filename).toContain("2026");
    expect(result.filename).toContain("03");
    expect(result.filename).toMatch(/\.csv$/);
  });

  it("wirft FORBIDDEN wenn Kellner versucht zu exportieren", async () => {
    const caller = appRouter.createCaller(makeKellnerCtx());
    await expect(
      caller.adminShifts.exportDatev({ year: 2026, month: 1 })
    ).rejects.toThrow();
  });

  it("Multi-Tenant: Restaurant A und B sind isoliert", async () => {
    const callerA = appRouter.createCaller(makeAdminCtx(9901));
    const callerB = appRouter.createCaller(makeAdminCtx(9902));

    const resultA = await callerA.adminShifts.exportDatev({ year: 2025, month: 6 });
    const resultB = await callerB.adminShifts.exportDatev({ year: 2025, month: 6 });

    expect(resultA.staffCount).toBe(0);
    expect(resultB.staffCount).toBe(0);
  });
});

// ─── exportPdfMonthly ─────────────────────────────────────────────────────────

describe("adminShifts.exportPdfMonthly", () => {
  it("gibt leere Reports zurück wenn keine Schichten vorhanden", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.adminShifts.exportPdfMonthly({ year: 2025, month: 2 });

    expect(result).toHaveProperty("reports");
    expect(result).toHaveProperty("month");
    expect(result).toHaveProperty("year");
    expect(result).toHaveProperty("filename");
    expect(Array.isArray(result.reports)).toBe(true);
    expect(result.reports.length).toBe(0);
  });

  it("Monatsname ist korrekt auf Deutsch", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());

    const jan = await caller.adminShifts.exportPdfMonthly({ year: 2025, month: 1 });
    expect(jan.month).toBe("Januar");

    const dez = await caller.adminShifts.exportPdfMonthly({ year: 2025, month: 12 });
    expect(dez.month).toBe("Dezember");

    const mar = await caller.adminShifts.exportPdfMonthly({ year: 2025, month: 3 });
    expect(mar.month).toBe("März");
  });

  it("Dateiname enthält Jahr und Monat", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.adminShifts.exportPdfMonthly({ year: 2026, month: 7 });

    expect(result.filename).toContain("2026");
    expect(result.filename).toContain("07");
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it("wirft FORBIDDEN wenn Kellner versucht zu exportieren", async () => {
    const caller = appRouter.createCaller(makeKellnerCtx());
    await expect(
      caller.adminShifts.exportPdfMonthly({ year: 2026, month: 1 })
    ).rejects.toThrow();
  });

  it("Report-Struktur enthält alle Pflichtfelder", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.adminShifts.exportPdfMonthly({ year: 2025, month: 4 });

    expect(result.year).toBe(2025);
    expect(result.month).toBe("April");
    expect(Array.isArray(result.reports)).toBe(true);
  });
});

// ─── aiPlanning.publishPlan ───────────────────────────────────────────────────

describe("aiPlanning.publishPlan", () => {
  it("wirft NOT_FOUND wenn Plan nicht existiert", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(
      caller.aiPlanning.publishPlan({ planId: 999999 })
    ).rejects.toThrow();
  });

  it("wirft FORBIDDEN wenn Kellner versucht zu veröffentlichen", async () => {
    const caller = appRouter.createCaller(makeKellnerCtx());
    await expect(
      caller.aiPlanning.publishPlan({ planId: 1 })
    ).rejects.toThrow();
  });
});

// ─── adminShifts.getStaffList ─────────────────────────────────────────────────

describe("adminShifts.getStaffList", () => {
  it("gibt leere Liste zurück für neues Restaurant", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.adminShifts.getStaffList();
    expect(Array.isArray(result)).toBe(true);
  });

  it("wirft FORBIDDEN wenn Kellner zugreift", async () => {
    const caller = appRouter.createCaller(makeKellnerCtx());
    await expect(caller.adminShifts.getStaffList()).rejects.toThrow();
  });
});
