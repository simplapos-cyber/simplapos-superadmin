import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

// Gecachten User aus localStorage lesen (für Offline-Modus)
function getCachedUser(): any | null {
  try {
    const raw = localStorage.getItem("manus-runtime-user-info");
    if (!raw || raw === "null" || raw === "undefined") return null;
    const parsed = JSON.parse(raw);
    // Nur zurückgeben wenn es ein valides User-Objekt ist
    if (parsed && typeof parsed === "object" && parsed.id) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();
  const [sessionConflictDetected, setSessionConflictDetected] = useState(false);
  // Fetch-basierter Ping statt navigator.onLine (iOS/Safari-kompatibel)
  const { isOffline } = useOfflineStatus();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000, // alle 30s prüfen ob Session noch aktiv
    // Wenn offline: Query deaktivieren damit kein Netzwerkfehler entsteht
    enabled: !isOffline,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      // Gecachten User löschen beim Logout
      localStorage.removeItem("manus-runtime-user-info");
    }
  }, [logoutMutation, utils]);

  // Session-Konflikt erkennen: NUR Flag setzen, KEIN Logout, KEINE Weiterleitung
  useEffect(() => {
    const userData = meQuery.data as any;
    if (userData?.sessionConflict && !sessionConflictDetected) {
      setSessionConflictDetected(true);
      // Kein Logout, kein Redirect – der Sperrbildschirm wird über sessionConflict-Flag angezeigt
    }
  }, [meQuery.data, sessionConflictDetected]);

  const state = useMemo(() => {
    const userData = meQuery.data as any;

    // Wenn Query erfolgreich: User cachen
    if (meQuery.data) {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(meQuery.data)
      );
    }

    // Offline-Fallback: gecachten User verwenden wenn Query fehlschlägt oder pending
    const isQueryFailed = meQuery.isError || (meQuery.fetchStatus === "idle" && !meQuery.data);
    const offlineUser = (isOffline || isQueryFailed) ? getCachedUser() : null;
    const effectiveUser = meQuery.data ?? offlineUser ?? null;

    // Wenn offline und gecachter User vorhanden: nicht als "loading" anzeigen
    const isLoading = isOffline && offlineUser
      ? false
      : (meQuery.isPending || logoutMutation.isPending);

    return {
      user: effectiveUser,
      loading: isLoading,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(effectiveUser),
      // sessionConflict: true wenn auf einem anderen Gerät eingeloggt
      sessionConflict: sessionConflictDetected || (userData?.sessionConflict ?? false),
      isOffline,
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isPending,
    meQuery.isError,
    meQuery.fetchStatus,
    logoutMutation.error,
    logoutMutation.isPending,
    isOffline,
    sessionConflictDetected,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.loading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;
    // Wenn offline: nicht zur Login-Seite weiterleiten
    if (isOffline) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    state.loading,
    state.user,
    isOffline,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
