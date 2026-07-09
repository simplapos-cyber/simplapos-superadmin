import { describe, it, expect } from "vitest";

describe("VAPID Keys", () => {
  it("VAPID_PUBLIC_KEY ist gesetzt und hat korrektes Format", () => {
    const key = process.env.VAPID_PUBLIC_KEY;
    expect(key, "VAPID_PUBLIC_KEY muss gesetzt sein").toBeTruthy();
    // VAPID Public Key ist Base64url-encoded, 87-88 Zeichen lang (65 Bytes = 520 Bits)
    expect(key!.length).toBeGreaterThan(80);
    expect(key!.length).toBeLessThan(100);
    // Darf keine Leerzeichen enthalten
    expect(key).not.toMatch(/\s/);
  });

  it("VAPID_PRIVATE_KEY ist gesetzt und hat korrektes Format", () => {
    const key = process.env.VAPID_PRIVATE_KEY;
    expect(key, "VAPID_PRIVATE_KEY muss gesetzt sein").toBeTruthy();
    // VAPID Private Key ist Base64url-encoded, 43-44 Zeichen lang (32 Bytes)
    expect(key!.length).toBeGreaterThan(40);
    expect(key!.length).toBeLessThan(50);
    expect(key).not.toMatch(/\s/);
  });

  it("VITE_VAPID_PUBLIC_KEY stimmt mit VAPID_PUBLIC_KEY überein", () => {
    expect(process.env.VITE_VAPID_PUBLIC_KEY).toBe(process.env.VAPID_PUBLIC_KEY);
  });
});
