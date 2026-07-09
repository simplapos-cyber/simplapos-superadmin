/**
 * M1 Security Tests: Rollenprüfungen auf destruktiven Endpoints
 *
 * Testet, dass folgende Endpoints AUSSCHLIESSLICH für admin/superadmin zugänglich sind:
 * - restaurants.create, restaurants.update, restaurants.delete
 * - users.list, users.update
 * - advertisements.create, advertisements.update, advertisements.delete
 * - contracts.list
 * - media.delete
 */

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function makeCtx(role: User["role"], restaurantId?: number): TrpcContext {
  const user: User = {
    id: 99,
    openId: `test-${role}`,
    email: `${role}@test.simplapos.com`,
    name: `Test ${role}`,
    passwordHash: "hash",
    loginMethod: "email",
    role,
    status: "active",
    restaurantId: restaurantId ?? null,
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
    throw new Error("Expected FORBIDDEN error but none was thrown");
  } catch (err: unknown) {
    const trpcErr = err as { code?: string; message?: string };
    expect(["FORBIDDEN", "UNAUTHORIZED"]).toContain(trpcErr.code);
  }
}

// ─── restaurants.create ───────────────────────────────────────────────────────

describe("M1: restaurants.create", () => {
  const validInput = { name: "Test Restaurant" };

  it("T-R1: gast darf kein Restaurant erstellen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.restaurants.create(validInput));
  });

  it("T-R1b: kellner darf kein Restaurant erstellen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("kellner", 1));
    await expectForbidden(() => caller.restaurants.create(validInput));
  });

  it("T-R1c: partner darf kein Restaurant erstellen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("partner", 1));
    await expectForbidden(() => caller.restaurants.create(validInput));
  });

  it("T-R1d: nicht eingeloggt → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expectForbidden(() => caller.restaurants.create(validInput));
  });
});

// ─── restaurants.update ───────────────────────────────────────────────────────

describe("M1: restaurants.update", () => {
  it("T-R2: gast darf kein Restaurant aktualisieren → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.restaurants.update({ id: 1, name: "Neuer Name" }));
  });

  it("T-R2b: manager darf kein Restaurant aktualisieren → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("manager", 1));
    await expectForbidden(() => caller.restaurants.update({ id: 1, name: "Neuer Name" }));
  });
});

// ─── restaurants.delete ───────────────────────────────────────────────────────

describe("M1: restaurants.delete", () => {
  it("T-R3: gast darf kein Restaurant löschen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.restaurants.delete({ id: 1 }));
  });

  it("T-R3b: buchhalter darf kein Restaurant löschen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("buchhalter", 1));
    await expectForbidden(() => caller.restaurants.delete({ id: 1 }));
  });
});

// ─── users.list ───────────────────────────────────────────────────────────────

describe("M1: users.list", () => {
  it("T-R4: gast darf keine Benutzerliste sehen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.users.list());
  });

  it("T-R4b: kellner darf keine Benutzerliste sehen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("kellner", 1));
    await expectForbidden(() => caller.users.list());
  });

  it("T-R4c: partner darf keine Benutzerliste sehen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("partner", 1));
    await expectForbidden(() => caller.users.list());
  });
});

// ─── users.update ─────────────────────────────────────────────────────────────

describe("M1: users.update", () => {
  it("T-R5: gast darf keinen Benutzer aktualisieren → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.users.update({ id: 1, role: "kellner" }));
  });

  it("T-R5b: manager darf keinen Benutzer aktualisieren → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("manager", 1));
    await expectForbidden(() => caller.users.update({ id: 1, status: "inactive" }));
  });
});

// ─── advertisements.create/update/delete ──────────────────────────────────────

describe("M1: advertisements.create", () => {
  it("T-R6: gast darf keine Werbung erstellen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.advertisements.create({ title: "Test Ad" }));
  });
});

describe("M1: advertisements.update", () => {
  it("T-R7: gast darf keine Werbung aktualisieren → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.advertisements.update({ id: 1, title: "Neuer Titel" }));
  });
});

describe("M1: advertisements.delete", () => {
  it("T-R8: gast darf keine Werbung löschen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.advertisements.delete({ id: 1 }));
  });
});

// ─── media.delete ─────────────────────────────────────────────────────────────

describe("M1: media.delete", () => {
  it("T-R9: gast darf keine Mediendatei löschen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.media.delete({ id: 1 }));
  });

  it("T-R9b: kellner darf keine Mediendatei löschen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("kellner", 1));
    await expectForbidden(() => caller.media.delete({ id: 1 }));
  });
});

// ─── contracts.list ───────────────────────────────────────────────────────────

describe("M1: contracts.list", () => {
  it("T-R10: gast darf keine Vertragsliste sehen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", 1));
    await expectForbidden(() => caller.contracts.list());
  });

  it("T-R10b: partner darf keine Vertragsliste sehen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("partner", 1));
    await expectForbidden(() => caller.contracts.list());
  });

  it("T-R10c: kellner darf keine Vertragsliste sehen → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("kellner", 1));
    await expectForbidden(() => caller.contracts.list());
  });
});

// ─── Admin-Zugriff: Positiv-Tests (kein DB-Zugriff, nur Procedure-Check) ─────

describe("M1: Admin-Zugriff erlaubt (Procedure-Level)", () => {
  it("T-R11: admin-Kontext wird von adminProcedure akzeptiert (kein FORBIDDEN)", async () => {
    // Wir prüfen nur, dass der Fehler NICHT FORBIDDEN/UNAUTHORIZED ist.
    // Ein DB-Fehler (z.B. NOT_FOUND) ist akzeptabel – zeigt, dass die Procedure passiert wurde.
    const caller = appRouter.createCaller(makeCtx("admin"));
    try {
      await caller.users.list();
      // Falls kein Fehler: Test bestanden
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      // DB-Fehler sind OK, FORBIDDEN/UNAUTHORIZED sind nicht OK
      expect(trpcErr.code).not.toBe("FORBIDDEN");
      expect(trpcErr.code).not.toBe("UNAUTHORIZED");
    }
  });

  it("T-R13: superadmin-Kontext wird von adminProcedure akzeptiert (kein FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    try {
      await caller.contracts.list();
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      expect(trpcErr.code).not.toBe("FORBIDDEN");
      expect(trpcErr.code).not.toBe("UNAUTHORIZED");
    }
  });
});
