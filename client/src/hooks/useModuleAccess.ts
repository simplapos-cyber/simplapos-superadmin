import { trpc } from "@/lib/trpc";

/**
 * Hook: Gibt zurück ob ein Modul für das Restaurant aktiv (oder in Trial) ist.
 * Verwendet trpc.restaurantAdmin.listModules – kein Extra-Endpoint nötig.
 */
export function useModuleAccess() {
  const { data: modules, isLoading } = trpc.restaurantAdmin.listModules.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 Minuten cachen
  });

  /**
   * Gibt true zurück wenn das Modul aktiv oder in Trial ist.
   * Gibt auch true zurück während des Ladens (optimistisch – kein Flackern).
   */
  function hasModule(moduleId: string): boolean {
    if (isLoading || !modules) return true; // während Laden: offen lassen
    const mod = modules.find((m) => m.id === moduleId);
    if (!mod) return false;
    const status = (mod as { status?: string }).status ?? "not_subscribed";
    return status === "active" || status === "trial";
  }

  return { hasModule, isLoading, modules };
}
