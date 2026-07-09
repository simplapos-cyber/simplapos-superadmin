/**
 * shiftSwap.test.ts – Vitest-Tests für den Schicht-Tausch-Router
 */
import { describe, it, expect } from "vitest";

// ─── Unit-Tests: Statusübergänge ─────────────────────────────────────────────
describe("shiftSwap – Statusübergänge", () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    open: ["accepted", "cancelled"],
    accepted: ["admin_approved", "admin_declined", "cancelled"],
    admin_approved: [],
    admin_declined: [],
    cancelled: [],
  };

  function canTransition(from: string, to: string): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  it("open → accepted ist erlaubt", () => {
    expect(canTransition("open", "accepted")).toBe(true);
  });

  it("open → cancelled ist erlaubt", () => {
    expect(canTransition("open", "cancelled")).toBe(true);
  });

  it("accepted → admin_approved ist erlaubt", () => {
    expect(canTransition("accepted", "admin_approved")).toBe(true);
  });

  it("accepted → admin_declined ist erlaubt", () => {
    expect(canTransition("accepted", "admin_declined")).toBe(true);
  });

  it("admin_approved → cancelled ist NICHT erlaubt", () => {
    expect(canTransition("admin_approved", "cancelled")).toBe(false);
  });

  it("admin_declined → accepted ist NICHT erlaubt", () => {
    expect(canTransition("admin_declined", "accepted")).toBe(false);
  });

  it("cancelled → open ist NICHT erlaubt", () => {
    expect(canTransition("cancelled", "open")).toBe(false);
  });
});

// ─── Unit-Tests: Validierungslogik ───────────────────────────────────────────
describe("shiftSwap – Validierung", () => {
  function validateSwapRequest(input: {
    offeredShiftId: number;
    requesterNote?: string;
  }): { valid: boolean; error?: string } {
    if (!input.offeredShiftId || input.offeredShiftId <= 0) {
      return { valid: false, error: "Ungültige Schicht-ID" };
    }
    if (input.requesterNote && input.requesterNote.length > 500) {
      return { valid: false, error: "Notiz zu lang (max. 500 Zeichen)" };
    }
    return { valid: true };
  }

  it("gültige Anfrage wird akzeptiert", () => {
    const result = validateSwapRequest({ offeredShiftId: 1 });
    expect(result.valid).toBe(true);
  });

  it("Schicht-ID 0 wird abgelehnt", () => {
    const result = validateSwapRequest({ offeredShiftId: 0 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Ungültige Schicht-ID");
  });

  it("negative Schicht-ID wird abgelehnt", () => {
    const result = validateSwapRequest({ offeredShiftId: -5 });
    expect(result.valid).toBe(false);
  });

  it("Notiz mit 500 Zeichen ist erlaubt", () => {
    const result = validateSwapRequest({
      offeredShiftId: 1,
      requesterNote: "a".repeat(500),
    });
    expect(result.valid).toBe(true);
  });

  it("Notiz mit 501 Zeichen wird abgelehnt", () => {
    const result = validateSwapRequest({
      offeredShiftId: 1,
      requesterNote: "a".repeat(501),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Notiz zu lang");
  });
});

// ─── Unit-Tests: Benachrichtigungs-Texte ─────────────────────────────────────
describe("shiftSwap – Benachrichtigungs-Texte", () => {
  function buildNotificationContent(
    type: "offer" | "accepted" | "approved" | "declined",
    params: { requesterName: string; targetName?: string; date: string; start: string; end: string }
  ): { title: string; content: string } {
    switch (type) {
      case "offer":
        return {
          title: "Neues Schicht-Tausch-Angebot",
          content: `${params.requesterName} bietet die Schicht am ${params.date} (${params.start}–${params.end}) zum Tausch an.`,
        };
      case "accepted":
        return {
          title: "Schicht-Tausch angenommen",
          content: `${params.targetName ?? "Ein Kollege"} hat dein Tausch-Angebot für ${params.date} angenommen. Warte auf Admin-Genehmigung.`,
        };
      case "approved":
        return {
          title: "Schicht-Tausch genehmigt ✓",
          content: `Der Tausch für ${params.date} wurde genehmigt. Dein Dienstplan wurde aktualisiert.`,
        };
      case "declined":
        return {
          title: "Schicht-Tausch abgelehnt",
          content: `Der Tausch für ${params.date} wurde vom Admin abgelehnt.`,
        };
    }
  }

  it("Angebot-Benachrichtigung enthält Requester-Name", () => {
    const n = buildNotificationContent("offer", {
      requesterName: "Max Muster",
      date: "2026-06-15",
      start: "09:00",
      end: "17:00",
    });
    expect(n.title).toBe("Neues Schicht-Tausch-Angebot");
    expect(n.content).toContain("Max Muster");
    expect(n.content).toContain("2026-06-15");
  });

  it("Annahme-Benachrichtigung enthält Target-Name", () => {
    const n = buildNotificationContent("accepted", {
      requesterName: "Max Muster",
      targetName: "Anna Beispiel",
      date: "2026-06-15",
      start: "09:00",
      end: "17:00",
    });
    expect(n.content).toContain("Anna Beispiel");
    expect(n.content).toContain("Admin-Genehmigung");
  });

  it("Genehmigung-Benachrichtigung enthält Datum", () => {
    const n = buildNotificationContent("approved", {
      requesterName: "Max Muster",
      date: "2026-06-15",
      start: "09:00",
      end: "17:00",
    });
    expect(n.title).toContain("genehmigt");
    expect(n.content).toContain("2026-06-15");
    expect(n.content).toContain("Dienstplan");
  });

  it("Ablehnung-Benachrichtigung hat korrekten Titel", () => {
    const n = buildNotificationContent("declined", {
      requesterName: "Max Muster",
      date: "2026-06-15",
      start: "09:00",
      end: "17:00",
    });
    expect(n.title).toBe("Schicht-Tausch abgelehnt");
  });
});

// ─── Unit-Tests: Multi-Tenant-Isolation ──────────────────────────────────────
describe("shiftSwap – Multi-Tenant-Isolation", () => {
  interface SwapRequest {
    id: number;
    restaurantId: number;
    requesterId: string;
    status: string;
  }

  function filterSwapsForUser(
    swaps: SwapRequest[],
    userId: string,
    restaurantId: number
  ): SwapRequest[] {
    return swaps.filter(
      (s) => s.restaurantId === restaurantId &&
        (s.requesterId === userId || s.status === "open")
    );
  }

  const testSwaps: SwapRequest[] = [
    { id: 1, restaurantId: 1, requesterId: "user-a", status: "open" },
    { id: 2, restaurantId: 1, requesterId: "user-b", status: "accepted" },
    { id: 3, restaurantId: 2, requesterId: "user-a", status: "open" },
    { id: 4, restaurantId: 1, requesterId: "user-a", status: "cancelled" },
  ];

  it("Kellner sieht nur Swaps seines Restaurants", () => {
    const result = filterSwapsForUser(testSwaps, "user-c", 1);
    expect(result.every((s) => s.restaurantId === 1)).toBe(true);
    expect(result.some((s) => s.restaurantId === 2)).toBe(false);
  });

  it("Kellner sieht offene Angebote anderer Kollegen im gleichen Restaurant", () => {
    const result = filterSwapsForUser(testSwaps, "user-c", 1);
    expect(result.some((s) => s.id === 1)).toBe(true); // open von user-a
  });

  it("Kellner sieht keine accepted-Swaps anderer", () => {
    const result = filterSwapsForUser(testSwaps, "user-c", 1);
    expect(result.some((s) => s.id === 2)).toBe(false); // accepted von user-b
  });

  it("Kellner sieht eigene cancelled-Swaps", () => {
    const result = filterSwapsForUser(testSwaps, "user-a", 1);
    expect(result.some((s) => s.id === 4)).toBe(true);
  });
});
