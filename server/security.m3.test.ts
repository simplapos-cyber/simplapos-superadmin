/**
 * M3 Security Tests: Rate-Limiting
 *
 * Testet das E-Mail-basierte Rate-Limiting im Login-Endpoint:
 * - Bis zu 10 Versuche: UNAUTHORIZED (normaler Fehler)
 * - Ab Versuch 11: TOO_MANY_REQUESTS
 * - Nach erfolgreichem Login: Zähler wird zurückgesetzt
 * - Verschiedene E-Mails haben unabhängige Zähler
 */

import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

async function attemptLogin(email: string, password: string): Promise<{ code?: string; message?: string; success?: boolean }> {
  const caller = appRouter.createCaller(makePublicCtx());
  try {
    await caller.auth.login({ email, password });
    return { success: true };
  } catch (err: unknown) {
    const trpcErr = err as { code?: string; message?: string };
    return { code: trpcErr.code, message: trpcErr.message };
  }
}

// ─── E-Mail-Rate-Limiting Tests ───────────────────────────────────────────────

describe("M3: E-Mail-Rate-Limiting (Login)", () => {
  it("T-RL1: Erste 10 Versuche mit falschen Credentials → UNAUTHORIZED (nicht geblockt)", async () => {
    const testEmail = `ratelimit-test-${Date.now()}@simplapos.com`;

    for (let i = 1; i <= 10; i++) {
      const result = await attemptLogin(testEmail, "falschesPasswort");
      // Soll UNAUTHORIZED sein (normaler Fehler), nicht TOO_MANY_REQUESTS
      expect(result.code).toBe("UNAUTHORIZED");
    }
  });

  it("T-RL2: Ab Versuch 11 → TOO_MANY_REQUESTS", async () => {
    const testEmail = `ratelimit-block-${Date.now()}@simplapos.com`;

    // Erste 10 Versuche durchführen
    for (let i = 1; i <= 10; i++) {
      await attemptLogin(testEmail, "falschesPasswort");
    }

    // Versuch 11 → soll geblockt werden
    const result = await attemptLogin(testEmail, "falschesPasswort");
    expect(result.code).toBe("TOO_MANY_REQUESTS");
    expect(result.message).toContain("Zu viele Anmeldeversuche");
  });

  it("T-RL3: Verschiedene E-Mails haben unabhängige Zähler", async () => {
    const emailA = `ratelimit-a-${Date.now()}@simplapos.com`;
    const emailB = `ratelimit-b-${Date.now()}@simplapos.com`;

    // E-Mail A: 10 Versuche → geblockt
    for (let i = 1; i <= 10; i++) {
      await attemptLogin(emailA, "falsch");
    }
    const resultA = await attemptLogin(emailA, "falsch");
    expect(resultA.code).toBe("TOO_MANY_REQUESTS");

    // E-Mail B: noch nicht geblockt
    const resultB = await attemptLogin(emailB, "falsch");
    expect(resultB.code).toBe("UNAUTHORIZED"); // Nicht TOO_MANY_REQUESTS
  });

  it("T-RL4: Fehlermeldung enthält Wartezeit in Minuten", async () => {
    const testEmail = `ratelimit-msg-${Date.now()}@simplapos.com`;

    for (let i = 1; i <= 10; i++) {
      await attemptLogin(testEmail, "falsch");
    }

    const result = await attemptLogin(testEmail, "falsch");
    expect(result.code).toBe("TOO_MANY_REQUESTS");
    // Meldung soll Minuten enthalten
    expect(result.message).toMatch(/\d+\s*Minuten/);
  });

  it("T-RL5: Normaler Login-Fehler (UNAUTHORIZED) enthält keine Rate-Limit-Meldung", async () => {
    const testEmail = `ratelimit-normal-${Date.now()}@simplapos.com`;
    const result = await attemptLogin(testEmail, "falsch");
    expect(result.code).toBe("UNAUTHORIZED");
    expect(result.message).not.toContain("Zu viele Anmeldeversuche");
  });

  it("T-RL6: Blockierung ist E-Mail-spezifisch (Gross-/Kleinschreibung ignoriert)", async () => {
    const baseEmail = `ratelimit-case-${Date.now()}`;
    const emailLower = `${baseEmail}@simplapos.com`;
    const emailUpper = `${baseEmail.toUpperCase()}@SIMPLAPOS.COM`;

    // Versuche mit Kleinschreibung
    for (let i = 1; i <= 10; i++) {
      await attemptLogin(emailLower, "falsch");
    }

    // Versuch mit Grossschreibung → soll AUCH geblockt sein (gleicher Key)
    const result = await attemptLogin(emailUpper, "falsch");
    expect(result.code).toBe("TOO_MANY_REQUESTS");
  });
});

// ─── IP-Rate-Limiter (Middleware-Level) ──────────────────────────────────────

describe("M3: IP-Rate-Limiter (Middleware-Level)", () => {
  it("T-RL7: loginIpLimiter ist in server/_core/index.ts registriert", async () => {
    // Dieser Test prüft indirekt ob die Middleware konfiguriert ist
    // durch Lesen der Datei (struktureller Test)
    const fs = await import("fs");
    const path = await import("path");
    const indexPath = path.resolve(process.cwd(), "server/_core/index.ts");
    const indexContent = fs.readFileSync(indexPath, "utf-8");
    expect(indexContent).toContain("loginIpLimiter");
    expect(indexContent).toContain("express-rate-limit");
    expect(indexContent).toContain("/api/trpc/auth.login");
  });

  it("T-RL8: IP-Limiter-Konfiguration: windowMs = 15 Minuten, max = 20", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const indexPath = path.resolve(process.cwd(), "server/_core/index.ts");
    const indexContent = fs.readFileSync(indexPath, "utf-8");
    // Prüfe Konfigurationswerte
    expect(indexContent).toContain("15 * 60 * 1000");
    expect(indexContent).toContain("max: 20");
  });
});
