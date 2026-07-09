/**
 * M4 Security Tests: Helmet / Content Security Policy
 *
 * Prüft strukturell ob Helmet korrekt konfiguriert ist:
 * - helmet-Import in index.ts vorhanden
 * - CSP-Direktiven konfiguriert (defaultSrc, scriptSrc, frameSrc, objectSrc)
 * - Stripe-Whitelist vorhanden
 * - Manus-Storage-Whitelist vorhanden
 * - HSTS konfiguriert
 * - crossOriginEmbedderPolicy deaktiviert (Stripe-Kompatibilität)
 */

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const INDEX_PATH = path.resolve(process.cwd(), "server/_core/index.ts");

function readIndex(): string {
  return fs.readFileSync(INDEX_PATH, "utf-8");
}

describe("M4: Helmet/CSP – Strukturelle Konfigurationsprüfung", () => {
  it("T-H1: helmet-Paket ist importiert", () => {
    const content = readIndex();
    expect(content).toContain("import helmet from \"helmet\"");
  });

  it("T-H2: Helmet-Middleware ist registriert (app.use(helmet(...)))", () => {
    const content = readIndex();
    expect(content).toContain("app.use(helmet(");
  });

  it("T-H3: CSP defaultSrc ist auf 'self' gesetzt", () => {
    const content = readIndex();
    expect(content).toContain("defaultSrc");
    expect(content).toContain("'self'");
  });

  it("T-H4: Stripe-Scripts sind in scriptSrc whitelisted", () => {
    const content = readIndex();
    expect(content).toContain("https://js.stripe.com");
  });

  it("T-H5: Stripe-iframes sind in frameSrc whitelisted", () => {
    const content = readIndex();
    expect(content).toContain("frameSrc");
    expect(content).toContain("https://js.stripe.com");
    expect(content).toContain("https://hooks.stripe.com");
  });

  it("T-H6: Stripe-API ist in connectSrc whitelisted", () => {
    const content = readIndex();
    expect(content).toContain("connectSrc");
    expect(content).toContain("https://api.stripe.com");
  });

  it("T-H7: Manus-Storage ist in imgSrc und connectSrc whitelisted", () => {
    const content = readIndex();
    expect(content).toContain("https://*.manus.space");
    expect(content).toContain("https://*.manus.computer");
  });

  it("T-H8: objectSrc ist auf 'none' gesetzt (verhindert Plugin-Angriffe)", () => {
    const content = readIndex();
    expect(content).toContain("objectSrc");
    expect(content).toContain("'none'");
  });

  it("T-H9: HSTS ist konfiguriert (maxAge = 1 Jahr)", () => {
    const content = readIndex();
    expect(content).toContain("hsts");
    expect(content).toContain("31536000");
    expect(content).toContain("includeSubDomains: true");
  });

  it("T-H10: crossOriginEmbedderPolicy ist deaktiviert (Stripe-Kompatibilität)", () => {
    const content = readIndex();
    expect(content).toContain("crossOriginEmbedderPolicy: false");
  });

  it("T-H11: Referrer-Policy ist konfiguriert", () => {
    const content = readIndex();
    expect(content).toContain("referrerPolicy");
    expect(content).toContain("strict-origin-when-cross-origin");
  });

  it("T-H12: X-Frame-Options (frameguard) ist auf sameorigin gesetzt", () => {
    const content = readIndex();
    expect(content).toContain("frameguard");
    expect(content).toContain("sameorigin");
  });

  it("T-H13: Google Fonts sind in styleSrc und fontSrc whitelisted", () => {
    const content = readIndex();
    expect(content).toContain("https://fonts.googleapis.com");
    expect(content).toContain("https://fonts.gstatic.com");
  });

  it("T-H14: Vite HMR WebSocket ist in connectSrc whitelisted", () => {
    const content = readIndex();
    expect(content).toContain("wss://*.manus.computer");
  });
});
