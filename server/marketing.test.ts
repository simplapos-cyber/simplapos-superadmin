/**
 * marketing.test.ts
 * Tests für das Marketing-Modul (Einstellungen, Posts, Plattformen, Bewertungs-Booster)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      dishName: "Wiener Schnitzel",
      analysis: "Ein klassisches Wiener Schnitzel, goldbraun und knusprig gebraten.",
      captionInstagram: "Goldbraun, knusprig, unwiderstehlich! 🍽️ #WienerSchnitzel #Restaurant #Foodie",
      captionFacebook: "Geniessen Sie unser klassisches Wiener Schnitzel. Frisch zubereitet, jeden Tag. Reservieren Sie jetzt!",
      captionGoogle: "Klassisches Wiener Schnitzel aus frischen Zutaten. Täglich frisch zubereitet. Besuchen Sie uns!",
      captionTiktok: "Das beste Schnitzel der Stadt 😍 #foodtok #schnitzel #restaurant",
      hashtags: ["WienerSchnitzel", "Restaurant", "Foodie", "Mittagessen"],
      bestPostingTime: "11:30",
      weatherRelevance: "Ja – ein herzhaftes Schnitzel passt perfekt zum kühlen Wetter.",
    }) } }],
  }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({ url: "https://example.com/generated.jpg" }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/manus-storage/test-key" }),
}));

// ─── Test-Kontext ─────────────────────────────────────────────────────────────

const adminCtx = {
  user: { id: 1, openId: "test-openid", name: "Test Admin", email: "admin@test.com", role: "admin" as const, restaurantId: 1, createdAt: new Date() },
  req: {} as never,
  res: {} as never,
};

const caller = appRouter.createCaller(adminCtx);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Marketing – Einstellungen", () => {
  it("getSettings gibt Standardwerte zurück wenn keine Einstellungen vorhanden", async () => {
    const result = await caller.marketing.getSettings();
    expect(result).toBeDefined();
    // Kann null sein wenn noch keine Einstellungen gespeichert
    if (result !== null) {
      expect(result).toHaveProperty("restaurantId");
    }
  });

  it("saveSettings speichert Einstellungen korrekt", async () => {
    // saveSettings nimmt flache Felder entgegen (kein verschachteltes 'settings'-Objekt)
    const result = await caller.marketing.saveSettings({
      googleReviewUrl: "https://g.page/r/test-restaurant/review",
      reviewBoosterEnabled: true,
      reviewBoosterDelayMinutes: 5,
      reviewBoosterMinRating: 4,
      weeklyReportEnabled: true,
      customerMarketingEnabled: true,
      reactivationEnabled: true,
      reactivationDays: 30,
      birthdayEnabled: true,
      waiterPhotoEnabled: true,
      waiterPhotoMinInterval: 2,
      waiterPhotoMaxPerDay: 5,
      autoPostEnabled: false,
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("success", true);
  });
});

describe("Marketing – Posts", () => {
  it("listPosts gibt leere Liste zurück wenn keine Posts vorhanden", async () => {
    const result = await caller.marketing.listPosts({ limit: 10, offset: 0 });
    expect(result).toBeDefined();
    // listPosts gibt direkt ein Array zurück
    expect(Array.isArray(result)).toBe(true);
  });

  it("listPosts unterstützt Status-Filter", async () => {
    const result = await caller.marketing.listPosts({ limit: 10, offset: 0, status: "draft" });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("analyzeAndGeneratePost erstellt einen neuen Post mit KI-Text", async () => {
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const result = await caller.marketing.analyzeAndGeneratePost({
      imageBase64: tinyPng,
      mimeType: "image/png",
      productName: "Wiener Schnitzel",
      sourceType: "manual",
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty("postId");
    // analyzeAndGeneratePost gibt plattformspezifische Captions zurück
    expect(result).toHaveProperty("captionInstagram");
    expect(typeof result.captionInstagram).toBe("string");
    expect(result.captionInstagram.length).toBeGreaterThan(0);
    expect(result).toHaveProperty("dishName");
  });
});

describe("Marketing – Plattformen", () => {
  it("getPlatforms gibt Liste der konfigurierten Plattformen zurück", async () => {
    const result = await caller.marketing.getPlatforms();
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("connectPlatform speichert Plattform-Verbindung", async () => {
    const result = await caller.marketing.connectPlatform({
      platform: "instagram",
      accessToken: "test-token-123",
      accountId: "test-account-id",
      accountName: "Test Restaurant",
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty("success", true);
  });

  it("disconnectPlatform entfernt Plattform-Verbindung", async () => {
    const result = await caller.marketing.disconnectPlatform({ platform: "instagram" });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("success", true);
  });
});

describe("Marketing – Bewertungs-Booster", () => {
  it("getReviewStats gibt Statistiken zurück", async () => {
    const result = await caller.marketing.getReviewStats();
    expect(result).toBeDefined();
    // Kann verschiedene Formen haben – nur prüfen dass es ein Objekt ist
    expect(typeof result).toBe("object");
  });
});

describe("Marketing – Kampagnen", () => {
  it("getCampaigns gibt Liste der Kampagnen zurück", async () => {
    const result = await caller.marketing.getCampaigns({ limit: 10 });
    expect(result).toBeDefined();
    // getCampaigns gibt direkt ein Array zurück
    expect(Array.isArray(result)).toBe(true);
  });

  it("getStats gibt Marketing-Statistiken zurück", async () => {
    const result = await caller.marketing.getStats();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});

describe("Marketing – Foto-Anfragen", () => {
  it("getPhotoRequests gibt Liste der Foto-Anfragen zurück", async () => {
    const result = await caller.marketing.getPhotoRequests({ status: "all" });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("getPhotoRequests unterstützt Status-Filter", async () => {
    const result = await caller.marketing.getPhotoRequests({ status: "pending" });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
