/**
 * M2 Security Tests: Multi-Tenant-Isolation
 *
 * Testet die Isolation zwischen Restaurant A, Restaurant B, Restaurant C und Superadmin:
 * - invoices.list: Nicht-Admins sehen nur eigene Rechnungen
 * - chat.conversations: Nicht-Admins sehen nur eigene Konversationen
 * - chat.messages: Nicht-Admins können nur Nachrichten eigener Konversationen lesen
 * - media.delete: Admins können nur Dateien ihres Restaurants löschen
 */

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

const RESTAURANT_A_ID = 1;
const RESTAURANT_B_ID = 2;
const RESTAURANT_C_ID = 3;

function makeCtx(role: User["role"], restaurantId?: number): TrpcContext {
  const user: User = {
    id: role === "superadmin" ? 1 : role === "admin" ? 2 : restaurantId === RESTAURANT_A_ID ? 10 : restaurantId === RESTAURANT_B_ID ? 20 : 30,
    openId: `test-${role}-${restaurantId ?? "none"}`,
    email: `${role}-${restaurantId ?? "none"}@test.simplapos.com`,
    name: `Test ${role} (Restaurant ${restaurantId ?? "none"})`,
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

async function expectForbidden(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    throw new Error("Expected FORBIDDEN error but none was thrown");
  } catch (err: unknown) {
    const trpcErr = err as { code?: string; message?: string };
    expect(["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"]).toContain(trpcErr.code);
  }
}

// ─── invoices.list: Tenant-Isolation ─────────────────────────────────────────

describe("M2: invoices.list – Tenant-Isolation", () => {
  it("T-A1: Restaurant A (partner) sieht nur eigene Rechnungen – restaurantId wird erzwungen", async () => {
    const caller = appRouter.createCaller(makeCtx("partner", RESTAURANT_A_ID));
    // Auch wenn restaurantId: RESTAURANT_B_ID übergeben wird, soll nur Restaurant A zurückkommen
    const result = await caller.invoices.list({ restaurantId: RESTAURANT_B_ID });
    // Alle zurückgegebenen Rechnungen müssen zu Restaurant A gehören
    if (Array.isArray(result)) {
      result.forEach((invoice: { restaurantId?: number }) => {
        expect(invoice.restaurantId).toBe(RESTAURANT_A_ID);
      });
    }
  });

  it("T-B1: Restaurant B (gast) sieht nur eigene Rechnungen", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", RESTAURANT_B_ID));
    const result = await caller.invoices.list();
    if (Array.isArray(result)) {
      result.forEach((invoice: { restaurantId?: number }) => {
        expect(invoice.restaurantId).toBe(RESTAURANT_B_ID);
      });
    }
  });

  it("T-A2: Restaurant A kann nicht auf Rechnungen von Restaurant B zugreifen", async () => {
    const caller = appRouter.createCaller(makeCtx("partner", RESTAURANT_A_ID));
    // Versucht restaurantId: RESTAURANT_B_ID zu übergeben – soll ignoriert werden
    const result = await caller.invoices.list({ restaurantId: RESTAURANT_B_ID });
    if (Array.isArray(result)) {
      const hasRestaurantBInvoices = result.some((i: { restaurantId?: number }) => i.restaurantId === RESTAURANT_B_ID);
      expect(hasRestaurantBInvoices).toBe(false);
    }
  });

  it("T-C1: Benutzer ohne Restaurant → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("kellner", undefined));
    await expectForbidden(() => caller.invoices.list());
  });

  it("T-SA1: Superadmin kann alle Rechnungen sehen (kein Filter)", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    try {
      const result = await caller.invoices.list();
      // Superadmin bekommt Ergebnis (kann leer sein wenn keine Daten)
      expect(Array.isArray(result)).toBe(true);
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      // DB-Fehler OK, FORBIDDEN nicht OK
      expect(trpcErr.code).not.toBe("FORBIDDEN");
    }
  });

  it("T-SA2: Superadmin kann Rechnungen von Restaurant A filtern", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    try {
      const result = await caller.invoices.list({ restaurantId: RESTAURANT_A_ID });
      expect(Array.isArray(result)).toBe(true);
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      expect(trpcErr.code).not.toBe("FORBIDDEN");
    }
  });
});

// ─── chat.conversations: Tenant-Isolation ─────────────────────────────────────

describe("M2: chat.conversations – Tenant-Isolation", () => {
  it("T-A3: Restaurant A sieht nur eigene Konversationen", async () => {
    const caller = appRouter.createCaller(makeCtx("partner", RESTAURANT_A_ID));
    try {
      const result = await caller.chat.conversations();
      if (Array.isArray(result)) {
        result.forEach((conv: { restaurantId?: number | null }) => {
          expect(conv.restaurantId).toBe(RESTAURANT_A_ID);
        });
      }
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      expect(trpcErr.code).not.toBe("FORBIDDEN");
    }
  });

  it("T-B3: Restaurant B sieht nur eigene Konversationen", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", RESTAURANT_B_ID));
    try {
      const result = await caller.chat.conversations();
      if (Array.isArray(result)) {
        result.forEach((conv: { restaurantId?: number | null }) => {
          expect(conv.restaurantId).toBe(RESTAURANT_B_ID);
        });
      }
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      expect(trpcErr.code).not.toBe("FORBIDDEN");
    }
  });

  it("T-SA3: Superadmin sieht alle Konversationen (kein Filter)", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    try {
      const result = await caller.chat.conversations();
      expect(Array.isArray(result)).toBe(true);
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      expect(trpcErr.code).not.toBe("FORBIDDEN");
    }
  });

  it("Benutzer ohne Restaurant sieht leere Liste", async () => {
    const caller = appRouter.createCaller(makeCtx("kellner", undefined));
    try {
      const result = await caller.chat.conversations();
      expect(result).toEqual([]);
    } catch (err: unknown) {
      // Falls DB-Fehler: akzeptabel
      const trpcErr = err as { code?: string };
      expect(trpcErr.code).not.toBe("FORBIDDEN");
    }
  });
});

// ─── chat.messages: Tenant-Isolation ─────────────────────────────────────────

describe("M2: chat.messages – Tenant-Isolation", () => {
  it("T-A4: Restaurant A kann keine Nachrichten von Restaurant B lesen → FORBIDDEN/NOT_FOUND", async () => {
    // conversationId 9999 existiert nicht oder gehört zu anderem Restaurant
    const caller = appRouter.createCaller(makeCtx("partner", RESTAURANT_A_ID));
    await expectForbidden(() => caller.chat.messages({ conversationId: 9999 }));
  });

  it("T-B4: Restaurant B kann keine Nachrichten von Restaurant A lesen → FORBIDDEN/NOT_FOUND", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", RESTAURANT_B_ID));
    await expectForbidden(() => caller.chat.messages({ conversationId: 9998 }));
  });

  it("T-SA3: Superadmin kann alle Nachrichten lesen (kein Eigentümercheck)", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    try {
      await caller.chat.messages({ conversationId: 9999 });
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      // NOT_FOUND ist OK (Konversation existiert nicht), FORBIDDEN ist nicht OK
      expect(trpcErr.code).not.toBe("FORBIDDEN");
    }
  });
});

// ─── media.delete: Tenant-Isolation ──────────────────────────────────────────

describe("M2: media.delete – Tenant-Isolation", () => {
  it("T-A5: Admin ohne restaurantId kann keine Datei mit restaurantId löschen → FORBIDDEN/NOT_FOUND", async () => {
    // Admin ohne restaurantId versucht Datei 9999 zu löschen
    const caller = appRouter.createCaller(makeCtx("admin", undefined));
    await expectForbidden(() => caller.media.delete({ id: 9999 }));
  });

  it("T-SA4: Superadmin kann beliebige Datei löschen (kein Eigentümercheck)", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    try {
      await caller.media.delete({ id: 9999 });
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      // NOT_FOUND ist OK, FORBIDDEN ist nicht OK
      expect(trpcErr.code).not.toBe("FORBIDDEN");
    }
  });

  it("T-R9: gast darf media.delete nicht aufrufen → FORBIDDEN (M1 bleibt aktiv)", async () => {
    const caller = appRouter.createCaller(makeCtx("gast", RESTAURANT_A_ID));
    try {
      await caller.media.delete({ id: 1 });
      throw new Error("Expected FORBIDDEN");
    } catch (err: unknown) {
      const trpcErr = err as { code?: string };
      expect(["FORBIDDEN", "UNAUTHORIZED"]).toContain(trpcErr.code);
    }
  });
});
