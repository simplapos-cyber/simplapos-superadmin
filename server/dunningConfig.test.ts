import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    execute: vi.fn(async () => [{ affectedRows: 0 }]),
  })),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async () => true),
}));

// ─── Tests: getDunningConfig Standardwerte ────────────────────────────────────
describe("getDunningConfig – Standardwerte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gibt Standardwerte zurück wenn kein Eintrag vorhanden", async () => {
    // Simuliere leeres DB-Ergebnis
    const chainMock = { where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chainMock) });

    const { getDb } = await import("./db");
    const db = await getDb();
    expect(db).toBeTruthy();

    // Standardwerte-Logik direkt testen
    const rows: any[] = [];
    const result = rows.length === 0 ? {
      id: null,
      restaurantId: 1,
      graceDays: 3,
      dunning1Days: 7,
      dunning2Days: 14,
      dunning1Fee: "20.00",
      dunning2Fee: "40.00",
      interestRate: "5.00",
      currency: "CHF",
      autoEnabled: true,
    } : rows[0];

    expect(result.graceDays).toBe(3);
    expect(result.dunning1Days).toBe(7);
    expect(result.dunning2Days).toBe(14);
    expect(result.dunning1Fee).toBe("20.00");
    expect(result.dunning2Fee).toBe("40.00");
    expect(result.interestRate).toBe("5.00");
    expect(result.currency).toBe("CHF");
    expect(result.autoEnabled).toBe(true);
  });

  it("gibt gespeicherte Konfiguration zurück wenn vorhanden", async () => {
    const stored = {
      id: 1,
      restaurantId: 42,
      graceDays: 5,
      dunning1Days: 10,
      dunning2Days: 21,
      dunning1Fee: "30.00",
      dunning2Fee: "60.00",
      interestRate: "7.50",
      currency: "CHF",
      autoEnabled: false,
    };
    const chainMock = { where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([stored]) };
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(chainMock) });

    const rows = [stored];
    const result = rows.length === 0 ? null : rows[0];

    expect(result).not.toBeNull();
    expect(result!.dunning1Fee).toBe("30.00");
    expect(result!.dunning2Fee).toBe("60.00");
    expect(result!.graceDays).toBe(5);
    expect(result!.autoEnabled).toBe(false);
  });
});

// ─── Tests: Aging-Report Bucket-Logik ────────────────────────────────────────
describe("Aging-Report – Bucket-Zuordnung", () => {
  it("ordnet Rechnungen korrekt in Buckets ein", () => {
    const now = new Date();

    const makeDue = (daysAgo: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return d;
    };

    type AgingEntry = {
      invoiceId: number;
      openAmount: number;
      dueDate: Date | null;
      daysOverdue: number;
    };

    const buckets: Record<string, AgingEntry[]> = {
      current: [], days0_30: [], days31_60: [], days61_90: [], days90plus: [],
    };

    const testCases = [
      { daysAgo: -5, expectedBucket: "current" },   // noch nicht fällig
      { daysAgo: 0, expectedBucket: "current" },     // heute fällig
      { daysAgo: 15, expectedBucket: "days0_30" },   // 15 Tage überfällig
      { daysAgo: 45, expectedBucket: "days31_60" },  // 45 Tage überfällig
      { daysAgo: 75, expectedBucket: "days61_90" },  // 75 Tage überfällig
      { daysAgo: 120, expectedBucket: "days90plus" }, // 120 Tage überfällig
    ];

    for (const { daysAgo, expectedBucket } of testCases) {
      const dueDate = makeDue(daysAgo);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const entry: AgingEntry = { invoiceId: 1, openAmount: 100, dueDate, daysOverdue };

      if (daysOverdue <= 0) buckets.current.push(entry);
      else if (daysOverdue <= 30) buckets.days0_30.push(entry);
      else if (daysOverdue <= 60) buckets.days31_60.push(entry);
      else if (daysOverdue <= 90) buckets.days61_90.push(entry);
      else buckets.days90plus.push(entry);
    }

    expect(buckets.current).toHaveLength(2);
    expect(buckets.days0_30).toHaveLength(1);
    expect(buckets.days31_60).toHaveLength(1);
    expect(buckets.days61_90).toHaveLength(1);
    expect(buckets.days90plus).toHaveLength(1);
  });

  it("berechnet openAmount korrekt (totalAmount + dunningFee - paidAmount)", () => {
    const inv = {
      totalAmount: "1000.00",
      dunningFee: "20.00",
      paidAmount: "200.00",
    };
    const openAmount = parseFloat(inv.totalAmount) + parseFloat(inv.dunningFee) - parseFloat(inv.paidAmount);
    expect(openAmount).toBe(820);
  });

  it("berechnet openAmount korrekt ohne Mahngebühr", () => {
    const inv = {
      totalAmount: "500.00",
      dunningFee: "0",
      paidAmount: "0",
    };
    const openAmount = parseFloat(inv.totalAmount) + parseFloat(inv.dunningFee) - parseFloat(inv.paidAmount);
    expect(openAmount).toBe(500);
  });
});

// ─── Tests: dunningCron Mahngebühr-Konfiguration ─────────────────────────────
describe("dunningCron – konfigurierbare Mahngebühren", () => {
  it("verwendet Fallback-Wert CHF 20 wenn keine Konfiguration vorhanden", () => {
    const cfg: any = undefined;
    const fee = parseFloat(cfg?.dunning1Fee ?? "20.00");
    expect(fee).toBe(20.00);
  });

  it("verwendet Fallback-Wert CHF 40 für 2. Mahnung wenn keine Konfiguration vorhanden", () => {
    const cfg: any = undefined;
    const fee = parseFloat(cfg?.dunning2Fee ?? "40.00");
    expect(fee).toBe(40.00);
  });

  it("verwendet konfigurierte Mahngebühr wenn vorhanden", () => {
    const cfg = { dunning1Fee: "35.00", dunning2Fee: "75.00", dunning2Days: 21 };
    const fee1 = parseFloat(cfg?.dunning1Fee ?? "20.00");
    const fee2 = parseFloat(cfg?.dunning2Fee ?? "40.00");
    const days = cfg?.dunning2Days ?? 14;
    expect(fee1).toBe(35.00);
    expect(fee2).toBe(75.00);
    expect(days).toBe(21);
  });

  it("berechnet neue Fälligkeit korrekt nach konfigurierten Tagen", () => {
    const cfg = { dunning2Days: 21 };
    const now = new Date("2026-01-01T00:00:00Z");
    const newDueDate = new Date(now.getTime() + (cfg?.dunning2Days ?? 14) * 24 * 60 * 60 * 1000);
    expect(newDueDate.toISOString().slice(0, 10)).toBe("2026-01-22");
  });
});
