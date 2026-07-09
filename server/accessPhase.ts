// ─── TRIAL PHASE LOGIC ───────────────────────────────────────────────────────
// Returns the current access phase for a restaurant subscription:
//   'full'       → first 7 days: all modules unlocked
//   'restricted' → days 8–14: only contracted modules
//   'blocked'    → after day 14 (or manually blocked): no access
//   'paid'       → subscription active (paid)
//   'none'       → no subscription found
//
// Trial structure: 7 days full access → 7 days restricted → blocked until payment
const FULL_TRIAL_DAYS = 7;
const RESTRICTED_TRIAL_DAYS = 7; // additional days after full trial

export type AccessPhaseResult = {
  phase: 'full' | 'restricted' | 'blocked' | 'paid' | 'none';
  daysRemaining: number;
  trialStartedAt: Date | null;
  subscription: Record<string, unknown> | null;
};

export type SubscriptionLike = {
  id: number;
  status: string;
  trialStartedAt: Date | null;
  trialPhase: string | null;
};

// Pure function with injectable dependencies for testability
export async function computeAccessPhase(
  restaurantId: number,
  deps: {
    getSubscription: (id: number) => Promise<SubscriptionLike | null | undefined>;
    updateSub: (id: number, data: Record<string, unknown>) => Promise<void>;
  }
): Promise<AccessPhaseResult> {
  const sub = await deps.getSubscription(restaurantId);
  if (!sub) return { phase: 'none', daysRemaining: 0, trialStartedAt: null, subscription: null };

  // Already paid/active
  if (sub.status === 'active') {
    return { phase: 'paid', daysRemaining: 0, trialStartedAt: sub.trialStartedAt ?? null, subscription: sub as Record<string, unknown> };
  }

  // Manually blocked by superadmin
  if (sub.status === 'blocked') {
    return { phase: 'blocked', daysRemaining: 0, trialStartedAt: sub.trialStartedAt ?? null, subscription: sub as Record<string, unknown> };
  }

  // Trial not yet started (account not activated)
  if (!sub.trialStartedAt) {
    return { phase: 'full', daysRemaining: FULL_TRIAL_DAYS, trialStartedAt: null, subscription: sub as Record<string, unknown> };
  }

  const now = Date.now();
  const start = sub.trialStartedAt.getTime();
  const daysSinceStart = (now - start) / (1000 * 60 * 60 * 24);
  const totalTrialDays = FULL_TRIAL_DAYS + RESTRICTED_TRIAL_DAYS;

  if (daysSinceStart < FULL_TRIAL_DAYS) {
    const daysRemaining = Math.ceil(FULL_TRIAL_DAYS - daysSinceStart);
    return { phase: 'full', daysRemaining, trialStartedAt: sub.trialStartedAt, subscription: sub as Record<string, unknown> };
  } else if (daysSinceStart < totalTrialDays) {
    const daysRemaining = Math.ceil(totalTrialDays - daysSinceStart);
    return { phase: 'restricted', daysRemaining, trialStartedAt: sub.trialStartedAt, subscription: sub as Record<string, unknown> };
  } else {
    // Auto-block after 14 days if not paid
    if (sub.trialPhase !== 'blocked') {
      await deps.updateSub(sub.id, { trialPhase: 'blocked', status: 'blocked' });
    }
    return { phase: 'blocked', daysRemaining: 0, trialStartedAt: sub.trialStartedAt, subscription: sub as Record<string, unknown> };
  }
}

// Production wrapper using real db functions
export async function getAccessPhase(restaurantId: number): Promise<AccessPhaseResult> {
  const { getSubscriptionByRestaurant, updateSubscription } = await import('./db');
  return computeAccessPhase(restaurantId, {
    getSubscription: getSubscriptionByRestaurant,
    updateSub: (id, data) => updateSubscription(id, data as Parameters<typeof updateSubscription>[1]),
  });
}
