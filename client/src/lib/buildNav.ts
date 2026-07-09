// ─── BUILD NAV ────────────────────────────────────────────────────────────────
// Pure function: filters ALL_NAV_ITEMS based on context.
// No side effects, fully testable.

import { ALL_NAV_ITEMS, type AppRole, type NavGroup, type NavItem } from "../../../shared/navConfig";

export type AccessPhase = "full" | "restricted" | "blocked" | "paid" | "none";
export type PaymentStatus = "ok" | "overdue_grace" | "overdue_blocked" | "blocked";

export interface BuildNavContext {
  role: AppRole | string;
  restaurantId?: number | null;
  accessPhase?: AccessPhase;
  bookedModules?: string[];
  paymentStatus?: PaymentStatus;
}

// Items always visible even when payment is overdue_blocked
const PAYMENT_BLOCKED_WHITELIST = new Set([
  "a-orders",
  "a-invoices",
  "a-closings",
  "k-checkout",
  "k-orders",
  "k-cart",
  "m-orders",
  "kds-new",
  "kds-prep",
  "kds-ready",
  "kds-done",
  "bar-new",
  "bar-prep",
  "bar-ready",
  "bar-done",
]);

// Non-admin staff roles always get full access phase so moduleId items are visible.
// The subscription/module gating only applies to restaurant admins.
const STAFF_ROLES_FULL_ACCESS = new Set([
  "kellner",
  "koch",
  "barkeeper",
  "bar",
  "buchhalter",
  "manager",
]);

export function buildNav(ctx: BuildNavContext): NavGroup[] {
  const {
    role,
    restaurantId,
    bookedModules = [],
    paymentStatus = "ok",
  } = ctx;

  // Normalize bar/barkeeper
  const normalizedRole = role === "barkeeper" ? "bar" : role;

  // Staff roles always see all their nav items (no module gating for non-admins)
  const accessPhase: AccessPhase = STAFF_ROLES_FULL_ACCESS.has(normalizedRole)
    ? "full"
    : (ctx.accessPhase ?? "paid");

  const filtered = ALL_NAV_ITEMS.filter((item: NavItem) => {
    // 1. Role check (support both "bar" and "barkeeper")
    const roleMatch =
      item.roles.includes(normalizedRole as AppRole) ||
      item.roles.includes(role as AppRole);
    if (!roleMatch) return false;

    // 2. Restaurant check
    if (item.requiresRestaurant && !restaurantId) return false;

    // 3. Phase: blocked → only alwaysVisible items
    if (accessPhase === "blocked") {
      return !!item.alwaysVisible;
    }

    // 4. Payment: overdue_blocked → whitelist + alwaysVisible
    if (paymentStatus === "overdue_blocked" && !item.alwaysVisible) {
      if (!PAYMENT_BLOCKED_WHITELIST.has(item.id)) return false;
    }

    // 5. Module check: skip during 'full' trial (all modules visible)
    if (item.moduleId && accessPhase !== "full") {
      if (!bookedModules.includes(item.moduleId)) return false;
    }

    return true;
  });

  // Group items
  const groupMap = new Map<string, NavItem[]>();
  for (const item of filtered) {
    if (!groupMap.has(item.group)) groupMap.set(item.group, []);
    groupMap.get(item.group)!.push(item);
  }

  const groups: NavGroup[] = Array.from(groupMap.entries()).map(([group, items]) => ({ group, items }));

  return groups;
}

// Mobile bottom tab bar items (max 5, sorted by mobileBottomOrder)
export function buildMobileBottomTabs(ctx: BuildNavContext): NavItem[] {
  const allGroups = buildNav(ctx);
  const allItems = allGroups.flatMap((g) => g.items);
  return allItems
    .filter((item) => item.mobileBottomTab)
    .sort((a, b) => (a.mobileBottomOrder ?? 99) - (b.mobileBottomOrder ?? 99))
    .slice(0, 5);
}
