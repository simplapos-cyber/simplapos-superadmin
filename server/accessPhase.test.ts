import { describe, it, expect, vi } from "vitest";
import { computeAccessPhase, type SubscriptionLike } from "./accessPhase";

// Helper to create a mock subscription
function makeSub(overrides: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return {
    id: 1,
    status: "pending",
    trialStartedAt: null,
    trialPhase: null,
    ...overrides,
  };
}

// Helper to create deps
function makeDeps(sub: SubscriptionLike | null | undefined = null) {
  const updateSub = vi.fn().mockResolvedValue(undefined);
  const getSubscription = vi.fn().mockResolvedValue(sub);
  return { getSubscription, updateSub };
}

describe("getAccessPhase (computeAccessPhase)", () => {
  it("returns 'none' when no subscription exists", async () => {
    const deps = makeDeps(undefined);
    const result = await computeAccessPhase(42, deps);
    expect(result.phase).toBe("none");
    expect(result.daysRemaining).toBe(0);
  });

  it("returns 'paid' when subscription is active", async () => {
    const deps = makeDeps(makeSub({ status: "active" }));
    const result = await computeAccessPhase(42, deps);
    expect(result.phase).toBe("paid");
  });

  it("returns 'blocked' when subscription is manually blocked", async () => {
    const deps = makeDeps(makeSub({ status: "blocked" }));
    const result = await computeAccessPhase(42, deps);
    expect(result.phase).toBe("blocked");
    expect(result.daysRemaining).toBe(0);
  });

  it("returns 'full' with 7 days when trial not yet started", async () => {
    const deps = makeDeps(makeSub({ status: "pending", trialStartedAt: null }));
    const result = await computeAccessPhase(42, deps);
    expect(result.phase).toBe("full");
    expect(result.daysRemaining).toBe(7);
  });

  it("returns 'full' with correct days remaining in first 7 days", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const deps = makeDeps(makeSub({ status: "pending", trialStartedAt: threeDaysAgo }));
    const result = await computeAccessPhase(42, deps);
    expect(result.phase).toBe("full");
    expect(result.daysRemaining).toBeGreaterThanOrEqual(3);
    expect(result.daysRemaining).toBeLessThanOrEqual(4);
  });

  it("returns 'restricted' in days 8-14", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const deps = makeDeps(makeSub({ status: "pending", trialStartedAt: eightDaysAgo }));
    const result = await computeAccessPhase(42, deps);
    expect(result.phase).toBe("restricted");
    expect(result.daysRemaining).toBeGreaterThanOrEqual(5);
    expect(result.daysRemaining).toBeLessThanOrEqual(6);
  });

  it("returns 'blocked' and auto-blocks after 14 days", async () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const deps = makeDeps(makeSub({ status: "pending", trialStartedAt: fifteenDaysAgo, trialPhase: null }));
    const result = await computeAccessPhase(42, deps);
    expect(result.phase).toBe("blocked");
    expect(result.daysRemaining).toBe(0);
    // Should have called updateSub to auto-block
    expect(deps.updateSub).toHaveBeenCalledWith(1, { trialPhase: "blocked", status: "blocked" });
  });

  it("does NOT call updateSub again if already blocked", async () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const deps = makeDeps(makeSub({ status: "pending", trialStartedAt: fifteenDaysAgo, trialPhase: "blocked" }));
    const result = await computeAccessPhase(42, deps);
    expect(result.phase).toBe("blocked");
    expect(deps.updateSub).not.toHaveBeenCalled();
  });
});
