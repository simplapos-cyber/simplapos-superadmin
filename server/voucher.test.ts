import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock DB
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  }),
}));

describe("Voucher business logic", () => {
  describe("Code generation", () => {
    it("generates an 8-character alphanumeric code", () => {
      const code = generateCode();
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
    });

    it("applies prefix to generated code", () => {
      const code = generateCodeWithPrefix("VIP");
      expect(code.startsWith("VIP-")).toBe(true);
    });

    it("uses custom code when provided", () => {
      const code = resolveCode("SOMMER25", undefined);
      expect(code).toBe("SOMMER25");
    });
  });

  describe("Discount calculation", () => {
    it("calculates fixed discount correctly", () => {
      const result = calcDiscount({ type: "fixed", value: 25, orderTotal: 100, remainingBalance: 25 });
      expect(result).toBe(25);
    });

    it("caps fixed discount at remaining balance", () => {
      const result = calcDiscount({ type: "fixed", value: 50, orderTotal: 30, remainingBalance: 50 });
      expect(result).toBe(30); // can't deduct more than order total
    });

    it("caps fixed discount at remaining balance when lower than order total", () => {
      const result = calcDiscount({ type: "fixed", value: 50, orderTotal: 100, remainingBalance: 20 });
      expect(result).toBe(20); // only 20 left on voucher
    });

    it("calculates percent discount correctly", () => {
      const result = calcDiscount({ type: "percent", value: 10, orderTotal: 100, remainingBalance: 100 });
      expect(result).toBe(10);
    });

    it("caps percent discount at maxDiscount", () => {
      const result = calcDiscount({ type: "percent", value: 50, orderTotal: 100, remainingBalance: 100, maxDiscount: 20 });
      expect(result).toBe(20);
    });
  });

  describe("Voucher validity", () => {
    it("rejects expired voucher", () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const valid = isVoucherValid({ status: "active", validFrom: new Date(0).toISOString(), validUntil: yesterday, usedCount: 0, maxUses: null });
      expect(valid).toBe(false);
    });

    it("rejects cancelled voucher", () => {
      const valid = isVoucherValid({ status: "cancelled", validFrom: new Date(0).toISOString(), validUntil: null, usedCount: 0, maxUses: null });
      expect(valid).toBe(false);
    });

    it("rejects fully redeemed voucher", () => {
      const valid = isVoucherValid({ status: "redeemed", validFrom: new Date(0).toISOString(), validUntil: null, usedCount: 1, maxUses: 1 });
      expect(valid).toBe(false);
    });

    it("accepts active voucher without expiry", () => {
      const valid = isVoucherValid({ status: "active", validFrom: new Date(0).toISOString(), validUntil: null, usedCount: 0, maxUses: null });
      expect(valid).toBe(true);
    });

    it("accepts partially redeemed voucher", () => {
      const valid = isVoucherValid({ status: "partially_redeemed", validFrom: new Date(0).toISOString(), validUntil: null, usedCount: 1, maxUses: null });
      expect(valid).toBe(true);
    });

    it("rejects voucher not yet valid", () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const valid = isVoucherValid({ status: "active", validFrom: tomorrow, validUntil: null, usedCount: 0, maxUses: null });
      expect(valid).toBe(false);
    });

    it("rejects when max uses reached", () => {
      const valid = isVoucherValid({ status: "active", validFrom: new Date(0).toISOString(), validUntil: null, usedCount: 5, maxUses: 5 });
      expect(valid).toBe(false);
    });
  });

  describe("Status determination", () => {
    it("returns redeemed when balance is 0 for fixed voucher", () => {
      const status = determineStatus({ type: "fixed", remainingBalance: 0, usedCount: 1, maxUses: null });
      expect(status).toBe("redeemed");
    });

    it("returns partially_redeemed when balance > 0 but < original", () => {
      const status = determineStatus({ type: "fixed", remainingBalance: 10, usedCount: 1, maxUses: null });
      expect(status).toBe("partially_redeemed");
    });

    it("returns redeemed for percent voucher when maxUses reached", () => {
      const status = determineStatus({ type: "percent", remainingBalance: 0, usedCount: 3, maxUses: 3 });
      expect(status).toBe("redeemed");
    });
  });
});

// ─── Pure helper functions extracted for testing ──────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function generateCodeWithPrefix(prefix: string): string {
  return `${prefix}-${generateCode()}`;
}

function resolveCode(customCode: string | undefined, prefix: string | undefined): string {
  if (customCode) return customCode;
  if (prefix) return generateCodeWithPrefix(prefix);
  return generateCode();
}

function calcDiscount(params: {
  type: "fixed" | "percent";
  value: number;
  orderTotal: number;
  remainingBalance: number;
  maxDiscount?: number;
}): number {
  const { type, value, orderTotal, remainingBalance, maxDiscount } = params;
  if (type === "fixed") {
    return Math.min(value, orderTotal, remainingBalance);
  }
  const pct = (value / 100) * orderTotal;
  const capped = maxDiscount ? Math.min(pct, maxDiscount) : pct;
  return Math.min(capped, orderTotal);
}

function isVoucherValid(v: {
  status: string;
  validFrom: string;
  validUntil: string | null;
  usedCount: number;
  maxUses: number | null;
}): boolean {
  if (!["active", "partially_redeemed"].includes(v.status)) return false;
  const now = Date.now();
  if (new Date(v.validFrom).getTime() > now) return false;
  if (v.validUntil && new Date(v.validUntil).getTime() < now) return false;
  if (v.maxUses !== null && v.usedCount >= v.maxUses) return false;
  return true;
}

function determineStatus(v: {
  type: "fixed" | "percent";
  remainingBalance: number;
  usedCount: number;
  maxUses: number | null;
}): "active" | "partially_redeemed" | "redeemed" {
  if (v.type === "fixed") {
    if (v.remainingBalance <= 0) return "redeemed";
    if (v.usedCount > 0) return "partially_redeemed";
    return "active";
  }
  if (v.maxUses !== null && v.usedCount >= v.maxUses) return "redeemed";
  if (v.usedCount > 0) return "partially_redeemed";
  return "active";
}
