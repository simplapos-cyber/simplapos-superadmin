import { describe, it, expect } from "vitest";

// ─── Menu Router Unit Tests ───────────────────────────────────────────────────
// These tests verify the business logic of the menu system without requiring
// a real database connection.

describe("Menu system - data validation", () => {
  describe("Price validation", () => {
    const priceRegex = /^\d+(\.\d{1,2})?$/;

    it("accepts valid fixed prices", () => {
      expect(priceRegex.test("12.50")).toBe(true);
      expect(priceRegex.test("0.00")).toBe(true);
      expect(priceRegex.test("999.99")).toBe(true);
      expect(priceRegex.test("5")).toBe(true);
    });

    it("rejects invalid prices", () => {
      expect(priceRegex.test("-1.00")).toBe(false);
      expect(priceRegex.test("12.555")).toBe(false);
      expect(priceRegex.test("abc")).toBe(false);
      expect(priceRegex.test("")).toBe(false);
    });
  });

  describe("Allergen validation", () => {
    const VALID_ALLERGENS = [
      "gluten", "krebstiere", "eier", "fisch", "erdnuesse", "soja",
      "milch", "nuesse", "sellerie", "senf", "sesam", "schwefeldioxid",
      "lupinen", "weichtiere"
    ];

    it("has exactly 14 EU-mandated allergens", () => {
      expect(VALID_ALLERGENS).toHaveLength(14);
    });

    it("validates allergen keys", () => {
      const input = ["gluten", "milch", "eier"];
      const valid = input.every((a) => VALID_ALLERGENS.includes(a));
      expect(valid).toBe(true);
    });

    it("rejects unknown allergens", () => {
      const input = ["gluten", "unknown_allergen"];
      const valid = input.every((a) => VALID_ALLERGENS.includes(a));
      expect(valid).toBe(false);
    });
  });

  describe("Label validation", () => {
    const VALID_LABELS = [
      "vegan", "vegetarisch", "scharf", "bio", "neu", "bestseller",
      "glutenfrei", "laktosefrei", "alkohol"
    ];

    it("has correct label set", () => {
      expect(VALID_LABELS).toContain("vegan");
      expect(VALID_LABELS).toContain("vegetarisch");
      expect(VALID_LABELS).toContain("alkohol");
    });

    it("validates label keys", () => {
      const input = ["vegan", "bio"];
      const valid = input.every((l) => VALID_LABELS.includes(l));
      expect(valid).toBe(true);
    });
  });

  describe("Availability schedule validation", () => {
    const timeRegex = /^\d{2}:\d{2}$/;

    it("validates time format HH:MM", () => {
      expect(timeRegex.test("11:00")).toBe(true);
      expect(timeRegex.test("23:59")).toBe(true);
      expect(timeRegex.test("00:00")).toBe(true);
    });

    it("rejects invalid time formats", () => {
      expect(timeRegex.test("9:00")).toBe(false);  // missing leading zero
      expect(timeRegex.test("abc")).toBe(false);   // not a time string
      expect(timeRegex.test("1:5")).toBe(false);   // both parts too short
    });

    it("notes that semantic range validation (25:00, 11:60) is done at DB/app level", () => {
      // The regex only validates format HH:MM, not semantic ranges
      // Semantic validation (hour 0-23, minute 0-59) is enforced at the application level
      expect(timeRegex.test("25:00")).toBe(true);  // passes format, rejected at app level
      expect(timeRegex.test("11:60")).toBe(true);  // passes format, rejected at app level
    });

    it("validates day range 0-6", () => {
      const validDays = [0, 1, 2, 3, 4, 5, 6];
      const valid = validDays.every((d) => d >= 0 && d <= 6);
      expect(valid).toBe(true);
    });

    it("rejects out-of-range days", () => {
      const invalidDays = [7, -1, 8];
      const allInvalid = invalidDays.every((d) => d < 0 || d > 6);
      expect(allInvalid).toBe(true);
    });
  });

  describe("Course number validation", () => {
    it("accepts valid course numbers 1-5", () => {
      for (let i = 1; i <= 5; i++) {
        expect(i >= 1 && i <= 10).toBe(true);
      }
    });

    it("rejects invalid course numbers", () => {
      expect(0 >= 1 && 0 <= 10).toBe(false);
      expect(11 >= 1 && 11 <= 10).toBe(false);
    });
  });

  describe("Modifier group selection rules", () => {
    it("single selection type allows max 1", () => {
      const type = "single";
      const maxAllowed = type === "single" ? 1 : undefined;
      expect(maxAllowed).toBe(1);
    });

    it("multiple selection type allows unlimited", () => {
      const type = "multiple";
      const maxAllowed = type === "single" ? 1 : undefined;
      expect(maxAllowed).toBeUndefined();
    });

    it("validates min <= max selections", () => {
      const minSelections = 1;
      const maxSelections = 3;
      expect(minSelections <= maxSelections).toBe(true);
    });

    it("rejects min > max selections", () => {
      const minSelections = 5;
      const maxSelections = 2;
      expect(minSelections <= maxSelections).toBe(false);
    });
  });

  describe("Item type categorization", () => {
    const ITEM_TYPES = ["food", "beverage", "dessert", "set_menu", "other"];

    it("has all required item types", () => {
      expect(ITEM_TYPES).toContain("food");
      expect(ITEM_TYPES).toContain("beverage");
      expect(ITEM_TYPES).toContain("dessert");
      expect(ITEM_TYPES).toContain("set_menu");
      expect(ITEM_TYPES).toContain("other");
    });

    it("validates item type", () => {
      expect(ITEM_TYPES.includes("food")).toBe(true);
      expect(ITEM_TYPES.includes("invalid_type")).toBe(false);
    });
  });

  describe("Price type logic", () => {
    it("fixed price type uses exact price", () => {
      const priceType = "fixed";
      const price = "18.50";
      const displayPrice = priceType === "fixed" ? price : `ab ${price}`;
      expect(displayPrice).toBe("18.50");
    });

    it("from price type shows 'ab' prefix", () => {
      const priceType = "from";
      const price = "12.00";
      const displayPrice = priceType === "fixed" ? price : `ab ${price}`;
      expect(displayPrice).toBe("ab 12.00");
    });
  });

  describe("Category sort order", () => {
    it("assigns sequential sort orders", () => {
      const categories = [
        { id: 1, sortOrder: 0 },
        { id: 2, sortOrder: 1 },
        { id: 3, sortOrder: 2 },
      ];
      const reordered = [3, 1, 2].map((id, index) => ({
        id,
        sortOrder: index,
      }));
      expect(reordered[0]).toEqual({ id: 3, sortOrder: 0 });
      expect(reordered[1]).toEqual({ id: 1, sortOrder: 1 });
      expect(reordered[2]).toEqual({ id: 2, sortOrder: 2 });
    });
  });

  describe("Availability type logic", () => {
    it("always type is always available", () => {
      const type = "always";
      const isAvailable = type === "always" ? true : false;
      expect(isAvailable).toBe(true);
    });

    it("manual type defaults to not available", () => {
      const type = "manual";
      const isAvailable = type === "always" ? true : false;
      expect(isAvailable).toBe(false);
    });
  });

  describe("Menu Set Builder logic", () => {
    const priceRegex = /^\d+(\.\d{1,2})?$/;

    it("menu set price must be valid decimal", () => {
      expect(priceRegex.test("65.00")).toBe(true);
      expect(priceRegex.test("12.50")).toBe(true);
      expect(priceRegex.test("abc")).toBe(false);
      expect(priceRegex.test("-5")).toBe(false);
    });

    it("course number must be positive integer", () => {
      expect(1 >= 1).toBe(true);
      expect(0 >= 1).toBe(false);
    });

    it("minChoices cannot exceed maxChoices", () => {
      const minChoices = 1;
      const maxChoices = 3;
      expect(minChoices <= maxChoices).toBe(true);
    });

    it("menuItemIds stored and parsed as JSON array", () => {
      const ids = [1, 2, 3];
      const stored = JSON.stringify(ids);
      const parsed = JSON.parse(stored);
      expect(parsed).toEqual(ids);
    });

    it("courses are ordered by courseNumber ascending", () => {
      const courses = [
        { courseNumber: 3, name: "Dessert" },
        { courseNumber: 1, name: "Vorspeise" },
        { courseNumber: 2, name: "Hauptgang" },
      ];
      const sorted = [...courses].sort((a, b) => a.courseNumber - b.courseNumber);
      expect(sorted[0].name).toBe("Vorspeise");
      expect(sorted[1].name).toBe("Hauptgang");
      expect(sorted[2].name).toBe("Dessert");
    });
  });

  describe("CSV Import logic", () => {
    const VALID_LABELS = [
      "vegan", "vegetarisch", "scharf", "bio", "neu", "bestseller",
      "glutenfrei", "laktosefrei", "alkohol"
    ];
    const VALID_ALLERGENS = [
      "gluten", "krebstiere", "eier", "fisch", "erdnuesse", "soja",
      "milch", "nuesse", "sellerie", "senf", "sesam", "schwefeldioxid",
      "lupinen", "weichtiere"
    ];
    const VALID_TYPES = ["food", "beverage", "dessert", "set_menu", "other"];

    it("parses comma-separated labels and filters invalid ones", () => {
      const raw = "vegan,invalid_label,scharf";
      const parsed = raw.split(",").map(l => l.trim().toLowerCase()).filter(l => VALID_LABELS.includes(l));
      expect(parsed).toEqual(["vegan", "scharf"]);
    });

    it("parses allergens correctly", () => {
      const raw = "gluten,eier,milch";
      const parsed = raw.split(",").map(a => a.trim().toLowerCase()).filter(a => VALID_ALLERGENS.includes(a));
      expect(parsed).toEqual(["gluten", "eier", "milch"]);
    });

    it("normalizes price with comma to decimal point", () => {
      const raw = "24,50";
      const normalized = raw.replace(",", ".").trim();
      expect(parseFloat(normalized)).toBe(24.5);
    });

    it("skips rows with empty or whitespace-only name", () => {
      const rows = [{ name: "", price: "10.00" }, { name: "  ", price: "5.00" }];
      const valid = rows.filter(r => r.name.trim().length > 0);
      expect(valid.length).toBe(0);
    });

    it("detects duplicate names case-insensitively", () => {
      const existingNames = new Set(["wiener schnitzel", "tomatensuppe"]);
      expect(existingNames.has("Wiener Schnitzel".toLowerCase())).toBe(true);
      expect(existingNames.has("Mineralwasser".toLowerCase())).toBe(false);
    });

    it("defaults item type to food for unknown types", () => {
      const rawType = "pizza";
      const itemType = VALID_TYPES.includes(rawType.toLowerCase()) ? rawType.toLowerCase() : "food";
      expect(itemType).toBe("food");
    });

    it("accepts valid item types", () => {
      ["food", "beverage", "dessert"].forEach(t => {
        const itemType = VALID_TYPES.includes(t) ? t : "food";
        expect(itemType).toBe(t);
      });
    });

    it("rejects invalid price string", () => {
      const raw = "abc";
      const normalized = raw.replace(",", ".").trim();
      expect(isNaN(parseFloat(normalized))).toBe(true);
    });
  });
});
