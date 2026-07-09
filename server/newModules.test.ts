/**
 * newModules.test.ts
 * Tests für die 5 neuen Module (Phase 7 – qrorpa.com Erweiterung):
 * - kassenbuch (Kassenbuch & Tagesabschluss)
 * - steuerexport (Steuerberater-Export)
 * - allergene/nutrition (Nährwerte)
 * - multilang_menu (Mehrsprachige Speisekarte)
 * - bewertungsmanagement (Externe Bewertungen)
 *
 * Testet: Tenant-Isolation (Restaurant A ≠ B), Rollenprüfungen, Eingabevalidierung
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
function makeCtx(role: User["role"], restaurantId?: number): TrpcContext {
  const user: User = {
    id: 99,
    email: `${role}@test.simplapos.com`,
    name: `Test ${role}`,
    passwordHash: "hash",
    role,
    status: "active",
    restaurantId: restaurantId ?? null,
    avatarUrl: null,
    phone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function expectForbidden(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    throw new Error("Expected FORBIDDEN/UNAUTHORIZED error but none was thrown");
  } catch (err: unknown) {
    const trpcErr = err as { code?: string };
    expect(["FORBIDDEN", "UNAUTHORIZED"]).toContain(trpcErr.code);
  }
}

// ─── KASSENBUCH-ROUTER ────────────────────────────────────────────────────────
describe("kassenbuch.listEntries – Tenant-Isolation", () => {
  it("Restaurant A (id=1) kann nicht auf Restaurant B (id=2) zugreifen", async () => {
    const caller = appRouter.createCaller(makeCtx("manager", 1));
    await expectForbidden(() =>
      caller.kassenbuch.listEntries({ restaurantId: 2 })
    );
  });

  it("Superadmin kann auf beliebiges Restaurant zugreifen", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    // Superadmin darf Restaurant 1 abfragen (auch wenn kein restaurantId gesetzt)
    const result = await caller.kassenbuch.listEntries({ restaurantId: 1 });
    expect(Array.isArray(result)).toBe(true);
  }, 15000);

  it("Unauthentifizierter Zugriff wird abgelehnt", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expectForbidden(() =>
      caller.kassenbuch.listEntries({ restaurantId: 1 })
    );
  });
});

describe("kassenbuch.createEntry – Validierung", () => {
  it("Ungültiger Typ wird abgelehnt", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    await expect(
      caller.kassenbuch.createEntry({
        restaurantId: 1,
        type: "invalid" as "einnahme",
        amount: "100.00",
        description: "Test",
        entryDate: new Date().toISOString(),
      })
    ).rejects.toThrow();
  });

  it("Fehlende Pflichtfelder werden abgelehnt", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    await expect(
      caller.kassenbuch.createEntry({
        restaurantId: 1,
        type: "einnahme",
        amount: "",  // Leerer Betrag
        description: "Test",
        entryDate: new Date().toISOString(),
      })
    ).rejects.toThrow();
  });
});

// ─── STEUEREXPORT-ROUTER ──────────────────────────────────────────────────────
describe("steuerexport.exportData – Tenant-Isolation", () => {
  it("Restaurant A kann nicht auf Restaurant B exportieren", async () => {
    const caller = appRouter.createCaller(makeCtx("buchhalter", 1));
    await expectForbidden(() =>
      caller.steuerexport.exportData({
        restaurantId: 2,
        from: "2026-01-01",
        to: "2026-12-31",
      })
    );
  });

  it("Admin kann eigenes Restaurant exportieren", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    const result = await caller.steuerexport.exportData({
      restaurantId: 1,
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(result).toHaveProperty("entries");
    expect(result).toHaveProperty("closings");
    expect(result).toHaveProperty("format");
    expect(Array.isArray(result.entries)).toBe(true);
    expect(Array.isArray(result.closings)).toBe(true);
  });

  it("Superadmin kann beliebiges Restaurant exportieren", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    const result = await caller.steuerexport.exportData({
      restaurantId: 1,
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(result).toHaveProperty("entries");
  });

  it("Unauthentifizierter Zugriff wird abgelehnt", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expectForbidden(() =>
      caller.steuerexport.exportData({
        restaurantId: 1,
        from: "2026-01-01",
        to: "2026-12-31",
      })
    );
  });
});

// ─── NÄHRWERTE-ROUTER ─────────────────────────────────────────────────────────
describe("nutrition.getByMenuItem – Tenant-Isolation", () => {
  it("Restaurant A kann nicht auf Nährwerte von Restaurant B zugreifen", async () => {
    const caller = appRouter.createCaller(makeCtx("manager", 1));
    await expectForbidden(() =>
      caller.nutrition.getByMenuItem({ menuItemId: 1, restaurantId: 2 })
    );
  });

  it("Admin kann Nährwerte des eigenen Restaurants abrufen", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    const result = await caller.nutrition.getByMenuItem({ menuItemId: 999, restaurantId: 1 });
    // Nicht vorhandener Artikel gibt null zurück
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("Superadmin kann Nährwerte beliebiger Restaurants abrufen", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    const result = await caller.nutrition.getByMenuItem({ menuItemId: 999, restaurantId: 1 });
    expect(result === null || typeof result === "object").toBe(true);
  });
});

// ─── MEHRSPRACHIGE SPEISEKARTE ────────────────────────────────────────────────
describe("multilangMenu.getCategoryTranslations – Tenant-Isolation", () => {
  it("Restaurant A kann nicht auf Übersetzungen von Restaurant B zugreifen", async () => {
    const caller = appRouter.createCaller(makeCtx("manager", 1));
    await expectForbidden(() =>
      caller.multilangMenu.getCategoryTranslations({ restaurantId: 2, categoryId: 1 })
    );
  });

  it("Admin kann Kategorie-Übersetzungen des eigenen Restaurants abrufen", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    const result = await caller.multilangMenu.getCategoryTranslations({ restaurantId: 1, categoryId: 999 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("multilangMenu.getItemTranslations – Tenant-Isolation", () => {
  it("Restaurant A kann nicht auf Item-Übersetzungen von Restaurant B zugreifen", async () => {
    const caller = appRouter.createCaller(makeCtx("manager", 1));
    await expectForbidden(() =>
      caller.multilangMenu.getItemTranslations({ restaurantId: 2, menuItemId: 1 })
    );
  });

  it("Admin kann Item-Übersetzungen des eigenen Restaurants abrufen", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    const result = await caller.multilangMenu.getItemTranslations({ restaurantId: 1, menuItemId: 999 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("Superadmin kann Item-Übersetzungen beliebiger Restaurants abrufen", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    const result = await caller.multilangMenu.getItemTranslations({ restaurantId: 1, menuItemId: 999 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("multilangMenu.upsertItemTranslation – Validierung", () => {
  it("Ungültige Sprache wird abgelehnt", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    await expect(
      caller.multilangMenu.upsertItemTranslation({
        restaurantId: 1,
        menuItemId: 1,
        lang: "xx" as "de",
        name: "Test",
      })
    ).rejects.toThrow();
  });

  it("Leerer Name wird abgelehnt", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    await expect(
      caller.multilangMenu.upsertItemTranslation({
        restaurantId: 1,
        menuItemId: 1,
        lang: "de",
        name: "",
      })
    ).rejects.toThrow();
  });
});

// ─── BEWERTUNGSMANAGEMENT ─────────────────────────────────────────────────────
describe("bewertungen.list – Tenant-Isolation", () => {
  it("Restaurant A kann nicht auf Bewertungen von Restaurant B zugreifen", async () => {
    const caller = appRouter.createCaller(makeCtx("manager", 1));
    await expectForbidden(() =>
      caller.bewertungen.list({ restaurantId: 2 })
    );
  });

  it("Admin kann Bewertungen des eigenen Restaurants abrufen", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    const result = await caller.bewertungen.list({ restaurantId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("Superadmin kann Bewertungen beliebiger Restaurants abrufen", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    const result = await caller.bewertungen.list({ restaurantId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("Unauthentifizierter Zugriff wird abgelehnt", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expectForbidden(() =>
      caller.bewertungen.list({ restaurantId: 1 })
    );
  });
});

describe("bewertungen.list – Filterung nach Plattform und Status", () => {
  it("Filterung nach Plattform 'google' ist möglich", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    const result = await caller.bewertungen.list({ restaurantId: 1, platform: "google" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("Filterung nach Status 'neu' ist möglich", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    const result = await caller.bewertungen.list({ restaurantId: 1, status: "neu" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("Ungültige Plattform wird abgelehnt", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    await expect(
      caller.bewertungen.list({ restaurantId: 1, platform: "facebook" as "google" })
    ).rejects.toThrow();
  });
});

describe("bewertungen.respond – Tenant-Isolation", () => {
  it("Restaurant A kann nicht auf Bewertung von Restaurant B antworten", async () => {
    const caller = appRouter.createCaller(makeCtx("manager", 1));
    await expectForbidden(() =>
      caller.bewertungen.respond({ id: 1, restaurantId: 2, responseText: "Danke!" })
    );
  });

  it("Leere Antwort wird abgelehnt", async () => {
    const caller = appRouter.createCaller(makeCtx("admin", 1));
    await expect(
      caller.bewertungen.respond({ id: 1, restaurantId: 1, responseText: "" })
    ).rejects.toThrow();
  });
});
