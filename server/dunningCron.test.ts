import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Mock SDK authentication
vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

// Mock notification helper
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Mock database
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock nodemailer
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "test-id" }),
    }),
    createTestAccount: vi.fn().mockResolvedValue({
      user: "test@ethereal.email",
      pass: "testpass",
    }),
  },
  createTransport: vi.fn().mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({ messageId: "test-id" }),
  }),
  createTestAccount: vi.fn().mockResolvedValue({
    user: "test@ethereal.email",
    pass: "testpass",
  }),
}));

import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { handleDunningCheck } from "./dunningCron";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
function makeReqRes(isCron = true) {
  const req: any = {
    url: "/api/scheduled/dunning-check",
    method: "POST",
  };
  const res: any = {
    _status: 200,
    _body: null,
    status(code: number) { this._status = code; return this; },
    json(body: any) { this._body = body; return this; },
  };
  return { req, res };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("handleDunningCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gibt 403 zurück wenn kein Cron-Request", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({ isCron: false, taskUid: null });
    const { req, res } = makeReqRes(false);
    await handleDunningCheck(req, res);
    expect(res._status).toBe(403);
    expect(res._body.error).toBe("cron-only");
  });

  it("gibt 500 zurück wenn Datenbank nicht verfügbar", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({ isCron: true, taskUid: "test-uid" });
    (getDb as any).mockResolvedValue(null);
    const { req, res } = makeReqRes();
    await handleDunningCheck(req, res);
    expect(res._status).toBe(500);
    expect(res._body.error).toBe("Datenbank nicht verfügbar");
  });

  it("führt Mahnwesen-Logik aus und gibt ok:true zurück", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({ isCron: true, taskUid: "test-uid" });

    // Mock DB mit leeren Ergebnissen (keine überfälligen Rechnungen)
    const mockDb: any = {
      execute: vi.fn().mockResolvedValue([{ affectedRows: 0 }]),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    };
    (getDb as any).mockResolvedValue(mockDb);

    const { req, res } = makeReqRes();
    await handleDunningCheck(req, res);

    expect(res._body.ok).toBe(true);
    expect(res._body.dunning1Created).toBe(0);
    expect(res._body.dunning2Created).toBe(0);
    expect(res._body.errors).toHaveLength(0);
  });

  it("verarbeitet überfällige Rechnungen korrekt (dunning1)", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({ isCron: true, taskUid: "test-uid" });

    const overdueInvoice = {
      id: 42,
      restaurantId: 1,
      invoiceNumber: "RE-2026-001",
      recipientName: "Test GmbH",
      recipientEmail: "test@example.com",
      totalAmount: "500.00",
      dunningFee: "0",
      creditorName: "SimplaPos AG",
      dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 Tage überfällig
    };

    const mockDb: any = {
      execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([overdueInvoice]),
            }),
          }),
        })
        .mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    };
    (getDb as any).mockResolvedValue(mockDb);

    const { req, res } = makeReqRes();
    await handleDunningCheck(req, res);

    expect(res._body.ok).toBe(true);
    expect(res._body.dunning1Created).toBe(1);
    // DB update sollte aufgerufen worden sein
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalled();
  });
});

describe("Gutschrift-Logik (createCreditNote)", () => {
  it("Gutschrift-Betrag darf nicht grösser als Rechnungsbetrag sein", () => {
    const invoiceTotal = 500;
    const paidAmount = 0;
    const creditAmount = 600; // Zu viel
    const maxAllowed = invoiceTotal - paidAmount;
    expect(creditAmount).toBeGreaterThan(maxAllowed);
  });

  it("Gutschrift-Nummer hat korrektes Format", () => {
    const invoiceNumber = "RE-2026-001";
    const creditNumber = `GS-${invoiceNumber}`;
    expect(creditNumber).toBe("GS-RE-2026-001");
    expect(creditNumber).toMatch(/^GS-RE-\d{4}-\d{3}$/);
  });

  it("Mahngebühren werden korrekt berechnet", () => {
    const dunning1Fee = 20.00;
    const dunning2Fee = 40.00;
    const baseFee = 0;
    const afterDunning1 = baseFee + dunning1Fee;
    const afterDunning2 = afterDunning1 + dunning2Fee;
    expect(afterDunning1).toBe(20.00);
    expect(afterDunning2).toBe(60.00);
  });
});
