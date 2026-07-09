// ─── BUILDNAV TESTS ───────────────────────────────────────────────────────────
// Tests for client/src/lib/buildNav.ts
// Runs via vitest in the server test environment (shared/ is accessible)
// Multi-Tenant scenarios: Restaurant A, Restaurant B, Restaurant C, Superadmin

import { describe, it, expect } from "vitest";
import { buildNav, buildMobileBottomTabs } from "../client/src/lib/buildNav";

// ─── SUPERADMIN ───────────────────────────────────────────────────────────────
describe("Superadmin Navigation", () => {
  it("T-SA1: Superadmin sieht alle Superadmin-Menüpunkte", () => {
    const groups = buildNav({ role: "superadmin" });
    const allItems = groups.flatMap((g) => g.items);
    expect(allItems.length).toBeGreaterThanOrEqual(16);
    expect(allItems.some((i) => i.id === "sa-dashboard")).toBe(true);
    expect(allItems.some((i) => i.id === "sa-restaurants")).toBe(true);
    expect(allItems.some((i) => i.id === "sa-users")).toBe(true);
    expect(allItems.some((i) => i.id === "sa-contracts")).toBe(true);
    expect(allItems.some((i) => i.id === "sa-audit")).toBe(true);
    expect(allItems.some((i) => i.id === "sa-monitor")).toBe(true);
  });

  it("T-SA2: Superadmin sieht keine Admin-Menüpunkte", () => {
    const groups = buildNav({ role: "superadmin" });
    const allItems = groups.flatMap((g) => g.items);
    expect(allItems.some((i) => i.id === "a-dashboard")).toBe(false);
    expect(allItems.some((i) => i.id === "a-staff")).toBe(false);
  });

  it("T-SA3: Superadmin sieht Dashboard unabhängig von bookedModules (keine moduleId)", () => {
    // Superadmin items have no moduleId → not filtered by module logic
    // accessPhase "paid" (default) → no blocking
    const groups = buildNav({ role: "superadmin", bookedModules: [], accessPhase: "paid" });
    const allItems = groups.flatMap((g) => g.items);
    expect(allItems.some((i) => i.id === "sa-dashboard")).toBe(true);
    // Verify: no moduleId on any superadmin item
    expect(allItems.filter((i) => i.id.startsWith("sa-")).every((i) => !i.moduleId)).toBe(true);
  });
});

// ─── RESTAURANT A: Basis + Reservierung + Personal ───────────────────────────
describe("Restaurant A (Basis + Reservierung + Personal)", () => {
  const ctx = {
    role: "admin" as const,
    restaurantId: 1,
    accessPhase: "paid" as const,
    bookedModules: ["cloud_pos_basis", "tischreservierung", "personal"],
    paymentStatus: "ok" as const,
  };

  it("T-RA1: Dashboard sichtbar (Basis)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-dashboard")).toBe(true);
  });

  it("T-RA2: Reservierungen sichtbar (Modul gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-reservations")).toBe(true);
  });

  it("T-RA3: Mitarbeiter sichtbar (Personal gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-staff")).toBe(true);
  });

  it("T-RA4: Lieferung NICHT sichtbar (nicht gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-delivery")).toBe(false);
    expect(items.some((i) => i.id === "a-takeaway")).toBe(false);
  });

  it("T-RA5: Gutscheine NICHT sichtbar (nicht gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-vouchers")).toBe(false);
  });

  it("T-RA6: Treuepunkte NICHT sichtbar (nicht gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-loyalty")).toBe(false);
  });

  it("T-RA7: Rechnungen immer sichtbar (alwaysVisible)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-invoices")).toBe(true);
  });
});

// ─── RESTAURANT B: Basis + Lieferung + Gutscheine + Treuepunkte ──────────────
describe("Restaurant B (Basis + Lieferung + Gutscheine + Loyalty)", () => {
  const ctx = {
    role: "admin" as const,
    restaurantId: 2,
    accessPhase: "paid" as const,
    bookedModules: ["cloud_pos_basis", "lieferung", "gutscheine", "loyalty"],
    paymentStatus: "ok" as const,
  };

  it("T-RB1: Lieferung sichtbar (Modul gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-delivery")).toBe(true);
    expect(items.some((i) => i.id === "a-takeaway")).toBe(true);
  });

  it("T-RB2: Gutscheine sichtbar (Modul gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-vouchers")).toBe(true);
  });

  it("T-RB3: Treuepunkte sichtbar (Modul gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-loyalty")).toBe(true);
  });

  it("T-RB4: Reservierungen NICHT sichtbar (nicht gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-reservations")).toBe(false);
  });

  it("T-RB5: Mitarbeiter NICHT sichtbar (Personal nicht gebucht)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-staff")).toBe(false);
  });

  it("T-RB6: Restaurant B sieht keine Restaurant-A-exklusiven Module", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    // tischreservierung and personal are not in Restaurant B's modules
    expect(items.some((i) => i.id === "a-reservations")).toBe(false);
    expect(items.some((i) => i.id === "a-shifts")).toBe(false);
  });
});

// ─── RESTAURANT C: Testphase (full) – alle Module sichtbar ───────────────────
describe("Restaurant C (Testphase full – alle Module sichtbar)", () => {
  const ctx = {
    role: "admin" as const,
    restaurantId: 3,
    accessPhase: "full" as const,
    bookedModules: [], // Keine Module gebucht
    paymentStatus: "ok" as const,
  };

  it("T-RC1: Alle Admin-Menüpunkte sichtbar (Testphase ignoriert Modulfilter)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-reservations")).toBe(true);
    expect(items.some((i) => i.id === "a-delivery")).toBe(true);
    expect(items.some((i) => i.id === "a-staff")).toBe(true);
    expect(items.some((i) => i.id === "a-vouchers")).toBe(true);
    expect(items.some((i) => i.id === "a-loyalty")).toBe(true);
    expect(items.some((i) => i.id === "a-inventory")).toBe(true);
    expect(items.some((i) => i.id === "a-marketing")).toBe(true);
  });

  it("T-RC2: Testphase zeigt keine Superadmin-Menüpunkte", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "sa-dashboard")).toBe(false);
    expect(items.some((i) => i.id === "sa-users")).toBe(false);
  });
});

// ─── RESTAURANT C: Gesperrt (blocked) ────────────────────────────────────────
describe("Restaurant C (Phase blocked – nur alwaysVisible)", () => {
  const ctx = {
    role: "admin" as const,
    restaurantId: 3,
    accessPhase: "blocked" as const,
    bookedModules: ["cloud_pos_basis"],
    paymentStatus: "ok" as const,
  };

  it("T-RC3: Nur alwaysVisible-Menüpunkte sichtbar bei blocked", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    // alwaysVisible items
    expect(items.some((i) => i.id === "a-invoices")).toBe(true);
    expect(items.some((i) => i.id === "a-closings")).toBe(true);
    expect(items.some((i) => i.id === "a-orders")).toBe(true);
    expect(items.some((i) => i.id === "a-support")).toBe(true);
  });

  it("T-RC4: Nicht-alwaysVisible Menüpunkte NICHT sichtbar bei blocked", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-dashboard")).toBe(false);
    expect(items.some((i) => i.id === "a-staff")).toBe(false);
    expect(items.some((i) => i.id === "a-settings")).toBe(false);
  });
});

// ─── ZAHLUNGSSTATUS: overdue_blocked ─────────────────────────────────────────
describe("Zahlungsstatus overdue_blocked", () => {
  const ctx = {
    role: "admin" as const,
    restaurantId: 1,
    accessPhase: "paid" as const,
    bookedModules: ["cloud_pos_basis", "tischreservierung", "personal"],
    paymentStatus: "overdue_blocked" as const,
  };

  it("T-OB1: Bestellungen sichtbar (Whitelist)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-orders")).toBe(true);
  });

  it("T-OB2: Rechnungen sichtbar (alwaysVisible)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-invoices")).toBe(true);
  });

  it("T-OB3: Einstellungen NICHT sichtbar (nicht in Whitelist)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-settings")).toBe(false);
  });

  it("T-OB4: Mitarbeiter NICHT sichtbar (nicht in Whitelist)", () => {
    const groups = buildNav(ctx);
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-staff")).toBe(false);
  });
});

// ─── ROLLEN-ISOLATION ─────────────────────────────────────────────────────────
describe("Rollen-Isolation (Multi-Tenant)", () => {
  it("T-RI1: Kellner sieht keine Admin-Menüpunkte", () => {
    const groups = buildNav({ role: "kellner", restaurantId: 1 });
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-dashboard")).toBe(false);
    expect(items.some((i) => i.id === "a-staff")).toBe(false);
    expect(items.some((i) => i.id === "a-settings")).toBe(false);
  });

  it("T-RI2: Manager sieht keine Superadmin-Menüpunkte", () => {
    const groups = buildNav({ role: "manager", restaurantId: 1 });
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "sa-users")).toBe(false);
    expect(items.some((i) => i.id === "sa-contracts")).toBe(false);
  });

  it("T-RI3: Partner sieht keine Admin-Menüpunkte", () => {
    const groups = buildNav({ role: "partner" });
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-dashboard")).toBe(false);
    expect(items.some((i) => i.id === "sa-dashboard")).toBe(false);
  });

  it("T-RI4: Treuhand sieht keine Admin-Menüpunkte", () => {
    const groups = buildNav({ role: "buchhalter", restaurantId: 1 });
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "a-staff")).toBe(false);
    expect(items.some((i) => i.id === "a-settings")).toBe(false);
    expect(items.some((i) => i.id === "bk-dashboard")).toBe(true);
  });

  it("T-RI5: barkeeper-Rolle erhält Bar-Navigation (DB-Alias-Fix)", () => {
    const groups = buildNav({ role: "barkeeper", restaurantId: 1 });
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.id === "bar-new")).toBe(true);
    expect(items.some((i) => i.id === "bar-prep")).toBe(true);
  });

  it("T-RI6: Admin ohne restaurantId sieht keine restaurant-spezifischen Menüpunkte", () => {
    const groups = buildNav({ role: "admin", restaurantId: null });
    const items = groups.flatMap((g) => g.items);
    expect(items.some((i) => i.requiresRestaurant)).toBe(false);
  });
});

// ─── MOBILE BOTTOM TABS ───────────────────────────────────────────────────────
describe("Mobile Bottom Tabs", () => {
  it("T-MB1: Kellner hat max. 5 Bottom Tabs", () => {
    const tabs = buildMobileBottomTabs({ role: "kellner", restaurantId: 1 });
    expect(tabs.length).toBeLessThanOrEqual(5);
    expect(tabs.length).toBeGreaterThan(0);
  });

  it("T-MB2: Küche hat Bottom Tabs", () => {
    const tabs = buildMobileBottomTabs({ role: "koch", restaurantId: 1 });
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs.some((t) => t.id === "kds-new")).toBe(true);
  });

  it("T-MB3: Superadmin hat keine Bottom Tabs", () => {
    const tabs = buildMobileBottomTabs({ role: "superadmin" });
    expect(tabs.length).toBe(0);
  });

  it("T-MB4: Bottom Tabs sind nach mobileBottomOrder sortiert", () => {
    const tabs = buildMobileBottomTabs({ role: "kellner", restaurantId: 1 });
    for (let i = 1; i < tabs.length; i++) {
      expect((tabs[i].mobileBottomOrder ?? 99)).toBeGreaterThanOrEqual(tabs[i - 1].mobileBottomOrder ?? 0);
    }
  });
});

// ─── GRUPPEN-STRUKTUR ─────────────────────────────────────────────────────────
describe("Gruppen-Struktur", () => {
  it("T-GR1: Superadmin hat 7 Gruppen", () => {
    const groups = buildNav({ role: "superadmin" });
    expect(groups.length).toBe(7);
  });

  it("T-GR2: Restaurant A hat korrekte Gruppen", () => {
    const groups = buildNav({
      role: "admin",
      restaurantId: 1,
      accessPhase: "paid",
      bookedModules: ["cloud_pos_basis", "tischreservierung", "personal"],
    });
    const groupNames = groups.map((g) => g.group);
    expect(groupNames).toContain("Übersicht");
    expect(groupNames).toContain("Speisekarte & Kiosk");
    expect(groupNames).toContain("Finanzen");
    expect(groupNames).toContain("Einstellungen");
    expect(groupNames).toContain("Personal");
    expect(groupNames).toContain("Verkauf & Kasse");
  });

  it("T-GR3: Kellner hat 4 Gruppen", () => {
    const groups = buildNav({ role: "kellner", restaurantId: 1 });
    expect(groups.length).toBe(4);
  });
});
