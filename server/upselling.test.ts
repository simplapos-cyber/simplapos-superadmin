import { describe, it, expect } from "vitest";

// ─── Hilfsfunktionen aus der Upselling-Engine (pure Logik) ───────────────────

/** Berechnet verbleibende Tage bis Ablaufdatum */
function daysUntilExpiry(expiresAt: Date): number {
  return Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
}

/** Berechnet Ablauf-Rabattpreis */
function calcExpiryPrice(basePrice: number, discountPct: number): number {
  return Math.round(basePrice * (1 - discountPct / 100) * 100) / 100;
}

/** Filtert ablaufende Artikel (≤ daysAhead Tage) */
function filterExpiringItems(
  items: { id: number; name: string; expiresAt: Date | null; price: number }[],
  daysAhead: number
): typeof items {
  const cutoff = new Date(Date.now() + daysAhead * 86400000);
  return items.filter(i => i.expiresAt !== null && i.expiresAt <= cutoff);
}

/** Prüft ob eine Upselling-Regel auf gescannte Produkte zutrifft */
function ruleMatches(
  rule: { triggerType: string; triggerProductId: number | null; triggerCategory: string | null },
  scannedProductIds: number[],
  scannedCategories: string[]
): boolean {
  if (rule.triggerType === "any") return true;
  if (rule.triggerType === "expiry") return true;
  if (rule.triggerType === "product" && rule.triggerProductId !== null) {
    return scannedProductIds.includes(rule.triggerProductId);
  }
  if (rule.triggerType === "category" && rule.triggerCategory !== null) {
    return scannedCategories.includes(rule.triggerCategory);
  }
  return false;
}

/** Generiert Abholnummer (dreistellig, padded) */
function generatePickupNumber(lastNumber: number): string {
  const next = (lastNumber % 999) + 1;
  return String(next).padStart(3, "0");
}

/** Multi-Tenant-Isolation: Regeln nur für eigenes Restaurant */
function filterRulesByRestaurant(
  rules: { id: number; restaurantId: number; suggestedLabel: string }[],
  restaurantId: number
): typeof rules {
  return rules.filter(r => r.restaurantId === restaurantId);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Upselling: Ablaufdatum-Logik", () => {
  it("berechnet verbleibende Tage korrekt", () => {
    const tomorrow = new Date(Date.now() + 86400000);
    expect(daysUntilExpiry(tomorrow)).toBe(1);
  });

  it("berechnet Ablauf-Rabattpreis korrekt (20% Rabatt auf CHF 5.00)", () => {
    expect(calcExpiryPrice(5.0, 20)).toBe(4.0);
  });

  it("berechnet Ablauf-Rabattpreis korrekt (15% Rabatt auf CHF 3.30)", () => {
    expect(calcExpiryPrice(3.3, 15)).toBe(2.81);
  });

  it("filtert ablaufende Artikel korrekt (innerhalb 7 Tage)", () => {
    const items = [
      { id: 1, name: "Cola", expiresAt: new Date(Date.now() + 3 * 86400000), price: 2.5 },
      { id: 2, name: "Red Bull", expiresAt: new Date(Date.now() + 10 * 86400000), price: 3.5 },
      { id: 3, name: "Wasser", expiresAt: null, price: 1.5 },
    ];
    const expiring = filterExpiringItems(items, 7);
    expect(expiring).toHaveLength(1);
    expect(expiring[0].id).toBe(1);
  });

  it("gibt keine ablaufenden Artikel zurück wenn alle weit in der Zukunft", () => {
    const items = [
      { id: 1, name: "Cola", expiresAt: new Date(Date.now() + 30 * 86400000), price: 2.5 },
    ];
    expect(filterExpiringItems(items, 7)).toHaveLength(0);
  });

  it("ignoriert Artikel ohne Ablaufdatum", () => {
    const items = [
      { id: 1, name: "Chips", expiresAt: null, price: 2.0 },
    ];
    expect(filterExpiringItems(items, 7)).toHaveLength(0);
  });
});

describe("Upselling: Regel-Matching", () => {
  it("'any'-Regel trifft immer zu", () => {
    const rule = { triggerType: "any", triggerProductId: null, triggerCategory: null };
    expect(ruleMatches(rule, [], [])).toBe(true);
    expect(ruleMatches(rule, [1, 2, 3], ["Getränke"])).toBe(true);
  });

  it("'product'-Regel trifft nur bei passendem Produkt zu", () => {
    const rule = { triggerType: "product", triggerProductId: 42, triggerCategory: null };
    expect(ruleMatches(rule, [42, 55], [])).toBe(true);
    expect(ruleMatches(rule, [10, 20], [])).toBe(false);
  });

  it("'category'-Regel trifft nur bei passender Kategorie zu", () => {
    const rule = { triggerType: "category", triggerProductId: null, triggerCategory: "Getränke" };
    expect(ruleMatches(rule, [], ["Getränke", "Snacks"])).toBe(true);
    expect(ruleMatches(rule, [], ["Snacks"])).toBe(false);
  });

  it("'expiry'-Regel trifft immer zu (wird separat gefiltert)", () => {
    const rule = { triggerType: "expiry", triggerProductId: null, triggerCategory: null };
    expect(ruleMatches(rule, [], [])).toBe(true);
  });

  it("unbekannter Trigger-Typ trifft nicht zu", () => {
    const rule = { triggerType: "unknown", triggerProductId: null, triggerCategory: null };
    expect(ruleMatches(rule, [1], ["Kat"])).toBe(false);
  });
});

describe("Upselling: Abholnummer-Generierung", () => {
  it("generiert dreistellige Abholnummer", () => {
    expect(generatePickupNumber(0)).toBe("001");
    expect(generatePickupNumber(41)).toBe("042");
    expect(generatePickupNumber(999)).toBe("001"); // Wrap-around
  });

  it("padded Nummern korrekt auf 3 Stellen", () => {
    expect(generatePickupNumber(8)).toBe("009");
    expect(generatePickupNumber(99)).toBe("100");
  });
});

describe("Upselling: Multi-Tenant-Isolation", () => {
  const allRules = [
    { id: 1, restaurantId: 10, suggestedLabel: "Pommes" },
    { id: 2, restaurantId: 10, suggestedLabel: "Cola" },
    { id: 3, restaurantId: 20, suggestedLabel: "Wasser" },
    { id: 4, restaurantId: 30, suggestedLabel: "Bier" },
  ];

  it("gibt nur Regeln des eigenen Restaurants zurück", () => {
    const result = filterRulesByRestaurant(allRules, 10);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.restaurantId === 10)).toBe(true);
  });

  it("gibt leere Liste zurück wenn kein Restaurant passt", () => {
    expect(filterRulesByRestaurant(allRules, 99)).toHaveLength(0);
  });

  it("gibt keine Regeln anderer Restaurants zurück", () => {
    const result = filterRulesByRestaurant(allRules, 20);
    expect(result).toHaveLength(1);
    expect(result[0].suggestedLabel).toBe("Wasser");
  });
});
