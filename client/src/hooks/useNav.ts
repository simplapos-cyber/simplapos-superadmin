// ─── USE NAV ──────────────────────────────────────────────────────────────────
// React hook that builds the navigation for the current user.
// Reads: role, restaurantId, accessPhase, bookedModules, paymentStatus
//
// WICHTIG: Wenn ein Kellner per PIN eingeloggt ist (activeWaiter gesetzt),
// wird die Navigation mit role "kellner" gebaut – genau wie beim OAuth-Login.
// So sehen PIN-Kellner und OAuth-Kellner dieselbe vollständige Navigation.

import { useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWaiterPin } from "@/contexts/WaiterPinContext";
import { trpc } from "@/lib/trpc";
import { buildNav, buildMobileBottomTabs } from "@/lib/buildNav";
import type { NavGroup } from "../../../shared/navConfig";
import type { NavItem } from "../../../shared/navConfig";

export interface UseNavResult {
  navGroups: NavGroup[];
  mobileBottomTabs: NavItem[];
  isLoading: boolean;
}

export function useNav(): UseNavResult {
  const { user } = useAuth();
  const { activeWaiter } = useWaiterPin();

  // Effektive Rolle: Wenn ein Kellner per PIN eingeloggt ist, verwenden wir
  // "kellner" als Rolle – unabhängig davon, ob der OAuth-User Admin ist.
  const effectiveRole = activeWaiter ? "kellner" : (user?.role as string | undefined);
  const effectiveRestaurantId = user?.restaurantId;

  // Fetch access phase (only for restaurant admins, not for PIN-Kellner)
  const { data: accessPhaseData, isLoading: phaseLoading } =
    trpc.subscriptions.myAccessPhase.useQuery(undefined, {
      enabled: user?.role === "admin" && !!user?.restaurantId && !activeWaiter,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    });

  // Fetch booked modules via overview (only for restaurant admins, not for PIN-Kellner)
  const { data: overviewData, isLoading: modulesLoading } =
    trpc.restaurantAdmin.overview.useQuery(undefined, {
      enabled: user?.role === "admin" && !!user?.restaurantId && !activeWaiter,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    });

  const isLoading =
    user?.role === "admin" && !!user?.restaurantId && !activeWaiter
      ? phaseLoading || modulesLoading
      : false;

  const bookedModules = useMemo(() => {
    if (!overviewData?.modules) return [];
    return (overviewData.modules as Array<{ moduleId: string; status: string }>)
      .filter((m) => m.status === "active" || m.status === "trial")
      .map((m) => m.moduleId);
  }, [overviewData]);

  const accessPhase = accessPhaseData?.phase ?? "paid";

  const navGroups = useMemo(() => {
    if (!effectiveRole) return [];
    return buildNav({
      role: effectiveRole,
      restaurantId: effectiveRestaurantId,
      accessPhase,
      bookedModules,
      paymentStatus: "ok",
    });
  }, [effectiveRole, effectiveRestaurantId, accessPhase, bookedModules]);

  const mobileBottomTabs = useMemo(() => {
    if (!effectiveRole) return [];
    return buildMobileBottomTabs({
      role: effectiveRole,
      restaurantId: effectiveRestaurantId,
      accessPhase,
      bookedModules,
      paymentStatus: "ok",
    });
  }, [effectiveRole, effectiveRestaurantId, accessPhase, bookedModules]);

  return { navGroups, mobileBottomTabs, isLoading };
}
